import { describe, expect, it } from 'vitest';
import {
  STATUS_HELP,
  STATUS_LABEL,
  STATUS_STEPS,
  STATUS_TONE,
  canRetry,
  canTransition,
  createDelivery,
  isTerminal,
  pushHop,
  stepIndex,
  transition,
} from '../domain/delivery';
import type { DeliveryStatus } from '../core/types';

const ALL: DeliveryStatus[] = [
  'draft',
  'created',
  'accepted_local',
  'routing',
  'delivered',
  'unconfirmed',
  'failed',
  'queued',
];

describe('machine à états d’acheminement', () => {
  it('crée un envoi à l’état « brouillon » avec un journal initial', () => {
    const record = createDelivery('d1', 'm1', 1000, 60_000);
    expect(record.status).toBe('draft');
    expect(record.events).toHaveLength(1);
    expect(record.expiresAt).toBe(61_000);
    expect(record.hops).toEqual([]);
    expect(record.storedAtHub).toBe(false);
  });

  it('autorise la chaîne normale création → reçu', () => {
    let record = createDelivery('d1', 'm1', 0, 60_000);
    record = transition(record, 'created', { at: 10, reason: 'submit' });
    record = transition(record, 'accepted_local', { at: 20, reason: 'node_accept' });
    record = transition(record, 'routing', { at: 30, reason: 'route' });
    record = transition(record, 'delivered', { at: 40, reason: 'ack' });
    expect(record.status).toBe('delivered');
    expect(record.events).toHaveLength(5);
    expect(isTerminal(record.status)).toBe(true);
  });

  it('refuse de fabriquer un statut « reçu » sans être passé par le routing', () => {
    const record = createDelivery('d1', 'm1', 0, 60_000);
    expect(() => transition(record, 'delivered', { at: 1, reason: 'hack' })).toThrow(/illégale/);
    expect(canTransition('created', 'delivered')).toBe(false);
    expect(canTransition('draft', 'routing')).toBe(false);
    expect(canTransition('delivered', 'queued')).toBe(false);
  });

  it('interdit toute transition sortie de « delivered »', () => {
    let record = createDelivery('d1', 'm1', 0, 60_000);
    for (const step of ['created', 'accepted_local', 'routing', 'delivered'] as DeliveryStatus[]) {
      record = transition(record, step, { at: 1, reason: 'test' });
    }
    for (const target of ALL) {
      expect(canTransition('delivered', target)).toBe(target === 'delivered');
    }
  });

  it('conserve l’information d’attente au Hub', () => {
    let record = createDelivery('d1', 'm1', 0, 60_000);
    record = transition(record, 'created', { at: 1, reason: 'submit' });
    record = transition(record, 'queued', { at: 2, reason: 'dest', storedAtHub: true });
    expect(record.storedAtHub).toBe(true);
    expect(record.status).toBe('queued');
  });

  it('autorise la reprise après panne (queued → reçu)', () => {
    let record = createDelivery('d1', 'm1', 0, 60_000);
    record = transition(record, 'created', { at: 1, reason: 'submit' });
    record = transition(record, 'queued', { at: 2, reason: 'hold' });
    record = transition(record, 'accepted_local', { at: 3, reason: 'resume' });
    record = transition(record, 'routing', { at: 4, reason: 'route' });
    record = transition(record, 'delivered', { at: 5, reason: 'ack' });
    expect(record.status).toBe('delivered');
  });

  it('compte les tentatives de saut', () => {
    let record = createDelivery('d1', 'm1', 0, 60_000);
    record = pushHop(record, { index: 0, fromNodeId: 'a', toNodeId: 'b', at: 1, result: 'ok' });
    record = pushHop(record, { index: 1, fromNodeId: 'b', toNodeId: 'c', at: 2, result: 'lost' });
    expect(record.hops).toHaveLength(2);
    expect(record.attempts).toBe(2);
  });
});

describe('vocabulaire affiché à l’utilisateur', () => {
  it('donne un libellé, un ton et une explication honnête à chaque statut', () => {
    for (const status of ALL) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(STATUS_TONE[status]).toBeTruthy();
      expect(STATUS_HELP[status]).toBeTruthy();
    }
    expect(STATUS_HELP.accepted_local).toMatch(/ne S’EST PAS encore arrivé|NE S’EST PAS/i);
    expect(STATUS_HELP.unconfirmed).toMatch(/PAS CONFIRMÉ/i);
  });

  it('propose les 4 étapes d’avancement', () => {
    expect(STATUS_STEPS).toEqual(['created', 'accepted_local', 'routing', 'delivered']);
    expect(stepIndex('draft')).toBe(0);
    expect(stepIndex('delivered')).toBe(4);
    expect(stepIndex('queued')).toBe(-1);
  });

  it('propose un renvoi seulement pour les échecs et les non-confirmés', () => {
    expect(canRetry('failed')).toBe(true);
    expect(canRetry('unconfirmed')).toBe(true);
    expect(canRetry('delivered')).toBe(false);
    expect(canRetry('routing')).toBe(false);
    expect(canRetry('queued')).toBe(false);
  });
});
