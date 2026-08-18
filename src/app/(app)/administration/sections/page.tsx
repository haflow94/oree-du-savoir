import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import {
  creerSectionAction,
  modifierSectionAction,
  supprimerSectionAction,
} from "./actions";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES:
    "Vérifiez les champs : montants en euros (ex. 490 ou 490.50), pourcentages entre 0 et 100, volume horaire un nombre entier positif.",
  NOM_DEJA_UTILISE: "Une section porte déjà ce nom.",
  INTROUVABLE: "Cette section n'existe plus.",
  SECTION_UTILISEE:
    "Impossible de supprimer : des cours sont rattachés à cette section. Déplacez-les d'abord depuis la page Classes.",
};

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireRole([Role.ADMINISTRATION, Role.BUREAU]);
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const sections = await prisma.section.findMany({
    orderBy: { nom: "asc" },
    include: { _count: { select: { cours: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/administration" className="text-sm text-slate-500 hover:underline">
          ← Administration
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Sections</h2>
        <p className="text-sm text-slate-500">
          Tarification et barème de remboursement par section (Jeunes,
          Langue Arabe, Études Coraniques, Études Islamiques…).
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

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Créer une section
        </h3>
        <form action={creerSectionAction} className="grid gap-3 sm:grid-cols-3">
          <ChampsSection />
          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Créer la section
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        {sections.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="font-medium text-slate-800">
                {s.nom}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {s._count.cours} cours rattaché(s)
                </span>
              </div>
              <form action={supprimerSectionAction}>
                <input type="hidden" name="sectionId" value={s.id} />
                <button
                  type="submit"
                  disabled={s._count.cours > 0}
                  title={
                    s._count.cours > 0
                      ? "Des cours sont rattachés à cette section : impossible de la supprimer."
                      : undefined
                  }
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Supprimer
                </button>
              </form>
            </div>

            <form action={modifierSectionAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="sectionId" value={s.id} />
              <ChampsSection
                defaults={{
                  nom: s.nom,
                  fraisFormation: s.fraisFormation.toString(),
                  fraisDossier: s.fraisDossier.toString(),
                  volumeHoraireAnnuel: s.volumeHoraireAnnuel?.toString() ?? "",
                  remboursementAvant15Jours: s.remboursementAvant15Jours.toString(),
                  remboursementAvant29Jours: s.remboursementAvant29Jours.toString(),
                }}
              />
              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        ))}
        {sections.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
            Aucune section enregistrée.
          </p>
        )}
      </div>
    </div>
  );
}

function ChampsSection({
  defaults,
}: {
  defaults?: {
    nom: string;
    fraisFormation: string;
    fraisDossier: string;
    volumeHoraireAnnuel: string;
    remboursementAvant15Jours: string;
    remboursementAvant29Jours: string;
  };
}) {
  const idSuffix = defaults ? `-${defaults.nom}` : "-nouvelle";
  return (
    <>
      <div>
        <label htmlFor={`nom${idSuffix}`} className="mb-1 block text-xs font-medium text-slate-600">
          Nom
        </label>
        <input
          id={`nom${idSuffix}`}
          name="nom"
          required
          defaultValue={defaults?.nom}
          placeholder="ex. Langue Arabe"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label htmlFor={`fraisFormation${idSuffix}`} className="mb-1 block text-xs font-medium text-slate-600">
          Frais de formation (€)
        </label>
        <input
          id={`fraisFormation${idSuffix}`}
          name="fraisFormation"
          required
          inputMode="decimal"
          placeholder="490"
          defaultValue={defaults?.fraisFormation}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label htmlFor={`fraisDossier${idSuffix}`} className="mb-1 block text-xs font-medium text-slate-600">
          Frais de dossier (€)
        </label>
        <input
          id={`fraisDossier${idSuffix}`}
          name="fraisDossier"
          required
          inputMode="decimal"
          placeholder="60"
          defaultValue={defaults?.fraisDossier}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label htmlFor={`volumeHoraireAnnuel${idSuffix}`} className="mb-1 block text-xs font-medium text-slate-600">
          Volume horaire annuel (h, optionnel)
        </label>
        <input
          id={`volumeHoraireAnnuel${idSuffix}`}
          name="volumeHoraireAnnuel"
          inputMode="numeric"
          placeholder="120"
          defaultValue={defaults?.volumeHoraireAnnuel}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label htmlFor={`remboursementAvant15Jours${idSuffix}`} className="mb-1 block text-xs font-medium text-slate-600">
          % remboursé (1er au 15e jour après le début)
        </label>
        <input
          id={`remboursementAvant15Jours${idSuffix}`}
          name="remboursementAvant15Jours"
          required
          inputMode="numeric"
          min={0}
          max={100}
          placeholder="50"
          defaultValue={defaults?.remboursementAvant15Jours}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label htmlFor={`remboursementAvant29Jours${idSuffix}`} className="mb-1 block text-xs font-medium text-slate-600">
          % remboursé (15e au 29e jour après le début)
        </label>
        <input
          id={`remboursementAvant29Jours${idSuffix}`}
          name="remboursementAvant29Jours"
          required
          inputMode="numeric"
          min={0}
          max={100}
          placeholder="25"
          defaultValue={defaults?.remboursementAvant29Jours}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
    </>
  );
}
