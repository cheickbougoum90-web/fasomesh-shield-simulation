import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCurrentUser } from '../../app/hooks';
import { conversationIdFor } from '../../domain/message';
import { CRYPTO_INFO } from '../../infra/crypto';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Button, ErrorList, Field, Select, TextArea, initials } from '../components/ui';

export function NewMessage() {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const users = useApp((s) => s.users);
  const contacts = useApp((s) => s.contacts);
  const sendMessage = useApp((s) => s.sendMessage);
  const memberships = useApp((s) => s.memberships);
  const organizations = useApp((s) => s.organizations);

  // §3 : la messagerie de la démonstration reste dans le dispositif sanitaire
  // (CSPS, centres de référence, Hub) — aucun profil civil n’est proposé.
  const dispositifOrgIds = new Set(
    organizations.filter((o) => ['health_center', 'hospital', 'hub'].includes(o.kind)).map((o) => o.id),
  );
  const recipients = users.filter(
    (u) =>
      u.id !== me?.id &&
      memberships.some((m) => m.userId === u.id && dispositifOrgIds.has(m.orgId)),
  );
  const [recipientId, setRecipientId] = useState(recipients[0]?.id ?? '');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await sendMessage(recipientId, body);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (me) navigate(`/app/messages/${conversationIdFor(me.id, recipientId)}`, { replace: true });
    else navigate('/app/messages', { replace: true });
  }

  const favoriteIds = new Set(
    contacts
      .filter((c) => c.ownerId === me?.id && c.favorite && recipients.some((u) => u.id === c.ownerId))
      .map((c) => c.ownerId),
  );

  return (
    <AppShell title="Nouveau message" subtitle="Acheminement simulé par le réseau Mesh" back="/app/messages">
      <form onSubmit={submit} className="space-y-4">
        <ErrorList errors={errors} />

        <Field label="Destinataire" hint="Uniquement les établissements du dispositif sanitaire">
          {recipients.length === 0 ? (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              Aucun contact dans le dispositif pour ce contexte. Sélectionnez un établissement (CSPS, centre, Hub).
            </p>
          ) : (
            <Select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              {recipients.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                  {favoriteIds.has(u.id) ? ' · favori' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {recipientId ? (
          <div className="flex items-center gap-3 rounded-xl bg-white border border-line px-3.5 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {initials(recipients.find((u) => u.id === recipientId)?.displayName ?? '?')}
            </span>
            <span className="text-sm text-ink-soft">
              <span className="block font-medium text-ink">
                {recipients.find((u) => u.id === recipientId)?.displayName}
              </span>
              Nœud : {recipients.find((u) => u.id === recipientId)?.nodeId}
            </span>
          </div>
        ) : null}

        <Field label="Message" hint="Le contenu est chiffré en AES-GCM avant d’être transmis.">
          <TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Écrivez votre message…"
            maxLength={600}
          />
        </Field>

        <div className="flex items-center justify-between text-xs text-ink-mute">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="lock" size={14} /> {CRYPTO_INFO.algorithm}
          </span>
          <span>{body.length}/600</span>
        </div>

        <Button full size="lg" type="submit" icon="send" disabled={busy || !body.trim()}>
          {busy ? 'Envoi en cours…' : 'Envoyer via le réseau'}
        </Button>
      </form>

      <div className="mt-5 rounded-xl border border-line bg-white p-3.5 text-xs leading-relaxed text-ink-mute">
        <p className="mb-1 font-semibold text-ink-soft">Comment votre message circulera</p>
        <p>
          Téléphone → relais le plus proche → (autres relais si nécessaire) → Hub → destinataire. Chaque étape est
          affichée dans le suivi, avec sa date et son résultat réel.
        </p>
      </div>
    </AppShell>
  );
}
