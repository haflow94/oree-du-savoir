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

Une fois connecté avec ce compte, **changez son mot de passe** et créez les
comptes de l'équipe depuis *Administration*.

## Variables et secrets

Toutes les variables sont documentées dans `.env.example`. `.env` n'est
jamais committé (voir `.gitignore`). En production, ces valeurs peuvent aussi
être fournies comme secrets de l'orchestrateur plutôt que via un fichier
`.env` sur disque.

`TZ` détermine le « jour courant » de l'application (séances du jour, délai
de correction des présences) et vaut `Europe/Paris` par défaut. Un conteneur
sans ce réglage tourne en UTC : le jour basculerait à 2h du matin heure
française.

L'image installe **Chromium** (paquet système, voir `Dockerfile`) pour
générer les dossiers d'inscription en PDF (`src/lib/dossier/`) — ajoute
environ 300 Mo à l'image, aucune variable à configurer (`PUPPETEER_EXECUTABLE_PATH`
est fixée dans le Dockerfile).

## Documenso (signature électronique des dossiers)

Instance Documenso self-hébergée (services `documenso`, `documenso-db`,
`documenso-minio`, `documenso-mail` dans `docker-compose.yml`) — voir
`CLAUDE.md` et `src/lib/documenso.ts`. Toutes les variables `DOCUMENSO_*`
sont documentées dans `.env.example`.

**Important — l'app doit tourner dans Docker, pas via `npm run dev` sur
l'hôte, dès que Documenso est utilisé.** Documenso génère des URL
d'upload/téléchargement présignées vers `http://documenso-minio:9000` (nom
de service Docker) ; l'application (`src/lib/documenso.ts`) doit pouvoir
résoudre ce nom, ce qui n'est vrai que si elle tourne sur le même réseau
Compose (service `app`). Un `npm run dev` lancé directement sur l'hôte
échoue avec `getaddrinfo EAI_AGAIN documenso-minio` dès la tentative
d'upload du PDF vers Documenso.

### Premier démarrage

```bash
# 1. Générer le certificat de signature (une fois), passphrase = DOCUMENSO_SIGNING_PASSPHRASE
mkdir -p documenso-cert
openssl req -x509 -newkey rsa:2048 -keyout /tmp/documenso-key.pem -out /tmp/documenso-cert.pem \
  -days 3650 -nodes -subj "/CN=L'Oree du Savoir - Signature"
openssl pkcs12 -export -out documenso-cert/cert.p12 \
  -inkey /tmp/documenso-key.pem -in /tmp/documenso-cert.pem \
  -passout pass:VOTRE_DOCUMENSO_SIGNING_PASSPHRASE
rm /tmp/documenso-key.pem /tmp/documenso-cert.pem

# 2. Démarrer la stack (app comprise, --build pour prendre le code courant)
docker compose up -d --build

# 3. Créer le premier compte Documenso (interface web, une fois) :
#    ouvrir DOCUMENSO_WEBAPP_URL (http://<hôte>:3100 par défaut) et s'inscrire.

# 4. Générer le token API : Documenso > Paramètres de l'équipe > Tokens API
#    -> reporter la valeur dans DOCUMENSO_API_TOKEN (.env), puis redémarrer app :
docker compose up -d app

# 5. Configurer le webhook Documenso -> application (interface web Documenso,
#    Paramètres > Webhooks) :
#    URL      : http://app:3000/api/webhooks/documenso   (nom de service Docker interne)
#    Événements : DOCUMENT_COMPLETED (au minimum)
#    En-tête  : X-Documenso-Secret = DOCUMENSO_WEBHOOK_SECRET (valeur exacte du .env)
```

`documenso-cert/` n'est jamais committé (voir `.gitignore`) : à régénérer
sur chaque environnement, ou à sauvegarder séparément si l'on souhaite
conserver le même certificat.

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

### Automatiser la sauvegarde (important)

`scripts/backup.sh` ne s'exécute jamais tout seul : sans planification, il
n'y a de sauvegarde que le jour où quelqu'un pense à le lancer à la main. À
faire une fois sur le serveur de production, en root ou l'utilisateur qui a
lancé `docker compose up -d` :

```bash
crontab -e
# ajouter, par exemple pour une sauvegarde chaque nuit à 3h :
0 3 * * * cd /chemin/vers/Application && ./scripts/backup.sh /chemin/vers/backups >> /var/log/oree-backup.log 2>&1
```

Copiez aussi régulièrement le contenu de `/chemin/vers/backups` **ailleurs
que sur ce même serveur** (disque externe, autre machine) : une sauvegarde
qui reste sur la machine qu'elle est censée protéger ne survit pas à une
panne de disque.

### Sauvegarder le code source séparément

Les scripts de sauvegarde ci-dessus protègent les *données* (base +
documents), pas le *code* de l'application. Tant qu'aucun dépôt Git distant
n'est configuré, le code n'existe que sur le poste où il a été développé —
pensez à en garder une copie ailleurs (dépôt distant privé recommandé, ou à
défaut une archive du dépôt Git copiée sur un support externe).
