import { logoBytesEtType } from "@/lib/organisation";

// Icône d'onglet/navigateur générée dynamiquement à partir du logo de
// l'association (voir lib/organisation.ts) : Next.js l'injecte en <link
// rel="icon"> et les navigateurs la préfèrent au favicon.ico statique.
// Runtime Node obligatoire : lecture du fichier sous DOCUMENTS_DIR + Prisma
// (adaptateur pg, voir CLAUDE.md).
export const runtime = "nodejs";
// Sans ce flag, Next.js pré-rend cette route une seule fois au build et
// fige le logo de ce moment-là : il ne suivrait plus jamais un remplacement
// fait depuis Administration → Organisation.
export const dynamic = "force-dynamic";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const { contenu, mimeType } = await logoBytesEtType();
  return new Response(new Uint8Array(contenu), {
    headers: { "Content-Type": mimeType },
  });
}
