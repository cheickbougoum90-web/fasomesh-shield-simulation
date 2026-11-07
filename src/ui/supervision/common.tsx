import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Priority } from '../../core/types';
import { cx } from '../components/ui';

/** Élément sélectionné dans la topologie. */
export type Selection = { kind: 'node'; id: string } | { kind: 'link'; id: string } | null;

export const PRIORITY_LABEL: Record<Priority, string> = {
  info: 'Normal',
  urgent: 'Urgent',
  critical: 'Critique',
};

export const PRIORITY_CLASS: Record<Priority, string> = {
  info: 'text-sky-300',
  urgent: 'text-amber-300',
  critical: 'text-rose-300',
};

/** Priorité « couleur » utilisée pour les paquets et les badges. */
export const PRIORITY_COLOR: Record<Priority, string> = {
  info: '#38bdf8',
  urgent: '#f7b955',
  critical: '#fb6f7e',
};

export function NocSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="noc-panel p-3">
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="noc-title">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

type NocButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tone?: 'default' | 'danger' | 'success';
};

export function NocButton({ active, tone = 'default', className, ...rest }: NocButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'noc-btn',
        active && 'noc-btn-active',
        tone === 'danger' && 'noc-btn-danger',
        tone === 'success' && 'noc-btn-success',
        className,
      )}
    />
  );
}

export function Led({ label, state }: { label: string; state: 'ok' | 'warn' | 'down' }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cx(
          'noc-led',
          state === 'ok' ? 'bg-emerald-400 text-emerald-400' : state === 'warn' ? 'bg-amber-400 text-amber-400' : 'bg-rose-500 text-rose-500',
        )}
      />
      <span className="text-[11px] font-semibold tracking-wide text-slate-400">{label}</span>
    </span>
  );
}

/** Marqueur permanent : toute donnée affichée par la console est simulée. */
export function SimChip() {
  return <span className="noc-sim">SIMULÉ</span>;
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/70 py-1.5 last:border-0">
      <span className="text-[11.5px] text-slate-400">{label}</span>
      <span className="text-right text-[12.5px] font-semibold text-slate-100">{value}</span>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-2.5 py-2">
      <div className={cx('text-lg font-bold leading-none tabular-nums', tone ?? 'text-slate-100')}>{value}</div>
      <div className="mt-1 text-[10px] uppercase leading-tight tracking-wider text-slate-500">{label}</div>
    </div>
  );
}
