import { AppShell } from '../components/AppShell';
import { Icon, type IconName } from '../components/Icon';
import { Card, EmptyState, clockTime } from '../components/ui';
import { useApp } from '../../app/store';

function iconFor(action: string): IconName {
  const value = action.toLowerCase();
  if (value.includes('panne') || value.includes('nœud')) return 'power';
  if (value.includes('alerte')) return 'alert';
  if (value.includes('remis') || value.includes('réception')) return 'check';
  if (value.includes('message') || value.includes('envoi')) return 'send';
  if (value.includes('compte')) return 'user';
  if (value.includes('réseau')) return 'signal';
  return 'history';
}

export function History() {
  const audit = useApp((s) => s.audit);
  const me = useApp((s) => s.currentUserId);
  const mine = audit.filter((entry) => entry.actorId === me || entry.actorId === null).slice(0, 60);

  return (
    <AppShell title="Historique" subtitle="Journal horodaté des événements" back="/app/settings">
      {mine.length ? (
        <ol className="relative space-y-3 border-l border-line pl-4 ml-2">
          {mine.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[22px] top-3 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-white text-brand-600">
                <Icon name={iconFor(entry.action)} size={13} />
              </span>
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{entry.action}</p>
                  <time className="text-[11px] text-ink-mute">{clockTime(entry.at)}</time>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{entry.detail}</p>
                <p className="mt-1 text-[11px] text-ink-mute">par {entry.actorName}</p>
              </Card>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon="history" title="Journal vide" hint="Les envois, accusés de réception et pannes de nœud s’inscrivent ici." />
      )}
      <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-mute">
        Le journal conserve les 300 derniers événements de cette démonstration.
      </p>
    </AppShell>
  );
}
