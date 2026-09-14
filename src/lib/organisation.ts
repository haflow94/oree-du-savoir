import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
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

// Logo par défaut de l'association, servi tant qu'aucun logo personnalisé
// n'a été téléversé depuis Administration → Organisation (ou si le fichier
// référencé en base a disparu du disque) — jamais un cas d'erreur, juste le
// point de départ avant le premier remplacement.
const LOGO_PAR_DEFAUT = path.join(process.cwd(), "public", "logo-loree-du-savoir.png");

// Point de passage unique pour tout affichage du logo hors dossier PDF (menu,
// page de connexion, icônes de l'application — voir src/app/logo/route.ts,
// icon.tsx, apple-icon.tsx) : bascule automatiquement sur le logo par défaut
// tant qu'Organisation.logoCheminRelatif est vide, sans jamais renvoyer
// d'absence d'image.
export async function logoBytesEtType(): Promise<{ contenu: Buffer; mimeType: string }> {
  const organisation = await getOrganisation();
  if (organisation.logoCheminRelatif) {
    try {
      const contenu = await lireDocument(organisation.logoCheminRelatif);
      return { contenu, mimeType: mimeTypeImage(organisation.logoCheminRelatif) };
    } catch {
      // Fichier manquant sur le disque malgré le chemin en base : on retombe
      // sur le logo par défaut plutôt que de casser l'affichage.
    }
  }
  return { contenu: await readFile(LOGO_PAR_DEFAUT), mimeType: "image/png" };
}

// Même logo que logoBytesEtType(), encodé en `data:` URI pour un rendu
// Puppeteer hors-ligne (voir dossier/context.ts) — remplace l'ancien usage
// conditionnel de versDataUri() qui laissait le dossier sans logo tant
// qu'aucun n'était configuré.
export async function logoDataUri(): Promise<string> {
  const { contenu, mimeType } = await logoBytesEtType();
  return `data:${mimeType};base64,${contenu.toString("base64")}`;
}
