import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, type ActionResult } from '../../app/store';
import { DEMO_PASSWORD } from '../../infra/crypto';
import { Icon } from '../components/Icon';
import { Button, ErrorList, Field, Input } from '../components/ui';
import { SimBanner } from '../components/AppShell';

/**
 * Écran de connexion (§3 du cahier des charges final) :
 * l'inscription citoyenne / ONG a été retirée du dispositif visible — seuls
 * les comptes de démonstration des trois espaces (CSPS, Centre de référence,
 * Hub) sont proposés. Le store conserve `register()` pour les tests.
 */

const DEMO_ACCOUNTS: { espace: string; hint: string; accounts: string[] }[] = [
  { espace: 'Espace CSPS', hint: 'création et suivi des dossiers', accounts: ['responsable_csps', 'agent_csps', 'agent_csps2'] },
  { espace: 'Espace Centre de référence', hint: 'réception, décisions, transferts', accounts: ['agent_centre_reference', 'agent_hopital'] },
  { espace: 'Espace Hub', hint: 'alertes, orientation, supervision', accounts: ['operateur_hub'] },
  { espace: 'Administration', hint: 'comptes, configuration, audit', accounts: ['administrateur'] },
];

export function Auth() {
  const navigate = useNavigate();
  const login = useApp((s) => s.login);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result: ActionResult = await login(name, password);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    navigate('/app', { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SimBanner />
      <div className="flex flex-1 flex-col px-5 pb-8 pt-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Icon name="shield" size={22} />
          </span>
          <div>
            <p className="text-lg font-semibold text-ink">FasoMesh Shield — dispositif sanitaire</p>
            <p className="text-xs text-ink-mute">CSPS · Centre de référence · Hub — comptes simulés sur cet appareil</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <ErrorList errors={errors} />

          <Field label="Identifiant du compte" hint="Un des comptes de démonstration ci-dessous">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="agent_csps"
              autoComplete="username"
              required
            />
          </Field>

          <Field label="Mot de passe">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              required
            />
          </Field>

          <Button full size="lg" type="submit" disabled={busy}>
            {busy ? 'Vérification…' : 'Se connecter'}
          </Button>
        </form>

        <div className="mt-5 rounded-xl border border-dashed border-brand-200 bg-brand-50 px-3.5 py-3 text-xs leading-relaxed text-brand-800">
          <p className="mb-1 font-semibold">
            Comptes de démonstration — mot de passe commun : « {DEMO_PASSWORD} »
          </p>
          <p className="mb-2 text-brand-700">
            Cliquez sur un identifiant pour le remplir. Toutes les données sont fictives.
          </p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((groupe) => (
              <div key={groupe.espace}>
                <p className="font-semibold uppercase tracking-wide text-[10px] text-brand-900/70">
                  {groupe.espace} — {groupe.hint}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {groupe.accounts.map((account) => (
                    <button
                      key={account}
                      type="button"
                      onClick={() => {
                        setErrors([]);
                        setName(account);
                        setPassword(DEMO_PASSWORD);
                      }}
                      className="rounded-md bg-white px-2 py-1 font-mono text-[11px] font-semibold text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100"
                    >
                      {account}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 rounded-xl bg-white px-3.5 py-3 text-xs leading-relaxed text-ink-mute ring-1 ring-line">
          <strong className="text-ink-soft">Démonstration simulée.</strong> Aucune inscription n'est proposée :
          aucun compte, aucune donnée et aucune transmission radio ne sont réelles. Aucune donnée ne quitte cet
          appareil.{' '}
          <button type="button" onClick={() => navigate('/app/help')} className="font-semibold text-brand-600 underline hover:text-brand-700">
            Qu'est-ce qui est simulé ?
          </button>
        </p>
      </div>
    </div>
  );
}
