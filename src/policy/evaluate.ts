import type { SharedGrant, SharedRight } from '../core/types';
import { INBOX_ACTIONS, ORG_ACTIONS, ROLE_GRANTS, SELF_ACTIONS } from './catalog';
import type { Actor, Decision, PolicyInput, ResourceRef } from './types';

/** Évaluation pure d'une permission. `enforce()` y ajoute le journal d'accès. */

function rolesInContext(actor: Actor) {
  const set = new Set(actor.roles);
  if (actor.activeOrgId) {
    for (const m of actor.memberships) if (m.orgId === actor.activeOrgId) set.add(m.role);
  }
  return set;
}

function rightFor(action: string): SharedRight {
  return action === 'care.respond' ? 'respond' : 'read';
}

function grantFor(
  grants: SharedGrant[],
  resource: ResourceRef | undefined,
  orgId: string | null,
  action: string,
  now: number,
): SharedGrant | null {
  if (!resource || !orgId || !resource.id) return null;
  const right = rightFor(action);
  return (
    grants.find(
      (g) =>
        g.resourceType === resource.type &&
        g.resourceId === resource.id &&
        g.targetOrgId === orgId &&
        g.rights.includes(right) &&
        (g.expiresAt === null || g.expiresAt > now),
    ) ?? null
  );
}

const DENY_REASON: Record<string, string> = {
  no_actor: 'Aucun acteur identifié : refus par défaut.',
  role_missing: 'Le rôle actif ne possède pas cette permission.',
  context_required: 'Aucune organisation active pour cette opération.',
  not_owner: 'La ressource appartient à un autre utilisateur.',
  org_mismatch: 'La ressource appartient à une autre organisation.',
  no_grant: 'Aucun partage explicite ne couvre cette ressource.',
};

export function evaluate(input: PolicyInput): Decision {
  const { actor, action, resource, grants = [] } = input;
  const now = input.now ?? Date.now();

  if (!actor) return { allowed: false, code: 'no_actor', reason: DENY_REASON.no_actor };

  // 0. Une opération organisationnelle exige un contexte actif : sans
  //    organisation sélectionnée, aucun droit organisationnel n'est évaluable.
  if (ORG_ACTIONS.includes(action) && !actor.activeOrgId) {
    return { allowed: false, code: 'context_required', reason: DENY_REASON.context_required };
  }

  const roles = rolesInContext(actor);
  const granted = [...roles].some((r) => ROLE_GRANTS[r].includes(action));

  // 1. Droit de rôle, ou partage explicite couvrant la ressource.
  if (!granted) {
    const viaGrant = grantFor(grants, resource, actor.activeOrgId, action, now);
    if (viaGrant) return { allowed: true, code: 'allow', reason: 'Partage explicite entre organisations.', via: 'grant' };
    return { allowed: false, code: 'role_missing', reason: DENY_REASON.role_missing };
  }

  // 2. Ressources personnelles : uniquement le propriétaire.
  if (SELF_ACTIONS.includes(action) && resource) {
    const mine =
      !resource.ownerId || resource.ownerId === actor.userId || !!resource.participantIds?.includes(actor.userId);
    if (!mine) return { allowed: false, code: 'not_owner', reason: DENY_REASON.not_owner };
  }

  // 3. Périmètre organisationnel.
  if (ORG_ACTIONS.includes(action)) {
    // Boîte de réception : la ressource est adressée à MON organisation,
    // même si elle en provient d'une autre (c'est le cas normal d'une demande
    // CSPS → centre de référence).
    const inbox = INBOX_ACTIONS.includes(action);
    const foreignOwner = !inbox && !!resource?.orgId && resource.orgId !== actor.activeOrgId;
    const foreignTarget =
      inbox
        ? !resource?.targetOrgId || resource.targetOrgId !== actor.activeOrgId
        // Côté émetteur, la propriété se juge sur l’organisation d’ORIGINE :
        // la destination (autre établissement) ne retire pas à l’émetteur l’accès
        // à sa propre ressource. À défaut d’organisation d’origine, la destination
        // reste le seul ancrage possible.
        : !resource?.orgId && !!resource?.targetOrgId && resource.targetOrgId !== actor.activeOrgId;
    if (foreignOwner || foreignTarget) {
      const viaGrant = grantFor(grants, resource, actor.activeOrgId, action, now);
      if (viaGrant) return { allowed: true, code: 'allow', reason: 'Partage explicite entre organisations.', via: 'grant' };
      return { allowed: false, code: 'org_mismatch', reason: DENY_REASON.org_mismatch };
    }
  }

  return { allowed: true, code: 'allow', reason: 'Permission accordée par le rôle actif.', via: 'role' };
}

export function can(input: PolicyInput): boolean {
  return evaluate(input).allowed;
}

/**
 * Capacité d’ouverture de la BOÎTE DE RÉCEPTION d’un acteur pour SON propre
 * établissement (affichage : entrée « Centre » du menu et écran dédié).
 *
 * `care.readInbox` et `care.respond` sont des actions d’ADRESSE : évaluées
 * sans ressource, elles sont toujours refusées (aucune destination à juger).
 * On probe donc avec un dossier hypothétique adressé à l’organisation active
 * et émis par un autre établissement. Cette sonde ne sert qu’à l’affichage :
 * chaque opération réelle est assurée par `assertCan` avec la vraie ressource.
 */
export function canOpenInbox(input: { actor: Actor | null; grants?: SharedGrant[] }): boolean {
  const { actor } = input;
  const orgId = actor?.activeOrgId;
  if (!actor || !orgId) return false;
  return can({
    actor,
    action: 'care.respond',
    resource: { type: 'care', id: 'sonde-menu', orgId: 'autre-etablissement', targetOrgId: orgId },
    grants: input.grants ?? [],
  });
}

/* ── Journal d'accès (opérations sensibles) ─────────────────────────── */

export interface AccessEntry {
  seq: number;
  at: number;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  allowed: boolean;
  code: string;
}

let seq = 0;
const LOG_MAX = 200;
let log: AccessEntry[] = [];

export function accessLog(): AccessEntry[] {
  return log;
}

export function clearAccessLog(): void {
  log = [];
  seq = 0;
}

/** Évalue ET journalise (utilisé par le store et les services). */
export function enforce(input: PolicyInput): Decision {
  const decision = evaluate(input);
  log = [
    {
      seq: ++seq,
      at: input.now ?? Date.now(),
      actorId: input.actor?.userId ?? null,
      action: input.action,
      resourceType: input.resource?.type ?? null,
      resourceId: input.resource?.id ?? null,
      allowed: decision.allowed,
      code: decision.code,
    },
    ...log,
  ].slice(0, LOG_MAX);
  return decision;
}

export class PolicyDeniedError extends Error {
  readonly code: string;
  constructor(decision: Decision, action: string) {
    super(`Opération refusée (${action}) : ${decision.reason}`);
    this.name = 'PolicyDeniedError';
    this.code = decision.code;
  }
}

/** Passe ou lève — à appeler en tête de chaque service sensible. */
export function assertCan(input: PolicyInput): void {
  const decision = enforce(input);
  if (!decision.allowed) throw new PolicyDeniedError(decision, input.action);
}
