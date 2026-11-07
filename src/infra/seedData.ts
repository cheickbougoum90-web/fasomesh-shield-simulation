import type {
  Alert,
  AppNotification,
  AuditEntry,
  CareKind,
  CareRequest,
  CareStatus,
  Conversation,
  DeliveryRecord,
  Group,
  Membership,
  MeshLink,
  MeshNode,
  Message,
  Organization,
  Priority,
  User,
} from '../core/types';
import { uid } from '../core/rng';
import { createUser } from '../domain/user';
import { createDelivery, pushHop, transition } from '../domain/delivery';
import { createAlert } from '../domain/alert';
import { careTransition, createCareRequest, nextCaseRef } from '../domain/care';
import { conversationIdFor } from '../domain/message';
import { encryptText, generateSalt, hashPassword, DEMO_PASSWORD } from './crypto';
import { TIMING } from '../mesh/engine';
import { seedLinks, seedNodes } from '../mesh/seed';
import type { PersistedState } from './persistence';

/**
 * Données fictives réalistes pour la démonstration (§10).
 * 10 comptes (dont un multi-rôles), 8 organisations, 2 groupes,
 * 13 nœuds, des conversations déjà en cours et un historique de statuts
 * variés — pour que l'écran ne soit jamais vide au premier lancement.
 * Le mot de passe commun est documenté dans docs/DEMO.md.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface SeedMessageSpec {
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  ago: number;
  status: DeliveryRecord['status'];
  path: string[];
}

/** Version du jeu de démonstration : une évolution remplace l'ancien jeu. */
export const SEED_VERSION = 3;

