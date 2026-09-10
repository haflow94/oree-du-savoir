import "server-only";
import { prisma } from "@/lib/prisma";
import { construireContexteDossierEtudiant } from "./context";
import { rendreDossierHtml, rendreDossierPdfEtChampsSignature } from "./render";
import { enregistrerDocumentEtudiant, nomFichierDocument, formatSuffixeVersion } from "@/lib/documents";

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
  const { pdf, champsSignature } = await rendreDossierPdfEtChampsSignature(html);
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
