import { useState } from 'react';
import { useApp } from '../../app/store';
import { JOURNAL_CATEGORY_LABEL, JOURNAL_SEVERITY_CLASS, formatSimTime, type JournalCategory } from '../../sim/types';
import { cx } from '../components/ui';
import { NocButton, NocSection } from './common';

type Filter = 'all' | JournalCategory;

const FILTERS: Filter[] = ['all', 'network', 'message', 'route', 'control'];

/**
 * Journal d'événements de la simulation : entrées émises par le moteur
 * (pannes, sauts, routes, accusés) et par les commandes de l'opérateur.
 * Affiché du plus récent au plus ancien, horodaté à l'horloge de simulation.
 */
export function EventLog() {
  const journal = useApp((s) => s.journal);
  const clearJournal = useApp((s) => s.clearJournal);
  const [filter, setFilter] = useState<Filter>('all');

  const entries = filter === 'all' ? journal : journal.filter((e) => e.category === filter);

  return (
    <NocSection
      title="Journal d’événements"
      action={
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <NocButton key={f} active={filter === f} onClick={() => setFilter(f)} className="h-6 px-2 text-[10.5px]">
              {f === 'all' ? 'Tous' : JOURNAL_CATEGORY_LABEL[f]}
            </NocButton>
          ))}
          <NocButton onClick={clearJournal} className="h-6 px-2 text-[10.5px]">
            Vider
          </NocButton>
        </div>
      }
    >
      <div className="noc-scroll h-44 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-[11.5px] text-slate-500">
            Aucun événement. Lancez un message ou un scénario.
          </p>
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.seq} className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-slate-900/70">
                <span className="w-11 shrink-0 pt-0.5 font-mono text-[10.5px] tabular-nums text-slate-600">
                  {formatSimTime(entry.simTime)}
                </span>
                <span className="w-16 shrink-0 pt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
                  {JOURNAL_CATEGORY_LABEL[entry.category]}
                </span>
                <span className={cx('flex-1 break-words text-[11.5px] leading-snug', JOURNAL_SEVERITY_CLASS[entry.severity])}>
                  {entry.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </NocSection>
  );
}
