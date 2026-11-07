import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/store';
import type { CareKind, CareRequest, CareStatus } from '../../core/types';
import {
  CARE_KIND_LABEL,
  CARE_LABEL,
  CARE_TRANSITIONS,
  CARE_TYPE_LABEL,
  type CareType,
} from '../../domain/care';
import { makeActor, can, canOpenInbox } from '../../policy';
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
  TextArea,
  timeAgo,
} from '../components/ui';

/**
 * Espace Centre de référence (§2B) — espace destinataire unique de la version :
 * boîte de réception des demandes adressées au centre, décisions humaines
 * (accusé, acceptation, refus motivé, informations complémentaires),
 * instructions au CSPS, suivi du transfert et historique des décisions.
 *
 * La réception technique ne déclenche JAMAIS une acceptation : chaque décision
 * est un acte d'un opérateur autorisé, journalisé dans l'historique du dossier.
 */

const NEXT_LABEL: Partial<Record<CareStatus, string>> = {
  acknowledged: 'Accuser réception',
  information_requested: 'Demander des informations',
  accepted: 'Accepter la prise en charge',
  rejected: 'Refuser (motif obligatoire)',
  in_progress: 'Préparer le transfert',
  in_transit: 'Mettre en route le transfert',
  arrived: 'Consigner l’arrivée',
  resolved: 'Clôturer (compte rendu)',
  cancelled: 'Annuler la demande',
};

const STATUS_FILTERS = [
  { id: 'all', label: 'Tous les statuts' },
  { id: 'received', label: 'Reçues' },
  { id: 'acknowledged', label: 'Accusées' },
  { id: 'accepted', label: 'Acceptées' },
  { id: 'information_requested', label: 'Infos demandées' },
  { id: 'in_transit', label: 'En transit' },
  { id: 'arrived', label: 'Arrivées' },
  { id: 'resolved', label: 'Clôturées' },
  { id: 'rejected', label: 'Refusées' },
] as const;

function resourceOf(r: CareRequest) {
  return { type: 'care' as const, id: r.id, orgId: r.orgId, targetOrgId: r.targetOrgId ?? undefined };
}

