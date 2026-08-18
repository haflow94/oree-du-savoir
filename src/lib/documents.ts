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

export async function lireDocument(cheminRelatif: string): Promise<Buffer> {
  return readFile(cheminAbsolu(cheminRelatif));
}

export async function supprimerFichierDocument(cheminRelatif: string): Promise<void> {
  await unlink(cheminAbsolu(cheminRelatif)).catch(() => {});
}

export const TYPE_DOCUMENT_LABELS: Record<string, string> = {
  PIECE_IDENTITE: "Pièce d'identité",
  PHOTO: "Photo",
  DOSSIER_GENERE: "Dossier d'inscription généré",
  DOSSIER_SIGNE: "Dossier signé",
  JUSTIFICATIF_PAIEMENT: "Justificatif de paiement",
  AUTRE: "Autre",
};
