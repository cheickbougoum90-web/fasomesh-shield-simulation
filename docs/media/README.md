# Médias du projet

Ce dossier contient la vidéo de démonstration de la simulation.

## Fichiers

| Fichier | Rôle |
|---|---|
| `demo-simulation.mp4` | Vidéo de démonstration (720p, 15 images/s, environ 25 min, 25 Mo) |
| `demo-miniature.png` | Image cliquable affichée dans le README, tirée de la vidéo |

## Remplacer la vidéo

Copiez la nouvelle vidéo ici sous le nom `demo-simulation.mp4`, puis :

```bash
git add docs/media/
git commit -m "Mise à jour de la vidéo"
git push
```

Chaque version de la vidéo reste dans l'historique Git. Évitez de la remplacer souvent.

## Limites de taille GitHub

| Taille du fichier | Comportement |
|---|---|
| Jusqu'à 50 Mo | Aucun souci |
| De 50 à 100 Mo | `git push` fonctionne mais GitHub affiche un avertissement |
| Plus de 100 Mo | `git push` est **refusé**. Compressez davantage (HandBrake, 720p, 24 images/s) |

Une vidéo de 3 minutes en 720p pèse en général 15 à 40 Mo, ce qui convient très bien.

## Si le fichier a été poussé trop gros

Une fois un fichier de plus de 100 Mo commité, le simple fait de le supprimer ne suffit pas : Git le garde dans l'historique. Annulez le dernier commit avec `git reset --soft HEAD~1`, retirez le fichier, puis recommencez.

## Variante : lecteur intégré dans la page d'accueil

Par défaut, le README affiche une miniature qui ouvre la vidéo. Pour avoir un lecteur directement dans le README :

1. Sur GitHub, ouvrez `README.md`, cliquez sur le crayon (Edit).
2. Glissez le fichier `.mp4` dans la zone de texte. GitHub l'envoie et insère une adresse `https://github.com/user-attachments/assets/...`.
3. Collez cette adresse seule sur une ligne à la place de la miniature, puis validez.

Cette méthode est limitée à 10 Mo en compte gratuit environ, d'où le choix du fichier dans le dépôt comme méthode principale.

## Conseils de tournage (3 minutes maximum)

1. Connexion avec `agent_csps` (mot de passe `fasomesh`), tableau de bord du CSPS.
2. Création d'une demande de référence, puis envoi par le moteur Mesh.
3. Suivi pas à pas du transfert, avec la route empruntée par le message.
4. Espace Hub : coupure d'un nœud, puis retour automatique par une route alternative.
5. Espace Centre de référence : acceptation, instructions, clôture.
6. Fin de vidéo : rappel que tout est simulé, aucune radio réelle.
