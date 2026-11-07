import { useState } from 'react';
import { useApp } from '../../app/store';
import type { Role } from '../../core/types';
import { ROLE_LABEL } from '../../domain/permissions';
import { makeActor, can } from '../../policy';
import { AppShell } from '../components/AppShell';
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  ErrorList,
  Field,
  SectionTitle,
  Select,
  timeAgo,
} from '../components/ui';

/**
 * Gestion de l’équipe du CSPS (§2A) — réservé au responsable
 * (`org.members.manage`). L’agent de santé ne voit même pas cet écran.
 * Chaque ajout, changement de rôle et retrait est journalisé (audit).
 */

const TEAM_ROLES: Role[] = ['health_agent', 'health_manager'];

export function TeamSpace() {
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const users = useApp((s) => s.users);
  const memberships = useApp((s) => s.memberships);
  const organizations = useApp((s) => s.organizations);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const addOrgMember = useApp((s) => s.addOrgMember);
  const setMemberRole = useApp((s) => s.setMemberRole);
  const removeOrgMember = useApp((s) => s.removeOrgMember);
  const audit = useApp((s) => s.audit);
  const actor = me ? makeActor(me, memberships, activeOrgId) : null;

  const [candidate, setCandidate] = useState('');
  const [candidateRole, setCandidateRole] = useState<Role>('health_agent');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  if (!me) return null;

  const mayManage = can({ actor, action: 'org.members.manage', grants });
  if (!mayManage || !activeOrgId) {
    return (
      <AppShell title="Équipe de l’établissement" back="/app">
        <EmptyState
          title="Accès réservé"
          hint="La gestion de l’équipe est réservée au responsable du CSPS, avec un établissement sélectionné (contexte actif)."
        />
      </AppShell>
    );
  }

  const org = organizations.find((o) => o.id === activeOrgId);
  const team = memberships
    .filter((m) => m.orgId === activeOrgId)
    .sort((a, b) => (a.role === 'health_manager' ? 0 : 1) - (b.role === 'health_manager' ? 0 : 1));
  const candidates = users.filter((u) => !memberships.some((m) => m.orgId === activeOrgId && m.userId === u.id));

  function run(result: ReturnType<typeof addOrgMember>) {
    if (!result.ok) {
      setErrors(result.errors);
      setDone(null);
    } else {
      setErrors([]);
      setDone(result.message ?? 'Modification enregistrée.');
      setConfirmRemove(null);
    }
  }

  const teamAudit = audit.filter((e) => e.action.startsWith('Équipe')).slice(0, 10);

  return (
    <AppShell title="Équipe de l’établissement" subtitle={org?.name ?? 'Établissement'} back="/app">
      <ErrorList errors={errors} />
      {done ? <Callout tone="success" title="Équipe mise à jour">{done}</Callout> : null}

      <SectionTitle>Membres ({team.length})</SectionTitle>
      <div className="space-y-2">
        {team.map((m) => {
          const user = users.find((u) => u.id === m.userId);
          return (
            <Card key={`${m.userId}-${m.orgId}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {user?.displayName ?? m.userId}
                    {m.userId === me.id ? <span className="ml-1 text-xs font-normal text-ink-mute">(vous)</span> : null}
                  </p>
                  <p className="text-xs text-ink-mute">
                    Nœud simulé : {user?.nodeId ?? '—'} · membre depuis {timeAgo(m.joinedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={m.role === 'health_manager' ? 'info' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                  <Select
                    aria-label={`Rôle de ${user?.displayName ?? m.userId}`}
                    value={m.role}
                    onChange={(e) => run(setMemberRole(m.userId, e.target.value as Role))}
                  >
                    {TEAM_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              {m.userId !== me.id ? (
                <div className="mt-2">
                  {confirmRemove === m.userId ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft px-2.5 py-2">
                      <span className="text-xs text-danger">
                        Retirer {user?.displayName ?? m.userId} de l’établissement ? Cette action est journalisée.
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => run(removeOrgMember(m.userId))}>
                        Confirmer le retrait
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(m.userId)}>
                      Retirer de l’équipe
                    </Button>
                  )}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <SectionTitle>Ajouter un membre</SectionTitle>
      {candidates.length === 0 ? (
        <p className="text-xs text-ink-mute">Tous les comptes de la démonstration sont déjà dans cet établissement.</p>
      ) : (
        <Card className="space-y-3">
          <Field label="Compte à ajouter">
            <Select value={candidate} onChange={(e) => setCandidate(e.target.value)}>
              <option value="">— Choisir un compte —</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.nodeId})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rôle dans l’établissement" hint="Agent de santé (dossiers) ou Responsable (gestion complète)">
            <Select value={candidateRole} onChange={(e) => setCandidateRole(e.target.value as Role)}>
              {TEAM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="primary"
            size="sm"
            disabled={!candidate}
            onClick={() => {
              const result = addOrgMember(candidate, candidateRole);
              run(result);
              if (result.ok) setCandidate('');
            }}
          >
            Ajouter à l’équipe
          </Button>
        </Card>
      )}

      <SectionTitle>Journal de l’équipe ({teamAudit.length})</SectionTitle>
      {teamAudit.length === 0 ? (
        <p className="text-xs text-ink-mute">Aucune modification d’équipe pour l’instant.</p>
      ) : (
        <div className="space-y-1">
          {teamAudit.map((e) => (
            <Card key={e.id}>
              <p className="text-xs text-ink">
                <span className="font-semibold">{e.actorName}</span> — {e.action}
              </p>
              <p className="text-[11px] text-ink-mute">
                {new Date(e.at).toLocaleString('fr-FR')} {e.detail ? `· ${e.detail}` : ''}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Callout tone="info" title="Isolation des comptes">
        Ajouter un compte dans cet établissement ne lui donne accès qu’aux dossiers du CSPS : les dossiers des autres
        établissements restent inaccessibles (testé automatiquement).
      </Callout>
    </AppShell>
  );
}
