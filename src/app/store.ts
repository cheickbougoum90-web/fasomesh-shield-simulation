import { create } from 'zustand';
import type {
  Alert,
  AppNotification,
  CareKind,
  CareVitals,
  AuditEntry,
  CareRequest,
  CareStatus,
  Conversation,
  DeliveryRecord,
  Group,
  Membership,
  MeshLink,
  MeshNode,
  Incident,
  Message,
  MessageType,
  Organization,
  OrgAvailability,
  Priority,
  Role,
  SharedGrant,
  Toast,
  User,
} from '../core/types';
import { uid } from '../core/rng';
import { BATTERY_DEFAULTS, LIMITS, LINK_DEFAULTS } from '../core/modelAssumptions';
import { MeshEngine, TIMING, type EngineEvent, type NodeStats } from '../mesh/engine';
import { SIMULATION_SEED, seedLinks, seedNodes } from '../mesh/seed';
import { deriveActivity } from '../sim/activity';
import { findScenario } from '../sim/scenarios';
import type { JournalEntry, JournalSeverity, NodeActivity } from '../sim/types';
import { createDelivery, pushHop, transition } from '../domain/delivery';
import { checkCredentials, createUser, findUser, validateRegistration } from '../domain/user';
import { createAlert, validateAlert } from '../domain/alert';
import { attemptsLeft, guardAllows, guardFail, guardReset, newGuard, type LoginGuard } from '../domain/loginGuard';
import { conversationIdFor } from '../domain/message';
import { encryptText, generateSalt, hashPassword, isCryptoAvailable } from '../infra/crypto';
import { SEED_VERSION, buildSeed } from '../infra/seedData';
import { authorizeOutgoing, resumeOnBoot } from '../services/messaging';
import { actOnRequest, syncTransport } from '../services/care';
import {
  CARE_LABEL,
  CARE_TYPES,
  careTransition,
  createCareRequest as createCareDomain,
  nextCaseRef,
  validateRequestForm,
} from '../domain/care';
import { assertCan, can, makeActor } from '../policy';
import { ROLE_LABEL } from '../domain/permissions';
import { clearState, loadState, saveState, type PersistedState } from '../infra/persistence';

/** Rôles autorisés dans l’équipe d’un établissement (§2A : responsable + agent). */
const TEAM_ROLES: Role[] = ['health_agent', 'health_manager'];

/**
 * État applicatif + orchestration.
 *
 * Flux : UI → action → domaine → moteur de simulation → événements →
 *        machine à états → persistance → UI.
 * L'UI n'invente jamais un statut : elle ne fait que réagir aux événements
 * émis par le moteur et validés par `domain/delivery`.
 */

export const engine = new MeshEngine({
  seed: SIMULATION_SEED,
  nodes: seedNodes(),
  links: seedLinks(),
});

/** Journal du centre de supervision (le plus récent en tête, 500 entrées max). */
let journalSeq = 0;
function appendJournal(entry: Omit<JournalEntry, 'seq'>): void {
  const journal = useApp.getState().journal;
  useApp.setState({ journal: [{ seq: ++journalSeq, ...entry }, ...journal].slice(0, LIMITS.journalMaxEntries) });
}

/** Recalcule les données dérivées (compteurs, files, activité) depuis le moteur. */
function syncDerived(): void {
  const queueLengths = engine.getQueueLengths();
  useApp.setState({
    nodeStats: engine.getNodeStats(),
    queueLengths,
    activity: deriveActivity(engine.getFlights(), queueLengths),
  });
}

/** Écriture d’une entrée de commandes dans le journal de supervision. */
function pushControlJournalText(text: string, severity: JournalSeverity = 'info'): void {
  appendJournal({ simTime: engine.now, category: 'control', severity, text });
}

/** Rétablissement automatique programmé par un scénario (horloge de simulation). */
let scheduledRestore: { at: number; nodes: MeshNode[]; links: MeshLink[] } | null = null;
/** Injection de panne différée (scénario « panne pendant la transmission »). */
let scheduledCut: { at: number; nodes: MeshNode[]; links: MeshLink[] } | null = null;

/** Horloge de simulation rapportée à l'heure réelle de l'appareil. */
export function simWall(at: number): number {
  return Date.now() - Math.max(0, engine.now - at);
}

export type ActionResult = { ok: true; message?: string } | { ok: false; errors: string[] };

