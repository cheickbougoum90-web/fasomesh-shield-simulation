import type { CareKind, CareRequest, CareStatus, CareVitals, Priority } from '../core/types';

/**
 * Suivi de TRAITEMENT (état humain, simulé) — distinct du transport.
 *
 * Machine sanitaire (§6 du cahier CSPS) :
 *   DRAFT → CREATED → SENT → RECEIVED → ACKNOWLEDGED
 *     → ACCEPTED → IN_PROGRESS → IN_TRANSIT → ARRIVED → RESOLVED
 *     ↘ REJECTED (motif obligatoire)
 *     ↘ INFORMATION_REQUESTED → (réponse du CSPS) → ACKNOWLEDGED
 *   CANCELLED accessible depuis tout état non clôturé.
 *
 * Relation avec le transport (docs/CONCEPTION_CSPS.md §4) :
 *  - `SENT`     ⇐ le dossier est confié au moteur (transport ≥ created) ;
 *  - `RECEIVED` ⇐ le transport a atteint le destinataire (transport = delivered).
 *    Ce sont les SEULS couplages automatiques. Une réception technique ne vaut
 *    JAMAIS prise en charge : tout le reste exige un acte d'opérateur simulé.
 *  - Un échec de transport ne rapproche jamais le dossier : il reste en `SENT`.
 */

