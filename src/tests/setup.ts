import '@testing-library/jest-dom/vitest';

/**
 * Environnement de test : jsdom n'expose pas toujours `crypto.subtle`.
 * On injecte le Web Crypto de Node pour tester le chiffrement et les
 * empreintes de mot de passe à l'identique du navigateur.
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: (await import('node:crypto')).webcrypto,
    configurable: true,
  });
}
