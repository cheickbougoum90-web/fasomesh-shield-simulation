import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { engine, useApp } from '../../app/store';
import { usePermission } from '../../app/hooks';
import { health } from '../../mesh/graph';
import type { MeshNode } from '../../core/types';
import { AppShell } from '../components/AppShell';
import { Badge, Button, Card, cx } from '../components/ui';
import { MapLegend, NodeMap, type RouteOverlay } from '../components/NodeMap';

const STATUS_TEXT: Record<MeshNode['status'], { label: string; tone: 'success' | 'warn' | 'danger' }> = {
  online: { label: 'En ligne', tone: 'success' },
  degraded: { label: 'Dégradé', tone: 'warn' },
  offline: { label: 'Hors service', tone: 'danger' },
};

export function NetworkMap() {
  const nodes = useApp((s) => s.nodes);
  const links = useApp((s) => s.links);
  const toggleNode = useApp((s) => s.toggleNode);
  const canToggle = usePermission('network.toggleNode');

  const [selected, setSelected] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteOverlay[]>([]);

  // Les routes actives changent à chaque saut : on relit le moteur régulièrement.
  useEffect(() => {
    const read = () => setRoutes(engine.activePaths());
    read();
    const timer = window.setInterval(read, 600);
    return () => window.clearInterval(timer);
  }, []);

  const node = nodes.find((n) => n.id === selected);
  const net = health(nodes, links);
  const status = node ? STATUS_TEXT[node.status] : null;
  const activeDeliveries = routes.length;

  return (
    <AppShell title="Carte du réseau" subtitle={`${net.online + net.degraded}/${net.total} nœuds actifs`} back="/app/network">
      <Card className="p-2">
        <NodeMap nodes={nodes} links={links} routes={routes} selectedId={selected ?? undefined} onSelect={setSelected} />
      </Card>

      <div className="mt-3 flex items-center justify-between gap-3">
        <MapLegend />
        <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
          {activeDeliveries} en route
        </span>
      </div>

      {node && status ? (
        <Card className="mt-4 rise-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold text-ink">{node.name}</p>
              <p className="text-xs text-ink-mute">
                {node.kind === 'hub' ? 'Hub de supervision' : node.kind === 'relay' ? 'Nœud relais' : 'Téléphone'} ·
                identifiant <span className="font-mono">{node.id}</span>
              </p>
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-canvas py-2">
              <p className="text-sm font-semibold text-ink">{node.battery} %</p>
              <p className="text-[10px] text-ink-mute">batterie</p>
            </div>
            <div className="rounded-lg bg-canvas py-2">
              <p className="text-sm font-semibold text-ink">{node.load} %</p>
              <p className="text-[10px] text-ink-mute">charge</p>
            </div>
            <div className="rounded-lg bg-canvas py-2">
              <p className="text-sm font-semibold text-ink">
                {links.filter((l) => l.aNodeId === node.id || l.bNodeId === node.id).length}
              </p>
              <p className="text-[10px] text-ink-mute">liens</p>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            {canToggle ? (
              <Button
                size="sm"
                variant={node.status === 'offline' ? 'success' : 'danger'}
                icon="power"
                onClick={() => toggleNode(node.id)}
                className="flex-1"
              >
                {node.status === 'offline' ? 'Rétablir ce nœud' : 'Simuler une panne'}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => setSelected(null)} className="flex-1">
              Fermer
            </Button>
          </div>
        </Card>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-white/70 px-3.5 py-3 text-xs leading-relaxed text-ink-mute">
          <strong className="text-ink-soft">Touchez un nœud</strong> pour voir son état et, si vous êtes opérateur,
          simuler sa panne. Les traits verts animés sont les routes des messages actuellement en transmission.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link to="/app/network">
          <Button full variant="secondary" icon="list">
            État détaillé
          </Button>
        </Link>
        <Link to="/app/history">
          <Button full variant="ghost" icon="history">
            Journal
          </Button>
        </Link>
      </div>

      <p className={cx('mt-4 text-center text-[11px] leading-relaxed text-ink-mute')}>
        Carte schématique hors-ligne : elle représente les liens du réseau simulé, pas une géolocalisation réelle.
      </p>
    </AppShell>
  );
}
