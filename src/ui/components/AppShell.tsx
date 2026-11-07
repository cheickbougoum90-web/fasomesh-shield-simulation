import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useMemo, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import { makeActor } from '../../policy';
import { ROLE_LABEL } from '../../domain/permissions';
import { visibleNav } from '../nav';
import { Icon } from './Icon';
import { cx } from './ui';

/**
 * Coquille de navigation (§8 du cahier des charges final) :
 * — ordinateur : barre latérale claire (navigation, contexte, compte) et
 *   contenu large, tableaux lisibles ;
 * — téléphone : barre d’onglets fixe en bas, colonne centrée.
 * Le bandeau « Simulé » est volontairement présent sur tous les écrans :
 * l'application ne doit jamais laisser croire à une transmission radio réelle.
 */

function useNavItems() {
  const users = useApp((s) => s.users);
  const currentUserId = useApp((s) => s.currentUserId);
  const memberships = useApp((s) => s.memberships);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const me = users.find((u) => u.id === currentUserId);
  return useMemo(
    () => (me ? visibleNav(makeActor(me, memberships, activeOrgId), grants) : []),
    [me, memberships, activeOrgId, grants],
  );
}

function TabBar() {
  // Menu construit depuis la politique : les fonctions non autorisées
  // ne sont pas affichées (§5).
  const tabs = useNavItems();
  return (
    <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
      <ul className="flex overflow-x-auto">
        {tabs.map((tab) => (
          <li key={tab.to} className="min-w-[64px] flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition',
                  isActive ? 'text-brand-600' : 'text-ink-mute hover:text-ink-soft',
                )
              }
            >
              <Icon name={tab.icon} size={21} />
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ContextSelect({ compact = false }: { compact?: boolean }) {
  const currentUserId = useApp((s) => s.currentUserId);
  const memberships = useApp((s) => s.memberships);
  const organizations = useApp((s) => s.organizations);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const setActiveOrg = useApp((s) => s.setActiveOrg);

  // §3 : seuls les établissements du dispositif sanitaire sont proposés —
  // les organisations civiles (familles, ONG) ne sont jamais affichées.
  const DISPOSITIF_KINDS = ['health_center', 'hospital', 'hub', 'admin_network'];
  const mine = memberships.filter((m) => {
    if (m.userId !== currentUserId) return false;
    const org = organizations.find((o) => o.id === m.orgId);
    return org ? DISPOSITIF_KINDS.includes(org.kind) : false;
  });
  if (!mine.length) return null;

  return (
    <div className={compact ? 'space-y-1' : 'flex items-center gap-2'}>
      {!compact ? <span className="text-ink-mute">Contexte</span> : <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-mute">Contexte</label>}
      <select
        aria-label="Changer de contexte organisationnel"
        className={cx(
          'rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink',
          compact ? 'w-full' : 'flex-1',
        )}
        value={mine.some((m) => m.orgId === activeOrgId) ? (activeOrgId ?? '') : ''}
        onChange={(e) => setActiveOrg(e.target.value || null)}
      >
        <option value="">Personnel (aucune organisation)</option>
        {mine.map((m) => (
          <option key={m.orgId} value={m.orgId}>
            {organizations.find((o) => o.id === m.orgId)?.shortName ?? m.orgId} — {ROLE_LABEL[m.role]}
          </option>
        ))}
      </select>
    </div>
  );
}

function SideNav() {
  const tabs = useNavItems();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="space-y-1">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-soft hover:bg-black/5 hover:text-ink',
                )
              }
            >
              <Icon name={tab.icon} size={19} />
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SimBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cx(
        'flex items-center justify-center gap-1.5 bg-ink text-[11px] font-semibold uppercase tracking-wide text-white/80',
        compact ? 'py-1' : 'py-1.5',
      )}
    >
      <Icon name="info" size={12} />
      Démonstration simulée — aucun réseau radio réel
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  back,
  action,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  action?: ReactNode;
  /** Tableau de bord et rapports : conteneur plus large sur ordinateur. */
  wide?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const notifications = useApp((s) => s.notifications);
  const unread = notifications.filter((n) => !n.read).length;
  const currentUserId = useApp((s) => s.currentUserId);
  const memberships = useApp((s) => s.memberships);
  const organizations = useApp((s) => s.organizations);
  const users = useApp((s) => s.users);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const logout = useApp((s) => s.logout);
  const me = users.find((u) => u.id === currentUserId);
  const myMemberships = memberships.filter((m) => m.userId === currentUserId);

  return (
    <div className="min-h-dvh bg-[#e7ecf2] lg:flex">
      {/* ── Barre latérale (ordinateur) ─────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <SimBanner compact />
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Icon name="shield" size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">FasoMesh Shield</p>
            <p className="truncate text-[11px] text-ink-mute">Dispositif sanitaire simulé</p>
          </div>
        </div>

        {myMemberships.length ? (
          <div className="border-b border-line px-3 py-3">
            <ContextSelect compact />
          </div>
        ) : null}

        <SideNav />

        <div className="border-t border-line px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-xl bg-canvas px-2.5 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {(me?.displayName ?? '?').slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">{me?.displayName ?? '—'}</p>
              <p className="truncate text-[11px] text-ink-mute">
                {activeOrgId
                  ? organizations.find((o) => o.id === activeOrgId)?.shortName ?? 'Contexte actif'
                  : 'Aucun contexte'}
              </p>
            </div>
            <Link
              to="/app/settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mute hover:bg-black/5"
              aria-label="Paramètres"
            >
              <Icon name="settings" size={16} />
            </Link>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/auth', { replace: true });
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mute hover:bg-black/5"
              aria-label="Se déconnecter"
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Contenu ─────────────────────────────────────────────────── */}
      <div className="relative flex min-h-dvh w-full flex-col bg-canvas lg:max-w-none lg:shadow-none">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_24px_70px_-30px_rgba(15,23,42,0.5)] lg:max-w-none lg:bg-transparent lg:shadow-none">
          <div className="w-full lg:max-w-none">
            <SimBanner />
          </div>
          <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
            <div className="flex h-14 items-center gap-2 px-3 lg:px-6">
              {back ? (
                <button
                  onClick={() => navigate(back)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-black/5"
                  aria-label="Retour"
                >
                  <Icon name="back" size={20} />
                </button>
              ) : (
                <Link
                  to="/app"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white"
                  aria-label="Accueil FasoMesh Shield"
                >
                  <Icon name="shield" size={19} />
                </Link>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[17px] font-semibold leading-tight text-ink">{title}</h1>
                {subtitle ? <p className="truncate text-xs text-ink-mute">{subtitle}</p> : null}
              </div>
              <Link
                to="/app/notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-black/5"
                aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}
              >
                <Icon name="bell" size={20} />
                {unread > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                ) : null}
              </Link>
              {action}
            </div>
          </header>

          {myMemberships.length ? (
            <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2 text-xs lg:hidden">
              <ContextSelect />
            </div>
          ) : null}

          <main className="flex-1 px-4 pb-28 pt-4 lg:px-6 lg:pb-10 lg:pt-6">
            <div className={cx('mx-auto w-full', wide ? 'max-w-6xl' : 'max-w-3xl lg:max-w-4xl')}>{children}</div>
          </main>
          <TabBar />
        </div>
      </div>
    </div>
  );
}
