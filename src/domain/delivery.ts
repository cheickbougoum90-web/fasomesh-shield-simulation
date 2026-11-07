import type { DeliveryRecord, DeliveryStatus, HopRecord, StatusEvent, Tone } from '../core/types';

/**
 * Machine à états d'acheminement.
 *
 * Centraliser les transitions ici est un choix de sécurité produit :
 * aucun écran ne peut fabriquer un statut « reçu » — il doit passer par
 * `transition()`, qui refuse les sauts illégaux.
 */

export const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  draft: ['created', 'failed'],
  created: ['accepted_local', 'queued', 'unconfirmed', 'failed'],
  accepted_local: ['routing', 'queued', 'unconfirmed', 'failed'],
  routing: ['routing', 'delivered', 'queued', 'unconfirmed', 'failed'],
  queued: ['created', 'accepted_local', 'routing', 'delivered', 'unconfirmed', 'failed'],
  delivered: [],
  unconfirmed: ['queued', 'routing', 'failed'],
  failed: ['created', 'queued', 'routing'],
};

export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  if (from === to) return true; // annotation d'événement sans changement d'état
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: DeliveryStatus): boolean {
  return status === 'delivered';
}

export function createDelivery(id: string, messageId: string, at: number, ttlMs: number): DeliveryRecord {
  return {
    id,
    messageId,
    status: 'draft',
    hops: [],
    events: [{ at, from: null, to: 'draft', reason: 'init', detail: 'Envoi préparé' }],
    createdAt: at,
    expiresAt: at + ttlMs,
    attempts: 0,
    storedAtHub: false,
  };
}

export function transition(
  record: DeliveryRecord,
  to: DeliveryStatus,
  opts: { at: number; reason: string; detail?: string; storedAtHub?: boolean },
): DeliveryRecord {
  if (!canTransition(record.status, to)) {
    throw new Error(`Transition de statut illégale : ${record.status} → ${to}`);
  }
  const event: StatusEvent = {
    at: opts.at,
    from: record.status,
    to,
    reason: opts.reason,
    detail: opts.detail,
  };
  return {
    ...record,
    status: to,
    storedAtHub: opts.storedAtHub ?? record.storedAtHub,
    events: [...record.events, event],
  };
}

/** Chaque enregistrement de saut est une tentative de transmission physique simulée. */
export function pushHop(record: DeliveryRecord, hop: HopRecord): DeliveryRecord {
  const hops = [...record.hops, hop];
  return { ...record, hops, attempts: hops.length };
}

/** Statuts jugés « en cours » pour l'affichage (file d'attente comprise). */
export function isActive(status: DeliveryStatus): boolean {
  return status !== 'delivered' && status !== 'failed';
}

/** Éligible à un renvoi manuel depuis l'écran de suivi. */
export function canRetry(status: DeliveryStatus): boolean {
  return status === 'failed' || status === 'unconfirmed';
}

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  draft: 'Préparé',
  created: 'Message créé',
  accepted_local: 'Accepté par le nœud',
  routing: 'En cours d’acheminement',
  delivered: 'Reçu par le destinataire',
  unconfirmed: 'Non confirmé',
  failed: 'Échec de transmission',
  queued: 'En attente de réseau',
};

export const STATUS_TONE: Record<DeliveryStatus, Tone> = {
  draft: 'muted',
  created: 'neutral',
  accepted_local: 'info',
  routing: 'warn',
  delivered: 'success',
  unconfirmed: 'warn',
  failed: 'danger',
  queued: 'muted',
};

/**
 * Formulation honnête destinée à l'utilisateur non technique.
 * Chaque libellé dit ce qui s'est RÉELLEMENT passé — c'est la règle
 * n°1 du produit : ne jamais prétendre qu'un message est arrivé.
 */
export const STATUS_HELP: Record<DeliveryStatus, string> = {
  draft: 'L’envoi n’a pas encore été confirmé par votre appareil.',
  created: 'Enregistré sur votre appareil. Rien n’a encore quitté celui-ci.',
  accepted_local: 'Votre nœud local a accepté le message. Il NE S’EST PAS encore arrivé au destinataire.',
  routing: 'Le message circule de nœud en nœud vers son destinataire.',
  delivered: 'Le destinataire a bien reçu et confirmé le message.',
  unconfirmed: 'Aucun accusé de réception dans le délai. LE MESSAGE N’EST PAS CONFIRMÉ.',
  failed: 'Le message n’a pas pu être acheminé. Vous pouvez le renvoyer.',
  queued: 'Réseau indisponible : le message est conservé localement et sera retransmis automatiquement.',
};

/** Étapes d'avancement affichées sur l'écran de suivi. */
export const STATUS_STEPS: DeliveryStatus[] = ['created', 'accepted_local', 'routing', 'delivered'];

export function stepIndex(status: DeliveryStatus): number {
  if (status === 'delivered') return STATUS_STEPS.length;
  if (status === 'queued' || status === 'unconfirmed' || status === 'failed') return -1;
  const i = STATUS_STEPS.indexOf(status);
  return i < 0 ? 0 : i;
}
