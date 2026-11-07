# FasoMesh Shield — Rapport technique (version finale)

Application React / TypeScript / Vite / Zustand. **Aucune dépendance lourde
ajoutée, aucun appel réseau externe, aucune radio** : le moteur Mesh est une
simulation pure dans le navigateur.

## 1. Architecture en couches

```
UI (src/ui)  →  Store Zustand (src/app)  →  Domaine (src/domain)
                                             ↓
              Politique (src/policy) · Services (src/services)
                                             ↓
              Moteur Mesh (src/mesh) · Simulation (src/sim)
                                             ↓
              Infrastructure (src/infra : crypto, persistance, seed)
```

L'UI n'invente jamais un statut : elle ne fait que réagir aux actions du store,
lesquelles passent par le domaine (machine à états), la politique (droits) et
le moteur (transport).

| Dossier | Rôle |
|---|---|
| `src/mesh` | Moteur de simulation Mesh : graphe, routes, files, pertes, retransmissions, accusés, relais, repli de stockage au Hub |
| `src/domain` | Règles pures : machines à états (`care`, `delivery`), utilisateurs, messages, alertes, rapports CSV |
| `src/policy` | Catalogue des permissions, évaluation pure (`evaluate`), assurage (`assertCan`), journal d'accès |
| `src/services` | Câblage : `care` (couplage transport/soins), `messaging` (autorisation sortante, reprise) |
| `src/app/store.ts` | État applicatif + actions + persistance différée |
| `src/infra` | Chiffrement (Web Crypto), persistance (IndexedDB + repli localStorage), jeu de démonstration |
| `src/ui` | Écrans, composants, navigation construite depuis la politique |

## 2. Les trois espaces

| Espace | Route | Porte d'entrée (politique) |
|---|---|---|
| CSPS | `/app`, `/app/care`, `/app/care/new`, `/app/care/:id`, `/app/team` | `care.create` / `care.readOrg` / `stats.read` / `org.members.manage` |
| Centre de référence | `/app/centre` (+ `/app/care`) | Sonde `canOpenInbox` pour l'affichage, `care.readInbox` par dossier pour les données |
| Hub | `/app/hub` | `hub.alert.read` (lecture), `hub.categorize` / `hub.stats` / `journal.read` pour les fonctions |

**Détail important (corrigé en vérification navigateur)** : `care.readInbox` et
`care.respond` sont des actions d'**adresse** — évaluées *sans ressource*, la
politique les refuse toujours (aucune destination à juger). Le menu et l'écran
Centre utilisent donc `canOpenInbox()`, une sonde explicite qui évalue le droit
avec un dossier **hypothétique adressé à l'organisation active**. Cette sonde ne
sert qu'à l'affichage : chaque opération réelle passe par `assertCan` avec la
vraie ressource.

## 3. Séparation stricte des états (§5)

| État sanitaire (13) | État technique (8) |
|---|---|
| brouillon, créée, transmise au réseau, reçue par le centre, accusée, informations demandées, acceptée, refusée, transfert préparé, en cours d'évacuation, arrivée, clôturée, annulée | draft, created, accepted_local, routing, delivered, unconfirmed, failed, queued |

- Machines à états **indépendantes** (`CARE_TRANSITIONS`, `delivery`).
- **Couplage borné** : seuls `sent → accepted_local` et `received → delivered`
  sont couplés. `refusé`, `annulé`, `brouillon` ne prétendent **rien** pour le
  transport (test `checkCoupling` : 9 combinaisons).
- **Réception technique ≠ acceptation** : la réception ne déclenche jamais
  d'état de soin ; toute décision est un acteur humain autorisé, signé et daté.

## 4. Politique et sécurité (§7)

- `evaluate()` : rôle actif = rôles de l'utilisateur + rôle dans l'organisation
  **active** ; vérifie contexte, propriétaire, périmètre organisationnel,
  partages explicites (`SharedGrant`).
- Trois familles : `SELF_ACTIONS` (propriétaire), `ORG_ACTIONS` (organisation),
  `INBOX_ACTIONS` (adresse : la ressource vient d'ailleurs mais m'est adressée).
- **Assurage dans la fonction métier** : `assertCan` est appelé dans
  `createCareRequest`, `submitDraft`, `careAction`, `careReply`,
  `sendInstruction`, `setOrgAvailability`, `orientRequest`, `setAlertCategory`,
  `addOrgMember`, `setMemberRole`, `removeOrgMember`, `grantShared`,
  `sendMessage`… L'interface ne fait que refléter le droit.
