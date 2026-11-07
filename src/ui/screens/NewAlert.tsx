import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCurrentUser } from '../../app/hooks';
import { PRIORITY_META } from '../../domain/alert';
import type { Priority } from '../../core/types';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Button, ErrorList, Field, Input, TextArea, cx } from '../components/ui';

const PRIORITIES: Priority[] = ['info', 'urgent', 'critical'];

export function NewAlert() {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const raiseAlert = useApp((s) => s.raiseAlert);

  const [priority, setPriority] = useState<Priority>('urgent');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await raiseAlert({ title, body, priority });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    navigate('/app/alerts', { replace: true });
  }

  return (
    <AppShell title="Nouvelle alerte" subtitle="Diffusion simulée sur tout le réseau" back="/app/alerts">
      <form onSubmit={submit} className="space-y-4">
        <ErrorList errors={errors} />

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-soft">Niveau de priorité</legend>
          <div className="space-y-2">
            {PRIORITIES.map((p) => {
              const meta = PRIORITY_META[p];
              const active = priority === p;
              const tone =
                p === 'critical' ? 'danger' : p === 'urgent' ? 'warn' : 'info';
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition',
                    active
                      ? tone === 'danger'
                        ? 'border-danger bg-danger-soft ring-2 ring-danger/25'
                        : tone === 'warn'
                          ? 'border-warn bg-warn-soft ring-2 ring-warn/25'
                          : 'border-info bg-info-soft ring-2 ring-info/25'
                      : 'border-line bg-white hover:border-brand-200',
                  )}
                  aria-pressed={active}
                >
                  <span
                    className={cx(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      active ? (tone === 'danger' ? 'border-danger bg-danger' : tone === 'warn' ? 'border-warn bg-warn' : 'border-info bg-info') : 'border-line',
                    )}
                  >
                    {active ? <Icon name="check" size={12} className="text-white" /> : null}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{meta.label}</span>
                    <span className="block text-xs text-ink-mute">{meta.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Titre de l’alerte">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. : Feu de brousse au nord du village"
            maxLength={80}
          />
        </Field>

        <Field label="Description" hint="Soyez concis : l’alerte doit être comprise en une lecture.">
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ce qu’il faut savoir…" maxLength={400} />
        </Field>

        <div className="rounded-xl border border-line bg-white px-3.5 py-3 text-xs leading-relaxed text-ink-mute">
          <p className="flex items-center gap-1.5 font-semibold text-ink-soft">
            <Icon name="map" size={14} /> Position
          </p>
          <p className="mt-1">
            {me?.settings.locationAllowed
              ? 'Position autorisée dans Profil : elle sera jointe à l’alerte.'
              : 'Position non autorisée : aucune localisation ne sera jointe. Vous pouvez l’activer dans Profil.'}
          </p>
        </div>

        <Button
          full
          size="lg"
          type="submit"
          icon="alert"
          variant={priority === 'critical' ? 'danger' : 'primary'}
          disabled={busy}
        >
          {busy ? 'Diffusion…' : 'Diffuser l’alerte'}
        </Button>
      </form>
    </AppShell>
  );
}
