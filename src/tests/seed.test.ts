// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, hashPassword } from '../infra/crypto';
import { SEED_VERSION, buildSeed } from '../infra/seedData';

/**
 * §10 — Données de démonstration : comptes imposés, organisations
 * indépendantes, rôles par organisation, groupes, et cohérence des nœuds.
 */

const REQUIRED_LOGINS = [
  'citoyen1',
  'citoyen2',
  'agent_csps',
  'agent_centre_reference',
  'agent_hopital',
  'agent_ong',
  'coordinateur_ong',
  'operateur_hub',
  'administrateur',
  'multi_roles',
];

describe('jeu de démonstration', () => {
  it('crée les 10 comptes imposés, tous connectables avec le mot de passe documenté', async () => {
    const seed = await buildSeed();
    expect(seed.seedVersion).toBe(SEED_VERSION);
    for (const login of REQUIRED_LOGINS) {
      const user = seed.users.find((u) => u.displayName === login);
      expect(user, `compte manquant : ${login}`).toBeTruthy();
      const hash = await hashPassword(DEMO_PASSWORD, user!.salt);
      expect(hash).toBe(user!.passwordHash);
      expect(hash).not.toContain(DEMO_PASSWORD);
      expect(hash.startsWith('insecure:')).toBe(false);
    }
    expect(new Set(seed.users.map((u) => u.id)).size).toBe(seed.users.length);
  });

  it('attributionne un rôle d’organisation cohérent à chacun', async () => {
    const seed = await buildSeed();
    const roleOf = (login: string, orgId: string) =>
      (seed.memberships ?? []).find(
        (m) => m.orgId === orgId && m.userId === seed.users.find((u) => u.displayName === login)?.id,
      )?.role;

    expect(roleOf('agent_csps', 'org-csps')).toBe('health_agent');
    expect(roleOf('agent_centre_reference', 'org-centre')).toBe('health_center_operator');
    expect(roleOf('agent_hopital', 'org-hopital')).toBe('hospital_operator');
    expect(roleOf('coordinateur_ong', 'org-ong-1')).toBe('ngo_coordinator');
    expect(roleOf('agent_ong', 'org-ong-1')).toBe('ngo_field_agent');
    expect(roleOf('operateur_hub', 'org-hub')).toBe('operator');
    expect(roleOf('administrateur', 'org-admin')).toBe('system_admin');
  });

  it('porte un compte multi-rôles dans deux organisations indépendantes', async () => {
    const seed = await buildSeed();
    const user = seed.users.find((u) => u.displayName === 'multi_roles')!;
    expect(user.roles).toEqual(expect.arrayContaining(['citizen', 'system_admin']));
    const mine = (seed.memberships ?? []).filter((m) => m.userId === user.id);
    expect(new Set(mine.map((m) => m.orgId))).toEqual(new Set(['org-csps', 'org-ong-2']));
    expect(new Set(mine.map((m) => m.role)).size).toBe(2);
  });

  it('sépare les organisations et fournit les groupes', async () => {
    const seed = await buildSeed();
    // Ces champs sont optionnels dans le schéma persisté (anciennes versions)
    // mais toujours remplis par le jeu de démonstration courant.
    const orgs = seed.organizations ?? [];
    const members = seed.memberships ?? [];
    const groups = seed.groups ?? [];
    expect(orgs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(orgs.map((o) => o.id)).size).toBe(orgs.length);
    // Deux ONG distinctes : aucun membre n'appartient aux deux.
    const ong1 = members.filter((m) => m.orgId === 'org-ong-1').map((m) => m.userId);
    const ong2 = members.filter((m) => m.orgId === 'org-ong-2').map((m) => m.userId);
    expect(ong1.filter((id) => ong2.includes(id))).toEqual([]);
    expect(groups.map((g) => g.kind).sort()).toEqual(['family', 'team']);
    expect(groups.find((g) => g.kind === 'family')!.memberIds.length).toBeGreaterThanOrEqual(2);
  });

  it('relie chaque compte à un nœud existant du graphe', async () => {
    const seed = await buildSeed();
    const nodeIds = new Set(seed.nodes.map((n) => n.id));
    for (const u of seed.users) expect(nodeIds.has(u.nodeId), `nœud absent : ${u.nodeId}`).toBe(true);
    expect(seed.nodes.length).toBe(13);
    expect(seed.links.length).toBeGreaterThanOrEqual(17);
  });
});
