// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { engine, useApp } from '../app/store';
import { can, makeActor } from '../policy';
import { CARE_LABEL } from '../domain/care';

/**
 * Exécution des scénarios du cahier des charges (§11) sur les VRAIES couches :
 * store → politique → services → moteur Mesh → machines à états.
 * Aucun mock : un échec de transport ou un refus casse l'assertion.
 */

const PWD = 'fasomesh';

async function boot() {
  await useApp.getState().boot();
}

function userBy(login: string) {
  const u = useApp.getState().users.find((x) => x.displayName === login);
  if (!u) throw new Error(`compte absent du jeu de démo : ${login}`);
  return u;
}

async function login(name: string) {
  const result = await useApp.getState().login(name, PWD);
  if (!result.ok) throw new Error(`connexion impossible : ${result.errors.join(' / ')}`);
  return userBy(name);
}

/** Fait tourner le moteur jusqu'à stabilisation des transmissions. */
function run(ms = 45_000) {
  for (let t = 0; t < ms; t += 500) engine.advance(500);
}

function deliveryOf(messageId: string) {
  const s = useApp.getState();
  const message = s.messages.find((m) => m.id === messageId);
  if (!message) throw new Error('message introuvable');
  return s.deliveries[message.deliveryId];
}

beforeEach(async () => {
  await boot();
});

describe('Scénario A — message citoyen → famille via plusieurs relais', () => {
  it('PASS : acheminé multi-sauts jusqu’au destinataire', async () => {
    const me = await login('citoyen1');
    const peer = userBy('citoyen2');
    const result = await useApp.getState().sendMessage(peer.id, 'Tu es où pour le marché ?');
    expect(result.ok).toBe(true);
    run();

    const message = useApp.getState().messages.find((m) => m.senderId === me.id && m.recipientId === peer.id)!;
    const record = deliveryOf(message.id);
    expect(record.status).toBe('delivered');
    // Plusieurs sauts, dont un relais : la route n'est pas triviale.
    expect(record.hops.length).toBeGreaterThanOrEqual(2);
    expect(record.hops.some((h) => h.toNodeId.startsWith('relay-'))).toBe(true);
    expect(record.events.map((e) => e.to)).toContain('delivered');
    expect(useApp.getState().messages.filter((m) => m.id === message.id)).toHaveLength(1);
  });
});

describe('Scénario B — alerte critique citoyen → Hub, traitée par l’opérateur', () => {
  it('PASS : transport jusqu’au Hub puis prise en charge par l’opérateur', async () => {
    await login('citoyen1');
    const raised = await useApp.getState().raiseAlert({
      title: 'Feu de brousse',
      body: 'Flammes près des habitations du quartier Nord.',
      priority: 'critical',
    });
    expect(raised.ok).toBe(true);
    run();

    const alert = useApp.getState().alerts.find((a) => a.title === 'Feu de brousse')!;
    expect(useApp.getState().deliveries[alert.deliveryId].status).toBe('delivered');

    const operator = await login('operateur_hub');
    expect(useApp.getState().activeOrgId).toBe('org-hub');
    expect(useApp.getState().setAlertCategory(alert.id, 'medical').ok).toBe(true);
    useApp.getState().acknowledgeAlert(alert.id);

    const after = useApp.getState().alerts.find((a) => a.id === alert.id)!;
    expect(after.category).toBe('medical');
    expect(after.acknowledgedBy).toContain(operator.id);
  });
});

