import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Labels et calcul du statut du dossier documentaire : fonctions pures,
// définies dans un module séparé sans `import "server-only"` pour rester
// importables depuis un composant client ou un test (voir
// lib/documents-statut.ts). Réexportées ici pour ne pas changer les imports
// existants (`@/lib/documents`) dans le reste de l'appli.
export {
  TYPE_DOCUMENT_LABELS,
  TYPE_PIECE_IDENTITE_LABELS,
  TYPES_DOCUMENTS_REQUIS,
  TYPES_DOCUMENTS_GENERES,
  statutDocumentsRequis,
  dossierDocumentaireComplet,
  type StatutDocumentRequis,
} from "./documents-statut";

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
