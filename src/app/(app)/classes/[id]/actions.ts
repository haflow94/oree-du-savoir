"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { JourSemaine } from "@/generated/prisma/enums";

const PEUT_GERER = [Role.ADMINISTRATION, Role.BUREAU];

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function estJourValide(valeur: string | null): valeur is JourSemaine {
  return !!valeur && valeur in JourSemaine;
}

function retour(classeId: string, erreur?: string): never {
  redirect(
    erreur ? `/classes/${classeId}?error=${erreur}` : `/classes/${classeId}?ok=1`,
  );
}

export async function modifierClasseAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER);

  const classeId = champTexte(formData, "classeId");
  const jour = champTexte(formData, "jour");
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");
  if (!classeId) redirect("/classes");
  if (!estJourValide(jour) || !heureDebut || !heureFin) {
    retour(classeId, "CHAMPS_MANQUANTS");
  }

  const capaciteBrute = champTexte(formData, "capacite");
  const capacite = capaciteBrute ? Number.parseInt(capaciteBrute, 10) : null;
  const enseignantIds = formData.getAll("enseignants").filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  await prisma.$transaction([
    prisma.classe.update({
      where: { id: classeId },
      data: {
        jour,
        heureDebut,
        heureFin,
        niveau: champTexte(formData, "niveau"),
        semestre: champTexte(formData, "semestre"),
        salle: champTexte(formData, "salle"),
        capacite: capacite && !Number.isNaN(capacite) ? capacite : null,
      },
    }),
    prisma.classeEnseignant.deleteMany({ where: { classeId } }),
    ...(enseignantIds.length > 0
      ? [
          prisma.classeEnseignant.createMany({
            data: enseignantIds.map((utilisateurId) => ({ classeId, utilisateurId })),
          }),
        ]
      : []),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_classe",
        entite: "Classe",
        entiteId: classeId,
      },
    }),
  ]);

  revalidatePath(`/classes/${classeId}`);
  revalidatePath("/classes");
  retour(classeId);
}

// Copie une classe existante (cours, année, niveau, créneau, salle, capacité,
// enseignants) pour éviter de tout resaisir quand on ouvre un second groupe
// très proche du premier (ex. même cours à un autre horaire). La copie part
// sans séances ni inscriptions ; on redirige vers sa fiche pour ajuster le
// créneau si besoin.
export async function dupliquerClasseAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER);

  const classeId = champTexte(formData, "classeId");
  if (!classeId) redirect("/classes");

  const source = await prisma.classe.findUnique({
    where: { id: classeId },
    include: { enseignants: true },
  });
  if (!source) redirect("/classes");

  const copie = await prisma.$transaction(async (tx) => {
    const nouvelle = await tx.classe.create({
      data: {
        coursId: source.coursId,
        anneeScolaireId: source.anneeScolaireId,
        niveau: source.niveau,
        semestre: source.semestre,
        jour: source.jour,
        heureDebut: source.heureDebut,
        heureFin: source.heureFin,
        salle: source.salle,
        capacite: source.capacite,
        enseignants: {
          create: source.enseignants.map((e) => ({ utilisateurId: e.utilisateurId })),
        },
      },
    });
    await tx.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "duplication_classe",
        entite: "Classe",
        entiteId: nouvelle.id,
        details: { depuisClasseId: classeId },
      },
    });
    return nouvelle;
  });

  revalidatePath("/classes");
  redirect(`/classes/${copie.id}?ok=1`);
}

export async function supprimerClasseAction(formData: FormData): Promise<void> {
  const session = await requireRole(PEUT_GERER);

  const classeId = champTexte(formData, "classeId");
  if (!classeId) redirect("/classes");

  const cible = await prisma.classe.findUnique({
    where: { id: classeId },
    include: { _count: { select: { seances: true, inscriptions: true } } },
  });
  if (!cible) redirect("/classes");

  // Supprimer une classe avec des séances ou des inscriptions effacerait
  // silencieusement des présences/inscriptions déjà constituées (cascade
  // en base). On ne l'autorise que pour une classe encore vide.
  if (cible._count.seances > 0 || cible._count.inscriptions > 0) {
    retour(classeId, "CLASSE_UTILISEE");
  }

  await prisma.$transaction([
    prisma.classe.delete({ where: { id: classeId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_classe",
        entite: "Classe",
        entiteId: classeId,
      },
    }),
  ]);

  revalidatePath("/classes");
  redirect("/classes?ok=1");
}
