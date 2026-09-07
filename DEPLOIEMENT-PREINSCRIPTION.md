# Déploiement — Préinscription publique

Document technique, complémentaire à `ARCHITECTURE-PREINSCRIPTION.md`. Destiné à quiconque déploie, vérifie, fait évoluer ou retire cette architecture.

**Avertissement de statut (mis à jour 2026-09-07)** : ce document décrivait initialement une cible retenue après audit du dépôt `oree-du-savoir` (commit inspecté début septembre 2026), avec un §2 non encore codé. **Le §2 est désormais implémenté et testé** (153 tests, typecheck, lint, build — voir `DOCUMENTATION_TECHNIQUE.md` §6.5 pour le détail technique à jour). Les briques réseau des §4-§5 (tunnel sortant, accès HTTPS) sont **en place et testées de bout en bout sur le PC de test** — voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` pour la configuration concrète et l'état de validation à jour. Restent non faits : le filtrage de route fin et l'anti-abus (Turnstile) côté fournisseur, ainsi que la migration vers le NAS de production. L'environnement de référence reste un **PC de développement/test**, pas encore le NAS de production — les sections marquées **[À ADAPTER AU NAS]** ne sont pas vérifiées dans l'environnement cible.

---

## 1. Composants et rôle de chacun

| Composant | Rôle | Où il tourne |
|---|---|---|
| Application Next.js (existante) | Sert `/preinscription`, exécute la Server Action de création, sert aussi tout le reste de l'app en interne | Conteneur `app` (docker-compose) |
| PostgreSQL | Stocke les préinscriptions | Conteneur `db`, jamais exposé (lié à `127.0.0.1` — fait) |
| Volume documents (`DOCUMENTS_DIR`) | Stocke les fichiers uploadés | Bind mount hôte, jamais exposé |
| Client tunnel sortant (ex. `cloudflared`) | Établit la connexion sortante vers le point d'entrée public | Conteneur Docker, **en place (PC de test)** — voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` §5 |
| Point d'entrée public (HTTPS) | Gère le chiffrement et le hostname public | Cloudflare, **en place (PC de test)** — voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` §6 |
| Filtrage de route + anti-abus fournisseur | Ne transmettrait que `/preinscription*`, challenge les robots | Service externe (Cloudflare), configuré hors du dépôt de code, **non configuré** — la route reste en wildcard (compensé par `src/proxy.ts`) et Turnstile n'est pas activé |

Ce document ne couvre que la partie qui vit dans ce dépôt et sur la machine hôte. La configuration du fournisseur de tunnel (compte, DNS, règles) se fait sur son propre tableau de bord et n'est pas versionnée ici — c'est volontaire : voir §6.

## 2. Prérequis avant activation publique — **fait**

Ces correctifs sont des préalables, indépendants du choix de fournisseur — ils devaient être faits même si `/preinscription` n'était jamais exposée sur Internet. Tous implémentés et testés :

