import { describe, expect, it } from 'vitest';
import type { DeliveryRecord, MeshLink, MeshNode } from '../core/types';
import { canTransition, createDelivery, pushHop, transition } from '../domain/delivery';
import { MeshEngine, TIMING, type EngineEvent } from '../mesh/engine';
import { findRoute } from '../mesh/routing';

/**
 * §7 : « Le Hub peut être destinataire mais n'est jamais un passage
 * obligatoire : rends son rôle de relais configurable et teste les deux modes. »
 *
 * Deux modes :
 *  - RELAIS (défaut) : le Hub peut transiter et stocker ;
 *  - TERMINUS : le Hub n'est jamais un saut intermédiaire, ni un repli de stockage.
 */

const HUB = 'node-hub';

function node(id: string, kind: MeshNode['kind'], x: number, y: number): MeshNode {
  return { id, name: id, kind, status: 'online', position: { x, y }, battery: 80, load: 4 };
}

function link(id: string, a: string, b: string, latencyMs: number, lossRate = 0.01): MeshLink {
  return { id, aNodeId: a, bNodeId: b, latencyMs, lossRate, status: 'up' };
}

/** Graphe à DEUX chemins : via le Hub (rapide) et via un relais (lent). */
function dualGraph() {
  const nodes = [node('a', 'phone', 0, 0), node('b', 'phone', 300, 0), node('r', 'relay', 150, 60), node(HUB, 'hub', 150, -60)];
  const links = [link('l-hub-a', 'a', HUB, 600), link('l-hub-b', HUB, 'b', 600), link('l-r-a', 'a', 'r', 5000), link('l-r-b', 'r', 'b', 5000)];
  return { nodes, links };
}

/** Graphe à UN seul chemin : forcément via le Hub. */
function hubOnlyGraph() {
  const nodes = [node('a', 'phone', 0, 0), node('b', 'phone', 300, 0), node(HUB, 'hub', 150, -60)];
  const links = [link('l-hub-a', 'a', HUB, 600), link('l-hub-b', HUB, 'b', 600)];
  return { nodes, links };
}

function track(engine: MeshEngine, id = 'd1') {
  let record: DeliveryRecord = createDelivery(id, 'm1', 0, TIMING.ttl);
  const seen: string[] = [];
  engine.on((event: EngineEvent) => {
    if (event.type === 'status') {
      expect(canTransition(record.status, event.to)).toBe(true);
      record = transition(record, event.to, { at: event.at, reason: event.reason, detail: event.detail, storedAtHub: event.storedAtHub });
      seen.push(event.to);
    } else if (event.type === 'hop') {
      record = pushHop(record, event.hop);
    }
  });
  return { get: () => record, seen };
}

describe('mode RELAIS (défaut)', () => {
  it('utilise le Hub comme saut intermédiaire quand il est le chemin le moins cher', () => {
    const { nodes, links } = dualGraph();
    const engine = new MeshEngine({ seed: 7, nodes, links });
    expect(engine.getHubRelayMode()).toBe('relay');
    const t = track(engine);
    engine.submit('d1', { senderNode: 'a', recipientNode: 'b' });
    engine.advance(30_000);
    expect(t.get().status).toBe('delivered');
    expect(t.get().hops.some((h) => h.toNodeId === HUB)).toBe(true);
  });

  it('achemine quand le seul chemin passe par le Hub (repli de stockage accepté)', () => {
    const { nodes, links } = hubOnlyGraph();
    const engine = new MeshEngine({ seed: 7, nodes, links });
    const t = track(engine);
    engine.submit('d1', { senderNode: 'a', recipientNode: 'b' });
    engine.advance(30_000);
    expect(t.get().status).toBe('delivered');
    expect(t.get().hops.some((h) => h.toNodeId === HUB)).toBe(true);
  });
});

describe('mode TERMINUS', () => {
  it('refuse le Hub comme saut intermédiaire et prend le relais', () => {
    const { nodes, links } = dualGraph();
    const engine = new MeshEngine({ seed: 7, nodes, links });
    engine.setHubRelayMode('terminus');
    expect(engine.getHubRelayMode()).toBe('terminus');
    const t = track(engine);
    engine.submit('d1', { senderNode: 'a', recipientNode: 'b' });
    engine.advance(60_000);
    expect(t.get().status).toBe('delivered');
    expect(t.get().hops.some((h) => h.toNodeId === HUB)).toBe(false);
    expect(t.get().hops.some((h) => h.toNodeId === 'r')).toBe(true);
  });

  it('n’invente AUCUNE arrivée quand le seul chemin est le Hub', () => {
    const { nodes, links } = hubOnlyGraph();
    const engine = new MeshEngine({ seed: 7, nodes, links });
    engine.setHubRelayMode('terminus');
    const t = track(engine);
    engine.submit('d1', { senderNode: 'a', recipientNode: 'b' });
    engine.advance(45_000);
    expect(t.get().status).not.toBe('delivered');
    expect(t.seen).not.toContain('delivered');
  });

  it('reste capable d’ATTEINDRE le Hub quand il est le destinataire', () => {
    const { nodes, links } = hubOnlyGraph();
    const engine = new MeshEngine({ seed: 7, nodes, links });
    engine.setHubRelayMode('terminus');
    const t = track(engine);
    engine.submit('d1', { senderNode: 'a', recipientNode: HUB });
    engine.advance(30_000);
    expect(t.get().status).toBe('delivered');
  });
});

describe('calcul de route avec nœud exclu', () => {
  it('évite les nœuds listés dans `avoid`', () => {
    const { nodes, links } = dualGraph();
    const withHub = findRoute(nodes, links, 'a', 'b');
    expect(withHub?.path).toEqual(['a', HUB, 'b']);
    const withoutHub = findRoute(nodes, links, 'a', 'b', { avoid: [HUB] });
    expect(withoutHub?.path).toEqual(['a', 'r', 'b']);
  });

  it('renvoie null quand tous les chemins passent par un nœud exclu', () => {
    const { nodes, links } = hubOnlyGraph();
    expect(findRoute(nodes, links, 'a', 'b', { avoid: [HUB] })).toBeNull();
  });
});
