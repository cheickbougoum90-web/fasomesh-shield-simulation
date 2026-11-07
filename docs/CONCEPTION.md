# FasoMesh Shield — Note de conception (Phase 0)

> Document de travail rédigé **avant toute modification de code**, conformément à la
> méthode « Phase 0 : audit et note de conception ».
> Ce document recense les contradictions, ambiguïtés et exigences problématiques du
> cahier des charges, la décision prise pour chacune, l'architecture cible, le découpage
> en phases et ce qui est différé ou simplifié.

---

## 1. Audit de l'état initial

### 1.1 État du dépôt (avant tout commit)

```
$ git status --short
?? dev.log
?? dist/
?? fasomesh-shield.zip
?? index.html
?? node_modules/
?? package-lock.json
?? package.json
?? src/
?? tsconfig.json
?? vite.config.ts

$ git log --oneline
7ac841c Import cloud project files
8c23a00 Initial cloud project
```

**Situation** : le dépôt Git ne contient que les fichiers initiaux du projet cloud ;
**tout le travail des deux missions précédentes était non suivi (untracked)**.
Aucun stash, aucune branche concurrente, aucun `.gitignore`, aucun fichier `.env`,
aucune clé ou secret détecté (`git status --porcelain | grep -Ei "\.env|secret|\.pem|\.key"` → rien).

**Action prise** :
1. Création d'un `.gitignore` (`node_modules/`, `dist/`, `dev.log`, `*.zip`) — pour ne
   jamais committer des artefacts générés ni l'archive de livraison ;
2. identité Git configurée **au niveau du dépôt uniquement** (`Freebuff <cloud@freebuff.local>`),
   identique à celle des deux commits existants — aucune configuration globale modifiée ;
3. `git add -A` → **70 fichiers indexés, aucun secret** ;
4. commit initial `abc3c3f` « État initial : FasoMesh Shield (app civile + console de supervision) ».

Aucun travail existant n'a été supprimé, écrasé ou réinitialisé.

### 1.2 Tests, typage et compilation de référence (réelslement exécutés)

```
$ npm run typecheck
> fasomesh-shield@0.1.0 typecheck
> tsc --noEmit
EXIT_TSC=0
```

```
$ npm test
> vitest run
 RUN  v3.2.7 /workspace/chats/830e86743377a015791d649a

 ✓ src/tests/console.test.tsx (6 tests) 378ms
 ✓ src/tests/user.test.ts (6 tests) 78ms
 ✓ src/tests/engine.test.ts (13 tests) 29ms
 ✓ src/tests/scenarios.test.ts (11 tests) 16ms
 ✓ src/tests/delivery.test.ts (10 tests) 9ms
 ✓ src/tests/routing.test.ts (9 tests) 10ms
 ✓ src/tests/permissions.test.ts (6 tests) 12ms
 ✓ src/tests/alert.test.ts (4 tests) 5ms
 ✓ src/tests/crypto.test.ts (5 tests) 28ms

 Test Files  9 passed (9)
      Tests  70 passed (70)
   Duration  6.40s
EXIT_TEST=0
```

```
$ npm run build
> tsc --noEmit && vite build
dist/index.html                   0.68 kB │ gzip:  0.40 kB
dist/assets/index-B9msV7_0.css   42.70 kB │ gzip:  8.53 kB
dist/assets/index-CVpBjlzh.js   317.28 kB │ gzip: 96.94 kB
✓ built in 1.70s
EXIT_BUILD=0
```

**Référence de départ : tsc 0 erreur · 70/70 tests verts · build OK.**
C'est cette barre que chaque phase doit conserver.

---

## 2. Architecture existante (ce qui est conservé)

