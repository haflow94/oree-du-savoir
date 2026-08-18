"use server";

import { prisma } from "@/lib/prisma";
import { Civilite } from "@/generated/prisma/enums";

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

// Point d'entrée public, sans authentification : toute donnée saisie ici
// reste au statut PREINSCRIT tant que le staff n'a pas contrôlé le dossier
// sur place (signature, documents, paiement) et validé depuis la fiche
// étudiant. Pas de détection de doublons ici : c'est fait au contrôle.
export async function preinscrireAction(
  formData: FormData,
): Promise<{ erreur: string } | { ok: true }> {
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  const sectionId = champTexte(formData, "sectionId");
  if (!nom || !prenom || !sectionId) {
    return { erreur: "Le nom, le prénom et la section sont obligatoires." };
  }

  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) {
    return { erreur: "Section invalide." };
  }

  const dateNaissanceBrute = champTexte(formData, "dateNaissance");
  const estResponsable =
    champTexte(formData, "responsableNom") && champTexte(formData, "responsablePrenom");

  await prisma.etudiant.create({
    data: {
      civilite: champCivilite(formData, "civilite"),
      nom,
      prenom,
      dateNaissance: dateNaissanceBrute ? new Date(dateNaissanceBrute) : null,
      villeNaissance: champTexte(formData, "villeNaissance"),
      telephoneMobile: champTexte(formData, "telephoneMobile"),
      email: champTexte(formData, "email"),
      adresse: champTexte(formData, "adresse"),
      profession: champTexte(formData, "profession"),
      niveauEtudes: champTexte(formData, "niveauEtudes"),
      dernierDiplome: champTexte(formData, "dernierDiplome"),
      remarque: `Préinscription en ligne — section souhaitée : ${section.nom}.`,
      statutInscription: "PREINSCRIT",
      responsables: estResponsable
        ? {
            create: {
              civilite: champCivilite(formData, "responsableCivilite"),
              nom: champTexte(formData, "responsableNom") ?? "",
              prenom: champTexte(formData, "responsablePrenom") ?? "",
              lien: champTexte(formData, "responsableLien") ?? "Non précisé",
              telephone: champTexte(formData, "responsableTelephone"),
              email: champTexte(formData, "responsableEmail"),
              adresse: champTexte(formData, "responsableAdresse"),
            },
          }
        : undefined,
    },
  });

  return { ok: true };
}