describe('Scénario C — CSPS → centre de référence : demande, confirmation, réponse', () => {
  it('PASS : cycle complet CREATED → … → RESOLVED', async () => {
    await login('agent_csps');
    expect(useApp.getState().activeOrgId).toBe('org-csps');

    const created = useApp.getState().createCareRequest({
      type: 'maternity',
      priority: 'critical',
      description: 'Contractions rapprochées, accouchement imminent.',
      location: 'CSPS de Kongou',
      desiredDestination: 'Centre de référence de Banfora',
      complementary: 'Route impraticable après la pluie.',
      targetOrgId: 'org-centre',
    });
    expect(created.ok).toBe(true);

    let request = useApp.getState().careRequests[0];
    expect(request.caseRef).toMatch(/^DOS-\d{4}-\d{4}$/);
    expect(request.status).toBe('sent');

    run();
    request = useApp.getState().careRequests[0];
    expect(request.status).toBe('received'); // arrivée technique, prise en charge NON confirmée

    await login('agent_centre_reference');
    expect(useApp.getState().activeOrgId).toBe('org-centre');
    for (const to of ['acknowledged', 'accepted', 'in_progress', 'resolved'] as const) {
      const step = useApp.getState().careAction(request.id, to);
      expect(step.ok, `étape ${to} refusée : ${step.ok ? '' : step.errors.join('/')}`).toBe(true);
    }
    const final = useApp.getState().careRequests[0];
    expect(final.status).toBe('resolved');
    expect(final.events.map((e) => e.to)).toEqual([
      'created',
      'sent',
      'received',
      'acknowledged',
      'accepted',
      'in_progress',
      'resolved',
    ]);
    expect(CARE_LABEL[final.status]).toBe('Clôturée');
    expect(JSON.stringify(final).toLowerCase()).not.toContain('patient');
  });

  it('PASS : un refus exige une justification', async () => {
    await login('agent_csps');
    useApp.getState().createCareRequest({
      type: 'trauma',
      priority: 'urgent',
      description: 'Fracture ouverte, transfert nécessaire.',
      location: 'CSPS de Kongou',
      desiredDestination: 'Centre de référence de Banfora',
      complementary: '',
      targetOrgId: 'org-centre',
    });
    run();
    await login('agent_centre_reference');
    const id = useApp.getState().careRequests[0].id;
    expect(useApp.getState().careAction(id, 'acknowledged').ok).toBe(true);
    expect(useApp.getState().careAction(id, 'rejected').ok).toBe(false);
    expect(useApp.getState().careAction(id, 'rejected', 'Capacité saturée').ok).toBe(true);
    expect(useApp.getState().careRequests[0].justification).toBe('Capacité saturée');
  });
});

describe('Scénario F — panne du Hub : le local continue, les messages vers le Hub attendent', () => {
  it('PASS : envoi local livré malgré la panne, envoi vers Hub en attente puis repris', async () => {
    await login('citoyen1');
    const peer = userBy('citoyen2');
    useApp.getState().toggleHub();
    expect(useApp.getState().nodes.find((n) => n.kind === 'hub')!.status).toBe('offline');

    const before = useApp.getState().messages.length;
    expect((await useApp.getState().sendMessage(peer.id, 'Local malgré la panne')).ok).toBe(true);
    run(15_000);
    const local = useApp.getState().messages[before];
    expect(deliveryOf(local.id).status).toBe('delivered');

    // Alerte destinée au Hub : sans route elle ATTEND (« en attente de réseau »),
    // jamais « reçue ». La grâce de 30 s n'est pas encore écoulée ici.
    expect(
      (await useApp.getState().raiseAlert({ title: 'Alerte pendant panne', body: 'Vérifier le Hub.', priority: 'urgent' })).ok,
    ).toBe(true);
    run(20_000);
    const alert = useApp.getState().alerts.find((a) => a.title === 'Alerte pendant panne')!;
    const waiting = useApp.getState().deliveries[alert.deliveryId];
    expect(waiting.status).toBe('queued');
    expect(waiting.status).not.toBe('delivered');

    // Rétablissement : reprise automatique de la file.
    useApp.getState().restoreNetwork();
    run(30_000);
    expect(useApp.getState().deliveries[alert.deliveryId].status).toBe('delivered');
  });
});

describe('Scénario G — absence de route : attente puis reprise sans doublon', () => {
  it('PASS : mis en attente, repris automatiquement, un seul exemplaire', async () => {
    await login('citoyen1');
    const peer = userBy('citoyen2');

    // Isole le destinataire : TOUS ses liens coupés.
    const mine = useApp.getState().links.filter((l) => l.aNodeId === peer.nodeId || l.bNodeId === peer.nodeId);
    expect(mine.length).toBeGreaterThan(0);
    for (const l of mine) useApp.getState().setLinkStatus(l.id, 'down');

    const before = useApp.getState().messages.length;
    expect((await useApp.getState().sendMessage(peer.id, 'Bloqué puis repris')).ok).toBe(true);
    run();
    const message = useApp.getState().messages[before];
    expect(deliveryOf(message.id).status).not.toBe('delivered');
    expect(['queued', 'unconfirmed', 'failed', 'created', 'accepted_local', 'routing']).toContain(
      deliveryOf(message.id).status,
    );

    useApp.getState().restoreNetwork();
    run(70_000);
    expect(deliveryOf(message.id).status).toBe('delivered');
    // Déduplication : un seul exemplaire dans l'état applicatif.
    expect(useApp.getState().messages.filter((m) => m.id === message.id)).toHaveLength(1);
  });
});

