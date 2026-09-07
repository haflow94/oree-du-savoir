# CONFIGURATION-CLOUDFLARE-PREINSCRIPTION

**Projet :** L’Orée du Savoir  
**Objet :** exposition Internet sécurisée du formulaire de préinscription  
**Statut :** mise en place et tests de bout en bout validés sur PC  
**Dernière mise à jour :** 2026-09-07

## 1. Objet

Ce document décrit la configuration retenue pour rendre le formulaire de préinscription accessible depuis Internet tout en maintenant l’application d’administration privée.

Architecture actuelle de test :

```text
Internet → Cloudflare → Cloudflare Tunnel → PC de test → Docker → Application Next.js
                                                        ├→ PostgreSQL
                                                        └→ stockage documents
```

Architecture cible :

```text
Internet → Cloudflare → Cloudflare Tunnel → NAS → Docker → Application
```

Le tunnel et le hostname public sont destinés à être conservés lors de la migration PC → NAS.

## 2. Hostname public

Hostname validé :

```text
preinscription.loreedusavoir.fr
```

Page publique :

```text
https://preinscription.loreedusavoir.fr/preinscription
```

Cette URL est destinée à rester stable afin de pouvoir être utilisée par un QR code physique permanent.

**Important :** le QR code ne doit pas contenir de code temporel. La stratégie future souhaitée est : QR permanent → URL/identifiant contrôlé → validation côté application → formulaire. La gestion exacte de cet identifiant sera traitée séparément.

## 3. Cloudflare

- Offre principale : Free
- Cloudflare Zero Trust : Free
- Compte administrateur : **À COMPLÉTER**
- E-mail du compte : **À COMPLÉTER**
- Mot de passe : Bitwarden, jamais dans ce document
- MFA : **À CONFIGURER / VÉRIFIER**

### Domaine

Zone Cloudflare :

```text
loreedusavoir.fr
```

Registrar : **Infomaniak**

Nameservers Cloudflare configurés chez Infomaniak :

```text
dan.ns.cloudflare.com
teagan.ns.cloudflare.com
```

Les enregistrements DNS de messagerie importés depuis Infomaniak doivent être conservés : MX, SPF, DKIM, DMARC, autoconfig/autodiscover et SRV. Ne pas les modifier sans vérification.

## 4. Cloudflare Tunnel

Nom :

```text
oree-preinscription
```

Type :

```text
cloudflared
```

Identifiant du tunnel :

```text
72c03830-63ec-4d8b-963b-7ab76cf4626a
```

Statut attendu lorsque le connecteur fonctionne :

```text
Optimal
```

### Token

Le token `cloudflared` est un secret critique. Il ne doit jamais être écrit dans Git, ce document, une conversation ou une capture d’écran.

Le conserver dans Bitwarden, par exemple :

```text
L’Orée du Savoir / 05 - Secrets techniques / Cloudflare Tunnel - oree-preinscription
```

Une fuite du token doit conduire à sa rotation/révocation.

## 5. Connecteur cloudflared actuel

Le connecteur fonctionne dans un conteneur Docker sur le PC de test.

Image :

```text
cloudflare/cloudflared:latest
```

Commande :

```bash
docker run --add-host=host.docker.internal:host-gateway   cloudflare/cloudflared:latest   tunnel --no-autoupdate run --token TON_TOKEN_COMPLET
```

`host.docker.internal` permet au conteneur cloudflared d’atteindre le service du PC hôte sur le port 3000.

## 6. Route Cloudflare

Configuration validée :

```text
Hostname : preinscription.loreedusavoir.fr
Path     : *
Service  : HTTP
URL      : http://host.docker.internal:3000
```

Le wildcard `*` est actuellement compensé par le cloisonnement applicatif. Ne pas modifier cette route sans refaire les tests de bout en bout.

## 7. Cloisonnement applicatif

Variable :

```env
PREINSCRIPTION_PUBLIC_HOSTNAME=preinscription.loreedusavoir.fr
```

Vérification :

```bash
docker compose exec app printenv PREINSCRIPTION_PUBLIC_HOSTNAME
```

Résultat attendu :

```text
preinscription.loreedusavoir.fr
```

