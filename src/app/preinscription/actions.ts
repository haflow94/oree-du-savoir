"use server";

import { prisma } from "@/lib/prisma";
import { Civilite, TypePieceIdentite } from "@/generated/prisma/enums";
import { trouverDoublonEtudiant } from "@/lib/doublons-etudiant";
import { estEmailValide, estTelephoneValide, estCodePostalValide } from "@/lib/champs-formulaire";
import { enregistrerDocumentEtudiant } from "@/lib/documents";

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

function estTypePieceIdentite(valeur: string | null): valeur is TypePieceIdentite {
  return !!valeur && valeur in TypePieceIdentite;
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
  const civilite = champCivilite(formData, "civilite");
  const dateNaissanceBrute = champTexte(formData, "dateNaissance");
  const villeNaissance = champTexte(formData, "villeNaissance");

  const ligneIds = formData.getAll("ligneId").map(String);
  const lignes = ligneIds
    .map((ligneId) => ({
      sectionId: champTexte(formData, `sectionId-${ligneId}`),
      classeId: champTexte(formData, `classeId-${ligneId}`),
    }))
    .filter((l): l is { sectionId: string; classeId: string | null } => !!l.sectionId);

  if (!civilite || !nom || !prenom || !dateNaissanceBrute || !villeNaissance || lignes.length === 0) {
    return {
      erreur:
        "La civilité, le nom, le prénom, la date de naissance, la ville de naissance et au moins une section sont obligatoires.",
    };
  }
  if (formData.get("rgpd") !== "on") {
    return {
      erreur: "Merci de confirmer avoir pris connaissance de l'information sur les données personnelles.",
    };
  }

  // Photo et pièce d'identité sont facultatives sur ce formulaire public (la
  // famille peut ne pas les avoir sous la main, ou déjà être connue de
  // l'association) : voir CLAUDE.md, formulaire public/anonyme. Type et date
  // d'expiration ne sont exigés que si un fichier de pièce d'identité est
  // effectivement fourni.
  const photo = formData.get("photo");
  const pieceIdentite = formData.get("pieceIdentite");
  const typePieceIdentite = champTexte(formData, "typePieceIdentite");
  const dateExpirationPieceBrute = champTexte(formData, "dateExpirationPiece");
  const pieceIdentiteFournie = pieceIdentite instanceof File && pieceIdentite.size > 0;
  if (pieceIdentiteFournie && (!estTypePieceIdentite(typePieceIdentite) || !dateExpirationPieceBrute)) {
    return {
      erreur: "Le type de pièce et sa date d'expiration sont obligatoires si vous joignez une pièce d'identité.",
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

  // Mêmes règles d'affichage que côté client (voir preinscription-form.tsx) :
  // pour une inscription "Jeunes", ce sont les coordonnées du responsable
  // légal qui sont saisies, pas celles de l'enfant — ces champs ne sont donc
  // pas rendus dans le formulaire et ne peuvent pas être exigés ici.
  const estJeunes = sectionsChoisies.some((s) => s.nom === "Jeunes");
  if (!estJeunes) {
    const telephoneMobile = champTexte(formData, "telephoneMobile");
    const email = champTexte(formData, "email");
    const adresse = champTexte(formData, "adresse");
    const codePostal = champTexte(formData, "codePostal");
    const ville = champTexte(formData, "ville");
    const niveauEtudes = champTexte(formData, "niveauEtudes");
    if (!telephoneMobile || !email || !adresse || !codePostal || !ville || !niveauEtudes) {
      return {
        erreur:
          "Le téléphone mobile, l'email, l'adresse, le code postal, la ville et le niveau d'études sont obligatoires.",
      };
    }
    if (!estTelephoneValide(telephoneMobile)) {
      return { erreur: "Le téléphone mobile n'a pas un format valide (ex. 06 12 34 56 78)." };
    }
    if (!estEmailValide(email)) {
      return { erreur: "L'email n'a pas un format valide." };
    }
    if (!estCodePostalValide(codePostal)) {
      return { erreur: "Le code postal doit comporter 5 chiffres." };
    }
  }

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

  const dateNaissance = new Date(dateNaissanceBrute);
  const estResponsable =
    champTexte(formData, "responsableNom") && champTexte(formData, "responsablePrenom");

  const doublon = await trouverDoublonEtudiant({
    nom,
    prenom,
    dateNaissance,
    telephoneResponsable: champTexte(formData, "responsableTelephone"),
    emailResponsable: champTexte(formData, "responsableEmail"),
  });

  const inscriptionsACreer = [...classeIdsValides].map((classeId) => ({ classeId }));

  const remarqueSectionsSupplementaires =
    sectionsSansCreneau.length > 1
      ? `Autre(s) section(s) souhaitée(s) sans créneau disponible à la préinscription : ${sectionsSansCreneau
          .slice(1)
          .map((s) => s.nom)
          .join(", ")}.`
      : null;

  const etudiant = await prisma.etudiant.create({
    data: {
      civilite,
      nom,
      prenom,
      dateNaissance,
      villeNaissance,
      telephoneMobile: champTexte(formData, "telephoneMobile"),
      email: champTexte(formData, "email"),
      adresse: champTexte(formData, "adresse"),
      codePostal: champTexte(formData, "codePostal"),
      ville: champTexte(formData, "ville"),
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

  // Écriture des fichiers hors transaction (même pattern que
  // televerserDocumentAction, etudiants/[id]/actions.ts) : le fichier vit
  // sur DOCUMENTS_DIR, jamais en base, la ligne Document ne référence que le
  // chemin une fois le fichier réellement écrit.
  if (photo instanceof File && photo.size > 0) {
    const contenu = Buffer.from(await photo.arrayBuffer());
    const cheminRelatif = await enregistrerDocumentEtudiant(etudiant.id, photo.name, contenu);
    await prisma.document.create({
      data: {
        etudiantId: etudiant.id,
        type: "PHOTO",
        nomFichier: photo.name,
        cheminRelatif,
        mimeType: photo.type || "application/octet-stream",
        tailleOctets: contenu.length,
      },
    });
  }
  if (pieceIdentiteFournie && pieceIdentite instanceof File) {
    const contenu = Buffer.from(await pieceIdentite.arrayBuffer());
    const cheminRelatif = await enregistrerDocumentEtudiant(etudiant.id, pieceIdentite.name, contenu);
    await prisma.document.create({
      data: {
        etudiantId: etudiant.id,
        type: "PIECE_IDENTITE",
        typePieceIdentite: typePieceIdentite as TypePieceIdentite,
        dateExpiration: new Date(dateExpirationPieceBrute!),
        nomFichier: pieceIdentite.name,
        cheminRelatif,
        mimeType: pieceIdentite.type || "application/octet-stream",
        tailleOctets: contenu.length,
      },
    });
  }

  return { ok: true };
}
