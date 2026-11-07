import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { useCurrentUser } from '../../app/hooks';
import { lastMessageOf, unreadCountOf } from '../../domain/message';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Button, Card, EmptyState, initials, timeAgo } from '../components/ui';
import { StatusPill } from '../components/StatusBits';
import { useMessageText } from '../../app/useMessageText';
import type { Message } from '../../core/types';

function ConversationRow({ conversationId }: { conversationId: string }) {
  const me = useCurrentUser();
  const conversations = useApp((s) => s.conversations);
  const messages = useApp((s) => s.messages);
  const users = useApp((s) => s.users);
  const deliveries = useApp((s) => s.deliveries);

  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation || !me) return null;
  const otherId = conversation.participantIds.find((id) => id !== me.id);
  const other = users.find((u) => u.id === otherId);
  const last = lastMessageOf(messages, conversation.id);
  const unread = unreadCountOf(messages, conversation.id, me.id);
  const outgoing = last?.senderId === me.id;

  const record = last ? deliveries[last.deliveryId] : undefined;

  return (
    <Link to={`/app/messages/${conversation.id}`} className="block">
      <Card className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {initials(other?.displayName ?? '?')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">{other?.displayName ?? 'Inconnu'}</span>
            <span className="shrink-0 text-[11px] text-ink-mute">
              {last ? timeAgo(last.createdAt) : ''}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
              {outgoing ? <span className="text-ink-mute">Vous : </span> : null}
              <MessagePreview message={last} />
            </span>
            {unread > 0 ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                {unread}
              </span>
            ) : null}
          </span>
          {record && record.status !== 'delivered' ? (
            <span className="mt-1.5 inline-flex">
              <StatusPill status={record.status} icon={false} className="!py-0.5 !text-[10px]" />
            </span>
          ) : null}
        </span>
        <Icon name="chevron" size={18} className="shrink-0 text-ink-mute" />
      </Card>
    </Link>
  );
}

function MessagePreview({ message }: { message?: Message }) {
  const text = useMessageText(message);
  if (!message) return <span className="text-ink-mute">Aucun message</span>;
  return <span className="truncate">{text || '…'}</span>;
}

export function Conversations() {
  const navigate = useNavigate();
  const conversations = useApp((s) => s.conversations);
  const messages = useApp((s) => s.messages);
  const me = useCurrentUser();

  const mine = conversations
    .filter((c) => me && c.participantIds.includes(me.id))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

  return (
    <AppShell
      title="Messages"
      subtitle={`${mine.length} conversation${mine.length > 1 ? 's' : ''}`}
      action={
        <Link
          to="/app/messages/new"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white"
          aria-label="Nouveau message"
        >
          <Icon name="plus" size={20} />
        </Link>
      }
    >
      {mine.length ? (
        <div className="space-y-2">
          {mine.map((c) => (
            <ConversationRow key={c.id} conversationId={c.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="chat"
          title="Aucune conversation"
          hint="Envoyez votre premier message : il transitera par le réseau Mesh simulé."
          action={<Button onClick={() => navigate('/app/messages/new')}>Nouveau message</Button>}
        />
      )}

      <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-mute">
        {messages.length} messages enregistrés localement · chiffrage AES-GCM
      </p>
    </AppShell>
  );
}
