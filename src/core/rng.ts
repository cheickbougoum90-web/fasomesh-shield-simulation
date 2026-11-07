/**
 * Aléa déterministe (mulberry32).
 *
 * La simulation doit être REJOUABLE : avec une même graine, un même scénario
 * produit exactement les mêmes pertes, les mêmes re-routes et les mêmes délais.
 * C'est ce qui rend les tests de panne de nœud fiables et non flakys.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Identifiant court, lisible et suffisamment unique pour une démonstration. */
export function uid(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}
