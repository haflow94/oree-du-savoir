"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Civilite, Sexe } from "@/generated/prisma/enums";
import { trouverDoublonEtudiant, LIBELLE_CRITERE_DOUBLON } from "@/lib/doublons-etudiant";
import { estEmailValide, estTelephoneValide, estCodePostalValide } from "@/lib/champs-formulaire";
import { enregistrerDocumentEtudiant, nomFichierDocument } from "@/lib/documents";
import { detecterTypeMimeReel, TAILLE_MAX_FICHIER_MO, TAILLE_MAX_FICHIER_OCTETS } from "@/lib/fichiers-uploades";
import {
  tenterConsommerCode,
  estCodeAccueilAuto,
  MESSAGE_CODE_INVALIDE,
  MESSAGE_CODE_ACCUEIL_EXPIRE,
} from "@/lib/preinscription-code";
import { adresseIpClient, limiteDebitDepassee } from "@/lib/rate-limit";
import { genererNouvelleVersionDossier } from "@/lib/dossier/generation";
import { NIVEAUX_PAR_CATALOGUE } from "@/lib/niveaux-section";

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

// Question obligatoire (voir Etudiant.autorisationPhotoVideo) : toujours
// explicitement "oui" ou "non" (boutons radio, aucun coché par défaut, voir
// preinscription-form.tsx) — jamais de valeur implicite. Toute autre valeur
// (champ absent, manipulé) est refusée, jamais interprétée comme un refus ou
// un accord par défaut (règle non négociable "ne jamais deviner").
function champAutorisationPhotoVideo(formData: FormData): boolean | null {
  const valeur = champTexte(formData, "autorisationPhotoVideo");
  if (valeur === "oui") return true;
  if (valeur === "non") return false;
  return null;
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
  // Limitation de débit applicative (défense en profondeur, en complément du
  // point d'entrée public — voir src/lib/rate-limit.ts) : avant toute
  // lecture de FormData, pour ne pas gaspiller de travail sur un abus
  // évident.
  const ip = await adresseIpClient();
  if (limiteDebitDepassee(`preinscription-soumission:${ip}`, 5, 15 * 60 * 1000)) {
    return { erreur: "Trop de tentatives depuis cette connexion. Merci de réessayer dans quelques minutes." };
  }

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
      // Niveau coché pour cette ligne (radio, un seul choix — voir
      // Section.catalogueNiveaux) : revérifié ci-dessous une fois la section
      // chargée, jamais fait confiance au client seul.
      niveau: champTexte(formData, `niveau-${ligneId}`),
    }))
    .filter(
      (l): l is { sectionId: string; creneauSouhaiteId: string | null; niveau: string | null } =>
        !!l.sectionId,
    );

  if (!civilite || !nom || !prenom || !dateNaissanceBrute || !villeNaissance || lignes.length === 0) {
    return {
      erreur:
        "La civilité, le nom, le prénom, la date de naissance, la ville de naissance et au moins une section sont obligatoires.",
    };
  }
  const dateNaissance = new Date(dateNaissanceBrute);
  if (formData.get("rgpd") !== "on") {
    return {
      erreur: "Merci de confirmer avoir pris connaissance de l'information sur les données personnelles.",
    };
  }

  const autorisationPhotoVideo = champAutorisationPhotoVideo(formData);
  if (autorisationPhotoVideo === null) {
    return {
      erreur: "Merci d'indiquer si vous acceptez ou non d'être filmé(e)/photographié(e) lors des activités.",
    };
  }

  // Photo facultative sur ce formulaire public (décision association du
  // 2026-09-16, même assouplissement que la pièce d'identité déjà retirée
  // ci-dessus) : une famille sans photo sous la main ne doit pas être
  // bloquée, le staff peut la récupérer plus tard sur la fiche étudiant.
  const photo = formData.get("photo");

  // Validation du contenu réel du fichier (magic bytes), jamais de
  // l'extension ou du `type` déclaré par le navigateur — whitelist stricte
  // PDF/JPEG/PNG (voir lib/fichiers-uploades.ts). Faite avant toute écriture
  // en base : un fichier invalide ne doit jamais laisser un étudiant
  // préinscrit orphelin d'un document attendu, ni un fichier orphelin sur
  // DOCUMENTS_DIR.
  let contenuPhoto: Buffer | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > TAILLE_MAX_FICHIER_OCTETS) {
      return { erreur: `La photo dépasse la taille maximale autorisée (${TAILLE_MAX_FICHIER_MO} Mo).` };
    }
    contenuPhoto = Buffer.from(await photo.arrayBuffer());
    if (!detecterTypeMimeReel(contenuPhoto)) {
      return { erreur: "Le fichier de la photo doit être une image (JPEG, PNG) ou un PDF valide." };
    }
  }

  const sectionIdsChoisies = [...new Set(lignes.map((l) => l.sectionId))];
  const sectionsChoisies = await prisma.section.findMany({
    where: { id: { in: sectionIdsChoisies } },
  });
  if (sectionsChoisies.length !== sectionIdsChoisies.length) {
    return { erreur: "Section invalide." };
  }
  const sectionParId = new Map(sectionsChoisies.map((s) => [s.id, s]));

  // Niveau obligatoire dès que la section choisie porte un catalogue (voir
  // Section.catalogueNiveaux) — pour CHAQUE ligne, pas seulement la première
  // (une famille inscrivant le même enfant à Coran ET Islamiques doit
  // préciser un niveau pour les deux). Valeur revérifiée contre le catalogue
  // réel de la section (jamais fait confiance à la seule présence du champ,
  // un client altéré pourrait envoyer n'importe quelle chaîne).
  for (const ligne of lignes) {
    const section = sectionParId.get(ligne.sectionId)!;
    const optionsNiveau = NIVEAUX_PAR_CATALOGUE[section.catalogueNiveaux];
    if (optionsNiveau.length > 0 && (!ligne.niveau || !optionsNiveau.includes(ligne.niveau))) {
      return { erreur: `Le niveau est obligatoire pour la section « ${section.nom} ».` };
    }
  }

  // Mêmes règles d'affichage que côté client (voir preinscription-form.tsx) :
  // pour une inscription "Jeunes", ce sont les coordonnées du responsable
  // légal qui sont saisies, pas celles de l'enfant — ces champs ne sont donc
  // pas rendus dans le formulaire et ne peuvent pas être exigés ici.
  const contactUrgenceNom = champTexte(formData, "contactUrgenceNom");
  const contactUrgencePrenom = champTexte(formData, "contactUrgencePrenom");
  const contactUrgenceTelephone = champTexte(formData, "contactUrgenceTelephone");
  if (!contactUrgenceNom || !contactUrgencePrenom || !contactUrgenceTelephone) {
    return {
      erreur: "Le nom, le prénom et le téléphone du contact d'urgence sont obligatoires.",
    };
  }
  if (!estTelephoneValide(contactUrgenceTelephone)) {
    return { erreur: "Le téléphone du contact d'urgence n'a pas un format valide (ex. 06 12 34 56 78)." };
  }

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

  // Le responsable légal n'est requis que pour la section "Jeunes" (voir
  // preinscription-form.tsx#BlocResponsable, index 1 obligatoire) — le
  // second reste facultatif (ex. père et mère tous deux au dossier). Un
  // étudiant Adultes s'inscrit toujours comme un adulte, quel que soit son
  // âge réel : aucun responsable légal n'est jamais exigé pour cette section
  // (décision association du 2026-09-16, remplace l'ancien déclenchement par
  // minorité).
  const responsableRequis = estJeunes;
  const responsable1 = responsableDepuisFormulaire(formData, 1);
  const responsable2 = responsableDepuisFormulaire(formData, 2);
  if (responsableRequis && (!responsable1 || !responsable1.telephone || !responsable1.email)) {
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
    niveau: string | null;
    creneau: { id: string; code: string; jour: string; horaire: string } | null;
  }[] = lignes.map((ligne) => {
    const section = sectionParId.get(ligne.sectionId)!;
    const creneauSouhaite = ligne.creneauSouhaiteId
      ? creneauSouhaiteParId.get(ligne.creneauSouhaiteId)
      : undefined;
    return {
      id: section.id,
      nom: section.nom,
      niveau: ligne.niveau,
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

  const responsablesACreer = [responsable1, responsable2].filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );

  // Deux axes de correspondance passés ici, indépendants l'un de l'autre
  // (voir lib/doublons-etudiant.ts) : nom+prénom+date de naissance (branche
  // NOM_DATE, comportement inchangé) et e-mail/téléphone — coordonnées
  // propres de l'étudiant (dossier Adultes) ET du/des responsable(s)
  // (dossier Jeunes), les deux jamais vérifiées ensemble jusqu'ici.
  const doublon = await trouverDoublonEtudiant({
    nom,
    prenom,
    dateNaissance,
    emails: [champTexte(formData, "email"), responsable1?.email, responsable2?.email],
    telephones: [
      champTexte(formData, "telephoneMobile"),
      champTexte(formData, "telephoneFixe"),
      responsable1?.telephone,
      responsable1?.telephoneProfessionnel,
      responsable2?.telephone,
      responsable2?.telephoneProfessionnel,
    ],
  });

  const remarqueSectionsSupplementaires =
    sectionsSouhaitees.length > 1
      ? `Autre(s) section(s) souhaitée(s) à la préinscription : ${sectionsSouhaitees
          .slice(1)
          .map((s) => {
            const details = [
              s.niveau ? `niveau : ${s.niveau}` : null,
              s.creneau ? `créneau souhaité : ${s.creneau.code} — ${s.creneau.jour}, ${s.creneau.horaire}` : null,
            ].filter((d): d is string => !!d);
            return details.length > 0 ? `${s.nom} (${details.join(", ")})` : s.nom;
          })
          .join(", ")}.`
      : null;

  // Signalement non bloquant (voir CLAUDE.md — jamais de refus automatique
  // d'une préinscription) : seul le critère NOM_DATE était jusqu'ici
  // « auto-explicatif » pour le staff via la popup de comparaison
  // (doublon-popup.tsx, qui affiche déjà les deux fiches côte à côte). Un
  // rapprochement par e-mail/téléphone seul est moins évident à deviner en
  // comparant les fiches — noté ici en clair, dans `remarque` (champ déjà
  // affiché sur /inscriptions et sur la fiche étudiant, aucune nouvelle
  // colonne nécessaire) plutôt que silencieusement laissé à découvrir.
  const remarqueDoublon =
    doublon && doublon.critere !== "NOM_DATE"
      ? `Doublon potentiel détecté (${LIBELLE_CRITERE_DOUBLON[doublon.critere]}).`
      : null;
  const remarqueFinale =
    [remarqueSectionsSupplementaires, remarqueDoublon].filter(Boolean).join(" ") || null;

  // Code d'accès à usage unique (voir preinscription/page.tsx et
  // lib/preinscription-code.ts) : absent pour un accès direct par URL (sans
  // code), présent pour un lien email de campagne ou un code accueil obtenu
  // via /accueil-preinscription — dans ces deux cas, consommé ici de façon
  // atomique, juste avant de créer l'étudiant, pour qu'aucune autre
  // soumission ne puisse réutiliser le même code (y compris en cas de double
  // clic/soumission concurrente, ou d'une autre famille ayant scanné le même
  // QR accueil avant que ce formulaire ne soit soumis).
  const codeBrut = champTexte(formData, "code");
  if (codeBrut) {
    const consomme = await tenterConsommerCode(codeBrut);
    if (!consomme) {
      // Message dédié pour un code accueil déjà pris de vitesse par une
      // autre famille (ou expiré d'inactivité) : rescanner suffit, voir
      // MESSAGE_CODE_ACCUEIL_EXPIRE.
      const message = (await estCodeAccueilAuto(codeBrut)) ? MESSAGE_CODE_ACCUEIL_EXPIRE : MESSAGE_CODE_INVALIDE;
      return { erreur: message };
    }
  }

  const etudiant = await prisma.etudiant.create({
    data: {
      civilite,
      nom,
      prenom,
      dateNaissance,
      dateInscription: new Date(),
      villeNaissance,
      sexe: champSexe(formData, "sexe"),
      niveauScolaire: champTexte(formData, "niveauScolaire"),
      telephoneMobile: champTexte(formData, "telephoneMobile"),
      telephoneFixe: champTexte(formData, "telephoneFixe"),
      email: champTexte(formData, "email"),
      contactUrgenceNom,
      contactUrgencePrenom,
      contactUrgenceTelephone,
      adresse: champTexte(formData, "adresse"),
      complementAdresse: champTexte(formData, "complementAdresse"),
      codePostal: champTexte(formData, "codePostal"),
      ville: champTexte(formData, "ville"),
      profession: champTexte(formData, "profession"),
      niveauEtudes: champTexte(formData, "niveauEtudes"),
      dernierDiplome: champTexte(formData, "dernierDiplome"),
      remarque: remarqueFinale,
      // Niveau coché pour la section principale (première ligne — voir
      // Etudiant.niveauDeclare et sectionSouhaiteeId ci-dessous, même
      // logique de "seule la première ligne est portée structurellement").
      // Jamais utilisé pour une affectation automatique de cohorte/classe :
      // affiché tel quel sur le dossier généré et sur la fiche étudiant pour
      // aider le staff à choisir la bonne cohorte.
      niveauDeclare: sectionsSouhaitees[0]?.niveau ?? null,
      autorisationPhotoVideo,
      statutInscription: "PREINSCRIT",
      sectionSouhaiteeId: sectionsSouhaitees[0]?.id ?? null,
      creneauSouhaiteId: sectionsSouhaitees[0]?.creneau?.id ?? null,
      doublonPotentielId: doublon?.id,
      responsables: responsablesACreer.length > 0 ? { create: responsablesACreer } : undefined,
      // Écriture imbriquée : la notification staff (voir
      // lib/notifications-preinscription.ts) est créée dans la MÊME requête
      // que l'étudiant, jamais par un job séparé qui « découvrirait » après
      // coup les nouvelles préinscriptions — Postgres reste la seule source
      // de vérité. Destinataires jamais stockés ici : déterminés
      // dynamiquement à la lecture via la grille de permissions (voir
      // (app)/layout.tsx). État de lecture individuel par utilisateur, posé
      // uniquement au clic (voir LecturePreinscription) — rien à créer ici.
      notificationsPreinscription: { create: {} },
    },
  });

  // Cache serveur de /inscriptions invalidé tout de suite après la mutation
  // (même idiome que (app)/inscriptions/actions.ts) : la page étant déjà
  // rendue dynamiquement (requireModule y lit la session), ceci n'est pas
  // strictement nécessaire à la fraîcheur des données, mais reste l'idiome
  // Next.js correct après une mutation touchant cette route. La mise à jour
  // d'un onglet /inscriptions déjà ouvert, elle, vient du polling léger
  // (router.refresh(), voir components/topbar.tsx) — revalidatePath seul ne
  // pousse rien vers un onglet déjà ouvert.
  revalidatePath("/inscriptions");

  // Ouverture best-effort du DossierAnnuel AVANT l'écriture des fichiers
  // ci-dessous (réordonnancement délibéré, voir lib/documents-nommage.ts —
  // BUCKET_SANS_ANNEE) : range directement la photo sous la bonne année
  // physique dans le cas nominal, plutôt que de la faire transiter par
  // _A_CLASSER puis dépendre d'une réconciliation ultérieure.
  // Seul le critère NOM_DATE (même nom, prénom ET date de naissance, voir
  // doublons-etudiant.ts) désigne un probable VRAI doublon (double soumission
  // de la même personne) : dans ce seul cas, on attend que le staff tranche
  // (fusion ou confirmation d'homonymie, voir
  // etudiants/[id]/actions.ts#fusionnerDoublonAction/confirmerHomonymeAction)
  // avant de créer un DossierAnnuel, pour ne pas ouvrir un second dossier de
  // paiement pour ce qui pourrait n'être qu'une seule et même personne — ce
  // que fusionnerDoublonAction refuse ensuite explicitement de fusionner s'il
  // en existe déjà un. Un doublon EMAIL/TELEPHONE/EMAIL_ET_TELEPHONE seul
  // (ex. une fratrie inscrite avec les coordonnées du même responsable) n'est
  // PAS un vrai doublon (voir doublons-etudiant.ts#trouverCorrespondancesContact,
  // "AUCUN blocage") : ce cas doit obtenir son propre dossier tout de suite,
  // exactement comme un étudiant sans aucun signalement. Requiert qu'une
  // année scolaire active existe (source du DossierAnnuel, jamais demandée à
  // la famille — voir src/lib/dossier/context.ts). Best-effort et hors du
  // chemin critique : une erreur ici (Chromium indisponible, etc.) ne doit
  // jamais faire échouer la préinscription elle-même, exactement comme la
  // génération best-effort déjà existante à la validation finale (voir
  // etudiants/[id]/actions.ts#validerInscriptionAction) — le staff peut
  // toujours déclencher/relancer ce parcours à la main depuis la fiche.
  let dossierAnnuelId: string | null = null;
  let anneeLibelle: string | null = null;
  let sectionPrincipaleId: string | null = null;
  if (!doublon || doublon.critere !== "NOM_DATE") {
    try {
      const sectionPrincipale = sectionsSouhaitees[0];
      const anneeActive = await prisma.anneeScolaire.findFirst({ where: { active: true } });
      if (sectionPrincipale && anneeActive) {
        const section = sectionParId.get(sectionPrincipale.id)!;
        const montantDu = Number.parseFloat(section.fraisFormation.toString()) + Number.parseFloat(section.fraisDossier.toString());

        const dossierAnnuel = await prisma.dossierAnnuel.create({
          data: { etudiantId: etudiant.id, anneeScolaireId: anneeActive.id, montantDu },
        });
        dossierAnnuelId = dossierAnnuel.id;
        anneeLibelle = anneeActive.libelle;
        sectionPrincipaleId = sectionPrincipale.id;
      }
    } catch (erreur) {
      console.error("Ouverture automatique du dossier annuel à la préinscription :", erreur);
    }
  }
  const contexteEtudiant = { matricule: etudiant.matricule, nom, prenom, anneeLibelle };

  // Écriture du fichier hors transaction (même pattern que
  // televerserDocumentAction, etudiants/[id]/actions.ts) : le fichier vit
  // sur DOCUMENTS_DIR, jamais en base, la ligne Document ne référence que le
  // chemin une fois le fichier réellement écrit. mimeType est toujours le
  // type détecté à partir du contenu réel (validé plus haut), jamais celui
  // déclaré par le navigateur — voir lib/fichiers-uploades.ts. `anneeLibelle`
  // reste null (donc BUCKET_SANS_ANNEE) seulement dans le cas exceptionnel
  // ci-dessus (doublon NOM_DATE, aucune année active, échec best-effort).
  if (contenuPhoto && photo instanceof File) {
    const typeMimeReel = detecterTypeMimeReel(contenuPhoto)!;
    const nomFichier = nomFichierDocument({
      type: "PHOTO",
      nom,
      prenom,
      extension: photo.name.split(".").pop() || "bin",
      suffixe: "",
    });
    const cheminRelatif = await enregistrerDocumentEtudiant(contexteEtudiant, nomFichier, contenuPhoto);
    await prisma.document.create({
      data: {
        etudiantId: etudiant.id,
        type: "PHOTO",
        nomFichier,
        cheminRelatif,
        mimeType: typeMimeReel,
        tailleOctets: contenuPhoto.length,
      },
    });
  }

  // Génération automatique du dossier PDF V1 (voir CLAUDE.md/analyse de
  // conversation — parcours préinscription → signature), maintenant que le
  // DossierAnnuel (ci-dessus) existe s'il a pu être ouvert — best-effort,
  // hors du chemin critique, ne doit jamais faire échouer la préinscription.
  if (dossierAnnuelId && sectionPrincipaleId) {
    try {
      await genererNouvelleVersionDossier({
        etudiantId: etudiant.id,
        sectionId: sectionPrincipaleId,
        dossierAnnuelId,
      });
      // Le lien sécurisé (AccesDossier) n'est PAS créé ici : le token brut
      // ne pouvant jamais être relu une fois généré (seul son hash est
      // stocké, même principe que Session/CodePreinscription), il doit
      // être créé au moment où il sert réellement — voir GET
      // /api/internal/n8n/dossiers-a-verifier, qui le génère à la lecture
      // pour construire le lien de l'email "dossier prêt à vérifier".
    } catch (erreur) {
      console.error("Génération automatique du dossier à la préinscription :", erreur);
    }
  }

  return { ok: true };
}
