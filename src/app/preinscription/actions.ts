"use server";

import { prisma } from "@/lib/prisma";
import { Civilite, Sexe, TypePieceIdentite } from "@/generated/prisma/enums";
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

// Optionnel (dossier Jeunes uniquement, voir Etudiant.sexe) : null si non
// renseigné, jamais bloquant — même règle que côté staff (etudiants/[id]/actions.ts).
function champSexe(formData: FormData, nom: string): Sexe | null {
  const valeur = champTexte(formData, nom);
  return valeur === "F" || valeur === "M" ? valeur : null;
}

function estTypePieceIdentite(valeur: string | null): valeur is TypePieceIdentite {
  return !!valeur && valeur in TypePieceIdentite;
}

// Même jeu de champs que ResponsableLegal (voir prisma/schema.prisma) et que
// le bloc "Ajouter un responsable" côté staff (etudiants/[id]/actions.ts) —
// nécessaire pour que le dossier généré (src/lib/dossier/context.ts, modèle
// Jeunes) affiche déjà adresse/téléphone professionnel/etc. sans ressaisie.
// Responsable 2 (père ou mère) est facultatif : un seul suffit pour valider
// le formulaire, voir preinscription-form.tsx#BlocResponsable.
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
    telephoneProfessionnel: champTexte(formData, `responsable${index}TelephoneProfessionnel`),
    email: champTexte(formData, `responsable${index}Email`),
    profession: champTexte(formData, `responsable${index}Profession`),
    adresse: champTexte(formData, `responsable${index}Adresse`),
    codePostal: champTexte(formData, `responsable${index}CodePostal`),
    ville: champTexte(formData, `responsable${index}Ville`),
  };
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
// son créneau souhaité sous `sectionId-{ligneId}`/`creneauSouhaiteId-{ligneId}`,
// reconstruites ici via `ligneId` (répété, un par ligne) plutôt que par
// position.
//
// Le créneau souhaité vient toujours du catalogue de la section (CS/S/D +
// restriction, voir CreneauSection et Administration → Sections) — jamais
// d'une Classe réelle : la préinscription n'inscrit jamais directement à une
// classe précise (matière/niveau), qui reste un choix du staff au moment de
// la confirmation sur place (voir le texte d'intro de la page). Les champs
// ne sont pas fiables côté client, d'où la revérification serveur (créneau
// existant, bien rattaché à la section choisie sur sa ligne).
//
// La première section choisie est gardée sur `Etudiant.sectionSouhaiteeId` +
// `creneauSouhaiteId` — affichée comme « à assigner » dans Cours suivis.
// `Etudiant` ne porte qu'un seul couple de champs de ce type : une éventuelle
// section supplémentaire est notée dans `remarque` plutôt que silencieusement
// perdue (cas rare en pratique).
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
      // Carte du catalogue CS/S/D de la section (voir Administration →
      // Sections) — voir preinscription-form.tsx.
      creneauSouhaiteId: champTexte(formData, `creneauSouhaiteId-${ligneId}`),
    }))
    .filter(
      (l): l is { sectionId: string; creneauSouhaiteId: string | null } => !!l.sectionId,
    );

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
    const telephoneFixe = champTexte(formData, "telephoneFixe");
    if (telephoneFixe && !estTelephoneValide(telephoneFixe)) {
      return { erreur: "Le téléphone fixe n'a pas un format valide (ex. 04 91 23 45 67)." };
    }
  }

  // Un mineur a toujours un responsable légal au dossier (voir
  // preinscription-form.tsx#BlocResponsable, index 1 obligatoire) — le
  // second est facultatif (ex. père et mère tous deux au dossier).
  const responsable1 = responsableDepuisFormulaire(formData, 1);
  const responsable2 = responsableDepuisFormulaire(formData, 2);
  if (estJeunes && (!responsable1 || !responsable1.telephone || !responsable1.email)) {
    return {
      erreur: "Le nom, le prénom, le téléphone et l'email du responsable légal sont obligatoires.",
    };
  }
  for (const responsable of [responsable1, responsable2]) {
    if (!responsable) continue;
    if (responsable.telephone && !estTelephoneValide(responsable.telephone)) {
      return { erreur: "Le téléphone d'un responsable légal n'a pas un format valide (ex. 06 12 34 56 78)." };
    }
    if (responsable.telephoneProfessionnel && !estTelephoneValide(responsable.telephoneProfessionnel)) {
      return { erreur: "Le téléphone professionnel d'un responsable légal n'a pas un format valide." };
    }
    if (responsable.email && !estEmailValide(responsable.email)) {
      return { erreur: "L'email d'un responsable légal n'a pas un format valide." };
    }
    if (responsable.codePostal && !estCodePostalValide(responsable.codePostal)) {
      return { erreur: "Le code postal d'un responsable légal doit comporter 5 chiffres." };
    }
  }

  const creneauSouhaiteIdsCandidats = [
    ...new Set(lignes.map((l) => l.creneauSouhaiteId).filter((id): id is string => !!id)),
  ];
  const creneauxSouhaitesCandidats =
    creneauSouhaiteIdsCandidats.length > 0
      ? await prisma.creneauSection.findMany({ where: { id: { in: creneauSouhaiteIdsCandidats } } })
      : [];
  const creneauSouhaiteParId = new Map(creneauxSouhaitesCandidats.map((c) => [c.id, c]));

  const sectionsSouhaitees: {
    id: string;
    nom: string;
    creneau: { id: string; code: string; jour: string; horaire: string } | null;
  }[] = lignes.map((ligne) => {
    const section = sectionParId.get(ligne.sectionId)!;
    const creneauSouhaite = ligne.creneauSouhaiteId
      ? creneauSouhaiteParId.get(ligne.creneauSouhaiteId)
      : undefined;
    return {
      id: section.id,
      nom: section.nom,
      creneau:
        creneauSouhaite && creneauSouhaite.sectionId === ligne.sectionId
          ? {
              id: creneauSouhaite.id,
              code: creneauSouhaite.code,
              jour: creneauSouhaite.jour,
              horaire: creneauSouhaite.horaire,
            }
          : null,
    };
  });

  const dateNaissance = new Date(dateNaissanceBrute);
  const responsablesACreer = [responsable1, responsable2].filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );

  const doublon = await trouverDoublonEtudiant({
    nom,
    prenom,
    dateNaissance,
    telephoneResponsable: responsable1?.telephone,
    emailResponsable: responsable1?.email,
  });

  const remarqueSectionsSupplementaires =
    sectionsSouhaitees.length > 1
      ? `Autre(s) section(s) souhaitée(s) à la préinscription : ${sectionsSouhaitees
          .slice(1)
          .map((s) => (s.creneau ? `${s.nom} (créneau souhaité : ${s.creneau.code} — ${s.creneau.jour}, ${s.creneau.horaire})` : s.nom))
          .join(", ")}.`
      : null;

  const etudiant = await prisma.etudiant.create({
    data: {
      civilite,
      nom,
      prenom,
      dateNaissance,
      villeNaissance,
      sexe: champSexe(formData, "sexe"),
      niveauScolaire: champTexte(formData, "niveauScolaire"),
      telephoneMobile: champTexte(formData, "telephoneMobile"),
      telephoneFixe: champTexte(formData, "telephoneFixe"),
      email: champTexte(formData, "email"),
      contactUrgence: champTexte(formData, "contactUrgence"),
      adresse: champTexte(formData, "adresse"),
      complementAdresse: champTexte(formData, "complementAdresse"),
      codePostal: champTexte(formData, "codePostal"),
      ville: champTexte(formData, "ville"),
      profession: champTexte(formData, "profession"),
      niveauEtudes: champTexte(formData, "niveauEtudes"),
      dernierDiplome: champTexte(formData, "dernierDiplome"),
      remarque: remarqueSectionsSupplementaires,
      statutInscription: "PREINSCRIT",
      sectionSouhaiteeId: sectionsSouhaitees[0]?.id ?? null,
      creneauSouhaiteId: sectionsSouhaitees[0]?.creneau?.id ?? null,
      doublonPotentielId: doublon?.id,
      responsables: responsablesACreer.length > 0 ? { create: responsablesACreer } : undefined,
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
