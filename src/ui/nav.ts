import type { SharedGrant } from '../core/types';
import { can, canOpenInbox, type Actor, type PermAction } from '../policy';
import type { IconName } from './components/Icon';

/**
 * Menu de l'application : construit depuis la POLITIQUE.
 * Une entrée n'apparaît que si l'acteur possède la permission dans son
 * contexte actif — l'écran reflète le droit, il ne le crée pas (§2).
 */

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** AU MOINS UNE de ces permissions est nécessaire. */
  actions: PermAction[];
  /** Entrée jugée par la sonde `canOpenInbox` (boîte de réception du centre). */
  inbox?: boolean;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Tableau de bord', icon: 'home', actions: ['network.view'], end: true },
  { to: '/app/care', label: 'Demandes', icon: 'list', actions: ['care.readInbox', 'care.readOrg', 'care.create'] },
  // L’espace Centre se juge par la sonde `canOpenInbox` : `care.readInbox` /
  // `care.respond` sont des actions d’adresse, sans ressource elles sont
  // toujours refusées par la politique.
  { to: '/app/centre', label: 'Centre', icon: 'check', actions: ['care.readInbox'], inbox: true },
  { to: '/app/team', label: 'Équipe', icon: 'user', actions: ['org.members.manage'] },
  { to: '/app/messages', label: 'Messages', icon: 'chat', actions: ['message.readOwn'] },
  { to: '/app/alerts', label: 'Alertes', icon: 'alert', actions: ['alert.read'] },
  { to: '/app/directory', label: 'Annuaire', icon: 'map', actions: ['directory.read'] },
  { to: '/app/network', label: 'Réseau', icon: 'signal', actions: ['network.view'] },
  { to: '/app/hub', label: 'Hub', icon: 'antenna', actions: ['hub.alert.read'] },
  { to: '/app/reports', label: 'Rapports', icon: 'clock', actions: ['stats.read', 'hub.stats'] },
  { to: '/app/admin', label: 'Admin', icon: 'settings', actions: ['account.read'] },
  { to: '/app/settings', label: 'Profil', icon: 'user', actions: ['settings.editOwn'] },
];

export function visibleNav(actor: Actor | null, grants: SharedGrant[] = []): NavItem[] {
  return NAV_ITEMS.filter((item) =>
    item.inbox
      ? canOpenInbox({ actor, grants })
      : item.actions.some((action) => can({ actor, action, grants })),
  );
}
