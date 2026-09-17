"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MoyenPaiement, StatutCheque, StatutPrelevement } from "@/generated/prisma/enums";
import { requireModule, Module } from "@/lib/permissions";
import {
  enregistrerDocumentEtudiant,
  nomFichierDocument,
  supprimerFichierDocument,
  nettoyerDossierEtudiantSiVide,
} from "@/lib/documents";
import { getOuCreerCategorieCotisations } from "@/lib/tresorerie";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

// Un montant financier ne peut être ni négatif ni nul (une échéance ou un
// paiement à 0€ n'a pas de sens métier et ne serait qu'une saisie erronée) —
// retourne la chaîne d'origine (jamais un Number rearrondi) pour que Prisma
// continue de la convertir lui-même en Decimal, comme avant.
function champMontantPositif(formData: FormData, nom: string): string | null {
  const valeur = champTexte(formData, nom);
  if (!valeur) return null;
  const nombre = Number(valeur);
  return Number.isFinite(nombre) && nombre > 0 ? valeur : null;
}

// Le montant dû d'un dossier peut légitimement être 0 (exonération totale
// décidée par le Bureau) — seule une valeur négative est une erreur de
// saisie, contrairement à une échéance ou un paiement (toujours > 0).
function champMontantNonNegatif(formData: FormData, nom: string): string | null {
  const valeur = champTexte(formData, nom);
  if (!valeur) return null;
  const nombre = Number(valeur);
  return Number.isFinite(nombre) && nombre >= 0 ? valeur : null;
}

// Transitions valides des statuts de chèque/prélèvement — un encaissement ou
// un rejet est définitif, et un chèque ne peut pas sauter une étape (ex.
// RECU -> ENCAISSE sans passage par DEPOSE). Rester sur le statut actuel
// (resoumission du même formulaire) est traité comme un no-op plus bas,
// jamais comme une transition à valider ici.
const TRANSITIONS_CHEQUE: Record<StatutCheque, StatutCheque[]> = {
  RECU: ["DEPOSE", "REJETE"],
  DEPOSE: ["ENCAISSE", "REJETE"],
  ENCAISSE: [],
  REJETE: [],
};

const TRANSITIONS_PRELEVEMENT: Record<StatutPrelevement, StatutPrelevement[]> = {
  EMIS: ["ENCAISSE", "REJETE"],
  ENCAISSE: [],
  REJETE: [],
};

function retour(dossierAnnuelId: string, erreur?: string): never {
  redirect(
    erreur ? `/paiements/${dossierAnnuelId}?error=${erreur}` : `/paiements/${dossierAnnuelId}?ok=1`,
  );
}

export async function ajouterEcheanceAction(formData: FormData): Promise<void> {
  await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const montantBrut = champTexte(formData, "montant");
  const dateEcheance = champTexte(formData, "dateEcheance");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!montantBrut || !dateEcheance) retour(dossierAnnuelId, "CHAMPS_MANQUANTS");
  const montant = champMontantPositif(formData, "montant");
  if (!montant) retour(dossierAnnuelId, "MONTANT_INVALIDE");

  await prisma.echeance.create({
    data: {
      dossierAnnuelId,
      montant,
      dateEcheance: new Date(dateEcheance),
      libelle: champTexte(formData, "libelle"),
    },
  });

  revalidatePath(`/paiements/${dossierAnnuelId}`);
  retour(dossierAnnuelId);
}

