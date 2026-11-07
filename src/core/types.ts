/**
 * FasoMesh Shield — types partagés du domaine.
 *
 * Ce fichier est la grammaire commune de l'application. Aucune dépendance
 * React / DOM : il est consommé par le domaine, le moteur de simulation et l'UI.
 */

/**
 * Rôles de la plateforme (9, conformément au cahier des charges).
 *
 * Deux libellés historiques sont conservés pour ne pas casser les données
 * et les tests existants :
 *   - `citizen`   = CITIZEN
 *   - `operator`  = HUB_OPERATOR (opérateur du Hub)
 * Un compte peut en cumuler plusieurs ; le rôle par organisation se joue
 * dans `Membership` (voir plus bas).
 */
export type Role =
  | 'citizen'
  | 'operator'
  | 'family_group_admin'
  | 'health_agent'
  | 'health_manager'
  | 'health_center_operator'
  | 'hospital_operator'
  | 'ngo_field_agent'
  | 'ngo_coordinator'
  | 'system_admin';

/** Codes du cahier des charges, affichés dans la documentation. */
export const ROLE_CODE: Record<Role, string> = {
  citizen: 'CITIZEN',
  operator: 'HUB_OPERATOR',
  family_group_admin: 'FAMILY_GROUP_ADMIN',
  health_agent: 'HEALTH_AGENT',
  health_manager: 'HEALTH_MANAGER',
  health_center_operator: 'HEALTH_CENTER_OPERATOR',
  hospital_operator: 'HOSPITAL_OPERATOR',
  ngo_field_agent: 'NGO_FIELD_AGENT',
  ngo_coordinator: 'NGO_COORDINATOR',
  system_admin: 'SYSTEM_ADMIN',
};

export const ALL_ROLES: Role[] = Object.keys(ROLE_CODE) as Role[];

/** Type d'organisation. Les organisations sont INDÉPENDANTES. */
export type OrgKind = 'health_center' | 'hospital' | 'ngo' | 'hub' | 'family' | 'admin_network';

/** Disponibilité DÉCLARÉE d’un établissement (jamais mesurée, §9). */
export type OrgAvailability = 'open' | 'limited' | 'closed';

export const ORG_AVAILABILITY_LABEL: Record<OrgAvailability, string> = {
  open: 'Disponible',
  limited: 'Capacité limitée',
  closed: 'Indisponible',
};

/**
 * Établissement de l’annuaire sanitaire (§9).
 * `region`/`district`/`locality`/`address`/`services`/`availability` sont
 * DÉCLARÉS pour la démonstration : ce ne sont pas des données ni des mesures
 * réelles. `nodeId === null` signifie « établissement non simulé sur le graphe ».
 */
export interface Organization {
  id: string;
  kind: OrgKind;
  name: string;
  shortName: string;
  createdAt: number;
  region?: string;
  district?: string;
  locality?: string;
  address?: string;
  services?: string[];
  availability?: OrgAvailability;
  availabilityNote?: string;
  nodeId?: string | null;
}

/** Appartenance : rôle d'un utilisateur DANS UNE organisation donnée. */
export interface Membership {
  userId: string;
  orgId: string;
  role: Role;
  joinedAt: number;
  /** Autorisation locale : suspendu par le responsable ⇒ droits retirés. */
  active?: boolean;
}

/** Contexte d'application : celui depuis lequel l'utilisateur agit. */
export interface ActiveContext {
  /** null = contexte personnel (aucune organisation active). */
  orgId: string | null;
}

export type GroupKind = 'family' | 'team';

export interface Group {
  id: string;
  /** Organisation de rattachement (groupe familial rattaché au compte ou à l'ONG). */
  orgId: string | null;
  kind: GroupKind;
  name: string;
  memberIds: string[];
  createdAt: number;
}

export type SharedResourceType = 'alert' | 'care' | 'message' | 'mission' | 'report' | 'incident';
export type SharedRight = 'read' | 'respond' | 'append';

/**
 * Partage EXPLICITE entre organisations (missions communes).
 * Une ressource n'est accessible à une autre organisation QUE si elle est
 * listée ici : aucune participation à une mission n'ouvre d'accès automatique
 * aux conversations privées, aux membres ou aux données internes.
 */
export interface SharedGrant {
  id: string;
  resourceType: SharedResourceType;
  resourceId: string;
  targetOrgId: string;
  rights: SharedRight[];
  grantedBy: string;
  grantedAt: number;
  expiresAt: number | null;
}

/** Incident de terrain remonté par un agent ONG (§5). */
export interface Incident {
  id: string;
  orgId: string;
  title: string;
  detail: string;
  severity: Priority;
  reporterId: string;
  createdAt: number;
  status: 'open' | 'handled';
}

