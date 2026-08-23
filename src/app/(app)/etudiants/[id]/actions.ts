"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Civilite, TypeDocument } from "@/generated/prisma/enums";
import { enregistrerDocumentEtudiant, supprimerFichierDocument } from "@/lib/documents";
import { requireModule, Module } from "@/lib/permissions";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function champCivilite(formData: FormData, nom: string): Civilite | null {
  const valeur = champTexte(formData, nom);
  return valeur === "M" || valeur === "MME" ? valeur : null;
}

function retour(etudiantId: string, erreur?: string): never {
  redirect(
    erreur
      ? `/etudiants/${etudiantId}?error=${erreur}`
      : `/etudiants/${etudiantId}?ok=1`,
  );
}

export async function modifierEtudiantAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  if (!etudiantId) redirect("/etudiants");
  if (!nom || !prenom) retour(etudiantId, "CHAMPS_MANQUANTS");

  const dateNaissanceBrute = champTexte(formData, "dateNaissance");

  await prisma.$transaction([
    prisma.etudiant.update({
      where: { id: etudiantId },
      data: {
        civilite: champCivilite(formData, "civilite"),
        nom,
        prenom,
        dateNaissance: dateNaissanceBrute ? new Date(dateNaissanceBrute) : null,
        villeNaissance: champTexte(formData, "villeNaissance"),
        telephoneMobile: champTexte(formData, "telephoneMobile"),
        telephoneFixe: champTexte(formData, "telephoneFixe"),
        email: champTexte(formData, "email"),
        adresse: champTexte(formData, "adresse"),
        complementAdresse: champTexte(formData, "complementAdresse"),
        codePostal: champTexte(formData, "codePostal"),
        contactUrgence: champTexte(formData, "contactUrgence"),
        profession: champTexte(formData, "profession"),
        niveauEtudes: champTexte(formData, "niveauEtudes"),
        dernierDiplome: champTexte(formData, "dernierDiplome"),
        remarque: champTexte(formData, "remarque"),
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_etudiant",
        entite: "Etudiant",
        entiteId: etudiantId,
      },
    }),
  ]);

  revalidatePath(`/etudiants/${etudiantId}`);
  revalidatePath("/etudiants");
  retour(etudiantId);
}

export async function validerInscriptionAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  if (!etudiantId) redirect("/etudiants");

  await prisma.$transaction([
    prisma.etudiant.update({
      where: { id: etudiantId },
      data: { statutInscription: "VALIDE" },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "validation_inscription",
        entite: "Etudiant",
        entiteId: etudiantId,
      },
    }),
  ]);

  revalidatePath(`/etudiants/${etudiantId}`);
  revalidatePath("/etudiants");
  retour(etudiantId);
}

function estTypeDocument(valeur: string | null): valeur is TypeDocument {
  return !!valeur && valeur in TypeDocument;
}

export async function televerserDocumentAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.DOCUMENTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  const type = champTexte(formData, "type");
  const fichier = formData.get("fichier");
  if (!etudiantId) redirect("/etudiants");
  if (!estTypeDocument(type) || !(fichier instanceof File) || fichier.size === 0) {
    retour(etudiantId, "FICHIER_MANQUANT");
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const cheminRelatif = await enregistrerDocumentEtudiant(etudiantId, fichier.name, contenu);

  const cree = await prisma.document.create({
    data: {
      etudiantId,
      type,
      nomFichier: fichier.name,
      cheminRelatif,
      mimeType: fichier.type || "application/octet-stream",
      tailleOctets: contenu.length,
      creeParId: session.id,
    },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "televersement_document",
      entite: "Document",
      entiteId: cree.id,
      details: { etudiantId, type },
    },
  });

  revalidatePath(`/etudiants/${etudiantId}`);
  retour(etudiantId);
}

export async function supprimerDocumentAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.DOCUMENTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  const documentId = champTexte(formData, "documentId");
  if (!etudiantId) redirect("/etudiants");
  if (!documentId) retour(etudiantId, "CHAMPS_MANQUANTS");

  const cible = await prisma.document.findUnique({ where: { id: documentId } });
  if (!cible || cible.etudiantId !== etudiantId) retour(etudiantId, "INTROUVABLE");

  await prisma.$transaction([
    prisma.document.delete({ where: { id: documentId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_document",
        entite: "Document",
        entiteId: documentId,
        details: { etudiantId, nomFichier: cible.nomFichier },
      },
    }),
  ]);
  await supprimerFichierDocument(cible.cheminRelatif);

  revalidatePath(`/etudiants/${etudiantId}`);
  retour(etudiantId);
}

