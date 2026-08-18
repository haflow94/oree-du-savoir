"use server";

import { requireSession, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Civilite } from "@/generated/prisma/enums";
import { Role } from "@/lib/roles";

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
  await requireSession();
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
  const session = await requireRole([Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU]);

  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  if (!nom || !prenom) {
    throw new Error("Le nom et le prénom sont obligatoires.");
  }

  const dateNaissanceBrute = champTexte(formData, "dateNaissance");
  const dateNaissance = dateNaissanceBrute ? new Date(dateNaissanceBrute) : null;

  const responsables = [
    responsableDepuisFormulaire(formData, 1),
    responsableDepuisFormulaire(formData, 2),
  ].filter((r): r is NonNullable<typeof r> => r !== null);

  const etudiant = await prisma.$transaction(async (tx) => {
    const cree = await tx.etudiant.create({
      data: {
        civilite: champCivilite(formData, "civilite"),
        nom,
        prenom,
        dateNaissance,
        villeNaissance: champTexte(formData, "villeNaissance"),
        telephoneMobile: champTexte(formData, "telephoneMobile"),
        telephoneFixe: champTexte(formData, "telephoneFixe"),
        email: champTexte(formData, "email"),
        adresse: champTexte(formData, "adresse"),
        complementAdresse: champTexte(formData, "complementAdresse"),
        profession: champTexte(formData, "profession"),
        niveauEtudes: champTexte(formData, "niveauEtudes"),
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