export async function enregistrerPaiementAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const echeanceId = champTexte(formData, "echeanceId");
  const montantBrut = champTexte(formData, "montant");
  const moyenBrut = champTexte(formData, "moyen");
  const datePaiementBrut = champTexte(formData, "datePaiement");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!echeanceId || !montantBrut || !moyenBrut || !(moyenBrut in MoyenPaiement) || !datePaiementBrut) {
    retour(dossierAnnuelId, "CHAMPS_INVALIDES");
  }
  const montant = champMontantPositif(formData, "montant");
  if (!montant) retour(dossierAnnuelId, "MONTANT_INVALIDE");
  const moyen = moyenBrut as MoyenPaiement;
  // Distincte de Echeance.dateEcheance (date prévue) : la date réelle à
  // laquelle le paiement a été effectué/reçu, saisie par l'utilisateur —
  // jamais implicitement "aujourd'hui" (voir Paiement.datePaiement, dont le
  // défaut Prisma @default(now()) ne s'applique que si ce champ est omis).
  const datePaiement = new Date(datePaiementBrut);
  if (Number.isNaN(datePaiement.getTime())) retour(dossierAnnuelId, "CHAMPS_INVALIDES");

  const echeance = await prisma.echeance.findUnique({
    where: { id: echeanceId },
    include: { dossierAnnuel: { include: { etudiant: true, anneeScolaire: true } } },
  });
  if (!echeance) retour(dossierAnnuelId, "ECHEANCE_INTROUVABLE");

  // Le titulaire par défaut est l'étudiant lui-même (voir
  // ChampsMoyenPaiement) : nom/prénom sont alors repris depuis le dossier
  // plutôt que depuis des champs cachés du formulaire, jamais fiables côté
  // client. Une pièce d'identité dédiée n'a de sens que pour un tiers payeur
  // (voir plus bas, ignorée silencieusement sinon).
  const titulaireEstEtudiant = moyen === "CHEQUE" ? formData.get("titulaireEstEtudiant") === "on" : true;
  const titulaireNom = titulaireEstEtudiant
    ? echeance.dossierAnnuel.etudiant.nom
    : champTexte(formData, "chequeTitulaireNom");
  const titulairePrenom = titulaireEstEtudiant
    ? echeance.dossierAnnuel.etudiant.prenom
    : champTexte(formData, "chequeTitulairePrenom");

  const paiement = await prisma.paiement.create({
    data: {
      echeanceId,
      montant,
      moyen,
      datePaiement,
      ...(moyen === "CHEQUE"
        ? {
            cheque: {
              create: {
                banque: champTexte(formData, "chequeBanque"),
                numero: champTexte(formData, "chequeNumero"),
                titulaireNom,
                titulairePrenom,
                titulaireEstEtudiant,
              },
            },
          }
        : {}),
      ...(moyen === "PRELEVEMENT"
        ? {
            prelevement: {
              create: {
                iban: champTexte(formData, "prelevementIban"),
                bic: champTexte(formData, "prelevementBic"),
                titulaire: champTexte(formData, "prelevementTitulaire"),
                referenceMandat: champTexte(formData, "prelevementReferenceMandat"),
              },
            },
          }
        : {}),
    },
    include: { cheque: true },
  });

  // Écriture du fichier hors transaction, une fois le chèque créé (besoin de
  // son id) — même pattern que televerserDocumentAction
  // (etudiants/[id]/actions.ts) : le fichier vit sur DOCUMENTS_DIR, jamais
  // en base.
  const pieceIdentiteTitulaire = formData.get("chequeTitulairePieceIdentite");
  if (
    paiement.cheque &&
    !titulaireEstEtudiant &&
    pieceIdentiteTitulaire instanceof File &&
    pieceIdentiteTitulaire.size > 0
  ) {
    const contenu = Buffer.from(await pieceIdentiteTitulaire.arrayBuffer());
    // Nommage distinct de la pièce d'identité de l'étudiant lui-même (voir
    // lib/documents-nommage.ts) : jamais confondue avec la sienne — le
    // dossierAnnuel de l'échéance payée donne directement l'année, jamais
    // ambigu ici (contrairement à d'autres types sans dossierAnnuelId).
    const nomFichier = nomFichierDocument({
      type: "PIECE_IDENTITE",
      nom: echeance.dossierAnnuel.etudiant.nom,
      prenom: echeance.dossierAnnuel.etudiant.prenom,
      extension: pieceIdentiteTitulaire.name.split(".").pop() || "bin",
      suffixe: "",
      titulaireChequeNom: titulaireNom ?? undefined,
      titulaireChequePrenom: titulairePrenom ?? undefined,
    });
    const cheminRelatif = await enregistrerDocumentEtudiant(
      {
        matricule: echeance.dossierAnnuel.etudiant.matricule,
        nom: echeance.dossierAnnuel.etudiant.nom,
        prenom: echeance.dossierAnnuel.etudiant.prenom,
        anneeLibelle: echeance.dossierAnnuel.anneeScolaire.libelle,
      },
      nomFichier,
      contenu,
    );
    await prisma.document.create({
      data: {
        etudiantId: echeance.dossierAnnuel.etudiantId,
        type: "PIECE_IDENTITE",
        chequeId: paiement.cheque.id,
        nomFichier,
        cheminRelatif,
        mimeType: pieceIdentiteTitulaire.type || "application/octet-stream",
        tailleOctets: contenu.length,
        creeParId: session.id,
      },
    });
  }

  const categorieCotisations = await getOuCreerCategorieCotisations();
  const libelleEcheance = echeance.libelle
    ? echeance.libelle
    : `échéance du ${echeance.dateEcheance.toLocaleDateString("fr-FR")}`;

  await prisma.$transaction([
    prisma.mouvementTresorerie.create({
      data: {
        date: paiement.datePaiement,
        libelle: `Paiement — ${echeance.dossierAnnuel.etudiant.prenom} ${echeance.dossierAnnuel.etudiant.nom} — ${libelleEcheance}`,
        type: "RECETTE",
        moyen: paiement.moyen,
        montant: paiement.montant,
        categorieId: categorieCotisations.id,
        paiementId: paiement.id,
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "saisie_paiement",
        entite: "Paiement",
        entiteId: paiement.id,
      },
    }),
  ]);

  revalidatePath(`/paiements/${echeance.dossierAnnuelId}`);
  revalidatePath("/paiements");
  revalidatePath("/tresorerie");
  retour(echeance.dossierAnnuelId);
}