export interface AppState {
  booted: boolean;
  /** Message d’échec bloquant si la Web Crypto est indisponible (§9). */
  cryptoError: string | null;
  /** Compteur de tentatives de connexion (démonstration, non persisté). */
  loginGuard: LoginGuard;
  users: User[];
  currentUserId: string | null;
  contacts: { id: string; ownerId: string; name: string; nodeId: string; favorite: boolean }[];
  conversations: Conversation[];
  messages: Message[];
  deliveries: Record<string, DeliveryRecord>;
  alerts: Alert[];
  /** Dossiers de prise en charge (non nominatifs). */
  careRequests: CareRequest[];
  /** Incidents de terrain (espace ONG). */
  incidents: Incident[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  nodes: MeshNode[];
  links: MeshLink[];
  toasts: Toast[];
  simRunning: boolean;
  simSpeed: number;
  /** Journal de supervision (ordonné du plus récent au plus ancien). */
  journal: JournalEntry[];
  internetUp: boolean;
  nodeStats: Record<string, NodeStats>;
  queueLengths: Record<string, number>;
  activity: Record<string, NodeActivity>;
  /** Horloge de simulation de la dernière transmission observée par nœud. */
  lastActivity: Record<string, number>;

  /* ── multi-profils : organisations, appartenance, contexte actif ── */
  organizations: Organization[];
  memberships: Membership[];
  groups: Group[];
  grants: SharedGrant[];
  activeOrgId: string | null;

  boot: () => Promise<void>;
  register: (displayName: string, password: string, role: Role) => Promise<ActionResult>;
  login: (displayName: string, password: string) => Promise<ActionResult>;
  logout: () => void;
  /** Changement de contexte organisationnel (explicite, sans droits résiduels). */
  setActiveOrg: (orgId: string | null) => void;
  sendMessage: (recipientId: string, body: string, opts?: { type?: MessageType; groupId?: string | null }) => Promise<ActionResult>;
  /** Envoi vers un groupe : un exemplaire INDÉPENDANT par destinataire (§11 J). */
  sendGroupMessage: (groupId: string, body: string) => Promise<ActionResult>;
  raiseAlert: (input: { title: string; body: string; priority: Priority }) => Promise<ActionResult>;
  acknowledgeAlert: (alertId: string) => void;
  /** Catégorisation d’une alerte par l’opérateur du Hub (permission vérifiée). */
  setAlertCategory: (alertId: string, category: string) => ActionResult;
  /** Ouverture d’un dossier de prise en charge (non nominatif). */
  createCareRequest: (input: {
    type: (typeof CARE_TYPES)[number];
    priority: Priority;
    description: string;
    location: string;
    desiredDestination: string;
    complementary: string;
    targetOrgId: string;
    /** Volet identification (§5). */
    kind?: CareKind;
    motif?: string;
    /** Volet sanitaire — tout est facultatif. */
    signes?: string;
    vitals?: Partial<CareVitals>;
    firstAid?: string;
    /** Volet logistique. */
    transportNeeded?: boolean;
    oxygenNeeded?: boolean;
    teamNeeded?: boolean;
    logisticsInstructions?: string;
    /** Brouillon non transmis (§6 DRAFT). */
    draft?: boolean;
  }) => ActionResult;
  /** Soumettre un brouillon (§6 : DRAFT → SUBMITTED). */
  submitDraft: (requestId: string) => ActionResult;
  /** Acte d’opérateur sur un dossier (accuser, accepter, refuser, clôturer…). */
  careAction: (
    requestId: string,
    to: CareStatus,
    opts?: string | { justification?: string; closingNote?: string; detail?: string },
  ) => ActionResult;
  /** Incident de terrain ou réseau (ngo.incident.write OU supervision Hub). */
  reportIncident: (input: { title: string; detail: string; severity: Priority }) => ActionResult;
  /** Hub : orienter une demande vers un centre compétent (§3C). */
  orientRequest: (requestId: string, targetOrgId: string) => ActionResult;
  /** Centre : signaler sa disponibilité et ses moyens (§3B). */
  setOrgAvailability: (orgId: string, availability: OrgAvailability, note?: string) => ActionResult;
  /** Centre de référence : instructions adressées au CSPS (§2B). */
  sendInstruction: (requestId: string, text: string) => ActionResult;
  /** CSPS : réponse à une demande d’informations complémentaires (§2A). */
  careReply: (requestId: string, text: string) => ActionResult;
  /** Responsable du CSPS : gestion de son équipe (§2A). */
  addOrgMember: (userId: string, role: Role) => ActionResult;
  setMemberRole: (userId: string, role: Role) => ActionResult;
  removeOrgMember: (userId: string) => ActionResult;
  /** Partage EXPLICITE d’une ressource avec une autre organisation (§3 addendum). */
  grantShared: (input: { resourceType: SharedGrant['resourceType']; resourceId: string; targetOrgId: string }) => ActionResult;
  markConversationRead: (conversationId: string) => void;
  markAllNotificationsRead: () => void;
  retryDelivery: (deliveryId: string) => void;
  toggleNode: (nodeId: string) => void;
  toggleHub: () => void;
  restoreNetwork: () => void;
  setSimSpeed: (speed: number) => void;
  toggleSim: () => void;
  pushControlJournal: (text: string, severity?: JournalSeverity) => void;
  setInternet: (up: boolean) => void;
  addSimNode: (kind: 'relay' | 'phone') => void;
  removeSimNode: (nodeId: string) => void;
  setLinkStatus: (linkId: string, status: MeshLink['status']) => void;
  sendSimMessage: (input: { from: string; to: string; priority: Priority }) => string;
  resetNetwork: () => void;
  loadScenario: (id: string) => void;
  clearJournal: () => void;
  updateSettings: (patch: Partial<User['settings']>) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  resetDemo: () => Promise<void>;
}

const DEMO_PHONE_POSITIONS = [
  { x: 300, y: 210 },
  { x: 60, y: 110 },
  { x: 200, y: 40 },
  { x: 120, y: 240 },
];

function attachPhoneNode(nodes: MeshNode[], links: MeshLink[], nodeId: string, ownerName: string) {
  const relays = nodes.filter((n) => n.kind === 'relay');
  const base = DEMO_PHONE_POSITIONS[nodes.filter((n) => n.kind === 'phone').length % DEMO_PHONE_POSITIONS.length];
  const phone: MeshNode = {
    id: nodeId,
    name: `Téléphone de ${ownerName.split(' ')[0]}`,
    kind: 'phone',
    status: 'online',
    position: { ...base },
    battery: BATTERY_DEFAULTS.newPhone,
    load: 3,
  };
  const nearest = relays
    .slice()
    .sort(
      (a, b) =>
        Math.hypot(a.position.x - base.x, a.position.y - base.y) -
        Math.hypot(b.position.x - base.x, b.position.y - base.y),
    )[0];
  const nextNodes = [...nodes, phone];
  const nextLinks = nearest
    ? [
        ...links,
        {
          id: `l-${nodeId}-${nearest.id}`,
          aNodeId: nodeId,
          bNodeId: nearest.id,
          latencyMs: LINK_DEFAULTS.attachLatencyMs,
          lossRate: LINK_DEFAULTS.attachLossRate,
          status: 'up' as const,
        },
      ]
    : links;
  return { nodes: nextNodes, links: nextLinks };
}

export const useApp = create<AppState>()((set, get) => ({
  booted: false,
  cryptoError: null,
  loginGuard: newGuard(),
  users: [],
  currentUserId: null,
  contacts: [],
  conversations: [],
  messages: [],
  deliveries: {},
  alerts: [],
  careRequests: [],
  incidents: [],
  notifications: [],
  audit: [],
  nodes: seedNodes(),
  links: seedLinks(),
  toasts: [],
  simRunning: true,
  simSpeed: 1,
  journal: [],
  internetUp: true,
  nodeStats: {},
  queueLengths: {},
  activity: {},
  lastActivity: {},
  organizations: [],
  memberships: [],
  groups: [],
  grants: [],
  activeOrgId: null,

  async boot() {
    if (get().booted) return;
    // §9 : contexte non sécurisé → échec VISIBLE et bloquant, jamais de clair.
    if (!isCryptoAvailable()) {
      set({
        booted: true,
        cryptoError:
          'La cryptographie du navigateur est indisponible sur cette page (contexte non sécurisé). ' +
          'Aucun message ne sera écrit ni lu en clair : l’application reste bloquée ici.',
      });
      return;
    }
    let state: PersistedState | null = await loadState();
    // Un jeu de démonstration obsolète est remplacé (les comptes multi-profils
    // de la §10 sont absents de la version 1) — documenté dans docs/DEMO.md.
    if (!state || !state.seeded || !state.users?.length || (state.seedVersion ?? 1) !== SEED_VERSION) {
      state = await buildSeed();
    }
    set({
      booted: true,
      users: state.users,
      currentUserId: state.currentUserId,
      contacts: state.contacts,
      conversations: state.conversations,
      messages: state.messages,
      deliveries: state.deliveries,
      alerts: state.alerts,
      careRequests: state.careRequests ?? [],
      incidents: state.incidents ?? [],
      notifications: state.notifications,
      audit: state.audit,
      nodes: state.nodes,
      links: state.links,
      simRunning: state.simRunning,
      simSpeed: state.simSpeed,
      organizations: state.organizations ?? [],
      memberships: state.memberships ?? [],
      groups: state.groups ?? [],
      grants: state.grants ?? [],
      activeOrgId: state.activeOrgId ?? null,
      toasts: [],
    });
    engine.applyGraph(state.nodes, state.links);
    // Reprise des livraisons non terminales (§7) : mêmes identifiants, aucun doublon.
    const resumed = resumeOnBoot({
      deliveries: state.deliveries,
      messages: state.messages,
      users: state.users,
      engine,
      activeIds: engine.activePaths().map((p) => p.deliveryId),
      now: Date.now(),
    });
    if (resumed.length) {
      pushControlJournalText(`Reprise au démarrage : ${resumed.length} message(s) en attente resoumis`, 'warn');
    }
    schedulePersist();
  },

  async register(displayName, password, role) {
    const errors = validateRegistration({ displayName, password, role });
    if (errors.length) return { ok: false, errors };
    if (findUser(get().users, displayName)) {
      return { ok: false, errors: ['Ce nom est déjà utilisé sur cet appareil.'] };
    }
    const id = uid('usr');
    const nodeId = uid('phone');
    const salt = generateSalt();
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(password, salt);
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Cryptographie indisponible.'] };
    }
    const user = createUser({ id, displayName, role, nodeId, salt, passwordHash, createdAt: Date.now() });

    const graph = attachPhoneNode(get().nodes, get().links, nodeId, displayName);
    set({ nodes: graph.nodes, links: graph.links });
    engine.applyGraph(graph.nodes, graph.links);

    set((s) => ({
      users: [...s.users, user],
      currentUserId: user.id,
      notifications: [
        {
          id: uid('ntf'),
          type: 'system',
          title: 'Compte créé',
          body: `Bienvenue ${displayName} — votre appareil est relié au réseau Mesh simulé.`,
          createdAt: Date.now(),
          read: false,
          deepLink: '/app',
        },
        ...s.notifications,
      ],
      audit: [
        {
          id: uid('aud'),
          at: Date.now(),
          actorId: user.id,
          actorName: user.displayName,
          action: 'Création de compte',
          targetId: nodeId,
          detail: `Appareil rattaché au nœud ${graph.nodes.find((n) => n.id === nodeId)?.name ?? nodeId}.`,
        },
        ...s.audit,
      ],
    }));
    schedulePersist();
    get().toast(`Bienvenue ${displayName.split(' ')[0]} !`);
    return { ok: true };
  },

  async login(displayName, password) {
    // §9 : limitation des tentatives (démonstration locale).
    const now = Date.now();
    const decision = guardAllows(get().loginGuard, now);
    if (decision.guard !== get().loginGuard) set({ loginGuard: decision.guard });
    if (!decision.allowed) {
      return {
        ok: false,
        errors: [`Trop de tentatives de connexion. Réessayez dans ${Math.ceil(decision.retryInMs / 1000)} s.`],
      };
    }

    const user = findUser(get().users, displayName);
    let hash: string;
    try {
      hash = await hashPassword(password, user?.salt ?? 'inconnu');
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Cryptographie indisponible.'] };
    }
    const error = checkCredentials(user, hash);
    if (error) {
      const failed = guardFail(get().loginGuard, now);
      set({ loginGuard: failed });
      const left = attemptsLeft(failed);
      return {
        ok: false,
        errors: left > 0 ? [error, `Tentative(s) restante(s) : ${left}`] : [error, 'Connexion bloquée temporairement.'],
      };
    }
    // Contexte initial : la première organisation du compte (changement explicite ensuite).
    const mine = get().memberships.filter((m) => m.userId === user!.id);
    const kept = get().activeOrgId && mine.some((m) => m.orgId === get().activeOrgId) ? get().activeOrgId : (mine[0]?.orgId ?? null);
    set({ currentUserId: user!.id, loginGuard: guardReset(), activeOrgId: kept });
    schedulePersist();
    get().toast(`Connexion réussie — ${user!.displayName}`);
    return { ok: true };
  },

  logout() {
    set({ currentUserId: null });
    schedulePersist();
  },

  setActiveOrg(orgId) {
    const s = get();
    if (orgId !== null) {
      const membership = s.memberships.find((m) => m.userId === s.currentUserId && m.orgId === orgId);
      if (!membership) {
        s.toast('Changement de contexte refusé : vous n’êtes pas membre de cette organisation', 'warn');
        return;
      }
    }
    const org = s.organizations.find((o) => o.id === orgId);
    set({ activeOrgId: orgId });
    pushAudit({
      id: uid('aud'),
      at: Date.now(),
      actorId: s.currentUserId,
      actorName: s.users.find((u) => u.id === s.currentUserId)?.displayName ?? '—',
      action: 'Changement de contexte',
      targetId: orgId,
      detail: org ? `Contexte actif : ${org.name}` : 'Contexte personnel',
    });
    schedulePersist();
    s.toast(org ? `Contexte actif : ${org.name}` : 'Retour au contexte personnel');
  },

  async sendMessage(recipientId, body, opts) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    const recipient = s.users.find((u) => u.id === recipientId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour envoyer un message.'] };
    if (!recipient) return { ok: false, errors: ['Destinataire inconnu.'] };
    if (!body.trim()) return { ok: false, errors: ['Écrivez un message avant d’envoyer.'] };
    if (body.length > LIMITS.messageMaxLength) return { ok: false, errors: [`Message trop long (${LIMITS.messageMaxLength} caractères max).`] };

    // Couche de politique : vérifiée AVANT toute création (aucun objet fabriqué en cas de refus).
    try {
      authorizeOutgoing({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        type: opts?.type ?? 'private',
        recipientIds: [recipient.id],
        grants: s.grants,
        now: Date.now(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Opération refusée.';
      pushAudit({
        id: uid('aud'),
        at: Date.now(),
        actorId: me.id,
        actorName: me.displayName,
        action: 'Envoi refusé',
        targetId: recipient.id,
        detail: reason,
      });
      return { ok: false, errors: [reason] };
    }

    const at = Date.now();
    const messageId = uid('msg');
    const deliveryId = uid('dlv');
    let cipher = null;
    try {
      cipher = await encryptText(body.trim());
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Cryptographie indisponible.'] };
    }
    const record = createDelivery(deliveryId, messageId, at, TIMING.ttl);

    const conv = opts?.groupId ? `cv_grp_${opts.groupId}` : conversationIdFor(me.id, recipient.id);
    const exists = s.conversations.some((c) => c.id === conv);
    const conversations: Conversation[] = exists
      ? s.conversations.map((c) => (c.id === conv ? { ...c, lastActivityAt: at } : c))
      : [...s.conversations, { id: conv, participantIds: [me.id, recipient.id].sort(), lastActivityAt: at, unreadCount: 0 }];

    const message: Message = {
      id: messageId,
      type: opts?.type ?? 'private',
      conversationId: conv,
      senderId: me.id,
      recipientId: recipient.id,
      createdAt: at,
      deliveryId,
      orgId: null,
      groupId: opts?.groupId ?? null,
      confidentiality: 'private',
      body: cipher ? null : body.trim(),
      cipher,
      priority: 'info',
      read: true,
      consultedAt: null,
    };

    set({
      conversations,
      messages: [...s.messages, message],
      deliveries: { ...s.deliveries, [deliveryId]: record },
      audit: [
        {
          id: uid('aud'),
          at,
          actorId: me.id,
          actorName: me.displayName,
          action: 'Envoi de message',
          targetId: deliveryId,
          detail: `Vers ${recipient.displayName}${cipher ? ' · chiffré AES-GCM' : ' · non chiffré'}.`,
        },
        ...s.audit,
      ],
    });

    engine.submit(deliveryId, { senderNode: me.nodeId, recipientNode: recipient.nodeId });
    schedulePersist();
    return { ok: true };
  },

  async sendGroupMessage(groupId, body) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour envoyer un message.'] };
    const group = s.groups.find((g) => g.id === groupId);
    if (!group) return { ok: false, errors: ['Groupe introuvable.'] };

    // Vérification d’abord : politique + appartenance au groupe.
    try {
      authorizeOutgoing({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        type: 'group',
        recipientIds: group.memberIds.filter((id) => id !== me.id),
        group,
        grants: s.grants,
        now: Date.now(),
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }

    // Un exemplaire INDÉPENDANT par destinataire : chacun reçoit selon son réseau.
    let sent = 0;
    for (const recipientId of group.memberIds) {
      if (recipientId === me.id) continue;
      const result = await get().sendMessage(recipientId, body, { type: 'group', groupId });
      if (!result.ok) return result;
      sent += 1;
    }
    return { ok: true, message: `Message remis à ${sent} destinataire(s) du groupe.` };
  },

  async raiseAlert({ title, body, priority }) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour émettre une alerte.'] };
    const errors = validateAlert({ title, body, priority });
    if (errors.length) return { ok: false, errors };

    const at = Date.now();
    const alertId = uid('alt');
    const deliveryId = uid('dlv');
    const record = createDelivery(deliveryId, alertId, at, TIMING.ttl);
    const alert = createAlert({
      id: alertId,
      senderId: me.id,
      priority,
      title,
      body,
      geo: me.settings.locationAllowed ? 'Position déclarée (autorisée dans Profil)' : null,
      createdAt: at,
      deliveryId,
    });

    set({
      alerts: [alert, ...s.alerts],
      deliveries: { ...s.deliveries, [deliveryId]: record },
      audit: [
        {
          id: uid('aud'),
          at,
          actorId: me.id,
          actorName: me.displayName,
          action: `Alerte ${priority}`,
          targetId: alertId,
          detail: title,
        },
        ...s.audit,
      ],
    });

    engine.submit(deliveryId, { senderNode: me.nodeId, recipientNode: 'node-hub', priority });
    schedulePersist();
    get().toast('Alerte émise sur le réseau Mesh', priority === 'critical' ? 'danger' : 'warn');
    return { ok: true };
  },

  createCareRequest(input) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour ouvrir un dossier.'] };
    const errors = validateRequestForm({
      type: input.type,
      description: input.description,
      location: input.location,
      priority: input.priority,
      kind: input.kind ?? 'reference',
      targetOrgId: input.targetOrgId,
      motif: input.motif ?? '',
      signes: input.signes ?? '',
      vitals: input.vitals ?? {},
    });
    if (errors.length) return { ok: false, errors };
    if (!s.activeOrgId) return { ok: false, errors: ['Sélectionnez une organisation active avant d’ouvrir un dossier.'] };
    if (!input.targetOrgId) return { ok: false, errors: ['Indiquez la destination souhaitée.'] };

    // Couche de politique : vérifiée avant toute création.
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'care.create',
        resource: { type: 'care', orgId: s.activeOrgId },
        grants: s.grants,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Opération refusée.';
      pushAudit({
        id: uid('aud'),
        at: Date.now(),
        actorId: me.id,
        actorName: me.displayName,
        action: 'Dossier refusé',
        targetId: null,
        detail: reason,
      });
      return { ok: false, errors: [reason] };
    }

    const at = Date.now();
    const id = uid('care');
    const deliveryId = uid('dlv');
    const request = createCareDomain({
      id,
      caseRef: nextCaseRef(s.careRequests.length + 1, new Date().getFullYear()),
      kind: input.kind ?? 'reference',
      type: input.type,
      priority: input.priority,
      motif: input.motif ?? '',
      description: input.description,
      signes: input.signes ?? '',
      vitals: input.vitals ?? {},
      firstAid: input.firstAid ?? '',
      location: input.location,
      desiredDestination: input.desiredDestination,
      transportNeeded: input.transportNeeded ?? false,
      oxygenNeeded: input.oxygenNeeded ?? false,
      teamNeeded: input.teamNeeded ?? false,
      logisticsInstructions: input.logisticsInstructions ?? '',
      complementary: input.complementary,
      senderId: me.id,
      orgId: s.activeOrgId,
      targetOrgId: input.targetOrgId,
      transportDeliveryId: input.draft ? null : deliveryId,
      createdAt: at,
      draft: input.draft ?? false,
    });
    const record = input.draft ? null : createDelivery(deliveryId, id, at, TIMING.ttl);

    set({
      careRequests: [request, ...s.careRequests],
      deliveries: record ? { ...s.deliveries, [deliveryId]: record } : s.deliveries,
      audit: [
        {
          id: uid('aud'),
          at,
          actorId: me.id,
          actorName: me.displayName,
          action: `Dossier ${request.caseRef} (${request.priority})`,
          targetId: id,
          detail: `${request.type} — vers ${s.organizations.find((o) => o.id === input.targetOrgId)?.shortName ?? input.targetOrgId}`,
        },
        ...s.audit,
      ],
    });

    // Destination : le compte rattaché à l'organisation visée, sinon stockage au Hub.
    const targetMembership = s.memberships.find((m) => m.orgId === input.targetOrgId);
    const targetUser = targetMembership ? s.users.find((u) => u.id === targetMembership.userId) : undefined;
    if (input.draft) {
      schedulePersist();
      return { ok: true, message: `Brouillon ${request.caseRef} enregistré localement (non transmis).` };
    }
    engine.submit(deliveryId, {
      senderNode: me.nodeId,
      recipientNode: targetUser?.nodeId ?? 'node-hub',
      priority: input.priority,
    });
    const sent = syncTransport(request, 'created', at);
    useApp.setState({ careRequests: get().careRequests.map((r) => (r.id === id ? sent : r)) });
    schedulePersist();
    return { ok: true, message: `Dossier ${request.caseRef} ouvert et transmis (état : envoyé).` };
  },

  submitDraft(requestId) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour soumettre un brouillon.'] };
    const request = s.careRequests.find((r) => r.id === requestId);
    if (!request || request.status !== 'draft') return { ok: false, errors: ['Brouillon introuvable.'] };
    if (!s.activeOrgId) return { ok: false, errors: ['Sélectionnez une organisation active.'] };
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'care.create',
        resource: { type: 'care', orgId: s.activeOrgId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const at = Date.now();
    const deliveryId = uid('dlv');
    let next = careTransition(request, 'created', {
      at,
      actorId: me.id,
      reason: 'submit_draft',
      detail: 'Brouillon soumis au réseau simulé',
    });
    next = { ...next, transportDeliveryId: deliveryId };
    const record = createDelivery(deliveryId, request.id, at, TIMING.ttl);
    const targetMembership = s.memberships.find((m) => m.orgId === request.targetOrgId);
    const targetUser = targetMembership ? s.users.find((u) => u.id === targetMembership.userId) : undefined;
    set({
      careRequests: s.careRequests.map((r) => (r.id === requestId ? next : r)),
      deliveries: { ...s.deliveries, [deliveryId]: record },
    });
    engine.submit(deliveryId, {
      senderNode: me.nodeId,
      recipientNode: targetUser?.nodeId ?? 'node-hub',
      priority: request.priority,
    });
    const sentDraft = syncTransport(next, 'created', at);
    useApp.setState({ careRequests: get().careRequests.map((r) => (r.id === requestId ? sentDraft : r)) });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: me.id,
      actorName: me.displayName,
      action: `Brouillon ${request.caseRef} soumis`,
      targetId: request.id,
      detail: 'Passage de l’état brouillon à transmis',
    });
    schedulePersist();
    return { ok: true, message: `Dossier ${request.caseRef} transmis au réseau.` };
  },

  careAction(requestId, to, opts) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour agir sur un dossier.'] };
    const request = s.careRequests.find((r) => r.id === requestId);
    if (!request) return { ok: false, errors: ['Dossier introuvable.'] };
    const params = typeof opts === 'string' ? { justification: opts } : (opts ?? {});
    try {
      const next = actOnRequest({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        request,
        to,
        justification: params.justification,
        closingNote: params.closingNote,
        detail: params.detail,
        grants: s.grants,
        now: Date.now(),
      });
      const at = Date.now();
      const notif: AppNotification = {
        id: uid('ntf'),
        type: 'care',
        title: `Dossier ${request.caseRef} — ${CARE_LABEL[to]}`,
        body: params.justification ?? params.closingNote ?? params.detail ?? 'Mise à jour du suivi sanitaire.',
        createdAt: at,
        read: false,
        deepLink: `/app/care/${requestId}`,
      };
      set({
        careRequests: s.careRequests.map((r) => (r.id === requestId ? next : r)),
        notifications: [notif, ...s.notifications],
      });
      pushAudit({
        id: uid('aud'),
        at,
        actorId: me.id,
        actorName: me.displayName,
        action: `Dossier ${request.caseRef} → ${CARE_LABEL[to]}`,
        targetId: requestId,
        detail: params.justification ?? params.closingNote ?? 'Acte d’opérateur enregistré',
      });
      schedulePersist();
      return { ok: true };
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Acte refusé.'] };
    }
  },

