import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { makeActor, can } from '../../policy';
import { buildCareCsv } from '../../domain/reports';
import { AppShell } from '../components/AppShell';
import { Button, Callout, Card, EmptyState, SectionTitle, Select } from '../components/ui';

/**
 * Rapports et statistiques (§12) — responsable du CSPS et opérateur du Hub.
 * Export CSV LOCAL (aucun envoi réseau). Les délais affichés sont simulés.
 */

const PERIODS = [
  { id: '24h', label: '24 dernières heures', ms: 24 * 3600_000 },
  { id: '7d', label: '7 derniers jours', ms: 7 * 24 * 3600_000 },
  { id: 'all', label: 'Tout l’historique', ms: Number.POSITIVE_INFINITY },
] as const;

export function ReportsSpace() {
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const careRequests = useApp((s) => s.careRequests);
  const alerts = useApp((s) => s.alerts);
  const deliveries = useApp((s) => s.deliveries);
  const organizations = useApp((s) => s.organizations);
  const memberships = useApp((s) => s.memberships);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const [period, setPeriod] = useState<string>('7d');
  const [exported, setExported] = useState<string | null>(null);

  const actor = me ? makeActor(me, memberships, activeOrgId) : null;
  const mayStats = can({ actor, action: 'stats.read', grants });
  const mayHub = can({ actor, action: 'hub.stats', grants });

  const since = useMemo(() => {
    const p = PERIODS.find((x) => x.id === period) ?? PERIODS[1];
    return Number.isFinite(p.ms) ? Date.now() - p.ms : 0;
  }, [period]);

  const scope = mayHub && !mayStats ? null : activeOrgId;
  const rows = useMemo(
    () =>
      careRequests
        .filter((r) => r.createdAt >= since)
        .filter((r) => (scope ? r.orgId === scope || r.targetOrgId === scope : true)),
    [careRequests, since, scope],
  );

  const alertRows = useMemo(
    () => alerts.filter((a) => a.createdAt >= since),
    [alerts, since],
  );

  if (!me) return null;
  if (!mayStats && !mayHub) {
    return (
      <AppShell title="Rapports" back="/app">
        <EmptyState title="Accès réservé" hint="Les rapports sont réservés au responsable du CSPS et à l’opérateur du Hub." />
      </AppShell>
    );
  }

  const byStatus = new Map<string, number>();
  const byPriority = { critical: 0, urgent: 0, info: 0 };
  const byTarget = new Map<string, number>();
  for (const r of rows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    byPriority[r.priority] += 1;
    const targetName = organizations.find((o) => o.id === r.targetOrgId)?.shortName ?? 'Non orienté';
    byTarget.set(targetName, (byTarget.get(targetName) ?? 0) + 1);
  }

  const failedTransmissions = Object.values(deliveries).filter(
    (d) => d.status === 'failed' && d.createdAt >= since,
  ).length;
  const queuedTransmissions = Object.values(deliveries).filter((d) => d.status === 'queued').length;

  // Délai simulé : createdAt → premier passage à `received` (0 si jamais reçu).
  const delays = rows
    .map((r) => {
      const received = r.events.find((e) => e.to === 'received');
      return received ? received.at - r.createdAt : null;
    })
    .filter((v): v is number => v !== null);
  const avgDelay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length / 1000) : null;

  function exportCsv() {
    try {
      const csv = buildCareCsv(rows, (orgId) => organizations.find((o) => o.id === orgId)?.name ?? orgId ?? '');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-csp-${period}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExported(`Export local généré : ${rows.length} ligne(s) CSV.`);
    } catch {
      setExported('Export impossible dans cet environnement (navigateur sans support Blob).');
    }
  }

  const orgName = organizations.find((o) => o.id === scope)?.name ?? 'tous les établissements';

  return (
    <AppShell title="Rapports et statistiques" subtitle={`Périmètre : ${orgName}`} back="/app" wide>
      <Card className="mb-4">
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Période">
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={exportCsv}>
            Exporter en CSV (local)
          </Button>
        </div>
        {exported ? <p className="mt-2 text-xs text-ink-soft">{exported}</p> : null}
      </Card>

      <SectionTitle>Indicateurs de demandes</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Demandes créées', value: rows.length },
          { label: 'Critiques', value: byPriority.critical },
          { label: 'Urgentes', value: byPriority.urgent },
          { label: 'Normales', value: byPriority.info },
          { label: 'Acceptées', value: byStatus.get('accepted') ?? 0 },
          { label: 'Refusées', value: byStatus.get('rejected') ?? 0 },
          { label: 'En cours', value: rows.filter((r) => !['resolved', 'cancelled', 'rejected'].includes(r.status)).length },
          { label: 'Clôturées', value: byStatus.get('resolved') ?? 0 },
        ].map((kpi) => (
          <Card key={kpi.label} className="py-2 text-center">
            <p className="text-xl font-semibold text-ink">{kpi.value}</p>
            <p className="text-[11px] leading-tight text-ink-mute">{kpi.label}</p>
          </Card>
        ))}
      </div>

      <SectionTitle>Répartition par centre de destination</SectionTitle>
      <Card>
        {byTarget.size ? (
          <ul className="space-y-1 text-sm text-ink-soft">
            {[...byTarget.entries()].map(([name, count]) => (
              <li key={name} className="flex justify-between gap-2">
                <span>{name}</span>
                <span className="font-semibold text-ink">{count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-mute">Aucune demande sur la période.</p>
        )}
      </Card>

      <SectionTitle>Transport simulé</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Card className="py-2 text-center">
          <p className="text-xl font-semibold text-ink">{alertRows.length}</p>
          <p className="text-[11px] text-ink-mute">alertes</p>
        </Card>
        <Card className="py-2 text-center">
          <p className="text-xl font-semibold text-danger">{failedTransmissions}</p>
          <p className="text-[11px] text-ink-mute">transmissions échouées</p>
        </Card>
        <Card className="py-2 text-center">
          <p className="text-xl font-semibold text-ink">{queuedTransmissions}</p>
          <p className="text-[11px] text-ink-mute">en attente de réseau</p>
        </Card>
      </div>

      <Callout tone="info" title="Ce que mesurent ces chiffres">
        Les délais affichés (moyenne : {avgDelay !== null ? `${avgDelay} s` : 'n/a'}) proviennent de la
        SIMULATION du moteur Mesh. Ce ne sont pas des délais réels de prise en charge médicale.
        L’export CSV est généré localement dans le navigateur : rien n’est envoyé sur le réseau.
      </Callout>
    </AppShell>
  );
}
