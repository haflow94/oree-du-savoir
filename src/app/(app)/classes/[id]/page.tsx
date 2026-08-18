import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, hasRole } from "@/lib/roles";
import { estAdministratif } from "@/lib/acces-presence";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import {
  genererSeancesAction,
  inscrireEtudiantAction,
  retirerEtudiantAction,
} from "../../presences/actions";
import { modifierClasseAction, supprimerClasseAction } from "./actions";

const PEUT_GERER = [Role.ADMINISTRATION, Role.BUREAU];

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Jour et horaires sont obligatoires.",
  CLASSE_UTILISEE:
    "Impossible de supprimer : des séances ou des inscriptions existent déjà pour cette classe.",
};

export default async function ClasseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const peutGerer = hasRole(session.role, PEUT_GERER);
  const { id } = await params;
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

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
      _count: { select: { seances: true, inscriptions: true } },
    },
  });

  if (!classe) {
    notFound();
  }

  const administratif = estAdministratif(session.role);
  const peutInscrire = administratif || session.role === Role.ACCUEIL;

  const enseignantsDisponibles = peutGerer
    ? await prisma.utilisateur.findMany({
        where: { role: Role.ENSEIGNANT, actif: true },
        orderBy: [{ nom: "asc" }],
      })
    : [];
  const enseignantsAssignes = new Set(classe.enseignants.map((e) => e.utilisateurId));
  const peutSupprimer = classe._count.seances === 0 && classe._count.inscriptions === 0;

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

      {message && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}
      {ok && !message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Modification enregistrée.
        </p>
      )}

      {peutGerer && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Modifier la classe</h3>
            <form action={supprimerClasseAction}>
              <input type="hidden" name="classeId" value={classe.id} />
              <button
                type="submit"
                disabled={!peutSupprimer}
                title={
                  !peutSupprimer
                    ? "Des séances ou des inscriptions existent déjà : impossible de supprimer cette classe."
                    : undefined
                }
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Supprimer la classe
              </button>
            </form>
          </div>
          <form action={modifierClasseAction} className="space-y-4">
            <input type="hidden" name="classeId" value={classe.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Niveau</label>
                <input
                  name="niveau"
                  defaultValue={classe.niveau ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Semestre (optionnel)
                </label>
                <select
                  name="semestre"
                  defaultValue={classe.semestre ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">Toute l&apos;année</option>
                  <option value="1">Semestre 1</option>
                  <option value="2">Semestre 2</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Salle</label>
                <input
                  name="salle"
                  defaultValue={classe.salle ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Jour</label>
                <select
                  name="jour"
                  required
                  defaultValue={classe.jour}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  {JOURS_ORDONNES.map((j) => (
                    <option key={j} value={j}>
                      {JOUR_LABELS[j]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Heure de début
                </label>
                <input
                  type="time"
                  name="heureDebut"
                  required
                  defaultValue={classe.heureDebut}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Heure de fin
                </label>
                <input
                  type="time"
                  name="heureFin"
                  required
                  defaultValue={classe.heureFin}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Capacité</label>
                <input
                  type="number"
                  min={0}
                  name="capacite"
                  defaultValue={classe.capacite ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Enseignant(s)
              </label>
              {enseignantsDisponibles.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun compte Enseignant actif.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {enseignantsDisponibles.map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        name="enseignants"
                        value={e.id}
                        defaultChecked={enseignantsAssignes.has(e.id)}
                      />
                      {e.prenom} {e.nom}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

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
