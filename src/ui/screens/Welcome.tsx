import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/store';
import { Icon } from '../components/Icon';
import { Button, Card } from '../components/ui';
import { SimBanner } from '../components/AppShell';

const FEATURES = [
  {
    icon: 'shield' as const,
    title: 'Espace CSPS',
    text: 'Ouvrir une référence, une évacuation ou un avis, sauvegarder un brouillon, suivre chaque étape jusqu’à la clôture.',
  },
  {
    icon: 'check' as const,
    title: 'Espace Centre de référence',
    text: 'Accuser réception, accepter ou refuser avec motif, demander des informations, suivre le transfert.',
  },
  {
    icon: 'antenna' as const,
    title: 'Espace Hub',
    text: 'Recevoir et catégoriser les alertes, orienter vers un centre compétent, superviser les nœuds et les files.',
  },
  {
    icon: 'eye' as const,
    title: 'Suivi honnête',
    text: 'Réception technique et décision sanitaire restent distinctes : rien n’est accepté à votre place.',
  },
];

export function Welcome() {
  const navigate = useNavigate();
  const booted = useApp((s) => s.booted);
  const currentUserId = useApp((s) => s.currentUserId);

  useEffect(() => {
    if (booted && currentUserId) navigate('/app', { replace: true });
  }, [booted, currentUserId, navigate]);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SimBanner />
      <div className="relative overflow-hidden bg-brand-700 px-6 pb-12 pt-10 text-white">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/40 blur-2xl" />
        <div className="absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-brand-800/70 blur-2xl" />
        <div className="relative">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/25">
            <Icon name="shield" size={30} />
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight">
            FasoMesh
            <br />
            Shield
          </h1>
          <p className="mt-3 max-w-80 text-[15px] leading-relaxed text-white/85">
            Coordination sanitaire centrée sur le CSPS : références, évacuations et alertes acheminées par un maillage
            d’équipements relais — jusqu’au centre de référence et au Hub.
          </p>
        </div>
      </div>

      <div className="flex-1 px-5 pb-8 pt-6">
        <div className="space-y-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="flex gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon name={feature.icon} size={20} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">{feature.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink-mute">{feature.text}</span>
              </span>
            </Card>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <Button full size="lg" onClick={() => navigate('/auth')}>
            Démarrer
          </Button>
          <Link to="/app/help" className="block text-center text-sm font-medium text-ink-mute hover:text-brand-600">
            Qu’est-ce qui est simulé dans cette démonstration ?
          </Link>
          <Link to="/supervision" className="block text-center text-sm font-medium text-ink-mute hover:text-brand-600">
            Ouvrir le centre de supervision (console d’administration)
          </Link>
        </div>

        <p className="mt-6 rounded-xl bg-white/70 border border-line px-3.5 py-3 text-xs leading-relaxed text-ink-mute">
          <strong className="text-ink-soft">Démonstration simulée.</strong> Aucun matériel radio n’est connecté :
          les nœuds, les transmissions, les accusés de réception et les pannes sont simulés dans le navigateur. Aucune
          donnée médicale réelle, aucun dispositif médical certifié.
        </p>
      </div>
    </div>
  );
}
