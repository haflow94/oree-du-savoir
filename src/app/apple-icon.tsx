import { logoBytesEtType } from "@/lib/organisation";

// Icône affichée par iOS/iPadOS lors d'un "Ajouter à l'écran d'accueil" —
// même source que icon.tsx (voir lib/organisation.ts), juste une taille
// nominale différente (convention Apple).
export const runtime = "nodejs";
// Voir le même commentaire dans icon.tsx : sans ça, Next.js prérend cette
// route une seule fois au build et fige le logo de ce moment-là.
export const dynamic = "force-dynamic";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const { contenu, mimeType } = await logoBytesEtType();
  return new Response(new Uint8Array(contenu), {
    headers: { "Content-Type": mimeType },
  });
}
