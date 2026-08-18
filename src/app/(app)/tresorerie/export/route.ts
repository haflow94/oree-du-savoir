import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { versCsv, reponseCsv } from "@/lib/csv";
import { MOYEN_LABELS, TYPE_MOUVEMENT_LABELS } from "@/lib/paiements";

export async function GET(request: NextRequest) {
  await requireSession();
  const dateDebut = request.nextUrl.searchParams.get("dateDebut");
  const dateFin = request.nextUrl.searchParams.get("dateFin");

  // Le solde cumulé doit rester exact même filtré : on calcule sur tout
  // l'historique jusqu'à dateFin, mais on n'exporte que les lignes à partir
  // de dateDebut — sinon le solde affiché repartirait de zéro et ne
  // correspondrait plus à la réalité de la trésorerie.
  const mouvements = await prisma.mouvementTresorerie.findMany({
    where: dateFin ? { date: { lte: new Date(dateFin) } } : undefined,
    orderBy: [{ date: "asc" }, { creeLe: "asc" }],
    include: { categorie: true },
  });

  const debut = dateDebut ? new Date(dateDebut) : null;
  let solde = 0;
  const lignes: unknown[][] = [];
  for (const m of mouvements) {
    const montant = Number.parseFloat(m.montant.toString());
    solde += m.type === "RECETTE" ? montant : -montant;
    if (debut && m.date < debut) continue;
    lignes.push([
      m.date.toISOString().slice(0, 10),
      m.libelle,
      m.categorie?.nom ?? "",
      TYPE_MOUVEMENT_LABELS[m.type],
      MOYEN_LABELS[m.moyen],
      montant.toFixed(2),
      solde.toFixed(2),
      m.justificatif ?? "",
    ]);
  }

  const csv = versCsv(
    ["Date", "Libellé", "Catégorie", "Type", "Moyen", "Montant", "Solde cumulé", "Justificatif"],
    lignes,
  );

  return reponseCsv(`tresorerie-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
