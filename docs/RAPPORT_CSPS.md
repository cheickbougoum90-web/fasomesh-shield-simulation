# FasoMesh Shield — Rapport de la mission CSPS

> **Note de version** : ce rapport documente les phases 0 à 20 de la mission
> CSPS. La **version finale** (périmètre à 3 acteurs, espace Centre, équipe,
> Hub complet, interface desktop/mobile, vérification visuelle) est décrite dans
> `RAPPORT_TECHNIQUE.md`, `RAPPORT_TESTS.md` et `FONCTIONNALITES.md`.

> Périmètre : **coordination sanitaire centrée sur le CSPS**, 3 acteurs
> (CSPS, centre de référence, Hub). Démonstration logicielle : **aucune radio
> physique, aucune donnée médicale réelle, aucun dispositif médical certifié**.
> Toutes les transmissions Mesh présentées ici sont **simulées**.

---

## 1. Périmètre et règles non négociables — respect

| Règle | Statut |
|---|---|
| Ne pas recommencer de zéro ; partir de l'existant | Base de départ = dépôt déjà en place (commit `abc3c3f`), 171 tests verts conservés |
| Conserver React / TS / Vite / Zustand / moteur Mesh | Conservés tels quels (audit Phase 0 : `tsc 0`, `171/171`, build OK) |
| Conserver routage, relais, files, pertes, retransmissions, accusés, supervision, persistance | Aucune suppression — tests `mesh`, `delivery`, `routing`, `hubRelay`, `console` intacts |
| Ne supprimer ni affaiblir les tests existants | **171 tests d'origine toujours présents et verts** ; 16 tests ajoutés → **187** |
| Aucun résultat inventé | Chaque notation de la section 3 provient d'une exécution réelle (sorties en section 4) |
| Aucune dépendance lourde sans justification | **Zéro nouvelle dépendance** |
| Aucun appel réseau externe | Aucun `fetch` ajouté ; l'export CSV est généré localement (`Blob` + téléchargement navigateur) |
| Ne jamais présenter une simulation comme une radio réelle | Mentions « simulé » / « déclaré, non mesuré » sur le réseau, l'annuaire, les rapports |
| Aucune donnée médicale réelle ; pas de dispositif médical certifié | Jeu fictif uniquement ; aucun champ nominatif de patient ; aucune fonction de diagnostic |
| Réception technique ≠ acceptation | `received` n'est qu'une arrivée de transport ; toute suite exige une action humaine (scénario B) |
| Le Hub n'est pas passage obligatoire | Route directe CSPS → centre quand une route existe ; le Hub oriente à la demande (scénario E) |
| 3 acteurs seulement ; ne pas développer espaces citoyens, ONG, familles | Espaces civils **conservés tels quels sans extension** (règle 4), hors périmètre |

---

## 2. Ce qui a été fait, par phase (avec les commits)

| Phase | Contenu | Commit | Vérification |
|---|---|---|---|
| **0** | Audit exécuté + `docs/CONCEPTION_CSPS.md` | `9754336` | `tsc 0` · `171/171` · build OK |
| **1-2** | Rôle `health_manager`, 5 nouvelles actions (`org.members.manage`, `stats.read`, `directory.read`, `center.availability`, `care.cancel`), `Organization` enrichie (région/district/localité/adresse/services/disponibilité/nœud), seed v3 (12 comptes, 11 organisations, 6 dossiers), machine sanitaire **8 → 13 états**, `validateRequestForm` par priorité, types `CARE_*` étendus, store enrichi (`submitDraft`, notifications `care`) | `be1b537` | `tsc 0` · `171/171` |
| **2-6 (UI)** | Tableau de bord (§4), liste des demandes + filtres, fiche dossier `/app/care/:id`, formulaire en 3 volets + brouillon, annuaire (§9), rapports + export CSV local (§12), menu piloté par la politique | `65a57ff` | `tsc 0` · `171/171` · build OK |
| **3C / 3B / 8** | Store `orientRequest` + `setOrgAvailability`, console Hub « Orienter une demande », édition de **ma** disponibilité dans l'annuaire, **7 catégories d'alerte** | `4691925` | `tsc 0` · `171/171` |
| **19** | `src/tests/cspScenarios.test.ts` : **scénarios A → M (13, 16 tests)** ; correctif `evaluate.ts` (lecture côté émetteur) | `1dfa317` | `tsc 0` · **187/187** · build OK |
| **20** | `docs/DEMO_CSPS.md` + ce rapport | présent commit | `tsc 0` · `187/187` · build OK |

