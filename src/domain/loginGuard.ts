import { AUTH } from '../core/modelAssumptions';

/**
 * Limite des tentatives de connexion — DÉMONSTRATION LOCALE (§9).
 *
 * Ce n'est PAS une protection de service : tout reste dans l'appareil et une
 * personne accédant au code peut la contourner. Elle montre uniquement que
 * l'écran de connexion n'est pas ouvert sans limite.
 */

export interface LoginGuard {
  count: number;
  lockedUntil: number;
}

export function newGuard(): LoginGuard {
  return { count: 0, lockedUntil: 0 };
}

export interface GuardDecision {
  allowed: boolean;
  retryInMs: number;
  /** Garde à utiliser ensuite (remise à zéro après expiration d'un blocage). */
  guard: LoginGuard;
}

export function guardAllows(guard: LoginGuard, now: number): GuardDecision {
  if (guard.lockedUntil > now) {
    return { allowed: false, retryInMs: guard.lockedUntil - now, guard };
  }
  if (guard.lockedUntil > 0) {
    // Blocage expiré : on repart d'un compteur propre.
    return { allowed: true, retryInMs: 0, guard: newGuard() };
  }
  return { allowed: true, retryInMs: 0, guard };
}

/** Enregistre un échec ; verrouille au-delà du nombre autorisé. */
export function guardFail(guard: LoginGuard, now: number): LoginGuard {
  const count = guard.count + 1;
  return {
    count,
    lockedUntil: count >= AUTH.maxAttempts ? now + AUTH.lockoutMs : guard.lockedUntil,
  };
}

/** Tente(s) réussie(s) : remise à zéro. */
export function guardReset(): LoginGuard {
  return newGuard();
}

export function attemptsLeft(guard: LoginGuard): number {
  return Math.max(0, AUTH.maxAttempts - guard.count);
}
