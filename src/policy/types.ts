import type { Membership, Role, SharedGrant, SharedResourceType } from '../core/types';

/** Acteur : identité + rôles + appartenance + contexte actif. */
export interface Actor {
  userId: string;
  /** Rôles globaux du compte. */
  roles: Role[];
  /** Appartenances (rôle par organisation). */
  memberships: Membership[];
  /** Organisation active ; null = contexte personnel. */
  activeOrgId: string | null;
}

export type ResourceType =
  | SharedResourceType
  | 'org'
  | 'group'
  | 'account'
  | 'config'
  | 'audit'
  | 'network'
  | 'journal'
  | 'settings'
  | 'contact';

export interface ResourceRef {
  type: ResourceType;
  id?: string;
  /** Organisation propriétaire de la ressource. */
  orgId?: string | null;
  /** Propriétaire (ressource personnelle). */
  ownerId?: string;
  /** Participants d'une conversation. */
  participantIds?: string[];
  /** Organisation destinataire (ex. demande adressée à un centre). */
  targetOrgId?: string;
}

export type DenyCode =
  | 'no_actor'
  | 'role_missing'
  | 'context_required'
  | 'not_owner'
  | 'org_mismatch'
  | 'no_grant';

export interface Decision {
  allowed: boolean;
  code: 'allow' | DenyCode;
  reason: string;
  via?: 'role' | 'grant';
}

export interface PolicyInput {
  actor: Actor | null;
  action: import('./catalog').PermAction;
  resource?: ResourceRef;
  grants?: SharedGrant[];
  now?: number;
}
