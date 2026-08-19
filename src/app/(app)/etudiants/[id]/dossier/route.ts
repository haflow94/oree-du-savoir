import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { JOUR_LABELS } from "@/lib/planning";
import { genererDossierOfficielDocx } from "@/lib/dossier-officiel";
import { enregistrerDocumentEtudiant } from "@/lib/documents";

const PEUT_GENERER = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];

const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Génère le dossier officiel en .docx pour une section donnée (remplissage
// direct du gabarit Word d'origine de l'association, voir
// src/lib/dossier-officiel.ts), l'enregistre comme Document (type
// DOSSIER_GENERE) pour qu'il reste accessible plus tard sans le regénérer,
// puis le renvoie en téléchargement (un navigateur ne prévisualise pas un
// .docx : il faut l'ouvrir dans Word/LibreOffice pour l'imprimer/signer).
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

  const inscriptions = anneeActive
    ? await prisma.inscriptionClasse.findMany({
        where: {
          etudiantId,
          classe: { anneeScolaireId: anneeActive.id, cours: { sectionId } },
        },
        include: { classe: true },
      })
    : [];

  const horaireChoisi =
    inscriptions.length > 0
      ? inscriptions
          .map(
            (i) =>
              `${JOUR_LABELS[i.classe.jour]} ${i.classe.heureDebut}-${i.classe.heureFin}` +
              (i.classe.niveau ? ` (${i.classe.niveau})` : ""),
          )
          .join(" ; ")
      : "à définir";

  const docx = await genererDossierOfficielDocx({
    sectionNom: section.nom,
    etudiant,
    responsable: etudiant.responsables[0] ?? null,
    horaireChoisi,
  });

  const nomFichier = `dossier-${section.nom}-${etudiant.nom}-${etudiant.prenom}.docx`;
  const cheminRelatif = await enregistrerDocumentEtudiant(etudiantId, nomFichier, docx);

  await prisma.document.create({
    data: {
      etudiantId,
      type: "DOSSIER_GENERE",
      nomFichier,
      cheminRelatif,
      mimeType: MIME_DOCX,
      tailleOctets: docx.length,
      creeParId: session.id,
    },
  });

  return new NextResponse(new Uint8Array(docx), {
    headers: {
      "Content-Type": MIME_DOCX,
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
    },
  });
}
