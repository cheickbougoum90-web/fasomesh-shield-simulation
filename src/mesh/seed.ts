import type { MeshLink, MeshNode } from '../core/types';
import { BATTERY_SEED, LINK_LATENCY_MS, LINK_LOSS_RATE } from '../core/modelAssumptions';

/**
 * Graphe Mesh de démonstration : 1 Hub central, 4 relais, 3 téléphones.
 * Positions exprimées dans le repère SVG de la carte (360 × 300).
 *
 * Plusieurs chemins existent vers le Hub : c'est ce qui permet de démontrer
 * la recherche de route alternative après une panne de nœud.
 */
export function seedNodes(): MeshNode[] {
  return [
    { id: 'node-hub', name: 'Hub Central', kind: 'hub', status: 'online', position: { x: 180, y: 145 }, battery: BATTERY_SEED['node-hub'], load: 38 },
    { id: 'relay-nord', name: 'Relais Nord', kind: 'relay', status: 'online', position: { x: 105, y: 62 }, battery: BATTERY_SEED['relay-nord'], load: 24 },
    { id: 'relay-est', name: 'Relais Est', kind: 'relay', status: 'online', position: { x: 282, y: 108 }, battery: BATTERY_SEED['relay-est'], load: 31 },
    { id: 'relay-sud', name: 'Relais Sud', kind: 'relay', status: 'online', position: { x: 232, y: 244 }, battery: BATTERY_SEED['relay-sud'], load: 19 },
    { id: 'relay-ouest', name: 'Relais Ouest', kind: 'relay', status: 'online', position: { x: 72, y: 202 }, battery: BATTERY_SEED['relay-ouest'], load: 27 },
    { id: 'phone-aminata', name: 'Téléphone d’Aminata', kind: 'phone', status: 'online', position: { x: 24, y: 268 }, battery: BATTERY_SEED['phone-aminata'], load: 6 },
    { id: 'phone-salif', name: 'Téléphone de Salif', kind: 'phone', status: 'online', position: { x: 334, y: 52 }, battery: BATTERY_SEED['phone-salif'], load: 4 },
    { id: 'phone-mariam', name: 'Téléphone de Mariam', kind: 'phone', status: 'online', position: { x: 132, y: 282 }, battery: BATTERY_SEED['phone-mariam'], load: 5 },
  ];
}

export function seedLinks(): MeshLink[] {
  const link = (id: string, aNodeId: string, bNodeId: string): MeshLink => ({
    id,
    aNodeId,
    bNodeId,
    latencyMs: LINK_LATENCY_MS[id],
    lossRate: LINK_LOSS_RATE[id],
    status: 'up',
  });

  return [
    link('l-hub-nord', 'node-hub', 'relay-nord'),
    link('l-hub-est', 'node-hub', 'relay-est'),
    link('l-hub-sud', 'node-hub', 'relay-sud'),
    link('l-hub-ouest', 'node-hub', 'relay-ouest'),
    link('l-nord-est', 'relay-nord', 'relay-est'),
    link('l-est-sud', 'relay-est', 'relay-sud'),
    link('l-sud-ouest', 'relay-sud', 'relay-ouest'),
    link('l-ouest-nord', 'relay-ouest', 'relay-nord'),
    link('l-ami-ouest', 'relay-ouest', 'phone-aminata'),
    link('l-ami-sud', 'relay-sud', 'phone-aminata'),
    link('l-salif-est', 'relay-est', 'phone-salif'),
    link('l-mariam-ouest', 'relay-ouest', 'phone-mariam'),
  ];
}

/** Graine de simulation : identique ⇒ même comportement (rejeu et tests). */
export const SIMULATION_SEED = 20261030;
