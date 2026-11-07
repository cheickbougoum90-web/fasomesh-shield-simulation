import type { Role } from '../core/types';

/** Catalogue complet des permissions métier (granulaires). */
export type PermAction =
  // — héritées de la matrice historique (galerie de compatibilité) —
  | 'message.send'
  | 'message.readOwn'
  | 'alert.raise'
  | 'alert.read'
  | 'network.view'
  | 'network.toggleNode'
  | 'network.toggleHub'
  | 'sim.control'
  | 'settings.editOwn'
  | 'history.readOwn'
  // — étendue multi-profils —
  | 'message.readOrg'
  | 'contact.search'
  | 'group.read'
  | 'group.manage'
  | 'location.share'
  | 'alert.readPublic'
  | 'care.create'
  | 'care.readOwn'
  | 'care.readOrg'
  | 'care.readInbox'
  | 'care.respond'
  | 'care.evacuate'
  | 'care.cancel'
  | 'org.read'
  | 'org.members.read'
  | 'org.members.manage'
  | 'org.manage'
  | 'stats.read'
  | 'directory.read'
  | 'center.availability'
  | 'grant.create'
  | 'grant.revoke'
  | 'hub.alert.read'
  | 'hub.categorize'
  | 'hub.stats'
  | 'journal.read'
  | 'ngo.mission.read'
  | 'ngo.mission.manage'
  | 'ngo.incident.write'
  | 'ngo.report.write'
  | 'account.read'
  | 'account.write'
  | 'config.write'
  | 'audit.read';

export const ACTION_LABEL: Record<PermAction, string> = {
  'message.send': 'Envoyer un message',
  'message.readOwn': 'Lire ses propres conversations',
  'alert.raise': 'Créer une alerte',
  'alert.read': 'Consulter les alertes du réseau',
  'network.view': 'Consulter l’état du réseau',
  'network.toggleNode': 'Couper / rétablir un nœud',
  'network.toggleHub': 'Couper / rétablir le Hub',
  'sim.control': 'Contrôler la simulation',
  'settings.editOwn': 'Modifier son profil',
  'history.readOwn': 'Consulter son historique',
  'message.readOrg': 'Lire les messages de son organisation',
  'contact.search': 'Rechercher des contacts autorisés',
  'group.read': 'Consulter ses groupes',
  'group.manage': 'Gérer un groupe familial',
  'location.share': 'Partager sa position',
  'alert.readPublic': 'Consulter les alertes publiques autorisées',
  'care.create': 'Créer une demande de prise en charge',
  'care.readOwn': 'Lire ses propres demandes',
  'care.readOrg': 'Lire les demandes de son établissement',
  'care.readInbox': 'Lire la boîte de réception adressée à son centre',
  'care.respond': 'Accepter, refuser, instruire ou clôturer',
  'care.evacuate': 'Demander une évacuation',
  'care.cancel': 'Annuler une demande qu’il a créée',
  'org.read': 'Consulter son organisation',
  'org.members.read': 'Voir les membres de son organisation',
  'org.members.manage': 'Autoriser ou suspendre un utilisateur local',
  'org.manage': 'Administrer une organisation',
  'stats.read': 'Consulter les statistiques de son établissement',
  'directory.read': 'Consulter l’annuaire sanitaire',
  'center.availability': 'Signaler sa disponibilité et ses moyens',
  'grant.create': 'Partager une ressource avec une autre organisation',
  'grant.revoke': 'Révoquer un partage',
  'hub.alert.read': 'Lire les alertes adressées au Hub',
  'hub.categorize': 'Catégoriser et orienter une alerte',
  'hub.stats': 'Consulter les statistiques du Hub',
  'journal.read': 'Consulter les journaux techniques autorisés',
  'ngo.mission.read': 'Consulter les missions de son ONG',
  'ngo.mission.manage': 'Créer et gérer des missions',
  'ngo.incident.write': 'Remonter un incident de terrain',
  'ngo.report.write': 'Rédiger un rapport',
  'account.read': 'Consulter les comptes',
  'account.write': 'Créer, modifier, désactiver un compte',
  'config.write': 'Modifier la configuration',
  'audit.read': 'Consulter le journal d’audit',
};

