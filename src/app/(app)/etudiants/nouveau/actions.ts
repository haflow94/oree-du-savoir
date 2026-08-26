"use server";

import { prisma } from "@/lib/prisma";
import { Civilite } from "@/generated/prisma/enums";
import { requireModule, Module } from "@/lib/permissions";
import { estEmailValide, estTelephoneValide, estCodePostalValide } from "@/lib/champs-formulaire";

export type Doublon = {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
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
export async function rechercherDoublonsAction(
  nom: string,
  prenom: string,
): Promise<Doublon[]> {
  await requireModule(Module.ETUDIANTS, "LECTURE");
  const nomNettoye = nom.trim();
  const prenomNettoye = prenom.trim();
  if (!nomNettoye || !prenomNettoye) return [];

  const trouves = await prisma.etudiant.findMany({
    where: {
      nom: { equals: nomNettoye, mode: "insensitive" },
      prenom: { equals: prenomNettoye, mode: "insensitive" },
    },
    select: { id: true, nom: true, prenom: true, dateNaissance: true },
    take: 5,
  });

  return trouves.map((d) => ({
    id: d.id,
    nom: d.nom,
    prenom: d.prenom,
    dateNaissance: d.dateNaissance ? d.dateNaissance.toISOString() : null,
  }));
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
    throw new Error(
      "La civilité, le nom, le prénom, la date de naissance, la ville de naissance, le téléphone mobile, l'email, l'adresse, le code postal, la ville et le niveau d'études sont obligatoires.",
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
