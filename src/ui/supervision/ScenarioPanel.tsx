import { SCENARIOS } from '../../sim/scenarios';
import { NocSection } from './common';

/**
 * Scénarios prédéfinis : chacun applique un patch de topologie (après avoir
 * remis le réseau à l'état nominal), émet ses messages de référence et affiche
 * le résultat attendu — c'est la matrice de validation de l'étape « Tests ».
 */
export function ScenarioPanel({
  activeId,
  onRun,
}: {
  activeId: string | null;
  onRun: (id: string) => void;
}) {
  return (
    <NocSection title="Scénarios prédéfinis">
      <ul className="space-y-1.5">
        {SCENARIOS.map((scenario) => {
          const active = scenario.id === activeId;
          return (
            <li key={scenario.id}>
              <button
                onClick={() => onRun(scenario.id)}
                className={
                  'w-full rounded-xl border px-2.5 py-2 text-left transition ' +
                  (active
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-600')
                }
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[10px] font-bold text-slate-300">
                    {scenario.index}
                  </span>
                  <span className="text-[12.5px] font-semibold text-slate-100">{scenario.title}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{scenario.goal}</p>
                <p className="mt-1 text-[11px] leading-snug text-emerald-400/90">
                  <span className="font-semibold">À observer :</span> {scenario.expected}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10.5px] leading-snug text-slate-500">
        Charger un scénario remet d’abord tout le réseau en état, puis applique ses coupures. Les scénarios 6 et 7
        rétablissent automatiquement le réseau après 6 s / 8 s de simulation.
      </p>
    </NocSection>
  );
}
