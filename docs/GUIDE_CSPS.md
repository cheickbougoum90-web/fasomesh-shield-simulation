# Guide utilisateur — Espace CSPS

> Démonstration simulée : aucune donnée médicale réelle, aucun dispositif
> médical certifié, aucune transmission radio réelle.

Comptes : `responsable_csps` (responsable), `agent_csps` ou `agent_csps2`
(agents de santé) — mot de passe `fasomesh`.

## 1. Tableau de bord (`/app`)

- **Établissement** : nom, district, compte et rôle actifs, **nœud local**
  (téléphone simulé) et son état.
- **Réseau Mesh (simulé)** : état global et nombre de nœuds actifs.
- **Demandes de l'établissement** : 6 compteurs (en attente, urgentes,
  acceptées, refusées, en cours, clôturés) — cliquez « Dossiers » pour la liste.
- **Actions rapides** : nouvelle référence, nouvelle évacuation, contacter un
  centre, alerte au Hub, voir les demandes, annuaire.
- **Alertes actives**, **dernières communications** et notifications (cloche).

Sur ordinateur, la navigation est dans la **barre latérale gauche** ; sur
téléphone, elle est en **barre d'onglets en bas** (faites glisser
horizontalement s'il y a plus d'onglets que la largeur).

## 2. Créer un dossier (référence, évacuation, avis)

**Demandes → + Nouvelle demande** (ou une action rapide). Le formulaire est en
3 volets, court et guidé :

1. **Identification** : type (Référence / Évacuation / Avis spécialisé),
   priorité (critique / urgente / normale), catégorie du cas, motif,
   description, CSPS de départ, centre de destination (choisi dans l'annuaire).
2. **Informations sanitaires** : signes, constantes (T°, TA, FC, FR, SpO₂),
   premiers soins — **tout est facultatif**.
3. **Logistique** : transport, oxygène/équipement, équipe, instructions
   logistiques.

**Validation selon la priorité** : une demande critique peut être envoyée avec
un minimum d'informations ; une demande normale exige un motif et des signes.
Le message d'erreur indique précisément ce qui manque.

- **Brouillon** : enregistré localement, **jamais transmis** tant qu'il n'est
  pas soumis. Il apparaît avec le statut « Brouillon » et le bouton
  « Soumettre le brouillon ».
- **Aucun nom de patient n'est demandé ni stocké** : le dossier est identifié
  par une référence non nominative (`DOS-2026-xxxx`).

## 3. Suivre un dossier (`/app/care`, fiche `/app/care/:id`)

- **Liste** : filtres priorité / statut sanitaire / recherche, actions
  autorisées directement sur la carte.
- **Fiche** : les **deux suivis, toujours distincts** :
  - *Suivi sanitaire* : brouillon → créée → transmise → reçue par le centre →
    accusée → acceptée / refusée / informations demandées → transfert préparé →
    en cours d'évacuation → arrivée → clôturée.
  - *Suivi technique (transport Mesh)* : état du transport, tentatives, sauts,
    événements et **lien « Suivre le transfert pas à pas »**.
- **Réception technique ≠ acceptation** : tant que le centre n'a pas agi, le
  dossier reste « Transmise au réseau » (ou « Reçue par le centre »), jamais
  accepté.
- L'historique complet liste chaque étape avec **date, auteur et motif**.

## 4. Répondre à une demande d'informations

Quand le centre demande des informations complémentaires, le dossier affiche la
demande et un champ **« Envoyer les informations au centre »**. Votre réponse
est transmise avec une notification ; **elle ne fait pas avancer l'état
sanitaire** : c'est le centre qui décide de la suite.

## 5. Messagerie (`/app/messages`)

Destinataires limités aux **établissements du dispositif sanitaire** (CSPS,
centres de référence, Hub). Le contenu est chiffré en AES-GCM avant d'être
acheminé ; le suivi affiche chaque étape du transport simulé.

## 6. Alertes (`/app/alerts`, `/app/alerts/new`)

7 catégories sanitaires : urgence médicale, évacuation immédiate, incident
sanitaire, indisponibilité de service, renfort, incident logistique, alerte
technique. L'alerte est acheminée par le Mesh ; le Hub la reçoit, la
catégorise et en accuse réception.

## 7. Annuaire (`/app/directory`)

Établissements déclarés : localité, district, services, **disponibilité
déclarée** (jamais mesurée) et nœud simulé. Le responsable peut signaler sa
propre disponibilité (« Disponible / Capacité limitée / Indisponible ») — la
modification d'un autre établissement est refusée.

## 8. Équipe (`/app/team`) — responsable uniquement

- Liste des membres de l'établissement avec leur rôle et leur nœud.
- **Ajouter un compte**, **changer un rôle** (Agent de santé / Responsable),
  **retirer un membre** (confirmation puis retrait).
- Chaque modification est **journalisée** (onglet Journal de l'équipe) et
  isolée : un membre ajouté n'accède qu'aux dossiers de SON établissement.
- L'agent de santé ne voit même pas cet écran.

## 9. Rapports (`/app/reports`) — responsable uniquement

- Indicateurs par période (24 h / 7 jours / tout), répartition par centre,
  transport simulé.
- **Exporter en CSV (local)** : le fichier est généré dans le navigateur,
  **rien n'est envoyé sur le réseau**. Colonnes : dossier, type, priorité,
  statut, CSPS source, destination, date de création, délai de réception.
- Les délais affichés proviennent de la **simulation**, pas d'une prise en
  charge réelle.

## 10. Profil et établissement (`/app/settings`)

Compte, appareil rattaché, confidentialité, vitesse de simulation, permissions
du rôle, **section Établissement** (district, services, disponibilité
déclarée) et **Réinitialiser la démonstration**.

## Erreurs fréquentes

| Message | Cause | Que faire |
|---|---|---|
| « Les informations obligatoires sont incomplètes » | Priorité non critique et informations manquantes | Compléter le motif et les signes |
| « Opération refusée » / bouton absent | Droit non détenu dans le contexte actif | Passer au rôle approprié ou changer de contexte |
| « Trop de tentatives de connexion » | 5 échecs en 60 s | Attendre le délai indiqué |
| Dossier bloqué « Transmise » | Réseau coupé ou en attente | Réseau → vérifier l'état, rétablir les liens |
