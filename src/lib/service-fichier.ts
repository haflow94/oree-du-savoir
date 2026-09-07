// Pas de `import "server-only"` ici : module de calcul pur, volontairement
// testable — même raison que fichiers-uploades.ts.
import { detecterTypeMimeReel } from "./fichiers-uploades";

// Types qu'un navigateur peut afficher directement sans risque d'exécution
// (pas de HTML/SVG/JS) : seuls ceux-là peuvent être servis "inline". Tout le
// reste part en pièce jointe (attachment), quel que soit le mimeType stocké
// en base au moment de l'upload (jamais fiable, voir fichiers-uploades.ts).
const MIME_SURS_INLINE: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

// Point de passage unique pour servir un fichier issu de DOCUMENTS_DIR (voir
// etudiants/[id]/documents/[documentId]/route.ts et
// administration/gouvernance/documents/[documentId]/route.ts) : le
// Content-Type est toujours recalculé à partir du contenu réel, jamais du
// mimeType déclaré à l'upload — un fichier dont la signature ne correspond à
// aucun type sûr est systématiquement forcé en téléchargement, même si
// `telecharger` n'a pas été demandé.
export function enTetesServiceDocument(
  contenu: Buffer,
  nomFichier: string,
  telecharger: boolean,
): { "Content-Type": string; "Content-Disposition": string } {
  const typeReel = detecterTypeMimeReel(contenu);
  const inlineAutorise = typeReel !== null && MIME_SURS_INLINE.has(typeReel) && !telecharger;
  return {
    "Content-Type": typeReel ?? "application/octet-stream",
    "Content-Disposition": `${inlineAutorise ? "inline" : "attachment"}; filename="${nomFichier}"`,
  };
}
