import { useEffect, useState } from 'react';
import type { Message } from '../core/types';
import { decryptText } from '../infra/crypto';

/**
 * Lecture d'un message : renvoie le texte déchiffré (AES-GCM).
 * Le cache évite de déchiffrer deux fois le même contenu à chaque rendu.
 */
const cache = new Map<string, string>();

export function useMessageText(message: Message | undefined): string {
  const [text, setText] = useState<string>(() => (message ? (cache.get(message.id) ?? '') : ''));

  useEffect(() => {
    if (!message) {
      setText('');
      return;
    }
    const hit = cache.get(message.id);
    if (hit !== undefined) {
      setText(hit);
      return;
    }
    if (message.body) {
      cache.set(message.id, message.body);
      setText(message.body);
      return;
    }
    if (!message.cipher) {
      setText('[contenu indisponible]');
      return;
    }
    let alive = true;
    void decryptText(message.cipher).then((value) => {
      const resolved = value ?? '[contenu non déchiffrable]';
      cache.set(message.id, resolved);
      if (alive) setText(resolved);
    });
    return () => {
      alive = false;
    };
  }, [message?.id, message?.body, message?.cipher?.ct]);

  return text;
}

export function primeMessageCache(message: Message, text: string): void {
  cache.set(message.id, text);
}
