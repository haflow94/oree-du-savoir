import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { lireDocument } from "@/lib/documents";

const PEUT_VOIR = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];

// Le chemin sur disque n'est jamais pris depuis l'URL : on ne sert que le
// document dont l'id est en base, avec vérification que etudiantId
// correspond bien (défense en profondeur contre un id de document deviné).
// "inline" (par défaut) laisse le navigateur afficher le fichier dans un
// onglet (PDF, image…) ; ?telecharger=1 force le téléchargement même pour
// ces types-là.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  await requireRole(PEUT_VOIR);
  const { id: etudiantId, documentId } = await params;
  const telecharger = request.nextUrl.searchParams.get("telecharger") === "1";

  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document || document.etudiantId !== etudiantId) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  let contenu: Buffer;
  try {
    contenu = await lireDocument(document.cheminRelatif);
  } catch {
    // Le fichier référencé en base n'existe plus sur le volume (ex. restauré
    // depuis une sauvegarde de la base sans celle des fichiers, voir
    // DEPLOIEMENT.md) : mieux vaut un 404 explicite qu'une erreur serveur
    // qui casse toute la page.
    return NextResponse.json({ error: "Fichier introuvable sur le serveur." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${document.nomFichier}"`,
    },
  });
}
