import type { Conversation, Message } from '../core/types';

/** Outils conversationnels purs (aucun accès réseau ni persistance). */

export function pairId(a: string, b: string): string {
  return [a, b].sort().join('~');
}

export function conversationIdFor(a: string, b: string): string {
  return `cv_${pairId(a, b)}`;
}

export function otherParticipant(conversation: Conversation, meId: string): string | undefined {
  return conversation.participantIds.find((id) => id !== meId);
}

/** Crée la conversation si elle n'existe pas ; renvoie son identifiant. */
export function ensureConversation(
  list: Conversation[],
  a: string,
  b: string,
  at: number,
): { conversations: Conversation[]; id: string } {
  const id = conversationIdFor(a, b);
  const existing = list.find((c) => c.id === id);
  if (existing) {
    return {
      conversations: list.map((c) => (c.id === id ? { ...c, lastActivityAt: Math.max(c.lastActivityAt, at) } : c)),
      id,
    };
  }
  const created: Conversation = {
    id,
    participantIds: [a, b].sort(),
    lastActivityAt: at,
    unreadCount: 0,
  };
  return { conversations: [...list, created], id };
}

export function messagesOf(messages: Message[], conversationId: string): Message[] {
  return messages.filter((m) => m.conversationId === conversationId).sort((a, b) => a.createdAt - b.createdAt);
}

export function lastMessageOf(messages: Message[], conversationId: string): Message | undefined {
  const list = messagesOf(messages, conversationId);
  return list[list.length - 1];
}

export function unreadCountOf(messages: Message[], conversationId: string, meId: string): number {
  return messages.filter((m) => m.conversationId === conversationId && m.recipientId === meId && !m.read)
    .length;
}
