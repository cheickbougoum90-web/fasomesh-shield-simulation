import { describe, expect, it } from 'vitest';
import type { CareRequest, Membership } from '../core/types';
import {
  CARE_TYPES,
  CareTransitionError,
  canTransitionCare,
  checkCoupling,
  createCareRequest,
  nextCaseRef,
  validateCareRequest,
} from '../domain/care';
import { PolicyDeniedError, makeActor } from '../policy';
import { CareError, actOnRequest, authorizeCareAction, syncTransport } from '../services/care';

/** Suivi de prise en charge (§4) : machine de soin distincte du transport. */

const at = 10_000;
const memberships: Membership[] = [
  { userId: 'u_centre', orgId: 'org-centre', role: 'health_center_operator', joinedAt: 0 },
  { userId: 'u_agent', orgId: 'org-csps', role: 'health_agent', joinedAt: 0 },
];

const centre = makeActor({ id: 'u_centre', roles: [] } as never, memberships, 'org-centre');
const citizen = makeActor({ id: 'u_citoyen', roles: ['citizen'] } as never, [], null);

function baseRequest(): CareRequest {
  return createCareRequest({
    id: 'care-1',
    caseRef: nextCaseRef(142, 2026),
    type: 'maternity',
    priority: 'critical',
    description: 'Contractions régulières, accouchement imminent.',
    location: 'CSPS de Kongou',
    desiredDestination: 'Centre de référence de Banfora',
    complementary: 'Route impraticable après la pluie.',
    senderId: 'u_agent',
    orgId: 'org-csps',
    targetOrgId: 'org-centre',
    transportDeliveryId: 'dlv-1',
    createdAt: at,
  });
}

describe('formulaire non nominatif (§4)', () => {
  it('génère un identifiant de dossier sans nom de patient', () => {
    expect(nextCaseRef(142, 2026)).toBe('DOS-2026-0142');
    const request = baseRequest();
    expect(request.caseRef).toBe('DOS-2026-0142');
    // Aucun champ de nom, de patient ou d'identité dans l'entité.
    expect(Object.keys(request).filter((k) => /name|patient|nom/i.test(k))).toEqual([]);
    expect(JSON.stringify(request).toLowerCase()).not.toContain('patient');
  });

  it('ne demande jamais le nom du patient : validation sans ce champ', () => {
    const errors = validateCareRequest({
      type: 'maternity',
      description: 'Contractions régulières.',
      location: 'CSPS de Kongou',
      priority: 'critical',
    });
    expect(errors).toEqual([]);
  });

  it('rejette un type d’urgence inconnu ou une description trop courte', () => {
    expect(
      validateCareRequest({ type: 'x', description: 'court', location: '', priority: 'nope' }),
    ).toHaveLength(4);
    expect(CARE_TYPES).toContain('maternity');
  });
});

describe('couplage transport ⇄ soin', () => {
  it('synchronise « envoyé » puis « reçu » avec le transport', () => {
    const request = baseRequest();
    const sent = syncTransport(request, 'accepted_local', at + 1);
    expect(sent.status).toBe('sent');
    const received = syncTransport(sent, 'delivered', at + 2);
    expect(received.status).toBe('received');
  });

  it('un échec de transport ne fait JAMAIS avancer le dossier', () => {
    const sent = syncTransport(baseRequest(), 'accepted_local', at + 1);
    expect(syncTransport(sent, 'failed', at + 2).status).toBe('sent');
    expect(syncTransport(sent, 'queued', at + 2).status).toBe('sent');
    expect(syncTransport(sent, 'unconfirmed', at + 2).status).toBe('sent');
  });

  it('interdit l’état de soin au-delà de « reçu » sans arrivée technique', () => {
    expect(checkCoupling('received', 'failed')).toBe(true);
    expect(checkCoupling('acknowledged', 'failed')).toBe(false);
    expect(checkCoupling('accepted', 'queued')).toBe(false);
    expect(checkCoupling('resolved', 'delivered')).toBe(true);
  });

  it('refuse un saut direct envoyé → accusé (il faut passer par reçu)', () => {
    expect(canTransitionCare('sent', 'acknowledged')).toBe(false);
    expect(canTransitionCare('sent', 'received')).toBe(true);
  });
});

describe('actes d’opérateur', () => {
  it('déroule le cycle complet jusqu’à la clôture', () => {
    let request = syncTransport(baseRequest(), 'accepted_local', at + 1);
    request = syncTransport(request, 'delivered', at + 2);
    for (const to of ['acknowledged', 'accepted', 'in_progress', 'resolved'] as const) {
      request = actOnRequest({ actor: centre, request, to, now: at + 10 });
    }
    expect(request.status).toBe('resolved');
    expect(request.resolvedAt).toBe(at + 10);
    expect(request.events.map((e) => e.to)).toEqual(['created', 'sent', 'received', 'acknowledged', 'accepted', 'in_progress', 'resolved']);
  });

  it('refuse un refus sans justification', () => {
    const request = syncTransport(syncTransport(baseRequest(), 'accepted_local', at + 1), 'delivered', at + 2);
    const acknowledged = actOnRequest({ actor: centre, request, to: 'acknowledged', now: at + 3 });
    expect(() => actOnRequest({ actor: centre, request: acknowledged, to: 'rejected', now: at + 4 })).toThrow(CareError);
    const rejected = actOnRequest({
      actor: centre,
      request: acknowledged,
      to: 'rejected',
      justification: 'Capacité d’accueil saturée.',
      now: at + 4,
    });
    expect(rejected.status).toBe('rejected');
    expect(rejected.justification).toBe('Capacité d’accueil saturée.');
  });

  it('refuse tout acte à un rôle qui n’en a pas le droit (scénario H, côté soin)', () => {
    const request = syncTransport(syncTransport(baseRequest(), 'accepted_local', at + 1), 'delivered', at + 2);
    expect(() => authorizeCareAction({ actor: citizen, request, to: 'acknowledged' })).toThrow(PolicyDeniedError);
    expect(() => actOnRequest({ actor: citizen, request, to: 'acknowledged', now: at + 3 })).toThrow(PolicyDeniedError);
  });

  it('refuse les transitions illégales', () => {
    const request = baseRequest();
    expect(() => actOnRequest({ actor: centre, request, to: 'resolved', now: at })).toThrow(CareTransitionError);
    const resolved = actOnRequest({ actor: centre, request: syncTransport(syncTransport(baseRequest(), 'accepted_local', at + 1), 'delivered', at + 2), to: 'acknowledged', now: at + 3 });
    expect(resolved.status).toBe('acknowledged');
  });

  it('n’accepte pas un état « système » comme acte d’opérateur', () => {
    const request = baseRequest();
    expect(() => authorizeCareAction({ actor: centre, request, to: 'sent' })).toThrow(CareError);
  });
});
