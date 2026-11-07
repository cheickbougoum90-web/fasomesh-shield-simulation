import { useNavigate } from 'react-router-dom';
import { STATUS_HELP, STATUS_LABEL, STATUS_TONE } from '../../domain/delivery';
import type { DeliveryStatus } from '../../core/types';
import { MODEL_ASSUMPTIONS, MODEL_DISCLAIMER } from '../../core/modelAssumptions';
import { CRYPTO_INFO } from '../../infra/crypto';
import { AppShell } from '../components/AppShell';
import { Icon, type IconName } from '../components/Icon';
import { Badge, Button, Card, SectionTitle, TONE_CLASS, cx } from '../components/ui';

const STATUS_ORDER: DeliveryStatus[] = [
  'created',
  'accepted_local',
  'routing',
  'delivered',
  'queued',
  'unconfirmed',
  'failed',
];

const REAL_ITEMS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'lock',
    title: 'Chiffrement AES-GCM',
    text: 'Le contenu de vos messages est réellement chiffré et déchiffré par votre appareil.',
  },
  {
    icon: 'shield',
    title: 'Règles de statut',
    text: 'La machine à états qui empêche d’afficher « reçu » sans accusé de réception est réelle et testée.',
  },
  {
    icon: 'list',
    title: 'Calcul de route',
    text: 'Le Dijkstra sur le graphe, les coûts de latence et de perte, et le recalcul après panne sont réels.',
  },
];

const SIMULATED_ITEMS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'antenna', title: 'Les nœuds et le Hub', text: 'Aucun équipement radio n’est connecté : le graphe est fictif.' },
  { icon: 'signal', title: 'Les transmissions', text: 'Latence, pertes de paquets et accusés de réception sont produits par un moteur local.' },
  { icon: 'user', title: 'Les comptes', text: 'Comptes, conversations et alertes sont stockés sur cet appareil, sans serveur.' },
];

const PENDING_ITEMS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'send', title: 'La vraie radio LoRa', text: 'Relier l’application à des équipements physiques et à leurs portées réelles.' },
  { icon: 'shield', title: 'L’échange de clés', text: 'Une clé partagée par appareil pour que personne d’autre ne puisse lire.' },
  { icon: 'map', title: 'La géolocalisation', text: 'Position réelle des nœuds et cartographie du terrain.' },
];

const TEST_STEPS: { icon: IconName; text: string }[] = [
  { icon: 'send', text: 'Envoyez un message depuis Aminata vers Salif et ouvrez son suivi : chaque étape s’écrit en direct.' },
  { icon: 'power', text: 'Passez en profil Opérateur Hub, coupez le « Relais Ouest » : le message est réémis par une autre route.' },
  { icon: 'antenna', text: 'Coupez le Hub : les envois basculent en « En attente de réseau » et ne disent pas « transmis ».' },
  { icon: 'refresh', text: 'Cliquez « Tout rétablir » : la file d’attente reprend automatiquement et finit en « Reçu ».' },
];