export type Priority = 'info' | 'urgent' | 'critical';

/**
 * Machine à états d'acheminement.
 * Règle produit : `accepted_local` (accepté par le nœud) et `delivered`
 * (reçu par le destinataire) sont deux états DISTINCTS et ne fusionnent jamais.
 */
export type DeliveryStatus =
  | 'draft'
  | 'created'
  | 'accepted_local'
  | 'routing'
  | 'delivered'
  | 'unconfirmed'
  | 'failed'
  | 'queued';

export type NodeKind = 'phone' | 'relay' | 'hub';
export type NodeStatus = 'online' | 'degraded' | 'offline';
export type LinkStatus = 'up' | 'down';
export type HopResult = 'ok' | 'lost' | 'reroute';

/** Teintes du système de composants. */
export type Tone = 'neutral' | 'info' | 'warn' | 'danger' | 'success' | 'muted';

export interface UserSettings {
  /** Autorisation explicite de partager la position (écran Profil). */
  locationAllowed: boolean;
  notificationsOn: boolean;
  /** Vitesse de la simulation (×1, ×4, ×16). */
  simSpeed: number;
}

export interface User {
  id: string;
  displayName: string;
  /** Rôle principal — conservé pour compatibilité (équivalent à `roles[0]`). */
  role: Role;
  /** Rôles cumulés par le compte : source de vérité. */
  roles: Role[];
  /** Nœud « téléphone » rattaché à l'utilisateur sur le graphe simulé. */
  nodeId: string;
  salt: string;
  passwordHash: string;
  createdAt: number;
  settings: UserSettings;
}

export interface Contact {
  id: string;
  ownerId: string;
  name: string;
  nodeId: string;
  favorite: boolean;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  lastActivityAt: number;
  unreadCount: number;
}

/** Un saut effectué sur le chemin simulé d'un message. */
export interface HopRecord {
  index: number;
  fromNodeId: string;
  toNodeId: string;
  at: number;
  result: HopResult;
}

/**
 * Entrée de journal horodatée d'un envoi.
 * C'est cette liste, et non un booléen, qui prouve au destinataire
 * ce qui s'est réellement passé.
 */
export interface StatusEvent {
  at: number;
  from: DeliveryStatus | null;
  to: DeliveryStatus;
  reason: string;
  detail?: string;
}

/** Charge utile chiffrée (AES-GCM) d'un message privé. */
export interface CipherPayload {
  iv: string;
  ct: string;
}

export interface DeliveryRecord {
  id: string;
  messageId: string;
  status: DeliveryStatus;
  hops: HopRecord[];
  events: StatusEvent[];
  createdAt: number;
  /** Délai au-delà duquel on affiche « non confirmé » plutôt que faux espoir. */
  expiresAt: number;
  attempts: number;
  /** true si le message est arrivé jusqu'au Hub mais pas au destinataire. */
  storedAtHub: boolean;
}

/** Types de la messagerie unifiée (§3 du cahier des charges). */
export type MessageType =
  | 'private'
  | 'group'
  | 'org'
  | 'alert'
  | 'care_request'
  | 'notification'
  | 'report';

export const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  private: 'Message privé',
  group: 'Conversation de groupe',
  org: 'Message organisationnel',
  alert: 'Alerte d’urgence',
  care_request: 'Demande de prise en charge',
  notification: 'Notification officielle',
  report: 'Rapport ou document',
};

/** Politique de confidentialité portée par le message. */
export type Confidentiality = 'private' | 'org' | 'public';

export interface Message {
  /** Identifiant persistant — base de la détection de doublons. */
  id: string;
  type: MessageType;
  conversationId: string;
  senderId: string;
  recipientId: string;
  createdAt: number;
  deliveryId: string;
  /** Organisation ou groupe éventuel. */
  orgId: string | null;
  groupId: string | null;
  confidentiality: Confidentiality;
  /** Texte en clair uniquement si non chiffré (repli de sécurité). */
  body: string | null;
  /** Chiffré avec AES-GCM quand la Web Crypto est disponible. */
  cipher: CipherPayload | null;
  priority: Priority;
  read: boolean;
  /** Date de CONSULTATION par le destinataire (« consulté »), si l'info existe. */
  consultedAt: number | null;
}

/**
 * Suivi de PRISE EN CHARGE (état humain, simulé) — distinct du transport.
 * Une réception technique (`delivered`) ne vaut jamais prise en charge.
 */
export type CareStatus =
  | 'draft'
  | 'created'
  | 'sent'
  | 'received'
  | 'acknowledged'
  | 'information_requested'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'in_transit'
  | 'arrived'
  | 'resolved'
  | 'cancelled';

