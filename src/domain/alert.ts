import type { Alert, Priority } from '../core/types';

/** Niveaux d'alerte : la priorité dicte la mise en avant dans l'interface. */
export const PRIORITY_META: Record<
  Priority,
  { label: string; tone: 'info' | 'warn' | 'danger'; rank: number; hint: string }
> = {
  info: { label: 'Information', tone: 'info', rank: 0, hint: 'Message d’information sans urgence.' },
  urgent: { label: 'Urgent', tone: 'warn', rank: 1, hint: 'Nécessite une attention rapide.' },
  critical: { label: 'Critique', tone: 'danger', rank: 2, hint: 'Danger immédiat : affiché en priorité absolue.' },
};

export function validateAlert(input: { title: string; body: string; priority: Priority }): string[] {
  const errors: string[] = [];
  if (input.title.trim().length < 3) errors.push('Le titre doit contenir au moins 3 caractères.');
  if (input.title.trim().length > 80) errors.push('Le titre est trop long (80 caractères max).');
  if (input.body.trim().length < 5) errors.push('Décrivez l’alerte en quelques mots (5 caractères min).');
  if (!PRIORITY_META[input.priority]) errors.push('Niveau de priorité inconnu.');
  return errors;
}

export function createAlert(input: {
  id: string;
  senderId: string;
  priority: Priority;
  title: string;
  body: string;
  geo: string | null;
  createdAt: number;
  deliveryId: string;
}): Alert {
  return {
    id: input.id,
    senderId: input.senderId,
    priority: input.priority,
    title: input.title.trim(),
    body: input.body.trim(),
    geo: input.geo,
    createdAt: input.createdAt,
    deliveryId: input.deliveryId,
    acknowledgedBy: [],
    category: null,
  };
}

/** Les alertes critiques remontent toujours en tête de liste. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const rank = PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank;
    return rank !== 0 ? rank : b.createdAt - a.createdAt;
  });
}
