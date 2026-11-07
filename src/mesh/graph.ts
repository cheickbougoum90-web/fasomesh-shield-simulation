import type { MeshLink, MeshNode, NodeStatus } from '../core/types';

/**
 * Modèle du graphe Mesh simulé : nœuds (téléphones, relais, Hub) et liens radio.
 *
 * Il n'existe AUCUN matériel réel derrière ce graphe : c'est une reconstitution
 * utilisée pour tester les scénarios de transmission, de panne et de re-route.
 */

export const HUB_ID = 'node-hub';

export function nodeList(map: Map<string, MeshNode>): MeshNode[] {
  return [...map.values()];
}

export function linkList(map: Map<string, MeshLink>): MeshLink[] {
  return [...map.values()];
}

export function buildNodeMap(nodes: MeshNode[]): Map<string, MeshNode> {
  return new Map(nodes.map((n) => [n.id, { ...n }]));
}

export function buildLinkMap(links: MeshLink[]): Map<string, MeshLink> {
  return new Map(links.map((l) => [l.id, { ...l }]));
}

export function findLinkBetween(links: MeshLink[], a: string, b: string): MeshLink | undefined {
  return links.find((l) => (l.aNodeId === a && l.bNodeId === b) || (l.aNodeId === b && l.bNodeId === a));
}

export function neighbors(links: MeshLink[], id: string): string[] {
  const out: string[] = [];
  for (const l of links) {
    if (l.status === 'down') continue;
    if (l.aNodeId === id) out.push(l.bNodeId);
    else if (l.bNodeId === id) out.push(l.aNodeId);
  }
  return out;
}

/** Un nœud « dégradé » reste utilisable mais pénalise le coût de route. */
export function isUsable(node: MeshNode | undefined): node is MeshNode {
  return !!node && node.status !== 'offline';
}

export function nodeStatusTone(status: NodeStatus): 'success' | 'warn' | 'danger' {
  if (status === 'online') return 'success';
  if (status === 'degraded') return 'warn';
  return 'danger';
}

export interface GraphHealth {
  total: number;
  online: number;
  degraded: number;
  offline: number;
  hubStatus: NodeStatus;
  /** Nœuds encore reliés au Hub en suivant les liens actifs. */
  connected: number;
  /** true si tous les téléphones peuvent atteindre le Hub. */
  allReachable: boolean;
}

/** État global du réseau, tel qu'affiché sur l'écran « État du réseau ». */
export function health(nodes: MeshNode[], links: MeshLink[]): GraphHealth {
  const byId = buildNodeMap(nodes);
  const hub = byId.get(HUB_ID);
  let connected = 0;
  const reachable = new Set<string>();
  if (hub && hub.status !== 'offline') {
    const seen = new Set<string>([HUB_ID]);
    const stack = [HUB_ID];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const next of neighbors(links, cur)) {
        if (!seen.has(next) && isUsable(byId.get(next))) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    connected = seen.size - 1;
    for (const id of seen) reachable.add(id);
  }
  const phones = nodes.filter((n) => n.kind === 'phone');
  return {
    total: nodes.length,
    online: nodes.filter((n) => n.status === 'online').length,
    degraded: nodes.filter((n) => n.status === 'degraded').length,
    offline: nodes.filter((n) => n.status === 'offline').length,
    hubStatus: hub ? hub.status : 'offline',
    connected,
    // Un téléphone n'est « joignable » que s'il atteint réellement le Hub
    // en suivant les liens actifs — pas simplement s'il est allumé.
    allReachable:
      hub !== undefined &&
      hub.status !== 'offline' &&
      phones.every((phone) => phone.status !== 'offline' && reachable.has(phone.id)),
  };
}