export const CARE_TRANSITIONS: Record<CareStatus, CareStatus[]> = {
  draft: ['created', 'cancelled'],
  created: ['sent', 'cancelled'],
  sent: ['received', 'cancelled'],
  received: ['acknowledged', 'cancelled'],
  acknowledged: ['accepted', 'rejected', 'information_requested', 'cancelled'],
  information_requested: ['acknowledged', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['in_transit', 'resolved', 'cancelled'],
  in_transit: ['arrived', 'cancelled'],
  arrived: ['resolved', 'cancelled'],
  rejected: [],
  resolved: [],
  cancelled: [],
};

export const CARE_LABEL: Record<CareStatus, string> = {
  draft: 'Brouillon',
  created: 'Créée',
  sent: 'Transmise au réseau',
  received: 'Reçue par le centre',
  acknowledged: 'Accusée de réception',
  information_requested: 'Informations complémentaires demandées',
  accepted: 'Prise en charge acceptée',
  rejected: 'Prise en charge refusée',
  in_progress: 'Transfert préparé',
  in_transit: 'En cours d’évacuation',
  arrived: 'Arrivée au centre',
  resolved: 'Clôturée',
  cancelled: 'Annulée',
};

/**
 * États « sanitaire » ordonnés — utilisés par l'invariant de couplage.
 * `rejected` et `cancelled` ne prétendent rien sur le transport : ils ne
 * sont pas dans cet ordre (une annulation n'est pas une preuve d'arrivée).
 */
export const CARE_ORDER: CareStatus[] = [
  'draft',
  'created',
  'sent',
  'received',
  'acknowledged',
  'information_requested',
  'accepted',
  'in_progress',
  'in_transit',
  'arrived',
  'resolved',
];

/** Types de demande (§5). */
export const CARE_KINDS: CareKind[] = ['reference', 'evacuation', 'advice'];

export const CARE_KIND_LABEL: Record<CareKind, string> = {
  reference: 'Référence',
  evacuation: 'Évacuation',
  advice: 'Avis spécialisé',
};

/** Catégories de cas du formulaire structuré (non nominatif, §5). */
export const CARE_TYPES = [
  'maternity',
  'pediatric',
  'trauma',
  'respiratory',
  'fever',
  'surgery',
  'other',
] as const;
export type CareType = (typeof CARE_TYPES)[number];

export const CARE_TYPE_LABEL: Record<CareType, string> = {
  maternity: 'Obstétrique',
  pediatric: 'Pédiatrie',
  trauma: 'Traumatisme',
  respiratory: 'Urgence médicale — respiratoire',
  fever: 'Urgence médicale — fièvre',
  surgery: 'Chirurgie',
  other: 'Autre',
};

export const EMPTY_VITALS: CareVitals = { temp: '', bp: '', hr: '', rr: '', spo2: '' };

export function canTransitionCare(from: CareStatus, to: CareStatus): boolean {
  if (from === to) return false;
  return CARE_TRANSITIONS[from].includes(to);
}

export class CareTransitionError extends Error {
  constructor(from: CareStatus, to: CareStatus) {
    super(`Transition de soin illégale : ${from} → ${to}`);
    this.name = 'CareTransitionError';
  }
}

export interface CreateCareInput {
  id: string;
  caseRef: string;
  type: string;
  priority: Priority;
  description: string;
  location: string;
  desiredDestination: string;
  complementary: string;
  senderId: string;
  orgId: string;
  targetOrgId: string | null;
  transportDeliveryId: string | null;
  createdAt: number;
  kind?: CareKind;
  motif?: string;
  signes?: string;
  vitals?: Partial<CareVitals>;
  firstAid?: string;
  transportNeeded?: boolean;
  oxygenNeeded?: boolean;
  teamNeeded?: boolean;
  logisticsInstructions?: string;
  /** true ⇒ brouillon local, jamais transmis (§6 DRAFT). */
  draft?: boolean;
}

export function createCareRequest(input: CreateCareInput): CareRequest {
  return {
    id: input.id,
    caseRef: input.caseRef,
    kind: input.kind ?? 'reference',
    type: input.type,
    priority: input.priority,
    motif: (input.motif ?? '').trim(),
    description: input.description.trim(),
    signes: (input.signes ?? '').trim(),
    vitals: { ...EMPTY_VITALS, ...(input.vitals ?? {}) },
    firstAid: (input.firstAid ?? '').trim(),
    location: input.location.trim(),
    desiredDestination: input.desiredDestination.trim(),
    transportNeeded: input.transportNeeded ?? false,
    oxygenNeeded: input.oxygenNeeded ?? false,
    teamNeeded: input.teamNeeded ?? false,
    logisticsInstructions: (input.logisticsInstructions ?? '').trim(),
    complementary: input.complementary.trim(),
    senderId: input.senderId,
    orgId: input.orgId,
    targetOrgId: input.targetOrgId,
    transportDeliveryId: input.transportDeliveryId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    status: input.draft ? 'draft' : 'created',
    events: [
      {
        at: input.createdAt,
        from: null,
        to: input.draft ? 'draft' : 'created',
        actorId: input.senderId,
        reason: 'create',
        detail: input.draft ? 'Brouillon enregistré localement (non transmis)' : 'Dossier ouvert (non nominatif)',
      },
    ],
    resolvedAt: null,
    justification: null,
    closingNote: null,
  };
}

export function careTransition(
  request: CareRequest,
  to: CareStatus,
  opts: { at: number; actorId: string; reason: string; detail?: string; justification?: string; closingNote?: string },
): CareRequest {
  if (!canTransitionCare(request.status, to)) throw new CareTransitionError(request.status, to);
  const event: CareEvent = { at: opts.at, from: request.status, to, actorId: opts.actorId, reason: opts.reason, detail: opts.detail };
  return {
    ...request,
    status: to,
    updatedAt: opts.at,
    events: [...request.events, event],
    justification: opts.justification ?? request.justification,
    closingNote: opts.closingNote ?? request.closingNote,
    resolvedAt: to === 'resolved' ? opts.at : request.resolvedAt,
  };
}

type CareEvent = import('../core/types').CareEvent;

export function validateCareRequest(input: {
  type: string;
  description: string;
  location: string;
  priority: string;
}): string[] {
  const errors: string[] = [];
  if (!CARE_TYPES.includes(input.type as CareType)) errors.push('Type d’urgence inconnu.');
  if (input.description.trim().length < 10) errors.push('Décrivez la situation (10 caractères min).');
  if (input.location.trim().length < 2) errors.push('Indiquez le CSPS de départ.');
  if (!['info', 'urgent', 'critical'].includes(input.priority)) errors.push('Priorité inconnue.');
  return errors;
}

/**
 * Validation du formulaire CSPS (§5) : les contrôles de base, PLUS le centre
 * destinataire et le motif. La validation s’adapte à la priorité :
 *  - critique : motif + centre suffisent (aller vite) ;
 *  - urgent   : + description ;
 *  - normal   : + description et signes ou constantes renseignés.
 */
export function validateRequestForm(input: {
  type: string;
  description: string;
  location: string;
  priority: string;
  kind?: string;
  targetOrgId?: string | null;
  motif?: string;
  signes?: string;
  vitals?: Partial<CareVitals>;
}): string[] {
  const errors = validateCareRequest(input);
  if (input.kind !== undefined && !CARE_KINDS.includes(input.kind as CareKind)) {
    errors.push('Type de demande inconnu (référence, évacuation, avis).');
  }
  if (input.targetOrgId !== undefined && !input.targetOrgId) {
    errors.push('Sélectionnez un centre de destination dans l’annuaire.');
  }
  const motif = (input.motif ?? '').trim();
  const priority = input.priority;
  if (priority === 'info' && motif.length < 3) errors.push('Indiquez le motif de la demande.');
  if (priority !== 'critical') {
    if (motif.length < 3 && input.description.trim().length < 10) {
      errors.push('Indiquez un motif (3 car. min.) ou une description (10 car. min.).');
    }
  }
  if (priority === 'info') {
    const hasVitals = Object.values(input.vitals ?? {}).some((v) => (v ?? '').trim().length > 0);
    if (input.signes !== undefined && !input.signes.trim() && !hasVitals) {
      errors.push('Pour une demande non urgente, indiquez les signes observés ou une constante.');
    }
  }
  return errors;
}

/**
 * Numéro de dossier NON NOMINATIF : ni nom, ni identifiant médical du patient.
 * Le nom du patient n'est jamais demandé, jamais stocké, jamais affiché.
 */
export function nextCaseRef(seq: number, year: number): string {
  return `DOS-${year}-${String(seq).padStart(4, '0')}`;
}

/** Invariant de couplage testé : au-delà de REÇU, le transport doit être arrivé. */
export function checkCoupling(status: CareStatus, transportStatus: string): boolean {
  const humanStage = CARE_ORDER.indexOf(status);
  const receivedStage = CARE_ORDER.indexOf('received');
  if (humanStage < 0 || humanStage <= receivedStage) return true;
  return transportStatus === 'delivered';
}
