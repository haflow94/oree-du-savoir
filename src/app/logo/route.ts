import { NextResponse } from "next/server";
import { logoBytesEtType } from "@/lib/organisation";

// Sans ce flag, Next.js pourrait mettre cette route en cache statique au
// build (aucune API dépendante de la requête n'est utilisée ici) et figer
// le logo de ce moment-là — voir le même commentaire dans icon.tsx.
export const dynamic = "force-dynamic";

// Logo de l'association, public (utilisé par la sidebar authentifiée mais
// aussi par la page de connexion avant toute session) : bascule vers le
// logo par défaut tant qu'aucun fichier personnalisé n'a été téléversé
// depuis Administration → Organisation (voir lib/organisation.ts). URL
// stable quel que soit le fichier réel derrière — d'où un cache court plutôt
// que la mise en cache longue durée habituelle des documents statiques, pour
// qu'un remplacement de logo se propage rapidement.
export async function GET() {
  const { contenu, mimeType } = await logoBytesEtType();
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}
