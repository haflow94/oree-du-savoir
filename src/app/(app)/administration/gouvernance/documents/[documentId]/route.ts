import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lireDocument } from "@/lib/documents";
import { requireModule, Module } from "@/lib/permissions";
import { enTetesServiceDocument } from "@/lib/service-fichier";

// Même principe que etudiants/[id]/documents/[documentId]/route.ts : le
// chemin sur disque n'est jamais pris depuis l'URL, seul l'id en base compte,
// et le Content-Type est recalculé depuis le contenu réel (jamais depuis
// mimeType, déclaré par le staff à l'upload).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  await requireModule(Module.GOUVERNANCE, "LECTURE");
  const { documentId } = await params;
  const telecharger = request.nextUrl.searchParams.get("telecharger") === "1";

  const document = await prisma.documentAssociation.findUnique({ where: { id: documentId } });
  if (!document) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  let contenu: Buffer;
  try {
    contenu = await lireDocument(document.cheminRelatif);
  } catch {
    return NextResponse.json({ error: "Fichier introuvable sur le serveur." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: enTetesServiceDocument(contenu, document.nomFichier, telecharger),
  });
}