export interface CareEvent {
  at: number;
  from: CareStatus | null;
  to: CareStatus;
  actorId: string;
  reason: string;
  detail?: string;
}

/** Type de demande (§5) : référence, évacuation ou avis spécialisé. */
export type CareKind = 'reference' | 'evacuation' | 'advice';

/** Constantes cliniques saisies FACULTATIVEMENT (jamais obligatoires, §5). */
export interface CareVitals {
  /** Température en °C. */
  temp: string;
  /** Tension artérielle (ex. « 12/8 »). */
  bp: string;
  /** Fréquence cardiaque (bpm). */
  hr: string;
  /** Fréquence respiratoire (cpm). */
  rr: string;
  /** Saturation en oxygène (%). */
  spo2: string;
}

/** Dossier de demande de prise en charge — NON NOMINATIF. */
export interface CareRequest {
  id: string;
  /** Identifiant de dossier non nominatif (aucun nom de patient). */
  caseRef: string;
  /** Référence, évacuation ou avis spécialisé. */
  kind: CareKind;
  type: string;
  priority: Priority;
  /** Motif de référence (facultatif). */
  motif: string;
  description: string;
  /** Signes et observations cliniques (facultatif). */
  signes: string;
  /** Constantes disponibles — aucune n’est obligatoire. */
  vitals: CareVitals;
  /** Premiers soins / mesures déjà réalisées. */
  firstAid: string;
  /** Localisation du CSPS d’origine. */
  location: string;
  desiredDestination: string;
  /** Besoin d’ambulance ou d’un autre transport. */
  transportNeeded: boolean;
  /** Besoin d’oxygène ou d’un équipement particulier. */
  oxygenNeeded: boolean;
  /** Besoin d’une équipe ou d’une assistance complémentaire. */
  teamNeeded: boolean;
  /** Instructions logistiques. */
  logisticsInstructions: string;
  complementary: string;
  senderId: string;
  /** Organisation émettrice. */
  orgId: string;
  /** Centre de référence / hôpital visé. */
  targetOrgId: string | null;
  /** Livraison de transport associée (jamais confondue avec le suivi de soin). */
  transportDeliveryId: string | null;
  createdAt: number;
  /** Horodatage de la dernière mise à jour de statut sanitaire. */
  updatedAt: number;
  status: CareStatus;
  events: CareEvent[];
  justification: string | null;
  resolvedAt: number | null;
  /** Compte rendu synthétique de clôture (§3B). */
  closingNote: string | null;
  /** Instructions adressées au CSPS par le centre de référence (§2B). */
  instructions?: string;
  /** Réponse du CSPS à une demande d’informations complémentaires (§2A). */
  informationReply?: string;
}

export interface Alert {
  id: string;
  senderId: string;
  priority: Priority;
  title: string;
  body: string;
  /** Position déclarée, uniquement si l'utilisateur l'a autorisée. */
  geo: string | null;
  createdAt: number;
  deliveryId: string;
  acknowledgedBy: string[];
  /** Catégorisation posée par l’opérateur du Hub (§5). */
  category: string | null;
}

export const ALERT_CATEGORIES = [
  'medical',
  'evacuation',
  'health_incident',
  'service_outage',
  'reinforcement',
  'logistics',
  'technical',
  'security',
  'weather',
  'other',
] as const;

/** 7 catégories sanitaires du dispositif (§8) + catégories historiques. */
export const ALERT_CATEGORY_LABEL: Record<string, string> = {
  medical: 'Urgence médicale',
  evacuation: 'Besoin d’évacuation immédiate',
  health_incident: 'Incident sanitaire',
  service_outage: 'Indisponibilité d’un service',
  reinforcement: 'Demande de renfort',
  logistics: 'Incident logistique',
  technical: 'Alerte technique / communications',
  security: 'Sécurité',
  weather: 'Météo',
  other: 'Autre',
};

export interface MeshNode {
  id: string;
  name: string;
  kind: NodeKind;
  status: NodeStatus;
  position: { x: number; y: number };
  battery: number;
  load: number;
}

export interface MeshLink {
  id: string;
  aNodeId: string;
  bNodeId: string;
  latencyMs: number;
  lossRate: number;
  status: LinkStatus;
}

export interface AppNotification {
  id: string;
  type: 'message' | 'alert' | 'system' | 'care';
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  deepLink: string | null;
}

export interface AuditEntry {
  id: string;
  at: number;
  actorId: string | null;
  actorName: string;
  action: string;
  targetId: string | null;
  detail: string;
}

export interface Toast {
  id: string;
  text: string;
  tone: Tone;
}
