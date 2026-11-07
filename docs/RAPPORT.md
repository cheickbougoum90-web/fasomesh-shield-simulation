# FasoMesh Shield — Rapport final

> Démonstration logicielle **100 % navigateur**. Aucun serveur, aucune radio,
> aucune donnée réelle. Toute valeur technique du modèle est une hypothèse
> (registre unique : `src/core/modelAssumptions.ts`).

---

## 1. Ce qui a été fait, par phase (avec les commits)

| Phase | Contenu | Commit | Vérification à la fin de la phase |
|---|---|---|---|
| **0** | Audit du dépôt (tout était *untracked*), `.gitignore`, commit initial, note `docs/CONCEPTION.md` (18 contradictions/ambiguïtés tranchées, architecture cible, découpage en 8 phases) | `abc3c3f`, `ba5c750` | tsc 0 · **70/70** · build OK |
| **1** | `core/modelAssumptions` (fichier unique des valeurs inventées), 9 rôles, `Organization`/`Membership`/`ActiveContext`/`Group`/`SharedGrant`, **couche `src/policy/`** (catalogue + évaluation + journal d'accès), matrice legacy gelée | `bf6ade0` | tsc 0 · **101/101** · build OK |
| **2** | 7 types de message, `consultedAt`, service de messagerie (politique avant création, dédoublonnage, reprise au boot), **`hubRelayMode` relay\|terminus**, contexte actif + `setActiveOrg` dans le store | `ec5a56f` | tsc 0 · **122/122** · build OK |
| **3** | `domain/care` (machine CREATED→…→RESOLVED, dossier non nominatif, invariant de couplage), `services/care` (actes d'opérateur soumis à la politique, refus motivé obligatoire), `careRequests` persisté + synchro moteur | `d334140` | tsc 0 · **135/135** · build OK |
| **4** | Menu **piloté par la politique**, sélecteur de contexte explicite, écrans Soins / nouveau dossier / Hub / Administration, `setAlertCategory`, correction d'une boucle de rendu révélée par le test | `6de9288` | tsc 0 · **146/146** · build OK |
| **5** | §9 : échec **bloquant** sans Web Crypto, limite de tentatives de connexion, aide réécrite (3 niveaux, « le simulateur connaît tout le graphe », registre des hypothèses) ; jeu de démonstration v2 (10 comptes, 8 organisations, 2 groupes, 13 nœuds), `docs/DEMO.md` | `8aef1d9` | tsc 0 · **158/158** · build OK |
| **6+7** | `businessScenarios.test.ts` (10 scénarios A→J), envoi **groupe**, **espace ONG** (équipes, incidents, partages), `reportIncident`/`grantShared` | `546c020` | tsc 0 · **171/171** · build OK |

Aucune phase n'a été bouclée avec un test en échec.

---

## 2. Tableau des scénarios — notation PASS / PARTIEL / FAIL

Chaque scénario est **exécuté automatiquement** dans
`src/tests/businessScenarios.test.ts` (aucun mock : store → politique →
services → moteur → machines à états).

| Scénario | Notation | Preuve (nom du test) |
|---|---|---|
| **A.** Message citoyen → famille via plusieurs relais | **PASS** | `Scénario A … PASS : acheminé multi-sauts jusqu'au destinataire` — `delivered`, ≥ 2 sauts, au moins un relais, 1 seul exemplaire |
| **B.** Alerte critique citoyen → Hub, traitée par l'opérateur | **PASS** | `Scénario B … PASS : transport jusqu'au Hub puis prise en charge par l'opérateur` — `delivered` puis `category='medical'` + accusé par `operateur_hub` |
| **C.** CSPS → centre : demande, confirmation, réponse | **PASS** | `Scénario C … PASS : cycle complet CREATED → … → RESOLVED` (7 états dans l'ordre) et `PASS : un refus exige une justification` |
| **D.** Coordinateur ONG → équipe : consigne, réponses, incident | **PASS** | `Scénario D … PASS : consigne diffusée, réponse de l'agent, incident remonté` — 2 messages de groupe `delivered`, incident rattaché à `org-ong-1`, refus de partage pour l'agent |
| **E.** Deux organisations autorisées, mission commune | **PASS** | `Scénario E … PASS : partage explicite, accès limité à la ressource listée` — lecture via `SharedGrant` accordée, toutes les autres ressources/membres/conversations **refusées** |
| **F.** Panne du Hub : local continue, vers Hub attend | **PASS** | `Scénario F … PASS : envoi local livré malgré la panne, envoi vers Hub en attente puis repris` — local `delivered`, alerte `queued` (jamais « reçue »), reprise après rétablissement |
| **G.** Absence de route : attente puis reprise sans doublon | **PASS** | `Scénario G … PASS : mis en attente, repris automatiquement, un seul exemplaire` — non livré avec tous liens coupés → `delivered` après rétablissement → 1 seul exemplaire |
| **H.** Citoyen ↛ demandes médicales d'un CSPS | **PASS** | `Scénario H … PASS : refus directement sur la couche de politique et à l'écran` (+ `policy.test.ts` : refus avec motif `role_missing`, journalisé) |
| **I.** Multi-rôles : changement de contexte sans mélange | **PASS** | `Scénario I … PASS : deux organisations, un rôle différent, aucun droit résiduel` + `PASS : un contexte auquel on n'appartient pas est refusé` |
| **J.** Message à un groupe familial | **PASS** | `Scénario J … PASS : chaque destinataire reçoit individuellement` (identifiants distincts, conversation `cv_grp_*`) + `PASS : un non-membre ne peut pas écrire dans le groupe` |

**Bilan : 10 PASS, 0 PARTIEL, 0 FAIL.**

Scénarios complémentaires du moteur (déjà verts avant ce projet, conservés) :
`engine.test.ts` (13) et `scenarios.test.ts` (11) couvrent les pannes,
changement de route, mise en attente, reprise, priorités et métriques ;
`hubRelay.test.ts` (7) vérifie les **deux modes de relais du Hub**.

---

## 3. Résultats des tests (sorties réelles, collées telles quelles)

### Référence de départ (phase 0)

```
$ npm run typecheck
> tsc --noEmit
EXIT_TSC=0

$ npm test
 Test Files  9 passed (9)
      Tests  70 passed (70)
   Duration  6.40s
EXIT_TEST=0

$ npm run build
dist/assets/index-B9msV7_0.css   42.70 kB │ gzip:  8.53 kB
dist/assets/index-CVpBjlzh.js   317.28 kB │ gzip: 96.94 kB
✓ built in 1.63s
EXIT_BUILD=0
```

### État final (après la phase 6+7)

```
$ npm run typecheck
> tsc --noEmit
TSC=0

$ npm test
 ✓ src/tests/engine.test.ts (13 tests) 20ms
 ✓ src/tests/scenarios.test.ts (11 tests) 17ms
 ✓ src/tests/user.test.ts (6 tests) 78ms
 ✓ src/tests/spaces.test.tsx (11 tests) 231ms
 ✓ src/tests/businessScenarios.test.ts (13 tests) 381ms
 ✓ src/tests/seed.test.ts (5 tests) 691ms
 ✓ src/tests/routing.test.ts (9 tests) 8ms
 ✓ src/tests/policy.test.ts (25 tests) 16ms
 ✓ src/tests/hubRelay.test.ts (7 tests) 12ms
 ✓ src/tests/console.test.tsx (6 tests) 540ms
 ✓ src/tests/care.test.ts (12 tests) 11ms
 ✓ src/tests/messaging.test.ts (14 tests) 10ms
 ✓ src/tests/security.test.ts (7 tests) 29ms
 ✓ src/tests/delivery.test.ts (10 tests) 9ms
 ✓ src/tests/permissions.test.ts (6 tests) 7ms
 ✓ src/tests/alert.test.ts (4 tests) 5ms
 ✓ src/tests/org.test.ts (7 tests) 9ms
 ✓ src/tests/crypto.test.ts (5 tests) 31ms

 Test Files  18 passed (18)
      Tests  171 passed (171)
   Duration  9.9s
TEST=0

$ npm run build
dist/index.html                   0.68 kB │ gzip:  0.40 kB
dist/assets/index-fhAoZpKb.css   42.51 kB │ gzip:  8.52 kB
dist/assets/index-CUVVn-QK.js   367.60 kB │ gzip: 111.51 kB
✓ built in 1.54s
BUILD=0
```

**70 → 171 tests** (+101), **18 fichiers**, **aucun test existant supprimé
ni affaibli** : les 70 tests initiaux sont toujours là et verts.

Commits : `abc3c3f` → `ba5c750` → `bf6ade0` → `ec5a56f` → `d334140` →
`6de9288` → `8aef1d9` → `546c020`.

---

## 4. Fonctionnalités : implémenté / simulé / seulement prévu

Légende : **R** = réellement implémenté (logique complète), **S** = simulé
(calcule et affiche, mais ne représente aucun matériel), **P** = seulement prévu.

| Fonctionnalité | État | Test exécuté | Résultat observé | Limites restantes |
|---|---|---|---|---|
| Politique d'autorisation (9 rôles, contexte, périmètre, partages) | **R** | `policy.test.ts` (25) + scénario H/E | Refus avec motif et journal, isolement entre orgs vérifié | Démonstration : les données restent lisibles dans le navigateur |
| Journal d'accès / audit | **R** | assert sur `accessLog()` (refus inclus) | Entrée `allowed=false`, code `role_missing` | Mémoire volatile (200 entrées) + audit persisté (300 max) |
| Messagerie (7 types, priorité, statut, consultation) | **R** | `messaging.test.ts` (14), scénarios A/D/G/J | `delivered` après accusé, `consultedAt` réservé au destinataire | Aucune notification push, pas de pièces jointes |
| Transport Mesh multi-saut, files, pannes, reprise | **S/R** | `engine` (13) + `scenarios` (11) + A/F/G | Route alternative après panne, file, reprise, **échec** après 30 s sans route | Tout est calculé localement ; aucun matériel |
| Contrat « au moins une fois » + dédoublonnage | **R** | G (un seul exemplaire), `messaging` (resume) | Identifiant persistant conservé à la reprise | Effet « exactement une fois » garanti si les deux extrémités vivent |
| Hub : destinataire mais pas obligatoire (2 modes) | **R** | `hubRelay.test.ts` (7) | `terminus` = aucun saut via Hub, et échec honnête si seul chemin = Hub | Le mode n'est pas encore exposé dans l'UI (voir §5) |
| Alerte médicale non nominative + suivi de soin | **R** | `care.test.ts` (12) + C | 7 états, refus motivé obligatoire, aucun nom de patient | Dossier en mémoire locale uniquement |
| Espaces citoyen / CSPS / centre / Hub / admin / ONG | **R** | `spaces.test.tsx` (11) + rendus | Menu filtré, écrans « Accès réservé » hors droit | Rendu visuel **jamais vérifié** (voir §7) |
| Groupes familiaux et équipes | **R** | scénarios D et J | 1 exemplaire par destinataire, non-membre refusé | Pas d'interface de création de groupe (groupes semés) |
| Organisations indépendantes + missions communes | **R** | scénario E | Lecture via `SharedGrant` seule ; autres ressources refusées | Pas d'interface d'expiration de partage |
| Statistiques du Hub | **S** | rendu `HubSpace` (dérivé de l'état) | Compteurs recalculés à chaque rendu | Aucune agrégation temporelle ni export |
| Hypothèses du modèle regroupées | **R** | `seed`/`security` tests + typecheck | 12 hypothèses étiquetées, affichées dans Aide et Admin | Ce ne sont **pas** des mesures |
| Échec visible sans Web Crypto | **R** | `security.test.ts` (7) | `encryptText`/`hashPassword` lèvent, écran d'arrêt affiché | Jamais testé dans un vrai navigateur non sécurisé |
| Limitation des tentatives de connexion | **R** | `security.test.ts` (4 dédiés) | Verrouillage puis remise à zéro après expiration | Locale, contournable (documenté) |
| Authentification de comptes | **S** | `user.test.ts` + `seed.test.ts` | Empreinte PBKDF2 réelle, 10 comptes vérifiés | **Pas de production** : comptes locaux, aucun serveur |
| Chiffrement AES-GCM | **R** | `crypto.test.ts` (5) | Chiffre/déchiffre, IV unique, authenticité vérifiée | Clé de démo **partagée**, aucun échange de clés |
| Carte / supervision (`/supervision`) | **S** | `console.test.tsx` (6) | Rendu, sélection, scénarios, envoi, pause | Rendu visuel non vérifié |
| Pièces jointes / vocaux | **P** | — | — | **Différés** (fragmentation non implémentée) |
| Alertes publiques, rapports téléchargeables | **P** | — | — | Différés en P2 |
| Communication réellement multi-appareils | **P** | — | — | **Jamais simulée** : nécessite serveur + matériel |

---

## 5. Écarts par rapport au cahier des charges

| Exigence | Écart | Justification |
|---|---|---|
| §6 Pièces jointes : fragmentation, retransmission, reconstruction | **Non fait (P2)** | Ces mécanismes ne sont pas implémentés ; un simple transfert local présenté comme du Mesh serait trompeur. Rapporté explicitement. |
| §7 « accusés pouvant emprunter un chemin de retour différent » | **Partiel** | Le retour d'accusé est un second message soumis au même moteur (donc chemin différent possible), mais aucun test ne force exprès un retour en échec alors que l'aller réussit. |
| §8 « portée théorique / distance » | **Affiché, non utilisé** | La connectivité vient **des liens déclarés** (décision tranchée dans `CONCEPTION.md` §3.8) ; distance et portée sont illustratives et étiquetées hypothèse. |
| §5 « rapports » dans l'espace ONG | **Partiel** | Incidents et partages en place ; rédaction/téléchargement de rapports non fait. |
| §5 « signaler la disponibilité » côté centre | **Partiel** | Accepter / refuser motivé / mettre en cours / clôturer sont faits ; « demander des informations » et « disponibilité » n'ont pas d'état dédié (leurs transitoires restent `acknowledged`). |
| §12 « notifications » par profil | **Basique** | Notifications globales existantes (jamais de faux « reçu ») ; pas de préférences par profil. |
| Menu mobile (onglets fixes) plutôt que « vue adaptée aux ordinateurs » | **Conservé** | L'app civile reste mobile-first (décision d'origine) ; la console `/supervision` reste le volet desktop. |

---

## 6. Exigences impossibles ou problématiques → ce qui a été fait à la place

1. **« Au moins une fois » + « exactement une fois » + « rien en cas d'absence de route »** (contradictoires).
   → Transport **au moins une fois** + **dédoublonnage par identifiant persistant** ; sans route à expiration : `failed`, jamais un faux succès.
2. **« Réception technique » ≠ « prise en charge »** : deux machines à états distinctes, couplées par deux seuls automatismes (`sent`, `received`) ; `ACKNOWLEDGED` et au-delà exigent un acte d'opérateur. Invariant testé (`care.test.ts`).
3. **« Le Hub ne reçoit que ce qui lui est adressé » vs transit** : distinction destinataire / transit (charge chiffrée illisible) + **mode relais configurable** (`terminus`) testé dans les deux sens.
4. **9 rôles vs matrice legacy gelée** : nouvelle couche `src/policy/` qui **délègue** les 10 anciennes actions à l'ancienne matrice — cohérence vérifiée par test (aucun test existant modifié).
5. **Plusieurs utilisateurs dans UN navigateur** : toutes les fonctions métier prennent `actorId` explicite ; la démo utilise une bascule de compte locale, clairement séparée de toute « communication entre appareils ».
6. **Ordre de vérification politique** : le contrôle de contexte (`context_required`) est posé avant le contrôle de rôle ; conséquence assumée et testée.
7. **Ordre des actions du brief** : les écrans de profil ont demandé que l'authentification et les données de démo existent — réalisés dans cet ordre : fondations → messagerie → soins → écrans → dettes → scénarios.

---

## 7. Ce qui n'est PAS terminé

1. **Vérification visuelle** : cet environnement n'a **pas de navigateur automatisé**. Le rendu n'a été contrôlé que par des tests jsdom (présence du contenu, filtrage du menu, refus hors droits). **Ouvrez l'app et contrôlez le rendu.**
2. **P2 non commencé** : pièces jointes/vocaux, alertes publiques, rapports téléchargeables, export de données.
3. **Interface de création d'organisations, de groupes et de missions** : les entités existent et sont testées, mais elles sont **semées** ; la création reste un code de démonstration sans écran.
4. **Mode relais du Hub (`terminus`)** : réglable par le moteur et testé, **pas encore exposé dans l'interface**.
5. **Persistance des incidents/partages/dossiers dans un ancien jeu de données** : `seedVersion=2` **remplace** l'ancien jeu au premier démarrage (documenté dans `docs/DEMO.md`) ; aucune migration des données utilisateur de la v1.
6. **Notifications par profil**, préférences, et « demander des informations » / « signaler la disponibilité » (voir §5).
7. **Aucun déploiement** : le choix « d'abord le voir en local » a été respecté ; rien n'a été publié, aucun `git push` n'a été effectué.
8. **Tests E2E navigateur et accessibilité** : non menés (pas d'outillage navigateur ici).

### Commandes de vérification

```bash
npm run typecheck   # tsc --noEmit
npm test            # 171 tests / 18 fichiers
npm run build       # tsc + vite build
npx vitest run src/tests/businessScenarios.test.ts   # scénarios A-J
```
