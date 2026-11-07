/**
 * ═══════════════════════════════════════════════════════════════════════
 *  HYPOTHÈSES DU MODÈLE — fichier unique de toutes les valeurs inventées
 * ═══════════════════════════════════════════════════════════════════════
 *
 * AUCUNE valeur de ce fichier n'est une mesure. Elles sont choisies pour
 * rendre la démonstration lisible et reproductible, pas pour représenter
 * un matériel, un réseau radio ou un site réel.
 *
 * Toute mesure réelle exigerait des essais avec du matériel physique sur
 * le terrain : aucune n'a été menée, et cette démonstration ne prouve ni
 * la résilience ni les performances d'un réseau radio réel.
 *
 * Les modules existants importent ces constantes sans changer leurs
 * valeurs : c'est bien le même nombre qu'auparavant, simplement regroupé.
 */

export interface Assumption {
  /** Identifiant stable, utilisé par l'écran « Hypothèses du modèle ». */
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  /** D'où vient ce nombre. */
  origin: string;
  /** Toujours false : rien ici n'est mesuré. */
  measurable: false;
}

function assume(id: string, label: string, value: number | string, unit: string | undefined, origin: string): Assumption {
  return { id, label, value, unit, origin, measurable: false };
}

/* ── Horloge de simulation ──────────────────────────────────────────── */

export const TIMING = {
  /** Délai d'acceptation par le nœud local. */
  accept: 400,
  /** Le nœud calcule sa route avant d'annoncer l'acheminement. */
  route: 300,
  /** Backoff entre deux tentatives sur un même saut. */
  hopRetry: 1500,
  maxRetries: 2,
  /** Dernier kilomètre avant l'accusé de réception. */
  final: 700,
  /** Au-delà : « non confirmé » plutôt qu'un faux espoir d'arrivée. */
  ttl: 60_000,
  /** Grâce avant déclaration « non délivrable » d'un message sans route. */
  noRouteGrace: 30_000,
} as const;

/* ── Poids de priorité appliqués au coût de route ───────────────────── */

export const LOSS_WEIGHT = {
  info: 1,
  urgent: 1.5,
  critical: 2.5,
} as const;

/* ── Liens du graphe de démonstration ───────────────────────────────── */

/** Latence déclarée par lien (ms) — hypothèse, jamais mesurée. */
export const LINK_LATENCY_MS: Record<string, number> = {
  'l-hub-nord': 700,
  'l-hub-est': 800,
  'l-hub-sud': 900,
  'l-hub-ouest': 750,
  'l-nord-est': 1200,
  'l-est-sud': 1300,
  'l-sud-ouest': 1100,
  'l-ouest-nord': 1000,
  'l-ami-ouest': 600,
  'l-ami-sud': 680,
  'l-salif-est': 650,
  'l-mariam-ouest': 700,
};

/** Taux de perte déclaré par lien — hypothèse, jamais mesuré. */
export const LINK_LOSS_RATE: Record<string, number> = {
  'l-hub-nord': 0.04,
  'l-hub-est': 0.05,
  'l-hub-sud': 0.06,
  'l-hub-ouest': 0.04,
  'l-nord-est': 0.1,
  'l-est-sud': 0.11,
  'l-sud-ouest': 0.09,
  'l-ouest-nord': 0.08,
  'l-ami-ouest': 0.05,
  'l-ami-sud': 0.08,
  'l-salif-est': 0.05,
  'l-mariam-ouest': 0.07,
};

/** Liens créés dynamiquement (nouveau téléphone, nœud ajouté). */
export const LINK_DEFAULTS = {
  attachLatencyMs: 650,
  attachLossRate: 0.05,
  newNodeLatencyMs: 700,
  newNodeLossRate: 0.06,
} as const;

/* ── Batteries ──────────────────────────────────────────────────────── */

/** Batteries initiales des nœuds de démonstration (%), hypothèse. */
export const BATTERY_SEED: Record<string, number> = {
  'node-hub': 100,
  'relay-nord': 86,
  'relay-est': 74,
  'relay-sud': 61,
  'relay-ouest': 92,
  'phone-aminata': 68,
  'phone-salif': 45,
  'phone-mariam': 83,
};

export const BATTERY_DEFAULTS = {
  newPhone: 74,
  newNodeMin: 52,
  newNodeSpan: 41,
} as const;

