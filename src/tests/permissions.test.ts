import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, ALL_ACTIONS, ROLE_LABEL, can } from '../domain/permissions';

describe('matrice des permissions', () => {
  it('refuse tout sans rôle (défense par défaut)', () => {
    for (const action of ALL_ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });

  it('n’accorde jamais le contrôle réseau au citoyen', () => {
    expect(can('citizen', 'network.toggleNode')).toBe(false);
    expect(can('citizen', 'network.toggleHub')).toBe(false);
    expect(can('citizen', 'sim.control')).toBe(false);
  });

  it('accorde la supervision complète à l’opérateur du Hub', () => {
    expect(can('operator', 'network.toggleNode')).toBe(true);
    expect(can('operator', 'network.toggleHub')).toBe(true);
    expect(can('operator', 'sim.control')).toBe(true);
  });

  it('limite chaque rôle à SES propres données', () => {
    for (const role of ['citizen', 'operator'] as const) {
      expect(can(role, 'message.readOwn')).toBe(true);
      expect(can(role, 'history.readOwn')).toBe(true);
      expect(can(role, 'settings.editOwn')).toBe(true);
      expect(can(role, 'network.view')).toBe(true);
      expect(can(role, 'alert.raise')).toBe(true);
      expect(can(role, 'alert.read')).toBe(true);
      expect(can(role, 'message.send')).toBe(true);
    }
  });

  it('libelle toutes les actions et les deux rôles', () => {
    for (const action of ALL_ACTIONS) expect(ACTION_LABEL[action]).toBeTruthy();
    expect(ROLE_LABEL.citizen).toBe('Citoyen');
    expect(ROLE_LABEL.operator).toBe('Opérateur Hub');
    expect(new Set(ALL_ACTIONS).size).toBe(ALL_ACTIONS.length);
  });

  it('distingue bien les deux rôles (différence attendue)', () => {
    const operatorOnly = ALL_ACTIONS.filter((a) => can('operator', a) && !can('citizen', a));
    expect(operatorOnly.sort()).toEqual(['network.toggleHub', 'network.toggleNode', 'sim.control'].sort());
  });
});
