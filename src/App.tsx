import { useEffect, useRef } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { startSimulationLoop, useApp } from './app/store';
import { Icon } from './ui/components/Icon';
import { Toaster } from './ui/components/ui';
import { SimBanner } from './ui/components/AppShell';
import { Welcome } from './ui/screens/Welcome';
import { Auth } from './ui/screens/Auth';
import { Dashboard } from './ui/screens/Dashboard';
import { Conversations } from './ui/screens/Conversations';
import { Conversation } from './ui/screens/Conversation';
import { NewMessage } from './ui/screens/NewMessage';
import { NewAlert } from './ui/screens/NewAlert';
import { Alerts, Notifications } from './ui/screens/Alerts';
import { History } from './ui/screens/History';
import { Track } from './ui/screens/Track';
import { Network } from './ui/screens/Network';
import { NetworkMap } from './ui/screens/NetworkMap';
import { Settings } from './ui/screens/Settings';
import { Help } from './ui/screens/Help';
import { SupervisionConsole } from './ui/supervision/Console';
import { CareNew, CareSpace } from './ui/screens/Care';
import { CareDetail } from './ui/screens/CareDetail';
import { HubSpace } from './ui/screens/HubSpace';
import { AdminSpace } from './ui/screens/Admin';
import { CentreSpace } from './ui/screens/Centre';
import { TeamSpace } from './ui/screens/Team';
import { DirectorySpace } from './ui/screens/Directory';
import { ReportsSpace } from './ui/screens/Reports';

function Loading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas">
      <SimBanner />
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
        <Icon name="shield" size={26} />
      </span>
      <p className="mt-4 text-sm text-ink-mute">Préparation du réseau simulé…</p>
    </div>
  );
}

/** Garde de route : session requise pour tout écran de l'application. */
function Protected() {
  const booted = useApp((s) => s.booted);
  const currentUserId = useApp((s) => s.currentUserId);
  if (!booted) return <Loading />;
  if (!currentUserId) return <Navigate to="/auth" replace />;
  return <Outlet />;
}

/** §9 : échec BLOQUANT si la Web Crypto est indisponible — aucun clair. */
function CryptoBlocked({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <SimBanner />
      <span className="mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger text-white">
        <Icon name="lock" size={26} />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-ink">Cryptographie indisponible</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-mute">{message}</p>
      <p className="mt-4 max-w-md rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs leading-relaxed text-ink-soft">
        Règle de sécurité : aucun message, aucun mot de passe et aucune donnée ne sont traités en clair.
        Ouvrez la page dans un contexte sécurisé (https ou localhost) pour utiliser la démonstration.
      </p>
    </div>
  );
}

export default function App() {
  const booted = useApp((s) => s.booted);
  const cryptoError = useApp((s) => s.cryptoError);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void useApp.getState().boot();
    startSimulationLoop();
  }, []);

  if (!booted) return <Loading />;
  if (cryptoError) return <CryptoBlocked message={cryptoError} />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/auth" element={<Auth />} />
        {/* L'aide est accessible sans compte (depuis l'écran d'accueil). */}
        <Route path="/app/help" element={<Help />} />
        {/* Centre de supervision : console d'administration indépendante. */}
        <Route path="/supervision" element={<SupervisionConsole />} />

        <Route element={<Protected />}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/messages" element={<Conversations />} />
          <Route path="/app/messages/new" element={<NewMessage />} />
          <Route path="/app/messages/:id" element={<Conversation />} />
          <Route path="/app/alerts" element={<Alerts />} />
          <Route path="/app/alerts/new" element={<NewAlert />} />
          <Route path="/app/notifications" element={<Notifications />} />
          <Route path="/app/history" element={<History />} />
          <Route path="/app/track/:id" element={<Track />} />
          <Route path="/app/care" element={<CareSpace />} />
          <Route path="/app/care/new" element={<CareNew />} />
          <Route path="/app/care/:id" element={<CareDetail />} />
          <Route path="/app/hub" element={<HubSpace />} />
          <Route path="/app/centre" element={<CentreSpace />} />
          <Route path="/app/team" element={<TeamSpace />} />
          <Route path="/app/directory" element={<DirectorySpace />} />
          <Route path="/app/reports" element={<ReportsSpace />} />
          <Route path="/app/admin" element={<AdminSpace />} />
          <Route path="/app/network" element={<Network />} />
          <Route path="/app/network/map" element={<NetworkMap />} />
          <Route path="/app/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
