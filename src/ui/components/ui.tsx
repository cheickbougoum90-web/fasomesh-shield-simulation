import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import type { Tone } from '../../core/types';
import { useApp } from '../../app/store';
import { Icon } from './Icon';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ── Boutons ────────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  icon?: Parameters<typeof Icon>[0]['name'];
};

const BUTTON_VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-600/25',
  secondary: 'bg-white text-ink border border-line hover:border-brand-200 hover:bg-brand-50',
  ghost: 'bg-transparent text-ink-soft hover:bg-black/5',
  danger: 'bg-danger text-white hover:brightness-95',
  success: 'bg-success text-white hover:brightness-95',
};

const BUTTON_SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-[15px] rounded-xl gap-2',
  lg: 'h-12 px-5 text-base rounded-xl gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        full && 'w-full',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

// ── Conteneurs ─────────────────────────────────────────────────────────────
export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'block w-full rounded-2xl bg-surface border border-line p-4 text-left',
        onClick && 'transition hover:border-brand-200 active:scale-[0.995]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-mute">{children}</h2>
      {action}
    </div>
  );
}

// ── Formulaires ────────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-ink-mute">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs font-medium text-danger">{error}</span> : null}
    </label>
  );
}

const CONTROL =
  'w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-mute outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, 'h-11', props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(CONTROL, 'min-h-28 resize-y py-2.5 leading-relaxed', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <select {...rest} className={cx(CONTROL, 'h-11 appearance-none pr-8')}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 py-3 text-left"
      aria-pressed={checked}
    >
      <span>
        <span className="block text-[15px] font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-relaxed text-ink-mute">{hint}</span> : null}
      </span>
      <span
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-brand-600' : 'bg-line',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

// ── Badges & états ─────────────────────────────────────────────────────────
export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-black/5 text-ink-soft',
  info: 'bg-info-soft text-info',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  muted: 'bg-canvas text-ink-mute border border-line',
};

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: Parameters<typeof Icon>[0]['name'];
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

export function EmptyState({
  icon = 'info',
  title,
  hint,
  action,
}: {
  icon?: Parameters<typeof Icon>[0]['name'];
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-8 text-center">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-56 text-sm leading-relaxed text-ink-mute">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('rounded-xl border px-3.5 py-3 text-sm leading-relaxed', TONE_CLASS[tone])}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      <div className="opacity-90">{children}</div>
    </div>
  );
}

// ── Retours visuels ────────────────────────────────────────────────────────
export function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger space-y-1">
      {errors.map((e) => (
        <li key={e} className="flex gap-2">
          <Icon name="close" size={15} className="mt-0.5 shrink-0" />
          <span>{e}</span>
        </li>
      ))}
    </ul>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-mute">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-600" />
      {label}
    </span>
  );
}

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            'pointer-events-auto rise-in w-full rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg',
            t.tone === 'danger'
              ? 'bg-danger'
              : t.tone === 'warn'
                ? 'bg-warn'
                : t.tone === 'success'
                  ? 'bg-success'
                  : 'bg-ink',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function timeAgo(at: number): string {
  const diff = Date.now() - at;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;
  return new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