export async function buildSeed(): Promise<PersistedState> {
  const now = Date.now();

  const users: User[] = [];
  const addUser = async (
    id: string,
    displayName: string,
    role: User['role'],
    nodeId: string,
    createdAt: number,
    roles?: User['roles'],
  ) => {
    const salt = generateSalt();
    const passwordHash = await hashPassword(DEMO_PASSWORD, salt);
    users.push(createUser({ id, displayName, role, roles, nodeId, salt, passwordHash, createdAt }));
  };

  await addUser('u_citoyen1', 'citoyen1', 'citizen', 'phone-aminata', now - 92 * DAY);
  await addUser('u_citoyen2', 'citoyen2', 'citizen', 'phone-salif', now - 61 * DAY);
  await addUser('u_agent_csps', 'agent_csps', 'citizen', 'phone-mariam', now - 34 * DAY);
  await addUser('u_responsable_csps', 'responsable_csps', 'citizen', 'phone-mariam', now - 300 * DAY);
  await addUser('u_agent_csps2', 'agent_csps2', 'citizen', 'phone-ong-2', now - 90 * DAY);
  await addUser('u_operateur_hub', 'operateur_hub', 'operator', 'node-hub', now - 180 * DAY);
  await addUser('u_agent_centre', 'agent_centre_reference', 'citizen', 'phone-centre', now - 150 * DAY);
  await addUser('u_agent_hopital', 'agent_hopital', 'citizen', 'phone-hopital', now - 140 * DAY);
  await addUser('u_agent_ong', 'agent_ong', 'citizen', 'phone-ong-1', now - 120 * DAY);
  await addUser('u_coordinateur_ong', 'coordinateur_ong', 'citizen', 'phone-ong-1', now - 200 * DAY);
  await addUser('u_administrateur', 'administrateur', 'citizen', 'phone-admin', now - 300 * DAY);
  await addUser('u_admin_multi', 'multi_roles', 'citizen', 'phone-admin', now - 250 * DAY, ['citizen', 'system_admin']);

  /* ── Organisations, appartenance, groupes (§1) ─────────────────────── */
  const organizations: Organization[] = [
    { id: 'org-famille', kind: 'family', name: 'Famille Traoré', shortName: 'Famille', createdAt: now - 90 * DAY },
    {
      id: 'org-csps',
      kind: 'health_center',
      name: 'CSPS de Kongou',
      shortName: 'CSPS Kongou',
      createdAt: now - 400 * DAY,
      region: 'Cascades',
      district: 'District sanitaire de Banfora',
      locality: 'Kongou',
      address: 'Place du marché, Kongou (position déclarée)',
      services: ['Consultations', 'Maternité', 'Urgences de premier niveau'],
      availability: 'open',
      nodeId: 'phone-mariam',
    },
    {
      id: 'org-csps-2',
      kind: 'health_center',
      name: 'CSPS de Daboya',
      shortName: 'CSPS Daboya',
      createdAt: now - 350 * DAY,
      region: 'Boucle du Mouhoun',
      district: 'District sanitaire de Dédougou',
      locality: 'Daboya',
      address: 'Route nationale 2, Daboya (position déclarée)',
      services: ['Consultations', 'Vaccination'],
      availability: 'limited',
      availabilityNote: 'Équipe réduite le week-end (déclaré).',
      nodeId: null,
    },
    {
      id: 'org-csps-3',
      kind: 'health_center',
      name: 'CSPS de Loropéni',
      shortName: 'CSPS Loropéni',
      createdAt: now - 320 * DAY,
      region: 'Cascades',
      district: 'District sanitaire de Banfora',
      locality: 'Loropéni',
      address: 'Quartier Santa, Loropéni (position déclarée)',
      services: ['Consultations', 'Maternité'],
      availability: 'open',
      nodeId: null,
    },
    {
      id: 'org-centre',
      kind: 'health_center',
      name: 'Centre de référence de Banfora',
      shortName: 'CR Banfora',
      createdAt: now - 500 * DAY,
      region: 'Cascades',
      district: 'District sanitaire de Banfora',
      locality: 'Banfora',
      address: 'Sector 4, Banfora (position déclarée)',
      services: ['Chirurgie', 'Médecine interne', 'Imagerie', 'Réanimation'],
      availability: 'open',
      nodeId: 'phone-centre',
    },
    {
      id: 'org-centre-2',
      kind: 'health_center',
      name: 'Centre de référence de Dédougou',
      shortName: 'CR Dédougou',
      createdAt: now - 480 * DAY,
      region: 'Boucle du Mouhoun',
      district: 'District sanitaire de Dédougou',
      locality: 'Dédougou',
      address: 'Carré 12, Dédougou (position déclarée)',
      services: ['Chirurgie', 'Pédiatrie'],
      availability: 'limited',
      availabilityNote: 'Bloc opératoire indisponible (déclaré).',
      nodeId: null,
    },
    {
      id: 'org-hopital',
      kind: 'hospital',
      name: 'Hôpital régional de Bobo',
      shortName: 'Hôpital Bobo',
      createdAt: now - 600 * DAY,
      region: 'Hauts-Bassins',
      district: 'District sanitaire de Bobo-Dioulasso',
      locality: 'Bobo-Dioulasso',
      address: 'Avenue Kwamé N’Krumah (position déclarée)',
      services: ['Réanimation', 'Chirurgie', 'Cardiologie', 'Maternité chirurgicale'],
      availability: 'open',
      nodeId: 'phone-hopital',
    },
    { id: 'org-ong-1', kind: 'ngo', name: 'ONG Terre & Vie', shortName: 'Terre & Vie', createdAt: now - 300 * DAY },
    { id: 'org-ong-2', kind: 'ngo', name: 'ONG Solidarité Sahel', shortName: 'Solidarité Sahel', createdAt: now - 260 * DAY },
    {
      id: 'org-hub',
      kind: 'hub',
      name: 'Hub Central',
      shortName: 'Hub',
      createdAt: now - 180 * DAY,
      region: 'National',
      district: 'Coordination nationale',
      locality: 'Ouagadougou',
      address: 'Centre de coordination (position déclarée)',
      services: ['Orientation des demandes', 'Supervision du réseau'],
      availability: 'open',
      nodeId: 'node-hub',
    },
    { id: 'org-admin', kind: 'admin_network', name: 'Administration du réseau', shortName: 'Administration', createdAt: now - 180 * DAY },
  ];

  const memberships: Membership[] = [
    { userId: 'u_citoyen1', orgId: 'org-famille', role: 'citizen', joinedAt: now - 90 * DAY },
    { userId: 'u_citoyen2', orgId: 'org-famille', role: 'citizen', joinedAt: now - 90 * DAY },
    { userId: 'u_agent_csps', orgId: 'org-csps', role: 'health_agent', joinedAt: now - 34 * DAY },
    { userId: 'u_responsable_csps', orgId: 'org-csps', role: 'health_manager', joinedAt: now - 300 * DAY },
    { userId: 'u_agent_csps2', orgId: 'org-csps-2', role: 'health_agent', joinedAt: now - 90 * DAY },
    { userId: 'u_agent_centre', orgId: 'org-centre', role: 'health_center_operator', joinedAt: now - 150 * DAY },
    { userId: 'u_agent_hopital', orgId: 'org-hopital', role: 'hospital_operator', joinedAt: now - 140 * DAY },
    { userId: 'u_agent_ong', orgId: 'org-ong-1', role: 'ngo_field_agent', joinedAt: now - 120 * DAY },
    { userId: 'u_coordinateur_ong', orgId: 'org-ong-1', role: 'ngo_coordinator', joinedAt: now - 200 * DAY },
    // Compte multi-rôles : deux organisations DIFFÉRENTES, un rôle différent chacune.
    { userId: 'u_admin_multi', orgId: 'org-ong-2', role: 'ngo_coordinator', joinedAt: now - 200 * DAY },
    { userId: 'u_admin_multi', orgId: 'org-csps', role: 'health_agent', joinedAt: now - 100 * DAY },
    { userId: 'u_operateur_hub', orgId: 'org-hub', role: 'operator', joinedAt: now - 180 * DAY },
    { userId: 'u_administrateur', orgId: 'org-admin', role: 'system_admin', joinedAt: now - 180 * DAY },
  ];

  const groups: Group[] = [
    {
      id: 'grp-famille',
      orgId: 'org-famille',
      kind: 'family',
      name: 'Famille Traoré',
      memberIds: ['u_citoyen1', 'u_citoyen2'],
      createdAt: now - 90 * DAY,
    },
    {
      id: 'grp-equipe-terrain',
      orgId: 'org-ong-1',
      kind: 'team',
      name: 'Équipe terrain Nord',
      memberIds: ['u_coordinateur_ong', 'u_agent_ong'],
      createdAt: now - 60 * DAY,
    },
  ];

  /* ── Postes de travail supplémentaires (nœuds téléphone) ───────────── */
  const extraPhones: { id: string; name: string; x: number; y: number; linkTo: string; latencyMs: number; lossRate: number; battery: number }[] = [
    { id: 'phone-centre', name: 'Poste du Centre de référence', x: 300, y: 196, linkTo: 'relay-est', latencyMs: 640, lossRate: 0.05, battery: 91 },
    { id: 'phone-hopital', name: 'Poste de l’Hôpital régional', x: 196, y: 96, linkTo: 'relay-nord', latencyMs: 720, lossRate: 0.05, battery: 88 },
    { id: 'phone-ong-1', name: 'Poste ONG Terre & Vie', x: 44, y: 152, linkTo: 'relay-ouest', latencyMs: 660, lossRate: 0.06, battery: 77 },
    { id: 'phone-ong-2', name: 'Poste du CSPS de Daboya', x: 258, y: 64, linkTo: 'relay-est', latencyMs: 690, lossRate: 0.06, battery: 71 },
    { id: 'phone-admin', name: 'Poste d’administration', x: 168, y: 214, linkTo: 'node-hub', latencyMs: 600, lossRate: 0.02, battery: 96 },
  ];

  const nodes: MeshNode[] = [
    ...seedNodes(),
    ...extraPhones.map((p) => ({
      id: p.id,
      name: p.name,
      kind: 'phone' as const,
      status: 'online' as const,
      position: { x: p.x, y: p.y },
      battery: p.battery,
      load: 4,
    })),
  ];
  const links: MeshLink[] = [
    ...seedLinks(),
    ...extraPhones.map((p) => ({
      id: `l-${p.id}-${p.linkTo}`,
      aNodeId: p.id,
      bNodeId: p.linkTo,
      latencyMs: p.latencyMs,
      lossRate: p.lossRate,
      status: 'up' as const,
    })),
  ];

  const contacts = users.flatMap((owner) =>
    users
      .filter((u) => u.id !== owner.id)
      .map((u) => ({
        id: `ct_${owner.id}_${u.id}`,
        ownerId: owner.id,
        name: u.displayName,
        nodeId: u.nodeId,
        favorite: u.id === 'u_citoyen2' || u.id === 'u_citoyen1',
      })),
  );

  const pairs: [string, string][] = [
    ['u_citoyen1', 'u_citoyen2'],
    ['u_citoyen1', 'u_agent_csps'],
    ['u_citoyen1', 'u_operateur_hub'],
    ['u_citoyen2', 'u_agent_csps'],
    ['u_agent_csps', 'u_agent_centre'],
    ['u_agent_csps', 'u_operateur_hub'],
    ['u_responsable_csps', 'u_agent_csps'],
  ];
  const conversations: Conversation[] = pairs.map(([a, b]) => ({
    id: conversationIdFor(a, b),
    participantIds: [a, b].sort(),
    lastActivityAt: now - 40 * MINUTE,
    unreadCount: 0,
  }));

  const specs: SeedMessageSpec[] = [
    {
      conversationId: conversationIdFor('u_citoyen1', 'u_citoyen2'),
      senderId: 'u_citoyen1',
      recipientId: 'u_citoyen2',
      body: 'Salut, tu es bien arrivé au marché ?',
      ago: 3 * HOUR,
      status: 'delivered',
      path: ['phone-aminata', 'relay-ouest', 'node-hub', 'phone-salif'],
    },
    {
      conversationId: conversationIdFor('u_citoyen1', 'u_citoyen2'),
      senderId: 'u_citoyen2',
      recipientId: 'u_citoyen1',
      body: 'Oui, je suis arrivé. Le relais Nord a répété mon message, ça a mis deux minutes.',
      ago: 2.6 * HOUR,
      status: 'delivered',
      path: ['phone-salif', 'relay-est', 'node-hub', 'phone-aminata'],
    },
    {
      conversationId: conversationIdFor('u_citoyen1', 'u_citoyen2'),
      senderId: 'u_citoyen1',
      recipientId: 'u_citoyen2',
      body: 'Parfait. Je t’envoie la liste du bois avant la nuit.',
      ago: 40 * MINUTE,
      status: 'unconfirmed',
      path: ['phone-aminata', 'relay-ouest', 'node-hub'],
    },
    {
      conversationId: conversationIdFor('u_citoyen1', 'u_agent_csps'),
      senderId: 'u_agent_csps',
      recipientId: 'u_citoyen1',
      body: 'L’antenne du relais Sud fait des siennes ce matin.',
      ago: 5 * HOUR,
      status: 'delivered',
      path: ['phone-mariam', 'relay-ouest', 'node-hub', 'phone-aminata'],
    },
    {
      conversationId: conversationIdFor('u_citoyen1', 'u_agent_csps'),
      senderId: 'u_citoyen1',
      recipientId: 'u_agent_csps',
      body: 'Je le signale à l’opérateur du Hub.',
      ago: 4.7 * HOUR,
      status: 'delivered',
      path: ['phone-aminata', 'relay-ouest', 'node-hub', 'phone-mariam'],
    },
    {
      conversationId: conversationIdFor('u_citoyen1', 'u_agent_csps'),
      senderId: 'u_agent_csps',
      recipientId: 'u_citoyen1',
      body: 'Merci. Appelle-moi quand c’est rétabli.',
      ago: 26 * MINUTE,
      status: 'failed',
      path: ['phone-mariam', 'relay-ouest'],
    },
    {
      conversationId: conversationIdFor('u_citoyen1', 'u_operateur_hub'),
      senderId: 'u_citoyen1',
      recipientId: 'u_operateur_hub',
      body: 'Bonjour, quel est l’état du réseau aujourd’hui ?',
      ago: 30 * HOUR,
      status: 'delivered',
      path: ['phone-aminata', 'relay-ouest', 'node-hub'],
    },
    {
      conversationId: conversationIdFor('u_citoyen1', 'u_operateur_hub'),
      senderId: 'u_operateur_hub',
      recipientId: 'u_citoyen1',
      body: 'Tous les relais sont actifs. Le Hub tourne à 38 % de charge.',
      ago: 29 * HOUR,
      status: 'delivered',
      path: ['node-hub', 'relay-ouest', 'phone-aminata'],
    },
    {
      conversationId: conversationIdFor('u_citoyen2', 'u_agent_csps'),
      senderId: 'u_citoyen2',
      recipientId: 'u_agent_csps',
      body: 'Tu passes au point de rendez-vous à 18 h ?',
      ago: 6 * HOUR,
      status: 'queued',
      path: ['phone-salif', 'relay-est'],
    },
    {
      conversationId: conversationIdFor('u_citoyen2', 'u_agent_csps'),
      senderId: 'u_agent_csps',
      recipientId: 'u_citoyen2',
      body: 'Oui, j’y serai.',
      ago: 5.4 * HOUR,
      status: 'delivered',
      path: ['phone-mariam', 'relay-ouest', 'node-hub', 'phone-salif'],
    },
    {
      // Échange professionnel CSPS → centre de référence (§7).
      conversationId: conversationIdFor('u_agent_csps', 'u_agent_centre'),
      senderId: 'u_agent_csps',
      recipientId: 'u_agent_centre',
      body: 'Dossier DOS-2026-0141 transmis : évacuation obstétricale critique, route Sud.',
      ago: 3 * HOUR,
      status: 'delivered',
      path: ['phone-mariam', 'relay-ouest', 'node-hub', 'phone-centre'],
    },
    {
      conversationId: conversationIdFor('u_agent_csps', 'u_agent_centre'),
      senderId: 'u_agent_centre',
      recipientId: 'u_agent_csps',
      body: 'Reçu. Bloc préparé, envoyez l’ambulance par la route Ouest (ferrée).',
      ago: 2.6 * HOUR,
      status: 'delivered',
      path: ['phone-centre', 'node-hub', 'relay-ouest', 'phone-mariam'],
    },
    {
      conversationId: conversationIdFor('u_agent_csps', 'u_operateur_hub'),
      senderId: 'u_agent_csps',
      recipientId: 'u_operateur_hub',
      body: 'Le relais Ouest est de nouveau stable de notre côté.',
      ago: 90 * MINUTE,
      status: 'delivered',
      path: ['phone-mariam', 'relay-ouest', 'node-hub'],
    },
    {
      conversationId: conversationIdFor('u_responsable_csps', 'u_agent_csps'),
      senderId: 'u_responsable_csps',
      recipientId: 'u_agent_csps',
      body: 'Merci pour le point de 8 h : gardez le dossier DOS-2026-0140 ouvert.',
      ago: 6 * HOUR,
      status: 'delivered',
      path: ['phone-mariam'],
    },
  ];

  const messages: Message[] = [];
  const deliveries: Record<string, DeliveryRecord> = {};

  for (const spec of specs) {
    const at = now - spec.ago;
    const messageId = uid('msg');
    const deliveryId = uid('dlv');
    const cipher = await encryptText(spec.body);

    let record = createDelivery(deliveryId, messageId, at, TIMING.ttl);
    record = transition(record, 'created', {
      at,
      reason: 'submit',
      detail: 'Message créé et enregistré sur l’appareil',
    });

    if (spec.status === 'queued') {
      record = transition(record, 'queued', {
        at: at + 400,
        reason: 'Réseau indisponible',
        detail: 'Aucune route disponible : message conservé localement, retransmission automatique.',
      });
    } else {
      record = transition(record, 'accepted_local', {
        at: at + 400,
        reason: 'node_accept',
        detail: 'Accepté par le nœud local (pas encore arrivé au destinataire).',
      });
      record = transition(record, 'routing', {
        at: at + 700,
        reason: 'route',
        detail: `Route retenue : ${spec.path.join(' → ')}`,
      });
      for (let i = 0; i < Math.max(1, spec.path.length - 1); i += 1) {
        record = pushHop(record, {
          index: i,
          fromNodeId: spec.path[i],
          toNodeId: spec.path[i + 1],
          at: at + 900 + i * 800,
          result: 'ok',
        });
      }
      if (spec.status === 'delivered') {
        record = transition(record, 'delivered', {
          at: at + 1500 + spec.path.length * 400,
          reason: 'ack',
          detail: 'Accusé de réception du destinataire',
        });
      } else if (spec.status === 'failed') {
        record = transition(record, 'failed', {
          at: at + 4000,
          reason: 'reroute',
          detail: 'Relais Sud injoignable et aucune route alternative : échec de transmission.',
        });
      } else if (spec.status === 'unconfirmed') {
        record = transition(record, 'unconfirmed', {
          at: at + TIMING.ttl,
          reason: 'ttl',
          detail: 'Délai dépassé : aucun accusé de réception. Le message n’est pas confirmé.',
        });
      }
    }

    deliveries[deliveryId] = record;
    const lu = spec.status === 'delivered' || spec.ago > 4 * HOUR;
    messages.push({
      id: messageId,
      type: 'private',
      conversationId: spec.conversationId,
      senderId: spec.senderId,
      recipientId: spec.recipientId,
      createdAt: at,
      deliveryId,
      orgId: null,
      groupId: null,
      confidentiality: 'private',
      body: cipher ? null : spec.body,
      cipher,
      priority: 'info',
      read: lu,
      consultedAt: lu ? at + 3 * MINUTE : null,
    });
  }

  /* ── Dossiers sanitaires à différents stades (§14) ─────────────────── */
  const careRequests: CareRequest[] = [];

  const seedCare = (spec: {
    seq: number;
    kind: CareKind;
    type: string;
    priority: Priority;
    motif: string;
    description: string;
    signes?: string;
    vitals?: { temp?: string; bp?: string; hr?: string; spo2?: string };
    location: string;
    destination: string;
    senderId: string;
    orgId: string;
    targetOrgId: string | null;
    ago: number;
    path: string[] | null;
    stages: CareStatus[];
    actorId?: string;
    justification?: string;
    closingNote?: string;
    logistics?: string;
  }): void => {
    const at = now - spec.ago;
    let transportDeliveryId: string | null = null;
    let deliveredAt = at;

    if (spec.path) {
      const messageId = uid('msg');
      transportDeliveryId = uid('dlv');
      let record = createDelivery(transportDeliveryId, messageId, at, TIMING.ttl);
      record = transition(record, 'created', { at, reason: 'submit', detail: 'Dossier remis au réseau simulé' });
      record = transition(record, 'accepted_local', {
        at: at + 400,
        reason: 'node_accept',
        detail: 'Accepté par le nœud local (pas encore arrivé au destinataire).',
      });
      record = transition(record, 'routing', {
        at: at + 700,
        reason: 'route',
        detail: `Route retenue : ${spec.path.join(' → ')}`,
      });
      for (let i = 0; i < Math.max(1, spec.path.length - 1); i += 1) {
        record = pushHop(record, {
          index: i,
          fromNodeId: spec.path[i],
          toNodeId: spec.path[i + 1],
          at: at + 900 + i * 800,
          result: 'ok',
        });
      }
      deliveredAt = at + 1500 + spec.path.length * 400;
      record = transition(record, 'delivered', {
        at: deliveredAt,
        reason: 'ack',
        detail: 'Accusé de réception du destinataire',
      });
      deliveries[transportDeliveryId] = record;
    }

    let request = createCareRequest({
      id: uid('care'),
      caseRef: nextCaseRef(spec.seq, new Date(at).getFullYear()),
      kind: spec.kind,
      type: spec.type,
      priority: spec.priority,
      motif: spec.motif,
      description: spec.description,
      signes: spec.signes ?? '',
      vitals: spec.vitals ?? {},
      logisticsInstructions: spec.logistics ?? '',
      location: spec.location,
      desiredDestination: spec.destination,
      complementary: '',
      senderId: spec.senderId,
      orgId: spec.orgId,
      targetOrgId: spec.targetOrgId,
      transportDeliveryId,
      createdAt: at,
    });

    if (spec.path) {
      request = careTransition(request, 'sent', {
        at: at + 400,
        actorId: 'system',
        reason: 'transport_submit',
        detail: 'Confié au réseau simulé',
      });
      request = careTransition(request, 'received', {
        at: deliveredAt,
        actorId: 'system',
        reason: 'transport_delivered',
        detail: 'Arrivée technique au destinataire — prise en charge NON confirmée',
      });
    }

    let step = deliveredAt + MINUTE;
    for (const to of spec.stages) {
      step += 5 * MINUTE;
      request = careTransition(request, to, {
        at: step,
        actorId: spec.actorId ?? 'u_agent_centre',
        reason: 'operator_action',
        justification: to === 'rejected' ? spec.justification : undefined,
        closingNote: to === 'resolved' ? spec.closingNote : undefined,
        detail:
          to === 'information_requested'
            ? 'Constantes manquantes : tension et saturation à confirmer.'
            : to === 'in_progress'
              ? 'Ambulance préparée pour le transfert.'
              : undefined,
      });
    }
    careRequests.push(request);
  };

  const TO_BANFORA = ['phone-mariam', 'relay-ouest', 'node-hub', 'phone-centre'];
  const TO_BOBO = ['phone-mariam', 'relay-ouest', 'node-hub', 'phone-hopital'];

  // En attente d’accusé du centre.
  seedCare({
    seq: 141,
    kind: 'evacuation',
    type: 'maternity',
    priority: 'critical',
    motif: 'Évacuation obstétricale',
    description: 'Contractions régulières, extraction prématurée à 32 SA.',
    signes: 'Contractions toutes les 4 minutes.',
    vitals: { temp: '37.8', hr: '112', spo2: '96' },
    location: 'CSPS de Kongou',
    destination: 'Centre de référence de Banfora',
    senderId: 'u_agent_csps',
    orgId: 'org-csps',
    targetOrgId: 'org-centre',
    ago: 2.5 * HOUR,
    path: TO_BANFORA,
    stages: [],
    logistics: 'Ambulance demandée, route Ouest ferrée.',
  });
  // Centre : accusé puis demande d’informations complémentaires.
  seedCare({
    seq: 140,
    kind: 'reference',
    type: 'pediatric',
    priority: 'urgent',
    motif: 'Fièvre persistante chez l’enfant',
    description: 'Enfant de 2 ans, fièvre depuis 3 jours, prise en charge locale sans amélioration.',
    signes: 'Agitation, refus de s’alimenter.',
    vitals: { temp: '39.2', hr: '148' },
    location: 'CSPS de Kongou',
    destination: 'Centre de référence de Banfora',
    senderId: 'u_agent_csps',
    orgId: 'org-csps',
    targetOrgId: 'org-centre',
    ago: 6 * HOUR,
    path: TO_BANFORA,
    stages: ['acknowledged', 'information_requested'],
  });
  // Évacuation acceptée, transfert préparé.
  seedCare({
    seq: 139,
    kind: 'evacuation',
    type: 'trauma',
    priority: 'critical',
    motif: 'Traumatisme routier',
    description: 'Accident de moto, fracture ouverte du tibia, immobilisée sur place.',
    signes: 'Douleur vive, peau pâle.',
    vitals: { temp: '36.9', bp: '10/6', hr: '124', spo2: '97' },
    location: 'CSPS de Kongou',
    destination: 'Hôpital régional de Bobo',
    senderId: 'u_agent_csps',
    orgId: 'org-csps',
    targetOrgId: 'org-hopital',
    ago: 9 * HOUR,
    path: TO_BOBO,
    stages: ['acknowledged', 'accepted', 'in_progress'],
    logistics: 'Brancard et perfusion démarrés en attendant l’ambulance.',
  });
  // Dossier clôturé avec compte rendu synthétique.
  seedCare({
    seq: 138,
    kind: 'reference',
    type: 'respiratory',
    priority: 'urgent',
    motif: 'Difficulté respiratoire',
    description: 'Patient en détresse respiratoire, transféré au centre.',
    location: 'CSPS de Kongou',
    destination: 'Centre de référence de Banfora',
    senderId: 'u_agent_csps',
    orgId: 'org-csps',
    targetOrgId: 'org-centre',
    ago: 30 * HOUR,
    path: TO_BANFORA,
    stages: ['acknowledged', 'accepted', 'in_progress', 'in_transit', 'arrived', 'resolved'],
    closingNote: 'Prise en charge effective au centre, sorti après 48 h. Transfert sans incident.',
  });
  // Refus motivé.
  seedCare({
    seq: 142,
    kind: 'advice',
    type: 'surgery',
    priority: 'urgent',
    motif: 'Avis spécialisé chirurgical',
    description: 'Vérification d’une volumineuse hernie étranglée, avis demandé avant transfert.',
    location: 'CSPS de Kongou',
    destination: 'Centre de référence de Banfora',
    senderId: 'u_agent_csps',
    orgId: 'org-csps',
    targetOrgId: 'org-centre',
    ago: 20 * HOUR,
    path: TO_BANFORA,
    stages: ['acknowledged', 'rejected'],
    justification: 'Bloc en urgence absolue jusqu’à 18 h : demandez l’avis du Dr Konaté par message, puis réessayez.',
  });
  // Jamais transmis (créé au CSPS voisin) — sert à l’isolation des stats.
  seedCare({
    seq: 143,
    kind: 'reference',
    type: 'fever',
    priority: 'info',
    motif: 'Fièvre persistante',
    description: 'Consultation enregistrée au CSPS de Daboya, en attente d’un créneau de transmission.',
    location: 'CSPS de Daboya',
    destination: 'Centre de référence de Dédougou',
    senderId: 'u_agent_csps2',
    orgId: 'org-csps-2',
    targetOrgId: 'org-centre-2',
    ago: 5 * HOUR,
    path: null,
    stages: [],
  });

  const alerts: Alert[] = [
    createAlert({
      id: uid('alt'),
      senderId: 'u_agent_csps',
      priority: 'info',
      title: 'Réunion du village',
      body: 'Réunion publique samedi 9 h à la place du marché.',
      geo: 'Marché central (position déclarée)',
      createdAt: now - 8 * HOUR,
      deliveryId: uid('dlv_seed'),
    }),
    createAlert({
      id: uid('alt'),
      senderId: 'u_citoyen2',
      priority: 'urgent',
      title: 'Accident sur la route nationale',
      body: 'Camion immobilisé sur la voie, circulation réduite à un sens.',
      geo: 'Route nationale 2, km 41',
      createdAt: now - 3 * HOUR,
      deliveryId: uid('dlv_seed'),
    }),
    createAlert({
      id: uid('alt'),
      senderId: 'u_citoyen1',
      priority: 'critical',
      title: 'Incendie de brousse — quartier Nord',
      body: 'Feu en progression vers les habitations. Évacuation par le sud.',
      geo: 'Quartier Nord (position déclarée)',
      createdAt: now - 45 * MINUTE,
      deliveryId: uid('dlv_seed'),
    }),
  ];
  // L’opérateur du Hub a déjà pris l’alerte critique en charge.
  alerts[2].acknowledgedBy = ['u_operateur_hub'];

  const notifications: AppNotification[] = [
    {
      id: uid('ntf'),
      type: 'alert',
      title: 'Alerte critique reçue',
      body: 'Incendie de brousse — quartier Nord',
      createdAt: now - 44 * MINUTE,
      read: false,
      deepLink: '/app/alerts',
    },
    {
      id: uid('ntf'),
      type: 'message',
      title: 'Message de l’agent CSPS remis',
      body: '« Merci. Appelle-moi quand c’est rétabli. »',
      createdAt: now - 26 * MINUTE,
      read: false,
      deepLink: '/app/messages',
    },
    {
      id: uid('ntf'),
      type: 'system',
      title: 'Réseau vérifié',
      body: 'Les 13 nœuds du réseau de démonstration répondent.',
      createdAt: now - 9 * HOUR,
      read: true,
      deepLink: '/app/network',
    },
  ];

  const audit: AuditEntry[] = [
    {
      id: uid('aud'),
      at: now - 9 * HOUR,
      actorId: 'u_operateur_hub',
      actorName: 'operateur_hub',
      action: 'Contrôle réseau',
      targetId: null,
      detail: 'Vérification complète des nœuds : 8/8 actifs.',
    },
    {
      id: uid('aud'),
      at: now - 3 * HOUR,
      actorId: 'u_citoyen2',
      actorName: 'citoyen2',
      action: 'Alerte urgente',
      targetId: null,
      detail: 'Accident sur la route nationale — niveau urgent.',
    },
    {
      id: uid('aud'),
      at: now - 45 * MINUTE,
      actorId: 'u_citoyen1',
      actorName: 'citoyen1',
      action: 'Alerte critique',
      targetId: null,
      detail: 'Incendie de brousse — quartier Nord.',
    },
    {
      id: uid('aud'),
      at: now - 44 * MINUTE,
      actorId: 'u_operateur_hub',
      actorName: 'operateur_hub',
      action: 'Accusé de réception',
      targetId: null,
      detail: 'Alerte critique prise en compte au Hub.',
    },
  ];

  return {
    seedVersion: SEED_VERSION,
    users,
    currentUserId: null,
    organizations,
    memberships,
    groups,
    grants: [],
    activeOrgId: null,
    contacts,
    conversations,
    messages,
    deliveries,
    alerts,
    careRequests,
    notifications,
    audit,
    nodes,
    links,
    simRunning: true,
    simSpeed: 1,
    seeded: true,
  };
}
