# Médias du projet

Ce dossier accueille la vidéo de démonstration de la simulation.

## Fichiers attendus

| Fichier | Rôle |
|---|---|
| `demo-simulation.mp4` | Vidéo complète (optionnel, voir la limite de taille ci-dessous) |
| `demo-apercu.gif` | Aperçu animé facultatif de 10 à 15 secondes, à ajouter dans le README avec `![Aperçu](docs/media/demo-apercu.gif)` |
| `demo-miniature.png` | Image de couverture cliquable vers la vidéo (une image d'attente est déjà fournie, remplacez la par une capture de votre vidéo) |

## Où héberger la vidéo

1. **YouTube en mode « non répertoriée »** (recommandé). Pas de limite de taille gênante, lecture fluide, lien simple à partager. Le README affiche la miniature et renvoie vers YouTube.
2. **Dépôt GitHub**. GitHub refuse les fichiers de plus de 100 Mo en `git push` normal. Au delà de quelques dizaines de Mo, préférez YouTube ou Git LFS.
3. **GitHub Releases**. Joignez le `.mp4` à une release (fichiers jusqu'à 2 Go) et mettez le lien dans le README.

## Remplacer le texte d'attente du README

Dans `README.md`, section « Vidéo de la simulation », remplacez `VIDEO_ID` par l'identifiant de votre vidéo YouTube
(la partie après `v=` dans l'adresse), puis ajoutez `demo-miniature.png` dans ce dossier.

## Conseils de tournage (3 minutes maximum)

1. Connexion avec `agent_csps` (mot de passe `fasomesh`), tableau de bord du CSPS.
2. Création d'une demande de référence, puis envoi par le moteur Mesh.
3. Suivi pas à pas du transfert, avec la route empruntée par le message.
4. Espace Hub : coupure d'un nœud, puis retour automatique par une route alternative.
5. Espace Centre de référence : acceptation, instructions, clôture.
6. Fin de vidéo : rappel que tout est simulé, aucune radio réelle.
