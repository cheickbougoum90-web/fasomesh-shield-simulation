import { describe, expect, it } from 'vitest';
import { MeshEngine, TIMING, type EngineEvent } from '../mesh/engine';
import { seedLinks, seedNodes } from '../mesh/seed';
import { canTransition, createDelivery, pushHop, transition } from '../domain/delivery';
import type { DeliveryRecord } from '../core/types';

/**
 * Scénarios imposibles à vérifier à l'œil nu : perte de nœud, changement
 * de route, mise en attente, reprise. Le moteur est rejouable (graine fixe)
 * et chaque événement est replié dans la vraie machine à états du domaine —
 * un statut illégale ferait échouer le test immédiatement.
 */

function makeEngine(seed = 1): MeshEngine {
  return new MeshEngine({ seed, nodes: seedNodes(), links: seedLinks() });
}

function track(engine: MeshEngine, id = 'd1') {
  let record: DeliveryRecord = createDelivery(id, 'm1', 0, TIMING.ttl);
  const notes: string[] = [];
  engine.on((event: EngineEvent) => {
    if (event.type === 'status') {
      expect(canTransition(record.status, event.to)).toBe(true);
      record = transition(record, event.to, {
        at: event.at,
        reason: event.reason,
        detail: event.detail,
        storedAtHub: event.storedAtHub,
      });
      notes.push(`${event.to}·${event.reason}`);
    } else if (event.type === 'hop') {
      record = pushHop(record, event.hop);
    }
  });
  return { get: () => record, notes };
}

describe('scénario A — envoi d’un message', () => {
  it('achemine un message simple jusqu’au destinataire, saut par saut', () => {
    const engine = makeEngine();
    const t = track(engine);
    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(30_000);

    const record = t.get();
    expect(record.status).toBe('delivered');
    const states = record.events.map((e) => e.to);
    expect(states[0]).toBe('draft');
    // Ordre imposé par la promesse produit : créé → accepté localement → en chemin → reçu.
    expect(states.indexOf('created')).toBe(1);
    expect(states.indexOf('accepted_local')).toBeLessThan(states.indexOf('routing'));
    expect(states.lastIndexOf('delivered')).toBe(states.length - 1);
    expect(states).toEqual(expect.arrayContaining(['created', 'accepted_local', 'routing', 'delivered']));
    expect(record.hops.length).toBeGreaterThanOrEqual(2);
    expect(record.hops.some((h) => h.result === 'ok')).toBe(true);
    // Une perte de paquet isolée ne doit pas empêcher l'arrivée : elle est retentée.
    expect(record.status).toBe('delivered');
  });

  it('sépare explicitement « accepté par le nœud » de « reçu »', () => {
    const engine = makeEngine();
    const t = track(engine);
    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(TIMING.accept + 10);

    const record = t.get();
    // Le nœud a accepté, mais la route n'est pas encore annoncée : deux états distincts.
    expect(record.status).toBe('accepted_local');
    expect(record.events.some((e) => e.to === 'delivered')).toBe(false);
    expect(t.notes[0]).toMatch(/^created/);
    expect(t.notes[1]).toMatch(/^accepted_local/);

    engine.advance(TIMING.route + 10);
    expect(t.get().status).toBe('routing');
    expect(t.get().events.some((e) => e.to === 'delivered')).toBe(false);
  });

  it('fait transiter le message par plusieurs relais (communication multi-sauts)', () => {
    const engine = makeEngine();
    const t = track(engine);
    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-mariam' });
    engine.advance(30_000);
    const distinctNodes = new Set(t.get().hops.flatMap((h) => [h.fromNodeId, h.toNodeId]));
    const relays = new Set(
      t
        .get()
        .hops.flatMap((h) => [h.fromNodeId, h.toNodeId])
        .filter((id) => id.startsWith('relay-')),
    );
    expect(t.get().status).toBe('delivered');
    expect(distinctNodes.size).toBeGreaterThanOrEqual(3);
    expect(relays.size).toBeGreaterThanOrEqual(1);
    expect(t.get().hops.length).toBeGreaterThanOrEqual(2);
  });

  it('reste déterministe à graine identique', () => {
    const run = () => {
      const engine = makeEngine(42);
      const t = track(engine);
      engine.submit('d1', { senderNode: 'phone-salif', recipientNode: 'phone-mariam' });
      engine.advance(30_000);
      return t.get().hops.map((h) => `${h.fromNodeId}>${h.toNodeId}:${h.result}`).join('|');
    };
    expect(run()).toBe(run());
  });
});

