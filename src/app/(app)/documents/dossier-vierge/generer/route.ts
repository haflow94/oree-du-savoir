import { NextRequest, NextResponse } from "next/server";
import { construireContexteDossierVierge } from "@/lib/dossier/context";
import { rendreDossierHtml, rendreDossierPdf } from "@/lib/dossier/render";
import { requireModule, Module } from "@/lib/permissions";
import type { ModeleDossier } from "@/generated/prisma/enums";

// Dossier vierge : mêmes templates que le dossier étudiant
// (etudiants/[id]/dossier/route.ts), sans étudiant — les zones personnelles
// restent vides pour une saisie manuscrite après impression (voir
// SPEC-dossiers.md). Jamais persisté comme Document (pas d'étudiant à
// rattacher), juste streamé.
export async function GET(request: NextRequest) {
  await requireModule(Module.DOCUMENTS, "ECRITURE");
  const modeleDossier = request.nextUrl.searchParams.get("modeleDossier") as ModeleDossier | null;
  const sectionId = request.nextUrl.searchParams.get("sectionId") ?? undefined;
  const telecharger = request.nextUrl.searchParams.get("dl") === "1";

  if (modeleDossier !== "ADULTES" && modeleDossier !== "JEUNES") {
    return NextResponse.json({ error: "modeleDossier invalide" }, { status: 400 });
  }
  if (modeleDossier === "ADULTES" && !sectionId) {
    return NextResponse.json({ error: "sectionId manquant pour le modèle Adultes" }, { status: 400 });
  }

  const { contexte, sectionNom } = await construireContexteDossierVierge({ modeleDossier, sectionId });
  const html = await rendreDossierHtml(modeleDossier, contexte);
  const pdf = await rendreDossierPdf(html);

  const nomFichier = `dossier-vierge-${sectionNom}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${nomFichier}"`,
    },
  });
}
