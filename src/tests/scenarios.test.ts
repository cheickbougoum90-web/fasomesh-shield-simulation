import { describe, expect, it } from 'vitest';
import type { DeliveryRecord, MeshLink, MeshNode } from '../core/types';
import { canTransition, createDelivery, pushHop, transition } from '../domain/delivery';
import { MeshEngine, TIMING, type EngineEvent } from '../mesh/engine';
import { seedLinks, seedNodes } from '../mesh/seed';
import { SCENARIOS, findScenario, type SimScenario } from '../sim/scenarios';
import { computeMetrics } from '../sim/metrics';

/**
 * Étape « Tests » — validation des 7 scénarios du cahier des charges.
 *
 * Le harnais reproduit exactement ce que fait la console (patch de topologie,
 * émission, injection de panne différée, rétablissement automatique) et rejoue
 * chaque événement du moteur dans la machine à états du domaine : une seule
 * transition illégale ferait échouer le test.
 */

interface Harness {
  engine: MeshEngine;
  records: Map<string, DeliveryRecord>;
  journal: string[];
  scenario: SimScenario;
  run: (ms: number) => void;
}

function harness(scenarioId: string): Harness {
  const scenario = findScenario(scenarioId);
  if (!scenario) throw new Error(`Scénario inconnu : ${scenarioId}`);

  const engine = new MeshEngine({ seed: 7, nodes: seedNodes(), links: seedLinks() });
  const cleanNodes: MeshNode[] = engine.getNodes();
  const cleanLinks: MeshLink[] = engine.getLinks();
  const patchedNodes = cleanNodes.map((n) =>
    scenario.nodes?.[n.id] ? { ...n, status: scenario.nodes![n.id] } : n,
  );
  const patchedLinks = cleanLinks.map((l) =>
    scenario.links?.[l.id] ? { ...l, status: scenario.links![l.id] } : l,
  );

  const records = new Map<string, DeliveryRecord>();
  const journal: string[] = [];
  let cutAt: number | null = scenario.cutAfterMs ?? null;
  let restoreAt: number | null = scenario.restoreAfterMs ?? null;

  engine.on((event: EngineEvent) => {
    if (event.type === 'journal') {
      journal.push(event.text);
      return;
    }
    if (event.type === 'status') {
      const record = records.get(event.deliveryId);
      if (!record) return;
      expect(canTransition(record.status, event.to)).toBe(true);
      records.set(
        event.deliveryId,
        transition(record, event.to, {
          at: event.at,
          reason: event.reason,
          detail: event.detail,
          storedAtHub: event.storedAtHub,
        }),
      );
      return;
    }
    if (event.type === 'hop') {
      const record = records.get(event.deliveryId);
      if (record) records.set(event.deliveryId, pushHop(record, event.hop));
    }
  });

  engine.applyGraph(scenario.cutAfterMs ? cleanNodes : patchedNodes, scenario.cutAfterMs ? cleanLinks : patchedLinks);
  engine.setInternet(scenario.internet ?? true);

  scenario.messages.forEach((message, index) => {
    const id = `M00${index + 1}`;
    records.set(id, createDelivery(id, id, 0, TIMING.ttl));
    engine.submit(id, { senderNode: message.from, recipientNode: message.to, priority: message.priority });
  });

  const run = (ms: number) => {
    const target = engine.now + ms;
    let guard = 0;
    while (engine.now < target && guard++ < 200) {
      const pending = [cutAt, restoreAt]
        .filter((t): t is number => t !== null && t > engine.now && t <= target)
        .sort((a, b) => a - b);
      const next = pending[0] ?? target;
      engine.advance(Math.max(0, next - engine.now));
      if (cutAt !== null && engine.now >= cutAt) {
        cutAt = null;
        engine.applyGraph(patchedNodes, patchedLinks);
        journal.push('Panne injectée pendant la transmission du message');
      }
      if (restoreAt !== null && engine.now >= restoreAt) {
        restoreAt = null;
        engine.applyGraph(cleanNodes, cleanLinks);
        journal.push('Rétablissement automatique');
      }
    }
  };

  return { engine, records, journal, scenario, run };
}

