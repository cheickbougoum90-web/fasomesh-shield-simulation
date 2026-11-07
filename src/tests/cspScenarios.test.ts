// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { engine, useApp } from '../app/store';
import { can, makeActor } from '../policy';
import { ALERT_CATEGORIES, ALERT_CATEGORY_LABEL, ORG_AVAILABILITY_LABEL } from '../core/types';
import { CARE_LABEL, checkCoupling } from '../domain/care';

/**
 * Scénarios A→M du dispositif CSPS (§19), exécutés sur les VRAIES couches :
 * store → politique → services → moteur Mesh → machines à états.
 * Aucun mock : un refus de politique, une transition illégale ou un échec de
 * transport casse l'assertion. Les transmissions sont SIMULÉES (aucune radio).
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

function reasons(result: { ok: boolean } & Partial<{ errors: string[] }>): string {
  return (result.errors ?? []).join(' / ');
}

function dossier(marker: string) {
  const found = useApp.getState().careRequests.find((r) => r.description.includes(marker));
  if (!found) throw new Error(`dossier absent : ${marker}`);
  return found;
}

async function open(marker: string, overrides: Record<string, unknown> = {}) {
  await login('agent_csps');
  return useApp.getState().createCareRequest({
    type: 'maternity',
    priority: 'critical',
    description: `SCEN-${marker} : cas de démonstration, aucune donnée réelle.`,
    location: 'CSPS de Kongou',
    desiredDestination: 'Centre de référence de Banfora',
    complementary: '',
    targetOrgId: 'org-centre',
    ...overrides,
  });
}

beforeEach(async () => {
  await boot();
});

/* ─────────────────────────── A · B · C ─────────────────────────── */

describe('Scénario A — ouverture d’une référence non nominative au CSPS', () => {
  it('PASS : dossier transmis, identifiant non nominatif, journalisé', async () => {
    const auditBefore = useApp.getState().audit.length;
    const created = await open('A');
    expect(created.ok, reasons(created)).toBe(true);

    const d = dossier('SCEN-A');
    expect(d.status).toBe('sent');
    expect(d.caseRef).toMatch(/^DOS-\d{4}-\d{4}$/);
    // Aucun nom de patient : ni champ, ni valeur, ni chaîne « patient ».
    const serialised = JSON.stringify(d).toLowerCase();
    expect(serialised).not.toContain('patient');
    // Aucun champ nominatif (le libellé « non nominatif » n’est pas un nom).
    const keys = Object.keys(d).map((k) => k.toLowerCase());
    expect(keys.some((k) => /prenom|lastname|firstname|nom[_A-Z]|patient/.test(k))).toBe(false);
    // Journal d’activité consultable (§11).
    const after = useApp.getState().audit;
    expect(after.length).toBeGreaterThan(auditBefore);
    expect(after[0].action).toContain(d.caseRef);
    expect(after[0].actorName).toBe(userBy('agent_csps').displayName);
  });

  it('PASS : la validation dépend de la priorité (demande non urgente incomplète refusée)', async () => {
    await login('agent_csps');
    const refused = useApp.getState().createCareRequest({
      type: 'other',
      kind: 'reference',
      priority: 'info',
      description: '',
      location: 'CSPS de Kongou',
      desiredDestination: 'Centre de référence de Banfora',
      complementary: '',
      targetOrgId: 'org-centre',
      signes: '',
      vitals: {},
    });
    expect(refused.ok).toBe(false);
    expect(reasons(refused).toLowerCase()).toContain('motif');
    expect(reasons(refused).toLowerCase()).toContain('signes');
    expect(useApp.getState().careRequests.find((r) => r.description.includes('SCEN-A'))).toBeTruthy();
  });
});

describe('Scénario B — arrivée technique ≠ acceptation humaine', () => {
  it('PASS : le transport s’arrête à REÇU, le centre doit agir', async () => {
    await open('B');
    run();
    const d = dossier('SCEN-B');
    expect(d.status).toBe('received');
    expect(d.events.map((e) => e.to)).toEqual(['created', 'sent', 'received']);
    expect(CARE_LABEL[d.status]).toBe('Reçue par le centre');
    expect(d.status).not.toBe('acknowledged');
    expect(d.status).not.toBe('accepted');

    // L’arrivée technique n’a rien décidé à la place de l’opérateur.
    await login('agent_centre_reference');
    expect(useApp.getState().activeOrgId).toBe('org-centre');
    const accepted = useApp.getState().careAction(d.id, 'accepted');
    expect(accepted.ok).toBe(false); // acknowledged obligatoire
  });
});

