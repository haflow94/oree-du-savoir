import "server-only";
import { prisma } from "@/lib/prisma";
import { construireContexteDossierEtudiant } from "./context";
import { rendreDossierHtml, rendreDossierPdf } from "./render";
import { enregistrerDocumentEtudiant } from "@/lib/documents";

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
  const [{ modeleDossier, contexte, sectionNom }, etudiant, derniereVersion] = await Promise.all([
    construireContexteDossierEtudiant({ etudiantId, sectionId }),
    prisma.etudiant.findUniqueOrThrow({ where: { id: etudiantId } }),
    prisma.document.findFirst({
      where: { dossierAnnuelId, type: "DOSSIER_GENERE" },
      orderBy: { numeroVersion: "desc" },
      select: { numeroVersion: true },
    }),
  ]);

  const html = await rendreDossierHtml(modeleDossier, contexte);
  const pdf = await rendreDossierPdf(html);
  const numeroVersion = (derniereVersion?.numeroVersion ?? 0) + 1;
  const nomFichier = `dossier-${sectionNom}-${etudiant.nom}-${etudiant.prenom}-v${numeroVersion}.pdf`;
  const cheminRelatif = await enregistrerDocumentEtudiant(etudiantId, nomFichier, pdf);

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
