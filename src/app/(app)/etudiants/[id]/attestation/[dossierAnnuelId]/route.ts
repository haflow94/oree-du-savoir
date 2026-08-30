import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/lib/roles";
import { JOUR_LABELS } from "@/lib/planning";
import { genererAttestationScolaritePdf } from "@/lib/pdf-documents";
import { enregistrerDocumentEtudiant } from "@/lib/documents";

// Même garde d'accès (Bureau/Administration en dur) et même principe de
// régénération à chaque appel que la route reçu — voir son commentaire.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dossierAnnuelId: string }> },
) {
  const session = await requireRole([Role.BUREAU, Role.ADMINISTRATION]);
  const { id: etudiantId, dossierAnnuelId } = await params;

  const dossier = await prisma.dossierAnnuel.findUnique({
    where: { id: dossierAnnuelId },
    include: { etudiant: true, anneeScolaire: true },
  });
  if (!dossier || dossier.etudiantId !== etudiantId) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const inscriptions = await prisma.inscriptionClasse.findMany({
    where: { etudiantId, classe: { anneeScolaireId: dossier.anneeScolaireId } },
    include: { classe: { include: { cohorte: { include: { cours: true } } } } },
  });

  const classesSuivies = inscriptions.map(
    (i) =>
      `${i.classe.cohorte.cours.nom}${i.classe.cohorte.niveau ? ` (${i.classe.cohorte.niveau})` : ""} — ${
        JOUR_LABELS[i.classe.cohorte.jour]
      } ${i.classe.heureDebut}-${i.classe.heureFin}`,
  );

  // Uniquement des séances déjà passées à l'appel (Presence n'existe que
  // lorsqu'une feuille a été explicitement validée — règle non négociable
  // "jamais deviner une absence") : aucune supposition sur les séances non
  // encore appelées.
  const classeIds = inscriptions.map((i) => i.classe.id);
  const presences =
    classeIds.length > 0
      ? await prisma.presence.findMany({
          where: { etudiantId, seance: { classeId: { in: classeIds } } },
          select: { statut: true },
        })
      : [];
  const presence =
    presences.length > 0
      ? {
          nbPresences: presences.filter(
            (p) => p.statut !== "ABSENT" && p.statut !== "ABSENT_EXCUSE",
          ).length,
          nbSeancesPassees: presences.length,
        }
      : null;

  const pdf = await genererAttestationScolaritePdf({
    etudiant: dossier.etudiant,
    anneeScolaireLibelle: dossier.anneeScolaire.libelle,
    classesSuivies,
    presence,
    dateEdition: new Date(),
  });

  const nomFichier = `attestation-${dossier.anneeScolaire.libelle.replace(/\//g, "-")}-${dossier.etudiant.nom}-${dossier.etudiant.prenom}.pdf`;
  const cheminRelatif = await enregistrerDocumentEtudiant(etudiantId, nomFichier, pdf);

  await prisma.document.create({
    data: {
      etudiantId,
      type: "ATTESTATION_SCOLARITE",
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