export async function modifierEcheanceAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const echeanceId = champTexte(formData, "echeanceId");
  const montantBrut = champTexte(formData, "montant");
  const dateEcheance = champTexte(formData, "dateEcheance");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!echeanceId || !montantBrut || !dateEcheance) retour(dossierAnnuelId, "CHAMPS_MANQUANTS");
  const montant = champMontantPositif(formData, "montant");
  if (!montant) retour(dossierAnnuelId, "MONTANT_INVALIDE");

  const cible = await prisma.echeance.findUnique({ where: { id: echeanceId } });
  if (!cible) retour(dossierAnnuelId, "ECHEANCE_INTROUVABLE");

  await prisma.$transaction([
    prisma.echeance.update({
      where: { id: echeanceId },
      data: {
        montant,
        dateEcheance: new Date(dateEcheance),
        libelle: champTexte(formData, "libelle"),
      },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_echeance",
        entite: "Echeance",
        entiteId: echeanceId,
        details: { avant: cible.montant.toString(), apres: montant },
      },
    }),
  ]);

  // Le dossier réellement modifié est celui de l'échéance elle-même, pas la
  // valeur (potentiellement obsolète/manipulée) soumise par le formulaire.
  revalidatePath(`/paiements/${cible.dossierAnnuelId}`);
  retour(cible.dossierAnnuelId);
}

export async function supprimerEcheanceAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const echeanceId = champTexte(formData, "echeanceId");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!echeanceId) retour(dossierAnnuelId, "CHAMPS_MANQUANTS");

  const cible = await prisma.echeance.findUnique({
    where: { id: echeanceId },
    include: { _count: { select: { paiements: true } } },
  });
  if (!cible) retour(dossierAnnuelId, "ECHEANCE_INTROUVABLE");

  // Un paiement déjà encaissé sur cette échéance implique une écriture
  // financière déjà constituée : on refuse la suppression plutôt que de la
  // faire disparaître silencieusement (voir modifierPaiementAction pour
  // corriger un paiement, ou saisir un mouvement compensatoire).
  if (cible._count.paiements > 0) retour(cible.dossierAnnuelId, "ECHEANCE_UTILISEE");

  await prisma.$transaction([
    prisma.echeance.delete({ where: { id: echeanceId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_echeance",
        entite: "Echeance",
        entiteId: echeanceId,
        details: { montant: cible.montant.toString() },
      },
    }),
  ]);

  revalidatePath(`/paiements/${cible.dossierAnnuelId}`);
  retour(cible.dossierAnnuelId);
}

export async function modifierMontantDuAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const montantDuBrut = champTexte(formData, "montantDu");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!montantDuBrut) retour(dossierAnnuelId, "CHAMPS_MANQUANTS");
  const montantDu = champMontantNonNegatif(formData, "montantDu");
  if (!montantDu) retour(dossierAnnuelId, "MONTANT_INVALIDE");

  const cible = await prisma.dossierAnnuel.findUnique({ where: { id: dossierAnnuelId } });
  if (!cible) retour(dossierAnnuelId, "DOSSIER_INTROUVABLE");

  await prisma.$transaction([
    prisma.dossierAnnuel.update({
      where: { id: dossierAnnuelId },
      data: { montantDu },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_montant_du",
        entite: "DossierAnnuel",
        entiteId: dossierAnnuelId,
        details: { avant: cible.montantDu.toString(), apres: montantDu },
      },
    }),
  ]);

  revalidatePath(`/paiements/${dossierAnnuelId}`);
  revalidatePath("/paiements");
  retour(dossierAnnuelId);
}

