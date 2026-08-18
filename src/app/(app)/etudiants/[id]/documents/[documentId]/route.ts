import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { lireDocument } from "@/lib/documents";

const PEUT_VOIR = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];

// Le chemin sur disque n'est jamais pris depuis l'URL : on ne sert que le
// document dont l'id est en base, avec vérification que etudiantId
// correspond bien (défense en profondeur contre un id de document deviné).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  await requireRole(PEUT_VOIR);
  const { id: etudiantId, documentId } = await params;

  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document || document.etudiantId !== etudiantId) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const contenu = await lireDocument(document.cheminRelatif);

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${document.nomFichier}"`,
    },
  });
}
