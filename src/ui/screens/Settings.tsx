import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCurrentUser, usePermission } from '../../app/hooks';
import { ALL_ACTIONS, ACTION_LABEL, ROLE_DESCRIPTION, ROLE_LABEL } from '../../domain/permissions';
import { can } from '../../domain/permissions';
import { CRYPTO_INFO } from '../../infra/crypto';
import { ORG_AVAILABILITY_LABEL, type OrgAvailability } from '../../core/types';
import { can as policyCan, makeActor } from '../../policy';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, Field, SectionTitle, Select, Toggle, cx, initials } from '../components/ui';

const SPEEDS = [1, 4, 16];

export function Settings() {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const users = useApp((s) => s.users);
  const nodes = useApp((s) => s.nodes);
  const updateSettings = useApp((s) => s.updateSettings);
  const logout = useApp((s) => s.logout);
  const resetDemo = useApp((s) => s.resetDemo);
  const simSpeed = useApp((s) => s.simSpeed);
  const setSimSpeed = useApp((s) => s.setSimSpeed);
  const canControlSim = usePermission('sim.control');
  const memberships = useApp((s) => s.memberships);
  const organizations = useApp((s) => s.organizations);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const setOrgAvailability = useApp((s) => s.setOrgAvailability);
  const [availValue, setAvailValue] = useState<OrgAvailability>('open');
  const [availDone, setAvailDone] = useState(false);

  if (!me) return null;
  const device = nodes.find((n) => n.id === me.nodeId);
  const myOrg = activeOrgId ? organizations.find((o) => o.id === activeOrgId) : undefined;
  const actor = makeActor(me, memberships, activeOrgId);
  const mayEditAvailability = policyCan({ actor, action: 'center.availability', grants });

  return (
    <AppShell title="Profil & paramètres" subtitle={ROLE_LABEL[me.role]}>
      <Card className="flex items-center gap-3.5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
          {initials(me.displayName)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[17px] font-semibold text-ink">{me.displayName}</span>
          <span className="mt-1 flex items-center gap-2">
            <Badge tone={me.role === 'operator' ? 'info' : 'success'}>{ROLE_LABEL[me.role]}</Badge>
            <span className="truncate text-[11px] text-ink-mute">compte depuis le {new Date(me.createdAt).toLocaleDateString('fr-FR')}</span>
          </span>
        </span>
      </Card>

      <div className="mt-2 rounded-xl bg-white border border-line px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
        <p className="font-semibold text-ink">Appareil rattaché</p>
        <p className="mt-0.5">
          {device?.name ?? me.nodeId} ·{' '}
          <span className={device?.status === 'offline' ? 'text-danger' : 'text-success'}>
            {device?.status === 'offline' ? 'hors service' : 'en ligne'}
          </span>
        </p>
        <p className="mt-1 text-ink-mute">{ROLE_DESCRIPTION[me.role]}</p>
      </div>

      <SectionTitle>Établissement</SectionTitle>
      {myOrg ? (
        <Card className="space-y-2 text-sm text-ink-soft">
          <p>
            Nom : <strong>{myOrg.name}</strong>
          </p>
          <p>
            District : <strong>{myOrg.district ?? '—'}</strong> · {myOrg.locality ?? '—'}
          </p>
          <p>
            Services déclarés : <strong>{myOrg.services?.length ? myOrg.services.join(', ') : '—'}</strong>
          </p>
          <p>
            Disponibilité déclarée (jamais mesurée) :{' '}
            <strong>{ORG_AVAILABILITY_LABEL[myOrg.availability ?? 'open']}</strong>
            {myOrg.availabilityNote ? ` — ${myOrg.availabilityNote}` : ''}
          </p>
          {mayEditAvailability ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
              <Field label="Nouvelle disponibilité">
                <Select value={availValue} onChange={(e) => setAvailValue(e.target.value as OrgAvailability)}>
                  <option value="open">Disponible</option>
                  <option value="limited">Capacité limitée</option>
                  <option value="closed">Indisponible</option>
                </Select>
              </Field>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const result = setOrgAvailability(myOrg.id, availValue);
                  if (result.ok) setAvailDone(true);
                }}
              >
                Enregistrer (déclaré)
              </Button>
              {availDone ? <span className="pb-2 text-xs text-success">Enregistré et journalisé.</span> : null}
            </div>
          ) : (
            <p className="text-xs text-ink-mute">
              La modification de la disponibilité est réservée au responsable de l’établissement.
            </p>
          )}
          <Link to="/app/directory" className="text-xs font-semibold text-signal underline-offset-2 hover:underline">
            Voir l’annuaire des établissements →
          </Link>
        </Card>
      ) : (
        <p className="text-xs text-ink-mute">
          Aucun établissement sélectionné : choisissez un contexte dans le menu (CSPS, centre de référence, Hub).
        </p>
      )}

      <SectionTitle>Confidentialité</SectionTitle>
      <Card className="divide-y divide-line py-1">
        <Toggle
          checked={me.settings.locationAllowed}
          onChange={(next) => updateSettings({ locationAllowed: next })}
          label="Joindre ma position aux alertes"
          hint="Désactivé par défaut. Aucune géolocalisation n’est lue : vous déclarez la position vous-même."
        />
        <Toggle
          checked={me.settings.notificationsOn}
          onChange={(next) => updateSettings({ notificationsOn: next })}
          label="Notifications internes"
          hint="Accusés de réception, messages en attente et pannes de nœud."
        />
      </Card>

      {canControlSim ? (
        <>
          <SectionTitle>Simulation</SectionTitle>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">Vitesse de l’horloge</span>
              <div className="flex items-center gap-1 rounded-lg bg-canvas p-1">
                {SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setSimSpeed(speed)}
                    className={cx(
                      'rounded-md px-2.5 py-1 text-xs font-semibold transition',
                      simSpeed === speed ? 'bg-white text-ink shadow-sm' : 'text-ink-mute',
                    )}
                  >
                    ×{speed}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
              Accélère uniquement la simulation locale (délais, re-routes, reprises). Aucun effet sur l’appareil.
            </p>
          </Card>
        </>
      ) : null}

      <SectionTitle>Vos permissions</SectionTitle>
      <Card>
        <ul className="grid grid-cols-1 gap-1.5">
          {ALL_ACTIONS.map((action) => {
            const allowed = can(me.role, action);
            return (
              <li key={action} className="flex items-center gap-2 text-sm">
                <span
                  className={cx(
                    'flex h-4.5 w-4.5 items-center justify-center rounded-full',
                    allowed ? 'bg-success-soft text-success' : 'bg-canvas text-ink-mute',
                  )}
                >
                  <Icon name={allowed ? 'check' : 'close'} size={11} />
                </span>
                <span className={allowed ? 'text-ink' : 'text-ink-mute line-through'}>{ACTION_LABEL[action]}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <SectionTitle>Sécurité</SectionTitle>
      <Card className="text-xs leading-relaxed text-ink-soft">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <Icon name="lock" size={14} /> Chiffrement des messages
        </p>
        <p className="mt-1">{CRYPTO_INFO.algorithm} · {CRYPTO_INFO.kdf}</p>
        <p className="mt-1 text-ink-mute">{CRYPTO_INFO.keyOrigin}</p>
        <p className="mt-2 text-ink-mute">
          {users.length} comptes enregistrés sur cet appareil. Votre mot de passe est stocké sous forme d’empreinte
          PBKDF2, jamais en clair.
        </p>
      </Card>

      <SectionTitle>Général</SectionTitle>
      <div className="space-y-2">
        <Link to="/app/history">
          <Button full variant="secondary" icon="history" className="justify-start">
            Historique des événements
          </Button>
        </Link>
        <Link to="/app/help">
          <Button full variant="secondary" icon="help" className="justify-start">
            Centre d’aide
          </Button>
        </Link>
        <Button full variant="secondary" icon="refresh" onClick={() => void resetDemo()}>
          Réinitialiser la démonstration
        </Button>
        <Button
          full
          variant="ghost"
          icon="logout"
          onClick={() => {
            logout();
            navigate('/', { replace: true });
          }}
        >
          Se déconnecter
        </Button>
      </div>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-mute">
        FasoMesh Shield · version civile de démonstration<br />
        Données conservées uniquement sur cet appareil (IndexedDB)
      </p>
    </AppShell>
  );
}
