// Pas de `import "server-only"` ici : module de calcul pur (aucun accès
// disque/réseau), volontairement testable/importable tel quel — même
// raison que documents-statut.ts.
//
// Whitelist stricte, volontairement limitée aux types réellement attendus
// sur les champs publics photo/pièce d'identité (voir preinscription/actions.ts) :
// jamais le `type` déclaré par le navigateur au moment de l'upload — toujours
// détecté ici à partir des octets réels du fichier (signature binaire), pour
// qu'un fichier HTML/SVG renommé en .jpg ne puisse pas se faire passer pour
// une image (XSS stockée servie ensuite en Content-Type inline, voir
// service-fichier.ts).
export type TypeFichierAutorise = "application/pdf" | "image/jpeg" | "image/png";

const SIGNATURES: { mime: TypeFichierAutorise; magic: number[] }[] = [
  // "%PDF"
  { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  // SOI JPEG
  { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  // Signature PNG complète (8 octets)
  { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

// Détecte le type réel d'un fichier à partir de sa signature binaire (magic
// bytes). Retourne null si le contenu ne correspond à aucun type de la
// whitelist — l'appelant doit alors refuser le fichier, quel que soit son
// nom ou son extension.
export function detecterTypeMimeReel(contenu: Buffer): TypeFichierAutorise | null {
  for (const signature of SIGNATURES) {
    if (contenu.length < signature.magic.length) continue;
    if (signature.magic.every((octet, index) => contenu[index] === octet)) {
      return signature.mime;
    }
  }
  return null;
}

// Limite volontaire et configurable (le plafond générique par défaut de
// Next.js pour les Server Actions n'est pas pensé comme une protection, voir
// next.config.ts) — 8 Mo par défaut : une photo de pièce d'identité prise au
// téléphone dépasse rarement cette taille une fois compressée par le navigateur.
export const TAILLE_MAX_FICHIER_MO = Number(process.env.TAILLE_MAX_FICHIER_MO) || 8;
export const TAILLE_MAX_FICHIER_OCTETS = TAILLE_MAX_FICHIER_MO * 1024 * 1024;
