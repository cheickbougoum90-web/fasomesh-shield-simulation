import { beforeEach, describe, expect, it } from 'vitest';
import type { Membership, Role, SharedGrant } from '../core/types';

const as = (...roles: Role[]): Role[] => roles;
import { ACTION_LABEL, ALL_PERM_ACTIONS, ROLE_GRANTS } from '../policy/catalog';
import {
  PolicyDeniedError,
  accessLog,
  assertCan,
  can,
  clearAccessLog,
  enforce,
  evaluate,
} from '../policy/evaluate';
import { effectiveRoles, switchContext } from '../policy/context';
import { can as legacyCan, ALL_ACTIONS } from '../domain/permissions';

/**
 * Tests de la couche de politique — effectués DIRECTEMENT sur la politique
 * et les services, sans passer par l'interface (cahier des charges §Définition
 * de « terminé »).
 */

const now = 1_000_000;
const memberships: Membership[] = [
  { userId: 'u_agent', orgId: 'org-csps', role: 'health_agent', joinedAt: now },
  { userId: 'u_centre', orgId: 'org-centre', role: 'health_center_operator', joinedAt: now },
  { userId: 'u_ong', orgId: 'org-ong-a', role: 'ngo_coordinator', joinedAt: now },
  { userId: 'u_multi', orgId: 'org-csps', role: 'health_agent', joinedAt: now },
  { userId: 'u_multi', orgId: 'org-ong-a', role: 'ngo_field_agent', joinedAt: now },
  { userId: 'u_admin', orgId: 'org-admin', role: 'system_admin', joinedAt: now },
  { userId: 'u_citoyen', orgId: 'org-famille', role: 'citizen', joinedAt: now },
];

const citizen = { userId: 'u_citoyen', roles: as('citizen'), memberships, activeOrgId: 'org-famille' };
const agent = { userId: 'u_agent', roles: as('citizen'), memberships, activeOrgId: 'org-csps' };
const centre = { userId: 'u_centre', roles: as(), memberships, activeOrgId: 'org-centre' };

describe('politique : défense par défaut', () => {
  it('refuse tout quand il n’y a pas d’acteur', () => {
    expect(can({ actor: null, action: 'message.send' })).toBe(false);
    expect(evaluate({ actor: null, action: 'network.view' }).code).toBe('no_actor');
  });

  it('refuse une permission que le rôle ne possède pas', () => {
    expect(can({ actor: { ...citizen }, action: 'sim.control' })).toBe(false);
    expect(can({ actor: { ...citizen }, action: 'account.write' })).toBe(false);
  });
});

describe('scénario H — un citoyen ne lit pas les demandes médicales d’un CSPS', () => {
  const demand = { type: 'care' as const, id: 'care-1', orgId: 'org-csps', targetOrgId: 'org-centre' };

  it('refuse la lecture de la demande (rôle et organisation)', () => {
    for (const action of ['care.readOrg', 'care.readInbox', 'care.respond'] as const) {
      expect(can({ actor: { ...citizen }, action, resource: demand })).toBe(false);
    }
    const d = evaluate({ actor: { ...citizen }, action: 'care.readInbox', resource: demand });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('role_missing');
  });

  it('le centre traite une demande qui lui est ADRESSÉE, même venue d’un autre établissement', () => {
    expect(can({ actor: centre, action: 'care.respond', resource: demand, grants: [] })).toBe(true);
    expect(evaluate({ actor: centre, action: 'care.respond', resource: demand }).code).toBe('allow');
  });

  it('un établissement non destinataire ne peut pas y répondre', () => {
    const stranger = { userId: 'u_hopital', roles: as('hospital_operator'), memberships, activeOrgId: 'org-hopital' };
    expect(can({ actor: stranger, action: 'care.respond', resource: demand })).toBe(false);
    expect(evaluate({ actor: stranger, action: 'care.respond', resource: demand }).code).toBe('org_mismatch');
  });

  it('journalise le refus', () => {
    clearAccessLog();
    enforce({ actor: { ...citizen }, action: 'care.readInbox', resource: demand });
    const entry = accessLog()[0];
    expect(entry.allowed).toBe(false);
    expect(entry.code).toBe('role_missing');
    expect(entry.actorId).toBe('u_citoyen');
  });
});