```
src/core/      types du domaine, RNG à graine, base64          — conservé, étendu
src/domain/    delivery (machine à états), user, message,
               alert, permissions (matrice legacy)              — conservé, étendu
src/mesh/      engine (831 l.), routing (Dijkstra pondéré),
               graph, seed (8 nœuds, 12 liens)                 — CONSERVÉ TEL QUEL
src/sim/       types, refs, activité, métriques, 7 scénarios    — conservé tel quel
src/infra/     crypto (AES-GCM/PBKDF2), persistence (IndexedDB
               + replis), seedData (4 comptes)                  — conservé, durci
src/app/       store Zustand (930 l.), hooks, boucle rAF        — conservé, étendu
src/ui/        thème, composants, 15 écrans, console NOC        — conservé, étendu
src/tests/     9 fichiers, 70 tests                             — intangibles
```

### Principes d'architecture déjà établis (à ne pas casser)

| Principe | Où il est tenu |
|---|---|
| Aucun statut « reçu » fabriqué par l'UI | `domain/delivery.transition()` refuse les transitions illégal­es (throw) |
| Moteur unique, séparé des interfaces | `MeshEngine` (bus `submit/advance`, événements typés) |
| La simulation n'est jamais présentée comme du réel | bannières `SIMULÉ`, libellés `STATUS_HELP` |
| Déterminisme testable | graine `SIMULATION_SEED`, horloge de simulation ≠ horloge murale |
| Matrice de permissions testable indépendamment de React | `domain/permissions.ts` (pur) |

### Points faibles relevés par l'audit (à corriger dans ce projet)

1. **Repli silencieux en clair** : `infra/crypto.hashPassword()` renvoie `insecure:${password}`
   si `crypto.subtle` est absent, et `encryptText()` renvoie `null` → le corps du message est
   alors stocké **en clair sans avertissement**. C'est exactement l'interdiction de la §9.
