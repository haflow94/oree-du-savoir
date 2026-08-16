# Déploiement

Cible : serveur Linux **headless**, idéalement **Debian**, avec Docker + Docker
Compose. Le choix définitif du matériel (NAS ou serveur dédié) sera fait plus
tard — l'architecture ne dépend d'aucune spécificité du poste de
développement.

## Premier déploiement

```bash
git clone <repo> && cd Application
cp .env.example .env
# Éditer .env : mots de passe, SESSION_SECRET (openssl rand -hex 32), identifiants admin
docker compose up -d --build
```

`entrypoint.sh` applique les migrations Prisma puis crée le compte
administrateur initial (idempotent : ne touche plus rien une fois le compte
créé).

## Variables et secrets

Toutes les variables sont documentées dans `.env.example`. `.env` n'est
jamais committé (voir `.gitignore`). En production, ces valeurs peuvent aussi
être fournies comme secrets de l'orchestrateur plutôt que via un fichier
`.env` sur disque.

## Volumes persistants

| Volume    | Contenu                                   |
| --------- | ------------------------------------------ |
| `db_data` | Données PostgreSQL                          |
| `app_data`| Documents/justificatifs uploadés (`/data`) |

Les deux sont des volumes Docker nommés, indépendants du cycle de vie des
conteneurs (`docker compose down` sans `-v` les préserve).

## Sauvegarde

```bash
./scripts/backup.sh [dossier_destination]   # défaut : ./backups
```

Produit deux fichiers horodatés : un dump PostgreSQL (format custom
`pg_dump -Fc`) et une archive `tar.gz` du volume `app_data`. La stack doit
être démarrée (`docker compose up -d`).

## Restauration

```bash
./scripts/restore.sh backups/db-<horodatage>.dump backups/documents-<horodatage>.tar.gz
```

Écrase la base et les documents actuels après confirmation interactive, puis
redémarre le service `app`. Testé de bout en bout (modification témoin →
sauvegarde → restauration → état d'origine confirmé).
