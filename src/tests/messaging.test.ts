import { describe, expect, it } from 'vitest';
import type { DeliveryRecord, Message, Membership, User } from '../core/types';
import { createDelivery, transition } from '../domain/delivery';
import { PolicyDeniedError, makeActor, clearAccessLog, accessLog } from '../policy';
import {
  MessagingError,
  applyIncoming,
  authorizeOutgoing,
  markConsulted,
  recoverableDeliveries,
  resumeOnBoot,
} from '../services/messaging';

/**
 * Contrat de livraison et service de messagerie (§3 / §7) — testés sur le
 * SERVICE, sans interface.
 */

const now = 5_000;

function msg(id: string, over: Partial<Message> = {}): Message {
  return {
    id,
    type: 'private',
    conversationId: 'cv_1',
    senderId: 'u1',
    recipientId: 'u2',
    createdAt: now,
    deliveryId: `dlv_${id}`,
    orgId: null,
    groupId: null,
    confidentiality: 'private',
    body: 'bonjour',
    cipher: null,
    priority: 'info',
    read: false,
    consultedAt: null,
    ...over,
  };
}

function user(id: string, nodeId: string, roles: User['roles'] = ['citizen']): User {
  return {
    id,
    displayName: id,
    role: roles[0],
    roles,
    nodeId,
    salt: 's',
    passwordHash: 'h',
    createdAt: 0,
    settings: { locationAllowed: false, notificationsOn: true, simSpeed: 1 },
  };
}

const memberships: Membership[] = [
  { userId: 'u_agent', orgId: 'org-csps', role: 'health_agent', joinedAt: now },
  { userId: 'u_ong', orgId: 'org-ong', role: 'ngo_coordinator', joinedAt: now },
];

const citizen = makeActor(user('u1', 'phone-1'), [], null);
const agent = makeActor(user('u_agent', 'phone-2'), memberships, 'org-csps');
const admin = makeActor(user('u_admin', 'phone-9', ['system_admin']), [], null);

describe('autorisation de l’envoi (politique d’abord)', () => {
  it('accepte un message privé d’un citoyen', () => {
    expect(() => authorizeOutgoing({ actor: citizen, type: 'private', recipientIds: ['u2'] })).not.toThrow();
  });

  it('refuse un destinataire absent', () => {
    expect(() => authorizeOutgoing({ actor: citizen, type: 'private', recipientIds: [] })).toThrow(MessagingError);
  });

  it('refuse une demande de prise en charge à un rôle qui ne l’a pas', () => {
    expect(() =>
      authorizeOutgoing({ actor: admin, type: 'care_request', recipientIds: ['u_centre'] }),
    ).toThrow(PolicyDeniedError);
  });

  it('refuse un message organisationnel émis hors contexte', () => {
    expect(() =>
      authorizeOutgoing({ actor: agent, type: 'org', recipientIds: ['u2'], orgId: 'org-autre' }),
    ).toThrow(/contexte/i);
  });

  it('accepte le même message depuis le bon contexte', () => {
    expect(() =>
      authorizeOutgoing({ actor: agent, type: 'org', recipientIds: ['u2'], orgId: 'org-csps' }),
    ).not.toThrow();
  });

  it('refuse l’écriture dans un groupe que l’on ne rejoint pas', () => {
    const group = { id: 'g1', orgId: null, kind: 'family' as const, name: 'Famille', memberIds: ['u2'], createdAt: now };
    expect(() => authorizeOutgoing({ actor: citizen, type: 'group', recipientIds: ['u2'], group })).toThrow(MessagingError);
    expect(() =>
      authorizeOutgoing({ actor: citizen, type: 'group', recipientIds: ['u2'], group: { ...group, memberIds: ['u1'] } }),
    ).not.toThrow();
  });

  it('journalise les refus', () => {
    clearAccessLog();
    try {
      authorizeOutgoing({ actor: admin, type: 'care_request', recipientIds: ['u_centre'] });
    } catch {
      /* refus attendu */
    }
    expect(accessLog()[0].allowed).toBe(false);
  });
});

