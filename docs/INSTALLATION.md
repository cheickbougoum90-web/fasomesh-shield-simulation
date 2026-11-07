# FasoMesh Shield — Installation et lancement

Application de **démonstration** de coordination sanitaire centrée sur le CSPS.
**Aucune donnée réelle, aucun serveur, aucune transmission radio** : tout est
simulé dans le navigateur. Aucun dispositif médical certifié.

## 1. Prérequis

- **Node.js 18 ou plus récent** (`node --version`)
- npm (fourni avec Node)
- Un navigateur récent : Chrome / Edge / Firefox / Safari

Aucune autre dépendance système n'est nécessaire.

## 2. Installation

```bash
# 1. Décompresser l'archive puis entrer dans le dossier
unzip fasomesh-shield-csps-final.zip
cd fasomesh-shield-csps

# 2. Installer les dépendances (à faire UNE fois)
npm ci          # ou : npm install
```

## 3. Lancement

```bash
npm run dev
# → http://localhost:3000   (Vite affiche l'URL exacte au démarrage)
```

Build de production (optionnel) :

```bash
npm run build      # vérifie le typage puis produit dist/
npm run preview    # sert le build de production
```

## 4. Vérifications automatiques

```bash
npm run typecheck   # 0 erreur TypeScript
npm test            # 20 fichiers · 196 tests · aucun échec
```

Test ciblé des scénarios CSPS (A → M) :

```bash
npx vitest run src/tests/cspScenarios.test.ts
```

## 5. Comptes de démonstration

**Mot de passe commun : `fasomesh`** (constante `DEMO_PASSWORD`,
`src/infra/crypto.ts`). L'écran de connexion les liste et les remplit au clic.

### Dispositif sanitaire (les 3 espaces + administration)

| Identifiant | Espace | Établissement (contexte) | Nœud simulé |
|---|---|---|---|
| `responsable_csps` | CSPS | CSPS de Kongou — Responsable | phone-mariam |
| `agent_csps` | CSPS | CSPS de Kongou — Agent de santé | phone-mariam |
| `agent_csps2` | CSPS | CSPS de Daboya — Agent de santé | phone-ong-2 |
| `agent_centre_reference` | Centre de référence | Centre de référence de Banfora | phone-centre |
| `agent_hopital` | Centre de référence | Hôpital régional de Bobo | phone-hopital |
| `operateur_hub` | Hub | Hub Central — Opérateur | node-hub |
| `administrateur` | Administration | Administration du réseau | phone-admin |
| `multi_roles` | CSPS + Hub | CSPS de Kongou et Hub Central | phone-admin |

> `multi_roles` cumule les rôles : il permet de démontrer le **changement de
> contexte** et que chaque contexte ne donne que SES droits.

### Conservés de la plateforme civile, hors périmètre de cette version

`citoyen1`, `citoyen2`, `agent_ong`, `coordinateur_ong` : leurs espaces ne sont
**plus proposés** dans l'interface (menus, routes et inscription retirés) ; ces
comptes et leurs tests restent en place uniquement pour ne supprimer aucun test
de régression.

### Établissements du dispositif

| Établissement | Localité | Disponibilité déclarée | Nœud simulé |
|---|---|---|---|
| CSPS de Kongou | Kongou (Cascades) | Disponible | phone-mariam |
| CSPS de Daboya | Daboya (Boucle du Mouhoun) | Capacité limitée | non simulé |
| CSPS de Loropéni | Loropéni (Cascades) | Disponible | non simulé |
| Centre de référence de Banfora | Banfora (Cascades) | Disponible | phone-centre |
| Centre de référence de Dédougou | Dédougou (Boucle du Mouhoun) | Capacité limitée | non simulé |
| Hôpital régional de Bobo | Bobo-Dioulasso | Disponible | phone-hopital |
| Hub Central | Ouagadougou | — | node-hub |

Ces disponibilités sont **déclarées pour la démonstration, jamais mesurées**.
L'hôpital régional est traité **comme un centre de référence** : mêmes droits,
même espace — il n'existe pas d'espace hospitalier indépendant.

## 6. Données et réinitialisation

- Toutes les données vivent **dans l'appareil** (IndexedDB, avec repli
  localStorage). Aucun compte, aucun mot de passe et aucune donnée ne quittent
  le navigateur ; il n'y a aucun appel réseau externe.
- **Profil → Réinitialiser la démonstration** recharge le jeu de démonstration.
- La clé `seedVersion` remplace automatiquement un jeu obsolète au démarrage.
- En contexte non sécurisé (http:// hors localhost), l'application **s'arrête**
  sur un écran d'erreur : jamais de traitement en clair.

## 7. Vérification visuelle automatisée (optionnelle)

```bash
npm run dev                       # dans un premier terminal
npm i --no-save playwright
npx playwright install chromium
node tools/visual-check.mjs       # 16 captures, ordinateur + téléphone
```

Les captures obtenues lors de la vérification de cette version sont livrées
dans `artifacts/screens/` (16 images, 0 erreur console, 0 débordement
horizontal).

## 8. Limites techniques assumées

- Comptes et mots de passe **locaux** : aucune vérification serveur ; la
  couche de politique démontre une logique d'autorisation, elle ne protège pas
  contre un utilisateur qui modifie les données de son appareil.
- Simulation Mesh : routage, pertes, retransmissions et accusés sont calculés ;
  **aucun équipement radio n'émet**.
- La limite de tentatives de connexion (5 essais / 60 s) est une démonstration
  locale, pas un service de compte.