describe('Scénario C — prise en charge complète par le centre de référence', () => {
  it('PASS : accusé → accepté → en cours → clôturé, historique ordonné', async () => {
    await open('C');
    run();
    const id = dossier('SCEN-C').id;

    await login('agent_centre_reference');
    for (const to of ['acknowledged', 'accepted', 'in_progress', 'resolved'] as const) {
      const step = useApp.getState().careAction(id, to);
      expect(step.ok, `${to} refusé : ${reasons(step)}`).toBe(true);
    }

    const d = useApp.getState().careRequests.find((r) => r.id === id)!;
    expect(d.status).toBe('resolved');
    expect(CARE_LABEL[d.status]).toBe('Clôturée');
    expect(d.events.map((e) => e.to)).toEqual([
      'created',
      'sent',
      'received',
      'acknowledged',
      'accepted',
      'in_progress',
      'resolved',
    ]);
    // Chaque étape est signée par son auteur.
    const last = d.events[d.events.length - 1];
    expect(last.actorId).toBe(userBy('agent_centre_reference').id);
    expect(d.targetOrgId).toBe('org-centre');
  });
});

/* ─────────────────────────── D · E · F ─────────────────────────── */

describe('Scénario D — refus motivé et notification du CSPS', () => {
  it('PASS : refus impossible sans justification, CSPS notifié', async () => {
    await open('D');
    run();
    const id = dossier('SCEN-D').id;

    await login('agent_centre_reference');
    expect(useApp.getState().careAction(id, 'acknowledged').ok).toBe(true);
    const bare = useApp.getState().careAction(id, 'rejected');
    expect(bare.ok).toBe(false);
    const refused = useApp.getState().careAction(id, 'rejected', 'Capacité saturée, aucune couveuse libre.');
    expect(refused.ok).toBe(true);

    const d = useApp.getState().careRequests.find((r) => r.id === id)!;
    expect(d.status).toBe('rejected');
    expect(d.justification).toBe('Capacité saturée, aucune couveuse libre.');
    // Une transition figée : aucun état après refus.
    expect(useApp.getState().careAction(id, 'accepted').ok).toBe(false);
    // Notification « soins » pour le CSPS, liée au dossier.
    expect(
      useApp.getState().notifications.some((n) => n.type === 'care' && n.deepLink === `/app/care/${id}`),
    ).toBe(true);
    // Le refus ne prétend rien sur le transport (hors ordre sanitaire).
    expect(checkCoupling('rejected', useApp.getState().deliveries[d.transportDeliveryId!]?.status ?? 'queued')).toBe(true);
  });
});

describe('Scénario E — le Hub oriente une demande vers un centre compétent', () => {
  it('PASS : destination changée, tracée et notifiée', async () => {
    await open('E');
    run();
    const id = dossier('SCEN-E').id;
    expect(dossier('SCEN-E').targetOrgId).toBe('org-centre');

    await login('operateur_hub');
    expect(useApp.getState().activeOrgId).toBe('org-hub');
    const bad = useApp.getState().orientRequest(id, 'centre-inconnu');
    expect(bad.ok).toBe(false);
    const same = useApp.getState().orientRequest(id, 'org-centre');
    expect(same.ok).toBe(false);

    const ok = useApp.getState().orientRequest(id, 'org-centre-2');
    expect(ok.ok, reasons(ok)).toBe(true);

    const d = useApp.getState().careRequests.find((r) => r.id === id)!;
    expect(d.targetOrgId).toBe('org-centre-2');
    expect(d.events.some((e) => e.reason === 'orientation')).toBe(true);
    expect(
      useApp.getState().notifications.some((n) => n.type === 'care' && n.title.includes('orienté')),
    ).toBe(true);
    // Le Hub n’est PAS passage obligatoire : l’orientation n’a pas renvoyé le dossier.
    expect(d.events.map((e) => e.to)).toContain('received');
  });

  it('PASS : un non-opérateur ne peut pas orienter', async () => {
    await open('E2');
    run();
    const id = dossier('SCEN-E2').id;
    await login('agent_csps');
    const refused = useApp.getState().orientRequest(id, 'org-centre-2');
    expect(refused.ok).toBe(false);
    expect(dossier('SCEN-E2').targetOrgId).toBe('org-centre');
  });
});

