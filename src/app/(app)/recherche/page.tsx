import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, hasRole } from "@/lib/roles";
import { JOUR_LABELS } from "@/lib/planning";

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
        <h2 className="text-lg font-semibold text-slate-900">Recherche</h2>
        <p className="text-sm text-slate-500">
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
        <h2 className="text-lg font-semibold text-slate-900">
          Résultats pour « {recherche} »
        </h2>
        <p className="text-sm text-slate-500">
          {total} résultat(s) — étudiants, classes/cours, trésorerie
          {peutVoirDocuments ? ", documents" : ""}.
        </p>
      </div>

      {etudiants.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Étudiants ({etudiants.length})
          </h3>
          <ul className="divide-y divide-slate-100">
            {etudiants.map((e) => (
              <li key={e.id} className="py-2">
                <Link href={`/etudiants/${e.id}`} className="text-sm font-medium text-slate-800 hover:underline">
                  {e.prenom} {e.nom}
                </Link>
                <span className="ml-2 text-xs text-slate-500">
                  {e.email ?? e.telephoneMobile ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {classes.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Classes / cours ({classes.length})
          </h3>
          <ul className="divide-y divide-slate-100">
            {classes.map((c) => (
              <li key={c.id} className="py-2">
                <Link href={`/classes/${c.id}`} className="text-sm font-medium text-slate-800 hover:underline">
                  {c.cours.nom}
                  {c.niveau && ` — ${c.niveau}`}
                </Link>
                <span className="ml-2 text-xs text-slate-500">
                  {JOUR_LABELS[c.jour]} {c.heureDebut}–{c.heureFin}
                  {c.salle && ` · ${c.salle}`} · {c.anneeScolaire.libelle}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mouvements.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Trésorerie ({mouvements.length})
          </h3>
          <ul className="divide-y divide-slate-100">
            {mouvements.map((m) => (
              <li key={m.id} className="py-2">
                <Link href={`/tresorerie/${m.id}`} className="text-sm font-medium text-slate-800 hover:underline">
                  {m.libelle}
                </Link>
                <span className="ml-2 text-xs text-slate-500">
                  {new Date(m.date).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {peutVoirDocuments && documents.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Documents ({documents.length})
          </h3>
          <ul className="divide-y divide-slate-100">
            {documents.map((d) => (
              <li key={d.id} className="py-2">
                <a
                  href={`/etudiants/${d.etudiantId}/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-slate-800 hover:underline"
                >
                  {d.nomFichier}
                </a>
                <span className="ml-2 text-xs text-slate-500">
                  {d.etudiant.prenom} {d.etudiant.nom}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {total === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
          Aucun résultat pour « {recherche} ».
        </p>
      )}
    </div>
  );
}