---

## 3. Tableau des scénarios A → M — notation PASS / PARTIEL / FAIL

Chaque scénario est **exécuté automatiquement** dans
`src/tests/cspScenarios.test.ts`, sur les vraies couches (store → politique →
services → moteur Mesh → machines à états), **sans aucun mock**.

| Scénario | Notation | Preuve (nom du test) |
|---|---|---|
| **A.** Ouverture d'une référence non nominative au CSPS | **PASS** | `dossier transmis, identifiant non nominatif, journalisé` (`caseRef` `DOS-AAAA-NNNN`, zéro champ de nom, entrée au journal) + `la validation dépend de la priorité…` (priorité `info` incomplète → refus avec motif et signes) |
| **B.** Arrivée technique ≠ acceptation humaine | **PASS** | `le transport s'arrête à REÇU, le centre doit agir` — événements `created → sent → received`, puis `accepted` **refusé** tant que le centre n'a pas accusé |
| **C.** Prise en charge complète par le centre | **PASS** | `accusé → accepté → en cours → clôturé, historique ordonné` — 7 événements dans l'ordre, chaque étape signée, libellé `Clôturée` |
| **D.** Refus motivé + notification du CSPS | **PASS** | `refus impossible sans justification, CSPS notifié` — refus nu refusé, justification stockée, dossier figé, notification `care` liée, couplage transport non prétendu |
| **E.** Le Hub oriente une demande vers un centre compétent | **PASS** | `destination changée, tracée et notifiée` (destination inconnue et destination inchangée refusées, événement `orientation`, notification) + `un non-opérateur ne peut pas orienter` |
| **F.** Couplage transport/soins strictement borné | **PASS** | `pas d'état au-delà de REÇU tant que le transport n'est pas arrivé` + `seuls sent/received sont couplés, refus et annulation n'affirment rien` (9 combinaisons `checkCoupling`) |
| **G.** Informations complémentaires demandées | **PASS** | `le centre redemande, le CSPS fournit, le dossier repart` — état `Informations complémentaires demandées`, CSPS lit mais **ne peut pas répondre à la place du centre**, puis reprise |
| **H.** Brouillon local, non transmis tant qu'il n'est pas soumis | **PASS** | `pas de transport sur DRAFT, puis soumission normale` — zéro livraison sur le brouillon, `submitDraft` crée la livraison, arrivée au centre, entrée au journal |
| **I.** Isolation entre établissements et hors dispositif | **PASS** | `un autre CSPS, un citoyen et l'opérateur hors dossier ne lisent rien` — émetteur lu, `agent_csps2` et citoyen refusés, liste filtrée vide pour l'autre CSPS |
| **J.** Responsable du CSPS vs agent de santé | **PASS** | `gestion, statistiques et annuaire réservés au responsable` — `org.members.manage`, `stats.read`, `audit.read` au responsable ; agent : `care.create` et `directory.read` oui, gestion/stats non |
| **K.** Disponibilité déclarée du centre (jamais mesurée) | **PASS** | `mise à jour pour soi, refus pour autrui, journalisée` — `limited` + note enregistrés, autre établissement inchangé (droit org-scopé), journalisé |
| **L.** Perte de réseau : attente, reprise, aucun doublon | **PASS** | `dossier bloqué puis reçu après rétablissement, un seul exemplaire` — liens coupés → statut bloqué à `sent` (jamais reçu), rétablissement → `received`, 1 seul dossier, 1 seul événement `delivered` |
| **M.** Alerte du CSPS catégorisée par le Hub (7 catégories) | **PASS** | `7 catégories sanitaires, catégorisation et accusé par l'opérateur` — 7 catégories + libellés présents, transport livré, agent refusé en `hub.categorize`, opérateur catégorise et accuse |

