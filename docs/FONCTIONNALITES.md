# FasoMesh Shield — Fonctionnalités : implémenté / simulé / non réalisé

Périmètre : **coordination sanitaire centrée sur le CSPS**, avec deux espaces
complémentaires (centre de référence, Hub). Démonstration : **aucune donnée
médicale réelle, aucun dispositif médical certifié, aucune radio réelle**.

## 1. Implémenté (fonctionnel, testé)

### Espace CSPS
- Tableau de bord opérationnel (établissement, compte, rôle, nœud local, réseau,
  6 compteurs, actions rapides, alertes, communications, notifications).
- Création de demandes de **référence**, d'**évacuation** et d'**avis** en
  3 volets courts (identification, soins, logistique).
- **Brouillon** sauvegardé localement, jamais transmis tant qu'il n'est pas soumis.
- **Validation selon la priorité** (critique souple, normale stricte) avec
  messages d'erreur explicites.
- Transmission au centre de référence **par le moteur Mesh** (routage, files,
  pertes, retransmissions, accusés, détection de doublon).
- Suivi de la **réception technique** séparé du suivi sanitaire, avec route et
  lien « suivre le transfert pas à pas ».
- Consultation des **réponses du centre** : instructions et demandes
  d'informations affichées sur la fiche.
- **Réponse aux demandes d'informations complémentaires** (sans jamais faire
  avancer l'état du centre).
- Messagerie avec les **établissements du dispositif uniquement** (contenu
  chiffré AES-GCM, suivi d'acheminement).
- **Alertes** dans les 7 catégories sanitaires.
- **Annuaire** des établissements (services, disponibilité déclarée, nœud).
- **Suivi des transferts** et **historique complet** des dossiers.
- **Notifications** liées (chaque décision notifie et lie au dossier).
- **Rapports et statistiques** par période + **export CSV local**.
- **Gestion de l'équipe** par le responsable (ajout, rôle, retrait,
  confirmation, journal) — refusée à l'agent.
- **Paramètres** du compte et de l'**établissement** (disponibilité déclarée).

### Espace Centre de référence
- Boîte de réception des demandes adressées, compteurs et filtres.
- Accusé de réception, acceptation, **refus motivé obligatoire**, demande
  d'informations, préparation/mise en route/arrivée du transfert, **clôture**
  avec compte rendu obligatoire.
- **Instructions adressées au CSPS** (notification + affichage côté CSPS).
- **Historique des décisions** de l'opérateur (horodaté, signé).
- Confirmation de l'arrivée et suivi de l'état du transfert.
- Déclaration de **moyens et disponibilité** (org-scopé, journalisé).
- Aucun espace hospitalier indépendant : l'hôpital régional utilise le même
  espace que le centre de référence.

### Espace Hub
- Réception, **catégorisation** (7 catégories) et **accusé** des alertes.
- **Orientation** d'une demande vers un établissement compétent (affichant la
  disponibilité déclarée), tracée et notifiée.
- **Files d'attente** (file, acheminement, échoués, non confirmés) avec reprise.
- **Supervision des nœuds et des liaisons** + coupure/rétablissement du Hub.
- **Incidents réseau** (signalement + liste).
- **Journaux techniques** réservés à `journal.read`.
- Statistiques du Hub.

### Transverse
- Moteur Mesh commun à toutes les communications (relais, multi-saut, pertes
  simulées, retransmissions, accusés, repli de stockage au Hub, doublons).
- **Séparation stricte des états techniques et sanitaires** (13 états de soin,
  8 états de transport ; seuls `sent` et `received` sont couplés).
- Couche de **permissions appliquée dans la fonction métier** (`assertCan`),
  isolation par organisation, **journal d'audit** (accès refusés inclus).
- **Persistance locale** (IndexedDB + repli localStorage), remplacement des jeux
  obsolètes par version de seed.
- Interface **française**, barre latérale sur ordinateur, onglets sur téléphone,
  bandeau « démonstration simulée » sur tous les écrans, confirmations avant
  les actions irréversibles (refus, clôture, retrait d'équipe).

## 2. Simulé (fonctionnel mais virtuel)

| Élément | Ce qui est simulé | Ce qui n'est pas |
|---|---|---|
| Transmission Mesh | Calcul des routes, pertes, retards, retransmissions, accusés | Aucun équipement radio, aucun appel réseau externe |
| Nœuds et liaisons | 13 nœuds, coupures manuelles, pannes de scénario | Aucun matériel, aucun terrain |
| Disponibilité des établissements | Déclarée par l'établissement, éditable | Jamais mesurée sur le terrain |
| Annuaire | Établissements et services fictifs | Pas un référentiel officiel |
| Identités et mots de passe | Comptes locaux chiffrés (salt + hash) | Aucun serveur, aucune vérification serveur |
| Délais et statistiques | Issus de la simulation du moteur | Aucune donnée de prise en charge réelle |
| Multi-utilisateurs | Changement de compte sur un même appareil | Pas de multi-appareils réel |
| Orientation du Hub | Acte explicite de l'opérateur | Aucune décision automatique |

## 3. Non réalisé (volontairement hors périmètre)

- **Inscription citoyenne / ONG** et espaces civils (citoyens, familles, ONG,
  missions) : **retirés des menus, routes et parcours**. Les comptes, le code et
  les tests associés sont conservés **sans être étendus** — règle « ne pas
  supprimer ni affaiblir les tests de régression ».
- **Espace hospitalier indépendant** : non créé (l'hôpital est un centre de
  référence).
- **Multi-appareils réel / serveur** : nécessiterait un backend et du matériel.
- **Inscription de nouveaux comptes** depuis l'interface : non proposée (jeu de
  démonstration figé et documenté).
- **Fonction de diagnostic, protocole de soin ou conseil médical** : interdit
  par conception — le collecte, jamais ne prescrit.
- **Écran de contribution des membres** (`org.members.manage`) : le droit existe
  et est testé ; la gestion s'effectue dans l'espace Équipe, pas dans
  Administration.
- **Certification ou usage clinique** : hors de portée — démonstration
  logicielle uniquement.

## 4. Garanties d'affichage

- « **Réception technique ≠ acceptation** » : affiché sur la fiche et testé.
- « **Le Hub n'est pas un passage obligatoire** » : affiché dans le guide Hub et
  testé (coupure du Hub, route directe conservée).
- « **Disponibilité déclarée, jamais mesurée** » : affiché dans l'annuaire et
  les paramètres.
- « **Aucune donnée nominative de patient** » : aucun champ de nom, références
  `DOS-AAAA-NNNN`, testé sur la sérialisation du dossier et sur l'export CSV.
- « **Aucun réseau radio réel** » : bandeau sur chaque écran.
