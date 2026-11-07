import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCurrentUser } from '../../app/hooks';
import { messagesOf } from '../../domain/message';
import { AppShell } from '../components/AppShell';
import { Button, EmptyState, cx, timeAgo } from '../components/ui';
import { StatusPill } from '../components/StatusBits';
import { useMessageText } from '../../app/useMessageText';
import type { Message } from '../../core/types';

function Bubble({ message, mine, senderName }: { message: Message; mine: boolean; senderName: string }) {
  const text = useMessageText(message);
  const deliveries = useApp((s) => s.deliveries);
  const record = deliveries[message.deliveryId];

  return (
    <div className={cx('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      {!mine ? <span className="px-1 text-[11px] font-semibold text-ink-mute">{senderName}</span> : null}
      <div
        className={cx(
          'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm',
          mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md border border-line bg-white text-ink',
        )}
      >
        {text || <span className="opacity-70">Déchiffrement…</span>}
      </div>
      <div className="flex items-center gap-2 px-1">
        <span className={cx('text-[11px]', mine ? 'text-ink-mute' : 'text-ink-mute')}>
          {timeAgo(message.createdAt)}
        </span>
        {mine && record ? (
          <Link to={`/app/track/${record.id}`} aria-label="Voir le suivi de transmission">
            <StatusPill status={record.status} icon={false} className="!py-0.5 !text-[10px]" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function Conversation() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const conversations = useApp((s) => s.conversations);
  const messages = useApp((s) => s.messages);
  const users = useApp((s) => s.users);
  const nodes = useApp((s) => s.nodes);
  const sendMessage = useApp((s) => s.sendMessage);
  const markRead = useApp((s) => s.markConversationRead);
  const toast = useApp((s) => s.toast);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const conversation = conversations.find((c) => c.id === id);
  const otherId = conversation?.participantIds.find((p) => p !== me?.id);
  const other = users.find((u) => u.id === otherId);
  const list = useMemo(() => messagesOf(messages, id), [messages, id]);

  useEffect(() => {
    if (conversation?.unreadCount) markRead(id);
  }, [conversation?.unreadCount, id, markRead]);

  if (!conversation || !me) {
    return (
      <AppShell title="Conversation" back="/app/messages">
        <EmptyState icon="chat" title="Conversation introuvable" action={<Button onClick={() => navigate('/app/messages')}>Retour</Button>} />
      </AppShell>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!other) return;
    setSending(true);
    const result = await sendMessage(other.id, draft);
    setSending(false);
    if (!result.ok) {
      toast(result.errors.join(' '), 'danger');
      return;
    }
    setDraft('');
  }

  return (
    <AppShell
      title={other?.displayName ?? 'Conversation'}
      subtitle={other ? `Relié via ${nodes.find((n) => n.id === other.nodeId)?.name ?? 'le réseau'}` : undefined}
      back="/app/messages"
    >
      <div className="space-y-4">
        {list.length ? (
          list.map((m) => (
            <Bubble key={m.id} message={m} mine={m.senderId === me.id} senderName={users.find((u) => u.id === m.senderId)?.displayName ?? 'Inconnu'} />
          ))
        ) : (
          <EmptyState icon="chat" title="Aucun message" hint="Envoyez le premier message de cette conversation." />
        )}
      </div>

      <form onSubmit={submit} className="sticky bottom-20 z-10 -mx-4 mt-6 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit(e as unknown as FormEvent);
              }
            }}
            rows={1}
            placeholder="Écrire un message…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
          <Button type="submit" disabled={sending || !draft.trim()} icon="send" aria-label="Envoyer" className="!h-11 !w-11 !px-0" />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-mute">
          Chiffré AES-GCM · transmission simulée par le réseau Mesh
        </p>
      </form>
    </AppShell>
  );
}
