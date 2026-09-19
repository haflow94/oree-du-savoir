import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/lib/roles";
import { totalEncaisse } from "@/lib/paiements";
import { genererRecuPaiementPdf } from "@/lib/pdf-documents";
import { nomFichierDocument } from "@/lib/documents";
import { enTeteContentDisposition } from "@/lib/content-disposition";

// Réservé Bureau/Administration à la demande explicite de l'association
// (pas via la grille de permissions éditable — Module.DOCUMENTS — pour ne
// pas dépendre d'une case à cocher qui pourrait être mal configurée : voir
// les autres carve-outs listés dans CLAUDE.md, ex. gestion des comptes).
// Toujours régénéré à la volée depuis les données de paiement actuelles
// (immuables une fois le paiement enregistré, voir Paiement/Echeance) :
// jamais persisté comme Document — le PDF n'est qu'une mise en forme d'un
// état déjà figé en base, inutile de dupliquer un fichier identique à
// chaque téléchargement (voir l'ancienne empilade de JUSTIFICATIF_PAIEMENT
// avant ce commit). Le téléchargement forcé (?dl=1, bouton "Télécharger")
// garde malgré tout une trace textuelle dans le journal d'audit — c'est ce
// geste précis ("je remets ce document à la famille") qui a une valeur de
// preuve, pas le simple aperçu.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dossierAnnuelId: string }> },
) {
  const session = await requireRole([Role.BUREAU, Role.ADMINISTRATION]);
  const { id: etudiantId, dossierAnnuelId } = await params;
  const telecharger = request.nextUrl.searchParams.get("dl") === "1";

  const dossier = await prisma.dossierAnnuel.findUnique({
    where: { id: dossierAnnuelId },
    include: {
      etudiant: true,
      anneeScolaire: true,
      echeances: {
        include: { paiements: { include: { cheque: true, prelevement: true } } },
        orderBy: { dateEcheance: "asc" },
      },
    },
  });
  if (!dossier || dossier.etudiantId !== etudiantId) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  // Volontairement PAS statutCotisation() ici : ce reçu atteste à la famille
  // ce qu'elle a effectivement remis (voir le tableau des paiements
  // ci-dessous, qui liste tout, y compris un chèque postdaté pour une
  // échéance future) — le total encaissé/reste doit rester le total BRUT
  // (totalEncaisse), sans quoi le récapitulatif contredirait le tableau
  // juste au-dessus (ex. 3 chèques listés pour 300€, mais "reçu 100€,
  // reste 200€" si un seul est arrivé à échéance). La règle de maturité par
  // échéance (voir lib/paiements.ts) reste réservée aux vues internes de
  // trésorerie (dossier, tableau de bord, export), pas à ce document remis
  // au tiers.
  const du = Number.parseFloat(dossier.montantDu.toString());
  const paiementsBruts = dossier.echeances.flatMap((e) => e.paiements);
  const encaisse = totalEncaisse(paiementsBruts);
  const reste = du - encaisse;
  const paiements = paiementsBruts
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

  const nomFichier = nomFichierDocument({
    type: "JUSTIFICATIF_PAIEMENT",
    nom: dossier.etudiant.nom,
    prenom: dossier.etudiant.prenom,
    extension: "pdf",
    suffixe: "",
  });

  if (telecharger) {
    await prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "TELECHARGEMENT_RECU",
        entite: "DossierAnnuel",
        entiteId: dossierAnnuelId,
        details: { etudiantId, montantDu: du, montantEncaisse: encaisse },
      },
    });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": enTeteContentDisposition(telecharger ? "attachment" : "inline", nomFichier),
    },
  });
}
