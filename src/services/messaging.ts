import type {
  DeliveryRecord,
  Group,
  Message,
  MessageType,
  Priority,
  SharedGrant,
  User,
} from '../core/types';
import type { ResourceRef } from '../policy/types';
import type { PermAction } from '../policy/catalog';
import { assertCan, type Actor } from '../policy';

/**
 * Service de messagerie unifiée (§3 et §7 du cahier des charges).
 *
 * Aucune UI ici : le service vérifie la POLITIQUE, fabrique l'entité, puis
 * laisse le store persister et le moteur transporter. En cas de refus, rien
 * n'est créé (aucune ressource fantôme).
 */

export const PERMISSION_FOR_TYPE: Record<MessageType, PermAction> = {
  private: 'message.send',
  group: 'message.send',
  org: 'message.send',
  alert: 'alert.raise',
  care_request: 'care.create',
  notification: 'message.send',
  report: 'ngo.report.write',
};

const TYPE_RESOURCE: Record<MessageType, ResourceRef['type']> = {
  private: 'message',
  group: 'group',
  org: 'message',
  alert: 'alert',
  care_request: 'care',
  notification: 'message',
  report: 'report',
};

export class MessagingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MessagingError';
    this.code = code;
  }
}

export interface OutgoingCheck {
  actor: Actor;
  type: MessageType;
  recipientIds: string[];
  orgId?: string | null;
  group?: Group | null;
  grants?: SharedGrant[];
  now?: number;
}

/** Vérifie TOUT avant création : politique métier + appartenance au groupe/à l'org. */
export function authorizeOutgoing(input: OutgoingCheck): void {
  const { actor, type, recipientIds } = input;
  if (recipientIds.length === 0) throw new MessagingError('no_recipient', 'Aucun destinataire.');

  const orgId = input.orgId ?? null;
  const resource: ResourceRef | undefined = orgId
    ? { type: TYPE_RESOURCE[type], orgId, targetOrgId: orgId }
    : undefined;

  assertCan({
    actor,
    action: PERMISSION_FOR_TYPE[type],
    resource,
    grants: input.grants ?? [],
    now: input.now,
  });

  // Une organisation n'écrit que DANS son propre contexte actif.
  if (orgId && actor.activeOrgId !== orgId) {
    throw new MessagingError('context_mismatch', 'Le message doit être émis depuis le contexte de cette organisation.');
  }
  // Un groupe n'est ouvert qu'à ses membres.
  if (input.group && !input.group.memberIds.includes(actor.userId)) {
    throw new MessagingError('not_group_member', 'Vous n’êtes pas membre de ce groupe.');
  }
}

export interface IncomingResult {
  messages: Message[];
  applied: boolean;
  reason?: 'duplicate';
}

/**
 * Arrivée d'un message : DÉDOUBLONNAGE par identifiant persistant.
 * Le même messageId ne s'applique qu'une seule fois (effet exactement une fois).
 */
export function applyIncoming(existing: Message[], incoming: Message): IncomingResult {
  if (existing.some((m) => m.id === incoming.id)) {
    return { messages: existing, applied: false, reason: 'duplicate' };
  }
  return { messages: [...existing, incoming], applied: true };
}

/** Marque un message CONSULTÉ par son destinataire (l'émetteur ne peut pas). */
export function markConsulted(message: Message, readerId: string, at: number): Message {
  if (message.recipientId !== readerId) {
    throw new MessagingError('not_recipient', 'Seul le destinataire peut marquer un message comme consulté.');
  }
  if (message.consultedAt !== null) return message;
  return { ...message, consultedAt: at, read: true };
}

const RESUMABLE = new Set(['draft', 'created', 'accepted_local', 'routing', 'queued', 'unconfirmed']);

/** Livraisons non terminales et non expirées, éligibles à une reprise. */
export function recoverableDeliveries(
  deliveries: Record<string, DeliveryRecord>,
  now: number,
): { deliveryId: string; messageId: string }[] {
  return Object.values(deliveries)
    .filter((d) => RESUMABLE.has(d.status) && d.expiresAt > now)
    .map((d) => ({ deliveryId: d.id, messageId: d.messageId }));
}

export interface EngineSubmit {
  submit: (deliveryId: string, route: { senderNode: string; recipientNode: string; priority?: Priority }) => void;
}

export interface ResumeInput {
  deliveries: Record<string, DeliveryRecord>;
  messages: Message[];
  users: User[];
  engine: EngineSubmit;
  /** Livraisons déjà actives dans le moteur (évite le double envoi). */
  activeIds?: Iterable<string>;
  now: number;
}

/**
 * Reprise au redémarrage (§7) : resoumet les livraisons non terminales.
 * Ne crée AUCUN message supplémentaire — les identifiants sont conservés.
 */
export function resumeOnBoot(input: ResumeInput): string[] {
  const active = new Set(input.activeIds ?? []);
  const byId = new Map(input.messages.map((m) => [m.id, m]));
  const usersById = new Map(input.users.map((u) => [u.id, u]));
  const resumed: string[] = [];

  for (const { deliveryId, messageId } of recoverableDeliveries(input.deliveries, input.now)) {
    if (active.has(deliveryId)) continue;
    const message = byId.get(messageId);
    if (!message) continue;
    const sender = usersById.get(message.senderId);
    const recipient = usersById.get(message.recipientId);
    if (!sender || !recipient) continue;
    input.engine.submit(deliveryId, {
      senderNode: sender.nodeId,
      recipientNode: recipient.nodeId,
      priority: message.priority,
    });
    resumed.push(deliveryId);
  }
  return resumed;
}
