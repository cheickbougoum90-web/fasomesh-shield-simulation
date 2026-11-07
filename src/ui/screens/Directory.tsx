import { useState } from 'react';
import { useApp } from '../../app/store';
import { ORG_AVAILABILITY_LABEL, type OrgAvailability, type OrgKind } from '../../core/types';
import { makeActor, can } from '../../policy';
import { AppShell } from '../components/AppShell';
import { Badge, Card, EmptyState, Field, Input, SectionTitle, Select } from '../components/ui';

/**
 * Annuaire sanitaire (§9) : établissements DÉCLARÉS pour la démonstration.
 * La disponibilité affichée est déclarée, jamais mesurée.
 */

const KIND_LABEL: Record<OrgKind, string> = {
  health_center: 'CSPS / centre de santé',
  hospital: 'Établissement de destination',
  ngo: 'ONG',
  hub: 'Hub de coordination',
  family: 'Groupe familial',
  admin_network: 'Administration',
};

export function DirectorySpace() {
  const me = useApp((s) => s.users.find((u) => u.id === s.currentUserId));
  const organizations = useApp((s) => s.organizations);
  const memberships = useApp((s) => s.memberships);
  const activeOrgId = useApp((s) => s.activeOrgId);
  const grants = useApp((s) => s.grants);
  const nodes = useApp((s) => s.nodes);

  const setOrgAvailability = useApp((s) => s.setOrgAvailability);
  const [kind, setKind] = useState<string>('health');
  const [query, setQuery] = useState('');
  const [availabilityMsg, setAvailabilityMsg] = useState<string | null>(null);

  if (!me) return null;
  const actor = makeActor(me, memberships, activeOrgId);
  const mayEditAvailability = can({ actor, action: 'center.availability', grants });
  if (!can({ actor, action: 'directory.read', grants })) {
    return (
      <AppShell title="Annuaire sanitaire" back="/app">
        <EmptyState title="Accès réservé" hint="L’annuaire est réservé aux acteurs du dispositif sanitaire." />
      </AppShell>
    );
  }

  const filtered = organizations
    .filter((o) => o.kind !== 'family' && o.kind !== 'ngo')
    .filter((o) => {
      if (kind === 'health' && !(o.kind === 'health_center' || o.kind === 'hospital')) return false;
      if (kind === 'hub' && o.kind !== 'hub') return false;
      if (kind === 'all' && o.kind === 'admin_network') return false;
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        return `${o.name} ${o.locality ?? ''} ${o.district ?? ''} ${o.region ?? ''}`.toLowerCase().includes(needle);
      }
      return true;
    });

  return (
    <AppShell title="Annuaire sanitaire" subtitle="Établissements déclarés — disponibilité non mesurée" back="/app">
      <Card className="mb-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="health">Établissements sanitaires</option>
              <option value="hub">Hub</option>
              <option value="all">Tous (hors administration)</option>
            </Select>
          </Field>
          <Field label="Recherche">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, localité, district…" />
          </Field>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="Aucun établissement" hint="Modifiez les filtres de l’annuaire." />
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const node = o.nodeId ? nodes.find((n) => n.id === o.nodeId) : undefined;
            const availability = o.availability as OrgAvailability | undefined;
            return (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{o.name}</p>
                    <p className="text-xs text-ink-mute">{KIND_LABEL[o.kind]}</p>
                  </div>
                  {availability ? (
                    <Badge tone={availability === 'open' ? 'success' : availability === 'limited' ? 'warn' : 'muted'}>
                      {ORG_AVAILABILITY_LABEL[availability]}
                    </Badge>
                  ) : null}
                </div>

                <dl className="mt-2 grid gap-1 text-xs text-ink-soft sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold">Région : </dt>
                    <dd className="inline">{o.region ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">District : </dt>
                    <dd className="inline">{o.district ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Localité : </dt>
                    <dd className="inline">{o.locality ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Adresse : </dt>
                    <dd className="inline">{o.address ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Services : </dt>
                    <dd className="inline">{o.services?.join(', ') ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold">Nœud Mesh : </dt>
                    <dd className="inline">
                      {o.nodeId
                        ? `${node?.name ?? o.nodeId} (${node?.status ?? 'état inconnu'})`
                        : 'non simulé dans ce jeu de démonstration'}
                    </dd>
                  </div>
                </dl>

                {o.availabilityNote ? (
                  <p className="mt-1 text-[11px] text-ink-mute">Note : {o.availabilityNote}</p>
                ) : null}

                {o.id === activeOrgId && mayEditAvailability ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-2">
                    <Field label="Ma disponibilité déclarée">
                      <Select
                        value={o.availability ?? 'open'}
                        onChange={(e) => {
                          const res = setOrgAvailability(o.id, e.target.value as OrgAvailability);
                          setAvailabilityMsg(res.ok ? res.message ?? 'Enregistré.' : res.errors[0] ?? 'Refusé.');
                        }}
                      >
                        {(['open', 'limited', 'closed'] as OrgAvailability[]).map((v) => (
                          <option key={v} value={v}>
                            {ORG_AVAILABILITY_LABEL[v]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {availabilityMsg ? (
                      <p className="text-xs text-ink-soft">{availabilityMsg}</p>
                    ) : (
                      <p className="text-[11px] text-ink-mute">
                        Déclaration locale pour la démonstration — ce n’est pas une mesure réelle.
                      </p>
                    )}
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] text-ink-mute">
                  Disponibilité déclarée pour la démonstration — ce n’est pas un état réel des services.
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle>Mode d’emploi</SectionTitle>
      <p className="text-xs text-ink-mute">
        Sélectionnez un centre directement depuis le formulaire de référence : la liste affichée dans le
        formulaire reprend ces mêmes établissements, avec leur disponibilité déclarée.
      </p>
    </AppShell>
  );
}
