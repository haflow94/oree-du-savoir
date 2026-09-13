"use server";

import { prisma } from "@/lib/prisma";
import { Civilite } from "@/generated/prisma/enums";
import { requireModule, Module } from "@/lib/permissions";
import { estEmailValide, estTelephoneValide, estCodePostalValide } from "@/lib/champs-formulaire";
import {
  trouverCorrespondancesContact,
  type CritereCorrespondanceDoublon,
} from "@/lib/doublons-etudiant";

export type Doublon = {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  // Absent = correspondance par nom+prénom exact (comportement historique,
  // voir plus bas) ; présent = correspondance e-mail/téléphone indépendante
  // du nom (voir lib/doublons-etudiant.ts#trouverCorrespondancesContact et
  // LIBELLE_CRITERE_DOUBLON pour l'affichage).
  critere?: CritereCorrespondanceDoublon;
};

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

function responsableDepuisFormulaire(formData: FormData, index: 1 | 2) {
  const nom = champTexte(formData, `responsable${index}Nom`);
  const prenom = champTexte(formData, `responsable${index}Prenom`);
  if (!nom || !prenom) return null;

  return {
    civilite: champCivilite(formData, `responsable${index}Civilite`),
    nom,
    prenom,
    lien: champTexte(formData, `responsable${index}Lien`) ?? "Non précisé",
    telephone: champTexte(formData, `responsable${index}Telephone`),
    email: champTexte(formData, `responsable${index}Email`),
    adresse: champTexte(formData, `responsable${index}Adresse`),
  };
}