describe('déduplication : effet exactement une fois', () => {
  it('applique une première fois puis ignore les répétitions', () => {
    const incoming = msg('msg-1');
    const first = applyIncoming([], incoming);
    expect(first.applied).toBe(true);
    expect(first.messages).toHaveLength(1);

    const second = applyIncoming(first.messages, incoming);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('duplicate');
    expect(second.messages).toHaveLength(1);
  });

  it('distingue deux identifiants différents', () => {
    const list = applyIncoming([], msg('msg-1')).messages;
    const next = applyIncoming(list, msg('msg-2'));
    expect(next.applied).toBe(true);
    expect(next.messages).toHaveLength(2);
  });
});

describe('accusés et consultation', () => {
  it('un message envoyé n’est jamais « reçu » à la création', () => {
    const record = createDelivery('dlv_1', 'msg-1', now, 60_000);
    expect(record.status).toBe('draft');
    expect(record.status).not.toBe('delivered');
  });

  it('seul le destinataire peut marquer un message consulté', () => {
    const m = msg('msg-1');
    expect(() => markConsulted(m, 'u1', now + 10)).toThrow(MessagingError);
    const consulted = markConsulted(m, 'u2', now + 10);
    expect(consulted.consultedAt).toBe(now + 10);
    expect(consulted.read).toBe(true);
    // idempotent
    expect(markConsulted(consulted, 'u2', now + 99).consultedAt).toBe(now + 10);
  });
});

describe('persistance et reprise (§7)', () => {
  function queuedDelivery(id: string, messageId: string, at: number, ttl: number): DeliveryRecord {
    const base = createDelivery(id, messageId, at, ttl);
    const created = transition(base, 'created', { at, reason: 'test' });
    const accepted = transition(created, 'accepted_local', { at, reason: 'test' });
    return transition(accepted, 'queued', { at, reason: 'reseau' });
  }

  function deliveredDelivery(id: string, messageId: string, at: number): DeliveryRecord {
    const base = createDelivery(id, messageId, at, 60_000);
    const created = transition(base, 'created', { at, reason: 'test' });
    const accepted = transition(created, 'accepted_local', { at, reason: 'test' });
    const routing = transition(accepted, 'routing', { at, reason: 'route' });
    return transition(routing, 'delivered', { at, reason: 'arrive' });
  }

  it('ne reprend que les livraisons non terminales et non expirées', () => {
    const pending = queuedDelivery('dlv_p', 'msg_p', now - 1_000, 60_000);
    // Livraison terminale mais NON expirée : exclue par son statut, pas par l'échéance.
    const doneDone = deliveredDelivery('dlv_d', 'msg_d', now - 1_000);
    const expired = queuedDelivery('dlv_e', 'msg_e', now - 600_000, 1_000);
    const ids = recoverableDeliveries({ a: pending, b: doneDone, c: expired }, now).map((d) => d.deliveryId);
    expect(ids).toEqual(['dlv_p']);
  });

  it('reprend une livraison en attente SANS créer de doublon', () => {
    const deliveries = { dlv_p: queuedDelivery('dlv_p', 'msg_p', now - 1_000, 60_000) };
    const messages = [msg('msg_p', { id: 'msg_p', deliveryId: 'dlv_p' })];
    const users = [user('u1', 'phone-1'), user('u2', 'phone-2')];
    const calls: string[] = [];
    const engine = { submit: (id: string) => calls.push(id) };

    const first = resumeOnBoot({ deliveries, messages, users, engine, now });
    expect(first).toEqual(['dlv_p']);
    expect(calls).toEqual(['dlv_p']);
    // Le message d'origine est conservé tel quel : aucun ajout.
    expect(messages).toHaveLength(1);

    // Un second démarrage avec la livraison déjà active ne resoumet rien.
    const second = resumeOnBoot({ deliveries, messages, users, engine, activeIds: ['dlv_p'], now });
    expect(second).toEqual([]);
    expect(calls).toEqual(['dlv_p']);
  });

  it('ne reprend pas une livraison sans message correspondant', () => {
    const deliveries = { dlv_x: queuedDelivery('dlv_x', 'msg_absent', now - 1_000, 60_000) };
    const calls: string[] = [];
    const resumed = resumeOnBoot({
      deliveries,
      messages: [],
      users: [user('u1', 'phone-1'), user('u2', 'phone-2')],
      engine: { submit: (id: string) => calls.push(id) },
      now,
    });
    expect(resumed).toEqual([]);
    expect(calls).toEqual([]);
  });
});
