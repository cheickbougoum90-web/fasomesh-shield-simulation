import type { DeliveryStatus, HopRecord, MeshLink, MeshNode, NodeStatus, Priority } from '../core/types';
import { TIMING } from '../core/modelAssumptions';
import { mulberry32 } from '../core/rng';
import { findLinkBetween, HUB_ID } from './graph';
import { findRoute, LOSS_WEIGHT, type Route } from './routing';

/**
 * Moteur de simulation Mesh — événements discrets sur horloge virtuelle.
 *
 * Aucun matériel radio n'est connecté : ce moteur RECONSTRUIT les transmissions,
 * les accusés de réception, les pertes, les pannes et les changements de route.
 * Il est déterministe (graine fixe) pour être rejouable et testable.
 *
 * Modèle d'acheminement (v2) :
 *  1. On cherche une route directe émetteur → destinataire. Le Hub n'est PAS
 *     une dépendance : c'est un nœud comme les autres, utile comme relais.
 *  2. Sans route directe, on achemine vers le Hub pour y stocker le message,
 *     puis on repart dès que le destinataire redevient joignable.
 *  3. Sans aucune route : mise en attente, puis déclaration « non délivrable »
 *     après `TIMING.noRouteGrace`. Jamais de faux succès.
 *
 * Le moteur ne connaît ni React ni les entités de persistance : il émet des
 * événements ; c'est la couche applicative qui enregistre les statuts.
 */

/** Identifiant logique de la destination « Internet » (passerelle du Hub). */
export const INTERNET_ID = 'internet';

export type JournalCategory = 'network' | 'message' | 'route' | 'fault';
export type JournalSeverity = 'info' | 'success' | 'warn' | 'danger';

export type EngineEvent =
  | {
      type: 'status';
      deliveryId: string;
      to: DeliveryStatus;
      reason: string;
      detail?: string;
      at: number;
      storedAtHub?: boolean;
    }
  | { type: 'hop'; deliveryId: string; hop: HopRecord; at: number }
  | { type: 'node'; nodeId: string; status: NodeStatus; at: number }
  | { type: 'link'; linkId: string; status: 'up' | 'down'; at: number }
  | { type: 'internet'; up: boolean; at: number }
  | {
      type: 'journal';
      at: number;
      category: JournalCategory;
      severity: JournalSeverity;
      text: string;
    };

/** Tronçon en cours de transmission — sert à animer le paquet dans l'UI. */
export interface Flight {
  deliveryId: string;
  fromNodeId: string;
  toNodeId: string;
  linkId: string | null;
  priority: Priority;
  startAt: number;
  endAt: number;
}

/** Compteurs par nœud, alimentés par le moteur (jamais recalculés par l'UI). */
export interface NodeStats {
  /** Émissions parties de ce nœud. */
  tx: number;
  /** Réceptions arrivées à ce nœud. */
  rx: number;
  /** Transmissions assurées par un relais (indicateur du tableau de bord). */
  forwarded: number;
  /** Paquets perdus au départ de ce nœud. */
  dropped: number;
}

/* Constantes déplacées dans `core/modelAssumptions` (fichier unique des
 * hypothèses du modèle). Valeurs inchangées ; l'export historique est
 * conservé pour tous les importateurs existants. */
export { TIMING } from '../core/modelAssumptions';

type JobTask = 'accept' | 'route' | 'hop' | 'final' | 'timeout' | 'depart' | 'expire';

interface Job {
  at: number;
  seq: number;
  task: JobTask;
  deliveryId?: string;
  nodeId?: string;
}

interface Delivery {
  id: string;
  senderNode: string;
  recipientNode: string;
  priority: Priority;
  path: string[];
  idx: number;
  retries: number;
  startedAt: number;
  phase: 'origin' | 'atHub';
  /** Nœud où le message est stocké (Hub) lorsqu'il est mis en attente. */
  stagedAt?: string;
  queued: boolean;
  terminal: boolean;
  lastStatus: DeliveryStatus;
  holdReason?: string;
  /** Échéance de la grâce « aucun chemin » (R5). */
  expireAt?: number;
}

