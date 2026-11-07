import { useApp } from '../../app/store';
import type { NodeStatus } from '../../core/types';
import { nodeRef, nodeTitle, simulatedSignal } from '../../sim/refs';
import { formatSimTime } from '../../sim/types';
import { NocButton, NocSection, Field, SimChip, type Selection } from './common';
import { NODE_KIND_LABEL } from './TopologyCanvas';

const STATUS_TEXT: Record<NodeStatus, string> = {
  online: 'Actif',
  degraded: 'Dégradé',
  offline: 'Hors service',
};

const STATUS_TONE: Record<NodeStatus, string> = {
  online: 'text-emerald-400',
  degraded: 'text-amber-400',
  offline: 'text-rose-400',
};

/**
 * Inspecteur d'un nœud ou d'un lien : identité, état, valeurs SIMULÉES
 * (batterie, signal, charge) et compteurs réels issus du moteur.
 * Chaque valeur est explicitement marquée comme simulée.
 */
export function InspectorPanel({
  selection,
  onClear,
}: {
  selection: Selection;
  onClear: () => void;
}) {
  const nodes = useApp((s) => s.nodes);
  const links = useApp((s) => s.links);
  const stats = useApp((s) => s.nodeStats);
  const queues = useApp((s) => s.queueLengths);
  const lastActivity = useApp((s) => s.lastActivity);
  const users = useApp((s) => s.users);
  const toggleNode = useApp((s) => s.toggleNode);
  const removeSimNode = useApp((s) => s.removeSimNode);
  const setLinkStatus = useApp((s) => s.setLinkStatus);

  if (!selection) {
    return (
      <NocSection title="Inspecteur">
        <p className="text-[11.5px] leading-relaxed text-slate-500">
          Cliquez sur un nœud ou un lien de la carte pour afficher son état détaillé et agir dessus (couper,
          rétablir, supprimer).
        </p>
        <div className="mt-2">
          <SimChip />
        </div>
      </NocSection>
    );
  }

  if (selection.kind === 'link') {
    const link = links.find((l) => l.id === selection.id);
    if (!link) return null;
    const a = nodes.find((n) => n.id === link.aNodeId);
    const b = nodes.find((n) => n.id === link.bNodeId);
    const down = link.status === 'down';
    return (
      <NocSection
        title="Inspecteur de lien"
        action={<SimChip />}
      >
        <p className="mb-2 text-[13px] font-semibold text-slate-100">
          {nodeTitle(link.aNodeId, a?.name ?? link.aNodeId)} ↔ {nodeTitle(link.bNodeId, b?.name ?? link.bNodeId)}
        </p>
        <Field label="Identifiant" value={<span className="font-mono text-[11.5px]">{link.id}</span>} />
        <Field label="État" value={<span className={down ? 'text-rose-400' : 'text-emerald-400'}>{down ? 'Coupé' : 'Actif'}</span>} />
        <Field label="Latence simulée" value={`${link.latencyMs} ms`} />
        <Field label="Perte simulée" value={`${(link.lossRate * 100).toFixed(0)} %`} />
        <Field label="Type" value="Lien radio simulé" />
        <div className="mt-2 flex gap-1.5">
          <NocButton tone={down ? 'success' : 'danger'} className="flex-1" onClick={() => setLinkStatus(link.id, down ? 'up' : 'down')}>
            {down ? '↻ Rétablir le lien' : '✂ Couper le lien'}
          </NocButton>
          <NocButton onClick={onClear}>Fermer</NocButton>
        </div>
      </NocSection>
    );
  }

  const node = nodes.find((n) => n.id === selection.id);
  if (!node) return null;
  const nodeStats = stats[node.id] ?? { tx: 0, rx: 0, forwarded: 0, dropped: 0 };
  const connections = links.filter(
    (l) => (l.aNodeId === node.id || l.bNodeId === node.id) && l.status === 'up',
  );
  const linkedToUser = users.some((u) => u.nodeId === node.id);
  const activityAt = lastActivity[node.id];
  const offline = node.status === 'offline';

  return (
    <NocSection
      title="Inspecteur de nœud"
      action={<SimChip />}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-800 px-1.5 text-[11px] font-bold text-slate-200">
          {nodeRef(node.id) || '—'}
        </span>
        <span className="text-[13px] font-semibold text-slate-100">{node.name}</span>
        <span className={`ml-auto text-[11.5px] font-semibold ${STATUS_TONE[node.status]}`}>
          {STATUS_TEXT[node.status]}
        </span>
      </div>

      <Field label="Identifiant" value={<span className="font-mono text-[11.5px]">{node.id}</span>} />
      <Field label="Type de nœud" value={NODE_KIND_LABEL[node.kind]} />
      <Field label="État" value={STATUS_TEXT[node.status]} />
      <Field label="Batterie simulée" value={`${node.battery} %`} />
      <Field label="Signal simulé" value={`${simulatedSignal(node)} %`} />
      <Field label="Charge simulée" value={`${node.load} %`} />
      <Field label="Connexions actives" value={connections.length} />
      <Field label="Messages transmis" value={nodeStats.tx} />
      <Field label="Messages reçus" value={nodeStats.rx} />
      <Field label="En file d’attente" value={queues[node.id] ?? 0} />
      {node.kind === 'relay' ? (
        <>
          <Field label="Transmissions de relais" value={nodeStats.forwarded} />
          <Field label="Paquets perdus au départ" value={nodeStats.dropped} />
        </>
      ) : null}
      <Field
        label="Dernière activité (simulée)"
        value={activityAt !== undefined ? `T+${formatSimTime(activityAt)}` : '—'}
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        <NocButton tone={offline ? 'success' : 'danger'} onClick={() => toggleNode(node.id)}>
          {offline ? '↻ Rétablir' : '⚡ Couper le nœud'}
        </NocButton>
        <NocButton
          tone="danger"
          disabled={node.kind === 'hub' || linkedToUser}
          title={
            node.kind === 'hub'
              ? 'Le Hub est permanent'
              : linkedToUser
                ? 'Nœud rattaché à un compte utilisateur'
                : 'Supprimer le nœud et ses liens'
          }
          onClick={() => removeSimNode(node.id)}
        >
          ✕ Supprimer
        </NocButton>
      </div>
      {node.kind === 'hub' ? (
        <p className="mt-1.5 text-[10.5px] text-slate-500">
          Le Hub est le centre de supervision : il peut être coupé, mais pas supprimé.
        </p>
      ) : null}
    </NocSection>
  );
}
