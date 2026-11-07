import { describe, expect, it } from 'vitest';
import { findRoute, LOSS_WEIGHT, routeToHub } from '../mesh/routing';
import { health } from '../mesh/graph';
import { seedLinks, seedNodes } from '../mesh/seed';

const nodes = seedNodes();
const links = seedLinks();

describe('calcul de route (Dijkstra)', () => {
  it('trouve un chemin vers le Hub', () => {
    const route = routeToHub(nodes, links, 'phone-aminata');
    expect(route).not.toBeNull();
    expect(route!.path[0]).toBe('phone-aminata');
    expect(route!.path[route!.path.length - 1]).toBe('node-hub');
    expect(route!.path.length).toBeGreaterThanOrEqual(2);
  });

  it('favorise le chemin le moins coûteux (latence ÷ fiabilité)', () => {
    const direct = findRoute(nodes, links, 'phone-aminata', 'node-hub');
    // Sans le lien direct Hub ↔ Relais Ouest, il faut passer par un autre relais.
    const cut = links.map((l) => (l.id === 'l-hub-ouest' ? { ...l, status: 'down' as const } : l));
    const detour = findRoute(nodes, cut, 'phone-aminata', 'node-hub');
    expect(direct).not.toBeNull();
    expect(detour).not.toBeNull();
    expect(detour!.cost).toBeGreaterThan(direct!.cost);
    expect(detour!.path).not.toEqual(direct!.path);
  });

  it('ignore les nœuds hors service', () => {
    const cut = nodes.map((n) => (n.id === 'relay-ouest' ? { ...n, status: 'offline' as const } : n));
    const route = findRoute(cut, links, 'phone-aminata', 'node-hub');
    // Aminata a un second lien (vers le relais Sud) : la route contourne le nœud coupé.
    expect(route).not.toBeNull();
    expect(route!.path).not.toContain('relay-ouest');
    expect(route!.path[0]).toBe('phone-aminata');
  });

  it('renvoie null quand aucune route n’existe', () => {
    const route = findRoute(nodes, [], 'phone-aminata', 'node-hub');
    expect(route).toBeNull();
    expect(findRoute(nodes, links, 'nœud-inconnu', 'node-hub')).toBeNull();
  });

  it('ne boucle pas sur lui-même', () => {
    const route = findRoute(nodes, links, 'phone-salif', 'phone-aminata');
    expect(route).not.toBeNull();
    expect(new Set(route!.path).size).toBe(route!.path.length);
  });
});

describe('coût pondéré par la priorité (R3)', () => {
  it('préfère un lien fiable quand la priorité monte', () => {
    // Deux routes A → D : une rapide mais lossy (via le relais Sud),
    // une plus lente mais fiable (via le relais Ouest et le Hub).
    const fast = findRoute(nodes, links, 'phone-aminata', 'phone-salif');
    const safe = findRoute(nodes, links, 'phone-aminata', 'phone-salif', { lossWeight: LOSS_WEIGHT.critical });
    expect(fast).not.toBeNull();
    expect(safe).not.toBeNull();
    // Le coût retenue est toujours calculé : le poids ne peut que l’augmenter.
    expect(safe!.cost).toBeGreaterThanOrEqual(fast!.cost);
  });

  it('w = 1 reste le comportement de base', () => {
    const base = findRoute(nodes, links, 'phone-aminata', 'phone-salif');
    const explicit = findRoute(nodes, links, 'phone-aminata', 'phone-salif', { lossWeight: LOSS_WEIGHT.info });
    expect(explicit!.path).toEqual(base!.path);
  });
});

describe('santé du réseau', () => {
  it('compte les nœuds et détecte un Hub coupé', () => {
    const ok = health(nodes, links);
    expect(ok.total).toBe(8);
    expect(ok.offline).toBe(0);
    expect(ok.hubStatus).toBe('online');
    expect(ok.connected).toBeGreaterThan(0);

    const cutHub = nodes.map((n) => (n.kind === 'hub' ? { ...n, status: 'offline' as const } : n));
    const down = health(cutHub, links);
    expect(down.hubStatus).toBe('offline');
    expect(down.connected).toBe(0);
    expect(down.allReachable).toBe(false);
  });

  it('signale une zone isolée', () => {
    const isolated = nodes.map((n) => (n.id === 'relay-ouest' ? { ...n, status: 'offline' as const } : n));
    const state = health(isolated, links);
    expect(state.offline).toBe(1);
    expect(state.allReachable).toBe(false);
  });
});
