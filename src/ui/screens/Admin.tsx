import { useApp } from '../../app/store';
import { MODEL_ASSUMPTIONS, MODEL_DISCLAIMER } from '../../core/modelAssumptions';
import { ALL_ROLES, ROLE_CODE } from '../../core/types';
import { ROLE_LABEL } from '../../domain/permissions';
import { makeActor, can, accessLog } from '../../policy';
import { AppShell } from '../components/AppShell';
import { Badge, Card, EmptyState, SectionTitle, timeAgo } from '../components/ui';

/**
 * Espace administrateur (§5) : comptes, organisations, configuration.
 * Le rôle administrateur ne dispose d'aucun droit de lecture sur le contenu
 * des conversations : seules les métadonnées d'audit sont affichées.
 */
export function AdminSpace() {
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const users = useApp((s) => s.users);
  const memberships = useApp((s) => s.memberships);
  const organizations = useApp((s) => s.organizations);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const audit = useApp((s) => s.audit);

  if (!me) return null;
  const actor = makeActor(me, memberships, activeOrgId);
  const mayRead = can({ actor, action: 'account.read', grants });

  if (!mayRead) {
    return (
      <AppShell title="Administration" back="/app">
        <EmptyState title="Accès réservé" hint="Le rôle administrateur est requis dans le contexte actif." />
      </AppShell>
    );
  }

  const mayReadAudit = can({ actor, action: 'audit.read', grants });

  return (
    <AppShell title="Administration" subtitle="Comptes, organisations, configuration">
      <SectionTitle>Comptes ({users.length})</SectionTitle>
      <div className="space-y-2">
        {users.map((u) => {
          const orgs = memberships.filter((m) => m.userId === u.id);
          return (
            <Card key={u.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{u.displayName}</p>
                <div className="flex flex-wrap gap-1">
                  {(u.roles?.length ? u.roles : [u.role]).map((r) => (
                    <Badge key={r} tone="info">
                      {ROLE_LABEL[r]} <span className="opacity-60">({ROLE_CODE[r]})</span>
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-xs text-ink-mute">
                {orgs.length
                  ? orgs
                      .map((m) => `${organizations.find((o) => o.id === m.orgId)?.shortName ?? m.orgId} : ${ROLE_LABEL[m.role]}`)
                      .join(' · ')
                  : 'Aucune organisation'}
              </p>
            </Card>
          );
        })}
      </div>

      <SectionTitle>Organisations ({organizations.length})</SectionTitle>
      <div className="space-y-2">
        {organizations.length === 0 ? (
          <EmptyState title="Aucune organisation" hint="Les organisations multi-profils sont chargées avec les données de démonstration." />
        ) : (
          organizations.map((o) => (
            <Card key={o.id}>
              <p className="text-sm font-semibold text-ink">{o.name}</p>
              <p className="text-xs text-ink-mute">
                {o.kind} · {memberships.filter((m) => m.orgId === o.id).length} membre(s)
              </p>
            </Card>
          ))
        )}
      </div>

      <SectionTitle>Rôles de la plateforme</SectionTitle>
      <p className="text-xs text-ink-mute">
        {ALL_ROLES.map((r) => `${ROLE_LABEL[r]} (${ROLE_CODE[r]})`).join(' · ')}
      </p>

      {mayReadAudit ? (
        <>
          <SectionTitle>Journal d’audit</SectionTitle>
          <div className="space-y-1">
            {audit.slice(0, 15).map((e) => (
              <Card key={e.id}>
                <p className="text-xs text-ink">
                  <span className="font-semibold">{e.actorName}</span> — {e.action}
                </p>
                <p className="text-[11px] text-ink-mute">
                  {timeAgo(e.at)} {e.detail ? `· ${e.detail}` : ''}
                </p>
              </Card>
            ))}
            {audit.length === 0 ? <p className="text-xs text-ink-mute">Aucune entrée.</p> : null}
          </div>
          <SectionTitle>Accès politiques récents</SectionTitle>
          <div className="space-y-1">
            {accessLog().slice(0, 10).map((e) => (
              <p key={e.seq} className="text-[11px] text-ink-mute">
                {e.action} → <span className={e.allowed ? 'text-success' : 'text-danger'}>{e.allowed ? 'ACCORD' : 'REFUS'}</span> ({e.code})
              </p>
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle>Configuration — hypothèses du modèle</SectionTitle>
      <p className="mb-2 text-[11px] text-ink-mute">{MODEL_DISCLAIMER}</p>
      <div className="space-y-1">
        {MODEL_ASSUMPTIONS.map((a) => (
          <p key={a.id} className="text-[11px] text-ink-mute">
            <span className="font-semibold text-ink-soft">{a.label}</span> : {a.value}
            {a.unit ? ` ${a.unit}` : ''} — {a.origin}
          </p>
        ))}
      </div>
    </AppShell>
  );
}
