import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../app/store';
import { canRetry } from '../../domain/delivery';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Button, Card, EmptyState, SectionTitle, clockTime } from '../components/ui';
import { HopTimeline, Journal, StatusHelp, StatusPill, StatusSteps } from '../components/StatusBits';
import { useMessageText } from '../../app/useMessageText';

/**
 * Écran 10 — Suivi & détail d'un envoi.
 * C'est l'écran qui porte la promesse d'honnêteté du produit : il montre
 * ce qui s'est RÉELLEMENT passé, étape par étape, avec l'heure de chaque event.
 */
export function Track() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const deliveries = useApp((s) => s.deliveries);
  const messages = useApp((s) => s.messages);
  const alerts = useApp((s) => s.alerts);
  const users = useApp((s) => s.users);
  const nodes = useApp((s) => s.nodes);
  const retry = useApp((s) => s.retryDelivery);

  const record = deliveries[id];
  const message = messages.find((m) => m.deliveryId === id);
  const alert = alerts.find((a) => a.deliveryId === id);
  const decrypted = useMessageText(message);

  if (!record) {
    return (
      <AppShell title="Suivi d’envoi" back="/app/history">
        <EmptyState
          icon="clock"
          title="Envoi introuvable"
          hint="Cet envoi n’existe pas ou a été effacé avec les données de démonstration."
          action={<Button onClick={() => navigate('/app/history')}>Retour à l’historique</Button>}
        />
      </AppShell>
    );
  }

  const sender = users.find((u) => u.id === message?.senderId);
  const recipient = users.find((u) => u.id === message?.recipientId);

  return (
    <AppShell
      title="Suivi de l’envoi"
      subtitle={new Date(record.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      back={message ? `/app/messages/${message.conversationId}` : '/app/alerts'}
    >
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
              {alert ? 'Alerte' : 'Message'}
            </p>
            <p className="mt-1 truncate text-[15px] font-semibold text-ink">
              {alert ? alert.title : `${sender?.displayName ?? '?'} → ${recipient?.displayName ?? '?'}`}
            </p>
          </div>
          <StatusPill status={record.status} />
        </div>

        {!alert && message ? (
          <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm leading-relaxed text-ink-soft">
            {decrypted || 'Déchiffrement…'}
          </p>
        ) : null}

        <div className="mt-3 border-t border-line pt-3">
          <StatusHelp status={record.status} />
        </div>

        {canRetry(record.status) ? (
          <Button className="mt-3" full icon="refresh" onClick={() => retry(record.id)}>
            Renvoyer ce message
          </Button>
        ) : null}
      </Card>

      <SectionTitle>Progression</SectionTitle>
      <Card>
        <StatusSteps record={record} />
      </Card>

      {record.hops.length ? (
        <>
          <SectionTitle>Parcours dans le réseau</SectionTitle>
          <Card>
            <HopTimeline hops={record.hops} nodes={nodes} />
          </Card>
        </>
      ) : null}

      <SectionTitle>Journal des événements</SectionTitle>
      <Card>
        <Journal events={record.events} />
      </Card>

      <div className="mt-4 rounded-xl border border-dashed border-line bg-white/70 px-3.5 py-3 text-[11px] leading-relaxed text-ink-mute">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink-soft">
          <Icon name="info" size={13} /> Simulation
        </p>
        Les sauts, accusés de réception et pertes affichés proviennent du moteur de simulation local — aucune
        transmission radio n’a eu lieu. Les horodatages utilisent l’horloge de la simulation.
        {record.expiresAt ? ` Dernier enregistrement : ${clockTime(record.events[record.events.length - 1]?.at ?? record.createdAt)}.` : null}
      </div>

      <Link
        to="/app/network/map"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink-soft hover:border-brand-200 hover:text-brand-600"
      >
        <Icon name="map" size={16} /> Voir le réseau sur la carte
      </Link>
    </AppShell>
  );
}