// Vérification appelée avant la création réelle (voir etudiant-form.tsx) :
// un aller-retour serveur indépendant, plutôt qu'un état de useActionState,
// pour ne pas déclencher le reset automatique des champs non contrôlés que
// React applique après l'exécution d'une action de formulaire.
// Recherche proactive avant même de commencer à remplir le formulaire (voir
// EtudiantForm) : nom OU prénom, correspondance partielle — contrairement à
// rechercherDoublonsAction (nom ET prénom exacts, appelée juste avant la
// création pour confirmer qu'il ne s'agit pas d'un doublon). Sert à retrouver
// et rouvrir une fiche existante plutôt que d'en recréer une, pour un ancien
// étudiant qui se réinscrit une nouvelle année.
export async function rechercherEtudiantsAction(recherche: string): Promise<Doublon[]> {
  await requireModule(Module.ETUDIANTS, "LECTURE");
  const nettoyee = recherche.trim();
  if (nettoyee.length < 2) return [];

  const trouves = await prisma.etudiant.findMany({
    where: {
      OR: [
        { nom: { contains: nettoyee, mode: "insensitive" } },
        { prenom: { contains: nettoyee, mode: "insensitive" } },
      ],
    },
    select: { id: true, nom: true, prenom: true, dateNaissance: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    take: 8,
  });

  return trouves.map((d) => ({
    id: d.id,
    nom: d.nom,
    prenom: d.prenom,
    dateNaissance: d.dateNaissance ? d.dateNaissance.toISOString() : null,
  }));
}

// Deux axes de correspondance combinés (voir lib/doublons-etudiant.ts) : nom
// + prénom exacts (comportement historique, inchangé) et e-mail/téléphone
// indépendant du nom (nouveau — coordonnées de l'étudiant lui-même ET de
// ses éventuels responsables). Toujours purement informatif : aucun des
// deux axes ne bloque la création, `soumettre()` (etudiant-form.tsx) permet
// de continuer malgré tout ("forcer"). La limite de 5 résultats déjà en
// place est conservée, appliquée sur l'ensemble combiné.
export async function rechercherDoublonsAction(formData: FormData): Promise<Doublon[]> {
  await requireModule(Module.ETUDIANTS, "LECTURE");
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  if (!nom || !prenom) return [];

  const responsable1 = responsableDepuisFormulaire(formData, 1);
  const responsable2 = responsableDepuisFormulaire(formData, 2);

  const [parIdentite, correspondancesContact] = await Promise.all([
    prisma.etudiant.findMany({
      where: {
        nom: { equals: nom, mode: "insensitive" },
        prenom: { equals: prenom, mode: "insensitive" },
      },
      select: { id: true, nom: true, prenom: true, dateNaissance: true },
      take: 5,
    }),
    trouverCorrespondancesContact({
      emails: [champTexte(formData, "email"), responsable1?.email, responsable2?.email],
      telephones: [
        champTexte(formData, "telephoneMobile"),
        champTexte(formData, "telephoneFixe"),
        responsable1?.telephone,
        responsable2?.telephone,
      ],
    }),
  ]);

  const idsDejaTrouves = new Set(parIdentite.map((d) => d.id));

  const doublons: Doublon[] = [
    ...parIdentite.map((d) => ({
      id: d.id,
      nom: d.nom,
      prenom: d.prenom,
      dateNaissance: d.dateNaissance ? d.dateNaissance.toISOString() : null,
    })),
    ...correspondancesContact
      .filter((c) => !idsDejaTrouves.has(c.id))
      .map((c) => ({ id: c.id, nom: c.nom, prenom: c.prenom, dateNaissance: null, critere: c.critere })),
  ];

  return doublons.slice(0, 5);
}

export async function creerEtudiantAction(
  formData: FormData,
): Promise<{ id: string }> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

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
  const contactUrgenceNom = champTexte(formData, "contactUrgenceNom");
  const contactUrgencePrenom = champTexte(formData, "contactUrgencePrenom");
  const contactUrgenceTelephone = champTexte(formData, "contactUrgenceTelephone");

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
    !niveauEtudes ||
    !contactUrgenceNom ||
    !contactUrgencePrenom ||
    !contactUrgenceTelephone
  ) {
    throw new Error(
      "La civilité, le nom, le prénom, la date de naissance, la ville de naissance, le téléphone mobile, l'email, l'adresse, le code postal, la ville, le niveau d'études et le contact d'urgence (nom, prénom, téléphone) sont obligatoires.",
    );
  }
  if (!estTelephoneValide(telephoneMobile)) {
    throw new Error("Le téléphone mobile n'a pas un format valide (ex. 06 12 34 56 78).");
  }
  if (!estEmailValide(email)) {
    throw new Error("L'email n'a pas un format valide.");
  }
  if (!estCodePostalValide(codePostal)) {
    throw new Error("Le code postal doit comporter 5 chiffres.");
  }
  if (!estTelephoneValide(contactUrgenceTelephone)) {
    throw new Error("Le téléphone du contact d'urgence n'a pas un format valide (ex. 06 12 34 56 78).");
  }

  const telephoneFixe = champTexte(formData, "telephoneFixe");
  if (telephoneFixe && !estTelephoneValide(telephoneFixe)) {
    throw new Error("Le téléphone fixe n'a pas un format valide (ex. 04 91 23 45 67).");
  }

  const dateNaissance = new Date(dateNaissanceBrute);

  const responsables = [
    responsableDepuisFormulaire(formData, 1),
    responsableDepuisFormulaire(formData, 2),
  ].filter((r): r is NonNullable<typeof r> => r !== null);
  for (const r of responsables) {
    if (r.telephone && !estTelephoneValide(r.telephone)) {
      throw new Error("Le téléphone d'un responsable légal n'a pas un format valide (ex. 06 12 34 56 78).");
    }
    if (r.email && !estEmailValide(r.email)) {
      throw new Error("L'email d'un responsable légal n'a pas un format valide.");
    }
  }

  const etudiant = await prisma.$transaction(async (tx) => {
    const cree = await tx.etudiant.create({
      data: {
        civilite,
        nom,
        prenom,
        dateNaissance,
        dateInscription: new Date(),
        villeNaissance,
        telephoneMobile,
        telephoneFixe,
        email,
        adresse,
        complementAdresse: champTexte(formData, "complementAdresse"),
        codePostal,
        ville,
        contactUrgenceNom,
        contactUrgencePrenom,
        contactUrgenceTelephone,
        profession: champTexte(formData, "profession"),
        niveauEtudes,
        dernierDiplome: champTexte(formData, "dernierDiplome"),
        remarque: champTexte(formData, "remarque"),
        responsables: { create: responsables },
      },
    });

    await tx.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "creation",
        entite: "Etudiant",
        entiteId: cree.id,
      },
    });

    return cree;
  });

  return { id: etudiant.id };
}