**13 scénarios sur 13 : PASS** (16 tests, section 4).

---

## 4. Résultats des tests (sorties réelles, collées telles quelles)

### Dernière exécution complète

```
$ npm run typecheck
> tsc --noEmit

$ npm test
 ✓ src/tests/engine.test.ts (13 tests) 18ms
 ✓ src/tests/user.test.ts (6 tests) 82ms
 ✓ src/tests/spaces.test.tsx (11 tests) 254ms
 ✓ src/tests/businessScenarios.test.ts (13 tests) 447ms
 ✓ src/tests/cspScenarios.test.ts (16 tests) 549ms
 ✓ src/tests/scenarios.test.ts (11 tests) 18ms
 ✓ src/tests/policy.test.ts (25 tests) 13ms
 ✓ src/tests/console.test.tsx (6 tests) 511ms
 ✓ src/tests/seed.test.ts (5 tests) 759ms
 ✓ src/tests/hubRelay.test.ts (7 tests) 11ms
 ✓ src/tests/alert.test.ts (4 tests) 6ms
 ✓ src/tests/messaging.test.ts (14 tests) 9ms
 ✓ src/tests/delivery.test.ts (10 tests) 10ms
 ✓ src/tests/care.test.ts (12 tests) 10ms
 ✓ src/tests/routing.test.ts (9 tests) 11ms
 ✓ src/tests/org.test.ts (7 tests) 12ms
 ✓ src/tests/crypto.test.ts (5 tests) 28ms
 ✓ src/tests/security.test.ts (7 tests) 27ms
 ✓ src/tests/permissions.test.ts (6 tests) 10ms

 Test Files  19 passed (19)
      Tests  187 passed (187)
   Start at  09:27:11
   Duration  2.85s (transform 1.12s, setup 1.03s, collect 2.78s, tests 2.78s, environment 6.50s, prepare 1.36s)

$ npm run build
dist/assets/index-DJhWGkSO.js   414.37 kB │ gzip: 123.36 kB
✓ built in 1.61s
```

**19 fichiers / 187 tests / 0 échec** : 171 tests d'origine (inchangés) +
16 tests des scénarios CSPS.

### Répartition

| Bloc | Tests | État |
|---|---|---|
| D'origine (mesh, delivery, routing, relais, console, politique, soins, sécurité…) | 171 | verts, inchangés |
| Scénarios CSPS A → M (nouveaux) | 16 | verts |
| **Total** | **187** | **0 échec** |

---

## 5. Fonctionnalités : implémenté / simulé / seulement prévu

| Fonctionnalité | État | Détail |
|---|---|---|
| Ouverture, soumission, brouillon d'une demande | **Implémenté** | 3 volets, validation par priorité, `DRAFT → SUBMITTED` local |
| Machine sanitaire 13 états + machine de transport 7 états | **Implémenté** | Indépendantes ; couplage borné à `sent`/`received` |
| Refus / annulation motivés, clôture | **Implémenté** | Justification obligatoire, états terminaux figés |
| Double suivi sanitaire + transport sur la fiche | **Implémenté** | Route transport affichée à côté de l'état sanitaire |
| Orientation d'une demande par le Hub | **Implémenté** | `orientRequest`, événement tracé, notification |
| Disponibilité et moyens du centre | **Implémenté (déclaré)** | Édition org-scopée dans l'annuaire ; **jamais mesuré** |
| Annuaire des établissements | **Implémenté (déclaré)** | Orgs enrichies : région, district, localité, adresse, services, nœud |
| Rapports + indicateurs + export CSV | **Implémenté** | Périodes 24 h / 7 j / tout ; export **local**, aucun envoi |
| Journal d'activité (audit) | **Implémenté** | Écrit par le store, lu par `audit.read` (responsable, admin, Hub) |
| Notifications de type soins | **Implémenté** | Sur chaque action, avec lien direct au dossier |
| 7 catégories d'alerte | **Implémenté** | Urgence médicale, évacuation, incident sanitaire, indisponibilité de service, renfort, incident logistique, alerte technique (+ 3 catégories historiques conservées) |
| Acheminement Mesh (routage, files, pertes, retransmissions, accusés) | **Simulé** | Moteur de simulation, aucun matériel radio |
| Disponibilité des services | **Simulé / déclaré** | Saisi par l'établissement, jamais mesuré |
| Multi-appareils / multi-utilisateurs réels | **Seulement prévu** | Nécessiterait un serveur — jamais simulé, jamais prétendu |

