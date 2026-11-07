import type { Role } from '../core/types';

/**
 * Matrice des permissions (couche HISTORIQUE, gelée à 2 rôles).
 *
 * Cette couche couvre uniquement `citizen` et `operator` : ce sont les
 * seuls rôles attribuables à l'inscription et les seuls couverts par les
 * tests existants. La couche autoritaire du produit est `src/policy/`
 * (voir docs/CONCEPTION.md §3.1) : elle agrège ce catalogue pour les
 * deux rôles historiques et l'étend aux 7 rôles restants.
 */

/** Sous-ensemble historique des rôles. */
export type LegacyRole = 'citizen' | 'operator';

export type PermissionAction =
  | 'message.send'
  | 'message.readOwn'
  | 'alert.raise'
  | 'alert.read'
  | 'network.view'
  | 'network.toggleNode'
  | 'network.toggleHub'
  | 'sim.control'
  | 'settings.editOwn'
  | 'history.readOwn';

const MATRIX: Record<LegacyRole, PermissionAction[]> = {
  citizen: [
    'message.send',
    'message.readOwn',
    'alert.raise',
    'alert.read',
    'network.view',
    'settings.editOwn',
    'history.readOwn',
  ],
  operator: [
    'message.send',
    'message.readOwn',
    'alert.raise',
    'alert.read',
    'network.view',
    'network.toggleNode',
    'network.toggleHub',
    'sim.control',
    'settings.editOwn',
    'history.readOwn',
  ],
};

export const ALL_ACTIONS: PermissionAction[] = [
  'message.send',
  'message.readOwn',
  'alert.raise',
  'alert.read',
  'network.view',
  'network.toggleNode',
  'network.toggleHub',
  'sim.control',
  'settings.editOwn',
  'history.readOwn',
];

export const ACTION_LABEL: Record<PermissionAction, string> = {
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
};

export function can(role: Role | null | undefined, action: PermissionAction): boolean {
  if (!role) return false;
  // Couche historique : seuls citizen / operator y sont définis. Les autres
  // rôles sont évalués par `src/policy` (jamais par ce contrôle obsolète).
  const actions = MATRIX[role as LegacyRole];
  return actions ? actions.includes(action) : false;
}

/** Libellés : les 9 rôles de la plateforme (affichage uniquement). */
export const ROLE_LABEL: Record<Role, string> = {
  citizen: 'Citoyen',
  operator: 'Opérateur Hub',
  family_group_admin: 'Responsable familial',
  health_agent: 'Agent de CSPS',
  health_manager: 'Responsable de CSPS',
  health_center_operator: 'Opérateur de centre',
  hospital_operator: 'Opérateur d’hôpital',
  ngo_field_agent: 'Agent de terrain ONG',
  ngo_coordinator: 'Coordinateur ONG',
  system_admin: 'Administrateur',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  citizen: 'Envoyer et recevoir des messages et alertes, consulter l’état du réseau.',
  operator: 'Tout ce que fait un citoyen, plus la supervision du réseau : coupure des nœuds, du Hub et centre des alertes.',
  family_group_admin: 'Gère un groupe familial et ses destinataires.',
  health_agent: 'Agent de santé de terrain : demandes de prise en charge, évacuations, partage de position.',
  health_manager: 'Responsable du CSPS : suivi des dossiers, statistiques, autorisation des utilisateurs locaux.',
  health_center_operator: 'Traite la boîte de réception de son centre de référence.',
  hospital_operator: 'Traite la boîte de réception hospitalière.',
  ngo_field_agent: 'Remonte alertes de terrain, incidents et rapports pour son équipe.',
  ngo_coordinator: 'Coordonne les équipes, missions et partages de son ONG.',
  system_admin: 'Gère les comptes, les organisations et la configuration — sans lire les conversations privées.',
};