describe('Scénario F — couplage transport/soins strictement borné', () => {
  it('PASS : pas d’état au-delà de REÇU tant que le transport n’est pas arrivé', async () => {
    await open('F');
    // Aucune avance du moteur : le dossier est encore TRANSMIS.
    const early = dossier('SCEN-F');
    expect(early.status).toBe('sent');

    await login('agent_centre_reference');
    expect(useApp.getState().careAction(early.id, 'acknowledged').ok).toBe(false);

    run();
    const arrived = dossier('SCEN-F');
    expect(arrived.status).toBe('received');
    expect(useApp.getState().careAction(arrived.id, 'acknowledged').ok).toBe(true);
  });

  it('PASS : seuls sent/received sont couplés, refus et annulation n’affirment rien', () => {
    expect(checkCoupling('created', 'queued')).toBe(true);
    expect(checkCoupling('sent', 'queued')).toBe(true);
    expect(checkCoupling('received', 'delivered')).toBe(true);
    expect(checkCoupling('acknowledged', 'queued')).toBe(false);
    expect(checkCoupling('in_progress', 'queued')).toBe(false);
    expect(checkCoupling('resolved', 'delivered')).toBe(true);
    // Hors machine sanitaire : aucune exigence de transport.
    expect(checkCoupling('draft', 'queued')).toBe(true);
    expect(checkCoupling('rejected', 'queued')).toBe(true);
    expect(checkCoupling('cancelled', 'failed')).toBe(true);
  });
});

/* ─────────────────────────── G · H · I ─────────────────────────── */

describe('Scénario G — informations complémentaires demandées', () => {
  it('PASS : le centre redemande, le CSPS fournit, le dossier repart', async () => {
    await open('G');
    run();
    const id = dossier('SCEN-G').id;

    await login('agent_centre_reference');
    expect(useApp.getState().careAction(id, 'acknowledged').ok).toBe(true);
    const ask = useApp.getState().careAction(id, 'information_requested', {
      detail: 'Préciser la glycémie capillaire et la température.',
    });
    expect(ask.ok).toBe(true);
    expect(CARE_LABEL[dossier('SCEN-G').status]).toBe('Informations complémentaires demandées');

    // Le CSPS voit la demande, mais ne fait pas avancer l’état sanitaire du centre.
    await login('agent_csps');
    const actor = makeActor(userBy('agent_csps'), useApp.getState().memberships, useApp.getState().activeOrgId);
    const resource = { type: 'care' as const, id, orgId: 'org-csps', targetOrgId: 'org-centre' };
    expect(can({ actor, action: 'care.readOrg', resource, grants: useApp.getState().grants })).toBe(true);
    expect(can({ actor, action: 'care.respond', resource, grants: useApp.getState().grants })).toBe(false);

    await login('agent_centre_reference');
    expect(useApp.getState().careAction(id, 'acknowledged').ok).toBe(true);
    expect(useApp.getState().careAction(id, 'accepted').ok).toBe(true);
    expect(dossier('SCEN-G').status).toBe('accepted');
  });
});

describe('Scénario H — brouillon local, non transmis tant qu’il n’est pas soumis', () => {
  it('PASS : pas de transport sur DRAFT, puis soumission normale', async () => {
    const deliveriesBefore = Object.keys(useApp.getState().deliveries).length;
    const created = await open('H', { draft: true });
    expect(created.ok).toBe(true);

    const d = dossier('SCEN-H');
    expect(d.status).toBe('draft');
    expect(d.transportDeliveryId).toBeNull();
    expect(Object.keys(useApp.getState().deliveries).length).toBe(deliveriesBefore);
    // Le moteur n’a rien reçu : l’état technique n’existe pas.
    expect(CARE_LABEL[d.status]).toBe('Brouillon');

    run(5_000);
    expect(dossier('SCEN-H').status).toBe('draft');

    const submitted = useApp.getState().submitDraft(d.id);
    expect(submitted.ok, reasons(submitted)).toBe(true);
    const after = dossier('SCEN-H');
    expect(after.status).toBe('sent');
    expect(after.transportDeliveryId).toBeTruthy();
    expect(Object.keys(useApp.getState().deliveries).length).toBe(deliveriesBefore + 1);

    run();
    expect(dossier('SCEN-H').status).toBe('received');
    expect(
      useApp.getState().audit.some((a) => a.action.includes('Brouillon') && a.action.includes('soumis')),
    ).toBe(true);
  });
});