  reportIncident(input) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour signaler un incident.'] };
    if (input.title.trim().length < 3 || input.detail.trim().length < 5) {
      return { ok: false, errors: ['Titre (3 car. min) et description (5 car. min) requis.'] };
    }
    if (!s.activeOrgId) return { ok: false, errors: ['Sélectionnez une organisation active.'] };
    // Signalé soit par un agent de terrain (ngo.incident.write), soit par le
    // Hub qui supervise le réseau (network.toggleHub) — incidents réseau §2C.
    const incidentActor = makeActor(me, s.memberships, s.activeOrgId);
    const mayReport =
      can({ actor: incidentActor, action: 'ngo.incident.write', resource: { type: 'org', orgId: s.activeOrgId }, grants: s.grants }) ||
      can({ actor: incidentActor, action: 'network.toggleHub', grants: s.grants });
    if (!mayReport) {
      return { ok: false, errors: ['Opération refusée : permission de signaler un incident requise.'] };
    }
    const incident: Incident = {
      id: uid('inc'),
      orgId: s.activeOrgId,
      title: input.title.trim(),
      detail: input.detail.trim(),
      severity: input.severity,
      reporterId: me.id,
      createdAt: Date.now(),
      status: 'open',
    };
    set({ incidents: [incident, ...s.incidents] });
    pushAudit({
      id: uid('aud'),
      at: incident.createdAt,
      actorId: me.id,
      actorName: me.displayName,
      action: 'Incident de terrain',
      targetId: incident.id,
      detail: incident.title,
    });
    schedulePersist();
    return { ok: true, message: `Incident enregistré dans ${s.organizations.find((o) => o.id === s.activeOrgId)?.shortName ?? 'l’organisation'}.` };
  },

  orientRequest(requestId, targetOrgId) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour orienter une demande.'] };
    if (!s.activeOrgId) return { ok: false, errors: ['Sélectionnez une organisation active.'] };
    const request = s.careRequests.find((r) => r.id === requestId);
    if (!request) return { ok: false, errors: ['Dossier introuvable.'] };
    const target = s.organizations.find((o) => o.id === targetOrgId);
    if (!target) return { ok: false, errors: ['Établissement de destination inconnu.'] };
    if (targetOrgId === request.targetOrgId) return { ok: false, errors: ['Le dossier est déjà orienté vers cet établissement.'] };
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'hub.categorize',
        resource: { type: 'org', orgId: s.activeOrgId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const at = Date.now();
    const previous = s.organizations.find((o) => o.id === request.targetOrgId)?.shortName ?? 'non orienté';
    const next: CareRequest = {
      ...request,
      targetOrgId,
      updatedAt: at,
      events: [
        ...request.events,
        {
          at,
          from: request.status,
          to: request.status,
          actorId: me.id,
          reason: 'orientation',
          detail: `Orientation : ${previous} → ${target.shortName}`,
        },
      ],
    };
    set({
      careRequests: s.careRequests.map((r) => (r.id === requestId ? next : r)),
      notifications: [
        {
          id: uid('ntf'),
          type: 'care',
          title: `Dossier ${request.caseRef} orienté`,
          body: `Nouvelle destination : ${target.name}`,
          createdAt: at,
          read: false,
          deepLink: `/app/care/${requestId}`,
        },
        ...s.notifications,
      ],
    });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: me.id,
      actorName: me.displayName,
      action: `Orientation du dossier ${request.caseRef}`,
      targetId: requestId,
      detail: `${previous} → ${target.shortName}`,
    });
    schedulePersist();
    return { ok: true, message: `Dossier orienté vers ${target.name}.` };
  },

  setOrgAvailability(orgId, availability, note) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour modifier la disponibilité.'] };
    if (!['open', 'limited', 'closed'].includes(availability)) {
      return { ok: false, errors: ['Valeur de disponibilité inconnue.'] };
    }
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'center.availability',
        resource: { type: 'org', orgId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const at = Date.now();
    const org = s.organizations.find((o) => o.id === orgId);
    set({
      organizations: s.organizations.map((o) =>
        o.id === orgId
          ? { ...o, availability, availabilityNote: note?.trim() ? note.trim() : o.availabilityNote }
          : o,
      ),
    });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: me.id,
      actorName: me.displayName,
      action: 'Disponibilité déclarée',
      targetId: orgId,
      detail: `${org?.shortName ?? orgId} → ${availability}${note ? ` (${note})` : ''}`,
    });
    schedulePersist();
    return { ok: true, message: 'Disponibilité enregistrée (déclarée, non mesurée).' };
  },

  sendInstruction(requestId, text) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour adresser des instructions.'] };
    const request = s.careRequests.find((r) => r.id === requestId);
    if (!request) return { ok: false, errors: ['Dossier introuvable.'] };
    const trimmed = text.trim();
    if (trimmed.length < 3) return { ok: false, errors: ['Instruction trop courte (3 caractères minimum).'] };
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'care.respond',
        resource: { type: 'care', id: request.id, orgId: request.orgId, targetOrgId: request.targetOrgId ?? undefined },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const at = Date.now();
    set({
      careRequests: s.careRequests.map((r) => (r.id === requestId ? { ...r, instructions: trimmed, updatedAt: at } : r)),
      notifications: [
        {
          id: uid('ntf'),
          type: 'care',
          title: `Dossier ${request.caseRef} — instructions du centre`,
          body: trimmed,
          createdAt: at,
          read: false,
          deepLink: `/app/care/${requestId}`,
        } satisfies AppNotification,
        ...s.notifications,
      ],
    });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: me.id,
      actorName: me.displayName,
      action: `Instructions au CSPS — dossier ${request.caseRef}`,
      targetId: requestId,
      detail: trimmed,
    });
    schedulePersist();
    return { ok: true, message: 'Instructions transmises au CSPS (notification créée).' };
  },

  careReply(requestId, text) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour répondre.'] };
    const request = s.careRequests.find((r) => r.id === requestId);
    if (!request) return { ok: false, errors: ['Dossier introuvable.'] };
    if (request.status !== 'information_requested') {
      return { ok: false, errors: ['Aucune demande d’informations en cours sur ce dossier.'] };
    }
    const trimmed = text.trim();
    if (trimmed.length < 3) return { ok: false, errors: ['Réponse trop courte (3 caractères minimum).'] };
    try {
      // Seul l’établissement ÉMETTEUR peut répondre : le centre n’attend
      // qu’une information, il ne délègue jamais sa décision sanitaire.
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'care.readOrg',
        resource: { type: 'care', id: request.id, orgId: request.orgId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const at = Date.now();
    set({
      careRequests: s.careRequests.map((r) =>
        r.id === requestId ? { ...r, informationReply: trimmed, updatedAt: at } : r,
      ),
      notifications: [
        {
          id: uid('ntf'),
          type: 'care',
          title: `Dossier ${request.caseRef} — informations fournies`,
          body: trimmed,
          createdAt: at,
          read: false,
          deepLink: `/app/care/${requestId}`,
        } satisfies AppNotification,
        ...s.notifications,
      ],
    });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: me.id,
      actorName: me.displayName,
      action: `Informations fournies — dossier ${request.caseRef}`,
      targetId: requestId,
      detail: trimmed,
    });
    schedulePersist();
    return { ok: true, message: 'Informations transmises au centre (notification créée).' };
  },

  addOrgMember(userId, role) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour gérer l’équipe.'] };
    const orgId = s.activeOrgId;
    if (!orgId) return { ok: false, errors: ['Sélectionnez d’abord votre établissement (contexte actif).'] };
    if (!TEAM_ROLES.includes(role)) return { ok: false, errors: ['Rôle inconnu pour un établissement sanitaire.'] };
    const target = s.users.find((u) => u.id === userId);
    if (!target) return { ok: false, errors: ['Compte introuvable.'] };
    if (s.memberships.some((m) => m.userId === userId && m.orgId === orgId)) {
      return { ok: false, errors: ['Cet utilisateur fait déjà partie de l’établissement.'] };
    }
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'org.members.manage',
        resource: { type: 'org', orgId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const at = Date.now();
    set({
      memberships: [...s.memberships, { userId, orgId, role, joinedAt: at }],
    });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: me.id,
      actorName: me.displayName,
      action: `Équipe — ajout de ${target.displayName}`,
      targetId: userId,
      detail: `${ROLE_LABEL[role]} dans ${s.organizations.find((o) => o.id === orgId)?.shortName ?? orgId}`,
    });
    schedulePersist();
    return { ok: true, message: `${target.displayName} ajouté à l’équipe.` };
  },

  setMemberRole(userId, role) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour gérer l’équipe.'] };
    const orgId = s.activeOrgId;
    if (!orgId) return { ok: false, errors: ['Sélectionnez d’abord votre établissement (contexte actif).'] };
    if (!TEAM_ROLES.includes(role)) return { ok: false, errors: ['Rôle inconnu pour un établissement sanitaire.'] };
    const membership = s.memberships.find((m) => m.userId === userId && m.orgId === orgId);
    if (!membership) return { ok: false, errors: ['Ce membre n’appartient pas à l’établissement.'] };
    if (membership.role === role) return { ok: false, errors: ['Ce membre a déjà ce rôle.'] };
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'org.members.manage',
        resource: { type: 'org', orgId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const at = Date.now();
    const target = s.users.find((u) => u.id === userId);
    set({
      memberships: s.memberships.map((m) =>
        m.userId === userId && m.orgId === orgId ? { ...m, role } : m,
      ),
    });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: me.id,
      actorName: me.displayName,
      action: `Équipe — rôle de ${target?.displayName ?? userId}`,
      targetId: userId,
      detail: `${ROLE_LABEL[membership.role]} → ${ROLE_LABEL[role]}`,
    });
    schedulePersist();
    return { ok: true, message: `Rôle mis à jour : ${ROLE_LABEL[role]}.` };
  },

  removeOrgMember(userId) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour gérer l’équipe.'] };
    const orgId = s.activeOrgId;
    if (!orgId) return { ok: false, errors: ['Sélectionnez d’abord votre établissement (contexte actif).'] };
    if (userId === me.id) return { ok: false, errors: ['Vous ne pouvez pas retirer votre propre appartenance.'] };
    const membership = s.memberships.find((m) => m.userId === userId && m.orgId === orgId);
    if (!membership) return { ok: false, errors: ['Ce membre n’appartient pas à l’établissement.'] };
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'org.members.manage',
        resource: { type: 'org', orgId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const at = Date.now();
    const target = s.users.find((u) => u.id === userId);
    set({ memberships: s.memberships.filter((m) => !(m.userId === userId && m.orgId === orgId)) });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: me.id,
      actorName: me.displayName,
      action: `Équipe — retrait de ${target?.displayName ?? userId}`,
      targetId: userId,
      detail: `Rôle ${ROLE_LABEL[membership.role]} retiré`,
    });
    schedulePersist();
    return { ok: true, message: `${target?.displayName ?? 'Le membre'} a été retiré de l’équipe.` };
  },

  grantShared(input) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour partager.'] };
    if (!s.activeOrgId) return { ok: false, errors: ['Sélectionnez une organisation active.'] };
    if (input.targetOrgId === s.activeOrgId) return { ok: false, errors: ['Le partage cible une autre organisation.'] };
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'grant.create',
        resource: { type: 'org', orgId: s.activeOrgId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    const grant: SharedGrant = {
      id: uid('grt'),
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      targetOrgId: input.targetOrgId,
      rights: ['read'],
      grantedBy: me.id,
      grantedAt: Date.now(),
      expiresAt: null,
    };
    set({ grants: [...s.grants, grant] });
    pushAudit({
      id: uid('aud'),
      at: grant.grantedAt,
      actorId: me.id,
      actorName: me.displayName,
      action: 'Partage inter-organisations',
      targetId: grant.id,
      detail: `${grant.resourceType} → ${s.organizations.find((o) => o.id === input.targetOrgId)?.shortName ?? input.targetOrgId}`,
    });
    schedulePersist();
    return { ok: true };
  },

  acknowledgeAlert(alertId) {
    const s = get();
    const userId = s.currentUserId;
    if (!userId) return;
    set({
      alerts: s.alerts.map((a) =>
        a.id === alertId && !a.acknowledgedBy.includes(userId) ? { ...a, acknowledgedBy: [...a.acknowledgedBy, userId] } : a,
      ),
    });
    schedulePersist();
  },

  setAlertCategory(alertId, category) {
    const s = get();
    const me = s.users.find((u) => u.id === s.currentUserId);
    if (!me) return { ok: false, errors: ['Connectez-vous pour catégoriser une alerte.'] };
    try {
      assertCan({
        actor: makeActor(me, s.memberships, s.activeOrgId),
        action: 'hub.categorize',
        resource: { type: 'alert', id: alertId },
        grants: s.grants,
      });
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'Opération refusée.'] };
    }
    set({ alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, category } : a)) });
    pushAudit({
      id: uid('aud'),
      at: Date.now(),
      actorId: me.id,
      actorName: me.displayName,
      action: 'Alerte catégorisée',
      targetId: alertId,
      detail: category,
    });
    schedulePersist();
    return { ok: true };
  },

  markConversationRead(conversationId) {
    const s = get();
    const target = s.conversations.find((c) => c.id === conversationId);
    if (!target || target.unreadCount === 0) return;
    set({
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      messages: s.messages.map((m) =>
        m.conversationId === conversationId && m.recipientId === s.currentUserId && !m.read
          ? { ...m, read: true }
          : m,
      ),
    });
    schedulePersist();
  },

  markAllNotificationsRead() {
    set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) });
    schedulePersist();
  },

  retryDelivery(deliveryId) {
    engine.retry(deliveryId);
    get().toast('Renvoi demandé — nouvelle tentative en cours');
    schedulePersist();
  },

  toggleNode(nodeId) {
    const s = get();
    const nodes = s.nodes.map((n) =>
      n.id === nodeId
        ? { ...n, status: n.status === 'offline' ? ('online' as const) : ('offline' as const) }
        : n,
    );
    applyGraph(nodes, s.links);
    const target = nodes.find((n) => n.id === nodeId);
    get().toast(
      target?.status === 'offline' ? `${target.name} coupé` : `${target?.name} rétabli`,
      target?.status === 'offline' ? 'danger' : 'success',
    );
  },

  toggleHub() {
    const s = get();
    const hub = s.nodes.find((n) => n.kind === 'hub');
    if (!hub) return;
    const nodes = s.nodes.map((n) =>
      n.kind === 'hub'
        ? { ...n, status: n.status === 'offline' ? ('online' as const) : ('offline' as const) }
        : n,
    );
    applyGraph(nodes, s.links);
    get().toast(
      hub.status === 'offline' ? 'Hub rétabli' : 'Hub coupé — les messages passeront en attente',
      hub.status === 'offline' ? 'success' : 'danger',
    );
  },

  restoreNetwork() {
    const nodes = get().nodes.map((n) => ({ ...n, status: 'online' as const }));
    const links = get().links.map((l) => ({ ...l, status: 'up' as const }));
    applyGraph(nodes, links);
    get().toast('Réseau entièrement rétabli', 'success');
  },

  setSimSpeed(speed) {
    set({ simSpeed: speed });
    schedulePersist();
  },

  toggleSim() {
    set({ simRunning: !get().simRunning });
    schedulePersist();
  },

  pushControlJournal(text, severity = 'info') {
    pushControlJournalText(text, severity);
  },

  setInternet(up) {
    engine.setInternet(up);
  },

  addSimNode(kind) {
    const s = get();
    if (s.nodes.length >= LIMITS.maxSimNodes) {
      s.toast(`Nombre maximal de nœuds atteint (${LIMITS.maxSimNodes})`, 'warn');
      return;
    }
    const anchors = s.nodes.filter((n) => n.status !== 'offline' && n.kind !== 'hub');
    const anchor = anchors[s.nodes.length % Math.max(1, anchors.length)] ?? s.nodes[0];
    const count = s.nodes.filter((n) => n.kind === kind).length + 1;
    const id = uid(kind === 'relay' ? 'relay' : 'phone');
    const angle = s.nodes.length * 2.4;
    const node: MeshNode = {
      id,
      name: kind === 'relay' ? `Relais ${count}` : `Appareil ${count}`,
      kind,
      status: 'online',
      position: {
        x: Math.min(326, Math.max(34, Math.round(anchor.position.x + Math.cos(angle) * 74))),
        y: Math.min(266, Math.max(34, Math.round(anchor.position.y + Math.sin(angle) * 62))),
      },
      battery: BATTERY_DEFAULTS.newNodeMin + ((s.nodes.length * 7) % BATTERY_DEFAULTS.newNodeSpan),
      load: 4 + ((s.nodes.length * 5) % 14),
    };
    const others = s.nodes
      .filter((n) => n.id !== id && n.status !== 'offline')
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - node.position.x, a.position.y - node.position.y) -
          Math.hypot(b.position.x - node.position.x, b.position.y - node.position.y),
      )
      .slice(0, 2);
    const links = [...s.links];
    for (const other of others) {
      const exists = links.some(
        (l) =>
          (l.aNodeId === other.id && l.bNodeId === id) || (l.aNodeId === id && l.bNodeId === other.id),
      );
      if (exists) continue;
      links.push({
        id: `l-${id}-${other.id}`,
        aNodeId: id,
        bNodeId: other.id,
        latencyMs: LINK_DEFAULTS.newNodeLatencyMs,
        lossRate: LINK_DEFAULTS.newNodeLossRate,
        status: 'up',
      });
    }
    applyGraph([...s.nodes, node], links);
    pushControlJournalText(`Nœud ajouté : ${node.name} (relié à ${others.map((o) => o.name).join(' et ')})`, 'success');
    s.toast(`${node.name} ajouté au réseau simulé`);
  },

  removeSimNode(nodeId) {
    const s = get();
    const node = s.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.kind === 'hub') {
      s.toast('Le Hub ne peut pas être supprimé', 'warn');
      return;
    }
    if (s.users.some((u) => u.nodeId === nodeId)) {
      s.toast('Ce nœud est rattaché à un compte utilisateur', 'warn');
      return;
    }
    applyGraph(
      s.nodes.filter((n) => n.id !== nodeId),
      s.links.filter((l) => l.aNodeId !== nodeId && l.bNodeId !== nodeId),
    );
    pushControlJournalText(`Nœud supprimé : ${node.name} (liens associés retirés)`, 'danger');
  },

  setLinkStatus(linkId, status) {
    const s = get();
    const link = s.links.find((l) => l.id === linkId);
    if (!link || link.status === status) return;
    applyGraph(
      s.nodes,
      s.links.map((l) => (l.id === linkId ? { ...l, status } : l)),
    );
  },

  sendSimMessage({ from, to, priority }) {
    const s = get();
    const known = Object.keys(s.deliveries)
      .filter((id) => /^M\d+$/.test(id))
      .map((id) => Number(id.slice(1)));
    const next = (known.length ? Math.max(...known) : 0) + 1;
    const deliveryId = `M${String(next).padStart(3, '0')}`;
    const record = createDelivery(deliveryId, `sim_${deliveryId}`, Date.now(), TIMING.ttl);
    set({ deliveries: { ...s.deliveries, [deliveryId]: record } });
    engine.submit(deliveryId, { senderNode: from, recipientNode: to, priority });
    schedulePersist();
    return deliveryId;
  },

  resetNetwork() {
    const nodes = get().nodes.map((n) => ({ ...n, status: 'online' as const }));
    const links = get().links.map((l) => ({ ...l, status: 'up' as const }));
    applyGraph(nodes, links);
    engine.setInternet(true);
    pushControlJournalText('Réseau réinitialisé : tous les nœuds et liens sont actifs', 'success');
    get().toast('Réseau réinitialisé');
  },

  loadScenario(id) {
    const scenario = findScenario(id);
    if (!scenario) return;
    const cleanNodes = get().nodes.map((n) => ({ ...n, status: 'online' as const }));
    const cleanLinks = get().links.map((l) => ({ ...l, status: 'up' as const }));
    const nodes = cleanNodes.map((n) =>
      scenario.nodes?.[n.id] ? { ...n, status: scenario.nodes![n.id] } : n,
    );
    const links = cleanLinks.map((l) =>
      scenario.links?.[l.id] ? { ...l, status: scenario.links![l.id] } : l,
    );
    // Panne immédiate, ou réseau nominal d'abord si la panne doit frapper
    // pendant la transmission (scénario 2).
    scheduledCut = scenario.cutAfterMs
      ? { at: engine.now + scenario.cutAfterMs, nodes, links }
      : null;
    scheduledRestore = scenario.restoreAfterMs
      ? { at: engine.now + scenario.restoreAfterMs, nodes: cleanNodes, links: cleanLinks }
      : null;
    applyGraph(scheduledCut ? cleanNodes : nodes, scheduledCut ? cleanLinks : links);
    engine.setInternet(scenario.internet ?? true);
    set({ journal: [] });
    pushControlJournalText(`Scénario ${scenario.index} — ${scenario.title} : ${scenario.goal}`, 'info');
    for (const message of scenario.messages) {
      const deliveryId = get().sendSimMessage({
        from: message.from,
        to: message.to,
        priority: message.priority,
      });
      pushControlJournalText(
        `Scénario ${scenario.index} : message ${deliveryId} émis (${message.from} → ${message.to})`,
        'info',
      );
    }
    if (scenario.restoreAfterMs) {
      pushControlJournalText(
        `Rétablissement automatique programmé dans ${Math.round(scenario.restoreAfterMs / 1000)} s de simulation`,
        'info',
      );
    }
    if (scenario.cutAfterMs) {
      pushControlJournalText(
        `Panne programmée dans ${(scenario.cutAfterMs / 1000).toFixed(1)} s (pendant la transmission)`,
        'danger',
      );
    }
    get().toast(`Scénario ${scenario.index} chargé : ${scenario.title}`);
  },

  clearJournal() {
    set({ journal: [] });
  },

  updateSettings(patch) {
    const s = get();
    if (!s.currentUserId) return;
    set({
      users: s.users.map((u) => (u.id === s.currentUserId ? { ...u, settings: { ...u.settings, ...patch } } : u)),
    });
    if (patch.simSpeed) set({ simSpeed: patch.simSpeed });
    schedulePersist();
  },

  toast(text, tone = 'info') {
    const id = uid('toast');
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => get().dismissToast(id), 3500);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  async resetDemo() {
    await clearState();
    const seed = await buildSeed();
    set({
      booted: true,
      ...seed,
      currentUserId: null,
      toasts: [],
    });
    engine.applyGraph(seed.nodes, seed.links);
    schedulePersist();
    get().toast('Données de démonstration réinitialisées');
  },
}));

