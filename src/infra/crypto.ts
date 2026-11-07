import type { CipherPayload } from '../core/types';
import { CRYPTO } from '../core/modelAssumptions';
import { base64ToBytes, bytesToBase64, randomHex, toHex } from '../core/b64';

/**
 * Chiffrement des messages privés — Web Crypto (AES-GCM 256).
 *
 * HONNÊTETÉ DE LA DÉMONSTRATION :
 *  - le chiffrement est RÉEL (AES-GCM avec contrôle d'authenticité),
 *  - mais la clé est une clé de démonstration partagée : il n'existe ici
 *    AUCUN échange de clés entre appareils. En production, il faudrait un
 *    échange de clés préalable ou une infrastructure de clés dédiée.
 * Ce point est rappelé dans l'écran d'aide « Ce qui est réel / simulé ».
 */

const PASSPHRASE = 'FasoMesh Shield · clé de démonstration';
const SALT = 'fasomesh-shield-demo-salt-v1';
const ITERATIONS = CRYPTO.keyIterations;

export const CRYPTO_INFO = {
  algorithm: 'AES-GCM 256 bits',
  kdf: `PBKDF2-SHA256 · ${ITERATIONS} itérations`,
  keyOrigin: 'Clé de démonstration partagée — aucun échange de clés réel',
} as const;

let cachedKey: CryptoKey | null = null;

export function isCryptoAvailable(): boolean {
  return typeof globalThis.crypto?.subtle?.encrypt === 'function';
}

/**
 * §9 : la Web Crypto est indisponible (contexte non sécurisé) → ÉCHEC VISIBLE.
 * Plus jamais de message en clair ni d'empreinte de mot de passe de repli.
 */
export class CryptoUnavailableError extends Error {
  constructor(operation: string) {
    super(
      `Cryptographie indisponible (${operation}) : cette page n’est pas dans un contexte sécurisé. ` +
        'Aucun message ne peut être chiffré — l’opération est bloquée, jamais effectuée en clair.',
    );
    this.name = 'CryptoUnavailableError';
  }
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const subtle = globalThis.crypto.subtle;
  const encoder = new TextEncoder();
  const base = await subtle.importKey('raw', encoder.encode(PASSPHRASE), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  cachedKey = key;
  return key;
}

/** Chiffre un texte ; ÉCHEC VISIBLE si la Web Crypto est indisponible (§9). */
export async function encryptText(plain: string): Promise<CipherPayload | null> {
  if (!isCryptoAvailable()) throw new CryptoUnavailableError('chiffrement');
  try {
    const key = await getKey();
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plain),
    );
    return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ciphertext)) };
  } catch {
    return null;
  }
}

/** Déchiffre ; renvoie null si le contenu est corrompu ou la clé absente. */
export async function decryptText(payload: CipherPayload): Promise<string | null> {
  if (!isCryptoAvailable()) throw new CryptoUnavailableError('déchiffrement');
  try {
    const key = await getKey();
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.ct),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** Mot de passe de démonstration des comptes pré-chargés (affiché sur l'écran de connexion). */
export const DEMO_PASSWORD = 'fasomesh';

/** Sel aléatoire d'un compte. */
export function generateSalt(): string {
  return toHex(randomHex(16));
}

/** Empreinte PBKDF2-SHA256 du mot de passe. Jamais stocké en clair. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new CryptoUnavailableError('empreinte de mot de passe');
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: CRYPTO.passwordIterations, hash: 'SHA-256' },
    base,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}
