"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { enregistrerDocumentAssociation, supprimerFichierDocument } from "@/lib/documents";
import { JourSemaine } from "@/generated/prisma/enums";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function retour(erreur?: string): never {
  redirect(
    erreur ? `/administration/organisation?error=${erreur}` : "/administration/organisation?ok=1",
  );
}

const EXTENSIONS_LOGO_AUTORISEES = [".png", ".jpg", ".jpeg", ".svg", ".webp"];

// Identité de l'association (voir modèle Organisation) : une seule ligne,
// créée par le seed — cette action ne fait qu'éditer les coordonnées et,
// si un fichier est fourni, remplacer le logo (voir SPEC-dossiers.md §2
// "Logo — interchangeable" : remplacer le fichier suffit, aucun template à
// retoucher).
export async function modifierOrganisationAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ADMINISTRATION, "ECRITURE");

  const organisationId = champTexte(formData, "organisationId");
  const nom = champTexte(formData, "nom");
  if (!organisationId || !nom) retour("CHAMPS_INVALIDES");

  const cible = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!cible) retour("INTROUVABLE");

  const joursActifs = formData
    .getAll("joursActifs")
    .filter((v): v is string => typeof v === "string" && v in JourSemaine) as JourSemaine[];

  const logo = formData.get("logo");
  let logoCheminRelatif = cible.logoCheminRelatif;
  if (logo instanceof File && logo.size > 0) {
    const extension = "." + (logo.name.split(".").pop()?.toLowerCase() ?? "");
    if (!EXTENSIONS_LOGO_AUTORISEES.includes(extension)) retour("LOGO_FORMAT_INVALIDE");

    const contenu = Buffer.from(await logo.arrayBuffer());
    const nouveauChemin = await enregistrerDocumentAssociation(logo.name, contenu);
    if (cible.logoCheminRelatif) await supprimerFichierDocument(cible.logoCheminRelatif);
    logoCheminRelatif = nouveauChemin;
  }

  await prisma.$transaction([
    prisma.organisation.update({
      where: { id: organisationId },
      data: {
        nom,
        sousTitre: champTexte(formData, "sousTitre"),
        adresse: champTexte(formData, "adresse"),
        codePostal: champTexte(formData, "codePostal"),
        ville: champTexte(formData, "ville"),
        telephone: champTexte(formData, "telephone"),
        email: champTexte(formData, "email"),
        siret: champTexte(formData, "siret"),
        naf: champTexte(formData, "naf"),
        logoCheminRelatif,
        joursActifs,
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_organisation",
        entite: "Organisation",
        entiteId: organisationId,
        details: { nom },
      },
    }),
  ]);

  revalidatePath("/administration/organisation");
  retour();
}