describe('scénario F — panne et changement de route', () => {
  it('recalcule une route alternative après la coupure d’un lien', () => {
    const engine = makeEngine();
    const t = track(engine);
    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(800); // route calculée, premier saut en vol vers le relais Sud

    // On coupe le tronçon Sud → Est, emprunté par la route retenue.
    const links = engine
      .getLinks()
      .map((l) => (l.id === 'l-est-sud' ? { ...l, status: 'down' as const } : l));
    engine.applyGraph(engine.getNodes(), links);

    engine.advance(60_000);
    const record = t.get();
    expect(t.notes.some((n) => n.includes('reroute'))).toBe(true);
    expect(record.hops.some((h) => h.result === 'reroute')).toBe(true);
    expect(record.status).toBe('delivered');
    expect(record.events.some((e) => (e.detail ?? '').includes('nouvelle route'))).toBe(true);
  });

  it('passe en attente quand l’émetteur est coupé du réseau, puis reprend seul', () => {
    const engine = makeEngine();
    const t = track(engine);
    // Les deux liens d’Aminata sont coupés : elle est isolée.
    const links = engine.getLinks().map((l) =>
      l.id === 'l-ami-ouest' || l.id === 'l-ami-sud' ? { ...l, status: 'down' as const } : l,
    );
    engine.applyGraph(engine.getNodes(), links);

    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(10_000);

    expect(t.get().status).toBe('queued');
    expect(t.get().events.some((e) => e.to === 'delivered')).toBe(false);
    expect(t.get().events.find((e) => e.to === 'queued')?.detail).toMatch(/route|réseau|nœud/i);

    engine.applyGraph(
      engine.getNodes(),
      engine.getLinks().map((l) =>
        l.id === 'l-ami-ouest' || l.id === 'l-ami-sud' ? { ...l, status: 'up' as const } : l,
      ),
    );
    engine.advance(60_000);
    expect(t.get().status).toBe('delivered');
    expect(t.get().events.some((e) => e.reason === 'resume')).toBe(true);
  });
});

describe('scénario D — indisponibilité du Hub', () => {
  it('le réseau local continue de fonctionner sans le Hub (aucune dépendance)', () => {
    const engine = makeEngine();
    const t = track(engine);
    const nodes = engine.getNodes().map((n) => (n.kind === 'hub' ? { ...n, status: 'offline' as const } : n));
    engine.applyGraph(nodes, engine.getLinks());

    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(30_000);

    // Règle du cahier des charges : le Hub n’est pas une dépendance obligatoire.
    expect(t.get().status).toBe('delivered');
    expect(t.notes.some((n) => n.startsWith('queued'))).toBe(false);
  });

  it('met en attente les messages destinés au Hub quand il est coupé', () => {
    const engine = makeEngine();
    const t = track(engine);
    const nodes = engine.getNodes().map((n) => (n.kind === 'hub' ? { ...n, status: 'offline' as const } : n));
    engine.applyGraph(nodes, engine.getLinks());

    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'node-hub' });
    engine.advance(30_000);

    expect(t.get().status).toBe('queued');
    expect(t.get().events.map((e) => e.to)).not.toContain('delivered');
  });

  it('conserve le message au Hub quand seul le destinataire est hors ligne', () => {
    const engine = makeEngine();
    const t = track(engine);
    const nodes = engine.getNodes().map((n) => (n.id === 'phone-salif' ? { ...n, status: 'offline' as const } : n));
    engine.applyGraph(nodes, engine.getLinks());

    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(30_000);

    expect(t.get().status).toBe('queued');
    expect(t.get().storedAtHub).toBe(true);

    engine.applyGraph(
      engine.getNodes().map((n) => (n.id === 'phone-salif' ? { ...n, status: 'online' as const } : n)),
      engine.getLinks(),
    );
    engine.advance(30_000);
    expect(t.get().status).toBe('delivered');
  });
});

describe('honnêteté des statuts', () => {
  it('déclare « non confirmé » quand aucun accusé n’arrive dans le délai', () => {
    const engine = makeEngine(7);
    const t = track(engine);
    // Tous les liens perdent 100 % des paquets : le message ne peut aboutir.
    const links = engine.getLinks().map((l) => ({ ...l, lossRate: 1 }));
    engine.applyGraph(engine.getNodes(), links);

    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(TIMING.ttl + 5_000);

    expect(t.get().events.some((e) => e.to === 'unconfirmed')).toBe(true);
    expect(t.get().events.some((e) => e.to === 'delivered')).toBe(false);
  });

  it('garde la trace horodatée de chaque étape', () => {
    const engine = makeEngine();
    const t = track(engine);
    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(30_000);
    const times = t.get().events.map((e) => e.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(t.get().events.every((e) => typeof e.reason === 'string' && e.reason.length > 0)).toBe(true);
  });
});

describe('contrôle de la simulation', () => {
  it('permet de couper et rétablir un nœud', () => {
    const engine = makeEngine();
    engine.applyGraph(
      engine.getNodes().map((n) => (n.id === 'relay-sud' ? { ...n, status: 'offline' as const } : n)),
      engine.getLinks(),
    );
    expect(engine.getNodes().find((n) => n.id === 'relay-sud')?.status).toBe('offline');
    engine.applyGraph(
      engine.getNodes().map((n) => (n.id === 'relay-sud' ? { ...n, status: 'online' as const } : n)),
      engine.getLinks(),
    );
    expect(engine.getNodes().find((n) => n.id === 'relay-sud')?.status).toBe('online');
  });

  it('expose les routes en cours pour la carte', () => {
    const engine = makeEngine();
    engine.submit('d1', { senderNode: 'phone-aminata', recipientNode: 'phone-salif' });
    engine.advance(1_000);
    const active = engine.activePaths();
    expect(active).toHaveLength(1);
    expect(active[0].path[0]).toBe('phone-aminata');
    expect(engine.queuedDeliveries()).toHaveLength(0);
  });
});
