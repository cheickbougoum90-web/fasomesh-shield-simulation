// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AUTH } from '../core/modelAssumptions';
import { attemptsLeft, guardAllows, guardFail, guardReset, newGuard } from '../domain/loginGuard';
import { CryptoUnavailableError, encryptText, hashPassword, isCryptoAvailable } from '../infra/crypto';

/**
 * Corrections de la §9 (dette technique) :
 *  - échec VISIBLE quand la Web Crypto manque (plus de repli en clair),
 *  - limite des tentatives de connexion (démonstration locale).
 */

describe('limite des tentatives de connexion (§9, démonstration)', () => {
  it('autorise les premières tentatives', () => {
    const decision = guardAllows(newGuard(), 1_000);
    expect(decision.allowed).toBe(true);
    expect(attemptsLeft(newGuard())).toBe(AUTH.maxAttempts);
  });

  it('compte les échecs puis verrouille', () => {
    let guard = newGuard();
    for (let i = 0; i < AUTH.maxAttempts - 1; i++) guard = guardFail(guard, 1_000);
    expect(guardAllows(guard, 1_001).allowed).toBe(true);

    guard = guardFail(guard, 2_000);
    const locked = guardAllows(guard, 2_001);
    expect(locked.allowed).toBe(false);
    expect(locked.retryInMs).toBeGreaterThan(0);
    expect(locked.retryInMs).toBeLessThanOrEqual(AUTH.lockoutMs);
  });

  it('déverrouille après expiration et remet le compteur à zéro', () => {
    let guard = newGuard();
    for (let i = 0; i < AUTH.maxAttempts; i++) guard = guardFail(guard, 1_000);
    expect(guardAllows(guard, 1_001).allowed).toBe(false);

    const later = guardAllows(guard, 1_000 + AUTH.lockoutMs + 1);
    expect(later.allowed).toBe(true);
    expect(later.guard.count).toBe(0);
    expect(attemptsLeft(later.guard)).toBe(AUTH.maxAttempts);
  });

  it('une connexion réussie remet tout à zéro', () => {
    let guard = guardFail(newGuard(), 1_000);
    guard = guardReset();
    expect(guard.count).toBe(0);
    expect(guardAllows(guard, 2_000).allowed).toBe(true);
  });
});

describe('Web Crypto indisponible : échec visible (§9)', () => {
  it('refuse de chiffrer au lieu d’écrire en clair', async () => {
    vi.stubGlobal('crypto', {});
    try {
      expect(isCryptoAvailable()).toBe(false);
      await expect(encryptText('message secret')).rejects.toThrow(CryptoUnavailableError);
      await expect(encryptText('message secret')).rejects.toThrow(/bloquée, jamais effectuée en clair/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuse d’émarger un mot de passe au lieu de stocker le clair', async () => {
    vi.stubGlobal('crypto', {});
    try {
      await expect(hashPassword('motdepasse', 'sel')).rejects.toThrow(CryptoUnavailableError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('retrouve la cryptographie quand le contexte redevient sécurisé', async () => {
    vi.stubGlobal('crypto', {});
    vi.unstubAllGlobals();
    expect(isCryptoAvailable()).toBe(true);
    const payload = await encryptText('de nouveau chiffré');
    expect(payload).not.toBeNull();
  });
});
