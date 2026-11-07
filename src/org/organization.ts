import type { Group, GroupKind, Membership, Organization, OrgKind, Role } from '../core/types';

/** Organisations, appartenance et groupes — fonctions pures (aucune UI). */

export function createOrganization(input: {
  id: string;
  kind: OrgKind;
  name: string;
  shortName: string;
  createdAt: number;
}): Organization {
  return { id: input.id, kind: input.kind, name: input.name.trim(), shortName: input.shortName.trim(), createdAt: input.createdAt };
}

export function addMembership(list: Membership[], m: Omit<Membership, 'joinedAt'> & { joinedAt?: number }): Membership[] {
  const filtered = list.filter((x) => !(x.userId === m.userId && x.orgId === m.orgId));
  return [...filtered, { joinedAt: Date.now(), ...m } as Membership];
}

export function removeMembership(list: Membership[], userId: string, orgId: string): Membership[] {
  return list.filter((x) => !(x.userId === userId && x.orgId === orgId));
}

export function membersOf(list: Membership[], orgId: string): Membership[] {
  return list.filter((m) => m.orgId === orgId);
}

export function orgsOf(list: Membership[], userId: string): Membership[] {
  return list.filter((m) => m.userId === userId);
}

/** Rôle de l'utilisateur dans l'organisation ; undefined si non membre. */
export function roleOf(list: Membership[], userId: string, orgId: string): Role | undefined {
  return list.find((m) => m.userId === userId && m.orgId === orgId)?.role;
}

export function createGroup(input: {
  id: string;
  orgId: string | null;
  kind: GroupKind;
  name: string;
  memberIds: string[];
  createdAt: number;
}): Group {
  return { ...input, name: input.name.trim(), memberIds: [...new Set(input.memberIds)] };
}

export function groupsFor(groups: Group[], userId: string): Group[] {
  return groups.filter((g) => g.memberIds.includes(userId));
}

export function isGroupMember(group: Group, userId: string): boolean {
  return group.memberIds.includes(userId);
}