2. **Seulement 2 rôles** (`citizen`, `operator`) alors que le cahier des charges en demande 9.
3. **Pas d'organisation** : ni appartenance, ni isolation, ni contexte actif.
4. **Un seul message par envoi**, pas de type ni de politique de confidentialité.
5. **Pas de suivi de soin** : seul existe le transport (statut d'acheminement).
6. **Les files d'attente moteur ne survivent pas au redémarrage** : `boot()` réapplique le
   graphe mais ne rejoue **pas** les livraisons restées `queued` → perte simulée après rechargement.
7. **Aucune limitation des tentatives de connexion.**
8. **L'écran d'aide promet implicitement de la résilience** (formulations à reprendre, §9).
9. **Les valeurs inventées sont dispersées** dans `engine.TIMING`, `routing`, `seed`,
   `store.attachPhoneNode`, `crypto.ITERATIONS` — alors que la §9 exige un fichier unique
   « hypothèses du modèle ».

---

## 3. Contradictions, ambiguïtés et exigences problématiques

Pour chacune : le problème, la décision, la justification.

### 3.1 « 9 rôles » vs rôles existants + tests intangibles
**Problème.** `permissions.test.ts` (6 tests) exige : matrice legacy à 2 rôles, libellés
`ROLE_LABEL.citizen/operator`, et une **différence exacte** entre `operator` et `citizen`
(= exactement `network.toggleNode`, `network.toggleHub`, `sim.control`). Le cahier des charges
demande 9 rôles et des permissions granulaires, ce qui ferait exploser cette matrice.

**Décision.** Deux couches, une seule source de vérité par action :
- `domain/permissions.ts` (**legacy**) est **gelé** — ni action, ni rôle ajoutés, pour ne pas
  modifier les 6 tests existants ;
- nouvelle couche `src/policy/` : catalogue de permissions granulaires, évaluation
  `can(actor, action, resource)` **sans React**, qui **délègue** les anciennes actions à
  l'ancienne matrice via `can()` legacy. Il n'y a donc pas deux vérités concurrentes :
  le legacy est la référence pour les 10 anciennes actions, `policy` l'étend aux nouvelles.

**Justification.** Règle 2 du brief : les tests existants ne sont ni supprimés ni affaiblis.
Un test ne change pas ; l'écart (deux couches coexistantes temporairement) est assumé et
documenté plutôt qu'une rupture silencieuse.

### 3.2 « Un compte peut cumuler plusieurs rôles » vs `User.role: Role` (singulier)
**Problème.** Le type `User` et `createUser()` (utilisés par `user.test.ts`) portent un rôle unique.

**Décision.** `User.roles: Role[]` devient la source de vérité ; `User.role` est conservé
comme **rôle principal dérivé** (`roles[0]`) pour la compatibilité. `createUser()` accepte un
rôle ou une liste et remplit les deux champs.

**Justification.** Aucune signature de test cassée, aucune donnée persistée perdue.

### 3.3 Plusieurs utilisateurs dans UN navigateur, sans serveur
**Problème.** Un onglet = une session. Or les scénarios H (refus citoyen), E (ONG ↔ ONG),
J (groupe familial) exigent d'agir **au nom de** plusieurs acteurs.

**Décision.**
- **Toutes les fonctions métier prennent `actorId` de façon explicite** et ne lisent jamais
  implicitement la session. Les tests appellent les services avec n'importe quel acteur ;
- pour la démonstration : **bascule de session locale** (choix du compte sur le même appareil),
  étiquetée « simulation multi-comptes » — présentée comme une simulation de plusieurs
  utilisateurs, **jamais** comme une communication entre appareils réels ;
- **Addendum §1** respecté : trois libellés distincts dans l'UI et la doc —
  (a) simulation de plusieurs utilisateurs, (b) simulation de plusieurs nœuds,
  (c) communication réellement possible entre appareils (= **absente**, non implémentée,
  nécessiterait serveur + matériel).

**Justification.** C'est la seule façon de tester l'autorisation **sans passer par l'interface**
(cf. §« Définition de terminé ») dans un navigateur unique.

### 3.4 « Le Hub ne reçoit que les messages qui lui sont adressés » vs transit technique
**Problème.** Le moteur route par le Hub comme relais ; le Hub est donc destinataire de
transits qu'il n'a pas demandés.

**Décision.** Distinction explicite et documentée :
- **destinataire** : le Hub reçoit effectivement le contenu (alertes adressées, demandes) ;
- **transit** : le Hub peut relayer une charge **chiffrée AES-GCM qu'il ne peut pas lire** ;
  les seules métadonnées visibles pour le transit sont la liste fermée : identifiant de
  livraison, identifiants de nœuds, horodatage, priorité, taille. Ces métadonnées sont
  regroupées dans un type `TransitMeta` et listées dans l'aide.
- **configure le rôle de relais** : option `hubRelayMode: 'relay' | 'terminus'` (§7 du brief,
  les deux modes doivent être testés) — en mode `terminus`, le Hub n'est jamais choisi comme
  saut intermédiaire.

### 3.5 Contradiction interne : « au moins une fois » + « exactement une fois » + « rien en cas d'absence définitive »
**Problème.** Ces trois exigences sont mutuellement exclusives sans hypothèse supplémentaire.

**Décision.**
- contrat de transport : **au moins une fois**, avec expiration configurable ;
- **déduplication au destinataire par `messageId` persistant** (le destinataire ignore un
  `messageId` déjà appliqué) → **effet exactement une fois** *si les deux extrémités vivent* ;
- en cas d'absence définitive de route ou d'expiration : état final `failed` **sans** promesse
  de remise — l'UI affiche l'échec, jamais un faux succès.

### 3.6 « Accusé pouvant emprunter un chemin de retour différent »
**Problème.** Le moteur modélise un trajet aller ; le retour d'accusé n'existe pas.

**Décision.** L'accusé de réception technique est un **second message** (destinataire → émetteur),
soumis aux mêmes règles du moteur (donc susceptible d'un trajet différent **et** d'un échec).
Conséquence assumée affichée : « reçu par le destinataire · accusé en attente » quand l'aller
réussit et pas le retour.

### 3.7 Statut de transport ≠ statut de soin (§4)
**Problème.** Le brief impose `CREATED → SENT → RECEIVED → ACKNOWLEDGED → ACCEPTED/REJECTED →
IN_PROGRESS → RESOLVED`, distinct du transport, et demande de définir la relation.

**Décision.** Deux machines à états séparées :
- `DeliveryStatus` (existant) = **acheminement technique** ;
- `CareStatus` (nouveau) = **prise en charge humaine, simulée**.
- **Invariant de couplage** (testé) : `CareStatus ≥ RECEIVED` **exige** `transport === 'delivered'`.
  En particulier `ACKNOWLEDGED`, `ACCEPTED`, `IN_PROGRESS`, `RESOLVED` ne sont **jamais**
  dérivés du transport : ce sont des actes d'un opérateur simulé. Une réception technique
  `delivered` seule laisse le soin à `SENT`.

### 3.8 §8 — Quelle source fait foi pour la connectivité ?
**Problème.** Le brief demande d'afficher distance géographique, portée théorique, qualité de
liaison, débit et délai, **sans** faire passer une valeur simulée pour une mesure. Le code
actuel n'a que des **liens déclarés** et des coordonnées SVG sans échelle.

**Décision.**
- **Les liens déclarés font foi** pour la connectivité (c'est le graphe du moteur) ;
- les coordonnées sont **schématiques** ; une **échelle hypothétique** unique est déclarée
  (1 unité SVG = 100 m) et utilisée **uniquement** pour afficher une distance relative ;
- **aucune portée n'influence la connectivité** : la « portée théorique » est un paramètre
  affiché à titre illustratif, étiqueté hypothèse ;
- les champs sont affichés **séparément** : `distance (schématique)`, `portée théorique
  (hypothèse)`, `qualité de liaison (simulée)`, `état de connexion (simulé)`, `débit/délai
  (simulés)`. Chaque ligne porte la mention « simulé » ou « hypothèse » ;
- toute mesure réelle exige des essais matériels : écrit noir sur blanc dans l'aide.

### 3.9 §9 — Valeurs inventées dispersées
**Décision.** Création de `src/core/modelAssumptions.ts` : **toutes** les constantes de
simulation (latences, pertes, batteries, tailles, délais, portées, échelle, TTL, itérations
PBKDF2, tentatives de connexion) y sont regroupées sous un en-tête `HYPOTHÈSES DU MODÈLE —
aucune n'est une mesure`, avec `{ valeur, origine, unité, mesurable }`. Les modules existants
réimportent ces constantes **sans changer les valeurs**, pour que les 70 tests restent verts.

### 3.10 §9 — Repli silencieux en clair (bug réel)
**Décision.** `hashPassword()` et `encryptText()` **échouent visiblement** quand Web Crypto est
absent : exception typée `CryptoUnavailableError` + bannière bloquante à l'écran, plus
d'envoi possible. Plus de `insecure:`, plus de corps en clair.
*Point de vigilance vérifié* : `tests/setup.ts` injecte `webcrypto` de Node, donc les tests
existants (crypto, user, delivery) continuent de tourner sur le vrai chiffrement.

### 3.11 §9 — Limitation des tentatives de connexion
**Décision.** Compteur local : **5 tentatives échouées → blocage 60 s** (affichage du temps
restant), remis à zéro à la connexion. Constante déclarée dans `modelAssumptions.ts`,
comportement testé. C'est une **démonstration**, pas une protection serveur : écrit comme tel.

### 3.12 §9 — Écran d'aide et libellés
**Décision.** Réécriture : « cette démonstration illustre la **logique de service** ; elle ne
prouve ni la résilience ni les performances d'un réseau radio réel » + paragraphe explicite :
« le calcul de route du simulateur **connaît tout le graphe** et détecte instantanément une
panne — un réseau réel ne le fait pas ». Ajout du tableau des trois niveaux
(interface / permissions métier / garanties cryptographiques).

### 3.13 Persistance des files et rechargement (§7)
**Problème.** `loadScenario`/`resetNetwork` ne touchent que graphe et journal (bon), mais
`boot()` ne rejoue **pas** les livraisons `queued` → « les files survivent au redémarrage »
n'est pas vérifié aujourd'hui.

**Décision.** Passe de reprise au boot : toutes les livraisons `queued`/`created` non expirées
sont **resoumises au moteur** avec leur `messageId` d'origine ; le destinataire déduplique.
Test dédié : persistance → réinitialisation du store → boot → aucune perte, aucun doublon.
Et test « changement de scénario n'altère pas les données applicatives ».

### 3.14 Ambiguïté : « centre de référence » vs « hôpital »
**Décision.** Types d'organisation distincts (`health_center`, `hospital`) partageant la même
workflow de boîte de réception triée (accepter / refuser motivé / demander des informations /
donner des instructions / signaler la disponibilité / clôturer). Hôpital = **P1** (le brief
le range explicitement dans P1).

### 3.15 Missions communes entre organisations (Addendum §3)
**Décision.** Mécanisme **`SharedGrant`** : `(resourceType, resourceId, targetOrgId, rights[], expiresAt)`,
créé explicitement par un coordinateur autorisé. Une organisation ne voit **que** les ressources
littéralement listées : pas d'accès auto aux conversations privées, aux membres ou aux données
internes de la partenaire. Test de refus inclus.

### 3.16 Pièces jointes / vocaux (§6, P2)
**Problème.** Fragmentation, retransmission et reconstruction **ne sont pas implémentées**.

**Décision.** **Différé en P2**, et si implémenté, présenté comme « démonstration simplifiée :
copie locale du fichier, aucun transfert maillé fragmenté ». Interdiction explicite de présenter
un transfert local comme une transmission Mesh complète. *Non fait dans ce projet si P0/P1
absorbent la charge* — reporté ici, à confirmer au rapport final.

### 3.17 Administrateur sans lecture des conversations privées (§2)
**Décision.** L'admin dispose de `account.read`, `account.write`, `org.manage`, `audit.read`,
`config.write` et **n'a pas** `message.readContent`. Test de refus explicite. Seules les
**métadonnées d'audit** (qui, quoi, quand — sans corps de message) lui sont visibles.

### 3.18 « Aucune nouvelle dépendance sans justification »
**Décision.** **Zéro dépendance ajoutée** : graphiques en SVG maison (déjà le cas), états en
types purs, tests avec Vitest déjà présent.

---

## 4. Architecture cible

### 4.1 Couches (dans l'ordre imposé par la §12)

```
src/core/        types partagés, RNG, base64, modelAssumptions (hypothèses du modèle)
src/policy/      catalogue de permissions + évaluation pure (aucune dépendance React)
                 actor, contexte actif, portée de ressource, journal d'accès
src/org/         organisations, appartenance (orgId, rôle), groupes (famille/équipe),
                 SharedGrant (missions communes)
src/domain/      delivery (inchangé), message (étendu), alert (étendu), care (nouveau),
                 user (étendu : roles[], memberships[])
src/services/    façades métier testables indépendamment de l'UI :
                 messaging, care, hub, admin, org
src/mesh/        MOTEUR UNIQUE (inchangé) — transport simulé pour tous les profils
src/sim/         supervision (inchangé)
src/infra/       crypto (durci, échec visible), persistence (étendu), seedData (multi-comptes)
src/app/         store : orchestration, chaque action appelle d'abord src/policy
src/ui/          shell par profil + écrans (les menus reflètent les droits, ils ne les créent pas)
src/tests/       70 tests existants intangibles + nouveaux tests
```

**Validation d'architecture imposée par l'Addendum §5** (à vérifier à chaque phase) :
- tous les profils passent par `src/services/` + `src/mesh/engine` — **aucun moteur par profil** ;
- isolation des données par organisation vérifiée par test de refus ;
- changement de contexte ⇒ données/permissions visibles réinitialisées (test) ;
- scénarios rejoués **après rechargement** quand la persistance est concernée (test).

### 4.2 Entités principales (nouvelles)

```
Organization { id, kind: health_center|hospital|ngo|hub|family|admin, name, ... }
Membership   { userId, orgId, role: OrgRole }              // rôle PAR organisation
Contexte     { orgId: string | null, role: OrgRole }       // actif, explicite
Group        { id, orgId?, kind: family|team, memberIds[] }
SharedGrant  { resourceType, resourceId, targetOrgId, rights[], expiresAt, grantedBy }
Message      + type (7 valeurs), orgId?, groupId?, confidentiality, receiptState
CareRequest  { id, caseRef (non nominatif), type, priority, status: CareStatus, ... }
```

### 4.3 Flux (uniquement)

```
UI → action du store → POLICY (refus ou accord, journalisé) → service → moteur Mesh
   → événements moteur → machine à états (delivery | care) → persistance → UI
```

L'UI ne crée jamais de droit ni de statut.

---

## 5. Découpage en phases et priorités

| Phase | Contenu | Priorité |
|---|---|---|
| **0** | Audit, `.gitignore`, commit initial, **cette note** | P0 |
| **1** | Fondations : `modelAssumptions`, rôles 9, `Organization`/`Membership`/`Contexte`, couche `policy` + tests de refus | P0 |
| **2** | Messagerie : 7 types de message, reçus (transport ≠ lecture), ACK retour, dédup, reprise au boot, `hubRelayMode` + tests | P0 |
| **3** | Alerte médicale : formulaire non nominatif + `CareRequest` (machine de soin couplée au transport) + tests | P0 |
| **4** | Espaces par profil : citoyen, agent CSPS, centre de référence, opérateur Hub, administrateur (routes, menus filtrés, tableaux de bord) | P0 |
| **5** | Corrections de dette technique (§9) + aide reformulée + comptes démo + `docs/DEMO.md` | P0 |
| **6** | Scénarios A, B, C, F, G, H, I (tests de bout en bout sur services) | P0 |
| **7** | ONG multi-organisations, hôpital, groupes familiaux, scénarios D, E, J, statistiques Hub | P1 |
| **8** | Pièces jointes/vocaux simplifiées, alertes publiques, rapports/documents | P2 |

Après **chaque** phase : `npm test`, `npm run typecheck`, `npm run build` avec sorties
réelles collées, puis un commit. Aucune phase ne passe avec un test échoué sans explication.

### Ce qui est différé ou simplifié (et pourquoi)

| Sujet | Statut | Raison |
|---|---|---|
| Pièces jointes, vocaux, rapports | **Différé (P2)** | fragmentation/reconstruction non implémentées ; un simple transfert local ne doit pas être présenté comme du Mesh |
| Chiffrement de bout en bout à clés individuelles | **Préparé, pas fait** | nécessite un échange de clés ; interface d'abstraction de clés introduite, implémentation reportée (Addendum §2) |
| Authentification de production | **Jamais revendiquée** | comptes locaux fictifs, mots de passe en clair dans l'IndexedDB de l'appareil |
| Communication réelle entre appareils | **Hors périmètre** | nécessite serveur + matériel ; signalée, jamais simulée |
| Serveur / backend | **Hors périmètre** | décision explicite du brief (application 100 % navigateur) |
| Mesures radio réelles | **Impossible** | aucun matériel ; toutes les valeurs sont des hypothèses |

---

## 6. Questions (3 maximum) — aucune posée pour l'instant

Aucune exigence n'est jugée **impossible** à ce stade. Les contradictions relevées (§3.5
contrat de livraison, §3.7 transport/soin, §3.8 connectivité) sont tranchées ci-dessus avec
justification et poursuivies sans attendre de validation, comme demandé.

---

*Prochaine étape : Phase 1 — fondations (hypothèses du modèle, rôles, organisations, contexte, politique).*
