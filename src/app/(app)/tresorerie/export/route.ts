import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { versCsv, reponseCsv } from "@/lib/csv";
import { MOYEN_LABELS } from "@/lib/paiements";

export async function GET(request: NextRequest) {
  await requireSession();
  const params = request.nextUrl.searchParams;
  const dateDebut = params.get("dateDebut");
  const dateFin = params.get("dateFin");
  const type = params.get("type");
  const categorieId = params.get("categorieId");
  const moyen = params.get("moyen");
  const recherche = params.get("q")?.trim().toLowerCase() || "";

  // Le solde cumulé doit rester exact même filtré : calculé sur tout
  // l'historique chronologique, les filtres ne décidant que des lignes
  // exportées — sinon le solde affiché ne correspondrait plus à la réalité
  // de la trésorerie (voir la même règle sur la page /tresorerie).
  const mouvements = await prisma.mouvementTresorerie.findMany({
    orderBy: [{ date: "asc" }, { creeLe: "asc" }],
    include: { categorie: true },
  });

  let solde = 0;
  const lignes: unknown[][] = [];
  for (const m of mouvements) {
    const montant = Number.parseFloat(m.montant.toString());
    solde += m.type === "RECETTE" ? montant : -montant;
    const dateStr = m.date.toISOString().slice(0, 10);
    if (dateDebut && dateStr < dateDebut) continue;
    if (dateFin && dateStr > dateFin) continue;
    if (type && m.type !== type) continue;
    if (categorieId && m.categorieId !== categorieId) continue;
    if (moyen && m.moyen !== moyen) continue;
    if (
      recherche &&
      !m.libelle.toLowerCase().includes(recherche) &&
      !(m.categorie?.nom.toLowerCase().includes(recherche) ?? false)
    ) {
      continue;
    }
    lignes.push([
      dateStr,
      m.libelle,
      m.categorie?.nom ?? "",
      MOYEN_LABELS[m.moyen],
      m.type === "DEPENSE" ? montant.toFixed(2) : "",
      m.type === "RECETTE" ? montant.toFixed(2) : "",
      solde.toFixed(2),
      m.justificatif ?? "",
    ]);
  }

  const csv = versCsv(
    ["Date", "Libellé", "Catégorie", "Moyen", "Débit", "Crédit", "Solde cumulé", "Justificatif"],
    lignes,
  );

  return reponseCsv(`tresorerie-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
