import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { versCsv, reponseCsv } from "@/lib/csv";
import {
  anneeScolaireActiveId,
  estReinscrit,
  filtreParReinscription,
  filtreParSection,
  inclureDossierAnnuelActif,
  inclureInscriptionsActives,
} from "@/lib/sections-etudiant";

export async function GET(request: NextRequest) {
  await requireSession();
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const sectionId = request.nextUrl.searchParams.get("sectionId")?.trim();
  const reinscription = request.nextUrl.searchParams.get("reinscription")?.trim();
  const anneeActiveId = await anneeScolaireActiveId();

  const etudiants = await prisma.etudiant.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { nom: { contains: q, mode: "insensitive" } },
              { prenom: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(sectionId && anneeActiveId ? filtreParSection(anneeActiveId, sectionId) : {}),
      ...(reinscription === "oui" || reinscription === "non"
        ? anneeActiveId
          ? filtreParReinscription(anneeActiveId, reinscription === "oui")
          : {}
        : {}),
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: {
      responsables: true,
      inscriptions: anneeActiveId
        ? inclureInscriptionsActives(anneeActiveId)
        : { where: { id: "" }, include: { classe: { include: { cours: { include: { section: true } } } } } },
      dossiersAnnuels: anneeActiveId
        ? inclureDossierAnnuelActif(anneeActiveId)
        : { where: { id: "" } },
    },
  });

  const lignes = etudiants.map((e) => [
    e.nom,
    e.prenom,
    e.civilite ?? "",
    e.dateNaissance ? e.dateNaissance.toISOString().slice(0, 10) : "",
    e.villeNaissance ?? "",
    e.telephoneMobile ?? "",
    e.telephoneFixe ?? "",
    e.email ?? "",
    e.adresse ?? "",
    e.codePostal ?? "",
    e.contactUrgence ?? "",
    e.statutInscription,
    estReinscrit(e) ? "Réinscrit" : "Non réinscrit",
    e.responsables.map((r) => `${r.prenom} ${r.nom} (${r.lien})`).join(" / "),
  ]);

  const csv = versCsv(
    [
      "Nom",
      "Prénom",
      "Civilité",
      "Date de naissance",
      "Ville de naissance",
      "Téléphone mobile",
      "Téléphone fixe",
      "Email",
      "Adresse",
      "Code postal",
      "Contact d'urgence",
      "Statut",
      "Réinscription",
      "Responsables légaux",
    ],
    lignes,
  );

  const suffixe = q ? `-${q}` : "";
  return reponseCsv(`etudiants${suffixe}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
