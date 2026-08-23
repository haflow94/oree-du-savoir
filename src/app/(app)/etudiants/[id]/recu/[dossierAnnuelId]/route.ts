import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/lib/roles";
import { statutCotisation } from "@/lib/paiements";
import { genererRecuPaiementPdf } from "@/lib/pdf-documents";
import { enregistrerDocumentEtudiant } from "@/lib/documents";

// Réservé Bureau/Administration à la demande explicite de l'association
// (pas via la grille de permissions éditable — Module.DOCUMENTS — pour ne
// pas dépendre d'une case à cocher qui pourrait être mal configurée : voir
// les autres carve-outs listés dans CLAUDE.md, ex. gestion des comptes).
// Régénère un PDF frais à chaque appel depuis les données de paiement
// actuelles, et l'enregistre comme Document (traçabilité : chaque
// génération de reçu reste consultable, même après un futur paiement).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dossierAnnuelId: string }> },
) {
  const session = await requireRole([Role.BUREAU, Role.ADMINISTRATION]);
  const { id: etudiantId, dossierAnnuelId } = await params;

  const dossier = await prisma.dossierAnnuel.findUnique({
    where: { id: dossierAnnuelId },
    include: {
      etudiant: true,
      anneeScolaire: true,
      echeances: { include: { paiements: true }, orderBy: { dateEcheance: "asc" } },
    },
  });
  if (!dossier || dossier.etudiantId !== etudiantId) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const { du, encaisse, reste } = statutCotisation(dossier);
  const paiements = dossier.echeances
    .flatMap((e) => e.paiements)
    .sort((a, b) => a.datePaiement.getTime() - b.datePaiement.getTime())
    .map((p) => ({
      datePaiement: p.datePaiement,
      moyen: p.moyen,
      montant: Number.parseFloat(p.montant.toString()),
    }));

  const pdf = await genererRecuPaiementPdf({
    etudiant: dossier.etudiant,
    anneeScolaireLibelle: dossier.anneeScolaire.libelle,
    numeroRecu: dossier.id.slice(-8).toUpperCase(),
    montantDu: du,
    montantEncaisse: encaisse,
    montantReste: reste,
    paiements,
    dateEdition: new Date(),
  });

  const nomFichier = `recu-${dossier.anneeScolaire.libelle.replace(/\//g, "-")}-${dossier.etudiant.nom}-${dossier.etudiant.prenom}.pdf`;
  const cheminRelatif = await enregistrerDocumentEtudiant(etudiantId, nomFichier, pdf);

  await prisma.document.create({
    data: {
      etudiantId,
      type: "JUSTIFICATIF_PAIEMENT",
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