Le proxy applicatif autorise l’expérience publique nécessaire, notamment :

```text
/preinscription
/_next/static/*
/favicon.ico
```

Les autres routes sont bloquées par `404`.

Routes privées testées :

```text
/administration
/etudiants
/login
/accueil-preinscription
/api/internal/n8n/*
```

## 8. Particularité Next.js

Version :

```text
Next.js 16.3.1
```

Le cloisonnement est dans :

```text
src/proxy.ts
```

Une particularité du self-hosted avec `next start` a été identifiée : `request.nextUrl.hostname` peut être reconstruit avec `localhost`. La détection du hostname public utilise donc le header `Host` réellement reçu.

Ne pas revenir à `request.nextUrl.hostname` pour cette détection sans refaire les tests de production.

## 9. Docker et réseau

Application :

```text
application-app-1
```

Port :

```text
0.0.0.0:3000 → 3000
```

PostgreSQL :

```text
application-db-1
127.0.0.1:5432 → 5432
```

n8n :

```text
127.0.0.1:5678 → 5678
```

PostgreSQL et n8n ne doivent pas être exposés directement à Internet.

n8n n’est pas nécessaire au fonctionnement actuel de la préinscription publique.

## 10. Sécurité des uploads

Les fichiers de préinscription sont contrôlés côté serveur :
- types autorisés ;
- vérification de signature binaire ;
- taille maximale ;
- noms de fichiers générés côté serveur ;
- stockage contrôlé par l’application.

Types autorisés :

```text
PDF
JPEG
PNG
```

Taille maximale configurée :

```env
TAILLE_MAX_FICHIER_MO=8
```

Le MIME et le nom fournis par le navigateur ne constituent pas une preuve suffisante du type réel.

## 11. Procédure après arrêt du PC

Si le PC est arrêté, le tunnel peut apparaître `Hors service`. Le tunnel Cloudflare n’est pas supprimé.

Démarrer l’application si nécessaire :

```bash
docker compose up -d app
```

Puis relancer cloudflared avec le token stocké dans Bitwarden :

```bash
docker run --add-host=host.docker.internal:host-gateway   cloudflare/cloudflared:latest   tunnel --no-autoupdate run --token TON_TOKEN_COMPLET
```

Vérifier dans Cloudflare que le tunnel devient `Optimal`.

Tester :

```bash
curl -I https://preinscription.loreedusavoir.fr/preinscription
```

## 12. Reconstruction après modification

Pour reconstruire et redémarrer l’application :

```bash
docker compose up -d --build app
```

Puis :

```bash
docker compose exec app printenv PREINSCRIPTION_PUBLIC_HOSTNAME
```

## 13. Tests de validation

Page publique :

```bash
curl -I https://preinscription.loreedusavoir.fr/preinscription
```

Attendu :

```text
HTTP/2 200
```

Route privée :

```bash
curl -I https://preinscription.loreedusavoir.fr/administration
```

Attendu :

```text
HTTP/2 404
```

Les autres routes privées testées renvoient également `Not Found`.

Une préinscription fictive a été soumise depuis Internet avec de faux documents. La fiche a bien été créée dans l’application.

## 14. Dépannage

### Tunnel `Hors service`

Vérifier Docker et le conteneur cloudflared, puis relancer le connecteur.

### Cloudflare Error 1033

Indique généralement qu’aucun connecteur cloudflared sain n’est disponible.

### `/preinscription` en 404

Vérifier hostname, variable d’environnement, build, route Cloudflare et logs.

### `/administration` en 307 vers `/login`

C’est un signal de sécurité important : le cloisonnement public n’est probablement pas correctement appliqué. Ne pas considérer l’exposition comme validée dans ce cas.

## 15. Migration PC → NAS

Architecture cible :

```text
Cloudflare
  ↓
Tunnel oree-preinscription
  ↓
NAS
  ↓
Docker
  ↓
Application
```

Conserver :

```text
preinscription.loreedusavoir.fr
```

Le QR code pourra donc rester inchangé.

