import type { MeshLink, MeshNode, Priority } from '../core/types';
import { LOSS_WEIGHT as LOSS_WEIGHT_HYP } from '../core/modelAssumptions';
import { HUB_ID, isUsable, nodeList, linkList } from './graph';

/**
 * Calcul de route (Dijkstra) sur le graphe Mesh simulé.
 *
 * Coût d'un lien : `latence / (1 - perte)^w` — une liaison lente ET peu fiable
 * devient plus chère qu'un détour. Un nœud dégradé double le coût des liens
 * qui le traversent ; un nœud hors ligne est simplement exclu du graphe.
 *
 * `w` (lossWeight) est le levier de priorité : plus il est élevé, plus le
 * routeur préfère un lien fiable à un lien rapide. `w = 1` est le comportement
 * de base, celui que couvrent les tests de routage.
 */

/** Poids hérités du fichier unique d'hypothèses (valeurs inchangées). */
export const LOSS_WEIGHT: Record<Priority, number> = LOSS_WEIGHT_HYP;

export interface Route {
  path: string[];
  cost: number;
}

export interface RouteOptions {
  lossWeight?: number;
  /** Nœuds interdits comme SAUT INTERMÉDIAIRE (ex. Hub en mode « terminus »). */
  avoid?: string[];
}

export function linkCost(link: MeshLink, a: MeshNode, b: MeshNode, lossWeight = 1): number {
  if (link.status === 'down') return Infinity;
  const reliability = Math.max(0.05, 1 - link.lossRate);
  let cost = link.latencyMs / Math.pow(reliability, lossWeight);
  if (a.status === 'degraded' || b.status === 'degraded') cost *= 2;
  return cost;
}

export function findRoute(
  nodes: MeshNode[],
  links: MeshLink[],
  from: string,
  to: string,
  options: RouteOptions = {},
): Route | null {
  const lossWeight = options.lossWeight ?? 1;
  const avoid = new Set(options.avoid ?? []);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = byId.get(from);
  const goal = byId.get(to);
  if (!isUsable(start) || !isUsable(goal)) return null;
  if (avoid.has(from) || avoid.has(to)) return null;
  if (from === to) return { path: [from], cost: 0 };

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  for (const n of nodes) if (isUsable(n)) dist.set(n.id, Infinity);
  dist.set(from, 0);

  while (true) {
    let current: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null) break;
    if (current === to) break;
    visited.add(current);

    const curNode = byId.get(current)!;
    for (const link of links) {
      let other: string | null = null;
      if (link.aNodeId === current) other = link.bNodeId;
      else if (link.bNodeId === current) other = link.aNodeId;
      if (!other) continue;
      const otherNode = byId.get(other);
      if (!isUsable(otherNode) || visited.has(other) || avoid.has(other)) continue;
      const cost = linkCost(link, curNode, otherNode, lossWeight);
      if (!isFinite(cost)) continue;
      const alt = best + cost;
      if (alt < (dist.get(other) ?? Infinity)) {
        dist.set(other, alt);
        prev.set(other, current);
      }
    }
  }

  if (!prev.has(to)) return null;
  const path: string[] = [to];
  let cursor = to;
  while (cursor !== from) {
    const p = prev.get(cursor);
    if (!p) return null;
    path.unshift(p);
    cursor = p;
    if (path.length > nodes.length + 2) return null;
  }
  return { path, cost: dist.get(to) ?? 0 };
}

/** Route standard d'un message : émetteur → Hub (le Hub est le pôle d'acheminement). */
export function routeToHub(nodes: MeshNode[], links: MeshLink[], from: string): Route | null {
  return findRoute(nodes, links, from, HUB_ID);
}

/** Utilisé par la carte : ensemble des liens actifs, pour le rendu SVG. */
export function activeLinks(nodes: MeshNode[], links: MeshLink[]): MeshLink[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return links.filter((l) => isUsable(byId.get(l.aNodeId)) && isUsable(byId.get(l.bNodeId)));
}

export { nodeList, linkList };