describe('Scénario I — isolation entre établissements et hors dispositif', () => {
  it('PASS : un autre CSPS, un citoyen et l’opérateur hors dossier ne lisent rien', async () => {
    await open('I');
    run();
    const id = dossier('SCEN-I').id;
    const resource = { type: 'care' as const, id, orgId: 'org-csps', targetOrgId: 'org-centre' };
    const grants = useApp.getState().grants;

    // L’émetteur lui-même conserve l’accès.
    await login('agent_csps');
    const mine = makeActor(userBy('agent_csps'), useApp.getState().memberships, useApp.getState().activeOrgId);
    expect(can({ actor: mine, action: 'care.readOrg', resource, grants })).toBe(true);

    // Un agent d’un AUTRE CSPS : refus.
    await login('agent_csps2');
    expect(useApp.getState().activeOrgId).toBe('org-csps-2');
    const other = makeActor(userBy('agent_csps2'), useApp.getState().memberships, useApp.getState().activeOrgId);
    expect(can({ actor: other, action: 'care.readOrg', resource, grants })).toBe(false);
    expect(can({ actor: other, action: 'care.respond', resource, grants })).toBe(false);
    expect(
      useApp.getState().careRequests.filter((r) =>
        can({
          actor: other,
          action: 'care.readOrg',
          resource: { type: 'care', id: r.id, orgId: r.orgId, targetOrgId: r.targetOrgId ?? undefined },
          grants,
        }),
      ).filter((r) => r.orgId === 'org-csps'),
    ).toHaveLength(0);

    // Hors dispositif sanitaire (citoyen sans organisation active) : refus.
    await login('citoyen1');
    const citizen = makeActor(userBy('citoyen1'), useApp.getState().memberships, useApp.getState().activeOrgId);
    expect(can({ actor: citizen, action: 'care.readOrg', resource, grants })).toBe(false);
    expect(can({ actor: citizen, action: 'care.respond', resource, grants })).toBe(false);
  });
});

/* ─────────────────────────── J · K ─────────────────────────── */

describe('Scénario J — responsable du CSPS vs agent de santé', () => {
  it('PASS : gestion, statistiques et annuaire réservés au responsable', async () => {
    const resource = { type: 'org' as const, orgId: 'org-csps' };

    await login('responsable_csps');
    expect(useApp.getState().activeOrgId).toBe('org-csps');
    const manager = makeActor(
      userBy('responsable_csps'),
      useApp.getState().memberships,
      useApp.getState().activeOrgId,
    );
    const grants = useApp.getState().grants;
    expect(can({ actor: manager, action: 'org.members.manage', resource, grants })).toBe(true);
    expect(can({ actor: manager, action: 'stats.read', resource, grants })).toBe(true);
    expect(can({ actor: manager, action: 'directory.read', resource, grants })).toBe(true);
    expect(can({ actor: manager, action: 'care.create', resource: { type: 'care', orgId: 'org-csps' }, grants })).toBe(
      true,
    );

    await login('agent_csps');
    const agent = makeActor(userBy('agent_csps'), useApp.getState().memberships, useApp.getState().activeOrgId);
    expect(can({ actor: agent, action: 'care.create', resource: { type: 'care', orgId: 'org-csps' }, grants })).toBe(
      true,
    );
    expect(can({ actor: agent, action: 'directory.read', resource, grants })).toBe(true);
    expect(can({ actor: agent, action: 'org.members.manage', resource, grants })).toBe(false);
    expect(can({ actor: agent, action: 'stats.read', resource, grants })).toBe(false);
    expect(can({ actor: agent, action: 'audit.read', resource, grants })).toBe(false);
  });
});

describe('Scénario K — disponibilité déclarée du centre (jamais mesurée)', () => {
  it('PASS : mise à jour pour soi, refus pour autrui, journalisée', async () => {
    await login('agent_centre_reference');
    const setOrgAvailability = useApp.getState().setOrgAvailability;
    const own = setOrgAvailability('org-centre', 'limited', '3 couveuses sur 5');
    expect(own.ok, reasons(own)).toBe(true);

    const centre = useApp.getState().organizations.find((o) => o.id === 'org-centre')!;
    expect(centre.availability).toBe('limited');
    expect(centre.availabilityNote).toBe('3 couveuses sur 5');
    expect(ORG_AVAILABILITY_LABEL[centre.availability!]).toBe('Capacité limitée');

    // Un autre établissement : refus (droit org-scopé).
    const cspsBefore = useApp.getState().organizations.find((o) => o.id === 'org-csps')!.availability;
    const foreign = setOrgAvailability('org-csps', 'open');
    expect(foreign.ok).toBe(false);
    expect(useApp.getState().organizations.find((o) => o.id === 'org-csps')!.availability).toBe(cspsBefore);

    expect(
      useApp.getState().audit.some(
        (a) => a.action === 'Disponibilité déclarée' && a.targetId === 'org-centre',
      ),
    ).toBe(true);
  });
});

