// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { engine, useApp } from '../app/store';
import { can, makeActor } from '../policy';
import { CARE_LABEL } from '../domain/care';
import { buildCareCsv, csvEscape } from '../domain/reports';
import { CentreSpace } from '../ui/screens/Centre';
import { TeamSpace } from '../ui/screens/Team';

afterEach(() => cleanup());

/**
 * Validations obligatoires (§9 du cahier des charges final) qui n'avaient pas
 * de test automatique. Exécutées sur les VRAIES couches, sans mock : gestion
 * d'équipe, persistance après rechargement, export CSV, transfert complet,
 * indisponibilité du Hub, réponse aux informations complémentaires et
 * instructions du centre. Les transmissions restent SIMULÉES.
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

function run(ms = 45_000) {
  for (let t = 0; t < ms; t += 500) engine.advance(500);
}

async function open(marker: string) {
  await login('agent_csps');
  const created = useApp.getState().createCareRequest({
    type: 'maternity',
    priority: 'critical',
    description: `FIN-${marker} : cas de démonstration, aucune donnée réelle.`,
    location: 'CSPS de Kongou',
    desiredDestination: 'Centre de référence de Banfora',
    complementary: '',
    targetOrgId: 'org-centre',
  });
  if (!created.ok) throw new Error(`création impossible : ${(created.errors ?? []).join(' / ')}`);
  return useApp.getState().careRequests.find((r) => r.description.includes(`FIN-${marker}`))!;
}

/* ─────────────── §9.19 · gestion de l'équipe par le responsable ─────────────── */

describe('§9.19 — gestion de l’équipe du CSPS', () => {
  it('PASS : responsable ajoute, change le rôle et retire ; l’agent est refusé', async () => {
    await boot();
    await login('responsable_csps');
    const state = useApp.getState();
    expect(state.activeOrgId).toBe('org-csps');

    // Ajout d’un compte dans l’établissement.
    const added = state.addOrgMember('u_citoyen1', 'health_agent');
    expect(added.ok).toBe(true);
    expect(
      useApp.getState().memberships.some((m) => m.userId === 'u_citoyen1' && m.orgId === 'org-csps'),
    ).toBe(true);

    // Changement de rôle.
    const promoted = useApp.getState().setMemberRole('u_citoyen1', 'health_manager');
    expect(promoted.ok).toBe(true);
    expect(
      useApp.getState().memberships.find((m) => m.userId === 'u_citoyen1' && m.orgId === 'org-csps')?.role,
    ).toBe('health_manager');

    // Rôle inconnu refusé.
    expect(useApp.getState().addOrgMember('u_citoyen2', 'citizen' as never).ok).toBe(false);

    // Retrait (avec confirmation côté UI) et journalisation.
    const removed = useApp.getState().removeOrgMember('u_citoyen1');
    expect(removed.ok).toBe(true);
    expect(
      useApp.getState().memberships.some((m) => m.userId === 'u_citoyen1' && m.orgId === 'org-csps'),
    ).toBe(false);
    expect(useApp.getState().audit.filter((a) => a.action.startsWith('Équipe')).length).toBeGreaterThanOrEqual(3);

    // L’AGENT ne gère pas l’équipe : refus explicite, rien n’est modifié.
    await login('agent_csps');
    const before = useApp.getState().memberships.length;
    const denied = useApp.getState().addOrgMember('u_citoyen1', 'health_agent');
    expect(denied.ok).toBe(false);
    expect(useApp.getState().memberships.length).toBe(before);
    const actor = makeActor(userBy('agent_csps'), useApp.getState().memberships, useApp.getState().activeOrgId);
    expect(can({ actor, action: 'org.members.manage', grants: useApp.getState().grants })).toBe(false);
  });
});

/* ─────────────── §9.10 · réponse aux informations complémentaires ───────────── */

describe('§9.10 — informations complémentaires : demande et réponse', () => {
  it('PASS : le centre demande, le CSPS répond, l’état du centre ne bouge pas tout seul', async () => {
    await boot();
    const d = await open('INFOS');
    run();

    await login('agent_centre_reference');
    expect(useApp.getState().careAction(d.id, 'acknowledged').ok).toBe(true);
    const ask = useApp.getState().careAction(d.id, 'information_requested', {
      detail: 'Préciser la température et la fréquence cardiaque.',
    });
    expect(ask.ok).toBe(true);

    // Le CSPS répond SANS faire avancer l’état sanitaire du centre.
    await login('agent_csps');
    const reply = useApp.getState().careReply(d.id, 'T 39,2 °C, FC 128/min, pas de détresse respiratoire.');
    expect(reply.ok).toBe(true);
    expect(useApp.getState().careRequests.find((r) => r.id === d.id)?.status).toBe('information_requested');
    expect(useApp.getState().careRequests.find((r) => r.id === d.id)?.informationReply).toContain('39,2');
    expect(useApp.getState().notifications[0].title).toContain('informations fournies');

    // Le centre ne « répond » pas à sa propre demande : refus.
    await login('agent_centre_reference');
    expect(useApp.getState().careReply(d.id, 'réponse indue').ok).toBe(false);

    // Le flux reprend ensuite normalement.
    expect(useApp.getState().careAction(d.id, 'acknowledged').ok).toBe(true);
    expect(useApp.getState().careAction(d.id, 'accepted').ok).toBe(true);
    expect(useApp.getState().careRequests.find((r) => r.id === d.id)?.status).toBe('accepted');
  });
});

