import type { LinkStatus, NodeStatus, Priority } from '../core/types';
import { INTERNET_ID } from '../mesh/engine';

/**
 * Scénarios prédéfinis du centre de supervision.
 *
 * Chaque scénario est un PATCH déclaratif appliqué sur un réseau d'abord
 * remis à l'état nominal, plus un ou plusieurs messages de référence.
 * `expected` est le résultat à observer — c'est aussi la matrice de
 * validation de l'étape « Tests ».
 *
 * Références (voir sim/refs) : A émetteur · B relais Sud · C relais Est ·
 * D destinataire · E relais Ouest · F relais Nord · HUB centre.
 */

export interface SimScenarioMessage {
  from: string;
  to: string;
  priority: Priority;
}

export interface SimScenario {
  id: string;
  index: number;
  title: string;
  goal: string;
  expected: string;
  nodes?: Record<string, NodeStatus>;
  links?: Record<string, LinkStatus>;
  internet?: boolean;
  messages: SimScenarioMessage[];
  /**
   * Injection de la panne EN COURS de transmission (après N ms de simulation).
   * Absent : la topologie est patchée avant l'émission.
   */
  cutAfterMs?: number;
  /** Rétablissement automatique du réseau après N ms de simulation. */
  restoreAfterMs?: number;
}

export const SCENARIOS: SimScenario[] = [
  {
    id: 's1-normal',
    index: 1,
    title: 'Fonctionnement normal',
    goal: 'Tous les nœuds sont actifs : un message traverse le réseau et revient un accusé de réception.',
    expected:
      'Le paquet parcourt A → B → C → D, le statut passe à « Reçu par le destinataire » et le journal enregistre l’accusé.',
    messages: [{ from: 'phone-aminata', to: 'phone-salif', priority: 'info' }],
  },
  {
    id: 's2-relay-down',
    index: 2,
    title: 'Panne d’un relais',
    goal: 'Le relais B tombe pendant que le message doit passer par lui (injection à 0,8 s).',
    expected:
      'Route alternative calculée (A → E → HUB → C → D), le journal annonce « Route alternative trouvée » et le message arrive.',
    nodes: { 'relay-sud': 'offline' },
    messages: [{ from: 'phone-aminata', to: 'phone-salif', priority: 'info' }],
    cutAfterMs: 800,
  },
  {
    id: 's3-multi-down',
    index: 3,
    title: 'Panne de plusieurs nœuds',
    goal: 'Quatre relais hors service : aucune route n’existe entre A et D.',
    expected:
      'Aucun chemin : le message reste en attente, puis est déclaré NON DÉLIVRABLE après 30 s de simulation. Aucun faux « reçu ».',
    nodes: {
      'relay-sud': 'offline',
      'relay-est': 'offline',
      'relay-ouest': 'offline',
      'relay-nord': 'offline',
    },
    messages: [{ from: 'phone-aminata', to: 'phone-salif', priority: 'urgent' }],
  },
  {
    id: 's4-hub-down',
    index: 4,
    title: 'Hub indisponible',
    goal: 'Le Hub est coupé : le réseau local doit continuer de fonctionner.',
    expected:
      'Le trafic local A → D continue et aboutit SANS le Hub ; le message destiné au Hub reste en attente.',
    nodes: { 'node-hub': 'offline' },
    messages: [
      { from: 'phone-aminata', to: 'phone-salif', priority: 'info' },
      { from: 'phone-mariam', to: 'node-hub', priority: 'urgent' },
    ],
  },
  {
    id: 's5-internet-down',
    index: 5,
    title: 'Internet indisponible',
    goal: 'La passerelle Internet est coupée, le Mesh local est intact.',
    expected:
      'Les messages nœud → nœud continuent normalement ; le message vers Internet reste stocké au Hub jusqu’au retour de la liaison.',
    internet: false,
    messages: [
      { from: 'phone-aminata', to: 'phone-salif', priority: 'info' },
      { from: 'phone-salif', to: INTERNET_ID, priority: 'urgent' },
    ],
  },
  {
    id: 's6-node-return',
    index: 6,
    title: 'Retour d’un nœud',
    goal: 'Les deux liens d’Aminata sont coupés, puis rétablis automatiquement après 6 s.',
    expected:
      'Le message passe en attente (« Aucune route »), puis la transmission reprend d’elle-même et aboutit.',
    links: { 'l-ami-ouest': 'down', 'l-ami-sud': 'down' },
    messages: [{ from: 'phone-aminata', to: 'phone-salif', priority: 'info' }],
    restoreAfterMs: 6000,
  },
  {
    id: 's7-partition',
    index: 7,
    title: 'Séparation du réseau',
    goal: 'Deux groupes isolés : {A, B, E, Mariam} et {HUB, C, F, D}, rétablis après 8 s.',
    expected:
      'Les messages restent en attente tant que les groupes sont séparés ; la communication reprend au rétablissement des liens.',
    links: {
      'l-est-sud': 'down',
      'l-hub-sud': 'down',
      'l-hub-ouest': 'down',
      'l-ouest-nord': 'down',
    },
    messages: [{ from: 'phone-aminata', to: 'phone-salif', priority: 'critical' }],
    restoreAfterMs: 8000,
  },
];

export function findScenario(id: string): SimScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
