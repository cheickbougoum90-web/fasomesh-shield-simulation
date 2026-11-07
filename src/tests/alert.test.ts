import { describe, expect, it } from 'vitest';
import { PRIORITY_META, createAlert, sortAlerts, validateAlert } from '../domain/alert';
import type { Alert, Priority } from '../core/types';

const valid = { title: 'Incendie au village', body: 'Feu en progression', priority: 'critical' as Priority };

describe('alertes', () => {
  it('valide le contenu', () => {
    expect(validateAlert(valid)).toEqual([]);
    expect(validateAlert({ title: 'ab', body: 'ok', priority: 'info' })).not.toHaveLength(0);
    expect(validateAlert({ title: 'Titre valide', body: 'x', priority: 'info' })).not.toHaveLength(0);
    expect(validateAlert({ title: 'Titre', body: 'Contenu', priority: 'inconnu' as Priority })).not.toHaveLength(0);
  });

  it('nettoie les espaces', () => {
    const alert = createAlert({
      id: 'a1',
      senderId: 'u1',
      priority: 'urgent',
      title: '  Route bloquée  ',
      body: '  Camion tombé  ',
      geo: null,
      createdAt: 1000,
      deliveryId: 'd1',
    });
    expect(alert.title).toBe('Route bloquée');
    expect(alert.body).toBe('Camion tombé');
    expect(alert.acknowledgedBy).toEqual([]);
  });

  it('classe les critiques en premier, puis par date', () => {
    const make = (id: string, priority: Priority, createdAt: number): Alert =>
      createAlert({ id, senderId: 'u', priority, title: `Alerte ${id}`, body: 'b', geo: null, createdAt, deliveryId: id });

    const sorted = sortAlerts([
      make('info', 'info', 300),
      make('urgent', 'urgent', 100),
      make('critique', 'critical', 50),
      make('critique2', 'critical', 400),
      make('info2', 'info', 200),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['critique2', 'critique', 'urgent', 'info', 'info2']);
  });

  it('ordonne les priorités de la plus faible à la plus grave', () => {
    expect(PRIORITY_META.info.rank).toBeLessThan(PRIORITY_META.urgent.rank);
    expect(PRIORITY_META.urgent.rank).toBeLessThan(PRIORITY_META.critical.rank);
    expect(PRIORITY_META.critical.tone).toBe('danger');
  });
});
