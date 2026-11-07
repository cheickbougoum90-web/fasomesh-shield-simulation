# Guide utilisateur — Espace Hub

> Démonstration simulée : le Hub est un maillon de coordination. Il **n'est pas
> un passage obligatoire** : les demandes CSPS → centre voyagent directement
> quand une route existe.

Compte : `operateur_hub` (Hub Central, Ouagadougou) — mot de passe `fasomesh`.

## 1. Où je suis

Menu → **Hub** (« Centre du Hub »). Le Hub voit aussi le tableau de bord, les
messages, les alertes, l'annuaire, le réseau, les rapports (statistiques du
Hub) et les paramètres.

## 2. Statistiques du Hub

Six indicateurs dérivés de la simulation : alertes reçues, critiques, envois
livrés, en file, échoués, nœuds actifs.

## 3. Orienter une demande vers un centre compétent

Section **« Orienter une demande »** : liste des dossiers adressés au Hub ou
non encore orientés, avec le sélecteur de centre **affichant la disponibilité
déclarée** de chaque établissement.

- **Orienter** change la destination du dossier : un événement
  `orientation` entre dans l'historique et le CSPS reçoit une notification.
- Une destination inconnue ou inchangée est refusée.
- L'orientation est **explicite** : aucun dossier ne transite par le Hub de
  façon automatique.

## 4. Alertes adressées au Hub

Les alertes reçues par le réseau, avec leur priorité et leur catégorie :

- **Catégoriser** (opérateur uniquement) parmi les 7 catégories sanitaires :
  urgence médicale, évacuation immédiate, incident sanitaire, indisponibilité
  de service, renfort, incident logistique, alerte technique ;
- **Accuser réception** : simple prise de connaissance technique, jamais une
  décision sanitaire.

## 5. Files d'attente

Les envois qui ne sont ni arrivés ni abandonnés : en file, en acheminement,
échoués ou **non confirmés**. Chaque carte indique les sauts, les tentatives,
l'ancienneté et si le message est **stocké au Hub** (repli de stockage).
Bouton **« Reprendre l'envoi »** pour relancer un envoi échoué ou non confirmé.

## 6. Supervision des nœuds et des liaisons

Compteurs : nœuds actifs, liaisons opérationnelles, en file, échoués. Bouton
**« Couper / rétablir le Hub »** et lien **« Carte des nœuds et des liaisons »**
(écran Réseau) pour couper un nœud, une liaison ou tester une panne.

À noter : couper le Hub **n'interrompt pas** les communications CSPS → centre
si une autre route existe (testé automatiquement).

## 7. Incidents réseau

- **Signaler un incident** (titre, description, sévérité) : enregistré dans
  l'organisation active et visible dans la liste.
- La liste regroupe les incidents déclarés, leur sévérité, leur organisation
  et leur ancienneté.

## 8. Journaux techniques

Réservés aux rôles disposant de `journal.read` (opérateur du Hub,
administrateur) : les dernières entrées du journal de supervision (réseau,
messages, routes, pannes, commandes).

**Journal technique ≠ journal d'audit** : les décisions sanitaires restent dans
l'historique de chaque dossier et dans le journal d'audit de l'administration.

## 9. Centres de supervision et d'administration

- `/app/admin` (administrateur) : comptes, organisations, configuration et
  **journal d'audit** (accès refusés inclus).
- `/supervision` : console technique indépendante (topologie, envois,
  scénarios de panne) destinée à la démonstration réseau.

## 10. Ce que je ne peux PAS faire

- Accepter, refuser ou clôturer une prise en charge (droit réservé au centre de
  référence) ;
- lire le contenu des conversations privées ;
- modifier la disponibilité d'un établissement ;
- gérer l'équipe d'un CSPS.

Ces refus sont appliqués dans la couche de politique.

## Erreurs fréquentes

| Message | Cause | Que faire |
|---|---|---|
| « Le dossier est déjà orienté vers cet'établissement » | Destination inchangée | Choisir un autre centre |
| « Opération refusée : permission de signaler un incident requise » | Rôle sans droit | Se connecter en `operateur_hub` ou coordinateur |
| Envoi bloqué « queued » | Aucune route disponible | Rétablir les liens (écran Réseau) puis « Reprendre l'envoi » |
