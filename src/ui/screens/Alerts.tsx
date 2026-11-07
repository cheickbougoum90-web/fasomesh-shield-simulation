import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCurrentUser } from '../../app/hooks';
import { PRIORITY_META, sortAlerts } from '../../domain/alert';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, EmptyState, timeAgo } from '../components/ui';
import { StatusPill } from '../components/StatusBits';

export function Alerts() {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const alerts = useApp((s) => s.alerts);
  const users = useApp((s) => s.users);
  const deliveries = useApp((s) => s.deliveries);
  const acknowledge = useApp((s) => s.acknowledgeAlert);

  const sorted = sortAlerts(alerts);

  return (
    <AppShell
      title="Alertes"
      subtitle={`${sorted.length} alerte${sorted.length > 1 ? 's' : ''} sur le réseau`}
      action={
        <Link
          to="/app/alerts/new"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white"
          aria-label="Nouvelle alerte"
        >
          <Icon name="plus" size={20} />
        </Link>
      }
    >
      {sorted.length ? (
        <div className="space-y-3">
          {sorted.map((alert) => {
            const meta = PRIORITY_META[alert.priority];
            const author = users.find((u) => u.id === alert.senderId);
            const record = deliveries[alert.deliveryId];
            const acknowledged = me ? alert.acknowledgedBy.includes(me.id) : false;
            const isMine = alert.senderId === me?.id;
            return (
              <Card
                key={alert.id}
                className={
                  alert.priority === 'critical'
                    ? 'border-danger/40 ring-1 ring-danger/20'
                    : alert.priority === 'urgent'
                      ? 'border-warn/40'
                      : undefined
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        alert.priority === 'critical'
                          ? 'bg-danger text-white'
                          : alert.priority === 'urgent'
                            ? 'bg-warn text-white'
                            : 'bg-info-soft text-info'
                      }`}
                    >
                      <Icon name="alert" size={16} />
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold leading-tight text-ink">{alert.title}</p>
                      <p className="text-[11px] text-ink-mute">
                        {author?.displayName ?? 'Inconnu'} · {timeAgo(alert.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>

                <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{alert.body}</p>

                {alert.geo ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-mute">
                    <Icon name="map" size={13} /> {alert.geo}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {record ? <StatusPill status={record.status} /> : null}
                  {record ? (
                    <Link to={`/app/track/${record.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                      Voir le suivi
                    </Link>
                  ) : null}
                  <span className="ml-auto flex items-center gap-2">
                    {alert.acknowledgedBy.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-success">
                        <Icon name="check" size={13} /> {alert.acknowledgedBy.length} accusé
                        {alert.acknowledgedBy.length > 1 ? 's' : ''}
                      </span>
                    ) : null}
                    {!acknowledged ? (
                      <Button size="sm" variant="secondary" onClick={() => acknowledge(alert.id)}>
                        Accuser réception
                      </Button>
                    ) : (
                      <span className="rounded-lg bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
                        Reçu par vous
                      </span>
                    )}
                  </span>
                </div>
                {isMine ? (
                  <p className="mt-2 text-[11px] text-ink-mute">Alerte émise par votre compte.</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="alert"
          title="Aucune alerte"
          hint="Les alertes émises par les habitants apparaîtront ici, les critiques en premier."
          action={<Button onClick={() => navigate('/app/alerts/new')}>Créer une alerte</Button>}
        />
      )}
    </AppShell>
  );
}

export function Notifications() {
  const navigate = useNavigate();
  const notifications = useApp((s) => s.notifications);
  const markAll = useApp((s) => s.markAllNotificationsRead);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <AppShell
      title="Notifications"
      subtitle={unread ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est lu'}
      back="/app"
      action={
        unread ? (
          <button
            onClick={markAll}
            className="rounded-full px-3 text-xs font-semibold text-brand-600 hover:bg-brand-50"
          >
            Tout lire
          </button>
        ) : undefined
      }
    >
      {notifications.length ? (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card
                className="flex gap-3"
                onClick={n.deepLink ? () => navigate(n.deepLink!) : undefined}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    n.type === 'alert'
                      ? 'bg-danger-soft text-danger'
                      : n.type === 'message'
                        ? 'bg-info-soft text-info'
                        : 'bg-canvas text-ink-soft'
                  }`}
                >
                  <Icon name={n.type === 'alert' ? 'alert' : n.type === 'message' ? 'chat' : 'info'} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{n.title}</span>
                    {!n.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-danger" /> : null}
                  </span>
                  <span className="block text-xs leading-relaxed text-ink-soft">{n.body}</span>
                  <span className="mt-1 block text-[11px] text-ink-mute">{timeAgo(n.createdAt)}</span>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="bell" title="Aucune notification" hint="Les accusés de réception et l’état du réseau s’affichent ici." />
      )}

      <p className="mt-5 text-center text-[11px] text-ink-mute">
        {notifications.length} notification{notifications.length > 1 ? 's' : ''} conservée
        {notifications.length > 1 ? 's' : ''} localement
      </p>
    </AppShell>
  );
}
