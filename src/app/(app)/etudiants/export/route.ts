import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { versCsv, reponseCsv } from "@/lib/csv";
import {
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
  const anneeIdDemandee = request.nextUrl.searchParams.get("anneeId")?.trim();
  const anneeDemandee = anneeIdDemandee
    ? await prisma.anneeScolaire.findUnique({ where: { id: anneeIdDemandee } })
    : null;
  const anneeSelectionneeId =
    anneeDemandee?.id ??
    (await prisma.anneeScolaire.findFirst({ where: { active: true } }))?.id ??
    null;

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
      ...(sectionId && anneeSelectionneeId ? filtreParSection(anneeSelectionneeId, sectionId) : {}),
      ...(reinscription === "oui" || reinscription === "non"
        ? anneeSelectionneeId
          ? filtreParReinscription(anneeSelectionneeId, reinscription === "oui")
          : {}
        : {}),
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: {
      responsables: true,
      inscriptions: anneeSelectionneeId
        ? inclureInscriptionsActives(anneeSelectionneeId)
        : { where: { id: "" }, include: { classe: { include: { cours: { include: { section: true } } } } } },
      dossiersAnnuels: anneeSelectionneeId
        ? inclureDossierAnnuelActif(anneeSelectionneeId)
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
