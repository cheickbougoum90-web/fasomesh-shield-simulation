// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CRYPTO_INFO, decryptText, encryptText, isCryptoAvailable } from '../infra/crypto';

describe('chiffrement des messages (Web Crypto)', () => {
  it('dispose d’un chiffrement réel dans l’environnement de test', () => {
    expect(isCryptoAvailable()).toBe(true);
    expect(CRYPTO_INFO.algorithm).toContain('AES-GCM');
  });

  it('chiffre puis déchiffre à l’identique', async () => {
    const plaintext = 'Rendez-vous à la place du marché à 18 h. 🔒';
    const payload = await encryptText(plaintext);
    expect(payload).not.toBeNull();
    expect(payload!.ct).not.toContain('marché');
    expect(await decryptText(payload!)).toBe(plaintext);
  });

  it('produit un IV différent à chaque chiffrement (mêmes données ⇒ même texte)', async () => {
    const a = await encryptText('message identique');
    const b = await encryptText('message identique');
    expect(a!.iv).not.toBe(b!.iv);
    expect(a!.ct).not.toBe(b!.ct);
    expect(await decryptText(a!)).toBe(await decryptText(b!));
  });

  it('refuse un contenu altéré (contrôle d’authenticité GCM)', async () => {
    const payload = await encryptText('alerte critique');
    const bytes = Uint8Array.from(atob(payload!.ct), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    const tampered = { iv: payload!.iv, ct: btoa(String.fromCharCode(...bytes)) };
    expect(await decryptText(tampered)).toBeNull();
  });

  it('échoue proprement sur un IV invalide', async () => {
    expect(await decryptText({ iv: 'pas-du-base64!!', ct: 'vide' })).toBeNull();
  });
});
