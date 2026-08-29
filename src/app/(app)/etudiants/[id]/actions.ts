"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Civilite, Sexe, TypeDocument, TypePieceIdentite } from "@/generated/prisma/enums";
import { enregistrerDocumentEtudiant, supprimerFichierDocument } from "@/lib/documents";
import { requireModule, Module } from "@/lib/permissions";
import { estEmailValide, estTelephoneValide, estCodePostalValide } from "@/lib/champs-formulaire";

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

// Optionnel (dossier Jeunes uniquement, voir Etudiant.sexe) : null si non
// renseigné, jamais bloquant.
function champSexe(formData: FormData, nom: string): Sexe | null {
  const valeur = champTexte(formData, nom);
  return valeur === "F" || valeur === "M" ? valeur : null;
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
  if (!etudiantId) redirect("/etudiants");

  const civilite = champCivilite(formData, "civilite");
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  const dateNaissanceBrute = champTexte(formData, "dateNaissance");
  const villeNaissance = champTexte(formData, "villeNaissance");
  const telephoneMobile = champTexte(formData, "telephoneMobile");
  const email = champTexte(formData, "email");
  const adresse = champTexte(formData, "adresse");
  const codePostal = champTexte(formData, "codePostal");
  const ville = champTexte(formData, "ville");
  const niveauEtudes = champTexte(formData, "niveauEtudes");

  if (
    !civilite ||
    !nom ||
    !prenom ||
    !dateNaissanceBrute ||
    !villeNaissance ||
    !telephoneMobile ||
    !email ||
    !adresse ||
    !codePostal ||
    !ville ||
    !niveauEtudes
  ) {
    retour(etudiantId, "PROFIL_CHAMPS_MANQUANTS");
  }
  if (!estTelephoneValide(telephoneMobile)) retour(etudiantId, "TELEPHONE_INVALIDE");
  if (!estEmailValide(email)) retour(etudiantId, "EMAIL_INVALIDE");
  if (!estCodePostalValide(codePostal)) retour(etudiantId, "CODE_POSTAL_INVALIDE");

  const telephoneFixe = champTexte(formData, "telephoneFixe");
  if (telephoneFixe && !estTelephoneValide(telephoneFixe)) retour(etudiantId, "TELEPHONE_INVALIDE");

  await prisma.$transaction([
    prisma.etudiant.update({
      where: { id: etudiantId },
      data: {
        civilite,
        nom,
        prenom,
        dateNaissance: new Date(dateNaissanceBrute),
        villeNaissance,
        telephoneMobile,
        telephoneFixe,
        email,
        adresse,
        complementAdresse: champTexte(formData, "complementAdresse"),
        codePostal,
        ville,
        contactUrgence: champTexte(formData, "contactUrgence"),
        profession: champTexte(formData, "profession"),
        niveauEtudes,
        dernierDiplome: champTexte(formData, "dernierDiplome"),
        remarque: champTexte(formData, "remarque"),
        sexe: champSexe(formData, "sexe"),
        niveauScolaire: champTexte(formData, "niveauScolaire"),
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

// Un document PHOTO/PIECE_IDENTITE compte comme valide s'il n'a pas de date
// d'expiration (tous les types sauf PIECE_IDENTITE) ou si elle n'est pas
// dépassée — voir lib/documents.ts#statutDocumentsRequis pour la même règle
// appliquée au badge de la fiche étudiant.
function documentValide(d: { type: string; dateExpiration: Date | null }): boolean {
  return d.type !== "PIECE_IDENTITE" || !d.dateExpiration || d.dateExpiration >= new Date();
}

// Tranche un doublon potentiel détecté à la préinscription (voir
// Etudiant.doublonPotentielId, preinscription/actions.ts) en fusionnant
// cette fiche (la préinscription en double) dans la fiche existante :
// coordonnées reprises quand la préinscription en apporte une valeur (sans
// écraser un champ déjà renseigné par du vide), inscriptions/responsables
// rattachés à la fiche existante (sans dupliquer ceux déjà présents), puis
// la préinscription en double est supprimée. Refusé si elle porte déjà un
// dossier annuel ou des présences réelles : la fusion automatique
// deviendrait destructrice, mieux vaut laisser le staff trancher à la main.
//
// Les documents PHOTO/PIECE_IDENTITE de la préinscription (formulaire public,
// voir preinscription-form.tsx) ne bloquent plus la fusion : chacun est soit
// réparenté sur la fiche existante (si elle n'a pas déjà un document valide
// du même type), soit supprimé comme redondant (si elle en a déjà un valide)
// — c'est ce qui met en œuvre « ne pas redemander une pièce déjà présente et
// valide » côté staff.
export async function fusionnerDoublonAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  if (!etudiantId) redirect("/etudiants");

  const doublon = await prisma.etudiant.findUnique({
    where: { id: etudiantId },
    include: {
      responsables: true,
      inscriptions: true,
      documents: true,
      _count: { select: { dossiersAnnuels: true, presences: true } },
    },
  });
  if (!doublon || !doublon.doublonPotentielId) retour(etudiantId, "DOUBLON_INTROUVABLE");
  if (doublon._count.dossiersAnnuels > 0 || doublon._count.presences > 0) {
    retour(etudiantId, "DOUBLON_NON_FUSIONNABLE");
  }

  const existantId = doublon.doublonPotentielId;
  const existant = await prisma.etudiant.findUnique({
    where: { id: existantId },
    include: { responsables: true, inscriptions: true, documents: true },
  });
  if (!existant) retour(etudiantId, "DOUBLON_INTROUVABLE");

  const inscriptionsAReparenter = doublon.inscriptions.filter(
    (i) => !existant.inscriptions.some((e) => e.classeId === i.classeId),
  );
  const responsablesAReparenter = doublon.responsables.filter(
    (r) =>
      !existant.responsables.some(
        (e) =>
          e.nom.toLowerCase() === r.nom.toLowerCase() &&
          e.prenom.toLowerCase() === r.prenom.toLowerCase(),
      ),
  );
  const documentsAReparenter = doublon.documents.filter(
    (d) => !existant.documents.some((e) => e.type === d.type && documentValide(e)),
  );
  const documentsASupprimer = doublon.documents.filter(
    (d) => !documentsAReparenter.some((r) => r.id === d.id),
  );

  await prisma.$transaction([
    prisma.etudiant.update({
      where: { id: existantId },
      data: {
        civilite: doublon.civilite ?? existant.civilite,
        nom: doublon.nom,
        prenom: doublon.prenom,
        dateNaissance: doublon.dateNaissance ?? existant.dateNaissance,
        villeNaissance: doublon.villeNaissance ?? existant.villeNaissance,
        telephoneMobile: doublon.telephoneMobile ?? existant.telephoneMobile,
        email: doublon.email ?? existant.email,
        adresse: doublon.adresse ?? existant.adresse,
        profession: doublon.profession ?? existant.profession,
        niveauEtudes: doublon.niveauEtudes ?? existant.niveauEtudes,
        dernierDiplome: doublon.dernierDiplome ?? existant.dernierDiplome,
        sectionSouhaiteeId: existant.sectionSouhaiteeId ?? doublon.sectionSouhaiteeId,
      },
    }),
    ...inscriptionsAReparenter.map((i) =>
      prisma.inscriptionClasse.update({ where: { id: i.id }, data: { etudiantId: existantId } }),
    ),
    ...responsablesAReparenter.map((r) =>
      prisma.responsableLegal.update({ where: { id: r.id }, data: { etudiantId: existantId } }),
    ),
    ...(documentsAReparenter.length > 0
      ? [
          prisma.document.updateMany({
            where: { id: { in: documentsAReparenter.map((d) => d.id) } },
            data: { etudiantId: existantId },
          }),
        ]
      : []),
    ...(documentsASupprimer.length > 0
      ? [prisma.document.deleteMany({ where: { id: { in: documentsASupprimer.map((d) => d.id) } } })]
      : []),
    prisma.etudiant.delete({ where: { id: etudiantId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "fusion_doublon_etudiant",
        entite: "Etudiant",
        entiteId: existantId,
        details: {
          etudiantSupprimeId: etudiantId,
          nom: doublon.nom,
          prenom: doublon.prenom,
          documentsReparentes: documentsAReparenter.length,
          documentsRedondantsSupprimes: documentsASupprimer.length,
        },
      },
    }),
  ]);
  await Promise.all(documentsASupprimer.map((d) => supprimerFichierDocument(d.cheminRelatif)));

  revalidatePath(`/etudiants/${existantId}`);
  revalidatePath("/etudiants");
  revalidatePath("/inscriptions");
  redirect(`/etudiants/${existantId}?ok=1`);
}

// Le staff a vérifié qu'il s'agit bien de deux personnes distinctes
// (homonymie) : on efface juste le signalement, les deux fiches restent
// indépendantes.
export async function confirmerHomonymeAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  if (!etudiantId) redirect("/etudiants");

  await prisma.$transaction([
    prisma.etudiant.update({
      where: { id: etudiantId },
      data: { doublonPotentielId: null },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "confirmation_homonyme",
        entite: "Etudiant",
        entiteId: etudiantId,
      },
    }),
  ]);

  revalidatePath(`/etudiants/${etudiantId}`);
  revalidatePath("/inscriptions");
  retour(etudiantId);
}

function estTypeDocument(valeur: string | null): valeur is TypeDocument {
  return !!valeur && valeur in TypeDocument;
}

function estTypePieceIdentite(valeur: string | null): valeur is TypePieceIdentite {
  return !!valeur && valeur in TypePieceIdentite;
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

  // Type de pièce + date d'expiration ne sont pertinents que pour
  // PIECE_IDENTITE (voir statutDocumentsRequis), ignorés silencieusement
  // sinon plutôt que de bloquer le téléversement d'un autre type de document.
  const typePieceIdentite = champTexte(formData, "typePieceIdentite");
  const dateExpirationBrute = champTexte(formData, "dateExpiration");
  if (type === "PIECE_IDENTITE" && (!estTypePieceIdentite(typePieceIdentite) || !dateExpirationBrute)) {
    retour(etudiantId, "PIECE_IDENTITE_INCOMPLETE");
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const cheminRelatif = await enregistrerDocumentEtudiant(etudiantId, fichier.name, contenu);

  const cree = await prisma.document.create({
    data: {
      etudiantId,
      type,
      typePieceIdentite: type === "PIECE_IDENTITE" ? (typePieceIdentite as TypePieceIdentite) : null,
      dateExpiration:
        type === "PIECE_IDENTITE" && dateExpirationBrute ? new Date(dateExpirationBrute) : null,
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

  const telephone = champTexte(formData, "telephone");
  if (telephone && !estTelephoneValide(telephone)) retour(etudiantId, "TELEPHONE_INVALIDE");
  const email = champTexte(formData, "email");
  if (email && !estEmailValide(email)) retour(etudiantId, "EMAIL_INVALIDE");

  const cree = await prisma.responsableLegal.create({
    data: {
      etudiantId,
      civilite: champCivilite(formData, "civilite"),
      nom,
      prenom,
      lien: champTexte(formData, "lien") ?? "Non précisé",
      telephone,
      telephoneProfessionnel: champTexte(formData, "telephoneProfessionnel"),
      email,
      adresse: champTexte(formData, "adresse"),
      codePostal: champTexte(formData, "codePostal"),
      ville: champTexte(formData, "ville"),
      profession: champTexte(formData, "profession"),
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

  const telephone = champTexte(formData, "telephone");
  if (telephone && !estTelephoneValide(telephone)) retour(etudiantId, "TELEPHONE_INVALIDE");
  const email = champTexte(formData, "email");
  if (email && !estEmailValide(email)) retour(etudiantId, "EMAIL_INVALIDE");

  await prisma.$transaction([
    prisma.responsableLegal.update({
      where: { id: responsableId },
      data: {
        civilite: champCivilite(formData, "civilite"),
        nom,
        prenom,
        lien: champTexte(formData, "lien") ?? "Non précisé",
        telephone,
        telephoneProfessionnel: champTexte(formData, "telephoneProfessionnel"),
        email,
        adresse: champTexte(formData, "adresse"),
        codePostal: champTexte(formData, "codePostal"),
        ville: champTexte(formData, "ville"),
        profession: champTexte(formData, "profession"),
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