function statusOf(h: Harness, id: string): string {
  return h.records.get(id)?.status ?? 'absent';
}

describe('scénarios prédéfinis', () => {
  it('expose les 7 scénarios avec un résultat attendu', () => {
    expect(SCENARIOS).toHaveLength(7);
    expect(SCENARIOS.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const scenario of SCENARIOS) {
      expect(scenario.expected.length).toBeGreaterThan(20);
      expect(scenario.messages.length).toBeGreaterThan(0);
    }
  });

  it('1 — fonctionnement normal : acheminé multi-sauts puis accusé de réception', () => {
    const h = harness('s1-normal');
    h.run(30_000);
    const record = h.records.get('M001')!;
    expect(record.status).toBe('delivered');
    expect(record.hops.length).toBeGreaterThanOrEqual(3);
    expect(record.hops.some((hop) => hop.fromNodeId.startsWith('relay-'))).toBe(true);
    expect(h.journal.some((line) => line.includes('remis'))).toBe(true);
  });

  it('2 — panne d’un relais en cours de transmission : route alternative trouvée', () => {
    const h = harness('s2-relay-down');
    h.run(30_000);
    const record = h.records.get('M001')!;
    expect(h.journal.some((line) => line.includes('Route alternative trouvée'))).toBe(true);
    expect(record.hops.some((hop) => hop.result === 'reroute')).toBe(true);
    expect(record.status).toBe('delivered');
    // Après la coupure du relais Sud, le trajet passe par le relais Ouest.
    expect(record.hops.some((hop) => hop.fromNodeId === 'phone-aminata' && hop.toNodeId === 'relay-ouest')).toBe(
      true,
    );
  });

  it('3 — pannes multiples : en attente puis NON DÉLIVRABLE (jamais « reçu »)', () => {
    const h = harness('s3-multi-down');
    h.run(10_000);
    expect(statusOf(h, 'M001')).toBe('queued');
    expect(h.journal.some((line) => line.includes('mis en attente (Aucune route)'))).toBe(true);

    h.run(TIMING.noRouteGrace + 5_000);
    const record = h.records.get('M001')!;
    expect(record.status).toBe('failed');
    expect(record.events.some((event) => event.to === 'failed' && event.reason === 'no_route')).toBe(true);
    expect(record.events.some((event) => event.to === 'delivered')).toBe(false);
  });

  it('4 — Hub indisponible : le trafic local continue, le trafic destiné au Hub attend', () => {
    const h = harness('s4-hub-down');
    h.run(30_000);
    // A → D ne transite pas par le Hub : il arrive quand même.
    expect(statusOf(h, 'M001')).toBe('delivered');
    // Mariam → Hub : pas de route, mise en attente, aucun faux accusé.
    expect(statusOf(h, 'M002')).not.toBe('delivered');
    expect(h.records.get('M002')!.events.some((event) => event.to === 'queued')).toBe(true);
  });

  it('5 — Internet coupé : le Mesh local tourne, le message vers Internet attend au Hub', () => {
    const h = harness('s5-internet-down');
    h.run(30_000);
    expect(statusOf(h, 'M001')).toBe('delivered');

    const queued = h.records.get('M002')!;
    expect(queued.status).toBe('queued');
    expect(queued.storedAtHub).toBe(true);
    expect(queued.events.find((event) => event.to === 'queued')?.reason).toBe('Internet indisponible');
  });

  it('6 — retour d’un nœud : mise en attente puis reprise automatique', () => {
    const h = harness('s6-node-return');
    h.run(5_000);
    expect(statusOf(h, 'M001')).toBe('queued');

    h.run(30_000); // le rétablissement est programmé à 6 s
    const record = h.records.get('M001')!;
    expect(record.status).toBe('delivered');
    expect(record.events.some((event) => event.reason === 'resume')).toBe(true);
    expect(h.journal.some((line) => line.includes('Rétablissement automatique'))).toBe(true);
  });

  it('7 — séparation du réseau : attente tant que les groupes sont isolés, puis reprise', () => {
    const h = harness('s7-partition');
    h.run(5_000);
    expect(statusOf(h, 'M001')).toBe('queued');
    expect(h.records.get('M001')!.events.some((event) => event.to === 'delivered')).toBe(false);

    h.run(30_000); // rétablissement programmé à 8 s
    expect(statusOf(h, 'M001')).toBe('delivered');
  });
});

