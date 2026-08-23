import { NextRequest } from "next/server";
import { requireModule, Module } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { versCsv, reponseCsv } from "@/lib/csv";
import {
  compterHistoriqueAutreAnnee,
  estNouveauParCompteur,
  estReinscrit,
  filtreParReinscription,
  filtreParSection,
  inclureDossierAnnuelActif,
  inclureInscriptionsActives,
} from "@/lib/sections-etudiant";

export async function GET(request: NextRequest) {
  await requireModule(Module.ETUDIANTS, "LECTURE");
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const sectionId = request.nextUrl.searchParams.get("sectionId")?.trim();
  const reinscription = request.nextUrl.searchParams.get("reinscription")?.trim();
  const anneeIdDemandee = request.nextUrl.searchParams.get("anneeId")?.trim();
  const population = request.nextUrl.searchParams.get("population")?.trim();
  const anneeDemandee = anneeIdDemandee
    ? await prisma.anneeScolaire.findUnique({ where: { id: anneeIdDemandee } })
    : null;
  const anneeSelectionneeId =
    anneeDemandee?.id ??
    (await prisma.anneeScolaire.findFirst({ where: { active: true } }))?.id ??
    null;

  // Même logique d'onglet Adultes/Jeunes que la liste (voir
  // (app)/etudiants/page.tsx) : "Jeunes" est une Section du référentiel, pas
  // un champ dédié. Chaque filtre dans son propre élément de tableau plutôt
  // qu'un spread d'objets : `filtreParSection` (section + onglet Jeunes) et
  // `filtreParReinscription` peuvent chacun produire une clé `inscriptions`
  // ou `dossiersAnnuels` — un spread les écraserait silencieusement au lieu
  // de les combiner.
  const conditions: Prisma.EtudiantWhereInput[] = [];
  if (q) {
    conditions.push({
      OR: [
        { nom: { contains: q, mode: "insensitive" } },
        { prenom: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (sectionId && anneeSelectionneeId) {
    conditions.push(filtreParSection(anneeSelectionneeId, sectionId));
  }
  if (population === "jeunes" || population === "adultes") {
    if (anneeSelectionneeId) {
      const sectionJeunes = await prisma.section.findFirst({ where: { nom: "Jeunes" } });
      if (sectionJeunes) {
        const filtreJeunes = filtreParSection(anneeSelectionneeId, sectionJeunes.id);
        conditions.push(population === "jeunes" ? filtreJeunes : { NOT: filtreJeunes });
      }
    }
  }
  if ((reinscription === "oui" || reinscription === "non") && anneeSelectionneeId) {
    conditions.push(filtreParReinscription(anneeSelectionneeId, reinscription === "oui"));
  }

  const etudiants = await prisma.etudiant.findMany({
    where: conditions.length > 0 ? { AND: conditions } : {},
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: {
      responsables: true,
      inscriptions: anneeSelectionneeId
        ? inclureInscriptionsActives(anneeSelectionneeId)
        : { where: { id: "" }, include: { classe: { include: { cours: { include: { section: true } } } } } },
      dossiersAnnuels: anneeSelectionneeId
        ? inclureDossierAnnuelActif(anneeSelectionneeId)
        : { where: { id: "" } },
      _count: {
        select: anneeSelectionneeId
          ? compterHistoriqueAutreAnnee(anneeSelectionneeId)
          : { inscriptions: true, dossiersAnnuels: true },
      },
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
    estNouveauParCompteur(e)
      ? estReinscrit(e)
        ? "Inscrit"
        : "Non inscrit"
      : estReinscrit(e)
        ? "Réinscrit"
        : "Non réinscrit",
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
      "Inscription",
      "Responsables légaux",
    ],
    lignes,
  );

  const suffixe = q ? `-${q}` : "";
  return reponseCsv(`etudiants${suffixe}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
