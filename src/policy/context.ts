import type { Membership, Role, User } from '../core/types';
import type { Actor } from './types';

/** Construction d'acteur et changement de contexte organisationnel. */

export function makeActor(user: User, memberships: Membership[], activeOrgId: string | null = null): Actor {
  // Rétrocompatibilité : un compte enregistré avant l'arrivée de `roles`
  // n'a pas de champ `roles` (on retombe sur `role`). Un tableau VIDE est
  // volontaire : ce compte n'a aucun rôle global, seulement ses rôles d'organisation.
  const roles = Array.isArray(user.roles) ? user.roles : user.role ? [user.role] : [];
  return {
    userId: user.id,
    roles: [...roles],
    memberships: memberships.filter((m) => m.userId === user.id),
    activeOrgId,
  };
}

export function isMemberOf(actor: Actor, orgId: string): boolean {
  return actor.memberships.some((m) => m.orgId === orgId);
}

export function roleIn(actor: Actor, orgId: string): Role | undefined {
  return actor.memberships.find((m) => m.orgId === orgId)?.role;
}

/**
 * Changement de contexte : EXPLICITE et total.
 * Le nouvel acteur ne porte que l'appartenance de l'organisation choisie ;
 * aucun droit du contexte précédent n'est conservé (les rôles globaux du
 * compte restent, ce sont ceux du compte, pas du contexte).
 */
export function switchContext(actor: Actor, orgId: string | null): Actor {
  if (orgId !== null && !isMemberOf(actor, orgId)) {
    throw new Error('Changement de contexte refusé : l’utilisateur n’est pas membre de cette organisation.');
  }
  return { ...actor, activeOrgId: orgId };
}

/** Rôles effectifs dans le contexte actif (globaux + rôle de l'organisation). */
export function effectiveRoles(actor: Actor): Role[] {
  const set = new Set(actor.roles);
  if (actor.activeOrgId) {
    for (const m of actor.memberships) if (m.orgId === actor.activeOrgId) set.add(m.role);
  }
  return [...set];
}