describe('tableau de bord dérivé', () => {
  it('recalcule les indicateurs depuis l’état du moteur', () => {
    const h = harness('s1-normal');
    h.run(30_000);

    const metrics = computeMetrics({
      nodes: h.engine.getNodes(),
      links: h.engine.getLinks(),
      deliveries: Object.fromEntries(h.records),
      stats: h.engine.getNodeStats(),
      queues: h.engine.getQueueLengths(),
      internetUp: h.engine.isInternetUp(),
    });

    expect(metrics.sent).toBe(1);
    expect(metrics.received).toBe(1);
    expect(metrics.queued).toBe(0);
    expect(metrics.failed).toBe(0);
    expect(metrics.totalNodes).toBe(8);
    expect(metrics.hubStatus).toBe('online');
    expect(metrics.relaysForwarded).toBeGreaterThan(0);
    expect(metrics.quality).toBeGreaterThan(0.5);
    expect(metrics.quality).toBeLessThanOrEqual(1);
    expect(metrics.nodes.filter((n) => n.kind === 'relay').some((n) => n.forwarded > 0)).toBe(true);
  });

  it('comptabilise correctement les nœuds hors service', () => {
    const h = harness('s3-multi-down');
    const metrics = computeMetrics({
      nodes: h.engine.getNodes(),
      links: h.engine.getLinks(),
      deliveries: Object.fromEntries(h.records),
      stats: h.engine.getNodeStats(),
      queues: h.engine.getQueueLengths(),
      internetUp: true,
    });
    expect(metrics.unavailableNodes).toBe(4);
    // Tous les relais étant hors service, plus aucun lien n’est utilisable.
    expect(metrics.activeLinks).toBe(0);
    expect(metrics.quality).toBe(0);
  });
});

describe('priorités dans les files des nœuds (R6)', () => {
  it('fait partir le message critique avant le message normal émis au même nœud', () => {
    const engine = new MeshEngine({ seed: 11, nodes: seedNodes(), links: seedLinks() });
    const firstHop: Record<string, number> = {};
    const records = new Map<string, DeliveryRecord>();

    engine.on((event) => {
      if (event.type === 'hop' && event.hop.index >= 0 && !(event.deliveryId in firstHop)) {
        firstHop[event.deliveryId] = event.at;
      }
      if (event.type === 'status') {
        const record = records.get(event.deliveryId);
        if (record) records.set(event.deliveryId, transition(record, event.to, { at: event.at, reason: event.reason }));
      }
    });

    records.set('NORMAL', createDelivery('NORMAL', 'n', 0, TIMING.ttl));
    records.set('CRITIQUE', createDelivery('CRITIQUE', 'c', 0, TIMING.ttl));
    engine.submit('NORMAL', { senderNode: 'relay-ouest', recipientNode: 'phone-salif', priority: 'info' });
    engine.submit('CRITIQUE', { senderNode: 'relay-ouest', recipientNode: 'phone-mariam', priority: 'critical' });
    engine.advance(30_000);

    expect(firstHop.NORMAL).toBeDefined();
    expect(firstHop.CRITIQUE).toBeDefined();
    expect(firstHop.CRITIQUE).toBeLessThanOrEqual(firstHop.NORMAL);
    expect(records.get('NORMAL')!.status).toBe('delivered');
    expect(records.get('CRITIQUE')!.status).toBe('delivered');
  });
});
