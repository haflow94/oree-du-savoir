import "server-only";
import { mkdir, writeFile, readFile, unlink, rename, stat } from "node:fs/promises";
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
  statutDossierAffiche,
  STATUT_DOSSIER_LABELS,
  STATUT_DOSSIER_VARIANTS,
  type StatutDocumentRequis,
  type StatutDossierAffiche,
} from "./documents-statut";

// Nommage (dossier + fichier) : fonctions pures, définies séparément pour
// rester testables sans accès disque — voir lib/documents-nommage.ts.
// Réexportées ici pour la même raison que ci-dessus.
export {
  BUCKET_SANS_ANNEE,
  dossierPhysiqueEtudiant,
  estDansDossierEtudiant,
  formatSuffixeDesambiguisation,
  formatSuffixeVersion,
  nomFichierDocument,
  renommerNomFichier,
  renommerSegmentEtudiant,
  sanitiserSegmentChemin,
  segmentAnnee,
  segmentEtudiant,
  segmentPersonne,
  suffixesDesambiguisation,
} from "./documents-nommage";
import { dossierPhysiqueEtudiant } from "./documents-nommage";

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
// toute collision et toute tentative de traversée de chemin. Toujours
// utilisé pour enregistrerDocumentAssociation (hors périmètre du nommage
// lisible, voir CLAUDE.md — racine "association/" distincte de "Etudiant/").
function nomFichierGenere(nomOriginal: string): string {
  const extension = path.extname(nomOriginal).slice(0, 20);
  return `${randomUUID()}${extension}`;
}

// Écrit le document d'un étudiant sous le nom humain lisible
// "Etudiant/<année>/NOM Prénom — matricule/NOM Prénom — Type[...].ext" (voir
// dossierPhysiqueEtudiant/nomFichierDocument, lib/documents-nommage.ts) —
// jamais un UUID/CUID technique. `nomFichier` doit déjà être le nom final
// complet (calculé par l'appelant via nomFichierDocument, qui a besoin du
// contexte Prisma — liste des documents du même type — que ce module
// n'a volontairement pas).
//
// Garde-fou de collision : puisque le nom n'est plus un UUID garanti unique,
// une écriture sur un chemin déjà occupé est TOUJOURS un bug de désambiguïsation
// en amont, jamais un cas normal — on refuse d'écraser silencieusement plutôt
// que de risquer de perdre le fichier déjà présent.
export async function enregistrerDocumentEtudiant(
  contexteEtudiant: { matricule: string; nom: string; prenom: string; anneeLibelle: string | null },
  nomFichier: string,
  contenu: Buffer,
): Promise<string> {
  const cheminRelatif = path.join("etudiants", dossierPhysiqueEtudiant(contexteEtudiant), nomFichier);
  const chemin = cheminAbsolu(cheminRelatif);
  const dejaPresent = await stat(chemin).then(
    () => true,
    () => false,
  );
  if (dejaPresent) {
    throw new Error(
      `enregistrerDocumentEtudiant : un fichier existe déjà à "${cheminRelatif}" — désambiguïsation en amont à corriger, écriture refusée.`,
    );
  }
  await mkdir(path.dirname(chemin), { recursive: true });
  await writeFile(chemin, contenu);
  return cheminRelatif;
}

// Primitive générique de renommage/déplacement best-effort, sur des chemins
// DÉJÀ complets relatifs à DOCUMENTS_DIR (donc déjà préfixés "etudiants/"
// quand pertinent) — jamais bloquant, ne lève jamais : retourne false sur
// échec (NAS temporairement indisponible, etc.). Sert de brique commune à
// renommerDossierEtudiant/deplacerDocumentVersEtudiant ci-dessous ET de
// primitive de ROLLBACK (annuler un déplacement déjà réussi si une étape
// ultérieure de la même opération échoue, voir fusionnerDoublonAction) —
// dans ce dernier cas, appelée avec ancien/nouveau inversés.
export async function renommerCheminBrut(
  ancienCheminRelatif: string,
  nouveauCheminRelatif: string,
): Promise<boolean> {
  if (ancienCheminRelatif === nouveauCheminRelatif) return true;
  try {
    const ancienChemin = cheminAbsolu(ancienCheminRelatif);
    const nouveauChemin = cheminAbsolu(nouveauCheminRelatif);
    const source = await stat(ancienChemin).then(
      () => true,
      () => false,
    );
    if (!source) return true; // rien à déplacer (déjà absent) : pas un échec
    await mkdir(path.dirname(nouveauChemin), { recursive: true });
    await rename(ancienChemin, nouveauChemin);
    return true;
  } catch {
    return false;
  }
}

// Renomme (best-effort, jamais bloquant) le dossier physique d'un étudiant
// pour une année donnée — déclenché par un changement de nom/prénom
// (modifierEtudiantAction, anonymisation RGPD) ou par une fusion de doublon.
// Le contenu réel des documents n'est jamais perdu puisque
// Document.cheminRelatif n'est mis à jour qu'après un déplacement
// effectivement réussi (voir renommerCheminBrut).
export async function renommerDossierEtudiant(
  ancienDossierRelatif: string,
  nouveauDossierRelatif: string,
): Promise<boolean> {
  return renommerCheminBrut(
    path.join("etudiants", ancienDossierRelatif),
    path.join("etudiants", nouveauDossierRelatif),
  );
}

// Déplace un document précis vers le dossier d'un AUTRE étudiant (fusion de
// doublon, voir fusionnerDoublonAction) sous son nouveau nom final — même
// garde-fou de collision qu'enregistrerDocumentEtudiant, même politique
// best-effort/non-bloquante que renommerDossierEtudiant. `null` si le
// déplacement échoue OU si la cible existe déjà (bug de désambiguïsation en
// amont, jamais un cas normal).
export async function deplacerDocumentVersEtudiant(
  ancienCheminRelatif: string,
  contexteEtudiantCible: { matricule: string; nom: string; prenom: string; anneeLibelle: string | null },
  nomFichierCible: string,
): Promise<string | null> {
  const nouveauCheminRelatif = path.join(
    "etudiants",
    dossierPhysiqueEtudiant(contexteEtudiantCible),
    nomFichierCible,
  );
  const dejaPresent = await stat(cheminAbsolu(nouveauCheminRelatif)).then(
    () => true,
    () => false,
  );
  if (dejaPresent) return null;
  const succes = await renommerCheminBrut(ancienCheminRelatif, nouveauCheminRelatif);
  return succes ? nouveauCheminRelatif : null;
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
