import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resoudreAccesDossier } from "@/lib/acces-dossier";
import { lireDocument } from "@/lib/documents";

// Sert la dernière version du dossier généré (ou la version demandée via
// ?version=N, pour permettre à la famille de comparer avant/après une
// correction) — jamais un id de Document passé librement par le client :
// uniquement dérivé du token, qui ne donne accès qu'à CE dossier (voir
// lib/acces-dossier.ts).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolution = await resoudreAccesDossier(token);
  if (!resolution.valide) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 404 });
  }

  const versionDemandee = request.nextUrl.searchParams.get("version");
  const document = await prisma.document.findFirst({
    where: {
      dossierAnnuelId: resolution.dossierAnnuelId,
      type: "DOSSIER_GENERE",
      ...(versionDemandee ? { numeroVersion: Number.parseInt(versionDemandee, 10) } : {}),
    },
    orderBy: { numeroVersion: "desc" },
  });
  if (!document) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }

  const contenu = await lireDocument(document.cheminRelatif);
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${document.nomFichier}"`,
    },
  });
}
