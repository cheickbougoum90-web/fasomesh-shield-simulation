import { useApp } from '../../app/store';
import { LIMITS } from '../../core/modelAssumptions';
import { NocButton, NocSection } from './common';

const SPEEDS = [0.5, 1, 2, 4];

/**
 * Commandes de simulation : horloge (lecture / pause / vitesse), topologie
 * (ajout de nœud, réinitialisation) et liaison Internet.
 * Toutes ces commandes agissent sur le MOTEUR, pas sur l'affichage.
 */
export function ControlPanel() {
  const simRunning = useApp((s) => s.simRunning);
  const simSpeed = useApp((s) => s.simSpeed);
  const internetUp = useApp((s) => s.internetUp);
  const toggleSim = useApp((s) => s.toggleSim);
  const setSimSpeed = useApp((s) => s.setSimSpeed);
  const resetNetwork = useApp((s) => s.resetNetwork);
  const addSimNode = useApp((s) => s.addSimNode);
  const setInternet = useApp((s) => s.setInternet);
  const nodeCount = useApp((s) => s.nodes.length);

  return (
    <NocSection title="Commandes de simulation">
      <div className="flex flex-wrap gap-1.5">
        <NocButton active={simRunning} onClick={toggleSim} className="flex-1">
          {simRunning ? '⏸ Pause' : '▶ Lancer'}
        </NocButton>
        <NocButton onClick={resetNetwork}>↺ Réinitialiser</NocButton>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[11px] text-slate-500">Vitesse</span>
        {SPEEDS.map((speed) => (
          <NocButton key={speed} active={simSpeed === speed} onClick={() => setSimSpeed(speed)}>
            ×{speed}
          </NocButton>
        ))}
      </div>

      <div className="mt-3 border-t border-slate-800 pt-3">
        <div className="mb-1.5 text-[11px] text-slate-500">
          Topologie — {nodeCount} nœud{nodeCount > 1 ? 's' : ''} (max 16)
        </div>
        <div className="flex flex-wrap gap-1.5">
          <NocButton onClick={() => addSimNode('relay')} disabled={nodeCount >= LIMITS.maxSimNodes}>
            + Relais
          </NocButton>
          <NocButton onClick={() => addSimNode('phone')} disabled={nodeCount >= LIMITS.maxSimNodes}>
            + Appareil
          </NocButton>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-3">
        <span className="text-[11.5px] text-slate-400">Passerelle Internet</span>
        <NocButton tone={internetUp ? 'success' : 'danger'} active={internetUp} onClick={() => setInternet(!internetUp)}>
          {internetUp ? 'Connectée' : 'Coupée'}
        </NocButton>
      </div>
    </NocSection>
  );
}