/* ─────────────── §2B · instructions du centre au CSPS ───────────────────────── */

describe('§2B — instructions adressées au CSPS', () => {
  it('PASS : le centre instruit et est notifié, l’agent ne peut pas instruire', async () => {
    await boot();
    const d = await open('INSTR');
    run();

    // L’agent de santé n’a pas le droit d’agir à la place du centre.
    await login('agent_csps');
    expect(useApp.getState().sendInstruction(d.id, 'tentative indue').ok).toBe(false);

    await login('agent_centre_reference');
    const result = useApp.getState().sendInstruction(d.id, 'Arriver par l’entrée maternité, escorte prévue.');
    expect(result.ok).toBe(true);
    expect(useApp.getState().careRequests.find((r) => r.id === d.id)?.instructions).toContain('maternité');
    expect(useApp.getState().audit.some((a) => a.action.startsWith('Instructions au CSPS'))).toBe(true);
    expect(useApp.getState().notifications.some((n) => n.title.includes('instructions du centre'))).toBe(true);
  });
});

/* ─────────────── §9.11 · suivi complet d’un transfert jusqu’à la clôture ────── */

describe('§9.11 — transfert complet jusqu’à la clôture', () => {
  it('PASS : accepté → préparé → en transit → arrivé → clôturé, transport suivi séparément', async () => {
    await boot();
    const d = await open('TRAF');
    run();
    // Le transport a été reçu (couplage sent/received) : le centre doit agir.
    expect(useApp.getState().careRequests.find((r) => r.id === d.id)?.status).toBe('received');

    await login('agent_centre_reference');
    const state = useApp.getState();
    expect(state.careAction(d.id, 'acknowledged').ok).toBe(true);
    expect(state.careAction(d.id, 'accepted').ok).toBe(true);
    expect(state.careAction(d.id, 'in_progress').ok).toBe(true);
    expect(state.careAction(d.id, 'in_transit').ok).toBe(true);
    expect(useApp.getState().careRequests.find((r) => r.id === d.id)?.status).toBe('in_transit');
    run();
    expect(state.careAction(d.id, 'arrived').ok).toBe(true);
    const closed = state.careAction(d.id, 'resolved', { closingNote: 'Prise en charge chirurgicale, sortie prévue.' });
    expect(closed.ok).toBe(true);

    const final = useApp.getState().careRequests.find((r) => r.id === d.id)!;
    expect(final.status).toBe('resolved');
    expect(CARE_LABEL[final.status]).toBe('Clôturée');
    expect(final.closingNote).toContain('chirurgicale');
    expect(final.events.filter((e) => ['acknowledged', 'accepted', 'in_progress', 'in_transit', 'arrived', 'resolved'].includes(e.to)).length).toBe(6);
    // États strictement distincts : le transport n’a jamais décidé de tout seul.
    expect(final.transportDeliveryId).toBeTruthy();
    expect(useApp.getState().deliveries[final.transportDeliveryId!].status).toBe('delivered');
  });
});

/* ─────────────── §9.14 · indisponibilité du Hub ─────────────────────────────── */

describe('§9.14 — Hub indisponible : continuité par route directe', () => {
  it('PASS : Hub coupé, le CSPS transmet quand même au centre sans passer par le Hub', async () => {
    await boot();

    // Coupure du Hub par l’opérateur (droit réseau).
    await login('operateur_hub');
    useApp.getState().toggleHub();
    const hub = useApp.getState().nodes.find((n) => n.id === 'node-hub');
    expect(hub?.status).toBe('offline');

    const d = await open('HUBDOWN');
    run();

    const record = useApp.getState().deliveries[useApp.getState().careRequests.find((r) => r.id === d.id)!.transportDeliveryId!];
    expect(record.status).toBe('delivered');
    // Aucun saut par le Hub : la communication est reste locale au maillage de relais.
    expect(record.hops.some((h) => h.fromNodeId === 'node-hub' || h.toNodeId === 'node-hub')).toBe(false);
    // Réception technique enregistrée, mais aucune décision sanitaire prise : c’est au centre d’agir.
    expect(useApp.getState().careRequests.find((r) => r.id === d.id)?.status).toBe('received');

    // Rétablissement (laisse l’état propre pour la suite).
    await login('operateur_hub');
    useApp.getState().toggleHub();
    expect(useApp.getState().nodes.find((n) => n.id === 'node-hub')?.status).toBe('online');
  });
});

