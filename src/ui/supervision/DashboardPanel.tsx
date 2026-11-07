import { useMemo } from 'react';
import { useApp } from '../../app/store';
import { computeMetrics } from '../../sim/metrics';
import { cx } from '../components/ui';
import { Led, NocSection, Stat } from './common';

/**
 * Tableau de bord d'administration — 100 % dérivé du moteur.
 * Aucun compteur n'est incrémenté côté interface : les valeurs sont recalculées
 * à chaque rendu depuis nœuds / liens / enregistrements / compteurs du moteur.
 */
export function DashboardPanel() {
  const nodes = useApp((s) => s.nodes);
  const links = useApp((s) => s.links);
  const deliveries = useApp((s) => s.deliveries);
  const stats = useApp((s) => s.nodeStats);
  const queues = useApp((s) => s.queueLengths);
  const internetUp = useApp((s) => s.internetUp);

  const metrics = useMemo(
    () => computeMetrics({ nodes, links, deliveries, stats, queues, internetUp }),
    [nodes, links, deliveries, stats, queues, internetUp],
  );

  const relays = metrics.nodes
    .filter((n) => n.kind === 'relay')
    .sort((a, b) => b.forwarded - a.forwarded);
  const maxForwarded = Math.max(1, ...relays.map((r) => r.forwarded));
  const qualityPct = Math.round(metrics.quality * 100);

  return (
    <div className="space-y-3">
      <NocSection
        title="État du réseau"
        action={
          <span className="flex items-center gap-3">
            <Led label="Hub" state={metrics.hubStatus === 'online' ? 'ok' : metrics.hubStatus === 'degraded' ? 'warn' : 'down'} />
            <Led label="Internet" state={metrics.internetUp ? 'ok' : 'down'} />
          </span>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Nœuds total" value={metrics.totalNodes} />
          <Stat label="Actifs" value={metrics.activeNodes} tone="text-emerald-400" />
          <Stat label="Dégradés" value={metrics.degradedNodes} tone="text-amber-400" />
          <Stat label="Indisponibles" value={metrics.unavailableNodes} tone="text-rose-400" />
          <Stat label="Connexions" value={`${metrics.activeLinks}/${metrics.totalLinks}`} />
          <Stat label="En cours" value={metrics.inFlight} tone="text-sky-400" />
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[11px] text-slate-500">Qualité globale simulée</span>
            <span className="text-[13px] font-bold text-emerald-400">{qualityPct} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={cx(
                'h-full rounded-full transition-all',
                qualityPct > 70 ? 'bg-emerald-400' : qualityPct > 40 ? 'bg-amber-400' : 'bg-rose-500',
              )}
              style={{ width: `${qualityPct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-600">
            Heuristique (liens actifs × perte moyenne × nœuds joignables) — ce n’est pas une mesure physique.
          </p>
        </div>
      </NocSection>

      <NocSection title="Messages">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Émis" value={metrics.sent} />
          <Stat label="Reçus (AR)" value={metrics.received} tone="text-emerald-400" />
          <Stat label="En attente" value={metrics.queued} tone="text-amber-400" />
          <Stat label="Échoués" value={metrics.failed} tone="text-rose-400" />
          <Stat label="Non confirmés" value={metrics.unconfirmed} tone="text-amber-400" />
          <Stat label="Transm. relais" value={metrics.relaysForwarded} tone="text-sky-400" />
        </div>
      </NocSection>

      <NocSection title="Transmissions par relais">
        {relays.length === 0 ? (
          <p className="text-[11.5px] text-slate-500">Aucun relais dans la topologie.</p>
        ) : (
          <ul className="space-y-1.5">
            {relays.map((relay) => (
              <li key={relay.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] text-slate-400">
                  {relay.ref ? `${relay.ref} · ` : ''}
                  {relay.name.replace('Relais ', '')}
                </span>
                <span className="h-3 flex-1 overflow-hidden rounded bg-slate-800">
                  <span
                    className="block h-full rounded bg-sky-500/70"
                    style={{ width: `${(relay.forwarded / maxForwarded) * 100}%` }}
                  />
                </span>
                <span className="w-7 text-right text-[11px] font-bold tabular-nums text-slate-300">
                  {relay.forwarded}
                </span>
              </li>
            ))}
          </ul>
        )}
      </NocSection>
    </div>
  );
}
