import { useApp } from '../../app/store';
import { Link } from 'react-router-dom';
import { ALERT_CATEGORIES, ALERT_CATEGORY_LABEL, ORG_AVAILABILITY_LABEL, type Priority } from '../../core/types';
import { CARE_KIND_LABEL } from '../../domain/care';
import { JOURNAL_CATEGORY_LABEL } from '../../sim/types';
import { makeActor, can } from '../../policy';
import { AppShell } from '../components/AppShell';
import { Badge, Button, Card, Callout, EmptyState, ErrorList, Field, SectionTitle, Select, TextArea, timeAgo } from '../components/ui';
import { useState } from 'react';

/** Espace Hub (§2C) : alertes, orientation, files, supervision, incidents, journaux. */

export function HubSpace() {
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const alerts = useApp((s) => s.alerts);
  const memberships = useApp((s) => s.memberships);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const setCategory = useApp((s) => s.setAlertCategory);
  const acknowledge = useApp((s) => s.acknowledgeAlert);
  const deliveries = useApp((s) => s.deliveries);
  const nodes = useApp((s) => s.nodes);
  const links = useApp((s) => s.links);
  const journal = useApp((s) => s.journal);
  const incidents = useApp((s) => s.incidents);
  const reportIncident = useApp((s) => s.reportIncident);
  const retryDelivery = useApp((s) => s.retryDelivery);
  const toggleHub = useApp((s) => s.toggleHub);
  const organizations = useApp((s) => s.organizations);
  const careRequests = useApp((s) => s.careRequests);
  const orientRequest = useApp((s) => s.orientRequest);
  const [errors, setErrors] = useState<string[]>([]);
  const [orientTarget, setOrientTarget] = useState<Record<string, string>>({});
  const [incident, setIncident] = useState({ title: '', detail: '', severity: 'urgent' as Priority });

  if (!me) return null;
  const actor = makeActor(me, memberships, activeOrgId);
  const mayRead = can({ actor, action: 'hub.alert.read', grants });
  const mayCategorize = can({ actor, action: 'hub.categorize', grants });
  const mayOrient = mayCategorize && !!activeOrgId;
  const mayJournal = can({ actor, action: 'journal.read', grants });
  const maySupervise = can({ actor, action: 'network.toggleHub', grants });
  const mayReportIncident =
    can({ actor, action: 'ngo.incident.write', grants }) || maySupervise;
  const centres = organizations.filter((o) => o.kind === 'health_center' || o.kind === 'hospital');

  const statusCounts = Object.values(deliveries).reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  // Files d’attente : tout ce qui n’est ni arrivé ni abandonné (§2C).
  const pendingDeliveries = Object.values(deliveries)
    .filter((d) => d.status === 'queued' || d.status === 'routing' || d.status === 'failed' || d.status === 'unconfirmed')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, 8);
  const nodesOffline = nodes.filter((n) => n.status !== 'online').length;
  const linksDown = links.filter((l) => l.status === 'down').length;

  if (!mayRead) {
    return (
      <AppShell title="Centre du Hub" back="/app">
        <EmptyState title="Accès réservé" hint="Cette console nécessite le rôle opérateur du Hub dans le contexte actif." />
      </AppShell>
    );
  }

  return (
    <AppShell title="Centre du Hub" subtitle="Réception, catégorisation, orientation — simulé">
      <ErrorList errors={errors} />

      <SectionTitle>Statistiques du Hub (dérivées de la simulation)</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Alertes reçues', alerts.length],
          ['Critiques', alerts.filter((a) => a.priority === 'critical').length],
          ['Livrés', statusCounts.delivered ?? 0],
          ['En attente', statusCounts.queued ?? 0],
          ['Échoués', statusCounts.failed ?? 0],
          ['Nœuds actifs', nodes.filter((n) => n.status !== 'offline').length],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <p className="text-xs text-ink-mute">{label}</p>
            <p className="text-xl font-semibold text-ink">{value}</p>
          </Card>
        ))}
      </div>

      {mayOrient ? (
        <>
          <SectionTitle>Orienter une demande vers un centre compétent</SectionTitle>
          {careRequests.length === 0 ? (
            <EmptyState title="Aucune demande" hint="Les demandes adressées au Hub apparaîtront ici." />
          ) : (
            <div className="space-y-2">
              {careRequests.slice(0, 6).map((r) => {
                const current = organizations.find((o) => o.id === r.targetOrgId)?.shortName ?? 'non orienté';
                return (
                  <Card key={r.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{r.caseRef}</span>
                        <span className="block truncate text-xs text-ink-mute">
                          {CARE_KIND_LABEL[r.kind] ?? r.kind} · priorité {r.priority} · actuellement {current}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Select
                        aria-label={`Destination de ${r.caseRef}`}
                        value={orientTarget[r.id] ?? ''}
                        onChange={(e) => setOrientTarget((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      >
                        <option value="">— Choisir un centre —</option>
                        {centres.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.availability ? ORG_AVAILABILITY_LABEL[c.availability] : 'dispo. non déclarée'})
                          </option>
                        ))}
                      </Select>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!orientTarget[r.id]}
                        onClick={() => {
                          const result = orientRequest(r.id, orientTarget[r.id]);
                          if (!result.ok) setErrors(result.errors);
                        }}
                      >
                        Orienter
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      <SectionTitle>Alertes adressées au Hub</SectionTitle>
      {alerts.length === 0 ? (
        <EmptyState title="Aucune alerte" hint="Les alertes émises par les citoyens arrivent ici." />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{a.title}</p>
                  <p className="text-xs text-ink-mute">
                    {a.senderId} · {timeAgo(a.createdAt)}
                  </p>
                </div>
                <Badge tone={a.priority === 'critical' ? 'danger' : a.priority === 'urgent' ? 'warn' : 'info'}>
                  {a.priority}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{a.body}</p>
              {a.geo ? <p className="mt-1 text-xs text-ink-mute">{a.geo}</p> : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {mayCategorize ? (
                  <Select
                    aria-label="Catégoriser l’alerte"
                    value={a.category ?? ''}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const result = setCategory(a.id, e.target.value);
                      if (!result.ok) setErrors(result.errors);
                    }}
                  >
                    <option value="">— Catégoriser —</option>
                    {ALERT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {ALERT_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {a.category ? <Badge tone="info">{ALERT_CATEGORY_LABEL[a.category]}</Badge> : null}
                <Button size="sm" variant="secondary" onClick={() => acknowledge(a.id)}>
                  {a.acknowledgedBy.includes(me.id) ? 'Accusée ✓' : 'Accuser réception'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {/* ── Files d’attente (§2C) ─────────────────────────────────────── */}
      <SectionTitle>Files d’attente ({pendingDeliveries.length})</SectionTitle>
      {pendingDeliveries.length === 0 ? (
        <EmptyState icon="clock" title="Files vide" hint="Tous les envois sont arrivés ou abandonnés : rien n’attend dans les files." />
      ) : (
        <div className="space-y-2">
          {pendingDeliveries.map((d) => (
            <Card key={d.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{d.id}</p>
                <p className="text-xs text-ink-mute">
                  {d.hops.length} saut(s) · {d.attempts} tentative(s) · créé {timeAgo(d.createdAt)} ·
                  stocké au Hub : {d.storedAtHub ? 'oui (repli de stockage)' : 'non'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={d.status === 'failed' ? 'danger' : d.status === 'unconfirmed' ? 'warn' : 'info'}>
                  {d.status}
                </Badge>
                {d.status === 'failed' || d.status === 'unconfirmed' ? (
                  <Button size="sm" variant="secondary" onClick={() => retryDelivery(d.id)}>
                    Reprendre l’envoi
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Supervision des nœuds et des liaisons (§2C) ───────────────── */}
      <SectionTitle>Supervision des nœuds et des liaisons</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Nœuds actifs', value: `${nodes.length - nodesOffline}/${nodes.length}` },
          { label: 'Liaisons up', value: `${links.length - linksDown}/${links.length}` },
          { label: 'En file', value: String(statusCounts.queued ?? 0) },
          { label: 'Échoués', value: String(statusCounts.failed ?? 0) },
        ].map((c) => (
          <Card key={c.label} className="py-2.5">
            <p className="text-lg font-semibold text-ink">{c.value}</p>
            <p className="text-[11px] leading-tight text-ink-mute">{c.label}</p>
          </Card>
        ))}
      </div>
      {maySupervise ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={toggleHub}>
            Couper / rétablir le Hub
          </Button>
          <Link to="/app/network" className="pb-1 text-xs font-semibold text-signal underline-offset-2 hover:underline">
            Carte des nœuds et des liaisons →
          </Link>
        </div>
      ) : null}

      {/* ── Incidents réseau (§2C) ────────────────────────────────────── */}
      <SectionTitle>Incidents réseau ({incidents.length})</SectionTitle>
      {mayReportIncident ? (
        <Card className="space-y-2">
          <Field label="Titre de l’incident">
            <TextArea value={incident.title} onChange={(e) => setIncident((p) => ({ ...p, title: e.target.value }))} rows={1} />
          </Field>
          <Field label="Description">
            <TextArea value={incident.detail} onChange={(e) => setIncident((p) => ({ ...p, detail: e.target.value }))} rows={2} />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Sévérité">
              <Select
                value={incident.severity}
                onChange={(e) => setIncident((p) => ({ ...p, severity: e.target.value as Priority }))}
              >
                <option value="info">Information</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critique</option>
              </Select>
            </Field>
            <Button
              size="sm"
              variant="primary"
              disabled={incident.title.trim().length < 3 || incident.detail.trim().length < 5}
              onClick={() => {
                const result = reportIncident(incident);
                if (!result.ok) setErrors(result.errors);
                else {
                  setErrors([]);
                  setIncident({ title: '', detail: '', severity: 'urgent' });
                }
              }}
            >
              Signaler l’incident
            </Button>
          </div>
        </Card>
      ) : null}
      {incidents.length === 0 ? (
        <EmptyState icon="alert" title="Aucun incident déclaré" hint="Les incidents réseau signalés apparaîtront ici, rattachés à leur organisation." />
      ) : (
        <div className="mt-2 space-y-2">
          {incidents.slice(0, 8).map((i) => (
            <Card key={i.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{i.title}</p>
                  <p className="text-xs text-ink-soft">{i.detail}</p>
                  <p className="mt-1 text-[11px] text-ink-mute">
                    {organizations.find((o) => o.id === i.orgId)?.shortName ?? i.orgId} · déclaré {timeAgo(i.createdAt)}
                  </p>
                </div>
                <Badge tone={i.severity === 'critical' ? 'danger' : i.severity === 'urgent' ? 'warn' : 'info'}>
                  {i.severity}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Journaux techniques (§2C) ─────────────────────────────────── */}
      {mayJournal ? (
        <>
          <SectionTitle>Journaux techniques ({journal.length})</SectionTitle>
          {journal.length === 0 ? (
            <p className="text-xs text-ink-mute">Le journal de supervision est vide pour l’instant.</p>
          ) : (
            <div className="space-y-1">
              {journal.slice(0, 12).map((entry) => (
                <Card key={entry.seq} className="flex items-start justify-between gap-2 py-2">
                  <p className="min-w-0 text-xs text-ink-soft">{entry.text}</p>
                  <Badge tone={entry.severity === 'danger' ? 'danger' : entry.severity === 'warn' ? 'warn' : 'muted'}>
                    {JOURNAL_CATEGORY_LABEL[entry.category] ?? entry.category}
                  </Badge>
                </Card>
              ))}
            </div>
          )}
          <Callout tone="info" title="Journal technique ≠ journal d’audit">
            Ce journal technique est réservé à la supervision du réseau. Les décisions sanitaires, elles, restent dans
            l’historique de chaque dossier et dans le journal d’audit de l’administration.
          </Callout>
        </>
      ) : null}
    </AppShell>
  );
}