Avant migration, documenter :
- modèle exact du NAS ;
- OS/firmware ;
- architecture CPU ;
- RAM ;
- stockage disponible ;
- Docker ;
- IP LAN réservée ;
- routeur/box ;
- firewall ;
- sauvegardes ;
- VPN ;
- DNS local ;
- comptes administrateurs.

Ne pas exposer directement PostgreSQL, n8n, l’administration ou le stockage de documents.

## 16. Comptes et accès

Les secrets ne doivent jamais être stockés dans ce document.

| Service | Entrée Bitwarden recommandée | Identifiant | Secret |
|---|---|---|---|
| Cloudflare | Cloudflare — L’Orée du Savoir | À compléter | Bitwarden |
| Cloudflare Zero Trust | Cloudflare Zero Trust — L’Orée du Savoir | À compléter | Bitwarden |
| Cloudflare Tunnel | Tunnel — oree-preinscription | N/A | Token Bitwarden |
| Infomaniak | Infomaniak — Domaine | À compléter | Bitwarden |
| NAS | NAS — Administration | À compléter | Bitwarden |
| Routeur/Box | Réseau — Routeur/Box | À compléter | Bitwarden |
| Application | Application — Administrateur | À compléter | Bitwarden |
| GitHub | GitHub — Projet | À compléter | Bitwarden |

## 17. Organisation Bitwarden recommandée

```text
L’Orée du Savoir
├── 01 - Infrastructure
│   ├── NAS
│   ├── Routeur / Box
│   ├── VPN
│   └── DNS local
├── 02 - Cloud
│   ├── Cloudflare
│   ├── Cloudflare Zero Trust
│   └── Infomaniak
├── 03 - Application
│   ├── Application Admin
│   ├── PostgreSQL
│   └── n8n
├── 04 - Développement
│   └── GitHub
└── 05 - Secrets techniques
    ├── Cloudflare Tunnel
    ├── API Keys
    ├── Webhooks
    └── certificats / clés
```

Les mots de passe et tokens restent dans Bitwarden.

## 18. État actuel

### Validé

- [x] Domaine géré par Cloudflare
- [x] Cloudflare Free
- [x] Zero Trust Free
- [x] Tunnel `oree-preinscription`
- [x] Connecteur Docker sur PC
- [x] Hostname `preinscription.loreedusavoir.fr`
- [x] `/preinscription` accessible depuis Internet
- [x] Routes privées bloquées par 404
- [x] PostgreSQL non exposé directement
- [x] n8n non exposé directement
- [x] Contrôles de fichiers côté application
- [x] Soumission fictive de bout en bout validée

### À faire

- [ ] Finaliser le mécanisme QR permanent / identifiant URL
- [ ] Configurer Bitwarden et renseigner les comptes
- [ ] Documenter les informations réseau
- [ ] Préparer le NAS
- [ ] Migrer le tunnel PC → NAS
- [ ] Mettre en place les sauvegardes
- [ ] Tester la restauration
- [ ] Finaliser le réseau interne / VPN selon l’infrastructure retenue
- [ ] Revalider la sécurité avant ouverture réelle au public

## 19. Historique des décisions

### Cloudflare Tunnel

Choisi pour permettre l’accès Internet à la préinscription sans ouvrir directement le réseau du site par une redirection de port classique.

### Hostname dédié

Permet de séparer clairement la préinscription publique de l’application privée.

### Cloisonnement applicatif

Même si la route Cloudflare est en wildcard, l’application refuse les routes privées lorsqu’une requête arrive via le hostname public.

### QR permanent

Le QR physique ne doit pas dépendre d’une date, d’une heure ou d’une session.

### PC temporaire

Le PC sert à valider l’architecture avant migration vers le NAS.

## 20. Règle de sécurité finale

La préinscription accessible depuis Internet ne signifie pas que l’application entière est publique.

```text
Internet
   ↓
Cloudflare
   ↓
Tunnel
   ↓
Hostname public
   ├── /preinscription → AUTORISÉ
   └── autres routes   → 404
```

L’administration, les étudiants, les documents privés, PostgreSQL et n8n doivent rester hors de cette surface publique.

## Documents complémentaires

```text
CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md
ARCHITECTURE-PREINSCRIPTION.md
DEPLOIEMENT-PREINSCRIPTION.md
```
