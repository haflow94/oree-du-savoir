# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                 # dev server (Turbopack), http://localhost:3000
npm run build                # production build
npm run start                 # run the production build
npm run lint                   # ESLint
npm run test                    # vitest run (all tests)
npx vitest run src/lib/presences.test.ts   # single test file
npm run db:migrate            # prisma migrate dev — creates + applies a migration from schema.prisma changes
npm run db:seed                 # idempotent: creates the initial admin account (needs ADMIN_EMAIL/ADMIN_PASSWORD in .env) + active année scolaire + reference Sections
npm run db:seed:demo             # DESTRUCTIVE: wipes business data and loads a full demo dataset (refuses to run when NODE_ENV=production unless DEMO_SEED_FORCE=1)
npm run db:studio                 # Prisma Studio
```

Regenerate the Prisma client after any `schema.prisma` change that isn't picked up automatically: `npx prisma generate` (the generated client lives in `src/generated/prisma`, gitignored, and is imported as `@/generated/prisma/client` and `@/generated/prisma/enums` — not from `@prisma/client`).

No separate typecheck script; `npx tsc --noEmit` is the equivalent used during development.

## Architecture

Next.js App Router + TypeScript, PostgreSQL via Prisma (`@prisma/adapter-pg`, not the default engine), Tailwind. Deployed as a single Docker Compose stack (app + db) on a headless Linux server — see `DEPLOIEMENT.md`. No external SaaS dependency required for the app to run.

### Route structure

- `src/app/(app)/` — the authenticated application (sidebar layout in `(app)/layout.tsx`). Folder structure mirrors the URL (`(app)/etudiants/[id]/page.tsx` → `/etudiants/:id`).
- `src/app/login`, `src/app/preinscription`, `src/app/qr/[token]`, `src/app/acces-refuse` — public/standalone routes outside the `(app)` layout.
- `src/proxy.ts` (Edge middleware) only checks for the *presence* of the session cookie and redirects to `/login` if absent — it cannot query Postgres (`pg` adapter is Node-only). It excludes `/login` and `/preinscription` from that check. **Real auth/role enforcement happens in Server Components/actions**, not here.

### Auth & authorization (`src/lib/auth.ts`, `src/lib/roles.ts`)

- Sessions are DB-backed opaque tokens in an httpOnly cookie (table `Session`), not JWTs — deactivating a user or logging out invalidates immediately, no token blacklist needed.
- Every protected page calls `requireSession()` (any logged-in role) or `requireRole([Role.X, ...])` at the top — this is the actual security boundary. Every server action does the same at its first line, independently of the page (defense in depth: a page can hide a button, but the action re-checks).
- 5 fixed roles (`Role` enum, see `src/lib/roles.ts`): BUREAU, ADMINISTRATION, ACCUEIL, TRESORIER, ENSEIGNANT. Deliberately not a configurable permissions system — permissions are hardcoded per action, not editable from the UI. Administration has the same operational rights as Bureau everywhere *except* user account/role management, which stays Bureau-only (see `(app)/administration/page.tsx`, `(app)/administration/actions.ts`).
- `src/lib/acces-presence.ts` has the finer-grained rule for présences: an Enseignant only accesses classes they're assigned to (via `ClasseEnseignant`); Bureau/Administration ("administratif") access everything.

### Server actions pattern

Every mutating route has a colocated `actions.ts` (`"use server"`) next to its `page.tsx`. Convention used throughout:
1. `requireRole([...])` first.
2. Validate/parse `FormData` with small local `champTexte`/`champXxx` helpers (no shared form library).
3. Mutate via `prisma.$transaction([...])`, usually paired with a `prisma.journalAudit.create(...)` in the same transaction for traceability.
4. `revalidatePath(...)` then a `retour(id, erreurCode?)` helper that `redirect()`s back to the page with `?ok=1` or `?error=CODE`, where the page maps the code to a French message via a local `MESSAGES` record.

Public/unauthenticated actions (e.g. `src/app/preinscription/actions.ts`) skip step 1 entirely and return a plain result object instead of redirecting, since the calling client component isn't a plain `<form action=...>`.

### Data model (`prisma/schema.prisma`, commented phase-by-phase)

- `Etudiant` is the single record per person (never store "classe" as free text on it) — `responsables`, `dossiersAnnuels`, `inscriptions`, `documents` all hang off it. `statutInscription` (PREINSCRIT/VALIDE) distinguishes a public préinscription from a staff-confirmed dossier.
- `Cours` (subject) vs `Classe` (concrete timetabled group: cours + niveau + one weekly slot + teachers) are distinct — don't conflate them.
- `Section` (Jeunes, Langue Arabe, Études Coraniques, Études Islamiques) is the pricing/refund-schedule reference data, editable from *Administration → Sections*, not hardcoded. A `Cours` belongs to a `Section`.
- `Seance` rows are generated from a `Classe`'s weekly slot across its `AnneeScolaire` date range, skipping `PeriodeFermeture` ranges (`src/lib/presences.ts` — `datesDesSeances`). Regenerating is idempotent (`skipDuplicates`); editing/deleting a `PeriodeFermeture` afterward does *not* retroactively regenerate skipped séances.
- `Presence` is only ever written when a teacher explicitly validates a séance's sheet — the non-negotiable rule is **never guess/default an absence**.
- `DossierAnnuel` (one per étudiant × année, manually-entered `montantDu`) → `Echeance` → `Paiement` (→ `Cheque` if moyen = CHEQUE) → `Cheque.statut` lifecycle (RECU → DEPOSE → ENCAISSE/REJETE).
- `Document` stores metadata only; the actual file lives on disk under `DOCUMENTS_DIR` (`src/lib/documents.ts`). Never build a file path from client input — always resolve through the DB row's stored `cheminRelatif`.
- `JournalAudit` is the append-only trail for sensitive actions across the app, surfaced at *Administration → Journal d'audit* (Bureau-only).

### PDF generation (`src/lib/dossier-officiel.tsx`)

The official "dossier d'inscription" is generated server-side with `@react-pdf/renderer` (no headless browser/Chromium dependency — keeps the Docker image light) from live DB data (étudiant + chosen `Section`'s tariffs/refund schedule), not a static template. Route handler `(app)/etudiants/[id]/dossier/route.ts` renders it, persists it as a `Document` (type DOSSIER_GENERE) so it stays retrievable after the physical signature, and streams it back.

### Non-negotiable rules (`Projet/04_Regles_non_negociables.md`)

- No over-engineering; the MVP replaces the association's Excel files, it doesn't technically reproduce them.
- Files always separate from the database (see `Document`/`DOCUMENTS_DIR` above).
- QR codes are a shortcut to the day's séance, never an authentication mechanism — the teacher must still be logged in.
- Never guess absences.
- Treasury (`MouvementTresorerie`) stays simple — not full accounting.
- n8n may automate things (emails, reminders) around the app, but the app must fully function without it — none of that is built yet, and nothing in the app should end up depending on it.
- Never silently change a business rule (e.g. a Section's refund percentages) — those are association decisions, surfaced as editable data (*Administration → Sections*), not constants to tweak in code.

### Reference docs

`Projet/` holds the original functional spec — read in the order listed in `Projet/README_CLAUDE.md`. `DEPLOIEMENT.md` covers Docker deployment, backup/restore, and required env vars (`.env.example`).