/* ── Radio et géométrie (§8) ────────────────────────────────────────── */

export const RADIO = {
  /**
   * Échelle du dessin : 1 unité du repère SVG = 100 mètres.
   * HYPOTHÈSE DE MODÈLE — le dessin est schématique, pas une carte.
   */
  scaleMetresPerUnit: 100,
  /** Portée théorique déclarée par type de nœud (m) — illustrative. */
  rangeMetres: { phone: 1500, relay: 4000, hub: 6000 } as Record<string, number>,
  /** Débit simulé (kbps) — affiché comme simuleur, jamais comme mesure. */
  throughputKbps: 50,
} as const;

/**
 * Source de vérité de la connectivité : LIENS DÉCLARÉS.
 * La distance et la portée n'ont AUCUNE influence sur le graphe du moteur.
 */
export const CONNECTIVITY_SOURCE = 'declared_links' as const;

/* ── Cryptographie ──────────────────────────────────────────────────── */

export const CRYPTO = {
  /** Dérivation de la clé de démonstration (AES-GCM). */
  keyIterations: 120_000,
  /** Dérivation des empreintes de mot de passe. */
  passwordIterations: 60_000,
} as const;

/* ── Authentification locale (démonstration) ────────────────────────── */

export const AUTH = {
  /** Tentatives de connexion avant blocage temporaire (démonstration). */
  maxAttempts: 5,
  /** Durée du blocage (ms). */
  lockoutMs: 60_000,
} as const;

/* ── Limites applicatives ───────────────────────────────────────────── */

export const LIMITS = {
  messageMaxLength: 600,
  maxSimNodes: 16,
  journalMaxEntries: 500,
} as const;

/* ── Registre documenté (affiché dans l'aide) ───────────────────────── */

export const MODEL_ASSUMPTIONS: Assumption[] = [
  assume('timing', 'Délais internes du moteur (acceptation, calcul de route, retransmission)', `${TIMING.accept}/${TIMING.route}/${TIMING.hopRetry} ms`, 'ms', 'Choix de lisibilité de la simulation'),
  assume('ttl', 'Expiration d’un message non confirmé', TIMING.ttl, 'ms', 'Choix de démonstration'),
  assume('no_route', 'Grâce avant « non délivrable »', TIMING.noRouteGrace, 'ms', 'Choix de démonstration'),
  assume('links', 'Latence et taux de perte déclarés par lien', '600–1300 ms · 4–11 %', '', 'Hypothèses placées à la main pour rendre les routes lisibles'),
  assume('loss_weight', 'Poids de priorité appliqué au coût de route', `${LOSS_WEIGHT.info} / ${LOSS_WEIGHT.urgent} / ${LOSS_WEIGHT.critical}`, '', 'Choix de conception (info / urgent / critique)'),
  assume('battery', 'Niveau de batterie des nœuds', '45–100 %', '%', 'Valeurs fixées pour la démo'),
  assume('scale', 'Échelle du dessin (1 unité SVG = 100 m)', RADIO.scaleMetresPerUnit, 'm/unité', 'Hypothèse : le dessin n’est pas une carte'),
  assume('range', 'Portée théorique déclarée', `téléphone ${RADIO.rangeMetres.phone} m · relais ${RADIO.rangeMetres.relay} m · Hub ${RADIO.rangeMetres.hub} m`, 'm', 'Illustrative — n’influence pas la connectivité'),
  assume('throughput', 'Débit simulé', RADIO.throughputKbps, 'kbps', 'Affiché comme simuleur, jamais mesuré'),
  assume('crypto_key', 'Itérations PBKDF2 de la clé de démonstration', CRYPTO.keyIterations, '', 'Choix de sécurité de la démonstration'),
  assume('crypto_pwd', 'Itérations PBKDF2 des mots de passe', CRYPTO.passwordIterations, '', 'Choix de sécurité de la démonstration'),
  assume('auth_attempts', 'Tentatives de connexion avant blocage', `${AUTH.maxAttempts} en ${AUTH.lockoutMs / 1000} s`, '', 'Démonstration locale, pas un service de compte'),
];

/** Phrase honnête à afficher à côté des valeurs du modèle. */
export const MODEL_DISCLAIMER =
  'Toutes les valeurs du modèle sont des hypothèses de démonstration : aucune n’a été mesurée, ' +
  'aucune ne provient d’un matériel ou d’un réseau radio réel.';
