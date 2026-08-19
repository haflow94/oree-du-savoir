import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { versCsv, reponseCsv } from "@/lib/csv";
import { anneeScolaireActiveId, filtreParSection } from "@/lib/sections-etudiant";

export async function GET(request: NextRequest) {
  await requireSession();
  const anneeScolaireId = request.nextUrl.searchParams.get("anneeScolaireId");
  const sectionId = request.nextUrl.searchParams.get("sectionId");

  const dossiers = await prisma.dossierAnnuel.findMany({
    where: {
      ...(anneeScolaireId ? { anneeScolaireId } : {}),
      ...(sectionId
        ? {
            etudiant: filtreParSection(
              anneeScolaireId ?? (await anneeScolaireActiveId()) ?? "",
              sectionId,
            ),
          }
        : {}),
    },
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
    const echeancesReglees = d.echeances.filter((e) => {
      const montantEcheance = Number.parseFloat(e.montant.toString());
      const encaisseEcheance = e.paiements.reduce(
        (total, p) => total + Number.parseFloat(p.montant.toString()),
        0,
      );
      return encaisseEcheance >= montantEcheance;
    }).length;
    return [
      d.etudiant.nom,
      d.etudiant.prenom,
      d.anneeScolaire.libelle,
      du.toFixed(2),
      echeancesReglees,
      d.echeances.length,
      encaisse.toFixed(2),
      reste.toFixed(2),
      statut,
    ];
  });

  const csv = versCsv(
    [
      "Nom",
      "Prénom",
      "Année",
      "Dû",
      "Échéances réglées",
      "Échéances totales",
      "Encaissé",
      "Reste",
      "Statut",
    ],
    lignes,
  );

  const suffixe = anneeScolaireId ? "" : "-toutes-annees";
  return reponseCsv(`paiements${suffixe}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
