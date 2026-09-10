"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { affecterEtudiantACohorte } from "@/lib/cohortes";
import {
  BUCKET_SANS_ANNEE,
  dossierPhysiqueEtudiant,
  renommerDossierEtudiant,
} from "@/lib/documents";

export async function creerDossierAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const etudiantId = String(formData.get("etudiantId") ?? "").trim();
  const anneeScolaireId = String(formData.get("anneeScolaireId") ?? "").trim();
  const montantDu = String(formData.get("montantDu") ?? "").trim();
  // Optionnel : affectation immédiate à une Cohorte (voir
  // prisma/schema.prisma#AffectationCohorte). Le staff choisit la Cohorte à
  // la main — le "créneau souhaité" de préinscription (Section +
  // CreneauSection, catalogue générique) ne pointe vers aucune Cohorte
  // précise, impossible à déduire automatiquement.
  const cohorteId = String(formData.get("cohorteId") ?? "").trim() || null;

  if (!etudiantId || !anneeScolaireId || !montantDu) {
    redirect("/paiements/nouveau?error=CHAMPS_MANQUANTS");
  }

  const existant = await prisma.dossierAnnuel.findUnique({
    where: { etudiantId_anneeScolaireId: { etudiantId, anneeScolaireId } },
  });
  if (existant) {
    redirect(`/paiements/${existant.id}?error=DOSSIER_EXISTANT`);
  }

  // Le dossier reste la source de vérité comptable, créé seul (déjà
  // atomique) : un dossier sans affectation Cohorte est un état valide,
  // l'affectation ci-dessous est explicitement optionnelle et ne doit jamais
  // faire échouer la création du dossier. Journalisé (montantDu saisi) pour
  // pouvoir retrouver qui a validé quel montant en cas d'écart constaté plus
  // tard avec le tarif de section (voir modifierMontantDuAction, déjà
  // journalisée, pour les corrections ultérieures).
  const dossier = await prisma.$transaction(async (tx) => {
    const cree = await tx.dossierAnnuel.create({
      data: { etudiantId, anneeScolaireId, montantDu },
    });
    await tx.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "creation_dossier_annuel",
        entite: "DossierAnnuel",
        entiteId: cree.id,
        details: { etudiantId, anneeScolaireId, montantDu },
      },
    });
    return cree;
  });

  // Sortie de _A_CLASSER (voir lib/documents-nommage.ts) : cet étudiant
  // n'avait jusqu'ici aucun DossierAnnuel, ses éventuels documents déjà
  // téléversés (fiche créée à la main, ou récupération d'une préinscription
  // dont l'ouverture automatique avait échoué) vivaient donc dans ce bucket
  // exceptionnel — à reclasser dès qu'une année devient enfin connue, sans
  // attendre un passage par le mécanisme de réconciliation. Seul le SEGMENT
  // ANNÉE change ici (le nom du dossier étudiant et des fichiers qu'il
  // contient ne dépendent jamais de l'année) : un simple déplacement de
  // dossier suffit, best-effort, jamais bloquant pour la création du
  // dossier de paiement elle-même.
  const etudiantPourReconciliation = await prisma.etudiant.findUnique({
    where: { id: etudiantId },
    select: { matricule: true, nom: true, prenom: true },
  });
  if (etudiantPourReconciliation) {
    const anneeScolaire = await prisma.anneeScolaire.findUnique({ where: { id: anneeScolaireId } });
    const contexte = {
      matricule: etudiantPourReconciliation.matricule,
      nom: etudiantPourReconciliation.nom,
      prenom: etudiantPourReconciliation.prenom,
    };
    const ancienDossier = dossierPhysiqueEtudiant({ ...contexte, anneeLibelle: null });
    const nouveauDossier = dossierPhysiqueEtudiant({ ...contexte, anneeLibelle: anneeScolaire?.libelle ?? null });
    const succes = await renommerDossierEtudiant(ancienDossier, nouveauDossier);
    if (succes && ancienDossier !== nouveauDossier) {
      // Un simple UPDATE...SET avec remplacement de préfixe n'est pas
      // portable en Prisma (pas de fonction "replace" dans son DSL) : boucle
      // sur le petit nombre de documents concernés (volumétrie associative,
      // voir CLAUDE.md) plutôt qu'une requête SQL brute pour si peu.
      const documentsAClasser = await prisma.document.findMany({
        where: { etudiantId, cheminRelatif: { startsWith: `etudiants/${BUCKET_SANS_ANNEE}/` } },
        select: { id: true, cheminRelatif: true },
      });
      for (const document of documentsAClasser) {
        await prisma.document.update({
          where: { id: document.id },
          data: {
            cheminRelatif: document.cheminRelatif.replace(
              `etudiants/${ancienDossier}/`,
              `etudiants/${nouveauDossier}/`,
            ),
          },
        });
      }
    }
  }

  if (cohorteId) {
    const resultat = await affecterEtudiantACohorte({
      etudiantId,
      cohorteId,
      anneeScolaireId,
      utilisateurId: session.id,
    });
    if (resultat.statut === "COHORTE_INTROUVABLE") {
      redirect(`/paiements/${dossier.id}?error=COHORTE_INTROUVABLE`);
    }
  }

  redirect(`/paiements/${dossier.id}`);
}
