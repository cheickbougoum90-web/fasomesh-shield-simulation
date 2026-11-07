import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCurrentUser, usePermission } from '../../app/hooks';
import { health } from '../../mesh/graph';
import { isActive, STATUS_LABEL } from '../../domain/delivery';
import { ROLE_LABEL } from '../../domain/permissions';
import { CARE_LABEL } from '../../domain/care';
import { makeActor, can } from '../../policy';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, EmptyState, SectionTitle, timeAgo } from '../components/ui';
import { StatusPill } from '../components/StatusBits';

/**
 * Tableau de bord CSPS (§4) : les informations prioritaires sont visibles
 * dès l’ouverture — établissement, compteurs de dossiers, état du nœud et
 * du réseau, alertes actives, dernières communications, actions rapides.
 */
export function Dashboard() {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const isOperator = usePermission('network.toggleHub');

  const nodes = useApp((s) => s.nodes);
  const links = useApp((s) => s.links);
  const messages = useApp((s) => s.messages);
  const deliveries = useApp((s) => s.deliveries);
  const notifications = useApp((s) => s.notifications);
  const alerts = useApp((s) => s.alerts);
  const users = useApp((s) => s.users);
  const organizations = useApp((s) => s.organizations);
  const memberships = useApp((s) => s.memberships);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const careRequests = useApp((s) => s.careRequests);
  const grants = useApp((s) => s.grants);

  const net = health(nodes, links);
  const queued = Object.values(deliveries).filter((d) => d.status === 'queued').length;
  const localNode = me ? nodes.find((n) => n.id === me.nodeId) : undefined;

  const actor = me ? makeActor(me, memberships, activeOrgId) : null;
  const maySeeOrg = can({ actor, action: 'care.readOrg', grants });
  const orgDossiers = maySeeOrg ? careRequests.filter((r) => r.orgId === activeOrgId) : [];

  const counts = {
    pending: orgDossiers.filter((r) => ['created', 'sent', 'received', 'acknowledged', 'information_requested'].includes(r.status)).length,
    urgent: orgDossiers.filter((r) => r.priority === 'critical' || r.priority === 'urgent').length,
    accepted: orgDossiers.filter((r) => ['accepted', 'in_progress', 'in_transit', 'arrived'].includes(r.status)).length,
    refused: orgDossiers.filter((r) => r.status === 'rejected').length,
    open: orgDossiers.filter((r) => !['resolved', 'cancelled', 'rejected'].includes(r.status)).length,
    closed: orgDossiers.filter((r) => r.status === 'resolved').length,
  };

  const mine = messages.filter((m) => m.senderId === me?.id || m.recipientId === me?.id);
  const recentComms = [...mine].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  const inFlight = mine
    .map((m) => ({ message: m, record: deliveries[m.deliveryId] }))
    .filter((x) => x.record && isActive(x.record.status))
    .sort((a, b) => b.message.createdAt - a.message.createdAt)
    .slice(0, 4);

  const recentNotifications = notifications.slice(0, 3);
  const healthAlerts = alerts.filter((a) => a.priority === 'critical' || a.priority === 'urgent');
  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const roleName = me ? (memberships.find((m) => m.userId === me.id && m.orgId === activeOrgId)?.role ?? me.role) : null;

  const firstName = me?.displayName.split(' ')[0] ?? '';
  const mayCreate = can({ actor, action: 'care.create', grants });

  return (
    <AppShell title={`Bonjour ${firstName}`} subtitle={me ? ROLE_LABEL[roleName ?? me.role] : undefined} wide>
      {/* Établissement + compte + nœud local */}
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Établissement</p>
        <p className="mt-1 text-lg font-semibold text-ink">{activeOrg?.name ?? 'Contexte personnel'}</p>
        <p className="text-sm text-ink-mute">
          {activeOrg?.locality ? `${activeOrg.locality} · ${activeOrg.district ?? ''}` : 'Aucune organisation active'}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-soft">
          <span>
            Compte : <strong>{me?.displayName}</strong>
          </span>
          <span>
            Rôle : <strong>{roleName ? ROLE_LABEL[roleName] : '—'}</strong>
          </span>
          <span>
            Nœud local :{' '}
            <strong>
              {localNode ? `${localNode.name} (${localNode.status})` : 'non rattaché'}
            </strong>
          </span>
        </div>
      </Card>

      {/* État du réseau */}
      <Card className="relative mt-3 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Réseau Mesh (simulé)</p>
            <p className="mt-1 flex items-center gap-2 text-xl font-semibold text-ink">
              <span
                className={`h-2.5 w-2.5 rounded-full ${net.hubStatus === 'offline' ? 'bg-danger' : 'bg-success'} ${net.hubStatus === 'offline' ? '' : 'pulse-dot'}`}
              />
              {net.hubStatus === 'offline' ? 'Hub hors service' : net.allReachable ? 'Réseau opérationnel' : 'Réseau dégradé'}
            </p>
            <p className="mt-1 text-sm text-ink-mute">
              {net.online + net.degraded}/{net.total} nœuds actifs
              {queued > 0 ? ` · ${queued} en attente` : ''}
            </p>
          </div>
          <Link
            to="/app/network"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100"
            aria-label="Voir le réseau"
          >
            <Icon name="signal" size={20} />
          </Link>
        </div>
      </Card>

      {/* Compteurs de dossiers */}
      {maySeeOrg ? (
        <>
          <SectionTitle
            action={
              <Link to="/app/care" className="text-xs font-semibold text-brand-600 hover:underline">
                Dossiers
              </Link>
            }
          >
            Demandes de l’établissement
          </SectionTitle>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {[
              { label: 'En attente', value: counts.pending, tone: 'text-ink' },
              { label: 'Urgentes', value: counts.urgent, tone: 'text-danger' },
              { label: 'Acceptées', value: counts.accepted, tone: 'text-success' },
              { label: 'Refusées', value: counts.refused, tone: 'text-ink-mute' },
              { label: 'En cours', value: counts.open, tone: 'text-brand-600' },
              { label: 'Clôturés', value: counts.closed, tone: 'text-ink' },
            ].map((c) => (
              <Card key={c.label} className="py-2">
                <p className={`text-xl font-semibold ${c.tone}`}>{c.value}</p>
                <p className="text-[11px] leading-tight text-ink-mute">{c.label}</p>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {/* Actions rapides */}
      <SectionTitle>Actions rapides</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {mayCreate ? (
          <>
            <Button icon="list" variant="primary" onClick={() => navigate('/app/care/new?kind=reference')}>
              Nouvelle référence
            </Button>
            <Button icon="list" onClick={() => navigate('/app/care/new?kind=evacuation')}>
              Nouvelle évacuation
            </Button>
          </>
        ) : null}
        <Button icon="send" onClick={() => navigate('/app/messages/new')}>
          Contacter un centre
        </Button>
        <Button icon="alert" variant="secondary" onClick={() => navigate('/app/alerts/new')}>
          Alerte au Hub
        </Button>
        <Button icon="list" variant="secondary" onClick={() => navigate('/app/care')}>
          Voir les demandes
        </Button>
        <Button icon="map" variant="secondary" onClick={() => navigate('/app/directory')}>
          Annuaire
        </Button>
      </div>

      {/* Alertes sanitaires actives */}
      <SectionTitle
        action={
          <Link to="/app/alerts" className="text-xs font-semibold text-brand-600 hover:underline">
            Tout voir
          </Link>
        }
      >
        Alertes actives
      </SectionTitle>
      {healthAlerts.length ? (
        <div className="space-y-2">
          {healthAlerts.slice(0, 3).map((alert) => (
            <Link key={alert.id} to="/app/alerts" className="block">
              <Card className={alert.priority === 'critical' ? 'border-danger-soft bg-danger-soft/40' : undefined}>
                <span className="flex items-center gap-2">
                  <Badge tone={alert.priority === 'critical' ? 'danger' : 'warn'} icon="alert">
                    {alert.priority === 'critical' ? 'Critique' : 'Urgente'}
                  </Badge>
                  <span className="truncate text-sm font-semibold text-ink">{alert.title}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{alert.body}</span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon="alert" title="Aucune alerte active" hint="Les alertes sanitaires remontent ici dès leur émission." />
      )}

      {/* Dernières communications */}
      <SectionTitle>Dernières communications</SectionTitle>
      {recentComms.length ? (
        <div className="space-y-2">
          {recentComms.map((m) => {
            const other = users.find((u) => u.id === (m.senderId === me?.id ? m.recipientId : m.senderId));
            return (
              <Link key={m.id} to={`/app/messages/${m.conversationId}`} className="block">
                <Card className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {m.senderId === me?.id ? 'Vers ' : 'De '}
                      {other?.displayName ?? 'destinataire'}
                    </span>
                    <span className="block truncate text-xs text-ink-mute">{timeAgo(m.createdAt)}</span>
                  </span>
                  <StatusPill status={deliveries[m.deliveryId]?.status ?? 'failed'} />
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="chat" title="Aucune communication" hint="Vos échanges avec les centres et le Hub apparaîtront ici." />
      )}

      {/* En cours d'acheminement */}
      {inFlight.length ? (
        <>
          <SectionTitle
            action={
              <Link to="/app/history" className="text-xs font-semibold text-brand-600 hover:underline">
                Historique
              </Link>
            }
          >
            En cours
          </SectionTitle>
          <div className="space-y-2">
            {inFlight.map(({ message, record }) => {
              const recipient = users.find((u) => u.id === message.recipientId);
              return (
                <Link key={message.id} to={`/app/track/${message.deliveryId}`} className="block">
                  <Card className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        Vers {recipient?.displayName ?? 'destinataire inconnu'}
                      </span>
                      <span className="block text-xs text-ink-mute">{timeAgo(message.createdAt)}</span>
                    </span>
                    <StatusPill status={record.status} />
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      {isOperator && healthAlerts.length ? (
        <>
          <SectionTitle
            action={
              <Link to="/app/hub" className="text-xs font-semibold text-brand-600 hover:underline">
                Hub
              </Link>
            }
          >
            Centre des alertes
          </SectionTitle>
          <div className="space-y-2">
            {healthAlerts.slice(0, 2).map((alert) => (
              <Link key={alert.id} to="/app/hub" className="block">
                <Card className="border-danger-soft bg-danger-soft/40">
                  <span className="flex items-center gap-2">
                    <Badge tone="danger" icon="alert">
                      Critique
                    </Badge>
                    <span className="truncate text-sm font-semibold text-ink">{alert.title}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{alert.body}</span>
                </Card>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle
        action={
          <Link to="/app/notifications" className="text-xs font-semibold text-brand-600 hover:underline">
            Tout voir
          </Link>
        }
      >
        Notifications
      </SectionTitle>
      {recentNotifications.length ? (
        <div className="space-y-2">
          {recentNotifications.map((n) => (
            <Link key={n.id} to={n.deepLink ?? '/app/notifications'} className="block">
              <Card className="flex gap-3">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    n.type === 'alert' ? 'bg-danger-soft text-danger' : n.type === 'message' ? 'bg-info-soft text-info' : 'bg-canvas text-ink-soft'
                  }`}
                >
                  <Icon name={n.type === 'alert' ? 'alert' : n.type === 'message' ? 'chat' : 'info'} size={16} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{n.title}</span>
                    {!n.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-danger" /> : null}
                  </span>
                  <span className="block text-xs leading-relaxed text-ink-mute">{n.body}</span>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon="bell" title="Aucune notification" hint="Les confirmations d’envoi et l’état du réseau arrivent ici." />
      )}

      {orgDossiers.length ? (
        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-mute">
          Dernier dossier : {orgDossiers[0].caseRef} — {CARE_LABEL[orgDossiers[0].status]}
        </p>
      ) : null}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-mute">
        Derniers statuts :{' '}
        {['created', 'accepted_local', 'routing', 'delivered'].map((s, i) => (
          <span key={s}>
            {i > 0 ? ' · ' : ''}
            {STATUS_LABEL[s as keyof typeof STATUS_LABEL]}
          </span>
        ))}
      </p>
    </AppShell>
  );
}
