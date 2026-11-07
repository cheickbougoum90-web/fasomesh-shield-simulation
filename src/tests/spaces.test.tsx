// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useApp } from '../app/store';
import type { Membership, User } from '../core/types';
import { createCareRequest, nextCaseRef } from '../domain/care';
import { syncTransport } from '../services/care';
import { makeActor } from '../policy';
import { AdminSpace } from '../ui/screens/Admin';
import { CareNew, CareSpace } from '../ui/screens/Care';
import { HubSpace } from '../ui/screens/HubSpace';
import { visibleNav } from '../ui/nav';

/**
 * Espaces par profil (§5) : le menu et les écrans REFLETTENT les droits.
 * Les refus eux-mêmes sont testés à la couche de politique (policy.test.ts) ;
 * ici on vérifie le rendu et l'absence des fonctions non autorisées.
 */

const memberships: Membership[] = [
  { userId: 'u_centre', orgId: 'org-centre', role: 'health_center_operator', joinedAt: 0 },
  { userId: 'u_agent', orgId: 'org-csps', role: 'health_agent', joinedAt: 0 },
  { userId: 'u_admin', orgId: 'org-admin', role: 'system_admin', joinedAt: 0 },
  { userId: 'u_hub', orgId: 'org-hub', role: 'operator', joinedAt: 0 },
];

function user(id: string, roles: User['roles']): User {
  return {
    id,
    displayName: id,
    role: roles[0] ?? 'citizen',
    roles,
    nodeId: `phone-${id}`,
    salt: 's',
    passwordHash: 'h',
    createdAt: 0,
    settings: { locationAllowed: false, notificationsOn: true, simSpeed: 1 },
  };
}

const citizenActor = makeActor(user('u_citoyen', ['citizen']), memberships, null);
const centreActor = makeActor(user('u_centre', []), memberships, 'org-centre');
const adminActor = makeActor(user('u_admin', []), memberships, 'org-admin');
const hubActor = makeActor(user('u_hub', ['operator']), memberships, 'org-hub');
const nav = (actor: typeof citizenActor) => visibleNav(actor).map((i) => i.to);

describe('menu construit depuis la politique', () => {
  it('citoyen : messages et alertes, ni administration ni console Hub', () => {
    const items = nav(citizenActor);
    expect(items).toContain('/app/messages');
    expect(items).toContain('/app/alerts');
    expect(items).not.toContain('/app/admin');
    expect(items).not.toContain('/app/hub');
  });

  it('centre de référence : boîte de réception des soins, pas d’administration', () => {
    const items = nav(centreActor);
    expect(items).toContain('/app/care');
    expect(items).not.toContain('/app/admin');
  });

  it('opérateur Hub : console Hub conservée (il reste aussi un utilisateur)', () => {
    const items = nav(hubActor);
    expect(items).toContain('/app/hub');
    expect(items).toContain('/app');
    // L'opérateur Hub cumule les droits civils + supervision : ce n'est pas
    // une restriction, c'est le rôle historique `operator`.
    expect(items).toContain('/app/messages');
  });

  it('administrateur : comptes et configuration, PAS les alertes ni les messages', () => {
    const items = nav(adminActor);
    expect(items).toContain('/app/admin');
    expect(items).not.toContain('/app/alerts');
    expect(items).not.toContain('/app/messages');
    expect(items).not.toContain('/app/care');
  });

  it('sans contexte organisationnel, les onglets organisationnels disparaissent', () => {
    const noContext = { ...centreActor, activeOrgId: null };
    expect(nav(noContext)).not.toContain('/app/care');
  });
});

afterEach(() => cleanup());

function seed(overrides: Partial<Parameters<typeof useApp.setState>[0]> = {}) {
  useApp.setState({
    booted: true,
    users: [
      user('u_centre', []),
      user('u_citoyen', ['citizen']),
      user('u_admin', []),
      user('u_hub', ['operator']),
      user('u_agent', ['citizen']),
    ],
    memberships,
    organizations: [
      { id: 'org-centre', kind: 'health_center', name: 'Centre de référence', shortName: 'CR', createdAt: 0 },
      { id: 'org-csps', kind: 'health_center', name: 'CSPS Kongou', shortName: 'CSPS', createdAt: 0 },
      { id: 'org-admin', kind: 'admin_network', name: 'Administration', shortName: 'ADM', createdAt: 0 },
      { id: 'org-hub', kind: 'hub', name: 'Hub Central', shortName: 'HUB', createdAt: 0 },
    ],
    careRequests: [
      // Dossier dont le transport est arrivé : le centre peut accuser réception.
      syncTransport(
        syncTransport(
          createCareRequest({
            id: 'care-1',
            caseRef: nextCaseRef(1, 2026),
            type: 'maternity',
            priority: 'critical',
            description: 'Accouchement imminent, route coupée.',
            location: 'CSPS de Kongou',
            desiredDestination: 'Centre de référence',
            complementary: '',
            senderId: 'u_agent',
            orgId: 'org-csps',
            targetOrgId: 'org-centre',
            transportDeliveryId: 'dlv-x',
            createdAt: Date.now(),
          }),
          'accepted_local',
          Date.now(),
        ),
        'delivered',
        Date.now(),
      ),
    ],
    ...overrides,
  });
}

describe('écran Soins', () => {
  it('le centre voit le dossier qui lui est adressé et peut agir', () => {
    seed({ currentUserId: 'u_centre', activeOrgId: 'org-centre' });
    render(
      <MemoryRouter>
        <CareSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Suivi des prises en charge/)).toBeTruthy();
    expect(screen.getByText('DOS-2026-0001')).toBeTruthy();
    expect(screen.getByText('Accuser réception')).toBeTruthy();
  });

  it('un citoyen qui n’est ni émetteur ni destinataire ne voit rien', () => {
    seed({ currentUserId: 'u_citoyen', activeOrgId: null });
    render(
      <MemoryRouter>
        <CareSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText('Aucun dossier')).toBeTruthy();
    expect(screen.queryByText('DOS-2026-0001')).toBeNull();
  });

  it('le formulaire n’affiche aucun champ de nom de patient', () => {
    seed({ currentUserId: 'u_agent', activeOrgId: 'org-csps' });
    render(
      <MemoryRouter>
        <CareNew />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Non nominatif/)).toBeTruthy();
    expect(screen.queryByLabelText(/nom du patient/i)).toBeNull();
    expect(screen.queryByText(/Nom du patient/)).toBeNull();
  });
});

describe('espaces réservés', () => {
  it('l’administration refuse un citoyen sans afficher les comptes', () => {
    seed({ currentUserId: 'u_citoyen', activeOrgId: null });
    render(
      <MemoryRouter>
        <AdminSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText('Accès réservé')).toBeTruthy();
    expect(screen.queryByText('Rôles de la plateforme')).toBeNull();
  });

  it('l’administration affiche les comptes à l’administrateur', () => {
    seed({ currentUserId: 'u_admin', activeOrgId: 'org-admin' });
    render(
      <MemoryRouter>
        <AdminSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Comptes \(\d+\)/)).toBeTruthy();
    expect(screen.getByText(/Configuration — hypothèses du modèle/)).toBeTruthy();
  });

  it('la console Hub refuse un citoyen', () => {
    seed({ currentUserId: 'u_citoyen', activeOrgId: null });
    render(
      <MemoryRouter>
        <HubSpace />
      </MemoryRouter>,
    );
    expect(screen.getByText('Accès réservé')).toBeTruthy();
  });
});