/* ─────────────────────────── L · M ─────────────────────────── */

describe('Scénario L — perte de réseau : attente, reprise, aucun doublon', () => {
  it('PASS : dossier bloqué puis reçu après rétablissement, un seul exemplaire', async () => {
    // Isole le destinataire : tous ses liens Mesh sont coupés (aucune route).
    const targetNodes = new Set([
      useApp.getState().organizations.find((o) => o.id === 'org-centre')!.nodeId!,
      userBy('agent_centre_reference').nodeId,
    ]);
    const cut = useApp.getState().links.filter(
      (l) => targetNodes.has(l.aNodeId) || targetNodes.has(l.bNodeId),
    );
    expect(cut.length).toBeGreaterThan(0);
    for (const l of cut) useApp.getState().setLinkStatus(l.id, 'down');

    const countBefore = useApp.getState().careRequests.filter((r) => r.description.includes('SCEN-L')).length;
    expect(countBefore).toBe(0);
    expect((await open('L')).ok).toBe(true);
    run();

    const blocked = dossier('SCEN-L');
    expect(blocked.status).toBe('sent'); // jamais « reçu » sans route
    expect(useApp.getState().deliveries[blocked.transportDeliveryId!].status).not.toBe('delivered');

    useApp.getState().restoreNetwork();
    run(70_000);

    const recovered = dossier('SCEN-L');
    expect(recovered.status).toBe('received');
    expect(useApp.getState().deliveries[recovered.transportDeliveryId!].status).toBe('delivered');
    // Un seul exemplaire applicatif, une seule livraison confirmée.
    expect(
      useApp.getState().careRequests.filter((r) => r.description.includes('SCEN-L')),
    ).toHaveLength(1);
    const record = useApp.getState().deliveries[recovered.transportDeliveryId!];
    expect(record.events.filter((e) => e.to === 'delivered')).toHaveLength(1);
  });
});

describe('Scénario M — alerte du CSPS catégorisée par le Hub (7 catégories)', () => {
  it('PASS : 7 catégories sanitaires, catégorisation et accusé par l’opérateur', async () => {
    const required = [
      'medical',
      'evacuation',
      'health_incident',
      'service_outage',
      'reinforcement',
      'logistics',
      'technical',
    ];
    for (const c of required) {
      expect(ALERT_CATEGORIES, `catégorie manquante : ${c}`).toContain(c);
      expect(ALERT_CATEGORY_LABEL[c], `libellé manquant : ${c}`).toBeTruthy();
    }

    await login('agent_csps');
    const raised = await useApp.getState().raiseAlert({
      title: 'SCEN-M : réfrigérateur à vaccins hors service',
      body: 'Chaîne du froid interrompue depuis 6 h (simulation).',
      priority: 'urgent',
    });
    expect(raised.ok).toBe(true);
    run();
    const alert = useApp.getState().alerts.find((a) => a.title.includes('SCEN-M'))!;
    expect(useApp.getState().deliveries[alert.deliveryId].status).toBe('delivered');

    // Un agent du CSPS ne catégorise pas les alertes du Hub.
    expect(
      can({
        actor: makeActor(userBy('agent_csps'), useApp.getState().memberships, useApp.getState().activeOrgId),
        action: 'hub.categorize',
        resource: { type: 'org', orgId: 'org-csps' },
        grants: useApp.getState().grants,
      }),
    ).toBe(false);

    await login('operateur_hub');
    const tagged = useApp.getState().setAlertCategory(alert.id, 'service_outage');
    expect(tagged.ok, reasons(tagged)).toBe(true);
    useApp.getState().acknowledgeAlert(alert.id);
    const after = useApp.getState().alerts.find((a) => a.id === alert.id)!;
    expect(after.category).toBe('service_outage');
    expect(after.acknowledgedBy).toContain(userBy('operateur_hub').id);
    expect(after.acknowledgedBy.length).toBeGreaterThanOrEqual(1);
  });
});