/** Entrée de file d'attente de transmission d'un nœud. */
interface QueueEntry {
  deliveryId: string;
  idx: number;
  priority: Priority;
}

export interface EngineOptions {
  seed: number;
  nodes: MeshNode[];
  links: MeshLink[];
}

export class MeshEngine {
  now = 0;
  private seq = 0;
  private queue: Job[] = [];
  private nodes: MeshNode[];
  private links: MeshLink[];
  private deliveries = new Map<string, Delivery>();
  private rng: () => number;
  private listeners: ((event: EngineEvent) => void)[] = [];

  /** Files d'attente par nœud (émission à demi-duplex : un départ à la fois). */
  private nodeQueues = new Map<string, QueueEntry[]>();
  /** Tours de priorité servis consécutivement — garde-fou anti-évitement. */
  private streaks = new Map<string, number>();
  /** Horloge de libération de l'émetteur (prochain départ possible). */
  private freeAt = new Map<string, number>();
  /** Tronçons en vol, pour l'animation des paquets. */
  private flights = new Map<string, Flight>();
  /** Compteurs par nœud. */
  private stats = new Map<string, NodeStats>();
  /** Liaison Internet (passerelle) — indépendante du Mesh local. */
  private internetUp = true;

  constructor(options: EngineOptions) {
    this.rng = mulberry32(options.seed);
    this.nodes = options.nodes.map((n) => ({ ...n }));
    this.links = options.links.map((l) => ({ ...l }));
    for (const node of this.nodes) this.ensureStats(node.id);
  }

  // ── abonnement ────────────────────────────────────────────────────────────
  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private emitStatus(
    deliveryId: string,
    to: DeliveryStatus,
    reason: string,
    detail?: string,
    storedAtHub?: boolean,
  ): void {
    const d = this.deliveries.get(deliveryId);
    if (d) d.lastStatus = to;
    this.emit({ type: 'status', deliveryId, to, reason, detail, at: this.now, storedAtHub });
  }

  private journal(category: JournalCategory, severity: JournalSeverity, text: string): void {
    this.emit({ type: 'journal', at: this.now, category, severity, text });
  }

  // ── horloge ───────────────────────────────────────────────────────────────
  /** Avance l'horloge virtuelle et exécute tous les événements du créneau. */
  advance(ms: number): void {
    const target = this.now + Math.max(0, ms);
    let guard = 0;
    while (this.queue.length > 0 && this.queue[0].at <= target) {
      const job = this.queue.shift()!;
      this.now = Math.max(this.now, job.at);
      this.run(job);
      if (++guard > 5000) break;
    }
    this.now = target;
  }

  private schedule(at: number, task: JobTask, deliveryId?: string, nodeId?: string): void {
    this.queue.push({ at, seq: this.seq++, task, deliveryId, nodeId });
    this.queue.sort((a, b) => (a.at === b.at ? a.seq - b.seq : a.at - b.at));
  }

  // ── graphe ────────────────────────────────────────────────────────────────
  /** Applique un nouveau graphe (coupure / rétablissement) et détecte les restaurations. */
  applyGraph(nodes: MeshNode[], links: MeshLink[]): void {
    const prevNodeStatus = new Map(this.nodes.map((n) => [n.id, n.status]));
    const prevLinkStatus = new Map(this.links.map((l) => [l.id, l.status]));
    this.nodes = nodes.map((n) => ({ ...n }));
    this.links = links.map((l) => ({ ...l }));
    for (const node of this.nodes) this.ensureStats(node.id);

    let restored = false;
    for (const node of this.nodes) {
      const before = prevNodeStatus.get(node.id);
      if (before !== undefined && before !== node.status) {
        this.emit({ type: 'node', nodeId: node.id, status: node.status, at: this.now });
        const name = this.label(node.id);
        if (node.status === 'offline') {
          this.journal('network', 'danger', `Nœud ${name} indisponible`);
        } else if (before === 'offline') {
          this.journal('network', 'success', `Nœud ${name} reconnecté`);
          restored = true;
        } else {
          this.journal('network', 'warn', `Nœud ${name} dégradé`);
        }
      }
    }
    for (const link of this.links) {
      const before = prevLinkStatus.get(link.id);
      if (before !== undefined && before !== link.status) {
        this.emit({ type: 'link', linkId: link.id, status: link.status, at: this.now });
        const ends = `${this.label(link.aNodeId)} ↔ ${this.label(link.bNodeId)}`;
        if (link.status === 'down') this.journal('network', 'danger', `Lien ${ends} interrompu`);
        else {
          this.journal('network', 'success', `Lien ${ends} rétabli`);
          restored = true;
        }
      }
    }
    if (restored) this.resumeQueued();
  }

