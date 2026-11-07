import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/store';
import type { CareKind, CareRequest, CareStatus } from '../../core/types';
import {
  CARE_KINDS,
  CARE_KIND_LABEL,
  CARE_LABEL,
  CARE_TRANSITIONS,
  CARE_TYPES,
  CARE_TYPE_LABEL,
  nextCaseRef,
  type CareType,
} from '../../domain/care';
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
  Input,
  SectionTitle,
  Select,
  TextArea,
  timeAgo,
} from '../components/ui';

/** Boîte de réception des demandes + formulaire CSPS (§4 à §6). */

function resourceOf(r: CareRequest) {
  return { type: 'care' as const, id: r.id, orgId: r.orgId, targetOrgId: r.targetOrgId ?? undefined };
}

/** Libellés des actes possibles depuis chaque état. */
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
  created: 'Soumettre le brouillon',
};

const PRIORITY_FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'critical', label: 'Critiques' },
  { id: 'urgent', label: 'Urgentes' },
  { id: 'info', label: 'Normales' },
] as const;

export function CareSpace() {
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const requests = useApp((s) => s.careRequests);
  const memberships = useApp((s) => s.memberships);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const organizations = useApp((s) => s.organizations);
  const careAction = useApp((s) => s.careAction);
  const submitDraft = useApp((s) => s.submitDraft);
  const actor = me ? makeActor(me, memberships, activeOrgId) : null;

  const [choice, setChoice] = useState<{ id: string; to: CareStatus } | null>(null);
  const [motif, setMotif] = useState('');
  const [closing, setClosing] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  if (!me) return null;

  const visible = requests.filter(
    (r) =>
      can({ actor, action: 'care.readInbox', resource: resourceOf(r), grants }) ||
      (r.senderId === me.id && can({ actor, action: 'care.readOwn', resource: { type: 'care', id: r.id, ownerId: r.senderId } })) ||
      can({ actor, action: 'care.readOrg', resource: { type: 'care', id: r.id, orgId: r.orgId }, grants }),
  );

  const filtered = visible.filter((r) => {
    if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      const hay = `${r.caseRef} ${r.description} ${r.location} ${r.motif}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const mayCreate = can({ actor, action: 'care.create', grants });

  function apply(id: string, to: CareStatus, opts?: { justification?: string; closingNote?: string }) {
    const result = careAction(id, to, opts);
    if (!result.ok) setErrors(result.errors);
    else {
      setErrors([]);
      setChoice(null);
      setMotif('');
      setClosing('');
    }
  }

  const OPEN_STATUSES: CareStatus[] = [
    'draft',
    'created',
    'sent',
    'received',
    'acknowledged',
    'information_requested',
    'accepted',
    'in_progress',
    'in_transit',
    'arrived',
  ];

  return (
    <AppShell title="Suivi des prises en charge" subtitle="Demandes de référence et d’évacuation — simulé">
      {mayCreate ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link to="/app/care/new">
            <Button variant="primary">+ Nouvelle demande</Button>
          </Link>
          <Link to="/app/care/new?kind=evacuation">
            <Button>+ Évacuation</Button>
          </Link>
        </div>
      ) : null}

      <ErrorList errors={errors} />

      <Card className="mb-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Priorité">
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              {PRIORITY_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Statut sanitaire">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              {OPEN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CARE_LABEL[s]}
                </option>
              ))}
              <option value="rejected">Prise en charge refusée</option>
              <option value="resolved">Clôturée</option>
              <option value="cancelled">Annulée</option>
            </Select>
          </Field>
          <Field label="Recherche">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="N° de dossier, motif, CSPS…" />
          </Field>
        </div>
        <p className="mt-2 text-[11px] text-ink-mute">
          {filtered.length} dossier(s) sur {visible.length} visibles — filtres locaux, aucune requête réseau.
        </p>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="Aucun dossier" hint="Les demandes adressées à votre organisation apparaîtront ici." />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const nexts = CARE_TRANSITIONS[r.status].filter(
              (to) =>
                NEXT_LABEL[to] &&
                (to === 'created'
                  ? r.senderId === me.id
                  : to === 'cancelled'
                    ? r.senderId === me.id && can({ actor, action: 'care.cancel', resource: resourceOf(r), grants })
                    : can({ actor, action: 'care.respond', resource: resourceOf(r), grants })),
            );
            const target = organizations.find((o) => o.id === r.targetOrgId);
            return (
              <Card key={r.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/app/care/${r.id}`} className="font-mono text-sm font-semibold text-ink underline-offset-2 hover:underline">
                      {r.caseRef}
                    </Link>
                    <p className="text-xs text-ink-mute">
                      {CARE_KIND_LABEL[r.kind as CareKind]} · {CARE_TYPE_LABEL[r.type as CareType] ?? r.type} · {r.location}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={r.priority === 'critical' ? 'danger' : r.priority === 'urgent' ? 'warn' : 'info'}>
                      {r.priority}
                    </Badge>
                    <span className="text-[11px] text-ink-mute">{CARE_LABEL[r.status]}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{r.description}</p>
                <p className="mt-1 text-xs text-ink-mute">
                  Destination : {target?.name ?? (r.desiredDestination || '—')} · créée {timeAgo(r.createdAt)}
                </p>
                {r.justification ? (
                  <p className="mt-2 rounded-lg bg-black/5 p-2 text-xs text-ink-soft">Motif : {r.justification}</p>
                ) : null}
                {r.closingNote ? (
                  <p className="mt-2 rounded-lg bg-black/5 p-2 text-xs text-ink-soft">Compte rendu : {r.closingNote}</p>
                ) : null}

                {nexts.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nexts.map((to) => (
                      <Button
                        key={to}
                        size="sm"
                        variant={to === 'rejected' || to === 'cancelled' ? 'ghost' : 'secondary'}
                        onClick={() =>
                          to === 'created'
                            ? submitDraft(r.id)
                            : to === 'rejected' || to === 'resolved' || to === 'cancelled'
                              ? setChoice({ id: r.id, to })
                              : apply(r.id, to)
                        }
                      >
                        {NEXT_LABEL[to]}
                      </Button>
                    ))}
                  </div>
                ) : null}

                {choice?.id === r.id ? (
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
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
                    {choice.to === 'cancelled' ? (
                      <Callout tone="warn" title="Confirmation">
                        L’annulation ferme définitivement le dossier. Elle est enregistrée dans
                        l’historique avec votre nom d’utilisateur.
                      </Callout>
                    ) : null}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={choice.to === 'rejected' ? !motif.trim() : choice.to === 'resolved' ? !closing.trim() : false}
                        onClick={() =>
                          apply(r.id, choice.to, {
                            justification: choice.to === 'rejected' ? motif : undefined,
                            closingNote: choice.to === 'resolved' ? closing : undefined,
                          })
                        }
                      >
                        Confirmer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setChoice(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

export function CareNew() {
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const activeOrgId = useApp((s) => s.activeOrgId);
  const organizations = useApp((s) => s.organizations);
  const careRequests = useApp((s) => s.careRequests);
  const memberships = useApp((s) => s.memberships);
  const grants = useApp((s) => s.grants);
  const create = useApp((s) => s.createCareRequest);

  const [kind, setKind] = useState<CareKind>('reference');
  const [type, setType] = useState<CareType>('maternity');
  const [priority, setPriority] = useState<'info' | 'urgent' | 'critical'>('critical');
  const [motif, setMotif] = useState('');
  const [description, setDescription] = useState('');
  const [signes, setSignes] = useState('');
  const [vitals, setVitals] = useState({ temp: '', bp: '', hr: '', rr: '', spo2: '' });
  const [firstAid, setFirstAid] = useState('');
  const [complementary, setComplementary] = useState('');
  const [location, setLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [transportNeeded, setTransportNeeded] = useState(false);
  const [oxygenNeeded, setOxygenNeeded] = useState(false);
  const [teamNeeded, setTeamNeeded] = useState(false);
  const [logistics, setLogistics] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  if (!me) return null;
  const actor = makeActor(me, memberships, activeOrgId);
  const blocked = !can({ actor, action: 'care.create', grants });
  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const previewRef = nextCaseRef(careRequests.length + 1, new Date().getFullYear());

  const destinations = organizations.filter(
    (o) => o.kind === 'health_center' || o.kind === 'hospital' || o.kind === 'hub',
  );

  function submit(draft: boolean) {
    const result = create({
      kind,
      type,
      priority,
      motif,
      description,
      signes,
      vitals,
      firstAid,
      complementary,
      location,
      desiredDestination: destinations.find((o) => o.id === destination)?.name ?? destination,
      transportNeeded,
      oxygenNeeded,
      teamNeeded,
      logisticsInstructions: logistics,
      targetOrgId: destination,
      draft,
    });
    if (!result.ok) {
      setErrors(result.errors);
      setDone(null);
    } else {
      setErrors([]);
      setDone(result.message ?? 'Enregistré.');
    }
  }

  const urgent = priority !== 'info';

  return (
    <AppShell title="Nouvelle demande" subtitle="Non nominatif — aucun nom de patient" back="/app/care">
      <Callout tone="info" title="Formulaire non nominatif">
        Le nom du patient n’est jamais demandé ni enregistré. Identifiant du dossier : {previewRef}.
        Aucun diagnostic ni protocole n’est proposé par l’application.
      </Callout>
      {blocked ? <ErrorList errors={['Vous n’avez pas la permission d’ouvrir un dossier.']} /> : null}
      <ErrorList errors={errors} />
      {done ? <Callout tone="success" title="Enregistré">{done}</Callout> : null}

      <SectionTitle>1 · Identification</SectionTitle>
      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type de demande *">
            <Select value={kind} onChange={(e) => setKind(e.target.value as CareKind)} disabled={blocked}>
              {CARE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CARE_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorité *">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as 'info' | 'urgent' | 'critical')} disabled={blocked}>
              <option value="critical">Critique</option>
              <option value="urgent">Urgent</option>
              <option value="info">Normal</option>
            </Select>
          </Field>
          <Field label="Catégorie du cas">
            <Select value={type} onChange={(e) => setType(e.target.value as CareType)} disabled={blocked}>
              {CARE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CARE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={priority === 'critical' ? 'Motif (facultatif en critique)' : 'Motif *'}>
            <Input value={motif} onChange={(e) => setMotif(e.target.value)} disabled={blocked} />
          </Field>
        </div>
        <Field label="Description de la situation">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={blocked} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CSPS de départ *">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={activeOrg?.name ?? 'CSPS…'}
              disabled={blocked}
            />
          </Field>
          <Field label="Centre de destination *">
            <Select value={destination} onChange={(e) => setDestination(e.target.value)} disabled={blocked}>
              <option value="">— Choisir dans l’annuaire —</option>
              {destinations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.availability ? ` (${o.availability === 'open' ? 'disponible' : o.availability === 'limited' ? 'capacité limitée' : 'indisponible'})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <SectionTitle>2 · Informations sanitaires (facultatif)</SectionTitle>
      <Card className="space-y-3">
        <Field label="Signes et observations cliniques">
          <TextArea value={signes} onChange={(e) => setSignes(e.target.value)} rows={2} disabled={blocked} />
        </Field>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Field label="Temp. (°C)">
            <Input value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} disabled={blocked} />
          </Field>
          <Field label="Tension">
            <Input value={vitals.bp} onChange={(e) => setVitals({ ...vitals, bp: e.target.value })} disabled={blocked} />
          </Field>
          <Field label="FC (bpm)">
            <Input value={vitals.hr} onChange={(e) => setVitals({ ...vitals, hr: e.target.value })} disabled={blocked} />
          </Field>
          <Field label="FR (cpm)">
            <Input value={vitals.rr} onChange={(e) => setVitals({ ...vitals, rr: e.target.value })} disabled={blocked} />
          </Field>
          <Field label="SpO₂ (%)">
            <Input value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} disabled={blocked} />
          </Field>
        </div>
        <Field label="Premiers soins / mesures déjà réalisées">
          <TextArea value={firstAid} onChange={(e) => setFirstAid(e.target.value)} rows={2} disabled={blocked} />
        </Field>
        <Field label="Informations complémentaires">
          <TextArea value={complementary} onChange={(e) => setComplementary(e.target.value)} rows={2} disabled={blocked} />
        </Field>
        <p className="text-[11px] text-ink-mute">
          Aucune constante n’est obligatoire{urgent ? ' — en priorité critique, allez à l’essentiel' : ''}. L’application ne
          propose aucun diagnostic.
        </p>
      </Card>

      <SectionTitle>3 · Logistique</SectionTitle>
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-4">
          {[
            { label: 'Ambulance / transport', value: transportNeeded, set: setTransportNeeded },
            { label: 'Oxygène ou équipement', value: oxygenNeeded, set: setOxygenNeeded },
            { label: 'Équipe / assistance', value: teamNeeded, set: setTeamNeeded },
          ].map((c) => (
            <label key={c.label} className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={c.value} onChange={(e) => c.set(e.target.checked)} disabled={blocked} />
              {c.label}
            </label>
          ))}
        </div>
        <Field label="Instructions logistiques">
          <TextArea value={logistics} onChange={(e) => setLogistics(e.target.value)} rows={2} disabled={blocked} placeholder="Route, point de rendez-vous, escorte…" />
        </Field>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" disabled={blocked} onClick={() => submit(false)}>
          Ouvrir le dossier et transmettre
        </Button>
        <Button variant="secondary" disabled={blocked} onClick={() => submit(true)}>
          Enregistrer en brouillon
        </Button>
      </div>

      <SectionTitle>À savoir</SectionTitle>
      <p className="text-xs text-ink-mute">
        L’ouverture crée un dossier non nominatif et le confie au réseau simulé. Le transport n’est pas la
        prise en charge : le centre doit encore accuser réception, accepter ou refuser.
      </p>
    </AppShell>
  );
}
