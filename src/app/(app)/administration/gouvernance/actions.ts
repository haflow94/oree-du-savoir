"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TypeDocumentAssociation, TypeReunionGouvernance } from "@/generated/prisma/enums";
import { requireModule, Module } from "@/lib/permissions";
import { enregistrerDocumentAssociation, supprimerFichierDocument } from "@/lib/documents";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function champDate(formData: FormData, nom: string): Date | null {
  const valeur = champTexte(formData, nom);
  if (!valeur) return null;
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function estTypeReunion(valeur: string | null): valeur is TypeReunionGouvernance {
  return !!valeur && valeur in TypeReunionGouvernance;
}

function estTypeDocumentAssociation(valeur: string | null): valeur is TypeDocumentAssociation {
  return !!valeur && valeur in TypeDocumentAssociation;
}

function retour(erreur?: string): never {
  redirect(
    erreur ? `/administration/gouvernance?error=${erreur}` : "/administration/gouvernance?ok=1",
  );
}

export async function creerMembreCAAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.GOUVERNANCE, "ECRITURE");

  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  const fonction = champTexte(formData, "fonction");
  const email = champTexte(formData, "email");
  const dateEntree = champDate(formData, "dateEntree");
  if (!nom || !prenom || !dateEntree) retour("CHAMPS_MANQUANTS");

  const cree = await prisma.membreCA.create({
    data: { nom, prenom, fonction, email, dateEntree },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "creation_membre_ca",
      entite: "MembreCA",
      entiteId: cree.id,
      details: { nom, prenom },
    },
  });

  revalidatePath("/administration/gouvernance");
  retour();
}

export async function marquerSortantMembreCAAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.GOUVERNANCE, "ECRITURE");

  const membreId = champTexte(formData, "membreId");
  if (!membreId) retour("CHAMPS_MANQUANTS");

  const cible = await prisma.membreCA.findUnique({ where: { id: membreId } });
  if (!cible) retour("INTROUVABLE");

  await prisma.$transaction([
    prisma.membreCA.update({ where: { id: membreId }, data: { dateSortie: new Date() } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "sortie_membre_ca",
        entite: "MembreCA",
        entiteId: membreId,
      },
    }),
  ]);

  revalidatePath("/administration/gouvernance");
  retour();
}

export async function supprimerMembreCAAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.GOUVERNANCE, "ECRITURE");

  const membreId = champTexte(formData, "membreId");
  if (!membreId) retour("CHAMPS_MANQUANTS");

  const cible = await prisma.membreCA.findUnique({ where: { id: membreId } });
  if (!cible) retour("INTROUVABLE");

  await prisma.$transaction([
    prisma.membreCA.delete({ where: { id: membreId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_membre_ca",
        entite: "MembreCA",
        entiteId: membreId,
        details: { nom: cible.nom, prenom: cible.prenom },
      },
    }),
  ]);

  revalidatePath("/administration/gouvernance");
  retour();
}

export async function creerReunionAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.GOUVERNANCE, "ECRITURE");

  const type = champTexte(formData, "type");
  const date = champDate(formData, "date");
  const ordreDuJour = champTexte(formData, "ordreDuJour");
  if (!estTypeReunion(type) || !date) retour("CHAMPS_MANQUANTS");

  const cree = await prisma.reunionGouvernance.create({
    data: { type, date, ordreDuJour },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "creation_reunion_gouvernance",
      entite: "ReunionGouvernance",
      entiteId: cree.id,
      details: { type },
    },
  });

  revalidatePath("/administration/gouvernance");
  retour();
}

export async function supprimerReunionAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.GOUVERNANCE, "ECRITURE");

  const reunionId = champTexte(formData, "reunionId");
  if (!reunionId) retour("CHAMPS_MANQUANTS");

  const cible = await prisma.reunionGouvernance.findUnique({ where: { id: reunionId } });
  if (!cible) retour("INTROUVABLE");

  await prisma.$transaction([
    prisma.reunionGouvernance.delete({ where: { id: reunionId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_reunion_gouvernance",
        entite: "ReunionGouvernance",
        entiteId: reunionId,
      },
    }),
  ]);

  revalidatePath("/administration/gouvernance");
  retour();
}

export async function televerserDocumentAssociationAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.GOUVERNANCE, "ECRITURE");

  const type = champTexte(formData, "type");
  const reunionId = champTexte(formData, "reunionId");
  const fichier = formData.get("fichier");
  if (!estTypeDocumentAssociation(type) || !(fichier instanceof File) || fichier.size === 0) {
    retour("FICHIER_MANQUANT");
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const cheminRelatif = await enregistrerDocumentAssociation(fichier.name, contenu);

  const cree = await prisma.documentAssociation.create({
    data: {
      type,
      nomFichier: fichier.name,
      cheminRelatif,
      mimeType: fichier.type || "application/octet-stream",
      tailleOctets: contenu.length,
      reunionId,
      creeParId: session.id,
    },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "televersement_document_association",
      entite: "DocumentAssociation",
      entiteId: cree.id,
      details: { type, reunionId },
    },
  });

  revalidatePath("/administration/gouvernance");
  retour();
}

export async function supprimerDocumentAssociationAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.GOUVERNANCE, "ECRITURE");

  const documentId = champTexte(formData, "documentId");
  if (!documentId) retour("CHAMPS_MANQUANTS");

  const cible = await prisma.documentAssociation.findUnique({ where: { id: documentId } });
  if (!cible) retour("INTROUVABLE");

  await prisma.$transaction([
    prisma.documentAssociation.delete({ where: { id: documentId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_document_association",
        entite: "DocumentAssociation",
        entiteId: documentId,
        details: { nomFichier: cible.nomFichier },
      },
    }),
  ]);

  await supprimerFichierDocument(cible.cheminRelatif);

  revalidatePath("/administration/gouvernance");
  retour();
}
