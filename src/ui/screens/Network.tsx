import { Link } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCurrentUser, usePermission } from '../../app/hooks';
import { health } from '../../mesh/graph';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, SectionTitle, cx } from '../components/ui';
import { MapLegend } from '../components/NodeMap';

const STATUS_TEXT: Record<string, { label: string; tone: 'success' | 'warn' | 'danger' }> = {
  online: { label: 'En ligne', tone: 'success' },
  degraded: { label: 'Dégradé', tone: 'warn' },
  offline: { label: 'Hors service', tone: 'danger' },
};

const SPEEDS = [1, 4, 16];

export function Network() {
  const me = useCurrentUser();
  const canToggle = usePermission('network.toggleNode');
  const canControlSim = usePermission('sim.control');

  const nodes = useApp((s) => s.nodes);
  const links = useApp((s) => s.links);
  const deliveries = useApp((s) => s.deliveries);
  const toggleNode = useApp((s) => s.toggleNode);
  const toggleHub = useApp((s) => s.toggleHub);
  const restoreNetwork = useApp((s) => s.restoreNetwork);
  const simRunning = useApp((s) => s.simRunning);
  const simSpeed = useApp((s) => s.simSpeed);
  const toggleSim = useApp((s) => s.toggleSim);
  const setSimSpeed = useApp((s) => s.setSimSpeed);

  const net = health(nodes, links);
  const queued = Object.values(deliveries).filter((d) => d.status === 'queued').length;
  const inFlight = Object.values(deliveries).filter((d) => d.status === 'routing').length;
  const hub = nodes.find((n) => n.kind === 'hub');

  return (
    <AppShell title="État du réseau" subtitle="Simulation locale du maillage">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Hub</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-ink">
            <span
              className={cx(
                'h-2.5 w-2.5 rounded-full',
                net.hubStatus === 'offline' ? 'bg-danger' : net.hubStatus === 'degraded' ? 'bg-warn' : 'bg-success',
              )}
            />
            {net.hubStatus === 'offline' ? 'Hors service' : net.hubStatus === 'degraded' ? 'Dégradé' : 'Actif'}
          </p>
          <p className="mt-1 text-xs text-ink-mute">Charge {hub?.load ?? '—'} %</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Nœuds</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {net.online + net.degraded}/{net.total}
          </p>
          <p className="mt-1 text-xs text-ink-mute">{net.offline} hors service</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">En transmission</p>
          <p className="mt-1 text-lg font-semibold text-ink">{inFlight}</p>
          <p className="mt-1 text-xs text-ink-mute">messages en route</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">File d’attente</p>
          <p className={cx('mt-1 text-lg font-semibold', queued ? 'text-warn' : 'text-ink')}>{queued}</p>
          <p className="mt-1 text-xs text-ink-mute">en attente de réseau</p>
        </Card>
      </div>

      <Link to="/app/network/map" className="mt-3 block">
        <Card className="flex items-center justify-between">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon name="map" size={20} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-ink">Carte des nœuds</span>
              <span className="block text-xs text-ink-mute">Chemin des messages, coupure d’un nœud</span>
            </span>
          </span>
          <Icon name="chevron" size={18} className="text-ink-mute" />
        </Card>
      </Link>

      {canControlSim ? (
        <>
          <SectionTitle>Contrôle de la simulation</SectionTitle>
          <Card>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={simRunning ? 'secondary' : 'primary'} onClick={toggleSim}>
                {simRunning ? 'Mettre en pause' : 'Reprendre'}
              </Button>
              <div className="ml-auto flex items-center gap-1 rounded-lg bg-canvas p-1">
                {SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setSimSpeed(speed)}
                    className={cx(
                      'rounded-md px-2.5 py-1 text-xs font-semibold transition',
                      simSpeed === speed ? 'bg-white text-ink shadow-sm' : 'text-ink-mute hover:text-ink-soft',
                    )}
                  >
                    ×{speed}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
              ×10 il y a quelques secondes. La vitesse accélère l’horloge de simulation : délais, re-routes et reprises
              suivent la même logique, simplement plus vite.
            </p>
          </Card>
        </>
      ) : null}

      <SectionTitle>Nœuds ({nodes.length})</SectionTitle>
      <div className="space-y-2">
        {nodes.map((node) => {
          const status = STATUS_TEXT[node.status];
          return (
            <Card key={node.id} className="flex items-center gap-3">
              <span
                className={cx(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  node.status === 'offline'
                    ? 'bg-danger-soft text-danger'
                    : node.status === 'degraded'
                      ? 'bg-warn-soft text-warn'
                      : 'bg-brand-50 text-brand-600',
                )}
              >
                <Icon name={node.kind === 'hub' ? 'shield' : node.kind === 'relay' ? 'antenna' : 'user'} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{node.name}</span>
                <span className="block text-[11px] text-ink-mute">
                  {node.kind === 'hub' ? 'Hub' : node.kind === 'relay' ? 'Relais' : 'Téléphone'} ·
                  batterie {node.battery} %
                </span>
              </span>
              <Badge tone={status.tone}>{status.label}</Badge>
              {canToggle ? (
                <button
                  onClick={() => toggleNode(node.id)}
                  className={cx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition',
                    node.status === 'offline'
                      ? 'border-success/40 bg-success-soft text-success'
                      : 'border-line bg-white text-ink-soft hover:border-danger/40 hover:text-danger',
                  )}
                  aria-label={node.status === 'offline' ? `Rétablir ${node.name}` : `Couper ${node.name}`}
                  title={node.status === 'offline' ? 'Rétablir' : 'Simuler une panne'}
                >
                  <Icon name="power" size={16} />
                </button>
              ) : null}
            </Card>
          );
        })}
      </div>

      <SectionTitle>Liens radio ({links.filter((l) => l.status === 'up').length}/{links.length})</SectionTitle>
      <Card className="space-y-1.5">
        {links.map((link) => {
          const a = nodes.find((n) => n.id === link.aNodeId);
          const b = nodes.find((n) => n.id === link.bNodeId);
          const down = link.status === 'down' || a?.status === 'offline' || b?.status === 'offline';
          return (
            <div key={link.id} className="flex items-center justify-between text-xs">
              <span className={cx('truncate', down ? 'text-ink-mute line-through' : 'text-ink-soft')}>
                {a?.name ?? link.aNodeId} ↔ {b?.name ?? link.bNodeId}
              </span>
              <span className={cx('shrink-0 font-medium', down ? 'text-danger' : 'text-ink-mute')}>
                {down ? 'coupé' : `${link.latencyMs} ms · perte ${(link.lossRate * 100).toFixed(0)} %`}
              </span>
            </div>
          );
        })}
      </Card>

      {canToggle ? (
        <div className="mt-4 space-y-2">
          <Button full variant="danger" icon="power" onClick={toggleHub}>
            {hub?.status === 'offline' ? 'Rétablir le Hub' : 'Simuler la panne du Hub'}
          </Button>
          <Button full variant="secondary" icon="refresh" onClick={restoreNetwork}>
            Tout rétablir
          </Button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-white border border-line px-3.5 py-3 text-xs leading-relaxed text-ink-mute">
          Profil {me ? 'citoyen' : '—'} : vous pouvez consulter le réseau. La coupure des nœuds est réservée à
          l’opérateur du Hub.
        </p>
      )}

      <div className="mt-4">
        <MapLegend />
      </div>
    </AppShell>
  );
}