describe('Scénario H — un citoyen ne lit pas les demandes médicales d’un CSPS', () => {
  it('PASS : refus directement sur la couche de politique et à l’écran', async () => {
    await login('citoyen1');
    const actor = makeActor(userBy('citoyen1'), useApp.getState().memberships, useApp.getState().activeOrgId);
    const demand = { type: 'care' as const, id: 'care-x', orgId: 'org-csps', targetOrgId: 'org-centre' };
    for (const action of ['care.readOrg', 'care.readInbox', 'care.respond'] as const) {
      expect(can({ actor, action, resource: demand }), action).toBe(false);
    }
    // Même règle côté affichage : rien n’est listé pour le citoyen.
    const visible = useApp.getState().careRequests.filter((r) =>
      can({
        actor,
        action: 'care.readInbox',
        resource: { type: 'care', id: r.id, orgId: r.orgId, targetOrgId: r.targetOrgId ?? undefined },
      }),
    );
    expect(visible).toHaveLength(0);
  });
});

describe('Scénario I — multi-rôles : changement de contexte sans mélange', () => {
  it('PASS : deux organisations, un rôle différent, aucun droit résiduel', async () => {
    const user = await login('multi_roles');
    const memberships = useApp.getState().memberships.filter((m) => m.userId === user.id);
    expect(memberships.map((m) => m.orgId).sort()).toEqual(['org-csps', 'org-ong-2']);
    expect(memberships.map((m) => m.role).sort()).toEqual(['health_agent', 'ngo_coordinator']);

    const inOng = makeActor(user, memberships, 'org-ong-2');
    expect(can({ actor: inOng, action: 'ngo.mission.read', resource: { type: 'mission', id: 'm1', orgId: 'org-ong-2' } })).toBe(true);
    expect(can({ actor: inOng, action: 'care.readOrg', resource: { type: 'care', id: 'c1', orgId: 'org-csps' } })).toBe(false);

    useApp.getState().setActiveOrg('org-csps');
    expect(useApp.getState().activeOrgId).toBe('org-csps');
    const inCsps = makeActor(user, useApp.getState().memberships, useApp.getState().activeOrgId);
    expect(can({ actor: inCsps, action: 'care.create', resource: { type: 'care', orgId: 'org-csps' } })).toBe(true);
    // Aucun droit ONG ne subsiste dans le contexte CSPS.
    expect(can({ actor: inCsps, action: 'ngo.mission.read', resource: { type: 'mission', id: 'm1', orgId: 'org-ong-2' } })).toBe(false);
    expect(can({ actor: inCsps, action: 'ngo.mission.manage', resource: { type: 'mission', id: 'm1', orgId: 'org-ong-2' } })).toBe(false);
  });

  it('PASS : un contexte auquel on n’appartient pas est refusé', async () => {
    await login('multi_roles');
    const before = useApp.getState().activeOrgId;
    useApp.getState().setActiveOrg('org-hopital');
    expect(useApp.getState().activeOrgId).toBe(before);
    useApp.getState().setActiveOrg('org-ong-2');
    expect(useApp.getState().activeOrgId).toBe('org-ong-2');
  });
});

describe('Scénario J — message à un groupe familial', () => {
  it('PASS : chaque destinataire reçoit individuellement, selon son réseau', async () => {
    await login('citoyen1');
    const group = useApp.getState().groups.find((g) => g.kind === 'family')!;
    expect(group.memberIds).toHaveLength(2);

    const before = useApp.getState().messages.length;
    const result = await useApp.getState().sendGroupMessage(group.id, 'Repas chez nous à 19 h.');
    expect(result.ok).toBe(true);
    run();

    const created = useApp.getState().messages.slice(before);
    expect(created).toHaveLength(group.memberIds.length - 1);
    expect(created.every((m) => m.type === 'group' && m.groupId === group.id)).toBe(true);
    // Un exemplaire PAR destinataire : identifiants distincts, tous acheminés.
    expect(new Set(created.map((m) => m.id)).size).toBe(created.length);
    expect(created.every((m) => useApp.getState().deliveries[m.deliveryId].status === 'delivered')).toBe(true);
    // Conversation de groupe partagée (même identifiant pour les deux côtés).
    expect(created[0].conversationId).toBe(`cv_grp_${group.id}`);
  });

  it('PASS : un non-membre ne peut pas écrire dans le groupe', async () => {
    await login('agent_csps');
    const group = useApp.getState().groups.find((g) => g.kind === 'family')!;
    const result = await useApp.getState().sendGroupMessage(group.id, 'Intrus');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/membre/i);
  });
});

