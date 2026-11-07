import { useEffect, useMemo, useState } from 'react';
import type { MeshLink, MeshNode, Priority } from '../../core/types';
import { engine, useApp } from '../../app/store';
import { nodeRef } from '../../sim/refs';
import { PRIORITY_COLOR, type Selection } from './common';

/**
 * Topologie Mesh interactive (SVG).
 *
 * Choix technique : le SVG donne un clic fiable par élément (nœud ET lien),
 * un tracé net à tout zoom et un DOM inspectable. Au-delà d'une centaine
 * d'éléments, il faudrait passer sur Canvas — documenté comme limite.
 *
 * Les paquets sont interpolés par le moteur (`getFlights`) : l'animation
 * n'est qu'une conséquence de l'état simulé, jamais l'inverse.
 */

const VIEW_W = 360;
const VIEW_H = 300;

const KIND_LABEL: Record<MeshNode['kind'], string> = {
  hub: 'Hub de supervision',
  relay: 'Relais',
  phone: 'Appareil utilisateur',
};

export { KIND_LABEL as NODE_KIND_LABEL };

function nodeColor(node: MeshNode): string {
  if (node.status === 'offline') return '#fb6f7e';
  if (node.status === 'degraded') return '#f7b955';
  if (node.kind === 'hub') return '#35d0a5';
  if (node.kind === 'relay') return '#38bdf8';
  return '#94a3b8';
}

function linkColor(link: MeshLink, active: boolean): string {
  if (link.status === 'down') return '#4a2733';
  return active ? '#38bdf8' : '#22415a';
}

