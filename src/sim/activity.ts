import type { Flight } from '../mesh/engine';
import type { NodeActivity } from './types';

/**
 * Activité des nœuds, DÉRIVÉE du moteur à chaque événement :
 *  - « tx »   : ce nœud est en train d'émettre un tronçon,
 *  - « rx »   : il vient de recevoir un tronçon,
 *  - « queued»: sa file d'attente n'est pas vide,
 *  - « idle » : rien à signaler.
 *
 * L'UI ne calcule jamais cette valeur elle-même : elle ne fait qu'afficher
 * ce que le moteur observe. Impossible donc d'afficher un état faux.
 */
export function deriveActivity(
  flights: Flight[],
  queues: Record<string, number>,
): Record<string, NodeActivity> {
  const out: Record<string, NodeActivity> = {};
  for (const [nodeId, length] of Object.entries(queues)) {
    if (length > 0) out[nodeId] = 'queued';
  }
  for (const flight of flights) {
    out[flight.fromNodeId] = 'tx';
    out[flight.toNodeId] = 'rx';
  }
  return out;
}