export function CentreSpace() {
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const requests = useApp((s) => s.careRequests);
  const memberships = useApp((s) => s.memberships);
  const organizations = useApp((s) => s.organizations);
  const users = useApp((s) => s.users);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const deliveries = useApp((s) => s.deliveries);
  const careAction = useApp((s) => s.careAction);
  const sendInstruction = useApp((s) => s.sendInstruction);
  const actor = me ? makeActor(me, memberships, activeOrgId) : null;

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [choice, setChoice] = useState<{ id: string; to: CareStatus } | null>(null);
  const [motif, setMotif] = useState('');
  const [closing, setClosing] = useState('');
  const [detail, setDetail] = useState('');
  const [instructing, setInstructing] = useState<string | null>(null);
  const [instructionText, setInstructionText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  if (!me) return null;

  // Porte d’entrée : sonde `canOpenInbox` — `care.readInbox`/`care.respond`
  // sans ressource sont toujours refusés (aucune adresse fournie).
  const mayInbox = canOpenInbox({ actor, grants });
  if (!mayInbox) {
    return (
      <AppShell title="Espace Centre de référence" back="/app">
        <EmptyState
          title="Accès réservé"
          hint="Cet espace est réservé aux opérateurs d’un centre de référence (contexte actif requis)."
        />
      </AppShell>
    );
  }

  const inbox = requests.filter((r) => can({ actor, action: 'care.readInbox', resource: resourceOf(r), grants }));

  const filtered = inbox.filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter));

  const counts = {
    todo: inbox.filter((r) => ['created', 'sent', 'received', 'accepted', 'information_requested', 'in_progress', 'in_transit', 'arrived'].includes(r.status)).length,
    acknowledged: inbox.filter((r) => r.status === 'acknowledged').length,
    refused: inbox.filter((r) => r.status === 'rejected').length,
    closed: inbox.filter((r) => r.status === 'resolved').length,
  };

  // Historique des décisions : les actes ENREGISTRÉS par cet opérateur.
  const myDecisions = inbox
    .flatMap((r) => r.events.filter((e) => e.actorId === me.id).map((e) => ({ request: r, event: e })))
    .sort((a, b) => b.event.at - a.event.at)
    .slice(0, 20);

  function apply(id: string, to: CareStatus, opts?: { justification?: string; closingNote?: string; detail?: string }) {
    const result = careAction(id, to, opts);
    if (!result.ok) setErrors(result.errors);
    else {
      setErrors([]);
      setChoice(null);
      setMotif('');
      setClosing('');
      setDetail('');
      setDone(`Action enregistrée : ${CARE_LABEL[to]}.`);
    }
  }

  return (
    <AppShell
      title="Espace Centre de référence"
      subtitle="Réception · décisions · transferts — simulé"
      back="/app"
    >
      <ErrorList errors={errors} />
      {done ? (
        <Callout tone="success" title="Action enregistrée">
          {done} L’état sanitaire n’a changé que parce que vous avez agi : rien n’est automatique.
        </Callout>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'À traiter', value: counts.todo, tone: 'text-brand-600' },
          { label: 'Accusées', value: counts.acknowledged, tone: 'text-ink' },
          { label: 'Refusées', value: counts.refused, tone: 'text-danger' },
          { label: 'Clôturées', value: counts.closed, tone: 'text-success' },
        ].map((c) => (
          <Card key={c.label} className="py-2.5">
            <p className={`text-xl font-semibold ${c.tone}`}>{c.value}</p>
            <p className="text-[11px] leading-tight text-ink-mute">{c.label}</p>
          </Card>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Field label="Statut sanitaire">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="pb-2 text-xs text-ink-mute">
          {filtered.length} dossier(s) sur {inbox.length} adressé(s) à ce centre.
        </p>
      </div>

      <SectionTitle>Boîte de réception ({filtered.length})</SectionTitle>
      {filtered.length === 0 ? (
        <EmptyState
          icon="check"
          title="Aucune demande adressée à ce centre"
          hint="Les références et évacuations envoyées par les CSPS apparaîtront ici après acheminement Mesh."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const origin = organizations.find((o) => o.id === r.orgId);
            const delivery = r.transportDeliveryId ? deliveries[r.transportDeliveryId] : undefined;
            const mayRespond = can({ actor, action: 'care.respond', resource: resourceOf(r), grants });
            const nexts = mayRespond ? CARE_TRANSITIONS[r.status].filter((to) => to !== 'created' && to !== 'cancelled') : [];

            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{r.caseRef}</p>
                    <p className="text-xs text-ink-mute">
                      {CARE_KIND_LABEL[r.kind as CareKind]} · {CARE_TYPE_LABEL[r.type as CareType] ?? r.type} ·
                      priorité {r.priority}
                    </p>
                    <p className="text-xs text-ink-mute">
                      Origine : {origin?.name ?? r.location} · demandeur {users.find((u) => u.id === r.senderId)?.displayName ?? '—'}
                      · créé {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={r.status === 'rejected' ? 'danger' : r.status === 'resolved' ? 'success' : 'info'}>
                      {CARE_LABEL[r.status]}
                    </Badge>
                    <span className="text-[11px] text-ink-mute">
                      Transport : {delivery ? delivery.status : 'non transmis'}
                    </span>
                  </div>
                </div>

                {r.instructions ? (
                  <p className="mt-2 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-800">
                    <strong>Vos instructions au CSPS :</strong> {r.instructions}
                  </p>
                ) : null}
                {r.informationReply ? (
                  <p className="mt-1.5 rounded-lg bg-info-soft px-2.5 py-1.5 text-xs text-info">
                    <strong>Réponse du CSPS :</strong> {r.informationReply}
                  </p>
                ) : null}

                <div className="mt-2.5 flex flex-wrap gap-2">
                  {nexts.slice(0, 4).map((to) => (
                    <Button
                      key={to}
                      size="sm"
                      variant={to === 'rejected' ? 'ghost' : 'secondary'}
                      onClick={() =>
                        to === 'rejected' || to === 'resolved' || to === 'information_requested'
                          ? (setChoice({ id: r.id, to }), setDone(null))
                          : apply(r.id, to)
                      }
                    >
                      {NEXT_LABEL[to] ?? CARE_LABEL[to]}
                    </Button>
                  ))}
                  {mayRespond ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setInstructing(instructing === r.id ? null : r.id);
                        setInstructionText(r.instructions ?? '');
                        setDone(null);
                      }}
                    >
                      Instructions au CSPS
                    </Button>
                  ) : null}
                  <Link
                    to={`/app/care/${r.id}`}
                    className="pb-1 text-xs font-semibold text-signal underline-offset-2 hover:underline"
                  >
                    Ouvrir la fiche et l’historique →
                  </Link>
                </div>

                {choice && choice.id === r.id ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-line bg-canvas p-3">
                    {choice.to === 'rejected' ? (
                      <Field label="Motif du refus (obligatoire)">
                        <TextArea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} />
                      </Field>
                    ) : null}
                    {choice.to === 'resolved' ? (
                      <Field label="Compte rendu synthétique (obligatoire)">
                        <TextArea value={closing} onChange={(e) => setClosing(e.target.value)} rows={2} />
                      </Field>
                    ) : null}
                    {choice.to === 'information_requested' ? (
                      <Field label="Informations demandées au CSPS">
                        <TextArea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} />
                      </Field>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={
                          choice.to === 'rejected' ? !motif.trim() : choice.to === 'resolved' ? !closing.trim() : false
                        }
                        onClick={() =>
                          apply(r.id, choice.to, {
                            justification: choice.to === 'rejected' ? motif : undefined,
                            closingNote: choice.to === 'resolved' ? closing : undefined,
                            detail: choice.to === 'information_requested' ? detail : undefined,
                          })
                        }
                      >
                        Confirmer la décision
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setChoice(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : null}

                {instructing === r.id ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
                    <Field label="Instructions à transmettre au CSPS" hint="Consignes de préparation, escorte, horaire…">
                      <TextArea
                        value={instructionText}
                        onChange={(e) => setInstructionText(e.target.value)}
                        rows={2}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={instructionText.trim().length < 3}
                        onClick={() => {
                          const result = sendInstruction(r.id, instructionText);
                          if (!result.ok) setErrors(result.errors);
                          else {
                            setErrors([]);
                            setInstructing(null);
                            setDone('Instructions envoyées au CSPS (notification créée).');
                          }
                        }}
                      >
                        Envoyer les instructions
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setInstructing(null)}>
                        Fermer
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle>Historique des décisions ({myDecisions.length})</SectionTitle>
      {myDecisions.length === 0 ? (
        <p className="text-xs text-ink-mute">
          Aucune décision enregistrée pour l’instant : accusé, acceptation, refus, transfert et clôture apparaîtront
          ici, horodatés et signés.
        </p>
      ) : (
        <div className="space-y-2">
          {myDecisions.map(({ request, event }, i) => (
            <Card key={`${request.id}-${event.at}-${i}`} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {request.caseRef} — {CARE_LABEL[event.to]}
                </p>
                <p className="text-xs text-ink-mute">{event.reason}</p>
                {event.detail ? <p className="mt-0.5 text-xs text-ink-soft">{event.detail}</p> : null}
              </div>
              <span className="shrink-0 text-[11px] text-ink-mute">{new Date(event.at).toLocaleString('fr-FR')}</span>
            </Card>
          ))}
        </div>
      )}

      <Callout tone="info" title="Réception technique ≠ acceptation">
        L’arrivée du transport (« reçu ») ne vaut jamais prise en charge : seule votre décision, signée et datée, fait
        avancer le dossier.
      </Callout>
    </AppShell>
  );
}
