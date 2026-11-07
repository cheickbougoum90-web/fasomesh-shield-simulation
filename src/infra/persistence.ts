import type {
  Alert,
  AppNotification,
  AuditEntry,
  CareRequest,
  Conversation,
  DeliveryRecord,
  Group,
  Incident,
  Membership,
  MeshLink,
  MeshNode,
  Message,
  Organization,
  SharedGrant,
  User,
} from '../core/types';

/**
 * Persistance locale (IndexedDB, avec repli mémoire/localStorage).
 *
 * Toute la démonstration vit sur l'appareil : aucun serveur, aucune donnée
 * transmise. C'est un choix assumé de la version civile de démonstration —
 * le Hub simulé deviendra le point de persistance serveur en phase 2.
 */

export interface PersistedState {
  /** Version du jeu de démonstration (une évolution remplace l'ancien jeu). */
  seedVersion?: number;
  users: User[];
  /** Multi-profils (optionnel : ancien schéma de sauvegarde sans ces champs). */
  organizations?: Organization[];
  memberships?: Membership[];
  groups?: Group[];
  grants?: SharedGrant[];
  activeOrgId?: string | null;
  currentUserId: string | null;
  contacts: { id: string; ownerId: string; name: string; nodeId: string; favorite: boolean }[];
  conversations: Conversation[];
  messages: Message[];
  deliveries: Record<string, DeliveryRecord>;
  alerts: Alert[];
  careRequests?: CareRequest[];
  incidents?: Incident[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  nodes: MeshNode[];
  links: MeshLink[];
  simRunning: boolean;
  simSpeed: number;
  seeded: boolean;
}

const DB_NAME = 'fasomesh-shield';
const STORE = 'snapshots';
const KEY = 'state';
const LS_KEY = 'fasomesh-shield:state';

function openDb(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

export async function loadState(): Promise<PersistedState | null> {
  try {
    const db = await openDb();
    if (db) {
      const value = await new Promise<PersistedState | null>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(KEY);
        request.onsuccess = () => resolve((request.result as PersistedState) ?? null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (value) return value;
    }
  } catch {
    /* repli sur localStorage */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    const db = await openDb();
    if (db) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(state, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return;
    }
  } catch {
    /* repli localStorage */
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* quota — la démo continue en mémoire */
  }
}

export async function clearState(): Promise<void> {
  try {
    const db = await openDb();
    if (db) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