- [x] Validation du contenu réel des fichiers uploadés (signature binaire, pas seulement l'extension déclarée par le navigateur) sur les deux champs `photo` et `pieceIdentite` — `src/lib/fichiers-uploades.ts`, branché sur `src/app/preinscription/actions.ts`.
- [x] `Content-Type`/`Content-Disposition` de service recalculés depuis le contenu réel (jamais depuis le `mimeType` déclaré à l'upload) — `src/lib/service-fichier.ts`, appliqué à `src/app/(app)/etudiants/[id]/documents/[documentId]/route.ts` et `administration/gouvernance/documents/[documentId]/route.ts`.
- [x] Limite de taille de fichier explicite et volontaire sur le formulaire public — `TAILLE_MAX_FICHIER_MO` (`.env.example`), répercutée sur `experimental.serverActions.bodySizeLimit` (`next.config.ts`).
- [x] Modèle de code d'accès implémenté et branché sur `preinscrireAction` — voir §3 ci-dessous (le modèle livré va au-delà de la spécification initiale : deux origines, pas seulement un code e-mail à usage unique).
- [x] `SESSION_COOKIE` : `secure` déjà conditionné à `x-forwarded-proto` (pas à `NODE_ENV`) dans `src/lib/auth.ts`. En pratique, ce point ne concerne que le hostname public de la préinscription : `/login` reste explicitement exclu des chemins autorisés sur ce hostname (`src/proxy.ts`), le staff n'authentifie donc jamais de session via le tunnel public. À revérifier seulement si un accès staff via HTTPS public venait à être envisagé un jour.
- [x] Ports `5432` (Postgres) et `5678` (n8n) liés à `127.0.0.1:` dans `docker-compose.yml`, plus jamais publiés sur toutes les interfaces de l'hôte.

## 3. Code d'accès — spécification implémentée

Le modèle livré (`CodePreinscription`, `src/lib/preinscription-code.ts`) couvre deux origines distinctes, au-delà de la spécification initiale à usage unique seul :

- **Code e-mail** (`estAccueilAuto = false`, `usageUnique = true`) — correspond à la spécification d'origine :
  - Diffusion : lien envoyé par e-mail à une adresse déjà connue de l'association, généré à la main depuis *Inscriptions* (`generer-code-form.tsx`).
  - Le lien contient un token dans l'URL (`/preinscription?code=...`) ; un champ de saisie manuelle reste prévu en repli si le lien est altéré par un client mail.
  - Stockage : uniquement le **hash** du code en base (jamais le code en clair), même principe que `hashSessionToken` (`src/lib/session-token.ts`).
  - Cycle de vie : associé à une campagne (`campagneLabel`), expiration configurable (`joursValidite`), invalidé atomiquement (`updateMany` conditionnel) à la première soumission réussie, révocable manuellement par le staff (Prisma Studio, pas d'écran dédié — volume trop faible pour le justifier).
- **Code accueil** (`estAccueilAuto = true`, `usageUnique = false`) — extension ajoutée en cours d'implémentation pour couvrir le cas d'une famille présente physiquement à l'accueil (QR affiché sur place plutôt qu'un e-mail) :
  - Minté automatiquement par `GET /accueil-preinscription`, qui redirige vers `/preinscription?code=...` — lien stable imprimé/affiché une seule fois, jamais besoin de réimprimer le QR.
  - Réutilise le code encore valide entre deux scans ; expire en fin de journée courante (`finDeJourneeCourante`, `TZ` du conteneur) plutôt qu'à la soumission — plusieurs familles peuvent scanner le même QR le même jour.
  - Rotation anticipée possible depuis *Inscriptions* (`invalider-code-accueil-button.tsx` → `invaliderCodeAccueilAutoEnCours`) en cas de fuite suspectée.
- Vérification (les deux origines) : limitée en débit par IP (`src/lib/rate-limit.ts`, protection applicative, en complément — pas en remplacement — de la limitation de débit au niveau du point d'entrée public une fois celui-ci en place).
- **Accès direct sans code** (troisième cas, non lié à `CodePreinscription`) : une visite de `/preinscription` sans paramètre `code` dans l'URL laisse le formulaire ouvert — comportement volontaire (`src/app/preinscription/page.tsx`), seule la limitation de débit à la soumission (`preinscrireAction`) s'applique alors. Voir `ARCHITECTURE-PREINSCRIPTION.md` §3 pour l'implication sur le modèle de sécurité une fois le hostname public exposé.

## 4. Étapes de déploiement (vue d'ensemble)

1. ~~Appliquer les correctifs du §2 dans le code~~ — **fait** (voir §2).
2. Déployer normalement l'application (`docker compose up -d --build`), sans changement d'exposition réseau à ce stade.
3. Vérifier en local que `/preinscription` fonctionne et que le reste de l'app reste protégé par la session (comportement inchangé).
4. Configurer le fournisseur de tunnel choisi : connexion sortante depuis la machine hôte, règle de routage limitée au chemin `/preinscription*`, rien d'autre. **Fait sur le PC de test** (tunnel `oree-preinscription`, hostname `preinscription.loreedusavoir.fr` — voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` §4-§6) ; route encore en wildcard, compensée par `src/proxy.ts`. **[À ADAPTER AU NAS]** — le nom d'hôte/service interne ciblé par le tunnel doit être repointé vers l'adresse réelle du conteneur `app` sur le NAS, pas sur le PC de test. **Migration non faite à ce jour.**
   - Renseigner `PREINSCRIPTION_PUBLIC_HOSTNAME` (`.env`) avec le hostname public exact (ex. `preinscription.loreedusavoir.fr`) **avant** tout test public, y compris si la route Cloudflare reste en wildcard : `src/proxy.ts` cloisonne alors lui-même ce hostname à `/preinscription` + ressources Next.js nécessaires, indépendamment de la règle d'ingress. Voir `src/proxy.test.ts`.
5. Activer la protection anti-abus (challenge + limitation de débit) sur ce même chemin, côté fournisseur. **Non fait à ce jour** — la limitation de débit applicative (§2) est en place en attendant.
6. Tester depuis un réseau extérieur (§5 checklist). **Fait sur le PC de test** (voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` §13 et §18) ; à revalider une fois le tunnel migré sur le NAS.

## 5. Checklist de vérification post-déploiement

À exécuter depuis un réseau **hors de** celui de l'association (ex. connexion 4G), une fois les briques réseau du §4 en place.

**État réel de cette checklist, tenu à jour dans `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` §13 et §18 plutôt que dupliqué ici** (déjà validés sur le PC de test au 2026-09-07 : accès public `/preinscription`, blocage des routes privées y compris `/api/internal/n8n/*`, Postgres non exposé, contrôles de fichiers, soumission fictive de bout en bout). Reste à revalider intégralement une fois le tunnel migré sur le NAS. Rappel des points couverts :

- `https://<domaine-public>/preinscription` répond normalement.
- `https://<domaine-public>/etudiants`, `/admin`, toute autre route de l'app → doit échouer (erreur 404 côté application, la requête n'atteint jamais une page protégée par login).
- `https://<domaine-public>/api/internal/n8n/...` → doit échouer publiquement (cette route n'est destinée qu'à un usage interne).
- `<adresse-du-NAS>:5432` (Postgres) → doit être injoignable depuis Internet.
- Soumission du formulaire avec un code e-mail déjà utilisé → refusée.
- Soumission avec un fichier renommé en `.pdf` mais dont le contenu n'est pas un PDF → refusée (déjà vérifiable en local, indépendamment du tunnel — voir `src/lib/fichiers-uploades.test.ts`).
- Soumission d'un fichier dépassant la limite de taille configurée → refusée avec message clair (idem, déjà vérifiable en local).
- Une dizaine de tentatives rapprochées de vérification de code depuis la même IP → ralenties/bloquées (idem, déjà vérifiable en local — voir `src/lib/rate-limit.test.ts`).

## 6. Indépendance vis-à-vis du fournisseur

Ce document décrit des **fonctions**, pas un produit précis, pour que le remplacement d'un fournisseur par un autre reste localisé :

| Fonction | Ce qu'il faut chercher chez un autre fournisseur |
|---|---|
| Tunnel sortant | Un client qui initie une connexion sortante chiffrée depuis le NAS vers l'edge du fournisseur, sans port entrant à ouvrir |
| Filtrage de route | Des règles d'ingress capables de router par chemin d'URL, pas seulement par nom d'hôte, avec un refus explicite par défaut |
| Anti-abus | Un challenge de type CAPTCHA léger + une limitation de débit par IP configurable sur une route précise |

En cas de migration, seule la configuration côté fournisseur change (§4, points 4-5). Le code de l'application et les correctifs du §2 restent valides quel que soit le fournisseur.

## 7. Procédure de rollback / désactivation rapide

Pour couper l'accès public sans toucher à l'application ni aux données, une fois le tunnel en place :

1. Désactiver ou supprimer la règle de routage qui expose `/preinscription*` côté fournisseur (§4, point 4). Effet immédiat, aucune donnée existante affectée.
2. Optionnel : arrêter le service de tunnel sortant sur l'hôte.
3. L'application continue de fonctionner normalement en interne pour le staff (aucune dépendance inverse).

Pour réactiver : reconfigurer la règle de routage désactivée à l'étape 1.

## 8. Maintenance courante

- Purger périodiquement les codes de préinscription expirés et non utilisés (les deux origines, `codePreinscription`).
- Revoir la liste des règles de filtrage de route après toute évolution de l'application (une nouvelle route publique ne doit jamais être ajoutée sans décision explicite).
- Surveiller les tentatives bloquées par l'anti-abus comme indicateur d'usage anormal.
- Sauvegardes **des données** : voir `DEPLOIEMENT.md` existant (`scripts/backup.sh`), inchangé par cette architecture — les préinscriptions et leurs documents suivent le même cycle de sauvegarde que le reste de l'application. À distinguer de la sauvegarde **de la configuration d'infrastructure** (tunnel Cloudflare, token, réglages) — celle-ci reste à mettre en place, voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` §18 « À faire ».

## 9. Ce qui change explicitement lors du passage PC → NAS **[À ADAPTER, non vérifié]**

- Adresse/nom d'hôte interne ciblé par le tunnel (actuellement le PC de dev).
- `DOCUMENTS_DIR` et le bind mount associé dans `docker-compose.yml` (déjà anticipé dans le fichier existant : `./data/documents`, chemin à confirmer sur le NAS).
- Emplacement et automatisation de `scripts/backup.sh` (cron déjà documenté dans `DEPLOIEMENT.md`, à recréer sur le NAS).
- Pare-feu/réseau local du NAS : confirmer qu'aucun port (`3000`, `5432`, `5678`) n'est routé depuis l'extérieur indépendamment du tunnel, y compris via un éventuel réglage UPnP par défaut du NAS.
