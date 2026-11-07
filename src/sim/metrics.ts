import type { DeliveryRecord, MeshLink, MeshNode, NodeStatus } from '../core/types';
import type { NodeStats } from '../mesh/engine';
import { nodeRef } from './refs';

/**
 * Indicateurs du tableau de bord — 100 % DÉRIVÉS.
 *
 * Aucun compteur n'est incrémenté par l'interface : tout est recalculé à partir
 * de l'état du moteur (nœuds, liens, enregistrements d'acheminement, compteurs
 * par nœud). La carte et le tableau de bord ne peuvent donc jamais diverger.
 */

export interface NodeMetric {
  id: string;
  ref: string;
  name: string;
  kind: MeshNode['kind'];
  status: NodeStatus;
  /** Transmissions assurées par ce relais. */
  forwarded: number;
  tx: number;
  rx: number;
  /** Paquets actuellement en file sur ce nœud. */
  queued: number;
  dropped: number;
}

export interface SimMetrics {
  totalNodes: number;
  activeNodes: number;
  degradedNodes: number;
  unavailableNodes: number;
  totalLinks: number;
  activeLinks: number;
  sent: number;
  received: number;
  queued: number;
  unconfirmed: number;
  failed: number;
  inFlight: number;
  relaysForwarded: number;
  hubStatus: NodeStatus;
  internetUp: boolean;
  /**
   * Qualité globale SIMULÉE (heuristique, pas une mesure) :
   *   liens actifs/total × (1 − perte moyenne) × (nœuds joignables/total)
   */
  quality: number;
  nodes: NodeMetric[];
}

export function computeMetrics(input: {
  nodes: MeshNode[];
  links: MeshLink[];
  deliveries: Record<string, DeliveryRecord>;
  stats: Record<string, NodeStats>;
  queues: Record<string, number>;
  internetUp: boolean;
}): SimMetrics {
  const { nodes, links, deliveries, stats, queues, internetUp } = input;

  const statusById = new Map(nodes.map((n) => [n.id, n.status]));
  // Un lien « actif » doit être debout ET ses deux extrémités joignables.
  const activeLinks = links.filter(
    (l) =>
      l.status === 'up' &&
      statusById.get(l.aNodeId) !== 'offline' &&
      statusById.get(l.bNodeId) !== 'offline',
  );
  const statuses = Object.values(deliveries);
  const count = (predicate: (d: DeliveryRecord) => boolean) => statuses.filter(predicate).length;

  const activeNodes = nodes.filter((n) => n.status !== 'offline').length;
  const unavailableNodes = nodes.filter((n) => n.status === 'offline').length;
  const degradedNodes = nodes.filter((n) => n.status === 'degraded').length;

  const avgLoss = activeLinks.length
    ? activeLinks.reduce((sum, l) => sum + l.lossRate, 0) / activeLinks.length
    : 1;
  const quality =
    nodes.length && links.length
      ? (activeLinks.length / links.length) * (1 - avgLoss) * (activeNodes / nodes.length)
      : 0;

  const nodeMetrics: NodeMetric[] = nodes.map((n) => ({
    id: n.id,
    ref: nodeRef(n.id),
    name: n.name,
    kind: n.kind,
    status: n.status,
    forwarded: stats[n.id]?.forwarded ?? 0,
    tx: stats[n.id]?.tx ?? 0,
    rx: stats[n.id]?.rx ?? 0,
    queued: queues[n.id] ?? 0,
    dropped: stats[n.id]?.dropped ?? 0,
  }));

  return {
    totalNodes: nodes.length,
    activeNodes: activeNodes - degradedNodes,
    degradedNodes,
    unavailableNodes,
    totalLinks: links.length,
    activeLinks: activeLinks.length,
    sent: statuses.length,
    received: count((d) => d.status === 'delivered'),
    queued: count((d) => d.status === 'queued'),
    unconfirmed: count((d) => d.status === 'unconfirmed'),
    failed: count((d) => d.status === 'failed'),
    inFlight: count((d) => d.status === 'routing' || d.status === 'accepted_local'),
    relaysForwarded: Object.values(stats).reduce((sum, s) => sum + s.forwarded, 0),
    hubStatus: nodes.find((n) => n.kind === 'hub')?.status ?? 'offline',
    internetUp,
    quality,
    nodes: nodeMetrics,
  };
}
