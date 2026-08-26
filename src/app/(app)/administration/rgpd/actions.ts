"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/lib/roles";
import { supprimerFichierDocument } from "@/lib/documents";
import { estEligibleAnonymisation } from "@/lib/rgpd";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function retour(erreur?: string): never {
  redirect(erreur ? `/administration/rgpd?error=${erreur}` : "/administration/rgpd?ok=1");
}

// Anonymisation manuelle, dossier par dossier (voir src/lib/rgpd.ts) : pas de
// tâche planifiée tant que le CA n'a pas validé de politique de rétention.
// L'identité et les coordonnées sont effacées ; les dossiers annuels,
// échéances, paiements et présences restent (comptabilité, traçabilité), mais
// ne sont plus rattachés à une personne identifiable.
export async function anonymiserEtudiantAction(formData: FormData): Promise<void> {
  const session = await requireRole([Role.BUREAU]);

  const etudiantId = champTexte(formData, "etudiantId");
  if (!etudiantId) retour("CHAMPS_MANQUANTS");

  const etudiant = await prisma.etudiant.findUnique({
    where: { id: etudiantId },
    include: {
      documents: true,
      dossiersAnnuels: { include: { anneeScolaire: true } },
    },
  });
  if (!etudiant) retour("INTROUVABLE");
  if (!estEligibleAnonymisation(etudiant)) retour("PAS_ELIGIBLE");

  const nomOriginal = `${etudiant.prenom} ${etudiant.nom}`;
  const documents = etudiant.documents;

  await prisma.$transaction([
    prisma.responsableLegal.deleteMany({ where: { etudiantId } }),
    prisma.document.deleteMany({ where: { etudiantId } }),
    prisma.etudiant.update({
      where: { id: etudiantId },
      data: {
        civilite: null,
        nom: "Anonymisé",
        prenom: `Dossier ${etudiant.id.slice(-6)}`,
        dateNaissance: null,
        villeNaissance: null,
        telephoneMobile: null,
        telephoneFixe: null,
        email: null,
        adresse: null,
        complementAdresse: null,
        codePostal: null,
        ville: null,
        contactUrgence: null,
        profession: null,
        niveauEtudes: null,
        dernierDiplome: null,
        remarque: null,
        anonymiseLe: new Date(),
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "anonymisation_etudiant",
        entite: "Etudiant",
        entiteId: etudiantId,
        details: { nomOriginal },
      },
    }),
  ]);

  for (const document of documents) {
    await supprimerFichierDocument(document.cheminRelatif);
  }

  revalidatePath("/administration/rgpd");
  retour();
}
