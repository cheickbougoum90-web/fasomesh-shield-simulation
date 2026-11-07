import type { CareRequest } from '../core/types';
import { CARE_LABEL } from './care';

/**
 * Export CSV LOCAL (§12 des rapports) : aucun envoi réseau, tout est généré
 * dans le navigateur. Fonction PURE → testable sans DOM.
 * Aucune colonne nominative de patient n'existe : le dossier est une
 * référence non nominative (§7 du cahier des charges).
 */

export function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Construit le contenu complet d'un fichier CSV de dossiers. */
export function buildCareCsv(
  rows: CareRequest[],
  orgName: (orgId: string | null | undefined) => string,
): string {
  const header = ['dossier', 'type', 'priorite', 'statut', 'cspssource', 'destination', 'cree_le', 'recu_apres_s'];
  const lines = [header.join(';')];
  for (const r of rows) {
    const received = r.events.find((e) => e.to === 'received');
    lines.push(
      [
        r.caseRef,
        r.kind,
        r.priority,
        CARE_LABEL[r.status],
        orgName(r.orgId),
        r.targetOrgId ? orgName(r.targetOrgId) : '',
        new Date(r.createdAt).toISOString(),
        received ? String(Math.round((received.at - r.createdAt) / 1000)) : '',
      ]
        .map(csvEscape)
        .join(';'),
    );
  }
  return `\uFEFF${lines.join('\n')}`;
}