/* ─────────────── §9.20 · persistance après rechargement ─────────────────────── */

describe('§9.20 — persistance des dossiers après rechargement', () => {
  it('PASS : un brouillon créé survit à un rechargement complet de l’application', async () => {
    await boot();
    await login('agent_csps');
    const created = useApp.getState().createCareRequest({
      type: 'pediatric',
      priority: 'urgent',
      description: 'PERSIS : brouillon de démonstration, aucune donnée réelle.',
      location: 'CSPS de Kongou',
      desiredDestination: 'Centre de référence de Banfora',
      complementary: '',
      targetOrgId: 'org-centre',
      draft: true,
    });
    expect(created.ok).toBe(true);
    const before = useApp.getState().careRequests.find((r) => r.description.includes('PERSIS'))!;
    expect(before.status).toBe('draft');

    // Laisse la persistance débouchée (400 ms) écrire dans le stockage local.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(localStorage.length).toBeGreaterThan(0);

    // « Rechargement » : on vide la mémoire et on relance l’amorçage.
    useApp.setState({
      booted: false,
      currentUserId: null,
      users: [],
      careRequests: [],
      organizations: [],
      memberships: [],
      notifications: [],
      audit: [],
    });
    await useApp.getState().boot();

    const after = useApp.getState().careRequests.find((r) => r.description.includes('PERSIS'));
    expect(after).toBeTruthy();
    expect(after!.status).toBe('draft');
    expect(after!.caseRef).toBe(before.caseRef);
    expect(useApp.getState().users.length).toBeGreaterThan(5);
  });
});

/* ─────────────── §9.21 · rapports et export CSV ─────────────────────────────── */

describe('§9.21 — rapports et export CSV local', () => {
  it('PASS : en-têtes français, séparateur ;, échappement, aucune donnée nominative', async () => {
    await boot();
    await login('agent_csps');
    const created = useApp.getState().createCareRequest({
      type: 'trauma',
      priority: 'urgent',
      description: 'CSV ; avec « point-virgule » et virgule, test d’échappement.',
      location: 'CSPS de Kongou',
      desiredDestination: 'Centre de référence de Banfora',
      complementary: '',
      targetOrgId: 'org-centre',
    });
    expect(created.ok).toBe(true);

    const state = useApp.getState();
    const orgName = (id: string | null | undefined) => state.organizations.find((o) => o.id === id)?.name ?? String(id ?? '');
    const csv = buildCareCsv(state.careRequests, orgName);
    const lines = csv.split('\n');

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(lines[0].replace('\uFEFF', '')).toBe('dossier;type;priorite;statut;cspssource;destination;cree_le;recu_apres_s');
    expect(lines.length).toBe(state.careRequests.length + 1);
    expect(csv).toContain('CSPS de Kongou');
    expect(csv.toLowerCase()).not.toContain('patient');
    expect(csv).not.toContain('mot de passe');

    // Échappement des séparateurs et guillemets.
    expect(csvEscape('a;b')).toBe('"a;b"');
    expect(csvEscape('il dit "salut"')).toBe('"il dit ""salut"""');
    expect(csvEscape('sans danger')).toBe('sans danger');
  });
});

/* ─────────────── §10 · rendu réel des espaces ──────────────────────────────── */

describe('§10 — portes des espaces (rendu)', () => {
  it('PASS : l’opérateur du centre ouvre l’espace Centre, l’agent CSPS non', async () => {
    await boot();
    await login('agent_centre_reference');
    render(
      <MemoryRouter>
        <CentreSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Boîte de réception/)).toBeInTheDocument();
    cleanup();

    await login('agent_csps');
    render(
      <MemoryRouter>
        <CentreSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText('Accès réservé')).toBeInTheDocument();
  });

  it('PASS : le responsable ouvre l’équipe, l’agent CSPS non', async () => {
    await boot();
    await login('responsable_csps');
    render(
      <MemoryRouter>
        <TeamSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Membres \(\d+\)/)).toBeInTheDocument();
    cleanup();

    await login('agent_csps');
    render(
      <MemoryRouter>
        <TeamSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText('Accès réservé')).toBeInTheDocument();
  });
});