export async function basculerRembourseAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  if (!dossierAnnuelId) redirect("/paiements");

  const cible = await prisma.dossierAnnuel.findUnique({ where: { id: dossierAnnuelId } });
  if (!cible) retour(dossierAnnuelId, "DOSSIER_INTROUVABLE");

  const rembourse = !cible.rembourse;

  await prisma.$transaction([
    prisma.dossierAnnuel.update({ where: { id: dossierAnnuelId }, data: { rembourse } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: rembourse ? "marque_rembourse" : "annule_rembourse",
        entite: "DossierAnnuel",
        entiteId: dossierAnnuelId,
      },
    }),
  ]);

  revalidatePath(`/paiements/${dossierAnnuelId}`);
  revalidatePath("/paiements");
  retour(dossierAnnuelId);
}

export async function modifierPaiementAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const paiementId = champTexte(formData, "paiementId");
  const montantBrut = champTexte(formData, "montant");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!paiementId || !montantBrut) retour(dossierAnnuelId, "CHAMPS_MANQUANTS");
  const montant = champMontantPositif(formData, "montant");
  if (!montant) retour(dossierAnnuelId, "MONTANT_INVALIDE");

  const cible = await prisma.paiement.findUnique({
    where: { id: paiementId },
    include: { echeance: true },
  });
  if (!cible) retour(dossierAnnuelId, "PAIEMENT_INTROUVABLE");

  await prisma.$transaction([
    prisma.paiement.update({ where: { id: paiementId }, data: { montant } }),
    // Le mouvement de trésorerie généré à la saisie initiale (voir
    // enregistrerPaiementAction) suit la correction — no-op silencieux si ce
    // paiement date d'avant cette fonctionnalité et n'a aucun mouvement lié.
    prisma.mouvementTresorerie.updateMany({ where: { paiementId }, data: { montant } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_paiement",
        entite: "Paiement",
        entiteId: paiementId,
        details: { avant: cible.montant.toString(), apres: montant },
      },
    }),
  ]);

  revalidatePath(`/paiements/${cible.echeance.dossierAnnuelId}`);
  revalidatePath("/paiements");
  revalidatePath("/tresorerie");
  retour(cible.echeance.dossierAnnuelId);
}

export async function supprimerPaiementAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const paiementId = champTexte(formData, "paiementId");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!paiementId) retour(dossierAnnuelId, "CHAMPS_MANQUANTS");

  const cible = await prisma.paiement.findUnique({
    where: { id: paiementId },
    include: { echeance: true, cheque: { include: { documents: true } } },
  });
  if (!cible) retour(dossierAnnuelId, "PAIEMENT_INTROUVABLE");

  await prisma.$transaction([
    // Le mouvement de trésorerie généré à la saisie (voir
    // enregistrerPaiementAction) n'a plus lieu d'être une fois le paiement
    // annulé — sans ce nettoyage explicite, MouvementTresorerie.paiementId
    // repasserait juste à null (onDelete: SetNull) et laisserait une
    // recette fantôme en trésorerie.
    prisma.mouvementTresorerie.deleteMany({ where: { paiementId } }),
    // Cascade en base vers Cheque/Prelevement/Document (voir
    // prisma/schema.prisma) : seul le fichier physique d'une éventuelle
    // pièce d'identité du titulaire doit être nettoyé à part, ci-dessous —
    // même pattern que supprimerDocumentAction (etudiants/[id]/actions.ts).
    prisma.paiement.delete({ where: { id: paiementId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "annulation_paiement",
        entite: "Paiement",
        entiteId: paiementId,
        details: {
          montant: cible.montant.toString(),
          moyen: cible.moyen,
          echeanceId: cible.echeanceId,
        },
      },
    }),
  ]);

  for (const document of cible.cheque?.documents ?? []) {
    await supprimerFichierDocument(document.cheminRelatif);
    await nettoyerDossierEtudiantSiVide(document.cheminRelatif);
  }

  revalidatePath(`/paiements/${cible.echeance.dossierAnnuelId}`);
  revalidatePath("/paiements");
  revalidatePath("/tresorerie");
  retour(cible.echeance.dossierAnnuelId);
}

