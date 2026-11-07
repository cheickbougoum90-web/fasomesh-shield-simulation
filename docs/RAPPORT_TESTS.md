# FasoMesh Shield — Rapport de tests (résultats réels)

> Aucun résultat n'est déclaré sans exécution. Les sorties ci-dessous sont
> collées telles quelles après exécution sur cette version.

## 1. Commandes exécutées et résultats

### Typage

```
$ npm run typecheck
> tsc --noEmit
(exit code 0 — aucune erreur)
```

### Tests complets

```
$ npm test
 ✓ src/tests/user.test.ts (6 tests) 83ms
 ✓ src/tests/businessScenarios.test.ts (13 tests) 492ms
 ✓ src/tests/spaces.test.tsx (11 tests) 400ms
 ✓ src/tests/cspScenarios.test.ts (16 tests) 637ms
 ✓ src/tests/engine.test.ts (13 tests) 27ms
 ✓ src/tests/seed.test.ts (5 tests) 896ms
 ✓ src/tests/console.test.tsx (6 tests) 566ms
 ✓ src/tests/scenarios.test.ts (11 tests) 22ms
 ✓ src/tests/hubRelay.test.ts (7 tests) 17ms
 ✓ src/tests/policy.test.ts (25 tests) 15ms
 ✓ src/tests/finalisation.test.tsx (9 tests) 1402ms
 ✓ src/tests/messaging.test.ts (14 tests) 10ms
 ✓ src/tests/care.test.ts (12 tests) 10ms
 ✓ src/tests/delivery.test.ts (10 tests) 11ms
 ✓ src/tests/security.test.ts (7 tests) 29ms
 ✓ src/tests/crypto.test.ts (5 tests) 34ms
 ✓ src/tests/routing.test.ts (9 tests) 9ms
 ✓ src/tests/org.test.ts (7 tests) 8ms
 ✓ src/tests/permissions.test.ts (6 tests) 6ms
 ✓ src/tests/alert.test.ts (4 tests) 7ms

 Test Files  20 passed (20)
      Tests  196 passed (196)
   Duration  3.74s
```

**20 fichiers · 196 tests · 0 échec** — dont **171 tests de régression
d'origine, intacts**, et 25 tests ajoutés pour cette version.

### Build de production

```
$ npm run build
dist/index.html                   0.68 kB │ gzip:   0.40 kB
dist/assets/index-mhJWw6UE.css   44.07 kB │ gzip:   8.79 kB
dist/assets/index-CRqVs_8g.js   441.53 kB │ gzip: 129.03 kB
✓ built in 1.61s
```

### Vérification visuelle (navigateur réel, §10)

```
$ node tools/visual-check.mjs
✓ 01-connexion            ✓ 02-tableau-de-bord-csps   ✓ 03-demandes
✓ 04-formulaire-reference ✓ 05-fiche-dossier          ✓ 06-annuaire
✓ 07-espace-centre        ✓ 08-espace-hub             ✓ 09-equipe-csps
✓ 10-rapports             ✓ 11-parametres
✓ m01-tableau-de-bord     ✓ m02-demandes              ✓ m03-formulaire
✓ m04-espace-centre       ✓ m05-espace-hub

captures : 16/16
erreurs console : 0
débordements horizontaux : 0
```

Les 16 captures (ordinateur 1280×900 et téléphone 390×844) sont livrées dans
`artifacts/screens/` et ont été **examinées** : connexion, tableau de bord
(desktop + mobile), formulaire, fiche de dossier, annuaire, espace Centre
(desktop + mobile), espace Hub (desktop + mobile), équipe, rapports,
paramètres.

## 2. Les 22 validations obligatoires (§9)

