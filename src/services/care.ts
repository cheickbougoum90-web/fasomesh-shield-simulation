import type { CareRequest, CareStatus, SharedGrant } from '../core/types';
import { careTransition, checkCoupling } from '../domain/care';
import { assertCan, type Actor } from '../policy';
import type { ResourceRef } from '../policy/types';

/**
 * Service de suivi de prise en charge (§4).
 *
 * Séparation stricte :
 *  - le TRANSPORT est porté par `domain/delivery` + le moteur Mesh ;
 *  - le SUIVI DE SOIN est porté ici, par des actes d'opérateurs simulés.
 * Aucune des deux couches ne fabrique l'état de l'autre, sauf les deux
 * couplages documentés (`syncTransport` : envoyé / reçu techniquement).
 */

export class CareError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CareError';
    this.code = code;
  }
}

function resourceOf(request: CareRequest): ResourceRef {
  return { type: 'care', id: request.id, orgId: request.orgId, targetOrgId: request.targetOrgId ?? undefined };
}

/**
 * Permissions exigées pour chaque acte de suivi.
 * `cancelled` appartient au CSPS émetteur (`care.cancel`) ; tous les autres
 * sont des actes d’opérateur du centre (`care.respond`).
 */
const ACTION_FOR: Partial<Record<CareStatus, 'care.respond' | 'care.cancel'>> = {
  acknowledged: 'care.respond',
  information_requested: 'care.respond',
  accepted: 'care.respond',
  rejected: 'care.respond',
  in_progress: 'care.respond',
  in_transit: 'care.respond',
  arrived: 'care.respond',
  resolved: 'care.respond',
  cancelled: 'care.cancel',
};

export interface CarePolicyInput {
  actor: Actor;
  request: CareRequest;
  to: CareStatus;
  grants?: SharedGrant[];
  now?: number;
}

/** Vérifie la politique AVANT d'appliquer l'acte ; refuse hors contexte. */
export function authorizeCareAction(input: CarePolicyInput): void {
  const action = ACTION_FOR[input.to];
  if (!action) throw new CareError('not_actor_action', `L’état « ${input.to} » n’est pas un acte d’opérateur.`);
  assertCan({ actor: input.actor, action, resource: resourceOf(input.request), grants: input.grants ?? [], now: input.now });
}

export interface ActInput extends CarePolicyInput {
  detail?: string;
  justification?: string;
  /** Compte rendu synthétique exigé à la clôture (§3B). */
  closingNote?: string;
}

/** Acte d'opérateur : politique d'abord, machine à états ensuite, invariant vérifié. */
export function actOnRequest(input: ActInput): CareRequest {
  if (input.to === 'rejected' && !input.justification?.trim()) {
    throw new CareError('justification_required', 'Un refus doit être motivé.');
  }
  authorizeCareAction(input);
  const next = careTransition(input.request, input.to, {
    at: input.now ?? Date.now(),
    actorId: input.actor.userId,
    reason: 'operator_action',
    detail: input.detail,
    justification: input.justification,
    closingNote: input.closingNote,
  });
  if (!checkCoupling(next.status, 'delivered')) {
    throw new CareError('coupling_violation', 'Étendue de soin incohérente avec le transport.');
  }
  return next;
}

/**
 * Couplages AUTORISÉS avec le transport (les seuls) :
 *  - soumission au moteur  → `sent`
 *  - arrivée du transport   → `received`
 * Un échec ou une attente de transport ne modifie JAMAIS le suivi de soin.
 */
export function syncTransport(request: CareRequest, transport: string, at: number): CareRequest {
  if (request.status === 'created' && ['created', 'accepted_local', 'routing', 'queued', 'delivered'].includes(transport)) {
    return careTransition(request, 'sent', { at, actorId: 'system', reason: 'transport_submit', detail: 'Confié au réseau simulé' });
  }
  if (request.status === 'sent' && transport === 'delivered') {
    return careTransition(request, 'received', {
      at,
      actorId: 'system',
      reason: 'transport_delivered',
      detail: 'Arrivée technique au destinataire — prise en charge NON confirmée',
    });
  }
  return request;
}