export function TopologyCanvas({ selection, onSelect }: { selection: Selection; onSelect: (s: Selection) => void }) {
  const nodes = useApp((s) => s.nodes);
  const links = useApp((s) => s.links);
  const activity = useApp((s) => s.activity);
  const selectedNode = selection?.kind === 'node' ? selection.id : null;
  const selectedLink = selection?.kind === 'link' ? selection.id : null;

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const activeLinks = useMemo(() => {
    const set = new Set<string>();
    for (const flight of engine.getFlights()) if (flight.linkId) set.add(flight.linkId);
    return set;
  }, [nodes, links, activity]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#080d14]">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" role="img" aria-label="Topologie du réseau Mesh simulé">
        <defs>
          <pattern id="noc-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0v24" fill="none" stroke="#101a25" strokeWidth="1" />
          </pattern>
          <filter id="noc-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={VIEW_W} height={VIEW_H} fill="url(#noc-grid)" />

        {/* ── liens ── */}
        {links.map((link) => {
          const a = byId.get(link.aNodeId);
          const b = byId.get(link.bNodeId);
          if (!a || !b) return null;
          const isCut = link.status === 'down';
          const isNodeDown = a.status === 'offline' || b.status === 'offline';
          const selected = selectedLink === link.id;
          const active = activeLinks.has(link.id);
          return (
            <g key={link.id} onClick={() => onSelect({ kind: 'link', id: link.id })} className="cursor-pointer">
              <line
                x1={a.position.x}
                y1={a.position.y}
                x2={b.position.x}
                y2={b.position.y}
                stroke={linkColor(link, active)}
                strokeWidth={selected ? 3 : active ? 2.6 : 1.7}
                strokeDasharray={isCut || isNodeDown ? '5 5' : undefined}
                opacity={isCut || isNodeDown ? 0.75 : 1}
                filter={active ? 'url(#noc-glow)' : undefined}
              />
              {/* zone de clic généreuse (le trait est fin) */}
              <line
                x1={a.position.x}
                y1={a.position.y}
                x2={b.position.x}
                y2={b.position.y}
                stroke="transparent"
                strokeWidth={14}
              />
            </g>
          );
        })}

        {/* ── paquets en circulation ── */}
        <PacketLayer nodes={nodes} />

        {/* ── nœuds ── */}
        {nodes.map((node) => {
          const selected = selectedNode === node.id;
          const state = activity[node.id] ?? 'idle';
          const offline = node.status === 'offline';
          const color = nodeColor(node);
          const ref = nodeRef(node.id);
          const isHub = node.kind === 'hub';
          const r = isHub ? 17 : node.kind === 'relay' ? 12 : 10;

          return (
            <g
              key={node.id}
              transform={`translate(${node.position.x} ${node.position.y})`}
              onClick={() => onSelect({ kind: 'node', id: node.id })}
              className="cursor-pointer"
            >
              {(state === 'tx' || state === 'rx') && !offline ? (
                <circle r={r + 4} fill="none" stroke={color} strokeWidth={1.5} className="activity-ring" />
              ) : null}

              {isHub ? (
                <polygon
                  points="0,-19 16.5,-9.5 16.5,9.5 0,19 -16.5,9.5 -16.5,-9.5"
                  fill={offline ? '#1a1016' : '#0b1620'}
                  stroke={color}
                  strokeWidth={selected ? 3 : 2}
                  strokeDasharray={offline ? '4 4' : undefined}
                />
              ) : (
                <circle
                  r={r}
                  fill={offline ? '#1a1016' : '#0b1620'}
                  stroke={color}
                  strokeWidth={selected ? 3 : 2}
                  strokeDasharray={offline ? '4 4' : undefined}
                />
              )}

              {state === 'queued' && !offline ? (
                <circle cx={r + 5} cy={-r - 4} r={4.5} fill="#f7b955" className="packet-pulse" />
              ) : null}

              <text
                y={isHub ? 4 : 3.5}
                textAnchor="middle"
                fontSize={isHub ? 8.5 : 9.5}
                fontWeight={800}
                fill={offline ? '#7a4a55' : color}
                style={{ pointerEvents: 'none' }}
              >
                {isHub ? 'HUB' : ref || '•'}
              </text>

              <text
                y={r + 13}
                textAnchor="middle"
                fontSize={8.6}
                fontWeight={600}
                fill={offline ? '#8b5b66' : '#9fb2c6'}
                style={{ pointerEvents: 'none' }}
              >
                {node.name.replace('Téléphone de ', '').replace('Relais ', 'Rel. ')}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute bottom-2 left-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
        <Legend color="#35d0a5" label="Hub" />
        <Legend color="#38bdf8" label="Relais" />
        <Legend color="#94a3b8" label="Utilisateur" />
        <Legend color="#f7b955" label="Dégradé / file" />
        <Legend color="#fb6f7e" label="Hors service" />
      </div>

      <div className="pointer-events-none absolute right-3 top-2 flex items-center gap-2">
        <span className="noc-chip">Données simulées</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/**
 * Paquets : position interpolée à chaque frame à partir des tronçons en vol
 * du moteur. Si le moteur n'a rien en vol, il n'y a rien à animer.
 */
function PacketLayer({ nodes }: { nodes: MeshNode[] }) {
  const [, force] = useState(0);
  const positions = useMemo(() => new Map(nodes.map((n) => [n.id, n.position])), [nodes]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      force((v) => (v + 1) % 100000);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const now = engine.now;
  const flights = engine.getFlights();

  return (
    <g>
      {flights.map((flight) => {
        const from = positions.get(flight.fromNodeId);
        const to = positions.get(flight.toNodeId);
        if (!from || !to) return null;
        const span = Math.max(1, flight.endAt - flight.startAt);
        const t = Math.min(1, Math.max(0, (now - flight.startAt) / span));
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const color = PRIORITY_COLOR[flight.priority as Priority] ?? '#38bdf8';
        return (
          <g key={flight.deliveryId} style={{ pointerEvents: 'none' }}>
            <line
              x1={from.x}
              y1={from.y}
              x2={x}
              y2={y}
              stroke={color}
              strokeWidth={2.4}
              opacity={0.35}
              strokeLinecap="round"
            />
            <circle cx={x} cy={y} r={7} fill={color} opacity={0.22} className="packet-pulse" />
            <circle cx={x} cy={y} r={3.6} fill={color} filter="url(#noc-glow)" />
          </g>
        );
      })}
    </g>
  );
}
