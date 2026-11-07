import type { Role, User, UserSettings } from '../core/types';

/**
 * Gestion des utilisateurs (comptes SIMULÉS : il n'y a pas de serveur d'identité).
 * Ce module reste pur : il ne fait aucun appel réseau ni crypto — le hachage
 * est fourni par la couche infrastructure et injecté par l'application.
 */

export const DEFAULT_SETTINGS: UserSettings = {
  locationAllowed: false,
  notificationsOn: true,
  simSpeed: 1,
};

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validateRegistration(input: {
  displayName: string;
  password: string;
  role: Role;
}): string[] {
  const errors: string[] = [];
  const name = input.displayName.trim();
  if (name.length < 2) errors.push('Le nom doit contenir au moins 2 caractères.');
  if (name.length > 40) errors.push('Le nom doit contenir au plus 40 caractères.');
  if (input.password.length < 4) errors.push('Le mot de passe doit contenir au moins 4 caractères.');
  if (!['citizen', 'operator'].includes(input.role)) errors.push('Profil inconnu.');
  return errors;
}

export function createUser(input: {
  id: string;
  displayName: string;
  role: Role;
  /** Rôles cumulés ; défaut = rôle principal. */
  roles?: Role[];
  nodeId: string;
  salt: string;
  passwordHash: string;
  createdAt: number;
}): User {
  const roles = input.roles && input.roles.length ? input.roles : [input.role];
  return {
    id: input.id,
    displayName: input.displayName.trim(),
    role: roles[0],
    roles,
    nodeId: input.nodeId,
    salt: input.salt,
    passwordHash: input.passwordHash,
    createdAt: input.createdAt,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function findUser(users: User[], displayName: string): User | undefined {
  const target = normalizeName(displayName);
  return users.find((u) => normalizeName(u.displayName) === target);
}

/** Vérifie l'identité : renvoie une erreur explicite, jamais un échec silencieux. */
export function checkCredentials(user: User | undefined, providedHash: string): string | null {
  if (!user) return 'Aucun compte avec ce nom.';
  if (user.passwordHash !== providedHash) return 'Mot de passe incorrect.';
  return null;
}
