import { describe, expect, it } from 'vitest';
import type { Membership } from '../core/types';
import {
  addMembership,
  createGroup,
  createOrganization,
  isGroupMember,
  membersOf,
  orgsOf,
  removeMembership,
  roleOf,
} from '../org/organization';
import { createGrant, grantsFor, revokeGrant, sharedWithOrg } from '../org/grants';

const at = 1_000;

describe('organisations', () => {
  it('crée une organisation indépendante', () => {
    const org = createOrganization({ id: 'org-1', kind: 'ngo', name: '  Solidarité Sahel  ', shortName: 'SS', createdAt: at });
    expect(org.name).toBe('Solidarité Sahel');
    expect(org.kind).toBe('ngo');
  });

  it('gère les appartenance et les rôles par organisation', () => {
    let list: Membership[] = [];
    list = addMembership(list, { userId: 'u1', orgId: 'org-a', role: 'health_agent' });
    list = addMembership(list, { userId: 'u1', orgId: 'org-b', role: 'ngo_field_agent' });
    expect(list).toHaveLength(2);
    expect(roleOf(list, 'u1', 'org-a')).toBe('health_agent');
    expect(roleOf(list, 'u1', 'org-b')).toBe('ngo_field_agent');
    expect(roleOf(list, 'u1', 'org-c')).toBeUndefined();
    expect(orgsOf(list, 'u1').map((m) => m.orgId).sort()).toEqual(['org-a', 'org-b']);
    expect(membersOf(list, 'org-a')).toHaveLength(1);
  });

  it('remplace le rôle lors d’une ré-appartenance et retire proprement', () => {
    let list = addMembership([], { userId: 'u1', orgId: 'org-a', role: 'health_agent' });
    list = addMembership(list, { userId: 'u1', orgId: 'org-a', role: 'health_center_operator' });
    expect(list).toHaveLength(1);
    expect(roleOf(list, 'u1', 'org-a')).toBe('health_center_operator');
    list = removeMembership(list, 'u1', 'org-a');
    expect(list).toHaveLength(0);
  });

  it('construit un groupe familial sans doublon de membre', () => {
    const group = createGroup({ id: 'g1', orgId: null, kind: 'family', name: 'Famille Traoré', memberIds: ['u1', 'u1', 'u2'], createdAt: at });
    expect(group.memberIds).toEqual(['u1', 'u2']);
    expect(isGroupMember(group, 'u2')).toBe(true);
    expect(isGroupMember(group, 'u3')).toBe(false);
  });
});

describe('partages entre organisations (missions communes)', () => {
  const grant = createGrant({
    id: 'gr-1',
    resourceType: 'care',
    resourceId: 'care-1',
    targetOrgId: 'org-ong',
    rights: ['read', 'respond'],
    grantedBy: 'u1',
    grantedAt: at,
    expiresAt: null,
  });

  it('refuse un partage sans aucun droit', () => {
    expect(() =>
      createGrant({ id: 'g', resourceType: 'care', resourceId: 'x', targetOrgId: 'o', rights: [], grantedBy: 'u', grantedAt: at, expiresAt: null }),
    ).toThrow();
  });

  it('ne trouve que la ressource et l’organisation listées', () => {
    expect(grantsFor([grant], 'care', 'care-1', 'org-ong', at)).toHaveLength(1);
    expect(grantsFor([grant], 'care', 'care-2', 'org-ong', at)).toHaveLength(0);
    expect(grantsFor([grant], 'care', 'care-1', 'org-autre', at)).toHaveLength(0);
    expect(sharedWithOrg([grant], 'org-ong', at)).toHaveLength(1);
    expect(sharedWithOrg([grant], 'org-csps', at)).toHaveLength(0);
  });

  it('expire à échéance et se révoque', () => {
    const dated = { ...grant, id: 'gr-2', expiresAt: at + 100 };
    expect(grantsFor([dated], 'care', 'care-1', 'org-ong', at + 200)).toHaveLength(0);
    expect(revokeGrant([grant], 'gr-1')).toHaveLength(0);
  });
});
