# Guide utilisateur — Espace Centre de référence

> Démonstration simulée : la réception technique d'un dossier ne vaut **jamais**
> acceptation sanitaire. Chaque décision est un acte humain, daté et journalisé.

Comptes : `agent_centre_reference` (Centre de référence de Banfora),
`agent_hopital` (Hôpital régional de Bobo, traité comme centre de référence) —
mot de passe `fasomesh`.

## 1. Où je suis

Menu → **Centre** (« Espace Centre de référence »). Cette entrée n'apparaît que
pour les opérateurs d'un centre, avec un établissement sélectionné dans le
**contexte** (bandeau « Contexte » en haut sur téléphone, barre latérale sur
ordinateur).

L'écran **Demandes** reste accessible : c'est la liste générique des dossiers
qui me sont adressés ; l'espace **Centre** est le poste de travail spécialisé.

## 2. Boîte de réception

En haut : les compteurs **À traiter / Accusées / Refusées / Clôturées**, puis le
filtre par statut sanitaire.

Chaque carte de dossier montre :

- la référence (`DOS-2026-xxxx`), le type (référence, évacuation, avis), la
  catégorie et la priorité ;
- l'**origine** (CSPS émetteur) et le demandeur ;
- le **statut sanitaire** et l'état du **transport** (distincts) ;
- les actions réellement possibles depuis l'état actuel.

## 3. Les décisions (toujours humaines)

| Action | Condition | Effet |
|---|---|---|
| **Accuser réception** | dossier reçu | Statut « Accusée de réception » — simple prise de connaissance technique |
| **Accepter la prise en charge** | dossier accusé | Statut « Prise en charge acceptée » |
| **Refuser (motif obligatoire)** | dossier accusé | Motif **obligatoire**, dossier figé, CSPS notifié |
| **Demander des informations** | dossier accusé | Statut « Informations complémentaires demandées » + demande détaillée |
| **Préparer le transfert** | accepté | Statut « Transfert préparé » |
| **Mettre en route le transfert** | transfert préparé | Statut « En cours d'évacuation » |
| **Consigner l'arrivée** | évacuation en route | Statut « Arrivée au centre » |
| **Clôturer (compte rendu)** | transfert préparé ou arrivée | Compte rendu synthétique **obligatoire**, dossier terminal |

Une transition interdite par la machine à états est refusée avec un message
explicite : le dossier ne peut pas sauter d'étape.

## 4. Instructions au CSPS

Bouton **« Instructions au CSPS »** sur la carte du dossier : consignes de
préparation, escorte, horaire, point de rendez-vous… Le CSPS reçoit une
notification et voit vos instructions sur sa fiche. Vos instructions ne changent
pas l'état sanitaire.

## 5. Réponse du CSPS

Quand vous demandez des informations complémentaires, la réponse du CSPS
apparaît sur la carte (« Réponse du CSPS ») et dans la fiche. **Vous seul**
reprenez la main ensuite : le CSPS ne peut pas faire avancer votre état.

## 6. Fiche et historique

**Ouvrir la fiche et l'historique** affiche : double suivi (sanitaire +
technique, avec la route Mesh et le lien « Suivre le transfert pas à pas »),
identification, informations sanitaires, logistique, vos instructions, et
l'**historique complet** (date, auteur, étape, observations).

L'espace Centre se termine par son propre **Historique des décisions** : vos
actes horodatés et signés.

## 7. Disponibilité et annuaire

- **Annuaire** : les établissements déclarés, leurs services et leur
  disponibilité déclarée (jamais mesurée).
- **Profil → Établissement** : votre disponibilité et sa note (ex. « Équipe
  réduite le week-end ») sont modifiables et **journalisées**. Modifier un
  autre établissement est refusé.

## 8. Ce que je ne peux PAS faire

- Créer un dossier au nom d'un CSPS (droit réservé à l'établissement émetteur).
- Lire les dossiers d'un autre établissement qui ne me sont pas adressés.
- Modifier la disponibilité d'un autre établissement.
- Accéder à l'équipe d'un CSPS ou aux statistiques d'un autre établissement.

Ces refus sont appliqués **dans la couche de politique**, pas seulement dans
l'interface, et sont journalisés.

## Erreurs fréquentes

| Message | Cause | Que faire |
|---|---|---|
| « Refus de prise en charge : justification obligatoire » | Refus sans motif | Renseigner le motif |
| « Compte rendu de clôture obligatoire » | Clôture sans compte rendu | Renseigner le compte rendu |
| « Transition de soin illégale » | Étape sautée | Suivre l'ordre : accusé → décision → transfert → arrivée → clôture |
| « Accès réservé » | Contexte actif non centré sur le centre | Changer le contexte dans le bandeau |
