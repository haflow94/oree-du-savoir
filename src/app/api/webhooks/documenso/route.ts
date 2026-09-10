import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { telechargerDocumentSigne } from "@/lib/documenso";
import { enregistrerDocumentEtudiant, nomFichierDocument, formatSuffixeVersion } from "@/lib/documents";

// Reçoit directement les événements Documenso (jamais relayés par n8n — la
// transition d'état "dossier signé" est une décision métier, elle reste
// possédée par l'application, voir CLAUDE.md/analyse de conversation). Même
// mécanique d'authentification que verifierAuthN8n (lib/auth-n8n.ts) :
// secret statique partagé, comparaison à temps constant — sauf que Documenso
// envoie ce secret dans l'en-tête `X-Documenso-Secret` (configuré à la
// création du webhook côté Documenso), pas en Bearer.
function comparaisonSure(fourni: string, attendu: string): boolean {
  const bufferFourni = Buffer.from(fourni);
  const bufferAttendu = Buffer.from(attendu);
  if (bufferFourni.length !== bufferAttendu.length) return false;
  return timingSafeEqual(bufferFourni, bufferAttendu);
}

type PayloadWebhookDocumenso = {
  event: string;
  payload: { id: number; status: string; completedAt: string | null; externalId: string | null };
};

export async function POST(request: NextRequest) {
  const secretAttendu = process.env.DOCUMENSO_WEBHOOK_SECRET;
  if (!secretAttendu) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const secretFourni = request.headers.get("x-documenso-secret") ?? "";
  if (!secretFourni || !comparaisonSure(secretFourni, secretAttendu)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const corps = (await request.json()) as PayloadWebhookDocumenso;
  const documentId = corps.payload?.id;
  if (typeof documentId !== "number") {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  // Seul l'événement "document complété" (toutes signatures apposées) fait
  // avancer le statut — les autres (ouvert, envoyé...) sont accusés
  // réception sans effet, pour ne jamais dépendre d'événements
  // intermédiaires non garantis.
  const complet = corps.event === "DOCUMENT_COMPLETED" || corps.payload?.status === "COMPLETED";
  if (!complet) {
    return NextResponse.json({ ok: true, ignore: true });
  }

  // Idempotence : le updateMany ne fait avancer le statut que s'il n'était
  // pas déjà SIGNEE — un même événement reçu plusieurs fois (retry Documenso)
  // ne déclenche donc le téléchargement/stockage du PDF signé qu'une seule
  // fois (voir count ci-dessous), même patron que les routes n8n existantes.
  const resultat = await prisma.dossierAnnuel.updateMany({
    where: { documensoDocumentId: documentId, statutSignature: { not: "SIGNEE" } },
    data: { statutSignature: "SIGNEE", signeLe: new Date() },
  });

  if (resultat.count === 0) {
    // Soit déjà traité (idempotence), soit un documentId inconnu — dans les
    // deux cas, répondre 200 : Documenso ne doit jamais réessayer
    // indéfiniment un webhook dont l'app ne peut de toute façon rien tirer
    // de plus.
    return NextResponse.json({ ok: true, dejaTraite: true });
  }

  const dossier = await prisma.dossierAnnuel.findFirst({
    where: { documensoDocumentId: documentId },
    select: {
      id: true,
      etudiantId: true,
      versionConfirmeeNumero: true,
      etudiant: { select: { matricule: true, nom: true, prenom: true } },
      anneeScolaire: { select: { libelle: true } },
    },
  });
  if (!dossier) return NextResponse.json({ ok: true });

  try {
    const pdfSigne = await telechargerDocumentSigne(documentId);
    const nomFichier = nomFichierDocument({
      type: "DOSSIER_SIGNE",
      nom: dossier.etudiant.nom,
      prenom: dossier.etudiant.prenom,
      extension: "pdf",
      suffixe: formatSuffixeVersion(dossier.versionConfirmeeNumero),
    });
    const cheminRelatif = await enregistrerDocumentEtudiant(
      {
        matricule: dossier.etudiant.matricule,
        nom: dossier.etudiant.nom,
        prenom: dossier.etudiant.prenom,
        anneeLibelle: dossier.anneeScolaire.libelle,
      },
      nomFichier,
      pdfSigne,
    );

    await prisma.$transaction([
      prisma.document.create({
        data: {
          etudiantId: dossier.etudiantId,
          dossierAnnuelId: dossier.id,
          numeroVersion: dossier.versionConfirmeeNumero,
          type: "DOSSIER_SIGNE",
          nomFichier,
          cheminRelatif,
          mimeType: "application/pdf",
          tailleOctets: pdfSigne.length,
        },
      }),
      prisma.journalAudit.create({
        data: {
          action: "dossier_signe",
          entite: "DossierAnnuel",
          entiteId: dossier.id,
          details: { documensoDocumentId: documentId },
        },
      }),
    ]);
  } catch (erreur) {
    // Le statut SIGNEE reste posé (source de vérité côté Documenso) même si
    // le téléchargement du PDF échoue ponctuellement (Documenso indisponible
    // un instant) : le staff peut le retélécharger à la main depuis la
    // fiche étudiant, jamais bloquant pour la reconnaissance de la
    // signature elle-même.
    console.error("Webhook Documenso — téléchargement du PDF signé :", erreur);
  }

  return NextResponse.json({ ok: true });
}
