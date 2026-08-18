# L'Orée du Savoir — Application de gestion

Application de gestion administrative pour l'association L'Orée du Savoir :
étudiants, inscriptions, classes/présences, paiements, trésorerie, comptes.
Remplace les fichiers Excel utilisés auparavant.

Écrite pour être reprise par n'importe quel développeur web généraliste,
sans connaissance préalable du projet — aucune technologie exotique.

## Pile technique

- **Next.js** (App Router) + React + TypeScript
- **PostgreSQL** via **Prisma**
- Déploiement **Docker Compose** (voir `DEPLOIEMENT.md`)
- Pas de dépendance à un service externe payant (pas de SaaS tiers requis
  pour faire tourner l'application)

## Démarrer en local

```bash
cp .env.example .env   # éditer les valeurs (voir DEPLOIEMENT.md)
npm install
npm run db:migrate     # applique le schéma Prisma
npm run db:seed        # crée le compte administrateur initial
npm run dev             # http://localhost:3000
```

Autres commandes utiles :

```bash
npm run build            # build de production
npm run lint              # ESLint
npm run test               # tests (vitest)
npm run db:seed:demo     # jeu de données de démonstration (destructif, voir le script)
npm run db:studio          # explorateur de base de données Prisma
```

## Où trouver quoi

| Besoin | Où regarder |
| --- | --- |
| Déployer, sauvegarder, restaurer | `DEPLOIEMENT.md` |
| Cahier des charges / règles métier d'origine | `Projet/` (à lire dans l'ordre indiqué par `Projet/README_CLAUDE.md`) |
| Schéma de base de données | `prisma/schema.prisma` (commenté phase par phase) |
| Rôles et qui peut faire quoi | `src/lib/roles.ts` (rôles) + `requireRole(...)` en tête de chaque action serveur (`src/app/**/actions.ts`) — c'est la source de vérité, pas un tableau séparé |
| Une page/écran donné | `src/app/(app)/<nom-de-la-page>/page.tsx` — l'arborescence des dossiers correspond à l'URL |

## Points importants pour un développeur qui découvre le projet

- **La tarification n'est pas codée en dur.** Les frais et le barème de
  remboursement par section (Jeunes, Langue Arabe, Études Coraniques, Études
  Islamiques) sont des données en base, modifiables depuis *Administration →
  Sections*. Si un tarif semble faux, corrigez-le là, pas dans le code.
- **Le dossier d'inscription officiel** est un PDF généré à la demande
  (`src/lib/dossier-officiel.tsx`, librairie `@react-pdf/renderer`) à partir
  des données de l'étudiant et de la section — pas de PDF pré-fabriqué, pas
  d'automatisation n8n.
- **Les fichiers uploadés** (pièce d'identité, documents…) ne sont jamais en
  base : seules les métadonnées le sont (table `Document`), les fichiers
  vivent sous `DOCUMENTS_DIR` (voir `src/lib/documents.ts`).
- **5 rôles fixes** (Bureau, Administration, Accueil, Trésorier, Enseignant),
  volontairement pas de système de permissions configurable — voir
  `src/lib/roles.ts`. Administration a les mêmes droits que Bureau partout
  sauf la gestion des comptes utilisateurs, qui reste réservée à Bureau.
- **Toutes les actions sensibles sont tracées** dans le journal d'audit
  (*Administration → Journal d'audit*, table `JournalAudit`).
- **`/preinscription`** est une page publique, accessible sans compte (voir
  l'exception dans `src/proxy.ts`) — attention à ne jamais y exposer de
  donnée ou d'action réservée au staff.

## Continuité si aucun développeur n'est disponible

- L'usage quotidien (inscriptions, présences, paiements, trésorerie) ne
  dépend d'aucun outil externe : c'est une application web autonome.
- Les données sont sauvegardables/restaurables via `scripts/backup.sh` et
  `scripts/restore.sh` (voir `DEPLOIEMENT.md`) — **mais ces scripts ne
  sauvegardent pas le code source**, seulement les données.
- Le code source doit lui-même être sauvegardé séparément (dépôt Git distant
  recommandé) : sans lui, même une sauvegarde de données parfaite ne permet
  pas de corriger un bug ou de redéployer sur un nouveau serveur.