describe('isolation entre organisations', () => {
  it('un agent d’un CSPS ne voit pas les ressources d’un autre établissement', () => {
    const other = { type: 'care' as const, id: 'care-2', orgId: 'org-autre-csps' };
    expect(can({ actor: agent, action: 'care.readOrg', resource: other })).toBe(false);
    expect(evaluate({ actor: agent, action: 'care.readOrg', resource: other }).code).toBe('org_mismatch');
  });

  it('voit celles de SON établissement', () => {
    const own = { type: 'care' as const, id: 'care-3', orgId: 'org-csps' };
    expect(can({ actor: agent, action: 'care.readOrg', resource: own })).toBe(true);
  });

  it('refuse une organisation que l’utilisateur ne rejoint pas', () => {
    expect(() => switchContext(agent, 'org-inconnue')).toThrow(/pas membre/);
  });
});

describe('scénario I (préliminaire) — changement de contexte', () => {
  const multi = { userId: 'u_multi', roles: as('citizen'), memberships, activeOrgId: null };

  it('en contexte personnel, aucune permission organisationnelle', () => {
    expect(can({ actor: multi, action: 'care.create' })).toBe(true); // rôle global citoyen
    expect(can({ actor: multi, action: 'ngo.mission.read' })).toBe(false);
    expect(evaluate({ actor: multi, action: 'ngo.mission.read' }).code).toBe('context_required');
  });

  it('le contexte ONG ouvre les droits ONG, plus aucun droit du CSPS', () => {
    const inOng = switchContext(multi, 'org-ong-a');
    expect(effectiveRoles(inOng)).toContain('ngo_field_agent');
    expect(can({ actor: inOng, action: 'ngo.mission.read', resource: { type: 'mission', id: 'm1', orgId: 'org-ong-a' } })).toBe(true);
    expect(can({ actor: inOng, action: 'care.readOrg', resource: { type: 'care', id: 'c1', orgId: 'org-csps' } })).toBe(false);
  });

  it('le contexte CSPS ouvre les droits CSPS, plus aucun droit ONG', () => {
    const inCsps = switchContext(multi, 'org-csps');
    expect(can({ actor: inCsps, action: 'care.create' })).toBe(true);
    expect(can({ actor: inCsps, action: 'ngo.mission.read', resource: { type: 'mission', id: 'm1', orgId: 'org-ong-a' } })).toBe(false);
    expect(can({ actor: inCsps, action: 'ngo.report.write', resource: { type: 'report', id: 'r1', orgId: 'org-ong-a' } })).toBe(false);
  });
});

describe('moindre privilège : l’administrateur', () => {
  const admin = { userId: 'u_admin', roles: as('system_admin'), memberships, activeOrgId: 'org-admin' };

  it('gère les comptes et la configuration', () => {
    expect(can({ actor: admin, action: 'account.write' })).toBe(true);
    expect(can({ actor: admin, action: 'org.manage' })).toBe(true);
    expect(can({ actor: admin, action: 'config.write' })).toBe(true);
  });

  it('ne lit JAMAIS le contenu des conversations privées', () => {
    const conv = { type: 'message' as const, id: 'cv_1', ownerId: 'u_autre' };
    expect(can({ actor: admin, action: 'message.readOwn', resource: conv })).toBe(false);
    expect(can({ actor: admin, action: 'message.readOrg', resource: conv })).toBe(false);
    expect(can({ actor: admin, action: 'alert.read' })).toBe(false);
  });

  it('ne contrôle pas le réseau (c’est le rôle opérateur Hub)', () => {
    expect(can({ actor: admin, action: 'sim.control' })).toBe(false);
    expect(can({ actor: admin, action: 'network.toggleHub' })).toBe(false);
  });
});