describe('Scénario D — coordinateur ONG → équipe : consigne, réponses, incident', () => {
  it('PASS : consigne diffusée, réponse de l’agent, incident remonté', async () => {
    await login('coordinateur_ong');
    expect(useApp.getState().activeOrgId).toBe('org-ong-1');
    const team = useApp.getState().groups.find((g) => g.orgId === 'org-ong-1' && g.kind === 'team')!;

    const before = useApp.getState().messages.length;
    expect((await useApp.getState().sendGroupMessage(team.id, 'Partir vers le secteur Nord à 6 h.')).ok).toBe(true);
    run();
    const consigne = useApp.getState().messages[before];
    expect(consigne.type).toBe('group');
    expect(useApp.getState().deliveries[consigne.deliveryId].status).toBe('delivered');

    // Réponse de l’agent de terrain dans la même équipe.
    await login('agent_ong');
    const beforeReply = useApp.getState().messages.length;
    expect((await useApp.getState().sendGroupMessage(team.id, 'Reçu, on démarre à 6 h.')).ok).toBe(true);
    run();
    const reply = useApp.getState().messages[beforeReply];
    expect(useApp.getState().deliveries[reply.deliveryId].status).toBe('delivered');

    // Incident de terrain remonté par l’agent, rattaché à SON organisation.
    const reported = useApp.getState().reportIncident({
      title: 'Pont isolé',
      detail: 'Le pont du secteur Nord est impraticable après la pluie.',
      severity: 'urgent',
    });
    expect(reported.ok).toBe(true);
    expect(useApp.getState().incidents[0].orgId).toBe('org-ong-1');
    expect(useApp.getState().incidents[0].reporterId).toBe(userBy('agent_ong').id);

    // L’agent ne dispose PAS du droit de partager avec une autre organisation.
    const denied = useApp.getState().grantShared({
      resourceType: 'incident',
      resourceId: useApp.getState().incidents[0].id,
      targetOrgId: 'org-ong-2',
    });
    expect(denied.ok).toBe(false);
  });
});

describe('Scénario E — deux organisations autorisées dans une mission commune', () => {
  it('PASS : partage explicite, accès limité à la ressource listée', async () => {
    // 1. L’ONG Terre & Vie partage UN incident avec ONG Solidarité Sahel.
    await login('coordinateur_ong');
    expect(
      useApp.getState().reportIncident({
        title: 'Besoin de renfort',
        detail: 'Distribution prévue jeudi, renfort demandé.',
        severity: 'info',
      }).ok,
    ).toBe(true);
    const incident = useApp.getState().incidents[0];
    const shared = useApp.getState().grantShared({
      resourceType: 'incident',
      resourceId: incident.id,
      targetOrgId: 'org-ong-2',
    });
    expect(shared.ok).toBe(true);
    const grants = useApp.getState().grants;

    // 2. La coordinateur de l’autre ONG lit la ressource PARTAGÉE.
    const partner = await login('multi_roles');
    expect(useApp.getState().activeOrgId).toBe('org-ong-2');
    const actor = makeActor(partner, useApp.getState().memberships, useApp.getState().activeOrgId);
    expect(
      can({
        actor,
        action: 'ngo.mission.read',
        resource: { type: 'incident', id: incident.id, orgId: 'org-ong-1' },
        grants,
      }),
    ).toBe(true);

    // 3. …et NE RIEN VOIR d’autre de la même organisation.
    expect(
      can({ actor, action: 'ngo.mission.read', resource: { type: 'incident', id: 'autre', orgId: 'org-ong-1' }, grants }),
    ).toBe(false);
    expect(can({ actor, action: 'message.readOrg', resource: { type: 'message', id: 'cv_x', orgId: 'org-ong-1' }, grants })).toBe(false);
    expect(can({ actor, action: 'org.members.read', resource: { type: 'org', id: 'org-ong-1', orgId: 'org-ong-1' }, grants })).toBe(false);
  });
});
