import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { DeliveryRecord, DeliveryStatus, HopRecord, MeshNode, StatusEvent } from '../../core/types';
import {
  STATUS_HELP,
  STATUS_LABEL,
  STATUS_STEPS,
  STATUS_TONE,
  stepIndex,
} from '../../domain/delivery';
import { Badge, clockTime, cx, TONE_CLASS } from './ui';
import { Icon } from './Icon';

/**
 * Bits d'affichage du suivi d'acheminement.
 * Toute statut affiché provient de la machine à états du domaine —
 * l'interface ne peut pas « inventer » un message reçu.
 */

export function StatusPill({
  status,
  icon = true,
  className,
}: {
  status: DeliveryStatus;
  icon?: boolean;
  className?: string;
}) {
  const icons: Partial<Record<DeliveryStatus, Parameters<typeof Icon>[0]['name']>> = {
    delivered: 'check',
    queued: 'clock',
    unconfirmed: 'help',
    failed: 'close',
    routing: 'antenna',
    accepted_local: 'shield',
    created: 'list',
    draft: 'list',
  };
  const name = icons[status];
  return (
    <Badge tone={STATUS_TONE[status]} icon={icon && name ? name : undefined} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function StatusHelp({ status }: { status: DeliveryStatus }) {
  return <p className="text-sm leading-relaxed text-ink-soft">{STATUS_HELP[status]}</p>;
}

/** Progression en 4 étapes, avec marqueur d'interruption si le message est bloqué. */
export function StatusSteps({ record }: { record: DeliveryRecord }) {
  const blocked = record.status === 'queued' || record.status === 'failed' || record.status === 'unconfirmed';
  const reached = STATUS_STEPS.filter((s) => record.events.some((e) => e.to === s)).length;
  const active = stepIndex(record.status);

  return (
    <ol className="space-y-0">
      {STATUS_STEPS.map((step, i) => {
        const done = blocked ? i < reached : active > i;
        const current = blocked ? i === reached : active === i && !blocked;
        const isLast = i === STATUS_STEPS.length - 1;
        return (
          <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast ? (
              <span
                className={cx(
                  'absolute left-[11px] top-6 h-[calc(100%-16px)] w-0.5',
                  done ? 'bg-brand-500' : 'bg-line',
                )}
              />
            ) : null}
            <span
              className={cx(
                'relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-white',
                done
                  ? 'border-brand-500 bg-brand-500'
                  : current
                    ? blocked
                      ? 'border-danger bg-danger'
                      : 'border-brand-600 bg-white'
                    : 'border-line bg-white',
              )}
            >
              {done ? (
                <Icon name="check" size={13} />
              ) : current && blocked ? (
                <Icon name="close" size={12} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-line" />
              )}
            </span>
            <span className="min-w-0">
              <span className={cx('block text-sm font-semibold', done || current ? 'text-ink' : 'text-ink-mute')}>
                {STATUS_LABEL[step]}
              </span>
              <span className="block text-xs leading-relaxed text-ink-mute">{STATUS_HELP[step]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function HopTimeline({ hops, nodes }: { hops: HopRecord[]; nodes: MeshNode[] }) {
  if (!hops.length) return null;
  const label = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <ul className="space-y-2">
      {hops.map((hop, i) => (
        <li key={`${hop.fromNodeId}-${hop.toNodeId}-${i}`} className="flex items-center gap-2 text-sm">
          <span
            className={cx(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              hop.result === 'ok' ? 'bg-success' : hop.result === 'lost' ? 'bg-danger' : 'bg-warn',
            )}
          />
          <span className="truncate text-ink">
            {label(hop.fromNodeId)} <span className="text-ink-mute">→</span> {label(hop.toNodeId)}
          </span>
          <span className="ml-auto shrink-0 text-xs text-ink-mute">{clockTime(hop.at)}</span>
          <span
            className={cx(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
              hop.result === 'ok'
                ? 'bg-success-soft text-success'
                : hop.result === 'lost'
                  ? 'bg-danger-soft text-danger'
                  : 'bg-warn-soft text-warn',
            )}
          >
            {hop.result === 'ok' ? 'ok' : hop.result === 'lost' ? 'perdu' : 're-route'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Journal({ events }: { events: StatusEvent[] }) {
  return (
    <ul className="space-y-3">
      {[...events].reverse().map((event, i) => (
        <li key={`${event.at}-${event.to}-${i}`} className="flex gap-3">
          <span className="w-16 shrink-0 pt-0.5 text-right font-mono text-[11px] text-ink-mute">
            {clockTime(event.at)}
          </span>
          <span className="flex flex-col items-center">
            <span className={cx('mt-1 h-2.5 w-2.5 rounded-full', TONE_CLASS[STATUS_TONE[event.to]].split(' ')[0])} />
            <span className="mt-1 w-px flex-1 bg-line" />
          </span>
          <span className="min-w-0 pb-1">
            <span className="block text-sm font-medium text-ink">{STATUS_LABEL[event.to]}</span>
            {event.detail ? <span className="block text-xs leading-relaxed text-ink-mute">{event.detail}</span> : null}
            <span className="block text-[11px] text-ink-mute">cause : {event.reason}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DeliveryLink({ deliveryId, children }: { deliveryId: string; children: ReactNode }) {
  return (
    <Link to={`/app/track/${deliveryId}`} className="underline decoration-line underline-offset-2 hover:text-brand-600">
      {children}
    </Link>
  );
}