describe('ressources personnelles', () => {
  it('ne lit que SES conversations', () => {
    const mine = { type: 'message' as const, id: 'cv_mine', ownerId: 'u_citoyen' };
    const theirs = { type: 'message' as const, id: 'cv_autre', ownerId: 'u_autre' };
    expect(can({ actor: citizen, action: 'message.readOwn', resource: mine })).toBe(true);
    expect(can({ actor: citizen, action: 'message.readOwn', resource: theirs })).toBe(false);
    expect(evaluate({ actor: citizen, action: 'message.readOwn', resource: theirs }).code).toBe('not_owner');
  });

  it('un participant à une conversation peut la lire', () => {
    const shared = { type: 'message' as const, id: 'cv_x', ownerId: 'u_autre', participantIds: ['u_autre', 'u_citoyen'] };
    expect(can({ actor: citizen, action: 'message.readOwn', resource: shared })).toBe(true);
  });
});

describe('missions communes : partage explicite uniquement', () => {
  const grant: SharedGrant = {
    id: 'gr-1',
    resourceType: 'care',
    resourceId: 'care-partagee',
    targetOrgId: 'org-ong-a',
    rights: ['read'],
    grantedBy: 'u_agent',
    grantedAt: now,
    expiresAt: now + 10_000,
  };

  it('ouvre la ressource listée, et elle seule', () => {
    const resource = { type: 'care' as const, id: 'care-partagee', orgId: 'org-csps' };
    const actor = { ...{ userId: 'u_ong', roles: as('ngo_field_agent'), memberships, activeOrgId: 'org-ong-a' } };
    expect(can({ actor, action: 'care.readOrg', resource, grants: [grant], now: now + 1 })).toBe(true);

    const autre = { type: 'care' as const, id: 'care-secrete', orgId: 'org-csps' };
    expect(can({ actor, action: 'care.readOrg', resource: autre, grants: [grant], now: now + 1 })).toBe(false);
    expect(can({ actor, action: 'care.respond', resource, grants: [grant], now: now + 1 })).toBe(false);
  });

  it('expire au-delà de l’échéance', () => {
    const resource = { type: 'care' as const, id: 'care-partagee', orgId: 'org-csps' };
    const actor = { userId: 'u_ong', roles: as('ngo_field_agent'), memberships, activeOrgId: 'org-ong-a' };
    expect(can({ actor, action: 'care.readOrg', resource, grants: [grant], now: now + 20_000 })).toBe(false);
  });

  it('ne donne aucun accès aux membres ni aux conversations de la partenaire', () => {
    const actor = { userId: 'u_ong', roles: as('ngo_coordinator'), memberships, activeOrgId: 'org-ong-a' };
    expect(can({ actor, action: 'org.members.read', resource: { type: 'org', id: 'org-csps', orgId: 'org-csps' }, grants: [grant] })).toBe(false);
    expect(can({ actor, action: 'message.readOrg', resource: { type: 'message', id: 'cv_csps', orgId: 'org-csps' }, grants: [grant] })).toBe(false);
  });
});

describe('assertCan', () => {
  it('laisse passer une opération autorisée', () => {
    expect(() => assertCan({ actor: citizen, action: 'message.send' })).not.toThrow();
  });

  it('lève PolicyDeniedError sur un refus', () => {
    expect(() => assertCan({ actor: citizen, action: 'sim.control' })).toThrow(PolicyDeniedError);
  });
});

describe('cohérence avec la matrice historique', () => {
  beforeEach(() => clearAccessLog());

  it('policy reproduit exactement can() legacy pour citizen et operator', () => {
    const citizenActor = { userId: 'u1', roles: as('citizen'), memberships: [], activeOrgId: null };
    const operatorActor = { userId: 'u2', roles: as('operator'), memberships: [], activeOrgId: null };
    for (const action of ALL_ACTIONS) {
      expect(can({ actor: citizenActor, action })).toBe(legacyCan('citizen', action));
      expect(can({ actor: operatorActor, action })).toBe(legacyCan('operator', action));
    }
  });

  it('étiquette toutes les permissions et attribue chaque rôle', () => {
    for (const a of ALL_PERM_ACTIONS) expect(ACTION_LABEL[a]).toBeTruthy();
    for (const grants of Object.values(ROLE_GRANTS)) expect(grants.length).toBeGreaterThan(0);
  });

  it('l’administrateur ne dispose d’aucune permission de lecture de contenu', () => {
    const contenu = ['message.readOwn', 'message.readOrg', 'alert.read', 'care.readInbox'] as const;
    for (const a of contenu) expect(ROLE_GRANTS.system_admin).not.toContain(a);
  });
});