---

## 6. Écarts par rapport au cahier des charges

| Attendu | Écart | Justification |
|---|---|---|
| Éventuellement : nouveaux nœuds pour chaque établissement | **Nœuds figés à 13** | Test intangible `seed.test.ts` (`nodes.length === 13`) ; règle « ne pas affaiblir les tests » prioritaire. Les établissements sans simulateur ont `nodeId: null` (« non simulé »), affiché comme tel |
| Espaces citoyens / ONG / familles | **Conservés, ni étendus ni développés** | Tests civils intangibles (règle 4) ; volontairement hors périmètre |
| Catégories d'alerte | **7 sanitaires + 3 historiques conservées** | Ajouter sans supprimer : `security`, `weather`, `other` restent pour ne pas casser les usages et tests existants |
| Rôle « responsable » | Ajouté comme `health_manager` (rôle existant du catalogue) plutôt que nouveau rôle | Réutilise le rôle déjà présent dans `Role`, évite de toucher au catalogue civil |
| Lecture d'un dossier par l'émetteur | **Correction** : `evaluate.ts` jugeait la propriété aussi sur `targetOrgId` — le CSPS émetteur ne voyait plus son propre dossier | Corrigé en phase scénarios ; les refus par organisation d'origine et par destinataire non adressé sont inchangés (tests `policy.test.ts` intacts) |

---

## 7. Limites assumées

- **Démonstration, pas un outil de soin** : aucune donnée médicale réelle, aucune
  fonction de diagnostic, **aucun dispositif médical certifié**, aucun
  enregistrement réglementaire.
- **Aucune radio, aucun réseau externe** : tout est calculé dans le navigateur ;
  le « transport » est un moteur de simulation ; **aucun appel réseau externe**.
- **Réception ≠ acceptation**, **disponibilité ≠ mesure**, **Hub ≠ passage
  obligatoire** : ces trois garanties sont affichées à l'écran et testées.
- **Sécurité** : comptes et mots de passe locaux, aucune vérification serveur ;
  la couche de politique démontre une logique d'autorisation, pas une protection
  contre un utilisateur qui modifie les données de l'appareil.
- **Annuaire** : établissements déclarés dans le jeu de démonstration, pas un
  référentiel officiel.
- **Périmètre** : 3 acteurs seulement (CSPS, centre de référence, Hub) ; les
  espaces civils restent en place uniquement pour ne supprimer aucun test.

---

## 8. Ce qui n'est PAS terminé

1. **Vérification visuelle dans un navigateur** : le rendu n'a jamais été
   regardé à l'écran — il n'y a pas de navigateur automatisé dans l'environnement
   d'exécution. Seuls `tsc`, `vitest` et `vite build` ont été exécutés.
2. **Test CSV automatisé** : l'export CSV est exercé à la main dans l'écran
   Rapports ; aucun test ne simule le téléchargement (jsdom n'implémente pas
   `URL.createObjectURL` de façon fiable).
3. **Multi-appareils réel** : nécessiterait un serveur et du matériel — hors
   périmètre, jamais simulé.
4. **Contribuer à l'écran des membres** (`org.members.manage`) : le droit existe
   et est testé en politique (scénario J), la gestion s'effectue depuis
   Administration ; aucun écran dédié « équipe du CSPS » n'a été ajouté.
5. **Écriture des constantes par lot / rappels automatiques** : non demandé,
   non implémenté.

### Reproductibilité

```bash
npm install
npm run typecheck && npm test && npm run build   # tsc 0 · 187/187 · build OK
npx vitest run src/tests/cspScenarios.test.ts    # scénarios A → M seuls
```