  getNodes(): MeshNode[] {
    return this.nodes.map((n) => ({ ...n }));
  }

  getLinks(): MeshLink[] {
    return this.links.map((l) => ({ ...l }));
  }

  /** Routes actuellement en circulation — consommé par la carte SVG. */
  activePaths(): { deliveryId: string; path: string[]; idx: number }[] {
    const out: { deliveryId: string; path: string[]; idx: number }[] = [];
    for (const d of this.deliveries.values()) {
      if (d.terminal || d.queued || d.path.length < 2) continue;
      out.push({ deliveryId: d.id, path: [...d.path], idx: d.idx });
    }
    return out;
  }

  queuedDeliveries(): string[] {
    return [...this.deliveries.values()].filter((d) => d.queued && !d.terminal).map((d) => d.id);
  }

  /** Tronçons en vol (interpolation visuelle des paquets). */
  getFlights(): Flight[] {
    return [...this.flights.values()];
  }

  getNodeStats(): Record<string, NodeStats> {
    const out: Record<string, NodeStats> = {};
    for (const [id, stats] of this.stats) out[id] = { ...stats };
    return out;
  }

  /** Longueur de file d'attente effective de chaque nœud. */
  getQueueLengths(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [nodeId, entries] of this.nodeQueues) out[nodeId] = entries.filter((e) => this.isLive(e)).length;
    return out;
  }

  setInternet(up: boolean): void {
    if (this.internetUp === up) return;
    this.internetUp = up;
    this.emit({ type: 'internet', up, at: this.now });
    this.journal('network', up ? 'success' : 'danger', up ? 'Liaison Internet rétablie' : 'Liaison Internet coupée');
    if (up) this.resumeQueued();
  }

  isInternetUp(): boolean {
    return this.internetUp;
  }

  // ── rôle de relais du Hub (§7 : configurable, les deux modes sont testés) ──
  private hubRelay: 'relay' | 'terminus' = 'relay';

  setHubRelayMode(mode: 'relay' | 'terminus'): void {
    if (mode === this.hubRelay) return;
    this.hubRelay = mode;
    this.journal(
      'network',
      mode === 'terminus' ? 'warn' : 'success',
      mode === 'terminus'
        ? 'Mode relais du Hub : TERMINUS — le Hub n’est plus jamais un saut intermédiaire'
        : 'Mode relais du Hub : RELAIS — le Hub peut transiter',
    );
  }

  getHubRelayMode(): 'relay' | 'terminus' {
    return this.hubRelay;
  }

  /**
   * Calcul de route centralisé : applique le mode de relais du Hub.
   * En mode `terminus`, le Hub n'est jamais choisi comme saut intermédiaire
   * (il reste utilisable comme DESTINATAIRE).
   */
  private route(from: string, to: string, weight: number): Route | null {
    const avoid = this.hubRelay === 'terminus' && from !== HUB_ID && to !== HUB_ID ? [HUB_ID] : [];
    return findRoute(this.nodes, this.links, from, to, { lossWeight: weight, avoid });
  }

  // ── soumission ────────────────────────────────────────────────────────────
  submit(
    deliveryId: string,
    route: { senderNode: string; recipientNode: string; priority?: Priority },
  ): void {
    this.deliveries.set(deliveryId, {
      id: deliveryId,
      senderNode: route.senderNode,
      recipientNode: route.recipientNode,
      priority: route.priority ?? 'info',
      path: [],
      idx: 0,
      retries: 0,
      startedAt: this.now,
      phase: 'origin',
      queued: false,
      terminal: false,
      lastStatus: 'created',
    });
    this.emitStatus(deliveryId, 'created', 'submit', 'Message créé et enregistré sur l’appareil');
    this.journal('message', 'info', `Message ${deliveryId} créé`);
    this.schedule(this.now + TIMING.accept, 'accept', deliveryId);
    this.schedule(this.now + TIMING.ttl, 'timeout', deliveryId);
  }

  /** Réémission manuelle depuis l'écran de suivi. */
  retry(deliveryId: string): void {
    const d = this.deliveries.get(deliveryId);
    if (!d || d.terminal) return;
    d.queued = false;
    d.phase = 'origin';
    d.stagedAt = undefined;
    d.holdReason = undefined;
    d.retries = 0;
    d.path = [];
    d.idx = 0;
    this.flights.delete(deliveryId);
    // `unconfirmed` ne peut pas retourner à `created` : on repasse par `routing`.
    const back: DeliveryStatus = d.lastStatus === 'unconfirmed' ? 'routing' : 'created';
    this.emitStatus(deliveryId, back, 'retry', 'Renvoi manuel demandé par l’utilisateur');
    this.schedule(this.now + TIMING.accept, 'accept', deliveryId);
    this.schedule(this.now + TIMING.ttl, 'timeout', deliveryId);
  }

  private get(deliveryId: string): Delivery | undefined {
    return this.deliveries.get(deliveryId);
  }

  // ── exécution des jobs ────────────────────────────────────────────────────
  private run(job: Job): void {
    switch (job.task) {
      case 'accept':
        this.accept(job.deliveryId!);
        break;
      case 'route':
        this.startRoute(job.deliveryId!);
        break;
      case 'depart':
        this.depart(job.nodeId!);
        break;
      case 'hop':
        this.hop(job.deliveryId!);
        break;
      case 'final':
        this.final(job.deliveryId!);
        break;
      case 'expire':
        this.expire(job.deliveryId!);
        break;
      case 'timeout':
        this.timeout(job.deliveryId!);
        break;
    }
  }

  private hubNode(): MeshNode | undefined {
    return this.nodes.find((n) => n.kind === 'hub');
  }

  private usable(id: string): boolean {
    const n = this.nodes.find((x) => x.id === id);
    return !!n && n.status !== 'offline';
  }

  private accept(deliveryId: string): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal || d.queued) return;
    if (!this.usable(d.senderNode)) {
      this.hold(deliveryId, 'Émetteur hors ligne', 'L’appareil émetteur est injoignable : message conservé en local.');
      return;
    }
    this.emitStatus(
      deliveryId,
      'accepted_local',
      'node_accept',
      'Votre nœud local a accepté le message (ce n’est pas encore arrivé au destinataire).',
    );
    this.schedule(this.now + TIMING.route, 'route', deliveryId);
  }

  /**
   * Choix de route : direct d'abord, Hub en secours (stockage), sinon attente.
   * R3 : la priorité module le poids du terme « perte » dans le coût.
   */
  private startRoute(deliveryId: string): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal || d.queued) return;
    const weight = LOSS_WEIGHT[d.priority];

    const direct = this.route(d.senderNode, d.recipientNode, weight);
    if (direct && direct.path.length >= 2) {
      this.setPath(d, direct.path);
      const text = `Route retenue : ${direct.path.map(this.label).join(' → ')}`;
      this.emitStatus(deliveryId, 'routing', 'route', text);
      this.journal('route', 'info', `Message ${deliveryId} : ${text.replace('Route retenue : ', 'route ')}`);
      this.scheduleHop(deliveryId);
      return;
    }

    // Pas de route directe : on essaie de passer par le Hub pour y stocker le message.
    const hub = this.hubNode();
    if (this.hubRelay === 'relay' && hub && hub.status !== 'offline' && hub.id !== d.senderNode) {
      const viaHub = this.route(d.senderNode, hub.id, weight);
      if (viaHub && viaHub.path.length >= 2) {
        this.setPath(d, viaHub.path);
        const text = `Aucune route directe vers ${this.label(d.recipientNode)} : acheminement via le Hub`;
        this.emitStatus(deliveryId, 'routing', 'route', `${text} (${viaHub.path.map(this.label).join(' → ')})`);
        this.journal('route', 'warn', `Message ${deliveryId} : ${text}`);
        this.scheduleHop(deliveryId);
        return;
      }
    }

    this.hold(
      deliveryId,
      'Aucune route',
      `Aucune route vers ${this.label(d.recipientNode)} : le réseau est interrompu à cet endroit. Message mis en attente.`,
    );
  }

  private setPath(d: Delivery, path: string[]): void {
    d.path = path;
    d.idx = 0;
    d.retries = 0;
  }

  private label = (nodeId: string): string =>
    nodeId === INTERNET_ID ? 'Internet' : (this.nodes.find((n) => n.id === nodeId)?.name ?? nodeId);

  // ── files d'attente des nœuds (R6) ────────────────────────────────────────
  private ensureStats(nodeId: string): void {
    if (!this.stats.has(nodeId)) this.stats.set(nodeId, { tx: 0, rx: 0, forwarded: 0, dropped: 0 });
  }

  private bump(nodeId: string, key: keyof NodeStats): void {
    this.ensureStats(nodeId);
    const stats = this.stats.get(nodeId)!;
    stats[key] += 1;
  }

  private scheduleHop(deliveryId: string): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal || d.queued || d.idx + 1 >= d.path.length) return;
    const from = d.path[d.idx];
    const list = this.nodeQueues.get(from) ?? [];
    list.push({ deliveryId, idx: d.idx, priority: d.priority });
    this.nodeQueues.set(from, list);
    this.scheduleDepart(from);
  }

  private scheduleDepart(nodeId: string): void {
    const at = Math.max(this.now, this.freeAt.get(nodeId) ?? 0);
    this.schedule(at, 'depart', undefined, nodeId);
  }

  private isLive(entry: QueueEntry): boolean {
    const d = this.get(entry.deliveryId);
    return !!d && !d.terminal && !d.queued && d.idx === entry.idx && d.path.length >= 2;
  }

  /** Choix du prochain paquet à servir : priorité stricte + garde-fou R6. */
  private pickEntry(nodeId: string, entries: QueueEntry[]): QueueEntry | null {
    const live = entries.filter((e) => this.isLive(e));
    if (!live.length) return null;
    const groups: QueueEntry[][] = ['critical', 'urgent', 'info'].map((p) =>
      live.filter((e) => e.priority === p),
    );
    const present = groups.filter((g) => g.length > 0);
    if (present.length === 1) {
      this.streaks.set(nodeId, 0);
      return present[0][0];
    }
    const streak = this.streaks.get(nodeId) ?? 0;
    if (streak >= 3) {
      // Anti-évitement : après 3 services consécutifs du niveau haut, on descend.
      this.streaks.set(nodeId, 0);
      return present[1][0];
    }
    this.streaks.set(nodeId, streak + 1);
    return present[0][0];
  }

  /** Un nœud ne départ qu'un paquet à la fois (canal à demi-duplex simulé). */
  private depart(nodeId: string): void {
    const entries = this.nodeQueues.get(nodeId);
    if (!entries || !entries.length) return;
    const freeAt = this.freeAt.get(nodeId) ?? 0;
    if (this.now < freeAt) {
      this.schedule(freeAt, 'depart', undefined, nodeId);
      return;
    }

    const entry = this.pickEntry(nodeId, entries);
    if (!entry) {
      this.nodeQueues.set(nodeId, []);
      return;
    }
    const at = entries.indexOf(entry);
    if (at >= 0) entries.splice(at, 1);

    if (!this.isLive(entry)) {
      if (entries.length) this.schedule(this.now, 'depart', undefined, nodeId);
      return;
    }

    const d = this.get(entry.deliveryId)!;
    const a = d.path[d.idx];
    const b = d.path[d.idx + 1];
    const link = findLinkBetween(this.links, a, b);
    const aNode = this.nodes.find((n) => n.id === a);
    const bNode = this.nodes.find((n) => n.id === b);
    const degraded = aNode?.status === 'degraded' || bNode?.status === 'degraded' ? 1.5 : 1;
    const latency = (link?.latencyMs ?? 900) * degraded;

    this.ensureStats(a);
    this.bump(a, 'tx');
    if (aNode?.kind === 'relay') this.bump(a, 'forwarded');
    this.freeAt.set(a, this.now + latency);
    this.flights.set(d.id, {
      deliveryId: d.id,
      fromNodeId: a,
      toNodeId: b,
      linkId: link?.id ?? null,
      priority: d.priority,
      startAt: this.now,
      endAt: this.now + latency,
    });

    this.schedule(this.now + latency, 'hop', d.id);
    if (entries.length) this.schedule(this.now + latency, 'depart', undefined, nodeId);
  }

  // ── transmission ──────────────────────────────────────────────────────────
  private hop(deliveryId: string): void {
    const d = this.get(deliveryId);
    this.flights.delete(deliveryId);
    if (!d || d.terminal || d.queued || d.path.length < 2) return;
    const a = d.path[d.idx];
    const b = d.path[d.idx + 1];
    const link = findLinkBetween(this.links, a, b);
    const down = !link || link.status === 'down' || !this.usable(a) || !this.usable(b);
    const lossRate = link?.lossRate ?? 1;
    const lost = down || this.rng() < lossRate;

    if (!lost) {
      this.ensureStats(b);
      this.bump(b, 'rx');
      this.emitHop(deliveryId, { index: d.idx, fromNodeId: a, toNodeId: b, at: this.now, result: 'ok' });
      this.journal('message', 'info', `Message ${deliveryId} transmis au nœud ${this.label(b)}`);
      d.idx += 1;
      d.retries = 0;
      if (d.idx >= d.path.length - 1) this.arrive(deliveryId);
      else this.scheduleHop(deliveryId);
      return;
    }

    this.bump(a, 'dropped');
    this.emitHop(deliveryId, { index: d.idx, fromNodeId: a, toNodeId: b, at: this.now, result: 'lost' });
    d.retries += 1;
    if (d.retries <= TIMING.maxRetries) {
      const text = `Saut ${this.label(a)} → ${this.label(b)} perdu (tentative ${d.retries}/${TIMING.maxRetries})…`;
      this.emitStatus(deliveryId, 'routing', 'hop_retry', text);
      this.journal('route', 'warn', `Message ${deliveryId} : ${text}`);
      this.schedule(this.now + TIMING.hopRetry, 'hop', deliveryId);
      return;
    }
    const reason = down ? `Nœud ${this.label(b)} injoignable` : `Saut ${this.label(a)} → ${this.label(b)} perdu`;
    this.reroute(deliveryId, reason);
  }

  private emitHop(deliveryId: string, hop: HopRecord): void {
    this.emit({ type: 'hop', deliveryId, hop, at: this.now });
  }

  private reroute(deliveryId: string, why: string): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal || d.queued) return;

    const currentNode = d.path[d.idx];
    const start = this.usable(currentNode) ? currentNode : d.senderNode;
    const replay = start !== currentNode;
    const weight = LOSS_WEIGHT[d.priority];

    const route = this.route(start, d.recipientNode, weight);
    const hub = this.hubNode();
    const fallback =
      route ??
      (this.hubRelay === 'relay' && hub && hub.status !== 'offline' ? this.route(start, hub.id, weight) : null);

    if (!fallback || fallback.path.length < 2) {
      this.hold(
        deliveryId,
        'Aucune route',
        `${why} : aucune route alternative vers ${this.label(d.recipientNode)}. Le message passe en attente.`,
      );
      return;
    }
    this.setPath(d, fallback.path);
    this.emitHop(deliveryId, {
      index: -1,
      fromNodeId: start,
      toNodeId: fallback.path[1] ?? start,
      at: this.now,
      result: 'reroute',
    });
    const text = `${why} → nouvelle route : ${fallback.path.map(this.label).join(' → ')}${
      replay ? ' (réémission depuis l’émetteur)' : ''
    }`;
    this.emitStatus(deliveryId, 'routing', 'reroute', text);
    this.journal('route', 'success', `Route alternative trouvée pour ${deliveryId} : ${fallback.path.map(this.label).join(' → ')}`);
    this.scheduleHop(deliveryId);
  }

  /** Arrivée au bout du chemin courant : destinataire, Hub de transit, ou relais. */
  private arrive(deliveryId: string): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal || d.queued) return;
    const at = d.path[d.path.length - 1];
    const isInternet = d.recipientNode === INTERNET_ID;
    const reachedRecipient = at === d.recipientNode;
    const reachedGateway = isInternet && at === this.hubNode()?.id;

    if (reachedRecipient || reachedGateway) {
      this.emitStatus(
        deliveryId,
        'routing',
        'final_leg',
        reachedRecipient
          ? `Arrivée chez ${this.label(at)} : en attente de l’accusé de réception.`
          : 'Message remis à la passerelle du Hub : en attente de sa confirmation.',
      );
      this.schedule(this.now + TIMING.final, 'final', deliveryId);
      return;
    }

    // Étape intermédiaire : le Hub stocke puis reprend dès que possible.
    d.phase = 'atHub';
    d.stagedAt = at;
    const weight = LOSS_WEIGHT[d.priority];
    const next = this.route(at, d.recipientNode, weight);
    if (next && next.path.length >= 2) {
      this.setPath(d, next.path);
      this.emitStatus(
        deliveryId,
        'routing',
        'relay_continue',
        `Étape terminée à ${this.label(at)} : nouvelle route ${next.path.map(this.label).join(' → ')}`,
      );
      this.scheduleHop(deliveryId);
      return;
    }

    const reason = isInternet ? 'Internet indisponible' : 'Destinataire injoignable';
    const detail = isInternet
      ? 'Le Hub détient le message mais la passerelle Internet est coupée : reprise au retour de la liaison.'
      : `Le Hub détient le message, mais ${this.label(d.recipientNode)} est injoignable : retransmission à son retour.`;
    this.emitStatus(deliveryId, 'routing', 'hub_received', `${this.label(at)} a reçu le message — ${detail}`);
    this.hold(deliveryId, reason, detail, true);
  }

  private final(deliveryId: string): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal) return;

    if (d.recipientNode === INTERNET_ID) {
      if (this.internetUp) {
        d.terminal = true;
        d.queued = false;
        this.emitStatus(deliveryId, 'delivered', 'ack', 'Passerelle Internet : confirmation de remise');
        this.journal('message', 'success', `Message ${deliveryId} remis à Internet (passerelle du Hub)`);
      } else {
        d.phase = 'atHub';
        d.stagedAt = this.hubNode()?.id;
        this.hold(
          deliveryId,
          'Internet indisponible',
          'Le Hub détient le message, mais Internet est coupé : reprise au retour de la liaison.',
          true,
        );
      }
      return;
    }

    const recipient = this.nodes.find((n) => n.id === d.recipientNode);
    if (recipient && recipient.status !== 'offline') {
      d.terminal = true;
      d.queued = false;
      this.emitStatus(
        deliveryId,
        'delivered',
        'ack',
        `Accusé de réception du destinataire (${this.label(d.recipientNode)})`,
      );
      this.journal('message', 'success', `Message ${deliveryId} remis — accusé de réception de ${this.label(d.recipientNode)}`);
      return;
    }
    d.phase = 'atHub';
    d.stagedAt = this.hubNode()?.id ?? d.stagedAt;
    this.hold(
      deliveryId,
      'Destinataire injoignable',
      'Le Hub détient le message, mais le destinataire est hors ligne : retransmission à son retour.',
      true,
    );
  }

  private timeout(deliveryId: string): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal || d.queued || d.lastStatus === 'failed') return;
    this.emitStatus(
      deliveryId,
      'unconfirmed',
      'ttl',
      'Délai dépassé : aucun accusé de réception. Le message n’est pas confirmé.',
    );
    this.journal('message', 'danger', `Message ${deliveryId} non confirmé : aucun accusé dans le délai`);
  }

  /** R5 : un message sans route n'attend pas éternellement. */
  private expire(deliveryId: string): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal || !d.queued || d.holdReason !== 'Aucune route') return;
    if (d.expireAt !== undefined && this.now < d.expireAt) {
      // Nouvelle mise en attente entre-temps : on repousse l’échéance.
      this.schedule(d.expireAt, 'expire', deliveryId);
      return;
    }
    d.queued = false;
    this.emitStatus(
      deliveryId,
      'failed',
      'no_route',
      `Non délivrable : aucune route vers ${this.label(d.recipientNode)} pendant ${Math.round(
        TIMING.noRouteGrace / 1000,
      )} s de simulation.`,
    );
    this.journal('message', 'danger', `Message ${deliveryId} déclaré non délivrable (aucune route)`);
  }

  private hold(deliveryId: string, reason: string, detail: string, storedAtHub = false): void {
    const d = this.get(deliveryId);
    if (!d || d.terminal) return;
    d.queued = true;
    d.holdReason = reason;
    this.flights.delete(deliveryId);
    this.emitStatus(deliveryId, 'queued', reason, detail, storedAtHub);
    this.journal('message', 'warn', `Message ${deliveryId} mis en attente (${reason})`);
    if (reason === 'Aucune route') {
      d.expireAt = this.now + TIMING.noRouteGrace;
      this.schedule(d.expireAt, 'expire', deliveryId);
    }
  }

  /** Reprise automatique dès qu'un nœud, un lien ou Internet revient. */
  private resumeQueued(): void {
    const weightOf = (d: Delivery) => LOSS_WEIGHT[d.priority];
    for (const d of this.deliveries.values()) {
      if (!d.queued || d.terminal) continue;
      if (d.holdReason === 'Internet indisponible') {
        if (!this.internetUp) continue;
        d.queued = false;
        d.holdReason = undefined;
        d.phase = 'atHub';
        d.stagedAt = this.hubNode()?.id;
        this.emitStatus(d.id, 'routing', 'resume', 'Internet rétabli : reprise de l’acheminement vers la passerelle.');
        this.schedule(this.now + TIMING.final, 'final', d.id);
        continue;
      }

      if (d.phase === 'atHub') {
        const from = d.stagedAt ?? this.hubNode()?.id;
        if (!from || !this.usable(from)) continue;
        const next = this.route(from, d.recipientNode, weightOf(d));
        if (!next || next.path.length < 2) continue;
        this.setPath(d, next.path);
        d.queued = false;
        d.holdReason = undefined;
        this.emitStatus(d.id, 'routing', 'resume', 'Réseau rétabli : le Hub reprend l’acheminement vers le destinataire.');
        this.journal('route', 'success', `Message ${d.id} repris depuis ${this.label(from)}`);
        this.scheduleHop(d.id);
        continue;
      }

      const weight = weightOf(d);
      const direct = this.route(d.senderNode, d.recipientNode, weight);
      const hub = this.hubNode();
      const route =
        direct ??
        (this.hubRelay === 'relay' && hub && hub.status !== 'offline' ? this.route(d.senderNode, hub.id, weight) : null);
      if (!route || route.path.length < 2) continue;
      d.queued = false;
      d.holdReason = undefined;
      d.retries = 0;
      d.phase = 'origin';
      d.stagedAt = undefined;
      this.emitStatus(
        d.id,
        'accepted_local',
        'resume',
        'Réseau rétabli : reprise automatique de la transmission.',
      );
      this.journal('route', 'success', `Message ${d.id} repris : nouvelle route ${route.path.map(this.label).join(' → ')}`);
      this.schedule(this.now + TIMING.route, 'route', d.id);
    }
  }
}
