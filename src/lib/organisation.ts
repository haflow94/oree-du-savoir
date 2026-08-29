import "server-only";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { lireDocument } from "@/lib/documents";
import type { Organisation } from "@/generated/prisma/client";

// Identité de l'association : une seule ligne, créée par le seed (voir
// prisma/seed.ts#seedOrganisation) et éditée depuis Administration →
// Organisation. Aucune autre table ne référence Organisation pour l'instant
// (voir prisma/schema.prisma) : l'appli reste mono-organisation, cette
// fonction ne fait que sortir l'identité du code en dur.
export async function getOrganisation(): Promise<Organisation> {
  const organisation = await prisma.organisation.findFirst();
  if (!organisation) {
    throw new Error(
      "Aucune organisation configurée — exécuter le seed (npm run db:seed).",
    );
  }
  return organisation;
}

export function mimeTypeImage(cheminRelatif: string): string {
  switch (path.extname(cheminRelatif).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

// Encode une image stockée sous DOCUMENTS_DIR en `data:` URI, pour un rendu
// Puppeteer entièrement hors-ligne (voir src/lib/dossier/render.ts) : ni le
// logo de l'association ni la photo de l'étudiant ne dépendent d'un accès
// réseau/serveur au moment de la génération du PDF.
export async function versDataUri(cheminRelatif: string): Promise<string> {
  const contenu = await lireDocument(cheminRelatif);
  return `data:${mimeTypeImage(cheminRelatif)};base64,${contenu.toString("base64")}`;
}
