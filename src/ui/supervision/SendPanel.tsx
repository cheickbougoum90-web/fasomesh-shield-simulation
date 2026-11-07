import { useState } from 'react';
import type { Priority } from '../../core/types';
import { INTERNET_ID } from '../../mesh/engine';
import { useApp } from '../../app/store';
import { NocButton, NocSection, PRIORITY_CLASS, PRIORITY_LABEL } from './common';

/**
 * Envoi d'un message dans la simulation : source, destination, priorité.
 * Le bouton ne fait qu'appeler le moteur — aucun trajet n'est fabriqué ici.
 */
export function SendPanel() {
  const nodes = useApp((s) => s.nodes);
  const sendSimMessage = useApp((s) => s.sendSimMessage);
  const toast = useApp((s) => s.toast);

  const online = nodes.filter((n) => n.status !== 'offline');
  const [from, setFrom] = useState('phone-aminata');
  const [to, setTo] = useState('phone-salif');
  const [priority, setPriority] = useState<Priority>('info');

  const fromOk = online.some((n) => n.id === from);
  const toOk = to === INTERNET_ID || online.some((n) => n.id === to);
  const valid = fromOk && toOk && from !== to;

  function send() {
    if (!valid) {
      toast('Choisissez une source et une destination différentes et actives', 'warn');
      return;
    }
    const id = sendSimMessage({ from, to, priority });
    toast(`Message ${id} émis — suivez le paquet sur la carte`);
  }

  return (
    <NocSection title="Émission d’un message">
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-slate-500">Nœud source</span>
          <select className="noc-input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id} value={n.id} disabled={n.status === 'offline'}>
                {n.name}
                {n.status === 'offline' ? ' — hors service' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] text-slate-500">Destination</span>
          <select className="noc-input" value={to} onChange={(e) => setTo(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id} value={n.id} disabled={n.status === 'offline'}>
                {n.name}
                {n.status === 'offline' ? ' — hors service' : ''}
              </option>
            ))}
            <option value={INTERNET_ID}>Internet (via la passerelle du Hub)</option>
          </select>
        </label>

        <div>
          <span className="mb-1 block text-[11px] text-slate-500">Priorité</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(['info', 'urgent', 'critical'] as Priority[]).map((p) => (
              <NocButton key={p} active={priority === p} onClick={() => setPriority(p)} className={priority === p ? PRIORITY_CLASS[p] : ''}>
                {PRIORITY_LABEL[p]}
              </NocButton>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">
            {priority === 'info'
              ? 'Normal : cost standard, servi en dernier après les priorités hautes.'
              : priority === 'urgent'
                ? 'Urgent : saute devant les messages normaux dans les files, route pondérée vers la fiabilité (×1,5).'
                : 'Critique : prépondérance dans les files et en route (×2,5) — SANS garantie d’arrivée.'}
          </p>
        </div>

        <NocButton onClick={send} disabled={!valid} className="w-full">
          ▶ Envoyer le message
        </NocButton>
      </div>
    </NocSection>
  );
}