export async function supprimerEtudiantAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  if (!etudiantId) redirect("/etudiants");

  // Le contrôle et la suppression doivent être dans la même transaction :
  // sinon un dossier/une inscription/une présence créée entre les deux
  // passerait sous le radar (cascade silencieuse malgré le garde-fou).
  const documentsASupprimer = await prisma.$transaction(async (tx) => {
    const cible = await tx.etudiant.findUnique({
      where: { id: etudiantId },
      include: {
        documents: true,
        // Une inscription peut être retirée (retirerEtudiantAction) sans
        // effacer les présences déjà enregistrées : il faut les compter à
        // part, sinon un étudiant retiré d'une classe après y avoir eu des
        // présences validées redeviendrait « supprimable ».
        _count: { select: { dossiersAnnuels: true, inscriptions: true, presences: true } },
      },
    });
    if (!cible) redirect("/etudiants");

    if (
      cible._count.dossiersAnnuels > 0 ||
      cible._count.inscriptions > 0 ||
      cible._count.presences > 0
    ) {
      retour(etudiantId, "ETUDIANT_UTILISE");
    }

    await tx.etudiant.delete({ where: { id: etudiantId } });
    await tx.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_etudiant",
        entite: "Etudiant",
        entiteId: etudiantId,
        details: { nom: cible.nom, prenom: cible.prenom },
      },
    });

    return cible.documents;
  });
  await Promise.all(documentsASupprimer.map((d) => supprimerFichierDocument(d.cheminRelatif)));

  revalidatePath("/etudiants");
  redirect("/etudiants?supprime=1");
}

export async function ajouterResponsableAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  if (!etudiantId) redirect("/etudiants");
  if (!nom || !prenom) retour(etudiantId, "CHAMPS_MANQUANTS");

  const cree = await prisma.responsableLegal.create({
    data: {
      etudiantId,
      civilite: champCivilite(formData, "civilite"),
      nom,
      prenom,
      lien: champTexte(formData, "lien") ?? "Non précisé",
      telephone: champTexte(formData, "telephone"),
      email: champTexte(formData, "email"),
      adresse: champTexte(formData, "adresse"),
    },
  });

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "ajout_responsable",
      entite: "ResponsableLegal",
      entiteId: cree.id,
      details: { etudiantId },
    },
  });

  revalidatePath(`/etudiants/${etudiantId}`);
  retour(etudiantId);
}

export async function modifierResponsableAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  const responsableId = champTexte(formData, "responsableId");
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  if (!etudiantId) redirect("/etudiants");
  if (!responsableId || !nom || !prenom) retour(etudiantId, "CHAMPS_MANQUANTS");

  await prisma.$transaction([
    prisma.responsableLegal.update({
      where: { id: responsableId },
      data: {
        civilite: champCivilite(formData, "civilite"),
        nom,
        prenom,
        lien: champTexte(formData, "lien") ?? "Non précisé",
        telephone: champTexte(formData, "telephone"),
        email: champTexte(formData, "email"),
        adresse: champTexte(formData, "adresse"),
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_responsable",
        entite: "ResponsableLegal",
        entiteId: responsableId,
        details: { etudiantId },
      },
    }),
  ]);

  revalidatePath(`/etudiants/${etudiantId}`);
  retour(etudiantId);
}

export async function supprimerResponsableAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  const responsableId = champTexte(formData, "responsableId");
  if (!etudiantId) redirect("/etudiants");
  if (!responsableId) retour(etudiantId, "CHAMPS_MANQUANTS");

  await prisma.$transaction([
    prisma.responsableLegal.delete({ where: { id: responsableId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_responsable",
        entite: "ResponsableLegal",
        entiteId: responsableId,
        details: { etudiantId },
      },
    }),
  ]);

  revalidatePath(`/etudiants/${etudiantId}`);
  retour(etudiantId);
}
