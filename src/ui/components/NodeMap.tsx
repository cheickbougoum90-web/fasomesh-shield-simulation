import type { MeshLink, MeshNode } from '../../core/types';

/**
 * Carte schématique du réseau Mesh (SVG, 100 % hors-ligne).
 *
 * Choix UX : une carte VOISINE (vue graphe) plutôt qu'une carte géographique.
 * L'application promet une communication là où l'infrastructure manque —
 * une carte tuilée en ligne contredirait la thèse du produit.
 */

export interface RouteOverlay {
  deliveryId: string;
  path: string[];
  idx: number;
}

const STATUS_FILL: Record<MeshNode['status'], string> = {
  online: '#16803c',
  degraded: '#d97706',
  offline: '#dc2626',
};

function shortLabel(name: string): string {
  return name
    .replace(/^Téléphone (de|d’) ?/i, '')
    .replace(/^Relais /i, '')
    .replace(/^Hub Central/i, 'Hub');
}

export function NodeMap({
  nodes,
  links,
  routes = [],
  selectedId,
  onSelect,
  compact = false,
}: {
  nodes: MeshNode[];
  links: MeshLink[];
  routes?: RouteOverlay[];
  selectedId?: string;
  onSelect?: (nodeId: string) => void;
  compact?: boolean;
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const position = (id: string) => byId.get(id)?.position;
  const nodeDown = (id: string) => byId.get(id)?.status === 'offline';

  return (
    <svg viewBox="0 0 360 300" className="w-full" role="img" aria-label="Carte du réseau Mesh simulé">
      <defs>
        <radialGradient id="mapGlow" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eef3f8" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="360" height="300" rx="18" fill="url(#mapGlow)" />

      {/* liens radio */}
      {links.map((link) => {
        const a = position(link.aNodeId);
        const b = position(link.bNodeId);
        if (!a || !b) return null;
        const down = link.status === 'down' || nodeDown(link.aNodeId) || nodeDown(link.bNodeId);
        return (
          <line
            key={link.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={down ? '#e2e8f0' : '#b9c6d6'}
            strokeWidth={down ? 1.5 : 2}
            strokeDasharray={down ? '4 5' : undefined}
          />
        );
      })}

      {/* routes actives : paquets en circulation */}
      {routes.map((route) => {
        const pts = route.path
          .map((id) => position(id))
          .filter(Boolean)
          .map((p) => `${p!.x},${p!.y}`)
          .join(' ');
        if (pts.split(' ').length < 2) return null;
        return (
          <polyline
            key={route.deliveryId}
            points={pts}
            fill="none"
            stroke="#0e7c5a"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="route-flow"
            opacity={0.9}
          />
        );
      })}

      {/* nœuds */}
      {nodes.map((node) => {
        const { x, y } = node.position;
        const fill = STATUS_FILL[node.status];
        const selected = selectedId === node.id;
        const opacity = node.status === 'offline' ? 0.75 : 1;
        return (
          <g
            key={node.id}
            transform={`translate(${x} ${y})`}
            opacity={opacity}
            onClick={onSelect ? () => onSelect(node.id) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            <title>{`${node.name} — ${node.status === 'online' ? 'en ligne' : node.status === 'degraded' ? 'dégradé' : 'hors service'}`}</title>
            {selected ? (
              <circle r={node.kind === 'hub' ? 27 : 21} fill="none" stroke="#0e7c5a" strokeWidth={2} strokeDasharray="3 3" />
            ) : null}

            {node.kind === 'hub' ? (
              <>
                <circle r={20} fill={fill} />
                <path
                  d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                  transform="translate(-12 -12) scale(1.35) translate(-3.5 -3.5)"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                />
              </>
            ) : node.kind === 'relay' ? (
              <>
                <circle r={14} fill={fill} />
                <circle r={4} fill="#ffffff" />
                <path d="M-8 -8 A11 11 0 0 1 8 -8" fill="none" stroke="#ffffff" strokeWidth={1.5} transform="translate(0 -3)" />
              </>
            ) : (
              <>
                <rect x={-9} y={-13} width={18} height={26} rx={4} fill={fill} stroke="#ffffff" strokeWidth={1.5} />
                <rect x={-5.5} y={-9} width={11} height={13} rx={1.5} fill="#ffffff" opacity={0.9} />
                <circle cx={0} cy={9} r={1.8} fill="#ffffff" />
              </>
            )}

            {!compact ? (
              <text
                y={node.kind === 'hub' ? 34 : 27}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="#475569"
              >
                {shortLabel(node.name)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-mute">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-success" /> En ligne
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-warn" /> Dégradé
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger" /> Hors service
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-5 rounded bg-brand-600" /> Route active
      </span>
    </div>
  );
}