// ── graph + persistance ─────────────────────────────────────────────────────
function applyGraph(nodes: MeshNode[], links: MeshLink[]): void {
  useApp.setState({ nodes, links });
  engine.applyGraph(nodes, links);
  schedulePersist();
}

function pickData(state: AppState): PersistedState {
  return {
    users: state.users,
    currentUserId: state.currentUserId,
    contacts: state.contacts,
    conversations: state.conversations,
    messages: state.messages,
    deliveries: state.deliveries,
    alerts: state.alerts,
    careRequests: state.careRequests,
    incidents: state.incidents,
    notifications: state.notifications,
    audit: state.audit,
    nodes: state.nodes,
    links: state.links,
    simRunning: state.simRunning,
    simSpeed: state.simSpeed,
    seedVersion: SEED_VERSION,
    organizations: state.organizations,
    memberships: state.memberships,
    groups: state.groups,
    grants: state.grants,
    activeOrgId: state.activeOrgId,
    seeded: true,
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void saveState(pickData(useApp.getState()));
  }, 400);
}

// ── événements du moteur ────────────────────────────────────────────────────
function pushNotification(notification: AppNotification): void {
  const { notifications } = useApp.getState();
  const unread = notifications.filter((n) => !n.read).length;
  // On garde un centre de notifications lisible : les plus vieilles tombent.
  useApp.setState({
    notifications: [notification, ...notifications].slice(0, unread > 6 ? 8 : 40),
  });
}

