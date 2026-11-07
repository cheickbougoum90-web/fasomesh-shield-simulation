import { describe, expect, it } from 'vitest';
import { checkCredentials, createUser, findUser, normalizeName, validateRegistration } from '../domain/user';
import { generateSalt, hashPassword } from '../infra/crypto';

const base = {
  id: 'u_test',
  displayName: 'Aminata Traoré',
  role: 'citizen' as const,
  nodeId: 'phone-1',
  salt: 'abc123',
  passwordHash: 'hash',
  createdAt: 1_700_000_000_000,
};

describe('création de compte', () => {
  it('valide les saisies incomplètes', () => {
    expect(validateRegistration({ displayName: 'A', password: 'abcd', role: 'citizen' })).not.toHaveLength(0);
    expect(validateRegistration({ displayName: 'Aminata', password: '12', role: 'citizen' })).not.toHaveLength(0);
    expect(validateRegistration({ displayName: 'Aminata', password: '1234', role: 'citizen' })).toEqual([]);
  });

  it('crée un compte avec des réglages sûrs par défaut', () => {
    const user = createUser(base);
    expect(user.displayName).toBe('Aminata Traoré');
    expect(user.settings.locationAllowed).toBe(false);
    expect(user.settings.notificationsOn).toBe(true);
    expect(user.nodeId).toBe('phone-1');
  });

  it('trouve un compte sans tenir compte de la casse ni des espaces', () => {
    const users = [createUser(base)];
    expect(findUser(users, '  aminata   TRAORÉ ')?.id).toBe('u_test');
    expect(findUser(users, 'Inconnu')).toBeUndefined();
    expect(normalizeName('  Aminata  Traoré ')).toBe('aminata traoré');
  });
});

describe('connexion', () => {
  it('authentifie le bon mot de passe', async () => {
    const salt = generateSalt();
    const hash = await hashPassword('secret123', salt);
    const user = createUser({ ...base, salt, passwordHash: hash });
    const provided = await hashPassword('secret123', user.salt);
    expect(checkCredentials(user, provided)).toBeNull();
  });

  it('refuse un mot de passe faux avec un message explicite', async () => {
    const salt = generateSalt();
    const user = createUser({ ...base, salt, passwordHash: await hashPassword('secret123', salt) });
    const wrong = await hashPassword('mauvais', user.salt);
    expect(checkCredentials(user, wrong)).toBe('Mot de passe incorrect.');
    expect(checkCredentials(undefined, 'n’importe')).toBe('Aucun compte avec ce nom.');
  });

  it('ne stocke jamais le mot de passe en clair', async () => {
    const salt = generateSalt();
    const hash = await hashPassword('secret123', salt);
    expect(hash).not.toContain('secret123');
    expect(hash.length).toBeGreaterThan(30);
    expect(await hashPassword('secret123', salt)).toBe(hash);
    expect(await hashPassword('secret123', generateSalt())).not.toBe(hash);
  });
});
