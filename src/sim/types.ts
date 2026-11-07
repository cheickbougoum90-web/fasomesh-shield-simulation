/**
 * Types de la couche de supervision (console d'administration).
 *
 * Cette couche ne contient AUCUNE logique de réseau : elle traduit les
 * événements du moteur en objets affichables (journal, activité des nœuds).
 */

export type JournalCategory = 'network' | 'message' | 'route' | 'fault' | 'control';
export type JournalSeverity = 'info' | 'success' | 'warn' | 'danger';

export interface JournalEntry {
  /** Numéro d'ordre croissant (permet de trier même à horloge égale). */
  seq: number;
  /** Horloge de simulation (ms) au moment de l'événement. */
  simTime: number;
  category: JournalCategory;
  severity: JournalSeverity;
  text: string;
}

/** Activité IMMÉDIATE d'un nœud — dérivée, jamais stockée par l'UI. */
export type NodeActivity = 'idle' | 'queued' | 'tx' | 'rx';

export const JOURNAL_CATEGORY_LABEL: Record<JournalCategory, string> = {
  network: 'Réseau',
  message: 'Messages',
  route: 'Routage',
  fault: 'Pannes',
  control: 'Commandes',
};

export const JOURNAL_SEVERITY_CLASS: Record<JournalSeverity, string> = {
  info: 'text-slate-400',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  danger: 'text-rose-400',
};

/** Horloge de simulation formatée mm:ss (donnée simulée, pas une heure réelle). */
export function formatSimTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
