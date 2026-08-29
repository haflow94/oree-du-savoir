import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { construireContexteDossierEtudiant } from "@/lib/dossier/context";
import { rendreDossierHtml, rendreDossierPdf } from "@/lib/dossier/render";
import { enregistrerDocumentEtudiant } from "@/lib/documents";
import { requireModule, Module } from "@/lib/permissions";

// Génère le dossier d'inscription en PDF pour une section donnée, à partir
// du modèle maître (ADULTES/JEUNES, voir Section.modeleDossier) et des
// données réelles de l'étudiant (voir src/lib/dossier/context.ts) — même
// template que celui utilisé pour le dossier vierge
// (documents/dossier-vierge/route.ts), remplacement du système .docx par
// section (voir historique de commit, ancien src/lib/dossier-officiel.ts).
// L'enregistre comme Document (type DOSSIER_GENERE) pour qu'il reste
// accessible plus tard sans le régénérer, puis le renvoie : en aperçu dans
// le navigateur par défaut (impression/téléchargement natifs du visualiseur
// PDF), en téléchargement forcé avec ?dl=1.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireModule(Module.DOCUMENTS, "ECRITURE");
  const { id: etudiantId } = await params;
  const sectionId = request.nextUrl.searchParams.get("sectionId");
  const telecharger = request.nextUrl.searchParams.get("dl") === "1";
  if (!sectionId) {
    return NextResponse.json({ error: "sectionId manquant" }, { status: 400 });
  }

  const etudiant = await prisma.etudiant.findUnique({ where: { id: etudiantId } });
  if (!etudiant) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const { modeleDossier, contexte, sectionNom } = await construireContexteDossierEtudiant({
    etudiantId,
    sectionId,
  });
  const html = await rendreDossierHtml(modeleDossier, contexte);
  const pdf = await rendreDossierPdf(html);

  const nomFichier = `dossier-${sectionNom}-${etudiant.nom}-${etudiant.prenom}.pdf`;
  const cheminRelatif = await enregistrerDocumentEtudiant(etudiantId, nomFichier, pdf);

  await prisma.document.create({
    data: {
      etudiantId,
      type: "DOSSIER_GENERE",
      nomFichier,
      cheminRelatif,
      mimeType: "application/pdf",
      tailleOctets: pdf.length,
      creeParId: session.id,
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${telecharger ? "attachment" : "inline"}; filename="${nomFichier}"`,
    },
  });
}
