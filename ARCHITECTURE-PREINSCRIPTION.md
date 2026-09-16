# Architecture de la préinscription en ligne — L'Orée du Savoir

**Statut (mis à jour 2026-09-16)** : architecture retenue, décrite ci-dessous. La couche applicative (§5, briques 3 et 4 côté application) est implémentée et testée — voir `DEPLOIEMENT-PREINSCRIPTION.md` §2 pour le détail. Les briques réseau (tunnel sortant, accès HTTPS) sont **en place et testées de bout en bout sur le PC de test** (voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` pour la configuration concrète et l'état de validation) ; l'anti-abus (Managed Challenge Cloudflare, basé sur Turnstile) est **déployé** sur le hostname `preinscription.loreedusavoir.fr` (règle de sécurité Cloudflare "Anti-abus préinscription", vérifiée le 2026-09-16 — un accès non-navigateur reçoit bien la page de challenge Cloudflare, 403 « Just a moment... »). Seule la migration vers le NAS cible et le filtrage de route fin côté fournisseur restent à faire. Ce document explique le *choix*, pas l'état détaillé du serveur. Les documents techniques associés (`DEPLOIEMENT-PREINSCRIPTION.md`, `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md`) précisent ce qui est effectivement en place.

---

## 1. Objectif

Permettre à une famille contactée personnellement par l'association (son e-mail est déjà connu de nous) de remplir en ligne un formulaire de préinscription, avec ses documents justificatifs, **sans jamais avoir accès à autre chose que ce formulaire**. Pas de compte, pas de mot de passe étudiant, pas de vue sur les autres dossiers, pas d'accès à l'administration.

## 2. Principe en une phrase

L'application de gestion (étudiants, classes, trésorerie...) **reste totalement privée**. Seule une toute petite porte, une seule page, est ouverte sur Internet — le reste de l'application n'est tout simplement pas joignable depuis l'extérieur, quoi qu'il arrive.

## 3. Comment une famille y accède

1. L'association envoie un e-mail personnel à la famille, avec un lien contenant un **code à usage unique**.
2. La famille clique, arrive sur la page de préinscription.
3. Elle remplit ses informations et joint ses documents (photo, pièce d'identité...).
4. Elle envoie. Le code devient alors invalide — il ne peut plus resservir, même si le lien est retransmis par erreur.
5. Le dossier arrive dans l'application, au statut "préinscrit". Il est **vérifié et complété sur place** par le staff (comme aujourd'hui) — la préinscription en ligne n'est jamais définitive.

Le code n'est **ni un compte, ni un mot de passe**. Il ne donne accès qu'à cette page, une seule fois, pour cette famille-là.

> Complément implémenté depuis la rédaction initiale de ce document : une seconde origine de code existe désormais pour une famille présente physiquement à l'accueil (QR affiché sur place, scanné directement plutôt qu'un lien reçu par e-mail). Ce code-là n'est volontairement pas à usage unique — voir `DEPLOIEMENT-PREINSCRIPTION.md` §3 pour le détail des deux origines.
>
> Troisième mode d'accès, existant depuis l'origine mais non décrit ci-dessus : le code n'est un verrou que **quand il est explicitement fourni dans l'URL**. Une visite directe sur `/preinscription`, sans lien d'invitation ni QR, laisse le formulaire ouvert — comportement volontaire (voir le commentaire dans `src/app/preinscription/page.tsx`), seule la limitation de débit à la soumission s'applique alors (`src/lib/rate-limit.ts`). C'est ce mode « sans code » que le futur QR permanent envisagé dans `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` §2 est destiné à exploiter : contrairement à l'objectif énoncé au §1 ci-dessus (accès réservé aux familles invitées), l'exposition du hostname public rend donc aujourd'hui le formulaire librement accessible à quiconque connaît ou devine l'URL publique, invité ou non.

## 4. Ce qui est public, ce qui reste privé

| | Accessible depuis Internet | Accessible uniquement en interne |
|---|---|---|
| Formulaire de préinscription | ✅ | |
| Consultation des étudiants, classes, présences | | ✅ |
| Trésorerie, paiements | | ✅ |
| Administration, gestion des comptes | | ✅ |
| Base de données | | ✅ |
| Fichiers/documents déjà enregistrés | | ✅ |

Cette séparation n'est pas une simple promesse du code de l'application : elle est appliquée **avant même que la demande n'atteigne le serveur**, par le composant de filtrage décrit ci-dessous. Même une erreur de configuration future dans l'application ne suffirait pas à rouvrir ces accès depuis l'extérieur.

## 5. Les quatre briques de protection

Aucune de ces briques n'est liée à une marque précise — ce sont des *fonctions*. Le fournisseur qui les assure aujourd'hui est noté à titre indicatif ; il peut être remplacé sans changer ce document.

| Fonction | À quoi ça sert | Fournisseur actuel | Statut |
|---|---|---|---|
| **Accès public sécurisé (HTTPS)** | Le point d'entrée unique sur Internet, avec chiffrement | Cloudflare | Déployé (PC de test), voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` |
| **Tunnel sortant** | La machine qui héberge l'application se connecte *vers* ce point d'entrée, elle n'ouvre jamais de porte entrante. Comme un standard téléphonique qui rappelle toujours vers l'extérieur, jamais l'inverse. | Cloudflare Tunnel (`cloudflared`) | Déployé (PC de test), voir `CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` |
| **Filtrage de route** | Seule l'adresse du formulaire est transmise à l'application. Toute autre adresse (admin, base de données...) est refusée avant même d'arriver sur le serveur. | Règles d'ingress Cloudflare | La route Cloudflare reste en wildcard (`*`) : seul le filtrage fin par chemin côté fournisseur manque encore — **complété côté application** : `src/proxy.ts` refuse lui-même (404) tout ce qui n'est pas `/preinscription` + ressources Next.js nécessaires dès que la requête porte le hostname public (`PREINSCRIPTION_PUBLIC_HOSTNAME`, voir `.env.example`) — l'authentification de l'app privée n'est volontairement pas considérée comme une protection suffisante pour ce hostname |
| **Protection contre les abus** | Ralentit/bloque les robots et les tentatives répétées (deviner un code, envoyer des milliers de formulaires) | Cloudflare Turnstile + limitation de débit | Limitation de débit **implémentée côté application** (`src/lib/rate-limit.ts`) ; Managed Challenge (Turnstile) **déployé** côté Cloudflare — règle de sécurité "Anti-abus préinscription" (WAF → Règles de sécurité) sur le hostname `preinscription.loreedusavoir.fr`, action Managed Challenge, vérifiée le 2026-09-16 |

## 6. Pourquoi ce choix plutôt qu'un site séparé sur un hébergeur cloud (Vercel, Netlify...)

L'idée de départ envisageait un site public séparé, hébergé ailleurs, qui contacterait ensuite l'application via une API. Cette option a été écartée pour deux raisons concrètes :

- Il aurait fallu **réécrire une deuxième fois** toutes les règles déjà présentes dans l'application (doublons, champs obligatoires, RGPD...), avec le risque que les deux versions divergent avec le temps.
- Ces hébergeurs limitent la taille des fichiers envoyés en une fois (autour de 4,5 Mo chez certains) — une photo de pièce d'identité dépasse souvent cette limite, ce qui aurait obligé à ajouter un stockage de fichiers supplémentaire, donc un sous-traitant de données de plus.

La solution retenue réutilise le formulaire déjà écrit dans l'application, et n'ajoute qu'une couche de filtrage réseau devant — plus simple, moins de pièces mobiles, aucune donnée qui transite ou stationne ailleurs que sur notre propre serveur.

## 7. État actuel : PC, pas encore NAS

Au moment de la rédaction, l'application tourne sur un PC, pas encore sur le NAS cible. Cette architecture fonctionne à l'identique sur les deux : seuls des réglages d'adresse/chemin changent (détaillés dans le document technique). **Rien dans ce document ne doit être lu comme une confirmation que le NAS est déjà configuré.**

## 8. Changer de stratégie ou revenir en arrière

Couper l'accès public au formulaire ne touche jamais à l'application elle-même : elle continue de fonctionner normalement pour le staff en interne. Il suffit de désactiver la règle de filtrage de route (la brique n°3) — l'e-mail avec les codes ne mène alors plus nulle part, sans qu'aucune donnée existante ne soit affectée. La procédure exacte est dans `DEPLOIEMENT-PREINSCRIPTION.md`.

## 9. Document complémentaire

`CONFIGURATION-CLOUDFLARE-PREINSCRIPTION.md` décrit la configuration concrète actuellement en place (nom du tunnel, hostname, route Cloudflare, état de validation) — ce document-ci reste la référence pour le *choix* d'architecture, l'autre pour son état d'implémentation réel.
