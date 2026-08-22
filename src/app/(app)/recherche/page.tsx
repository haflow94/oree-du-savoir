import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, hasRole } from "@/lib/roles";
import { JOUR_LABELS } from "@/lib/planning";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const PEUT_VOIR_DOCUMENTS = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const { q } = await searchParams;
  const recherche = q?.trim() ?? "";

  if (!recherche) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-semibold text-pine-strong">Recherche</h1>
        <p className="text-sm text-ink-muted">
          Cherche un étudiant, une classe/un cours, ou un mouvement de
          trésorerie depuis la barre en haut de l&apos;écran.
        </p>
      </div>
    );
  }

  const peutVoirDocuments = hasRole(session.role, PEUT_VOIR_DOCUMENTS);

  const [etudiants, classes, mouvements, documents] = await Promise.all([
    prisma.etudiant.findMany({
      where: {
        OR: [
          { nom: { contains: recherche, mode: "insensitive" } },
          { prenom: { contains: recherche, mode: "insensitive" } },
          { email: { contains: recherche, mode: "insensitive" } },
          { telephoneMobile: { contains: recherche, mode: "insensitive" } },
        ],
      },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      take: 20,
    }),
    prisma.classe.findMany({
      where: {
        OR: [
          { cours: { nom: { contains: recherche, mode: "insensitive" } } },
          { niveau: { contains: recherche, mode: "insensitive" } },
          { salle: { contains: recherche, mode: "insensitive" } },
        ],
      },
      include: { cours: true, anneeScolaire: true },
      orderBy: { jour: "asc" },
      take: 20,
    }),
    prisma.mouvementTresorerie.findMany({
      where: { libelle: { contains: recherche, mode: "insensitive" } },
      orderBy: { date: "desc" },
      take: 20,
    }),
    peutVoirDocuments
      ? prisma.document.findMany({
          where: { nomFichier: { contains: recherche, mode: "insensitive" } },
          include: { etudiant: true },
          orderBy: { creeLe: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const total = etudiants.length + classes.length + mouvements.length + documents.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-pine-strong">
          Résultats pour « {recherche} »
        </h1>
        <p className="text-sm text-ink-muted">
          {total} résultat(s) — étudiants, classes/cours, trésorerie
          {peutVoirDocuments ? ", documents" : ""}.
        </p>
      </div>

      {etudiants.length > 0 && (
        <Card>
          <CardTitle>Étudiants ({etudiants.length})</CardTitle>
          <ul className="mt-3 divide-y divide-border">
            {etudiants.map((e) => (
              <li key={e.id} className="py-2">
                <Link href={`/etudiants/${e.id}`} className="text-sm font-medium text-ink hover:underline">
                  {e.prenom} {e.nom}
                </Link>
                <span className="ml-2 text-xs text-ink-muted">
                  {e.email ?? e.telephoneMobile ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {classes.length > 0 && (
        <Card>
          <CardTitle>Classes / cours ({classes.length})</CardTitle>
          <ul className="mt-3 divide-y divide-border">
            {classes.map((c) => (
              <li key={c.id} className="py-2">
                <Link href={`/classes/${c.id}`} className="text-sm font-medium text-ink hover:underline">
                  {c.cours.nom}
                  {c.niveau && ` — ${c.niveau}`}
                </Link>
                <span className="ml-2 text-xs text-ink-muted">
                  {JOUR_LABELS[c.jour]} {c.heureDebut}–{c.heureFin}
                  {c.salle && ` · ${c.salle}`} · {c.anneeScolaire.libelle}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {mouvements.length > 0 && (
        <Card>
          <CardTitle>Trésorerie ({mouvements.length})</CardTitle>
          <ul className="mt-3 divide-y divide-border">
            {mouvements.map((m) => (
              <li key={m.id} className="py-2">
                <Link href={`/tresorerie/${m.id}`} className="text-sm font-medium text-ink hover:underline">
                  {m.libelle}
                </Link>
                <span className="ml-2 text-xs text-ink-muted">
                  {new Date(m.date).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {peutVoirDocuments && documents.length > 0 && (
        <Card>
          <CardTitle>Documents ({documents.length})</CardTitle>
          <ul className="mt-3 divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="py-2">
                <a
                  href={`/etudiants/${d.etudiantId}/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-ink hover:underline"
                >
                  {d.nomFichier}
                </a>
                <span className="ml-2 text-xs text-ink-muted">
                  {d.etudiant.prenom} {d.etudiant.nom}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {total === 0 && <EmptyState message={`Aucun résultat pour « ${recherche} ».`} />}
    </div>
  );
}
