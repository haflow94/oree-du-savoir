import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { genererDossierOfficielPdf } from "@/lib/dossier-officiel";
import { enregistrerDocumentEtudiant } from "@/lib/documents";

const PEUT_GENERER = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];

// Génère le dossier officiel en PDF pour une section donnée, l'enregistre
// comme Document (type DOSSIER_GENERE) pour qu'il reste accessible plus
// tard sans le regénérer, puis le renvoie pour impression/téléchargement
// immédiat.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireRole(PEUT_GENERER);
  const { id: etudiantId } = await params;
  const sectionId = request.nextUrl.searchParams.get("sectionId");
  if (!sectionId) {
    return NextResponse.json({ error: "sectionId manquant" }, { status: 400 });
  }

  const [etudiant, section, anneeActive] = await Promise.all([
    prisma.etudiant.findUnique({
      where: { id: etudiantId },
      include: { responsables: { take: 1 } },
    }),
    prisma.section.findUnique({ where: { id: sectionId } }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
  ]);

  if (!etudiant || !section) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const pdf = await genererDossierOfficielPdf({
    section: {
      ...section,
      fraisFormation: section.fraisFormation.toString(),
      fraisDossier: section.fraisDossier.toString(),
    },
    anneeLibelle: anneeActive?.libelle ?? "",
    etudiant,
    responsable: etudiant.responsables[0] ?? null,
  });

  const nomFichier = `dossier-${section.nom}-${etudiant.nom}-${etudiant.prenom}.pdf`;
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
      "Content-Disposition": `inline; filename="${nomFichier}"`,
    },
  });
}
