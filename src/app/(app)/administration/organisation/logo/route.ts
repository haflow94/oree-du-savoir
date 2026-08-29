import { NextResponse } from "next/server";
import { getOrganisation, mimeTypeImage } from "@/lib/organisation";
import { lireDocument } from "@/lib/documents";
import { requireModule, Module } from "@/lib/permissions";

// Aperçu du logo dans Administration → Organisation : le fichier vit sous
// DOCUMENTS_DIR (jamais servi statiquement), donc streamé comme tout autre
// document de l'application (voir etudiants/[id]/documents/[documentId]/route.ts).
export async function GET() {
  await requireModule(Module.ADMINISTRATION, "LECTURE");
  const organisation = await getOrganisation();
  if (!organisation.logoCheminRelatif) {
    return NextResponse.json({ error: "Aucun logo" }, { status: 404 });
  }

  let contenu: Buffer;
  try {
    contenu = await lireDocument(organisation.logoCheminRelatif);
  } catch {
    return NextResponse.json({ error: "Fichier introuvable sur le serveur." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: { "Content-Type": mimeTypeImage(organisation.logoCheminRelatif) },
  });
}
