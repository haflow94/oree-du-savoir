"use server";

import { prisma } from "@/lib/prisma";
import { Civilite } from "@/generated/prisma/enums";
import { statutPourNouvelleInscription } from "@/lib/inscriptions";
import { trouverDoublonEtudiant } from "@/lib/doublons-etudiant";

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
// étudiant.
//
// Détection de doublons (nom + prénom + date de naissance, ou nom + prénom +
// téléphone/email d'un responsable, voir lib/doublons-etudiant.ts) : la
// création n'est jamais bloquée côté public — la famille peut toujours
// soumettre — mais une correspondance trouvée est mémorisée sur
// `doublonPotentielId`. C'est ensuite au staff de trancher depuis la fiche
// étudiant : mettre à jour la fiche existante (fusion) ou confirmer un
// homonyme distinct (voir etudiants/[id]/actions.ts).
//
// Une même personne peut suivre plusieurs cours/sections (voir
// preinscription-form.tsx) : chaque ligne du formulaire envoie sa section et
// son créneau sous `sectionId-{ligneId}`/`classeId-{ligneId}`, reconstruites
// ici via `ligneId` (répété, un par ligne) plutôt que par position — un
// champ `classeId-*` désactivé (aucun créneau ouvert) est absent du
// FormData, ce qui casserait un simple appariement par index.
//
// Chaque créneau choisi devient tout de suite une InscriptionClasse (et non
// un simple souhait en texte) : elle apparaît immédiatement dans « Cours
// suivis » sur la fiche étudiant, et reste donc déjà présente quand le staff
// valide le dossier — pas de ressaisie. Les champs ne sont pas fiables côté
// client, d'où la revérification serveur (classe existante, bien dans la
// section choisie sur sa ligne).
//
// Si aucun créneau n'était encore ouvert pour une section choisie (ou que le
// classeId envoyé ne tient pas la revérification), la première de ces
// sections est gardée sur `Etudiant.sectionSouhaiteeId` — affichée comme « à
// assigner » dans Cours suivis. `Etudiant` ne porte qu'un seul champ de ce
// type : une éventuelle section supplémentaire sans créneau est notée dans
// `remarque` plutôt que silencieusement perdue (cas rare en pratique).
export async function preinscrireAction(
  formData: FormData,
): Promise<{ erreur: string } | { ok: true }> {
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");

  const ligneIds = formData.getAll("ligneId").map(String);
  const lignes = ligneIds
    .map((ligneId) => ({
      sectionId: champTexte(formData, `sectionId-${ligneId}`),
      classeId: champTexte(formData, `classeId-${ligneId}`),
    }))
    .filter((l): l is { sectionId: string; classeId: string | null } => !!l.sectionId);

  if (!nom || !prenom || lignes.length === 0) {
    return { erreur: "Le nom, le prénom et au moins une section sont obligatoires." };
  }
  if (formData.get("rgpd") !== "on") {
    return {
      erreur: "Merci de confirmer avoir pris connaissance de l'information sur les données personnelles.",
    };
  }

  const sectionIdsChoisies = [...new Set(lignes.map((l) => l.sectionId))];
  const sectionsChoisies = await prisma.section.findMany({
    where: { id: { in: sectionIdsChoisies } },
  });
  if (sectionsChoisies.length !== sectionIdsChoisies.length) {
    return { erreur: "Section invalide." };
  }
  const sectionParId = new Map(sectionsChoisies.map((s) => [s.id, s]));

  const classeIdsCandidats = [...new Set(lignes.map((l) => l.classeId).filter((id): id is string => !!id))];
  const classesCandidates =
    classeIdsCandidats.length > 0
      ? await prisma.classe.findMany({
          where: { id: { in: classeIdsCandidats } },
          include: { cours: true },
        })
      : [];
  const classeParId = new Map(classesCandidates.map((c) => [c.id, c]));

  // Une classe ne peut être ajoutée qu'une fois (contrainte d'unicité
  // etudiant+classe) : deux lignes pointant par erreur vers le même créneau
  // ne doivent pas produire deux InscriptionClasse.
  const classeIdsValides = new Set<string>();
  const sectionsSansCreneau: { id: string; nom: string }[] = [];
  for (const ligne of lignes) {
    const classe = ligne.classeId ? classeParId.get(ligne.classeId) : undefined;
    if (classe && classe.cours.sectionId === ligne.sectionId) {
      classeIdsValides.add(classe.id);
    } else {
      const section = sectionParId.get(ligne.sectionId)!;
      sectionsSansCreneau.push({ id: section.id, nom: section.nom });
    }
  }

  const dateNaissanceBrute = champTexte(formData, "dateNaissance");
  const dateNaissance = dateNaissanceBrute ? new Date(dateNaissanceBrute) : null;
  const estResponsable =
    champTexte(formData, "responsableNom") && champTexte(formData, "responsablePrenom");

  const doublon = await trouverDoublonEtudiant({
    nom,
    prenom,
    dateNaissance,
    telephoneResponsable: champTexte(formData, "responsableTelephone"),
    emailResponsable: champTexte(formData, "responsableEmail"),
  });

  const inscriptionsACreer = await Promise.all(
    [...classeIdsValides].map(async (classeId) => ({
      classeId,
      statut: await statutPourNouvelleInscription(classeId),
    })),
  );

  const remarqueSectionsSupplementaires =
    sectionsSansCreneau.length > 1
      ? `Autre(s) section(s) souhaitée(s) sans créneau disponible à la préinscription : ${sectionsSansCreneau
          .slice(1)
          .map((s) => s.nom)
          .join(", ")}.`
      : null;

  await prisma.etudiant.create({
    data: {
      civilite: champCivilite(formData, "civilite"),
      nom,
      prenom,
      dateNaissance,
      villeNaissance: champTexte(formData, "villeNaissance"),
      telephoneMobile: champTexte(formData, "telephoneMobile"),
      email: champTexte(formData, "email"),
      adresse: champTexte(formData, "adresse"),
      profession: champTexte(formData, "profession"),
      niveauEtudes: champTexte(formData, "niveauEtudes"),
      dernierDiplome: champTexte(formData, "dernierDiplome"),
      remarque: remarqueSectionsSupplementaires,
      statutInscription: "PREINSCRIT",
      sectionSouhaiteeId: sectionsSansCreneau[0]?.id ?? null,
      doublonPotentielId: doublon?.id,
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
      inscriptions: inscriptionsACreer.length > 0 ? { create: inscriptionsACreer } : undefined,
    },
  });

  return { ok: true };
}
