import { prisma } from "@/lib/prisma";
import { PreinscriptionForm } from "./preinscription-form";

// Sans ceci, Next préoptimiserait la page en statique (aucun cookie/searchParams
// lu) : la liste des sections serait figée au moment du build Docker, pas
// relue en base à chaque visite — un tarif changé depuis Administration
// n'apparaîtrait jamais sur ce formulaire public sans reconstruire l'image.
export const dynamic = "force-dynamic";

export default async function PreinscriptionPage() {
  const sections = await prisma.section.findMany({ orderBy: { nom: "asc" } });

  return (
    <div className="flex min-h-screen flex-1 justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">L&apos;Orée du Savoir</h1>
          <p className="mt-1 text-sm text-slate-500">Préinscription en ligne</p>
        </div>

        {sections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            La préinscription en ligne n&apos;est pas encore disponible.
            Merci de contacter directement l&apos;association.
          </p>
        ) : (
          <PreinscriptionForm sections={sections.map((s) => ({ id: s.id, nom: s.nom }))} />
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Cette préinscription n&apos;est pas définitive : elle sera confirmée
          sur place (signature, documents, paiement).
        </p>
      </div>
    </div>
  );
}
