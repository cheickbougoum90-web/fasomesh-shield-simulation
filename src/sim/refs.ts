/**
 * Références A–F du cahier des charges, associées aux nœuds du réseau simulé.
 *
 * Le réseau simulé conserve les nœuds réels de la démonstration (Aminata,
 * Salif, Mariam, 4 relais, Hub) ; les lettres servent de référence courte
 * dans les scénarios et l'inspecteur, comme dans l'énoncé.
 *
 * Route principale A → D (dans l'ordre) : A → B → C → D.
 */
export const NODE_REF: Record<string, string> = {
  'phone-aminata': 'A',
  'relay-sud': 'B',
  'relay-est': 'C',
  'phone-salif': 'D',
  'relay-ouest': 'E',
  'relay-nord': 'F',
  'node-hub': 'HUB',
};

export function nodeRef(nodeId: string): string {
  return NODE_REF[nodeId] ?? '';
}

export interface SimulatableNode {
  id: string;
  status: 'online' | 'degraded' | 'offline';
  load: number;
}

/**
 * Qualité de signal AFFICHÉE — valeur simulée, déterministe par nœud.
 * Ce n'est aucune mesure radio : la démo ne touche aucun matériel.
 */
export function simulatedSignal(node: SimulatableNode): number {
  if (node.status === 'offline') return 0;
  const base = 58 + ((node.id.length * 17 + node.load * 3) % 37);
  return node.status === 'degraded' ? Math.round(base * 0.55) : base;
}

/** Libellé affiché : « B · Relais Sud » ou simplement « Téléphone de Mariam ». */
export function nodeTitle(nodeId: string, name: string): string {
  const ref = NODE_REF[nodeId];
  return ref ? `${ref} · ${name}` : name;
}