export async function mettreAJourChequeAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const chequeId = champTexte(formData, "chequeId");
  const statutBrut = champTexte(formData, "statut");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!chequeId || !statutBrut || !(statutBrut in StatutCheque)) {
    retour(dossierAnnuelId, "CHAMPS_INVALIDES");
  }
  const statut = statutBrut as StatutCheque;

  const cible = await prisma.cheque.findUnique({
    where: { id: chequeId },
    include: { paiement: { include: { echeance: true } } },
  });
  if (!cible) retour(dossierAnnuelId, "CHEQUE_INTROUVABLE");

  // Resoumission du même statut (formulaire renvoyé sans changement) : no-op
  // silencieux, jamais une erreur. Sinon, seule une transition listée dans
  // TRANSITIONS_CHEQUE est autorisée — un encaissement/rejet est définitif,
  // et on ne saute pas d'étape (ex. RECU -> ENCAISSE directement). Ce garde-
  // fou porte uniquement sur le statut : les champs d'identification du
  // chèque ci-dessous (corriger une faute de frappe sur le numéro, la
  // banque...) n'ont pas cette notion de "transition".
  const statutChange = statut !== cible.statut;
  if (statutChange && !TRANSITIONS_CHEQUE[cible.statut].includes(statut)) {
    retour(cible.paiement.echeance.dossierAnnuelId, "TRANSITION_INVALIDE");
  }

  const banque = champTexte(formData, "banque");
  const numero = champTexte(formData, "numero");
  const titulaireNom = champTexte(formData, "titulaireNom");
  const titulairePrenom = champTexte(formData, "titulairePrenom");
  const infosChange =
    banque !== (cible.banque ?? null) ||
    numero !== (cible.numero ?? null) ||
    titulaireNom !== (cible.titulaireNom ?? null) ||
    titulairePrenom !== (cible.titulairePrenom ?? null);

  if (statutChange || infosChange) {
    await prisma.$transaction([
      prisma.cheque.update({
        where: { id: chequeId },
        data: {
          statut,
          banque,
          numero,
          titulaireNom,
          titulairePrenom,
          motifRejet: statut === "REJETE" ? champTexte(formData, "motifRejet") : null,
          dateDepot: statut === "DEPOSE" || statut === "ENCAISSE" ? new Date() : undefined,
          dateEncaissement: statut === "ENCAISSE" ? new Date() : undefined,
        },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.id,
          action: statutChange ? "changement_statut_cheque" : "modification_infos_cheque",
          entite: "Cheque",
          entiteId: chequeId,
          details: statutChange
            ? { avant: cible.statut, apres: statut }
            : { banque, numero, titulaireNom, titulairePrenom },
        },
      }),
    ]);
  }

  revalidatePath(`/paiements/${cible.paiement.echeance.dossierAnnuelId}`);
  retour(cible.paiement.echeance.dossierAnnuelId);
}

export async function mettreAJourPrelevementAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.PAIEMENTS, "ECRITURE");

  const dossierAnnuelId = champTexte(formData, "dossierAnnuelId");
  const prelevementId = champTexte(formData, "prelevementId");
  const statutBrut = champTexte(formData, "statut");
  if (!dossierAnnuelId) redirect("/paiements");
  if (!prelevementId || !statutBrut || !(statutBrut in StatutPrelevement)) {
    retour(dossierAnnuelId, "CHAMPS_INVALIDES");
  }
  const statut = statutBrut as StatutPrelevement;

  const cible = await prisma.prelevement.findUnique({
    where: { id: prelevementId },
    include: { paiement: { include: { echeance: true } } },
  });
  if (!cible) retour(dossierAnnuelId, "PRELEVEMENT_INTROUVABLE");

  const statutChange = statut !== cible.statut;
  if (statutChange && !TRANSITIONS_PRELEVEMENT[cible.statut].includes(statut)) {
    retour(cible.paiement.echeance.dossierAnnuelId, "TRANSITION_INVALIDE");
  }

  const iban = champTexte(formData, "iban");
  const bic = champTexte(formData, "bic");
  const titulaire = champTexte(formData, "titulaire");
  const referenceMandat = champTexte(formData, "referenceMandat");
  const infosChange =
    iban !== (cible.iban ?? null) ||
    bic !== (cible.bic ?? null) ||
    titulaire !== (cible.titulaire ?? null) ||
    referenceMandat !== (cible.referenceMandat ?? null);

  if (statutChange || infosChange) {
    await prisma.$transaction([
      prisma.prelevement.update({
        where: { id: prelevementId },
        data: {
          statut,
          iban,
          bic,
          titulaire,
          referenceMandat,
          motifRejet: statut === "REJETE" ? champTexte(formData, "motifRejet") : null,
          dateEncaissement: statut === "ENCAISSE" ? new Date() : undefined,
        },
      }),
      prisma.journalAudit.create({
        data: {
          utilisateurId: session.id,
          action: statutChange ? "changement_statut_prelevement" : "modification_infos_prelevement",
          entite: "Prelevement",
          entiteId: prelevementId,
          details: statutChange
            ? { avant: cible.statut, apres: statut }
            : { iban, bic, titulaire, referenceMandat },
        },
      }),
    ]);
  }

  revalidatePath(`/paiements/${cible.paiement.echeance.dossierAnnuelId}`);
  retour(cible.paiement.echeance.dossierAnnuelId);
}
