# FasoMesh Shield — Démonstration CSPS

> **Note de version** : pour la **version finale**, suivez `INSTALLATION.md`
> (installation + comptes), puis les guides par espace : `GUIDE_CSPS.md`,
> `GUIDE_CENTRE.md`, `GUIDE_HUB.md`. Ce document garde le parcours détaillé des
> écrans.

> **Ce document décrit des données FICTIVES.** Il n'existe aucun serveur, aucun
> compte réel et **aucune transmission radio** : toutes les communications Mesh
> sont **simulées dans le navigateur**. Aucune donnée médicale réelle, aucune
> fonction de diagnostic, **aucun dispositif médical certifié**.

## Lancer l'application

```bash
npm install
npm run dev        # http://localhost:3000
```

Vérifications : `npm run typecheck` (typage), `npm test` (19 fichiers,
187 tests), `npm run build` (compilation).

**Mot de passe commun de tous les comptes : `fasomesh`** (constante
`DEMO_PASSWORD`, `src/infra/crypto.ts`). Les comptes, mots de passe et données
vivent uniquement dans le stockage local de l'appareil (IndexedDB).

## Comptes du dispositif sanitaire

| Identifiant | Rôle sanitaire | Organisation active (rôle) | Nœud |
|---|---|---|---|
| `responsable_csps` | Responsable | CSPS de Kongou (`health_manager`) | phone-mariam |
| `agent_csps` | Agent de santé | CSPS de Kongou (`health_agent`) | phone-mariam |
| `agent_csps2` | Agent de santé | CSPS de Daboya (`health_agent`) | phone-ong-2 |
| `agent_centre_reference` | Opérateur de centre | Centre de référence de Banfora (`health_center_operator`) | phone-centre |
| `agent_hopital` | Opérateur d'hôpital | Hôpital régional de Bobo (`hospital_operator`) | phone-hopital |
| `operateur_hub` | Opérateur du Hub | Hub Central (`operator`) | node-hub |
| `administrateur` | Administrateur | Administration du réseau (`system_admin`) | phone-admin |
| `multi_roles` | Multi-rôles | CSPS de Kongou + ONG Solidarité Sahel | phone-admin |

**Hors périmètre de ce dispositif mais conservés** (tests existants intangibles,
ni développés ni étendus) : `citoyen1`, `citoyen2`, `agent_ong`,
`coordinateur_ong`.

### Établissements déclarés (annuaire)

| Établissement | Localité | Services déclarés | Disponibilité | Nœud simulé |
|---|---|---|---|---|
| CSPS de Kongou | Kongou (Cascades) | Consultations, Maternité, Urgences 1er niveau | Disponible | phone-mariam |
| CSPS de Daboya | Daboya (Boucle du Mouhoun) | Consultations, Vaccination | Capacité limitée | non simulé |
| CSPS de Loropéni | Loropéni (Cascades) | Consultations, Maternité | Disponible | non simulé |
| Centre de référence de Banfora | Banfora (Cascades) | Chirurgie, Médecine interne, Imagerie, Réanimation | Disponible | phone-centre |
| Centre de référence de Dédougou | Dédougou (Boucle du Mouhoun) | Chirurgie, Pédiatrie | Capacité limitée | non simulé |

Ces disponibilités sont **déclarées pour la démonstration, jamais mesurées**.

## Les écrans

| Route | Écran | Ce qu'on y voit |
|---|---|---|
| `/app` | Tableau de bord | Établissement + compte + rôle, **nœud local**, état du réseau (simulé), 6 compteurs (en attente, urgentes, acceptées, refusées, en cours, clôturés), 5 actions rapides, alertes actives, dernières communications, notifications |
| `/app/care` | Suivi des prises en charge | Filtres priorité / statut / recherche, liens vers la fiche, actions autorisées (`Accuser réception`, `Accepter la prise en charge`, `Refuser…`, `Clôturer…`, `Soumettre le brouillon`) |
| `/app/care/:id` | Fiche dossier | Double statut **sanitaire + transport**, route transport, historique complet (horodatage, auteur, étape), actions contextuelles |
| `/app/care/new` | Nouveau dossier | 3 volets (identification / soins / logistique), validation selon la priorité, bouton **Brouillon** (local, non transmis) |
| `/app/directory` | Annuaire sanitaire | Établissements déclarés, services, disponibilité, nœud ; **ma propre disponibilité est éditable ici** |
| `/app/reports` | Rapports | Indicateurs par période, répartition par centre, transport simulé, **export CSV local** |
| `/app/messages` | Messages | Conversations, envoi, suivi d'acheminement |
| `/app/alerts` | Alertes | Émission, les **7 catégories sanitaires** (urgence médicale, évacuation immédiate, incident sanitaire, indisponibilité de service, renfort, incident logistique, alerte technique) |
| `/app/network` | Réseau Mesh | Carte des nœuds, coupure / rétablissement des liens |
| `/app/hub` | Console du Hub | Statistiques, **orientation des demandes vers un centre compétent**, catégorisation et accusé des alertes |
| `/app/admin` | Administration | Comptes, configuration, **journal d'activité** (accès refusés inclus) |
| `/app/settings` | Profil | Compte, contexte organisationnel, réinitialisation |

## Parcours guidé (10 minutes)

1. **Connexion `agent_csps`** → le tableau de bord affiche *CSPS de Kongou*,
   le rôle *Agent de santé*, le nœud `phone-mariam (degraded/en ligne)` et les
   compteurs de dossiers de l'établissement.
