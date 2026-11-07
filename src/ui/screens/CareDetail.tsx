import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../app/store';
import type { CareKind, CareStatus } from '../../core/types';
import {
  CARE_KIND_LABEL,
  CARE_LABEL,
  CARE_ORDER,
  CARE_TRANSITIONS,
  CARE_TYPE_LABEL,
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
  SectionTitle,
  TextArea,
  timeAgo,
} from '../components/ui';

/**
 * Fiche dossier (§6) : les DEUX suivis affichés côte à côte, l'historique
 * complet (date, auteur, observations) et le transport réel.
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
  created: 'Soumettre le brouillon',
};

function stepLabel(status: CareStatus): number {
  const i = CARE_ORDER.indexOf(status);
  if (i < 0) return -1;
  return i;
}

export function CareDetail() {
  const { id } = useParams();
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const request = useApp((s) => s.careRequests.find((r) => r.id === id));
  const deliveries = useApp((s) => s.deliveries);
  const organizations = useApp((s) => s.organizations);
  const users = useApp((s) => s.users);
  const memberships = useApp((s) => s.memberships);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const careAction = useApp((s) => s.careAction);
  const careReply = useApp((s) => s.careReply);
  const submitDraft = useApp((s) => s.submitDraft);
  const actor = me ? makeActor(me, memberships, activeOrgId) : null;

  const [choice, setChoice] = useState<CareStatus | null>(null);
  const [motif, setMotif] = useState('');
  const [closing, setClosing] = useState('');
  const [detail, setDetail] = useState('');
  const [reply, setReply] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  if (!me) return null;
  if (!request) {
    return (
      <AppShell title="Dossier introuvable" back="/app/care">
        <EmptyState title="Dossier introuvable" hint="Il a peut-être été retiré de ce jeu de démonstration." />
      </AppShell>
    );
  }

  const readable =
    can({ actor, action: 'care.readInbox', resource: { type: 'care', id: request.id, orgId: request.orgId, targetOrgId: request.targetOrgId ?? undefined }, grants }) ||
    request.senderId === me.id ||
    can({ actor, action: 'care.readOrg', resource: { type: 'care', id: request.id, orgId: request.orgId }, grants });

  if (!readable) {
    return (
      <AppShell title={request.caseRef} back="/app/care">
        <Callout tone="danger" title="Accès refusé">
          Ce dossier appartient à une autre organisation et ne vous est pas adressé.
        </Callout>
      </AppShell>
    );
  }

  const delivery = request.transportDeliveryId ? deliveries[request.transportDeliveryId] : undefined;
  const target = organizations.find((o) => o.id === request.targetOrgId);
  const origin = organizations.find((o) => o.id === request.orgId);
  const sender = users.find((u) => u.id === request.senderId);

  const mayRespond = can({ actor, action: 'care.respond', resource: { type: 'care', id: request.id, orgId: request.orgId, targetOrgId: request.targetOrgId ?? undefined }, grants });
  const mayCancel =
    request.senderId === me.id && can({ actor, action: 'care.cancel', resource: { type: 'care', id: request.id, orgId: request.orgId }, grants });
  // §2A : seul l’établissement émetteur répond à une demande d’informations.
  const mayReply = can({ actor, action: 'care.readOrg', resource: { type: 'care', id: request.id, orgId: request.orgId }, grants });

  const nexts = CARE_TRANSITIONS[request.status].filter((to) =>
    to === 'created'
      ? request.status === 'draft' && request.senderId === me.id
      : to === 'cancelled'
        ? mayCancel
        : mayRespond,
  );

  function apply(to: CareStatus) {
    const result = careAction(request!.id, to, {
      justification: to === 'rejected' ? motif : undefined,
      closingNote: to === 'resolved' ? closing : undefined,
      detail: to === 'information_requested' ? detail || 'Informations complémentaires demandées au CSPS.' : detail || undefined,
    });
    if (!result.ok) setErrors(result.errors);
    else {
      setErrors([]);
      setChoice(null);
      setMotif('');
      setClosing('');
      setDetail('');
    }
  }

  return (
    <AppShell title={request.caseRef} subtitle={`${CARE_KIND_LABEL[request.kind as CareKind]} — non nominatif`} back="/app/care">
      <ErrorList errors={errors} />

      {/* ── Les deux suivis, strictement distincts ───────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-[11px] uppercase tracking-wide text-ink-mute">Suivi sanitaire</p>
          <p className="mt-1 text-lg font-semibold text-ink">{CARE_LABEL[request.status]}</p>
          <p className="text-xs text-ink-mute">Dernière mise à jour {timeAgo(request.updatedAt)}</p>
          <div className="mt-2 h-1.5 w-full rounded bg-black/5">
            <div
              className="h-1.5 rounded bg-signal"
              style={{
                width: `${Math.max(6, Math.round(((stepLabel(request.status) + 1) / CARE_ORDER.length) * 100))}%`,
              }}
            />
          </div>
        </Card>
        <Card>
          <p className="text-[11px] uppercase tracking-wide text-ink-mute">Suivi technique (transport Mesh)</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {delivery ? (delivery.status === 'delivered' ? 'Transporté et reçu' : delivery.status) : 'Non transmis'}
          </p>
          <p className="text-xs text-ink-mute">
            {delivery
              ? `${delivery.attempts} tentative(s) · ${delivery.hops.length} saut(s) · ${delivery.events.length} événement(s)`
              : 'Aucun envoi réseau : ce dossier reste local.'}
          </p>
          {delivery?.hops.length ? (
            <p className="mt-1 break-words font-mono text-[11px] text-ink-mute">
              Route : {delivery.hops.map((h) => `${h.fromNodeId} → ${h.toNodeId}`).join(' , ')}
            </p>
          ) : null}
          {request.transportDeliveryId ? (
            <Link
              to={`/app/track/${request.transportDeliveryId}`}
              className="mt-1.5 inline-block text-xs font-semibold text-signal underline-offset-2 hover:underline"
            >
              Suivre le transfert pas à pas →
            </Link>
          ) : null}
        </Card>
      </div>

      {delivery && delivery.status !== 'delivered' && request.status === 'sent' ? (
        <Callout tone="warn" title="Transport en cours ou en attente">
          Le réseau n’a pas encore confirmé l’arrivée. Le dossier reste au statut sanitaire « Transmise » :
          aucune prise en charge n’est présumée.
        </Callout>
      ) : null}

      <SectionTitle>Identification</SectionTitle>
      <Card className="grid gap-1 text-sm text-ink-soft sm:grid-cols-2">
        <p>Type : <strong>{CARE_KIND_LABEL[request.kind as CareKind]}</strong></p>
        <p>Priorité : <strong>{request.priority}</strong></p>
        <p>Catégorie : <strong>{CARE_TYPE_LABEL[request.type as CareType] ?? request.type}</strong></p>
        <p>Motif : <strong>{request.motif || '—'}</strong></p>
        <p>Établissement : <strong>{origin?.name ?? request.location}</strong></p>
        <p>Destination : <strong>{target?.name ?? (request.desiredDestination || '—')}</strong></p>
        <p>Demandeur : <strong>{sender?.displayName ?? request.senderId}</strong></p>
        <p>Créé : <strong>{timeAgo(request.createdAt)}</strong></p>
      </Card>

      <SectionTitle>Informations sanitaires</SectionTitle>
      <Card className="space-y-1 text-sm text-ink-soft">
        <p>Description : {request.description || '—'}</p>
        <p>Signes : {request.signes || '—'}</p>
        <p>
          Constantes : {[
            request.vitals.temp && `T° ${request.vitals.temp}`,
            request.vitals.bp && `TA ${request.vitals.bp}`,
            request.vitals.hr && `FC ${request.vitals.hr}`,
            request.vitals.rr && `FR ${request.vitals.rr}`,
            request.vitals.spo2 && `SpO₂ ${request.vitals.spo2}`,
          ]
            .filter(Boolean)
            .join(' · ') || 'aucune renseignée'}
        </p>
        <p>Premiers soins : {request.firstAid || '—'}</p>
        <p>Complément : {request.complementary || '—'}</p>
      </Card>

      <SectionTitle>Logistique</SectionTitle>
      <Card className="space-y-1 text-sm text-ink-soft">
        <p>
          Besoins :{' '}
          {[
            request.transportNeeded && 'transport',
            request.oxygenNeeded && 'oxygène / équipement',
            request.teamNeeded && 'équipe',
          ]
            .filter(Boolean)
            .join(' · ') || 'aucun déclaré'}
        </p>
        <p>Instructions : {request.logisticsInstructions || '—'}</p>
        {request.instructions ? (
          <p className="rounded-lg bg-brand-50 px-2 py-1.5 text-brand-800">
            <strong>Instructions du centre de référence :</strong> {request.instructions}
          </p>
        ) : null}
        {request.justification ? <p>Motif du refus : {request.justification}</p> : null}
        {request.closingNote ? <p>Compte rendu de clôture : {request.closingNote}</p> : null}
      </Card>

      {request.status === 'information_requested' ? (
        <>
      <SectionTitle>Informations complémentaires demandées</SectionTitle>
      {mayReply ? (
        <Card className="space-y-2">
          <p className="text-sm text-ink-soft">
            Le centre de référence attend une information avant de poursuivre :
            {' '}
            <strong>
              {request.events.filter((e) => e.to === 'information_requested').slice(-1)[0]?.detail ?? 'détail non communiqué'}
            </strong>
          </p>
          {request.informationReply ? (
            <p className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-800">
              <strong>Réponse déjà fournie :</strong> {request.informationReply}
            </p>
          ) : null}
          <TextArea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Ex. : glycémie capillaire 1,4 g/L, température 38,9 °C…"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={reply.trim().length < 3}
              onClick={() => {
                const result = careReply(request!.id, reply);
                if (!result.ok) setErrors(result.errors);
                else {
                  setErrors([]);
                  setReply('');
                }
              }}
            >
              Envoyer les informations au centre
            </Button>
          </div>
          <p className="text-[11px] text-ink-mute">
            Votre réponse n’avance pas l’état sanitaire : c’est le centre qui décide de la suite.
          </p>
        </Card>
      ) : (
        <Callout tone="info" title="Demande d’informations en cours">
          Le centre attend des informations de l’établissement émetteur. Une fois fournies, il reprend la main sur le
          dossier.
        </Callout>
      )}
        </>
      ) : null}

      <SectionTitle>Actions</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {nexts.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={to === 'rejected' || to === 'cancelled' ? 'ghost' : 'secondary'}
            onClick={() =>
              to === 'rejected' || to === 'resolved' || to === 'cancelled' || to === 'information_requested'
                ? setChoice(to)
                : to === 'created'
                  ? submitDraft(request.id)
                  : apply(to)
            }
          >
            {NEXT_LABEL[to]}
          </Button>
        ))}
        {nexts.length === 0 ? <p className="text-xs text-ink-mute">Aucune action disponible depuis cet état.</p> : null}
      </div>

      {choice ? (
        <Card className="mt-3 space-y-2">
          {choice === 'rejected' ? (
            <Field label="Motif du refus (obligatoire)">
              <TextArea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} />
            </Field>
          ) : null}
          {choice === 'resolved' ? (
            <Field label="Compte rendu synthétique (obligatoire)">
              <TextArea value={closing} onChange={(e) => setClosing(e.target.value)} rows={2} />
            </Field>
          ) : null}
          {choice === 'information_requested' ? (
            <Field label="Informations demandées">
              <TextArea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} />
            </Field>
          ) : null}
          {choice === 'cancelled' ? (
            <Callout tone="warn" title="Confirmation">
              L’annulation ferme définitivement ce dossier et reste visible dans l’historique.
            </Callout>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={choice === 'rejected' ? !motif.trim() : choice === 'resolved' ? !closing.trim() : false}
              onClick={() => apply(choice)}
            >
              Confirmer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChoice(null)}>
              Annuler
            </Button>
          </div>
        </Card>
      ) : null}

      <SectionTitle>Historique complet ({request.events.length})</SectionTitle>
      <div className="space-y-2">
        {request.events.map((e, i) => (
          <Card key={`${e.at}-${i}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{CARE_LABEL[e.to]}</p>
              <span className="text-[11px] text-ink-mute">{new Date(e.at).toLocaleString('fr-FR')}</span>
            </div>
            <p className="text-xs text-ink-mute">
              Auteur : {users.find((u) => u.id === e.actorId)?.displayName ?? e.actorId} · {e.reason}
            </p>
            {e.detail ? <p className="mt-1 text-xs text-ink-soft">{e.detail}</p> : null}
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <Link to="/app/care" className="text-sm text-signal underline-offset-2 hover:underline">
          ← Retour à la liste des demandes
        </Link>
      </div>
      <Badge tone="muted">Simulation : aucun établissement réel n’est concerné</Badge>
    </AppShell>
  );
}
