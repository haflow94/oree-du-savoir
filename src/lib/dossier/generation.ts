import "server-only";
import { prisma } from "@/lib/prisma";
import { construireContexteDossierEtudiant } from "./context";
import { rendreDossierHtml, rendreDossierPdfEtChampsSignature } from "./render";
import type { ChampSignatureDossier } from "./render";
import { enregistrerDocumentEtudiant, nomFichierDocument, formatSuffixeVersion } from "@/lib/documents";

// Nombre de zones de signature attendues dans CHAQUE gabarit (voir
// lib/dossier/templates/*.hbs — deux marqueurs data-documenso-signature,
// jamais gated par une condition Handlebars : engagement/admission et
// règlement intérieur, jamais 1 seule — voir aussi le commentaire de
// creerEtEnvoyerDocumentSignature, lib/documenso.ts). Sert de critère de
// validité du rendu ci-dessous.
const NB_ZONES_SIGNATURE_ATTENDUES = 2;

// Le rendu Chromium (voir lib/dossier/render.ts#mesurerChampsSignature) peut
// ponctuellement mesurer le DOM avant qu'il soit complètement stable, malgré
// `waitUntil: "load"` (constaté en production le 2026-09-10 : un dossier
// régénéré avec champsSignature vide, alors qu'un nouveau rendu immédiat, à
// données identiques, mesurait correctement les 2 zones — voir bilan de
// session). Un rendu qui n'en mesure pas exactement le nombre attendu est
// donc considéré invalide et n'est JAMAIS utilisé tel quel : une seconde
// tentative complète et indépendante est retentée automatiquement ; si elle
// échoue aussi, l'appelant reçoit une erreur explicite (voir
// genererNouvelleVersionDossier ci-dessous, qui n'écrit ni fichier ni ligne
// Document tant que ce résultat n'est pas validé — jamais de version
// "dernière" inutilisable persistée silencieusement).
export async function rendrePdfAvecZonesValidees(
  html: string,
): Promise<{ pdf: Buffer; champsSignature: ChampSignatureDossier[] }> {
  const tentative1 = await rendreDossierPdfEtChampsSignature(html);
  if (tentative1.champsSignature.length === NB_ZONES_SIGNATURE_ATTENDUES) return tentative1;

  const tentative2 = await rendreDossierPdfEtChampsSignature(html);
  if (tentative2.champsSignature.length === NB_ZONES_SIGNATURE_ATTENDUES) return tentative2;

  throw new Error(
    `Génération du dossier : ${NB_ZONES_SIGNATURE_ATTENDUES} zones de signature attendues, ` +
      `${tentative1.champsSignature.length} puis ${tentative2.champsSignature.length} mesurées après deux ` +
      "tentatives — relancer la génération du dossier depuis la fiche étudiant.",
  );
}

// Point d'entrée unique pour (re)générer le PDF d'un dossier et créer sa
// nouvelle version — utilisé à la fois par la génération automatique après
// préinscription (V1) et par une correction de champ ordinaire depuis
// /dossier/[token] (V2, V3...). Chaque génération est une nouvelle ligne
// Document (jamais un écrasement) : l'historique complet reste consultable,
// voir Document.numeroVersion (prisma/schema.prisma). Remet toujours
// versionConfirmeeNumero/Le à null et statutSignature à A_VERIFIER : la
// version précédemment confirmée (le cas échéant) est explicitement
// invalidée, la famille doit revérifier avant de pouvoir signer à nouveau
// (règle "toute modification après confirmation invalide la confirmation
// précédente").
export async function genererNouvelleVersionDossier({
  etudiantId,
  sectionId,
  dossierAnnuelId,
  creeParId,
}: {
  etudiantId: string;
  sectionId: string;
  dossierAnnuelId: string;
  creeParId?: string;
}): Promise<{ documentId: string; numeroVersion: number }> {
  const [{ modeleDossier, contexte }, etudiant, derniereVersion, dossierAnnuel] = await Promise.all([
    construireContexteDossierEtudiant({ etudiantId, sectionId }),
    prisma.etudiant.findUniqueOrThrow({ where: { id: etudiantId } }),
    prisma.document.findFirst({
      where: { dossierAnnuelId, type: "DOSSIER_GENERE" },
      orderBy: { numeroVersion: "desc" },
      select: { numeroVersion: true },
    }),
    prisma.dossierAnnuel.findUniqueOrThrow({
      where: { id: dossierAnnuelId },
      select: { anneeScolaire: { select: { libelle: true } } },
    }),
  ]);

  const html = await rendreDossierHtml(modeleDossier, contexte);
  const { pdf, champsSignature } = await rendrePdfAvecZonesValidees(html);
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
      anneeLibelle: dossierAnnuel.anneeScolaire.libelle,
    },
    nomFichier,
    pdf,
  );

  const [document] = await prisma.$transaction([
    prisma.document.create({
      data: {
        etudiantId,
        dossierAnnuelId,
        numeroVersion,
        type: "DOSSIER_GENERE",
        nomFichier,
        cheminRelatif,
        mimeType: "application/pdf",
        tailleOctets: pdf.length,
        creeParId,
        champsSignature,
      },
    }),
    prisma.dossierAnnuel.update({
      where: { id: dossierAnnuelId },
      data: {
        versionConfirmeeNumero: null,
        versionConfirmeeLe: null,
        statutSignature: "A_VERIFIER",
      },
    }),
  ]);

  return { documentId: document.id, numeroVersion };
}
