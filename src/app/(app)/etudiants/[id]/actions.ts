"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Civilite, Sexe, StatutSignature, TypeDocument } from "@/generated/prisma/enums";
import {
  enregistrerDocumentEtudiant,
  supprimerFichierDocument,
  nettoyerDossierEtudiantSiVide,
  dossierDocumentaireComplet,
  statutDocumentsRequis,
  deplacerDocumentVersEtudiant,
  dossierPhysiqueEtudiant,
  estDansDossierEtudiant,
  formatSuffixeDesambiguisation,
  formatSuffixeVersion,
  nomFichierDocument,
  renommerCheminBrut,
  renommerDossierEtudiant,
  renommerNomFichier,
  renommerSegmentEtudiant,
  sanitiserSegmentChemin,
  suffixesDesambiguisation,
} from "@/lib/documents";
import { requireModule, Module } from "@/lib/permissions";
import { Role } from "@/lib/roles";
import { estEmailValide, estTelephoneValide, estCodePostalValide } from "@/lib/champs-formulaire";
import { redetecterDoublonApresModification } from "@/lib/doublons-etudiant";
import { construireContexteDossierEtudiant } from "@/lib/dossier/context";
import { rendreDossierHtml, rendreDossierPdf } from "@/lib/dossier/render";
import { affecterEtudiantACohorte, synchroniserInscriptionsClasse } from "@/lib/cohortes";

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

// Après résolution d'un doublon, revient sur la page où le staff a ouvert
// la popup (fiche étudiant ou liste centralisée /etudiants/doublons) plutôt
// que de toujours rouvrir la fiche — voir doublon-popup.tsx, qui pose ce
// champ caché quand il est monté depuis la liste.
function retourDoublon(formData: FormData, defaut: string): never {
  const cible = champTexte(formData, "redirectTo");
  redirect(`${cible && cible.startsWith("/") ? cible : defaut}?ok=1`);
}