/** Actions que LE RÔLE administrateur ne détient jamais (moindre privilège). */
export const ADMIN_EXCLUDED: PermAction[] = [
  'message.readOwn',
  'message.readOrg',
  'alert.read',
  'alert.readPublic',
  'care.readOwn',
  'care.readOrg',
  'care.readInbox',
  'contact.search',
];

/** Actions bornées au propriétaire de la ressource. */
export const SELF_ACTIONS: PermAction[] = ['message.readOwn', 'history.readOwn', 'settings.editOwn', 'care.readOwn'];

/**
 * Actions de BOÎTE DE RÉCEPTION : la ressource vient d'une autre organisation
 * mais elle m'est ADRESSÉE — c'est sa `targetOrgId` qui doit être mon contexte,
 * pas son émetteur.
 */
export const INBOX_ACTIONS: PermAction[] = ['care.readInbox', 'care.respond'];

/** Actions nécessitant une organisation active cohérente avec la ressource. */
export const ORG_ACTIONS: PermAction[] = [
  'message.readOrg',
  'care.readOrg',
  'care.readInbox',
  'care.respond',
  'care.evacuate',
  'org.read',
  'org.members.read',
  'org.members.manage',
  'org.manage',
  'stats.read',
  'center.availability',
  'grant.create',
  'grant.revoke',
  'ngo.mission.read',
  'ngo.mission.manage',
  'ngo.incident.write',
  'ngo.report.write',
  'hub.alert.read',
  'hub.categorize',
  'hub.stats',
  'journal.read',
  'account.read',
  'account.write',
  'config.write',
  'audit.read',
];

const LEGACY: PermAction[] = [
  'message.send',
  'message.readOwn',
  'alert.raise',
  'alert.read',
  'network.view',
  'settings.editOwn',
  'history.readOwn',
];

const OPERATOR_EXTRA: PermAction[] = ['network.toggleNode', 'network.toggleHub', 'sim.control'];

const HEALTH_AGENT: PermAction[] = [...LEGACY, 'contact.search', 'location.share', 'care.create', 'care.readOwn', 'care.readOrg', 'care.evacuate', 'care.cancel', 'org.read', 'org.members.read', 'directory.read'];

const CARE_INBOX: PermAction[] = [...LEGACY, 'contact.search', 'care.readOwn', 'care.readOrg', 'care.readInbox', 'care.respond', 'org.read', 'org.members.read', 'directory.read', 'center.availability'];

const NGO_FIELD: PermAction[] = [...LEGACY, 'contact.search', 'org.read', 'org.members.read', 'ngo.mission.read', 'ngo.incident.write', 'ngo.report.write'];

export const ROLE_GRANTS: Record<Role, PermAction[]> = {
  citizen: [...LEGACY, 'contact.search', 'group.read', 'location.share', 'alert.readPublic', 'care.create', 'care.readOwn'],
  operator: [...LEGACY, ...OPERATOR_EXTRA, 'org.read', 'org.members.read', 'hub.alert.read', 'hub.categorize', 'hub.stats', 'journal.read', 'directory.read'],
  family_group_admin: [...LEGACY, 'contact.search', 'group.read', 'group.manage', 'location.share', 'alert.readPublic', 'care.create', 'care.readOwn'],
  health_agent: HEALTH_AGENT,
  health_manager: [...HEALTH_AGENT, 'message.readOrg', 'org.manage', 'org.members.manage', 'stats.read', 'audit.read', 'grant.create', 'center.availability'],
  health_center_operator: CARE_INBOX,
  hospital_operator: CARE_INBOX,
  ngo_field_agent: NGO_FIELD,
  ngo_coordinator: [...NGO_FIELD, 'org.manage', 'grant.create', 'grant.revoke', 'ngo.mission.manage'],
  system_admin: ['network.view', 'settings.editOwn', 'org.read', 'org.manage', 'org.members.read', 'account.read', 'account.write', 'config.write', 'audit.read'],
};

export const ALL_PERM_ACTIONS = Object.keys(ACTION_LABEL) as PermAction[];
