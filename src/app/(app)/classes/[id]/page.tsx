import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { estAdministratif } from "@/lib/acces-presence";
import { JOUR_LABELS } from "@/lib/planning";
import {
  genererSeancesAction,
  inscrireEtudiantAction,
  retirerEtudiantAction,
} from "../../presences/actions";

export default async function ClasseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const classe = await prisma.classe.findUnique({
    where: { id },
    include: {
      cours: true,
      anneeScolaire: true,
      enseignants: { include: { utilisateur: true } },
      inscriptions: {
        include: { etudiant: true },
        orderBy: { etudiant: { nom: "asc" } },
      },
      _count: { select: { seances: true } },
    },
  });

  if (!classe) {
    notFound();
  }

  const administratif = estAdministratif(session.role);
  const peutInscrire = administratif || session.role === Role.ACCUEIL;

  const dejaInscrits = new Set(classe.inscriptions.map((i) => i.etudiantId));
  const etudiantsDisponibles = peutInscrire
    ? (
        await prisma.etudiant.findMany({
          orderBy: [{ nom: "asc" }, { prenom: "asc" }],
        })
      ).filter((e) => !dejaInscrits.has(e.id))
    : [];

  // Le QR pointe vers une URL relative : il reste valable quel que soit le
  // nom d'hôte du serveur (voir DEPLOIEMENT.md, cible non figée).
  const cheminQr = `/qr/${classe.qrToken}`;
  const qrSvg = await QRCode.toString(cheminQr, {
    type: "svg",
    margin: 1,
    width: 160,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/classes" className="text-sm text-slate-500 hover:underline">
          ← Classes
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {classe.cours.nom}
          {classe.niveau && ` — ${classe.niveau}`}
        </h2>
        <p className="text-sm text-slate-500">
          {JOUR_LABELS[classe.jour]} {classe.heureDebut}–{classe.heureFin}
          {classe.salle && ` · ${classe.salle}`}
          {` · ${classe.anneeScolaire.libelle}`}
          {classe.semestre && ` · semestre ${classe.semestre}`}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Enseignant(s) :{" "}
          {classe.enseignants.length > 0
            ? classe.enseignants
                .map((e) => `${e.utilisateur.prenom} ${e.utilisateur.nom}`)
                .join(", ")
            : "—"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">
            QR d&apos;accès à la séance du jour
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            À afficher en salle. Le QR ne connecte personne : l&apos;enseignant
            doit être authentifié.
          </p>
          <div
            className="mt-3 inline-block rounded-lg bg-white p-2 ring-1 ring-slate-200"
            // SVG produit côté serveur par la bibliothèque qrcode à partir
            // d'un chemin interne : aucune donnée utilisateur n'y transite.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 break-all font-mono text-xs text-slate-400">
            {cheminQr}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Séances</h3>
          <p className="mt-1 text-3xl font-bold text-slate-800">
            {classe._count.seances}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Générées depuis le planning sur {classe.anneeScolaire.libelle}, en
            sautant les périodes de fermeture.
          </p>
          {administratif && (
            <form action={genererSeancesAction} className="mt-3">
              <input type="hidden" name="classeId" value={classe.id} />
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Générer les séances manquantes
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Étudiants inscrits ({classe.inscriptions.length}
          {classe.capacite ? ` / ${classe.capacite}` : ""})
        </h3>

        {classe.inscriptions.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun étudiant inscrit.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {classe.inscriptions.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2.5">
                <Link
                  href={`/etudiants/${i.etudiantId}`}
                  className="text-sm font-medium text-slate-800 hover:underline"
                >
                  {i.etudiant.prenom} {i.etudiant.nom}
                </Link>
                {peutInscrire && (
                  <form action={retirerEtudiantAction}>
                    <input type="hidden" name="inscriptionId" value={i.id} />
                    <input type="hidden" name="classeId" value={classe.id} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Retirer
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {peutInscrire && etudiantsDisponibles.length > 0 && (
          <form action={inscrireEtudiantAction} className="mt-4 flex flex-wrap gap-2">
            <input type="hidden" name="classeId" value={classe.id} />
            <select
              name="etudiantId"
              required
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              {etudiantsDisponibles.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} {e.prenom}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Inscrire
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
