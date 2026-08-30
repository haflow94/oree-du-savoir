import { prisma } from "@/lib/prisma";
import { PreinscriptionForm } from "./preinscription-form";
import { EmptyState } from "@/components/ui/empty-state";
import { anneeScolaireActiveId } from "@/lib/sections-etudiant";
import { JOUR_LABELS } from "@/lib/planning";

// Sans ceci, Next préoptimiserait la page en statique (aucun cookie/searchParams
// lu) : la liste des sections serait figée au moment du build Docker, pas
// relue en base à chaque visite — un tarif changé depuis Administration
// n'apparaîtrait jamais sur ce formulaire public sans reconstruire l'image.
export const dynamic = "force-dynamic";

export default async function PreinscriptionPage() {
  const anneeActiveId = await anneeScolaireActiveId();

  const [sections, classes, catalogue] = await Promise.all([
    prisma.section.findMany({ orderBy: { nom: "asc" } }),
    anneeActiveId
      ? prisma.classe.findMany({
          where: { anneeScolaireId: anneeActiveId },
          include: { cours: true },
          orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
        })
      : Promise.resolve([]),
    prisma.creneauSection.findMany({ orderBy: [{ sectionId: "asc" }, { ordre: "asc" }] }),
  ]);

  const creneaux = classes.map((c) => ({
    id: c.id,
    sectionId: c.cours.sectionId,
    label:
      `${c.cours.nom}${c.niveau ? ` — ${c.niveau}` : ""} · ${JOUR_LABELS[c.jour]} ${c.heureDebut}-${c.heureFin}`,
  }));

  // Catalogue des créneaux (voir Administration → Sections) : utilisé quand
  // aucune Classe réelle n'existe encore pour la section choisie — sans lui,
  // le choix CS/S/D/restriction de la famille serait perdu à la
  // préinscription (voir preinscription-form.tsx et actions.ts).
  const catalogueCreneaux = catalogue.map((c) => ({
    id: c.id,
    sectionId: c.sectionId,
    label: `${c.code} — ${c.jour}, ${c.horaire}${c.restriction ? ` (${c.restriction})` : ""}`,
  }));

  return (
    <div className="flex min-h-screen flex-1 justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="font-display text-xl font-bold text-pine-strong">L&apos;Orée du Savoir</h1>
          <p className="mt-1 text-sm text-ink-muted">Préinscription en ligne</p>
        </div>

        {sections.length === 0 ? (
          <EmptyState
            message="La préinscription en ligne n'est pas encore disponible."
            hint="Merci de contacter directement l'association."
          />
        ) : (
          <PreinscriptionForm
            sections={sections.map((s) => ({ id: s.id, nom: s.nom }))}
            creneaux={creneaux}
            catalogueCreneaux={catalogueCreneaux}
          />
        )}

        <p className="mt-6 text-center text-xs text-ink-faint">
          Cette préinscription n&apos;est pas définitive : elle sera confirmée
          sur place (signature, documents, paiement).
        </p>
      </div>
    </div>
  );
}
