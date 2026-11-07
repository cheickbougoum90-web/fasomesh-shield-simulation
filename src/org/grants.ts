import type { SharedGrant, SharedResourceType, SharedRight } from '../core/types';

/**
 * Partage inter-organisations (missions communes).
 *
 * Règle : une organisation ne voit QUE la ressource littéralement listée ici.
 * La participation à une mission commune n'ouvre aucun accès aux conversations
 * privées, aux membres ni aux données internes de l'organisation partenaire.
 */

export function createGrant(input: {
  id: string;
  resourceType: SharedResourceType;
  resourceId: string;
  targetOrgId: string;
  rights: SharedRight[];
  grantedBy: string;
  grantedAt: number;
  expiresAt: number | null;
}): SharedGrant {
  if (input.rights.length === 0) throw new Error('Un partage doit autoriser au moins un droit.');
  return { ...input, rights: [...new Set(input.rights)] };
}

export function revokeGrant(list: SharedGrant[], id: string): SharedGrant[] {
  return list.filter((g) => g.id !== id);
}

export function grantsFor(
  list: SharedGrant[],
  resourceType: SharedResourceType,
  resourceId: string,
  targetOrgId: string,
  now: number,
): SharedGrant[] {
  return list.filter(
    (g) =>
      g.resourceType === resourceType &&
      g.resourceId === resourceId &&
      g.targetOrgId === targetOrgId &&
      (g.expiresAt === null || g.expiresAt > now),
  );
}

export function sharedWithOrg(list: SharedGrant[], orgId: string, now: number): SharedGrant[] {
  return list.filter((g) => g.targetOrgId === orgId && (g.expiresAt === null || g.expiresAt > now));
}