export function Help() {
  const navigate = useNavigate();

  return (
    <AppShell title="Centre d’aide" subtitle="Ce qui est réel, simulé ou à venir" back="/app/settings">
      <Card className="border-brand-200 bg-brand-50">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-brand-800">
          <Icon name="shield" size={18} /> Démonstration civile simulée
        </p>
        <p className="mt-1 text-sm leading-relaxed text-brand-800/85">
          Cette application illustre la <strong>logique de service</strong> d’un réseau Mesh civil. Elle ne prouve
          ni la résilience ni les performances d’un réseau radio réel : aucun équipement n’est connecté et aucune
          valeur affichée n’a été mesurée.
        </p>
      </Card>

      <SectionTitle>Ce que cette démonstration ne prouve PAS</SectionTitle>
      <div className="space-y-2">
        <Card className="border-warn-200 bg-warn-50">
          <p className="text-sm leading-relaxed text-warn">
            <strong>Le simulateur connaît tout le graphe.</strong> Il détecte instantanément une panne et recalcule
            une route en une fraction de seconde. Un réseau réel ne le fait pas : il faut des sondes, des délais, il
            y a des états intermédiaires inconnus ici.
          </p>
        </Card>
        <Card className="border-warn-200 bg-warn-50">
          <p className="text-sm leading-relaxed text-warn">
            <strong>Aucune mesure</strong> : latences, pertes, batteries, portées et échelle sont des hypothèses de
            modèle, regroupées et étiquetées dans <code className="text-xs">src/core/modelAssumptions.ts</code>. Une
            mesure réelle exigerait des essais avec du matériel physique.
          </p>
        </Card>
      </div>

      <SectionTitle>Trois niveaux qui ne se confondent jamais</SectionTitle>
      <div className="space-y-2">
        {[
          {
            title: '1. Droits d’interface',
            text: 'Ce que l’écran affiche ou masque. Un menu caché n’est qu’un confort : ce n’est pas une sécurité.',
          },
          {
            title: '2. Permissions métier',
            text: 'La couche de politique, indépendante de React : chaque opération y est vérifiée et journalisée, y compris les refus.',
          },
          {
            title: '3. Garanties cryptographiques',
            text: `${CRYPTO_INFO.algorithm} réellement appliqué (${CRYPTO_INFO.kdf}), mais ${CRYPTO_INFO.keyOrigin.toLowerCase()}.`,
          },
        ].map((item) => (
          <Card key={item.title} className="!p-3">
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-mute">{item.text}</p>
          </Card>
        ))}
      </div>

      <SectionTitle>Hypothèses du modèle (aucune n’est une mesure)</SectionTitle>
      <p className="mb-2 text-[11px] leading-relaxed text-ink-mute">{MODEL_DISCLAIMER}</p>
      <div className="space-y-1">
        {MODEL_ASSUMPTIONS.map((a) => (
          <p key={a.id} className="text-[11px] leading-relaxed text-ink-mute">
            <span className="font-semibold text-ink-soft">{a.label}</span> : {a.value}
            {a.unit ? ` ${a.unit}` : ''} — {a.origin}
          </p>
        ))}
      </div>

      <SectionTitle>Réel dans cette application</SectionTitle>
      <div className="space-y-2">
        {REAL_ITEMS.map((item) => (
          <Card key={item.title} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
              <Icon name={item.icon} size={17} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{item.title}</span>
              <span className="block text-xs leading-relaxed text-ink-mute">{item.text}</span>
            </span>
          </Card>
        ))}
      </div>

      <SectionTitle>Simulé</SectionTitle>
      <div className="space-y-2">
        {SIMULATED_ITEMS.map((item) => (
          <Card key={item.title} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn-soft text-warn">
              <Icon name={item.icon} size={17} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{item.title}</span>
              <span className="block text-xs leading-relaxed text-ink-mute">{item.text}</span>
            </span>
          </Card>
        ))}
      </div>

      <SectionTitle>Nécessitera le vrai réseau</SectionTitle>
      <div className="space-y-2">
        {PENDING_ITEMS.map((item) => (
          <Card key={item.title} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
              <Icon name={item.icon} size={17} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{item.title}</span>
              <span className="block text-xs leading-relaxed text-ink-mute">{item.text}</span>
            </span>
          </Card>
        ))}
      </div>

      <SectionTitle>Comprendre les statuts</SectionTitle>
      <div className="space-y-2">
        {STATUS_ORDER.map((status) => (
          <Card key={status} className="!p-3">
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            </div>
            <p className={cx('mt-1.5 text-xs leading-relaxed', TONE_CLASS.neutral.replace('bg-black/5', 'text-ink-soft'))}>
              {STATUS_HELP[status]}
            </p>
          </Card>
        ))}
      </div>

      <SectionTitle>Tester les scénarios</SectionTitle>
      <ol className="space-y-2">
        {TEST_STEPS.map((step, i) => (
          <li key={step.text}>
            <Card className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
                <Icon name={step.icon} size={15} className="mt-0.5 shrink-0 text-brand-600" />
                {step.text}
              </span>
            </Card>
          </li>
        ))}
      </ol>

      <SectionTitle>Questions fréquentes</SectionTitle>
      <div className="space-y-2">
        {[
          {
            q: '« Accepté par le nœud » veut dire reçu ?',
            a: 'Non. Le nœud local a pris le message en charge. Il est encore possible qu’il soit perdu : seul le statut « Reçu par le destinataire » prouve l’arrivée.',
          },
          {
            q: 'Pourquoi un message reste « en attente » ?',
            a: 'Parce qu’aucune route n’est disponible vers le destinataire (ou parce que le Hub, qui stocke les messages en attente, est injoignable). L’application conserve le message et le retransmet dès que le réseau revient.',
          },
          {
            q: 'Mes données partent-elles quelque part ?',
            a: 'Non : tout est stocké localement (IndexedDB) et rien n’est transmis à un serveur.',
          },
          {
            q: 'Puis-je provoquer une panne ?',
            a: 'Oui, avec le profil Opérateur Hub : coupez un nœud, le Hub, ou tout rétablir depuis l’écran Réseau.',
          },
        ].map((item) => (
          <details key={item.q} className="group rounded-xl border border-line bg-white px-3.5 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink">{item.q}</summary>
            <p className="mt-2 text-xs leading-relaxed text-ink-mute">{item.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-5">
        <Button full variant="secondary" onClick={() => navigate('/app')}>
          Retour au tableau de bord
        </Button>
      </div>
    </AppShell>
  );
}
