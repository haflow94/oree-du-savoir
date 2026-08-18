import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { versCsv, reponseCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireSession();
  const anneeScolaireId = request.nextUrl.searchParams.get("anneeScolaireId");

  const dossiers = await prisma.dossierAnnuel.findMany({
    where: anneeScolaireId ? { anneeScolaireId } : undefined,
    orderBy: [{ anneeScolaire: { libelle: "desc" } }, { etudiant: { nom: "asc" } }],
    include: {
      etudiant: true,
      anneeScolaire: true,
      echeances: { include: { paiements: true } },
    },
  });

  const lignes = dossiers.map((d) => {
    const du = Number.parseFloat(d.montantDu.toString());
    const paiements = d.echeances.flatMap((e) => e.paiements);
    const encaisse = paiements.reduce(
      (total, p) => total + Number.parseFloat(p.montant.toString()),
      0,
    );
    const reste = du - encaisse;
    const statut = reste <= 0 ? "Soldé" : encaisse > 0 ? "Partiel" : "Impayé";
    return [
      d.etudiant.nom,
      d.etudiant.prenom,
      d.anneeScolaire.libelle,
      du.toFixed(2),
      d.echeances.length,
      paiements.length,
      encaisse.toFixed(2),
      reste.toFixed(2),
      statut,
    ];
  });

  const csv = versCsv(
    ["Nom", "Prénom", "Année", "Dû", "Échéances", "Paiements effectués", "Encaissé", "Reste", "Statut"],
    lignes,
  );

  const suffixe = anneeScolaireId ? "" : "-toutes-annees";
  return reponseCsv(`paiements${suffixe}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