2. **Demandes → Nouvelle demande** : volet identification (type de demande,
   priorité *critique*, motif), volet soins (constantes facultatives), volet
   logistique (transport, oxygène, équipe). Envoyer → dossier `DOS-2026-xxxx`,
   statut *Transmise au réseau*. **Aucun champ de nom de patient n'existe.**
3. **Réseau** : coupez les liens, puis rouvrez la fiche du dossier : le statut
   sanitaire reste *Transmise au réseau* tant que le transport n'est pas arrivé
   (**réception technique ≠ acceptation**).
4. **Connexion `agent_centre_reference`** (déconnexion puis reconnexion) :
   le dossier apparaît dans *Demandes* → **Accuser réception** → **Accepter la
   prise en charge** → **Informations complémentaires demandées** (motif
   « préciser la glycémie »).
5. **Connexion `agent_csps`** : la fiche montre la demande du centre. L'agent
   **peut lire** son dossier mais **ne peut pas faire avancer l'état du centre**
   (le bouton n'existe pas, la politique le refuse).
6. **Connexion `operateur_hub`** → **Hub → Orienter une demande** : choisissez
   le *Centre de référence de Dédougou* → la destination change, un événement
   *orientation* entre dans l'historique, le CSPS reçoit une notification. Le
   Hub **n'est pas un passage obligatoire** : aucun dossier ne transite par lui
   automatiquement.
7. **Alertes** : émettez une alerte depuis `agent_csps`, catégorisez-la en
   *Indisponibilité d'un service* depuis le Hub, accusez réception.
8. **Connexion `responsable_csps`** → **Rapports** : indicateurs par période et
   **Exporter en CSV (local)** — le fichier est généré dans le navigateur,
   rien n'est envoyé sur le réseau.
9. **Connexion `agent_centre_reference` → Annuaire** : changez ma
   disponibilité en *Capacité limitée* — refus si vous tentez de modifier un
   autre établissement (droit org-scopé).
10. **Connexion `administrateur` → Admin** : journal d'activité, y compris les
    accès refusés.

## Réjouer les scénarios

### En automatique (recommandé)

```bash
npx vitest run src/tests/cspScenarios.test.ts        # scénarios CSPS A → M (16 tests)
npx vitest run src/tests/businessScenarios.test.ts   # scénarios civils A → J (conservés)
npx vitest run src/tests/policy.test.ts              # refus et isolation
npm test                                             # 19 fichiers, 187 tests
```

| Scénario | Test (`src/tests/cspScenarios.test.ts`) |
|---|---|
| A | `PASS : dossier transmis, identifiant non nominatif, journalisé` + `PASS : la validation dépend de la priorité…` |
| B | `PASS : le transport s'arrête à REÇU, le centre doit agir` |
| C | `PASS : accusé → accepté → en cours → clôturé, historique ordonné` |
| D | `PASS : refus impossible sans justification, CSPS notifié` |
| E | `PASS : destination changée, tracée et notifiée` + `PASS : un non-opérateur ne peut pas orienter` |
| F | `PASS : pas d'état au-delà de REÇU tant que le transport n'est pas arrivé` + `PASS : seuls sent/received sont couplés…` |
| G | `PASS : le centre redemande, le CSPS fournit, le dossier repart` |
| H | `PASS : pas de transport sur DRAFT, puis soumission normale` |
| I | `PASS : un autre CSPS, un citoyen et l'opérateur hors dossier ne lisent rien` |
| J | `PASS : gestion, statistiques et annuaire réservés au responsable` |
| K | `PASS : mise à jour pour soi, refus pour autrui, journalisée` |
| L | `PASS : dossier bloqué puis reçu après rétablissement, un seul exemplaire` |
| M | `PASS : 7 catégories sanitaires, catégorisation et accusé par l'opérateur` |

`docs/RAPPORT_CSPS.md` donne la notation PASS / PARTIEL / FAIL de chaque
scénario et les sorties réelles des commandes.

## Trois niveaux de simulation (à ne pas confondre)

| Niveau | Ce que c'est | Ce que ça n'est pas |
|---|---|---|
| Simulation de **plusieurs utilisateurs** | On change de compte sur le même appareil (aucun serveur) | Ce n'est pas une connexion multi-appareils |
| Simulation de **plusieurs nœuds Mesh** | Le moteur calcule routes, pertes et pannes | Aucun équipement radio n'émet |
| Communication **réellement possible entre appareils** | **NON IMPLÉMENTÉ** — nécessiterait un serveur et du matériel | Jamais simulée, jamais prétendue |

## Réinitialiser

**Profil → Réinitialiser la démonstration** efface les données locales et
recharge le jeu. La clé `seedVersion` garantit qu'un ancien jeu est remplacé au
démarrage.

## Limites assumées

- **Aucune authentification de production** : comptes locaux, mots de passe
  locaux, aucune vérification serveur. La couche de politique démontre une
  logique d'autorisation, elle ne protège pas contre quelqu'un qui modifie le
  code ou les données de l'appareil.
- **Réception technique ≠ acceptation** : l'arrivée du transport (état
  `Reçue par le centre`) ne vaut jamais prise en charge ; une personne doit
  agir.
- **Le Hub n'est pas un passage obligatoire** : une demande CSPS → centre est
  routée directement quand une route existe ; le Hub n'intervient que pour les
  alertes qui lui sont adressées et pour l'orientation explicite.
- **Disponibilité et annuaire déclarés** : aucune donnée n'est mesurée sur le
  terrain.
- Si la Web Crypto n'est pas disponible (contexte non sécurisé), l'application
  **s'arrête sur un écran d'erreur**.
- La limite de tentatives de connexion (5 essais / 60 s) est une démonstration
  locale, pas un service de compte.
