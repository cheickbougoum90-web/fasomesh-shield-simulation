import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { engine, useApp } from '../../app/store';
import { SCENARIOS } from '../../sim/scenarios';
import { formatSimTime } from '../../sim/types';
import { ControlPanel } from './ControlPanel';
import { DashboardPanel } from './DashboardPanel';
import { EventLog } from './EventLog';
import { InspectorPanel } from './InspectorPanel';
import { ScenarioPanel } from './ScenarioPanel';
import { SendPanel } from './SendPanel';
import { TopologyCanvas } from './TopologyCanvas';
import { Led, SimChip, type Selection } from './common';

/**
 * Centre de supervision FasoMesh Shield — console d'administration desktop.
 *
 * Composition : commandes / émission / scénarios | topologie + journal |
 * tableau de bord + inspecteur. Toute donnée affichée provient du moteur de
 * simulation ; l'interface ne calcule aucune valeur réseau elle-même.
 */
export function SupervisionConsole() {
  const [selection, setSelection] = useState<Selection>(null);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [simNow, setSimNow] = useState(0);

  const hubStatus = useApp((s) => s.nodes.find((n) => n.kind === 'hub')?.status ?? 'offline');
  const internetUp = useApp((s) => s.internetUp);
  const simRunning = useApp((s) => s.simRunning);
  const simSpeed = useApp((s) => s.simSpeed);
  const loadScenario = useApp((s) => s.loadScenario);

  // Horloge de simulation : 4 rafraîchissements/seconde suffisent à l'affichage
  // sans provoquer de rendu global à chaque image.
  useEffect(() => {
    setSimNow(engine.now);
    const id = window.setInterval(() => setSimNow(engine.now), 250);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="noc">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#070b11]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5">
          <Link to="/" className="noc-btn">
            ← Application civile
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold tracking-tight text-slate-100">
              FasoMesh Shield <span className="text-slate-500">/</span> Centre de supervision
            </h1>
            <p className="truncate text-[11px] text-slate-500">
              Simulation logique du réseau Mesh — aucun trafic radio, Wi-Fi ou LoRa réel.
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-1.5">
              <span className="font-mono text-[13px] font-bold tabular-nums text-emerald-400">
                T+{formatSimTime(simNow)}
              </span>
              <span className="text-[10.5px] text-slate-500">×{simSpeed}</span>
              <span className={`text-[10.5px] font-bold ${simRunning ? 'text-emerald-400' : 'text-amber-400'}`}>
                {simRunning ? 'EN MARCHE' : 'PAUSE'}
              </span>
            </div>
            <Led
              label={`Hub ${hubStatus === 'online' ? 'actif' : hubStatus === 'degraded' ? 'dégradé' : 'coupé'}`}
              state={hubStatus === 'online' ? 'ok' : hubStatus === 'degraded' ? 'warn' : 'down'}
            />
            <Led label={internetUp ? 'Internet' : 'Internet coupé'} state={internetUp ? 'ok' : 'down'} />
            <SimChip />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-3 p-4 lg:grid-cols-[300px_minmax(0,1fr)_330px]">
        {/* ── colonne gauche : commandes ── */}
        <div className="space-y-3">
          <ControlPanel />
          <SendPanel />
          <ScenarioPanel
            activeId={activeScenario}
            onRun={(id) => {
              setActiveScenario(id);
              loadScenario(id);
            }}
          />
        </div>

        {/* ── colonne centrale : topologie + journal ── */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="h-[440px] lg:h-[520px]">
            <TopologyCanvas selection={selection} onSelect={setSelection} />
          </div>
          <EventLog />
        </div>

        {/* ── colonne droite : pilotage ── */}
        <div className="space-y-3">
          <DashboardPanel />
          <InspectorPanel selection={selection} onClear={() => setSelection(null)} />
        </div>
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-8">
        <p className="text-[11px] leading-relaxed text-slate-600">
          Toutes les valeurs affichées (batterie, signal, latence, qualité, horloge) sont <strong>simulées</strong> :
          elles servent à éprouver la logique du réseau Mesh, pas à reproduire les performances d’un matériel réel.
          Les scénarios disponibles : {SCENARIOS.map((s) => `n° ${s.index}`).join(', ')}.
        </p>
      </footer>
    </div>
  );
}
