# FasoMesh Shield — Données de démonstration

> **Ce document décrit des données FICTIVES.** Il n'existe aucun serveur, aucun
> compte réel et aucune transmission radio. Tout est calculé dans le navigateur.

## Lancer l'application

```bash
npm install
npm run dev        # http://localhost:3000
```

Vérifications : `npm test` (tests), `npm run typecheck` (typage), `npm run build` (compilation).

## Comptes (§10 du cahier des charges)

**Mot de passe commun : `fasomesh`** (constante `DEMO_PASSWORD`, `src/infra/crypto.ts`).
Ce ne sont pas des comptes de production : l'identité, les mots de passe et les
données vivent uniquement dans le stockage local de l'appareil (IndexedDB).

| Identifiant | Rôle global | Organisation (rôle) | Nœud rattaché |
|---|---|---|---|
| `citoyen1` | CITIZEN | Famille Traoré (citoyen) | phone-aminata |
| `citoyen2` | CITIZEN | Famille Traoré (citoyen) | phone-salif |
| `agent_csps` | CITIZEN | CSPS de Kongou (agent de santé) | phone-mariam |
| `agent_centre_reference` | CITIZEN | Centre de référence de Banfora (opérateur de centre) | phone-centre |
| `agent_hopital` | CITIZEN | Hôpital régional de Bobo (opérateur d'hôpital) | phone-hopital |
| `agent_ong` | CITIZEN | ONG Terre & Vie (agent de terrain) | phone-ong-1 |
| `coordinateur_ong` | CITIZEN | ONG Terre & Vie (coordinateur) | phone-ong-1 |
| `operateur_hub` | HUB_OPERATOR | Hub Central (opérateur) | node-hub |
| `administrateur` | CITIZEN | Administration du réseau (administrateur) | phone-admin |
| `multi_roles` | CITIZEN + SYSTEM_ADMIN | **ONG Solidarité Sahel (coordinateur)** et **CSPS de Kongou (agent de santé)** | phone-admin |

`multi_roles` est le compte **multi-rôles** du scénario I : deux organisations,
un rôle différent dans chacune, changement de contexte explicite.

### Organisations (8, indépendantes)

`org-famille` (famille) · `org-csps` · `org-centre` · `org-hopital` · `org-ong-1` ·
`org-ong-2` · `org-hub` · `org-admin`.

Les deux ONG n'ont **aucun membre en commun** : une organisation ne voit que ce
qui lui est partagé explicitement (`SharedGrant`).

### Groupes

- `Famille Traoré` (familial) : citoyen1, citoyen2 → scénario J.
- `Équipe terrain Nord` (équipe, ONG Terre & Vie) : coordinateur_ong, agent_ong → scénario D.

### Réseau simulé

13 nœuds / 17 liens : Hub + 4 relais + 8 postes. **Toutes les valeurs
(latences, pertes, batteries, portées, échelle) sont des hypothèses** regroupées
et étiquetées dans `src/core/modelAssumptions.ts`.

## Trois niveaux de simulation (à ne pas confondre)

| Niveau | Ce que c'est | Ce que ça n'est pas |
|---|---|---|
| Simulation de **plusieurs utilisateurs** | On change de compte sur le même appareil (aucun serveur) | Ce n'est pas une connexion multi-appareils |
| Simulation de **plusieurs nœuds Mesh** | Le moteur calcule routes, pertes et pannes | Aucun équipement radio n'émet |
| Communication **réellement possible entre appareils** | **NON IMPLÉMENTÉ** — nécessiterait un serveur et du matériel | Jamais simulée, jamais prétendue |

## Réjouer les scénarios

### En automatique (recommandé)

```bash
npx vitest run src/tests/businessScenarios.test.ts   # scénarios A, B, C, D, E, F, G, H, I, J
npx vitest run src/tests/hubRelay.test.ts            # deux modes de relais du Hub
npx vitest run src/tests/policy.test.ts              # refus et isolation (scénario H)
```

`docs/RAPPORT.md` donne la notation PASS / PARTIEL / FAIL de chaque scénario.

### A — Message citoyen → famille via plusieurs relais

1. Connexion `citoyen1` (contexte : Famille).
2. **Messages → Nouveau message** → destinataire `citoyen2` → envoyer.
3. Ouvrir le suivi du message : sauts affichés relais par relais, statut
   « Reçu par le destinataire » **uniquement** après accusé.

### B — Alerte critique citoyen → Hub, traitée par l'opérateur

1. `citoyen1` → **Alertes → Nouvelle alerte** → priorité *Critique*.
2. Déconnexion, connexion `operateur_hub` → onglet **Hub** : l'alerte y est,
   on la catégorise et on accuse réception.

### C — CSPS → centre de référence : demande, confirmation, réponse

1. Connexion `agent_csps`, contexte CSPS de Kongou.
2. **Soins → + Ouvrir un dossier** : type, priorité, description, localisation,
   destination = *Centre de référence de Banfora* (aucun nom de patient).
3. Connexion `agent_centre_reference` (contexte CR Banfora) → **Soins** :
   le dossier y arrive d'abord « Envoyé », puis « Reçue » quand le transport
   arrive ; **Accuser réception**, **Accepter**, **Mettre en traitement**,
   **Clôturer** (ou **Refuser** avec motif obligatoire).

### F — Panne du Hub

1. `operateur_hub` → **Réseau** → couper le Hub (ou console `/supervision`).
2. Un envoi `citoyen1` → `citoyen2` continue **si une route existe** ;
   un envoi destiné au Hub passe en « En attente de réseau ».
3. Rétablir : la file reprend sans doublon.

### G — Absence de route puis reprise sans doublon

1. Couper les liens qui isolent le destinataire (console `/supervision` :
   sélectionner un lien → *Couper*).
2. Envoyer : statut « En attente de réseau » (jamais « reçu »).
3. Rétablir : reprise automatique, **un seul exemplaire** du message (l'identifiant
   persistant sert de dédoublonnage).

### H — Un citoyen tente d'accéder aux demandes médicales d'un CSPS

Testé **directement sur la couche de politique** (sans interface) :
`npx vitest run src/tests/policy.test.ts` → « scénario H ». L'écran « Soins »
n'affiche d'ailleurs rien à `citoyen1`.

### I — Utilisateur multi-rôles : changement de contexte sans mélange

1. Connexion `multi_roles` : le sélecteur **Contexte** (haut d'écran) affiche
   *Solidarité Sahel*.
2. Vérifier les onglets visibles, puis basculer sur *CSPS Kongou* : les droits
   et les données visibles changent, aucun droit du contexte précédent ne subsiste.

### J — Message à un groupe familial

1. `citoyen1` → **Messages → Nouveau message** : le groupe *Famille Traoré*
   liste citoyen1 et citoyen2 ; chaque destinataire reçoit individuellement
   selon le réseau simulé.

## Réinitialiser

**Profil → Réinitialiser la démonstration** efface les données locales et
recharge ce jeu. La clé `seedVersion` garantit qu'un ancien jeu est remplacé
par le jeu courant au démarrage.

## Limites assumées

- **Aucune authentification de production** : comptes locaux, mots de passe
  locaux, aucune vérification serveur. La couche de politique démontre une
  logique d'autorisation, elle ne protège pas contre quelqu'un qui modifie le
  code ou les données de l'appareil.
- Si la Web Crypto n'est pas disponible (contexte non sécurisé), l'application
  **s'arrête sur un écran d'erreur** : plus aucun message en clair, plus
  d'empreinte de mot de passe de repli.
- La limite de tentatives de connexion (5 essais / 60 s) est une démonstration
  locale, pas un service de compte.
- Le calcul de route connaît **tout le graphe** et détecte instantanément une
  panne : un réseau réel ne le fait pas.
