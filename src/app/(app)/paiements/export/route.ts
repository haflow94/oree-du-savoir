import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { versCsv, reponseCsv } from "@/lib/csv";
import { anneeScolaireActiveId, filtreParSection } from "@/lib/sections-etudiant";
import { requireModule, Module } from "@/lib/permissions";
import { INCIDENT_LABELS, MOYEN_LABELS, formaterMontant, incidentDePaiement } from "@/lib/paiements";

export async function GET(request: NextRequest) {
  await requireModule(Module.PAIEMENTS, "LECTURE");
  const anneeScolaireId = request.nextUrl.searchParams.get("anneeScolaireId");
  const sectionId = request.nextUrl.searchParams.get("sectionId");
  const recherche = request.nextUrl.searchParams.get("q")?.trim() || "";

  const filtreEtudiant = {
    ...(sectionId
      ? filtreParSection(anneeScolaireId ?? (await anneeScolaireActiveId()) ?? "", sectionId)
      : {}),
    ...(recherche
      ? {
          OR: [
            { nom: { contains: recherche, mode: "insensitive" as const } },
            { prenom: { contains: recherche, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const dossiers = await prisma.dossierAnnuel.findMany({
    where: {
      ...(anneeScolaireId ? { anneeScolaireId } : {}),
      ...(Object.keys(filtreEtudiant).length > 0 ? { etudiant: filtreEtudiant } : {}),
    },
    orderBy: [{ anneeScolaire: { libelle: "desc" } }, { etudiant: { nom: "asc" } }],
    include: {
      etudiant: {
        include: {
          responsables: true,
          // Pas de clause `where` dynamique par ligne possible ici (l'année
          // du dossier varie d'une ligne à l'autre) : toutes les inscriptions
          // sont chargées, puis filtrées en mémoire sur `d.anneeScolaireId`
          // (même approche que (app)/etudiants/[id]/page.tsx).
          inscriptions: { include: { classe: { include: { cours: { include: { section: true } } } } } },
        },
      },
      anneeScolaire: true,
      echeances: { include: { paiements: { include: { cheque: true, prelevement: true } } } },
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

    // Sections suivies par l'étudiant sur l'année de CE dossier, avec le
    // tarif de chaque (frais de formation + frais de dossier) — même somme
    // que `montantSuggereDossier` (src/lib/sections-etudiant.ts), affichée
    // ici section par section plutôt qu'agrégée.
    const sectionsParId = new Map<
      string,
      (typeof d.etudiant.inscriptions)[number]["classe"]["cours"]["section"]
    >();
    for (const i of d.etudiant.inscriptions) {
      if (i.classe.anneeScolaireId === d.anneeScolaireId) {
        sectionsParId.set(i.classe.cours.section.id, i.classe.cours.section);
      }
    }
    const sectionsTexte = [...sectionsParId.values()]
      .map((s) => `${s.nom} (${formaterMontant(Number(s.fraisFormation) + Number(s.fraisDossier))})`)
      .join(" | ");

    const moyensTexte = [...new Set(paiements.map((p) => MOYEN_LABELS[p.moyen]))].join(", ");

    const echeancesTexte = d.echeances
      .map((e) => {
        const montantEcheance = Number.parseFloat(e.montant.toString());
        const encaisseEcheance = e.paiements.reduce(
          (total, p) => total + Number.parseFloat(p.montant.toString()),
          0,
        );
        const statutEcheance =
          encaisseEcheance >= montantEcheance ? "réglée" : encaisseEcheance > 0 ? "partielle" : "impayée";
        return `${e.libelle || "Échéance"} : ${formaterMontant(montantEcheance)} le ${new Date(
          e.dateEcheance,
        ).toLocaleDateString("fr-FR")} (${statutEcheance})`;
      })
      .join(" | ");

    const incidentsTexte = paiements
      .map((p) => incidentDePaiement(p))
      .filter((incident): incident is NonNullable<typeof incident> => incident !== null)
      .map((incident) => `${INCIDENT_LABELS[incident.type]}${incident.motif ? ` (${incident.motif})` : ""}`)
      .join(" | ");

    const responsable = d.etudiant.responsables[0];

    return [
      d.etudiant.civilite ?? "",
      d.etudiant.nom,
      d.etudiant.prenom,
      d.etudiant.dateNaissance ? d.etudiant.dateNaissance.toISOString().slice(0, 10) : "",
      d.etudiant.telephoneMobile ?? d.etudiant.telephoneFixe ?? "",
      d.etudiant.email ?? "",
      d.etudiant.adresse ?? "",
      d.etudiant.codePostal ?? "",
      responsable ? `${responsable.prenom} ${responsable.nom} (${responsable.lien})` : "",
      d.anneeScolaire.libelle,
      sectionsTexte,
      du.toFixed(2),
      moyensTexte,
      echeancesTexte,
      echeancesReglees,
      d.echeances.length,
      encaisse.toFixed(2),
      reste.toFixed(2),
      statut,
      incidentsTexte,
    ];
  });

  const csv = versCsv(
    [
      "Civilité",
      "Nom",
      "Prénom",
      "Date de naissance",
      "Téléphone",
      "Email",
      "Adresse",
      "Code postal",
      "Responsable légal",
      "Année",
      "Sections suivies (tarif)",
      "Dû",
      "Moyens de paiement",
      "Détail des échéances",
      "Échéances réglées",
      "Échéances totales",
      "Encaissé",
      "Reste",
      "Statut",
      "Incidents",
    ],
    lignes,
  );

  const suffixe = anneeScolaireId ? "" : "-toutes-annees";
  return reponseCsv(`paiements${suffixe}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