- Isolation : un CSPS ne lit pas les dossiers d'un autre CSPS ; le centre ne
  lit que ce qui lui est adressé ; le Hub n'accède qu'à ce que ses missions
  demandent (alertes, orientation, files, supervision, journaux).
- **Audit** : chaque acte (dossier, disponibilité, équipe, orientation,
  catégorisation) produit une entrée ; l'administration voit aussi les accès
  refusés (journal d'accès `accessLog`).
- **Non nominatif** : aucun champ de nom de patient ; référence
  `DOS-AAAA-NNNN` ; vérifié par test sur la sérialisation et sur l'export CSV.
- **Crypto** : mot de passe haché (salt + PBKDF2 via Web Crypto), contenu
  chiffré AES-GCM ; contexte non sécurisé → **écran d'erreur bloquant**, jamais
  de traitement en clair.
- **Persistance** : IndexedDB avec repli localStorage ; clé `seedVersion` qui
  remplace un jeu obsolète ; test de rechargement complet.

## 5. Résilience Mesh (§6) — comportements vérifiés

| Comportement | Où c'est vérifié |
|---|---|
| Route directe CSPS → centre quand elle existe | `routing`, `delivery`, `finalisation` (§9.14) |
| Multi-saut quand la route directe n'existe pas | `routing`, `engine`, fiche dossier (affichage des sauts) |
| Hub comme relais uniquement si nécessaire | `hubRelay` (mode relais / terminus, nœud exclu) |
| Conservation sans route, reprise après rétablissement | `cspScenarios` L, `delivery` |
| Aucun doublon après reprise | `cspScenarios` L (1 seul dossier, 1 seul événement livré) |
| Traçabilité des tentatives et accusés | fiche dossier (tentatives, sauts, événements), `Track` |
| Continuité quand le Hub est coupé | `finalisation` §9.14 (aucun saut par `node-hub`) |

## 6. Interface (§8)

- **Ordinateur** : barre latérale (navigation, contexte, compte, déconnexion),
  conteneurs larges (`max-w-6xl` pour le tableau de bord et les rapports).
- **Téléphone** : colonne centrée, barre d'onglets fixe en bas (défilement
  horizontal si nécessaire), cibles tactiles ≥ 44 px.
- Menu et actions **construits depuis la politique** : une fonction non autorisée
  n'apparaît pas.
- Confirmations avant les actions irréversibles (refus, clôture, annulation,
  retrait d'équipe).
- Bandeau « Démonstration simulée » sur **tous** les écrans.

## 7. Tests

- 20 fichiers, **196 tests**, 0 échec ; 171 tests de régression d'origine
  intacts.
- Aucun mock dans les scénarios : store → politique → services → moteur →
  machines à états, en chaîne réelle.
- Vérification visuelle automatisée (`tools/visual-check.mjs`) : 16 captures
  Chromium, 0 erreur console, 0 débordement horizontal. Détail dans
  `docs/RAPPORT_TESTS.md`.

## 8. Écarts par rapport au cahier des charges

| Attendu | Écart | Justification |
|---|---|---|
| Retirer les espaces civils | Retirés des menus, routes et parcours ; **code et tests conservés** | Règle « ne pas supprimer ni affaiblir les tests de régression » |
| 13 nœuds Mesh | Aucun nœud ajouté | Test intangible `seed.test.ts` (nœuds figés) ; établissements sans simulateur affichés « non simulé » |
| Espaces citoyens / ONG | Ni développés ni étendus | Hors périmètre assumé |
| Écran des membres | Espace Équipe dédié (`/app/team`) | Plus cohérent qu'un écran dans Administration ; droit `org.members.manage` inchangé |
| Hospitalier | Traité comme centre de référence | §2B : pas d'espace hospitalier indépendant |

## 9. Limites techniques assumées

- Pas de serveur : la sécurité de démonstration est **locale** (un utilisateur
  qui modifie son appareil contourne la politique).
- Simulation Mesh : les pertes, latences et batteries sont des hypothèses de
  modèle (`src/core/modelAssumptions.ts`), jamais des mesures.
- Un seul appareil : le chiffrage de bout en bout est démontré unitairement,
  pas entre pairs réels.
- La console `/supervision` est un outil de démonstration réseau, sans
  authentification serveur.

## 10. Reproductibilité

```bash
npm ci
npm run typecheck && npm test && npm run build   # tsc 0 · 196/196 · build OK
npm run dev                                      # http://localhost:3000
npx vitest run src/tests/cspScenarios.test.ts    # scénarios A → M
node tools/visual-check.mjs                      # 16 captures (nécessite Playwright)
```