| # | Validation | Test exécuté | Résultat |
|---|---|---|---|
| 1 | Connexion d'un agent CSPS | `cspScenarios.test.ts` — tous les scénarios passent par `login('agent_csps')` | **PASS** |
| 2 | Connexion d'un responsable CSPS | `cspScenarios` — `gestion, statistiques et annuaire réservés au responsable` | **PASS** |
| 3 | Création et sauvegarde d'un brouillon | `cspScenarios` — `pas de transport sur DRAFT, puis soumission normale` | **PASS** |
| 4 | Soumission d'une demande | idem (DRAFT → SUBMITTED → livraison créée) | **PASS** |
| 5 | Transmission directe au centre | `cspScenarios` — `dossier transmis, identifiant non nominatif, journalisé` | **PASS** |
| 6 | Réception technique par le centre | `cspScenarios` — `le transport s'arrête à REÇU, le centre doit agir` | **PASS** |
| 7 | Accusé de réception humain | `cspScenarios` — `accusé → accepté → en cours → clôturé, historique ordonné` | **PASS** |
| 8 | Acceptation de la demande | idem + `le centre redemande, le CSPS fournit, le dossier repart` | **PASS** |
| 9 | Refus avec justification | `cspScenarios` — `refus impossible sans justification, CSPS notifié` | **PASS** |
| 10 | Demande d'informations et réponse du CSPS | `cspScenarios` (G) + `finalisation.test.tsx` — `le centre demande, le CSPS répond, l'état du centre ne bouge pas tout seul` | **PASS** |
| 11 | Suivi complet d'un transfert jusqu'à la clôture | `finalisation.test.tsx` — `accepté → préparé → en transit → arrivé → clôturé, transport suivi séparément` | **PASS** |
| 12 | Envoi d'une alerte au Hub | `businessScenarios.test.ts` — `alerte critique citoyen → Hub, traitée par l'opérateur` | **PASS** |
| 13 | Catégorisation et accusé par le Hub | `cspScenarios` — `7 catégories sanitaires, catégorisation et accusé par l'opérateur` | **PASS** |
| 14 | Indisponibilité du Hub | `finalisation.test.tsx` — `Hub coupé, le CSPS transmet quand même au centre sans passer par le Hub` + `hubRelay.test.ts` (7 tests de repli) | **PASS** |
| 15 | Absence de route puis rétablissement | `cspScenarios` — `dossier bloqué puis reçu après rétablissement, un seul exemplaire` | **PASS** |
| 16 | Absence de doublons après reprise | idem (1 seul dossier, 1 seul événement `delivered`) | **PASS** |
| 17 | Refus d'accès à un dossier non autorisé | `cspScenarios` — `un autre CSPS, un citoyen et l'opérateur hors dossier ne lisent rien` + `policy.test.ts` (25 tests) | **PASS** |
| 18 | Isolation entre deux CSPS | idem (liste vide pour l'autre CSPS) + `businessScenarios` (H) | **PASS** |
| 19 | Gestion des membres par le responsable | `finalisation.test.tsx` — `responsable ajoute, change le rôle et retire ; l'agent est refusé` | **PASS** |
| 20 | Persistance des dossiers après rechargement | `finalisation.test.tsx` — `un brouillon créé survit à un rechargement complet de l'application` | **PASS** |
| 21 | Rapports et export CSV | `finalisation.test.tsx` — `en-têtes français, séparateur ;, échappement, aucune donnée nominative` | **PASS** |
| 22 | Affichage ordinateur et téléphone | `tools/visual-check.mjs` — 16 captures, **0 erreur console, 0 débordement horizontal** + 2 tests de rendu des espaces | **PASS** |

**22/22 validations couvertes et exécutées.**

## 3. Tests ajoutés pour cette version (25)

| Fichier | Nombre | Objet |
|---|---|---|
| `cspScenarios.test.ts` | 16 | Scénarios CSPS A → M (mission précédente) |
| `finalisation.test.tsx` | 9 | §9.19 équipe, §9.10 réponse aux informations, §2B instructions, §9.11 transfert complet, §9.14 Hub coupé, §9.20 persistance, §9.21 CSV, §10 rendu des espaces (2) |

Aucun test existant n'a été supprimé, désactivé ni affaibli : les 171 tests de
régression d'origine sont toujours présents et verts (politique, moteur Mesh,
routage, livraison, relais, messagerie, espaces civils, seed, console de
supervision, sécurité, crypto).

## 4. Couverture par bloc fonctionnel

| Bloc | Fichiers de tests | État |
|---|---|---|
| Politique et permissions | `policy`, `permissions`, `spaces` | verts |
| Moteur Mesh, routage, livraison, relais | `engine`, `routing`, `delivery`, `hubRelay` | verts |
| Soins (machine sanitaire) | `care`, `cspScenarios`, `finalisation` | verts |
| Persistance, seed, comptes | `seed`, `finalisation` | verts |
| Messagerie, alertes, organisations | `messaging`, `alert`, `org` | verts |
| Sécurité et crypto | `security`, `crypto`, `user` | verts |
| Scénarios métier civils (conservés) | `businessScenarios`, `scenarios` | verts |
| Interface (rendu) | `console`, `spaces`, `finalisation` | verts |

## 5. Ce qui n'est PAS couvert par des tests automatiques

- Le **tirage réel des captures d'écran** : fait par `tools/visual-check.mjs`
  dans Chromium, puis **examination humaine des images** (non automatisable en
  assertions).
- Le **chiffrage de bout en bout** entre deux appareils réels : il n'y a qu'un
  seul appareil ; le chifrage AES-GCM est testé unitairement (`crypto`).
- Les **intéractions tactiles** sur téléphone réel : vérifié en taille d'écran
  mobile (390×844) dans le navigateur, pas sur un périphérique physique.
