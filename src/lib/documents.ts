import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Fichiers séparés de la base (règle non négociable) : DOCUMENTS_DIR pointe
// vers un volume dédié (voir docker-compose.yml, volume app_data). Seules
// les métadonnées et ce chemin relatif sont stockés en base (modèle Document).
function racineDocuments(): string {
  const dir = process.env.DOCUMENTS_DIR;
  if (!dir) throw new Error("DOCUMENTS_DIR n'est pas défini.");
  return path.resolve(dir);
}

function cheminAbsolu(cheminRelatif: string): string {
  return path.join(racineDocuments(), cheminRelatif);
}

// Nom de fichier généré (jamais le nom fourni par l'utilisateur) : évite
// toute collision et toute tentative de traversée de chemin.
function nomFichierGenere(nomOriginal: string): string {
  const extension = path.extname(nomOriginal).slice(0, 20);
  return `${randomUUID()}${extension}`;
}

export async function enregistrerDocumentEtudiant(
  etudiantId: string,
  nomOriginal: string,
  contenu: Buffer,
): Promise<string> {
  const cheminRelatif = path.join(
    "etudiants",
    etudiantId,
    nomFichierGenere(nomOriginal),
  );
  const chemin = cheminAbsolu(cheminRelatif);
  await mkdir(path.dirname(chemin), { recursive: true });
  await writeFile(chemin, contenu);
  return cheminRelatif;
}

// Documents associatifs (PV de CA/AG, règlement intérieur, statuts) : même
// principe que enregistrerDocumentEtudiant, mais rangés à part (pas de
// dossier étudiant à rattacher) — voir modèle DocumentAssociation.
export async function enregistrerDocumentAssociation(
  nomOriginal: string,
  contenu: Buffer,
): Promise<string> {
  const cheminRelatif = path.join("association", nomFichierGenere(nomOriginal));
  const chemin = cheminAbsolu(cheminRelatif);
  await mkdir(path.dirname(chemin), { recursive: true });
  await writeFile(chemin, contenu);
  return cheminRelatif;
}

export async function lireDocument(cheminRelatif: string): Promise<Buffer> {
  return readFile(cheminAbsolu(cheminRelatif));
}

export async function supprimerFichierDocument(cheminRelatif: string): Promise<void> {
  await unlink(cheminAbsolu(cheminRelatif)).catch(() => {});
}

// Type MIME d'un dossier généré (.docx) — un navigateur ne le prévisualise
// jamais nativement, contrairement à un PDF/image : voir la page d'aperçu
// côté client sous documents/[documentId]/apercu.
export const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const TYPE_DOCUMENT_ASSOCIATION_LABELS: Record<string, string> = {
  PV: "Procès-verbal",
  REGLEMENT_INTERIEUR: "Règlement intérieur",
  STATUTS: "Statuts",
  AUTRE: "Autre",
};

export const TYPE_DOCUMENT_LABELS: Record<string, string> = {
  PIECE_IDENTITE: "Pièce d'identité",
  PHOTO: "Photo",
  DOSSIER_GENERE: "Dossier d'inscription généré",
  DOSSIER_SIGNE: "Dossier signé",
  JUSTIFICATIF_PAIEMENT: "Justificatif de paiement",
  ATTESTATION_SCOLARITE: "Attestation de scolarité",
  AUTRE: "Autre",
};

// Documents attendus pour considérer le dossier papier d'un étudiant comme
// complet (pièce d'identité, photo, dossier signé — voir
// Projet/01_Cahier_fonctionnel_MVP.md §Documents). Le dossier généré et le
// justificatif de paiement ne comptent pas : ce sont des sorties de
// l'application, pas des pièces à fournir par la famille.
export const TYPES_DOCUMENTS_REQUIS = ["PIECE_IDENTITE", "PHOTO", "DOSSIER_SIGNE"] as const;

// Types produits par l'appli elle-même (dossier rempli, reçu, attestation) —
// à distinguer des documents fournis par la famille : ils ne comptent pas
// dans le dossier documentaire complet, et sont affichés à part (archive en
// lecture seule) sur la fiche étudiant pour ne pas les confondre entre eux
// au clic.
export const TYPES_DOCUMENTS_GENERES = [
  "DOSSIER_GENERE",
  "JUSTIFICATIF_PAIEMENT",
  "ATTESTATION_SCOLARITE",
] as const;

export function dossierDocumentaireComplet(documents: { type: string }[]): boolean {
  const typesPresents = new Set(documents.map((d) => d.type));
  return TYPES_DOCUMENTS_REQUIS.every((t) => typesPresents.has(t));
}