export async function modifierEtudiantAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  if (!etudiantId) redirect("/etudiants");

  const civilite = champCivilite(formData, "civilite");
  const nom = champTexte(formData, "nom");
  const prenom = champTexte(formData, "prenom");
  const dateNaissanceBrute = champTexte(formData, "dateNaissance");
  const dateInscriptionBrute = champTexte(formData, "dateInscription");
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
    !dateInscriptionBrute ||
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
    retour(etudiantId, "PROFIL_CHAMPS_MANQUANTS");
  }
  if (!estTelephoneValide(telephoneMobile)) retour(etudiantId, "TELEPHONE_INVALIDE");
  if (!estEmailValide(email)) retour(etudiantId, "EMAIL_INVALIDE");
  if (!estCodePostalValide(codePostal)) retour(etudiantId, "CODE_POSTAL_INVALIDE");
  if (!estTelephoneValide(contactUrgenceTelephone)) retour(etudiantId, "TELEPHONE_INVALIDE");

  const telephoneFixe = champTexte(formData, "telephoneFixe");
  if (telephoneFixe && !estTelephoneValide(telephoneFixe)) retour(etudiantId, "TELEPHONE_INVALIDE");

  // Nécessaire au renommage best-effort du stockage physique ci-dessous
  // (voir lib/documents-nommage.ts) : matricule (jamais modifié, sert
  // d'ancre) + nom/prénom AVANT mise à jour, pour savoir si un renommage est
  // seulement nécessaire et calculer l'ancien préfixe de chaque fichier.
  const etudiantAvant = await prisma.etudiant.findUniqueOrThrow({
    where: { id: etudiantId },
    select: { matricule: true, nom: true, prenom: true },
  });

  await prisma.$transaction([
    prisma.etudiant.update({
      where: { id: etudiantId },
      data: {
        civilite,
        nom,
        prenom,
        dateNaissance: new Date(dateNaissanceBrute),
        dateInscription: new Date(dateInscriptionBrute),
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
  // Une correction de nom/prénom/date de naissance après coup (faute de
  // frappe qui masquait un vrai doublon à la création) peut faire apparaître
  // une correspondance qui n'existait pas encore au moment de la
  // préinscription — voir redetecterDoublonApresModification.
  await redetecterDoublonApresModification(etudiantId);

  // Renommage best-effort du stockage physique (voir lib/documents-nommage.ts) :
  // le matricule reste l'ancre stable, seul le segment "NOM Prénom" change,
  // pour TOUS les dossiers d'années où l'étudiant a des documents (pas
  // seulement l'année courante — sinon un même matricule apparaîtrait sous
  // plusieurs orthographes selon l'année consultée sur le NAS). Jamais
  // bloquant pour cette action : un échec est journalisé, le staff reste
  // averti que le rangement physique a pris du retard, à rattraper par le
  // mécanisme de réconciliation.
  if (nom !== etudiantAvant.nom || prenom !== etudiantAvant.prenom) {
    const documents = await prisma.document.findMany({
      where: { etudiantId, chequeId: null },
      select: { id: true, cheminRelatif: true, nomFichier: true },
    });
    const parDossier = new Map<string, typeof documents>();
    for (const document of documents) {
      const dossier = path.posix.dirname(document.cheminRelatif.replace(/^etudiants\//, ""));
      const groupe = parDossier.get(dossier) ?? [];
      groupe.push(document);
      parDossier.set(dossier, groupe);
    }

    for (const [ancienDossier, documentsDuDossier] of parDossier) {
      const nouveauDossier = renommerSegmentEtudiant(ancienDossier, {
        matricule: etudiantAvant.matricule,
        nom,
        prenom,
      });
      const succes = await renommerDossierEtudiant(ancienDossier, nouveauDossier);
      if (!succes) {
        await prisma.journalAudit.create({
          data: {
            utilisateurId: session.id,
            action: "renommage_dossier_echoue",
            entite: "Etudiant",
            entiteId: etudiantId,
            details: { ancienDossier, nouveauDossier },
          },
        });
        continue;
      }
      for (const document of documentsDuDossier) {
        const nouveauNomFichier = renommerNomFichier(
          document.nomFichier,
          { nom: etudiantAvant.nom, prenom: etudiantAvant.prenom },
          { nom, prenom },
        );
        const nouveauCheminRelatif = path.posix.join("etudiants", nouveauDossier, nouveauNomFichier);
        // Le renommage du DOSSIER ci-dessus ne renomme QUE le dossier : les
        // fichiers qu'il contient gardent leur ancien nom une fois déplacés
        // avec lui — il faut donc aussi renommer chaque fichier explicitement
        // (sous son nouveau nom, dans le dossier déjà renommé) avant de
        // mettre à jour cheminRelatif, sinon la base pointerait vers un
        // fichier qui n'existe pas physiquement.
        const succesFichier = await renommerCheminBrut(
          path.posix.join("etudiants", nouveauDossier, document.nomFichier),
          nouveauCheminRelatif,
        );
        if (!succesFichier) {
          await prisma.journalAudit.create({
            data: {
              utilisateurId: session.id,
              action: "renommage_fichier_echoue",
              entite: "Document",
              entiteId: document.id,
              details: { ancienNomFichier: document.nomFichier, nouveauNomFichier },
            },
          });
          continue;
        }
        await prisma.document.update({
          where: { id: document.id },
          data: { nomFichier: nouveauNomFichier, cheminRelatif: nouveauCheminRelatif },
        });
      }
    }
  }

  revalidatePath(`/etudiants/${etudiantId}`);
  revalidatePath("/etudiants");
  revalidatePath("/etudiants/doublons");
  retour(etudiantId);
}

export async function validerInscriptionAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  if (!etudiantId) redirect("/etudiants");

  const etudiant = await prisma.etudiant.findUnique({
    where: { id: etudiantId },
    include: {
      documents: true,
      _count: { select: { dossiersAnnuels: true } },
      // Le plus récent : sert à ranger le dossier généré ci-dessous sous la
      // bonne année physique (voir lib/documents-nommage.ts) — indépendant
      // de dossierPaiementOuvert ci-dessus, qui ne regarde que le compte.
      dossiersAnnuels: {
        orderBy: { creeLe: "desc" },
        take: 1,
        select: { id: true, anneeScolaire: { select: { libelle: true } } },
      },
    },
  });
  if (!etudiant) redirect("/etudiants");

  // Même règle que le bouton "Valider l'inscription" côté page (voir
  // etudiants/[id]/page.tsx) : dossier documentaire complet (dont le
  // dossier signé, voir TYPES_DOCUMENTS_REQUIS) ET un dossier de paiement
  // ouvert — vérifiée aussi ici pour ne pas dépendre uniquement du bouton
  // désactivé côté client.
  //
  // "Dossier de paiement ouvert" = un DossierAnnuel existe pour cet
  // étudiant (voir prisma/schema.prisma) : c'est exactement l'objet que le
  // staff crée depuis "Nouveau dossier de paiement" (paiements/nouveau/page.tsx),
  // montantDu y étant obligatoire dès la création — la configuration
  // financière minimale attendue est donc déjà posée par sa seule
  // existence. Un paiement réellement encaissé n'est jamais exigé ici (voir
  // lib/paiements.ts#statutCotisation pour le suivi de l'encaissement, un
  // sujet séparé de la validation administrative — voir bilan d'audit du
  // 07/09/2026, qui a corrigé cette règle : elle exigeait auparavant au
  // moins un paiement enregistré, ce qui n'était pas la règle voulue).
  const dossierPaiementOuvert = etudiant._count.dossiersAnnuels > 0;
  const dossierComplet = dossierDocumentaireComplet(etudiant.documents);
  const dossierIncomplet = !dossierComplet || !dossierPaiementOuvert;

  // Forçage : réservé au Bureau (requireRole en plus de la ECRITURE déjà
  // exigée ci-dessus par requireModule, jamais via le grid éditable — même
  // logique que les autres dérogations administratives, voir CLAUDE.md) et
  // soumis à une case de confirmation explicite côté formulaire (voir
  // page.tsx) : contourne sciemment un dossier documentaire ou un dossier de
  // paiement manquant (cas réel : dossier papier déjà signé physiquement,
  // pièce jointe encore en retard côté famille...), jamais un défaut
  // silencieux — la raison de chaque champ manquant est journalisée.
  const force = champTexte(formData, "force") === "1";
  if (dossierIncomplet) {
    if (!force) retour(etudiantId, "DOSSIER_INCOMPLET");
    if (session.role !== Role.BUREAU) retour(etudiantId, "FORCAGE_RESERVE_BUREAU");
  }

  const detailsManquants = dossierIncomplet
    ? {
        documentsManquants: Object.entries(statutDocumentsRequis(etudiant.documents))
          .filter(([, statut]) => statut !== "OK")
          .map(([type, statut]) => `${type}:${statut}`),
        dossierPaiementOuvert,
      }
    : undefined;

  await prisma.$transaction([
    prisma.etudiant.update({
      where: { id: etudiantId },
      data: { statutInscription: "VALIDE" },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: dossierIncomplet ? "validation_inscription_forcee" : "validation_inscription",
        entite: "Etudiant",
        entiteId: etudiantId,
        details: detailsManquants,
      },
    }),
  ]);

  // Règle "signature ≠ validation finale" : un étudiant devenu VALIDE peut
  // déjà avoir une Cohorte choisie (AFFECTE) dont le fan-out InscriptionClasse
  // avait été bloqué faute de validation (voir
  // lib/cohortes.ts#affecterEtudiantACohorte) — rattrapage symétrique ici,
  // idempotent, jamais bloquant pour la validation elle-même.
  await synchroniserInscriptionsClasse(etudiantId);

  // Génère et persiste tout de suite le dossier rempli pour la section
  // demandée à la préinscription (voir Etudiant.sectionSouhaiteeId), pour
  // qu'il soit déjà disponible en pièce jointe de l'email de bienvenue
  // (workflow n8n qui lit les Document DOSSIER_GENERE existants — jamais
  // l'inverse, l'app ne dépend d'aucun appel n8n, voir CLAUDE.md). Best
  // effort : une erreur de génération ne doit jamais faire échouer la
  // validation elle-même, le staff peut toujours la régénérer à la main
  // depuis la fiche étudiant.
  if (etudiant.sectionSouhaiteeId) {
    try {
      const dossierAnnuel = etudiant.dossiersAnnuels[0] ?? null;
      const [{ modeleDossier, contexte }, derniereVersion] = await Promise.all([
        construireContexteDossierEtudiant({
          etudiantId,
          sectionId: etudiant.sectionSouhaiteeId,
        }),
        prisma.document.findFirst({
          where: { dossierAnnuelId: dossierAnnuel?.id, type: "DOSSIER_GENERE" },
          orderBy: { numeroVersion: "desc" },
          select: { numeroVersion: true },
        }),
      ]);
      const html = await rendreDossierHtml(modeleDossier, contexte);
      const pdf = await rendreDossierPdf(html);
      const numeroVersion = (derniereVersion?.numeroVersion ?? 0) + 1;
      const nomFichier = nomFichierDocument({
        type: "DOSSIER_GENERE",
        nom: etudiant.nom,
        prenom: etudiant.prenom,
        extension: "pdf",
        suffixe: formatSuffixeVersion(numeroVersion),
      });
      const cheminRelatif = await enregistrerDocumentEtudiant(
        {
          matricule: etudiant.matricule,
          nom: etudiant.nom,
          prenom: etudiant.prenom,
          anneeLibelle: dossierAnnuel?.anneeScolaire.libelle ?? null,
        },
        nomFichier,
        pdf,
      );
      await prisma.document.create({
        data: {
          etudiantId,
          dossierAnnuelId: dossierAnnuel?.id,
          numeroVersion,
          type: "DOSSIER_GENERE",
          nomFichier,
          cheminRelatif,
          mimeType: "application/pdf",
          tailleOctets: pdf.length,
          creeParId: session.id,
        },
      });
    } catch (erreur) {
      console.error("Génération automatique du dossier à la validation :", erreur);
    }
  }

  revalidatePath(`/etudiants/${etudiantId}`);
  revalidatePath("/etudiants");
  retour(etudiantId);
}

// Affecte l'étudiant à une Cohorte plutôt qu'à une Classe précise : un même
// geste "Inscrire" depuis la fiche étudiant couvre tout le bloc de cours
// (un étudiant suit en pratique tous les cours de sa cohorte). Passe par
// lib/cohortes.ts pour respecter la même capacité/liste d'attente que
// l'affectation faite depuis la création du dossier de paiement — aucun des
// deux chemins ne doit pouvoir la contourner.
export async function affecterCohorteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ETUDIANTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  const cohorteId = champTexte(formData, "cohorteId");
  const anneeScolaireId = champTexte(formData, "anneeScolaireId");
  if (!etudiantId) redirect("/etudiants");
  if (!cohorteId || !anneeScolaireId) retour(etudiantId, "AFFECTATION_INVALIDE");

  const resultat = await affecterEtudiantACohorte({
    etudiantId,
    cohorteId,
    anneeScolaireId,
    utilisateurId: session.id,
  });

  if (resultat.statut === "COHORTE_INTROUVABLE") retour(etudiantId, "AFFECTATION_INVALIDE");

  // Le souhait de section/créneau exprimé à la préinscription est satisfait
  // dès qu'une affectation existe, même en liste d'attente (voir la même
  // règle dans presences/actions.ts#inscrireEtudiantAction).
  await prisma.etudiant.update({
    where: { id: etudiantId },
    data: { sectionSouhaiteeId: null, creneauSouhaiteId: null },
  });

  revalidatePath(`/etudiants/${etudiantId}`);
  redirect(
    resultat.statut === "EN_ATTENTE"
      ? `/etudiants/${etudiantId}?ok=1&cohorteEnAttente=1`
      : `/etudiants/${etudiantId}?ok=1`,
  );
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
    include: {
      responsables: true,
      inscriptions: true,
      documents: true,
      // Le plus récent : détermine où (quelle année) les documents reparentés
      // du doublon atterrissent chez existant — voir lib/documents-nommage.ts.
      dossiersAnnuels: {
        orderBy: { creeLe: "desc" },
        take: 1,
        select: { anneeScolaire: { select: { libelle: true } } },
      },
    },
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

  // Le doublon n'a par construction AUCUN DossierAnnuel (garde-fou
  // DOUBLON_NON_FUSIONNABLE ci-dessus) : ses documents (le cas échéant) sont
  // donc toujours de type non versionné (jamais DOSSIER_GENERE/DOSSIER_SIGNE,
  // qui exigent un dossierAnnuelId), toujours sous _A_CLASSER.
  //
  // Réconciliation physique du stockage (voir lib/documents-nommage.ts),
  // ENTIÈREMENT avant toute écriture en base : le matricule de `existant`
  // ne change jamais (absent du payload de mise à jour ci-dessous), celui du
  // doublon ne sera jamais réutilisé (ligne supprimée en base, séquence
  // jamais réinitialisée). Un échec de déplacement annule toute la fusion —
  // rien n'est écrit en base, rien n'est à moitié fusionné.
  const nouveauNom = doublon.nom;
  const nouveauPrenom = doublon.prenom;
  const anneeLibelleCible = existant.dossiersAnnuels[0]?.anneeScolaire.libelle ?? null;
  const contexteExistantActuel = {
    matricule: existant.matricule,
    nom: existant.nom,
    prenom: existant.prenom,
    anneeLibelle: anneeLibelleCible,
  };
  const dossierExistantActuel = dossierPhysiqueEtudiant(contexteExistantActuel);

  type MiseAJourDocument = { id: string; cheminRelatif: string; nomFichier: string };
  const misesAJourDocuments: MiseAJourDocument[] = [];

  // Filet de rattrapage : chaque déplacement physique réussi (fichier ou
  // dossier — chemins déjà complets, relatifs à DOCUMENTS_DIR, voir
  // renommerCheminBrut) est mémorisé ici (ancien <- nouveau) pour pouvoir
  // tout remettre en place si une étape ULTÉRIEURE échoue — la fusion doit
  // rester tout-ou-rien, jamais un mélange d'un document déjà déplacé sur le
  // disque mais dont la base pointe toujours vers l'ancien emplacement.
  // L'ordre LIFO (dernier déplacement réussi défait en premier) reste
  // correct même quand une opération suivante déplace de nouveau un chemin
  // déjà déplacé (ex. étape 2 : renommage du dossier, PUIS renommage de
  // chaque fichier qu'il contient sous son nouveau nom) : chaque entrée
  // n'est jamais utilisée qu'une fois, dans l'ordre inverse exact de sa
  // création, donc chaque "nouveau" enregistré correspond toujours à l'état
  // réel du disque au moment où le rollback l'atteint.
  const deplacementsEffectues: { ancien: string; nouveau: string }[] = [];
  async function annulerEtAbandonner(idPourRetour: string): Promise<never> {
    for (const d of [...deplacementsEffectues].reverse()) {
      await renommerCheminBrut(d.nouveau, d.ancien);
    }
    retour(idPourRetour, "FUSION_DEPLACEMENT_ECHOUE");
  }

  // 1) Déplace chaque document reparenté vers le dossier ACTUEL de
  // `existant` (avant tout renommage éventuel, voir étape 2), sous son nom
  // final — désambiguïsation scopée à ce dossier précis, en tenant compte à
  // la fois des documents déjà présents chez `existant` ET des autres
  // documents reparentés du même type arrivant en même temps.
  const documentsExistantParType = new Map<string, typeof existant.documents>();
  for (const d of existant.documents) {
    const groupe = documentsExistantParType.get(d.type) ?? [];
    groupe.push(d);
    documentsExistantParType.set(d.type, groupe);
  }
  const documentsAReparenterParType = new Map<string, typeof documentsAReparenter>();
  for (const d of documentsAReparenter) {
    const groupe = documentsAReparenterParType.get(d.type) ?? [];
    groupe.push(d);
    documentsAReparenterParType.set(d.type, groupe);
  }
  for (const [type, docsDeCeType] of documentsAReparenterParType) {
    const siblingsExistant = (documentsExistantParType.get(type) ?? []).filter((d) =>
      estDansDossierEtudiant(d.cheminRelatif, dossierExistantActuel),
    );
    const suffixes = suffixesDesambiguisation([
      ...siblingsExistant.map((d) => ({ id: d.id, creeLe: d.creeLe })),
      ...docsDeCeType.map((d) => ({ id: d.id, creeLe: d.creeLe })),
    ]);
    for (const document of docsDeCeType) {
      const extension = document.nomFichier.split(".").pop() || "bin";
      const nomFichierCible = nomFichierDocument({
        type: type as TypeDocument,
        nom: existant.nom,
        prenom: existant.prenom,
        extension,
        suffixe: suffixes[document.id] ?? "",
      });
      const nouveauChemin = await deplacerDocumentVersEtudiant(
        document.cheminRelatif,
        contexteExistantActuel,
        nomFichierCible,
      );
      if (!nouveauChemin) {
        await annulerEtAbandonner(etudiantId);
        return;
      }
      deplacementsEffectues.push({ ancien: document.cheminRelatif, nouveau: nouveauChemin });
      misesAJourDocuments.push({ id: document.id, cheminRelatif: nouveauChemin, nomFichier: nomFichierCible });
    }
  }

  // 2) `existant` peut lui-même changer de nom/prénom (la fusion privilégie
  // doublon.nom/prenom ci-dessous) : si c'est le cas, un seul renommage du
  // dossier ACTUEL de `existant` (qui contient déjà, depuis l'étape 1, les
  // documents fraîchement reparentés) déplace tout son contenu d'un coup.
  if (existant.nom !== nouveauNom || existant.prenom !== nouveauPrenom) {
    const nouveauDossier = renommerSegmentEtudiant(dossierExistantActuel, {
      matricule: existant.matricule,
      nom: nouveauNom,
      prenom: nouveauPrenom,
    });
    const succes = await renommerDossierEtudiant(dossierExistantActuel, nouveauDossier);
    if (!succes) {
      await annulerEtAbandonner(etudiantId);
      return;
    }
    deplacementsEffectues.push({
      ancien: path.posix.join("etudiants", dossierExistantActuel),
      nouveau: path.posix.join("etudiants", nouveauDossier),
    });

    // Le renommage du DOSSIER ci-dessus ne renomme QUE le dossier : chaque
    // fichier qu'il contient (ceux de `existant` comme ceux tout juste
    // reparentés à l'étape 1) garde son ancien nom une fois déplacé avec
    // lui — il faut donc aussi renommer chaque fichier individuellement,
    // dans le dossier déjà renommé, avant de pouvoir mettre à jour
    // cheminRelatif en base (voir même correction dans modifierEtudiantAction).
    for (const maj of misesAJourDocuments) {
      const ancienNomFichier = maj.nomFichier;
      const nouveauNomFichier = renommerNomFichier(
        ancienNomFichier,
        { nom: existant.nom, prenom: existant.prenom },
        { nom: nouveauNom, prenom: nouveauPrenom },
      );
      const nouveauCheminRelatif = path.posix.join("etudiants", nouveauDossier, nouveauNomFichier);
      const succesFichier = await renommerCheminBrut(
        path.posix.join("etudiants", nouveauDossier, ancienNomFichier),
        nouveauCheminRelatif,
      );
      if (!succesFichier) {
        await annulerEtAbandonner(etudiantId);
        return;
      }
      deplacementsEffectues.push({
        ancien: path.posix.join("etudiants", nouveauDossier, ancienNomFichier),
        nouveau: nouveauCheminRelatif,
      });
      maj.nomFichier = nouveauNomFichier;
      maj.cheminRelatif = nouveauCheminRelatif;
    }
    for (const document of existant.documents.filter((d) =>
      estDansDossierEtudiant(d.cheminRelatif, dossierExistantActuel),
    )) {
      const nouveauNomFichier = renommerNomFichier(
        document.nomFichier,
        { nom: existant.nom, prenom: existant.prenom },
        { nom: nouveauNom, prenom: nouveauPrenom },
      );
      const nouveauCheminRelatif = path.posix.join("etudiants", nouveauDossier, nouveauNomFichier);
      const succesFichier = await renommerCheminBrut(
        path.posix.join("etudiants", nouveauDossier, document.nomFichier),
        nouveauCheminRelatif,
      );
      if (!succesFichier) {
        await annulerEtAbandonner(etudiantId);
        return;
      }
      deplacementsEffectues.push({
        ancien: path.posix.join("etudiants", nouveauDossier, document.nomFichier),
        nouveau: nouveauCheminRelatif,
      });
      misesAJourDocuments.push({
        id: document.id,
        nomFichier: nouveauNomFichier,
        cheminRelatif: nouveauCheminRelatif,
      });
    }
  }

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
    ...misesAJourDocuments.map((maj) =>
      prisma.document.update({
        where: { id: maj.id },
        data: {
          ...(documentsAReparenter.some((d) => d.id === maj.id) ? { etudiantId: existantId } : {}),
          cheminRelatif: maj.cheminRelatif,
          nomFichier: maj.nomFichier,
        },
      }),
    ),
    ...(documentsASupprimer.length > 0
      ? [prisma.document.deleteMany({ where: { id: { in: documentsASupprimer.map((d) => d.id) } } })]
      : []),
    // Rattache les notifications de préinscription du doublon supprimé à la
    // fiche conservée, AVANT la suppression ci-dessous — sans ça,
    // `NotificationPreinscription.etudiantId` (onDelete: Cascade, voir
    // prisma/schema.prisma) supprimerait silencieusement leur historique en
    // même temps que la fiche, alors qu'il ne doit jamais être perdu (voir
    // lib/notifications-preinscription.ts). Même logique que les
    // reparentages ci-dessus (inscriptions, responsables, documents) :
    // aucune donnée propre au doublon ne doit disparaître à la fusion,
    // seule la fiche elle-même (redondante) l'est.
    prisma.notificationPreinscription.updateMany({
      where: { etudiantId },
      data: { etudiantId: existantId },
    }),
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
  revalidatePath("/etudiants/doublons");
  revalidatePath("/inscriptions");
  retourDoublon(formData, `/etudiants/${existantId}`);
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
  revalidatePath("/etudiants/doublons");
  revalidatePath("/inscriptions");
  retourDoublon(formData, `/etudiants/${etudiantId}`);
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
  // DOSSIER_GENERE est réservé au PDF produit par le moteur de dossier
  // (voir etudiants/[id]/dossier/route.ts et validerInscriptionAction
  // ci-dessus) : l'exclure de la liste affichée côté client (page.tsx) ne
  // suffit pas, formulaire ou pas, l'action serveur doit refuser ce type
  // pour tout fichier arbitraire téléversé à la main.
  if (type === "DOSSIER_GENERE") {
    retour(etudiantId, "TYPE_RESERVE");
  }

  // Contexte de nommage (voir lib/documents-nommage.ts) : l'année retenue
  // pour le rangement physique est celle du DossierAnnuel le plus récent de
  // l'étudiant, s'il en a un — sinon _A_CLASSER (voir BUCKET_SANS_ANNEE),
  // jamais bloquant pour le téléversement lui-même.
  const etudiant = await prisma.etudiant.findUniqueOrThrow({
    where: { id: etudiantId },
    include: {
      dossiersAnnuels: {
        orderBy: { creeLe: "desc" },
        take: 1,
        select: { anneeScolaire: { select: { libelle: true } } },
      },
    },
  });
  const contexteEtudiant = {
    matricule: etudiant.matricule,
    nom: etudiant.nom,
    prenom: etudiant.prenom,
    anneeLibelle: etudiant.dossiersAnnuels[0]?.anneeScolaire.libelle ?? null,
  };
  const dossierCible = dossierPhysiqueEtudiant(contexteEtudiant);

  // Désambiguïsation scopée au dossier physique CIBLE (pas à tout
  // l'historique de l'étudiant) : deux documents du même type dans deux
  // années différentes ne se côtoient jamais sur le NAS, donc ne peuvent pas
  // entrer en collision de nom — voir estDansDossierEtudiant.
  const documentsDuMemeType = (
    await prisma.document.findMany({
      where: { etudiantId, type, chequeId: null },
      select: { id: true, creeLe: true, cheminRelatif: true },
    })
  ).filter((d) => estDansDossierEtudiant(d.cheminRelatif, dossierCible));

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const maintenant = new Date();
  // DOSSIER_SIGNE (déposé à la main, ex. signature papier) suit la même
  // désambiguïsation par version que DOSSIER_GENERE (voir
  // lib/dossier/generation.ts) ; tous les autres types, par date — voir
  // formatSuffixeDesambiguisation, calculé sur le groupe EXISTANT + ce
  // nouveau document (id temporaire "nouveau", jamais persistée).
  const suffixe =
    type === "DOSSIER_SIGNE"
      ? formatSuffixeVersion(documentsDuMemeType.length + 1)
      : formatSuffixeDesambiguisation("nouveau", [
          ...documentsDuMemeType,
          { id: "nouveau", creeLe: maintenant },
        ]);
  const nomOriginalNettoye = sanitiserSegmentChemin(
    fichier.name.replace(/\.[^.]+$/, ""),
  );
  const nomFichier = nomFichierDocument({
    type,
    nom: etudiant.nom,
    prenom: etudiant.prenom,
    extension: fichier.name.split(".").pop() || "bin",
    suffixe,
    nomOriginalNettoye,
  });
  const cheminRelatif = await enregistrerDocumentEtudiant(contexteEtudiant, nomFichier, contenu);

  const cree = await prisma.document.create({
    data: {
      etudiantId,
      type,
      numeroVersion: type === "DOSSIER_SIGNE" ? documentsDuMemeType.length + 1 : null,
      nomFichier,
      cheminRelatif,
      mimeType: fichier.type || "application/octet-stream",
      tailleOctets: contenu.length,
      creeParId: session.id,
      creeLe: maintenant,
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

// Redéclenche l'email "dossier à vérifier" envoyé à la famille (voir
// GET /api/internal/n8n/dossiers-a-verifier) sans passer par une
// intervention en base : remet simplement les compteurs d'idempotence à
// zéro, n8n renvoie l'email au prochain polling avec l'adresse
// actuellement enregistrée sur la fiche (responsable légal ou étudiant).
export async function renvoyerEmailVerificationAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.DOCUMENTS, "ECRITURE");

  const etudiantId = champTexte(formData, "etudiantId");
  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  if (!etudiantId) redirect("/etudiants");
  if (!dossierAnnuelId) retour(etudiantId, "CHAMPS_MANQUANTS");

  const dossier = await prisma.dossierAnnuel.findUnique({ where: { id: dossierAnnuelId } });
  if (!dossier || dossier.etudiantId !== etudiantId) retour(etudiantId, "INTROUVABLE");
  if (dossier.statutSignature !== StatutSignature.A_VERIFIER) {
    retour(etudiantId, "DOSSIER_STATUT_INVALIDE");
  }

  await prisma.$transaction([
    prisma.dossierAnnuel.update({
      where: { id: dossierAnnuelId },
      data: {
        notificationVerificationEnvoyeeLe: null,
        notificationVerificationErreurLe: null,
        notificationVerificationErreurMessage: null,
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "renvoi_email_verification",
        entite: "DossierAnnuel",
        entiteId: dossierAnnuelId,
        details: { etudiantId },
      },
    }),
  ]);

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
  await nettoyerDossierEtudiantSiVide(cible.cheminRelatif);

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
        // Un dossier annuel pas encore validé par la famille (ni signature
        // envoyée/faite, ni aucun paiement déjà enregistré dessus) ne doit
        // pas bloquer la suppression : c'est typiquement une préinscription
        // de test ou abandonnée, sans rien de réel à protéger. Seul un
        // dossier réellement engagé (signature en cours/faite, ou un
        // paiement déjà apporté) doit empêcher la suppression.
        dossiersAnnuels: {
          select: {
            statutSignature: true,
            echeances: { select: { _count: { select: { paiements: true } } } },
          },
        },
        // Une inscription peut être retirée (retirerEtudiantAction) sans
        // effacer les présences déjà enregistrées : il faut les compter à
        // part, sinon un étudiant retiré d'une classe après y avoir eu des
        // présences validées redeviendrait « supprimable ».
        _count: { select: { inscriptions: true, presences: true } },
      },
    });
    if (!cible) redirect("/etudiants");

    const dossierEngage = cible.dossiersAnnuels.some(
      (dossier) =>
        dossier.statutSignature === StatutSignature.ENVOYEE_SIGNATURE ||
        dossier.statutSignature === StatutSignature.SIGNEE ||
        dossier.echeances.some((echeance) => echeance._count.paiements > 0),
    );

    if (dossierEngage || cible._count.inscriptions > 0 || cible._count.presences > 0) {
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
  if (documentsASupprimer.length > 0) {
    await nettoyerDossierEtudiantSiVide(documentsASupprimer[0].cheminRelatif);
  }

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