function pushAudit(entry: AuditEntry): void {
  const { audit } = useApp.getState();
  useApp.setState({ audit: [entry, ...audit].slice(0, 300) });
}

function describeDelivery(deliveryId: string): { title: string; body: string; deepLink: string } {
  const s = useApp.getState();
  const message = s.messages.find((m) => m.deliveryId === deliveryId);
  const alert = s.alerts.find((a) => a.deliveryId === deliveryId);
  const me = s.users.find((u) => u.id === s.currentUserId);
  if (alert) {
    return {
      title: `Alerte « ${alert.title} »`,
      body: alert.body,
      deepLink: '/app/alerts',
    };
  }
  if (message) {
    const sender = s.users.find((u) => u.id === message.senderId);
    const recipient = s.users.find((u) => u.id === message.recipientId);
    const outgoing = message.senderId === me?.id;
    return {
      title: outgoing ? `Message à ${recipient?.displayName ?? ''}` : `Message de ${sender?.displayName ?? ''}`,
      body: message.conversationId,
      deepLink: `/app/track/${deliveryId}`,
    };
  }
  return { title: 'Transmission', body: '', deepLink: '/app/history' };
}

engine.on((event: EngineEvent) => {
  const state = useApp.getState();

  if (event.type === 'journal') {
    appendJournal({
      simTime: event.at,
      category: event.category,
      severity: event.severity,
      text: event.text,
    });
    return;
  }

  if (event.type === 'internet') {
    useApp.setState({ internetUp: event.up });
    syncDerived();
    return;
  }

  if (event.type === 'hop') {
    const record = state.deliveries[event.deliveryId];
    if (!record) return;
    const lastActivity = { ...state.lastActivity };
    lastActivity[event.hop.fromNodeId] = event.at;
    lastActivity[event.hop.toNodeId] = event.at;
    useApp.setState({
      deliveries: { ...state.deliveries, [event.deliveryId]: pushHop(record, event.hop) },
      lastActivity,
    });
    syncDerived();
    schedulePersist();
    return;
  }

  if (event.type === 'node') {
    const node = state.nodes.find((n) => n.id === event.nodeId);
    if (event.status === 'offline') {
      pushNotification({
        id: uid('ntf'),
        type: 'system',
        title: 'Nœud hors service',
        body: `${node?.name ?? event.nodeId} ne répond plus : les routes sont recalculées.`,
        createdAt: Date.now(),
        read: false,
        deepLink: '/app/network',
      });
      pushAudit({
        id: uid('aud'),
        at: Date.now(),
        actorId: null,
        actorName: 'Simulation',
        action: 'Panne de nœud',
        targetId: event.nodeId,
        detail: `${node?.name ?? event.nodeId} passé hors service.`,
      });
    }
    schedulePersist();
    syncDerived();
    return;
  }

  if (event.type === 'link') {
    syncDerived();
    schedulePersist();
    return;
  }

  // ── statut d'acheminement ──
  const record = state.deliveries[event.deliveryId];
  if (!record) return;
  const at = simWall(event.at);
  let next: DeliveryRecord;
  try {
    next = transition(record, event.to, {
      at,
      reason: event.reason,
      detail: event.detail,
      storedAtHub: event.storedAtHub,
    });
  } catch (error) {
    console.error('[FasoMesh] statut refusé', error);
    return;
  }
  useApp.setState({ deliveries: { ...state.deliveries, [event.deliveryId]: next } });

  // Suivi de soin : seuls les deux couplages prévus avec le transport (§4).
  const careIndex = state.careRequests.findIndex((r) => r.transportDeliveryId === event.deliveryId);
  if (careIndex >= 0) {
    const synced = syncTransport(state.careRequests[careIndex], next.status, at);
    if (synced !== state.careRequests[careIndex]) {
      const careRequests = [...state.careRequests];
      careRequests[careIndex] = synced;
      useApp.setState({ careRequests });
    }
  }

  const described = describeDelivery(event.deliveryId);
  if (event.to === 'delivered') {
    pushNotification({
      id: uid('ntf'),
      type: 'message',
      title: `${described.title} — remis`,
      body: 'Accusé de réception reçu du destinataire.',
      createdAt: at,
      read: false,
      deepLink: described.deepLink,
    });
    pushAudit({
      id: uid('aud'),
      at,
      actorId: state.currentUserId,
      actorName: 'Réseau simulé',
      action: 'Message remis',
      targetId: event.deliveryId,
      detail: event.detail ?? 'Accusé de réception reçu.',
    });
  } else if (event.to === 'queued' && record.status !== 'queued') {
    pushNotification({
      id: uid('ntf'),
      type: 'system',
      title: 'Message en attente de réseau',
      body: event.detail ?? 'Aucune route disponible : retransmission automatique.',
      createdAt: at,
      read: false,
      deepLink: described.deepLink,
    });
  } else if (event.to === 'unconfirmed' && record.status !== 'unconfirmed') {
    pushNotification({
      id: uid('ntf'),
      type: 'system',
      title: 'Transmission non confirmée',
      body: 'Aucun accusé de réception dans le délai : le message n’est pas arrivé.',
      createdAt: at,
      read: false,
      deepLink: described.deepLink,
    });
  } else if (event.to === 'failed' && record.status !== 'failed') {      pushNotification({
        id: uid('ntf'),
        type: 'system',
        title: 'Échec de transmission',
        body: event.detail ?? 'Le message n’a pas pu être acheminé.',
        createdAt: at,
        read: false,
        deepLink: described.deepLink,
      });
  }
  schedulePersist();
  syncDerived();
});

// ── boucle de simulation ────────────────────────────────────────────────────
function isTestEnvironment(): boolean {
  try {
    return import.meta.env.MODE === 'test';
  } catch {
    return false;
  }
}

let loopStarted = false;
export function startSimulationLoop(): void {
  if (loopStarted || isTestEnvironment()) return;
  loopStarted = true;
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    // On borne le pas : un onglet mis en arrière-plan ne doit pas provoquer
    // un saut d’horloge géant à la reprise.
    const delta = Math.min(now - last, 250);
    last = now;
    const state = useApp.getState();
    if (state.booted && state.simRunning && delta > 0) {
      engine.advance(delta * state.simSpeed);
      if (scheduledCut && engine.now >= scheduledCut.at) {
        const cut = scheduledCut;
        scheduledCut = null;
        applyGraph(cut.nodes, cut.links);
        pushControlJournalText('Panne injectée pendant la transmission du message', 'danger');
      }
      if (scheduledRestore && engine.now >= scheduledRestore.at) {
        const restore = scheduledRestore;
        scheduledRestore = null;
        applyGraph(restore.nodes, restore.links);
        pushControlJournalText('Rétablissement automatique : le réseau est de nouveau complet', 'success');
      }
    }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}
