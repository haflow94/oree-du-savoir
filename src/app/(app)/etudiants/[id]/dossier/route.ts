import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { construireContexteDossierEtudiant } from "@/lib/dossier/context";
import { rendreDossierHtml, rendreDossierPdf } from "@/lib/dossier/render";
import {
  enregistrerDocumentEtudiant,
  nomFichierDocument,
  formatSuffixeVersion,
  lireDocument,
} from "@/lib/documents";
import { requireModule, Module } from "@/lib/permissions";
import { enTeteContentDisposition } from "@/lib/content-disposition";

// Génère le dossier d'inscription en PDF pour une section donnée, à partir
// du modèle maître (ADULTES/JEUNES, voir Section.modeleDossier) et des
// données réelles de l'étudiant (voir src/lib/dossier/context.ts) — même
// template que celui utilisé pour le dossier vierge
// (documents/dossier-vierge/route.ts), remplacement du système .docx par
// section (voir historique de commit, ancien src/lib/dossier-officiel.ts).
// Aperçu par défaut (bouton "Voir / imprimer") : rendu et renvoyé directement
// au navigateur (impression/téléchargement natifs du visualiseur PDF), SANS
// écrire sur le NAS — sinon chaque simple coup d'œil empile une version quasi
// identique dans les documents de l'étudiant. Le téléchargement forcé (?dl=1,
// bouton "Télécharger le PDF") l'enregistre comme Document (type
// DOSSIER_GENERE) pour qu'il reste accessible plus tard sans le régénérer —
// mais seulement si son contenu diffère réellement de la dernière version
// enregistrée (voir Document.contenuHash) : sinon un simple reclic sans
// aucune donnée modifiée renverrait la version existante au lieu d'en
// empiler une copie identique.
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

  const etudiant = await prisma.etudiant.findUnique({
    where: { id: etudiantId },
    include: {
      dossiersAnnuels: {
        orderBy: { creeLe: "desc" },
        take: 1,
        select: { id: true, anneeScolaire: { select: { libelle: true } } },
      },
    },
  });
  if (!etudiant) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  const dossierAnnuel = etudiant.dossiersAnnuels[0] ?? null;

  const { modeleDossier, contexte } = await construireContexteDossierEtudiant({ etudiantId, sectionId });
  const html = await rendreDossierHtml(modeleDossier, contexte);

  let pdf: Buffer;
  let nomFichier: string;
  if (telecharger) {
    const contenuHash = createHash("sha256").update(html).digest("hex");
    const derniereVersion = await prisma.document.findFirst({
      where: { dossierAnnuelId: dossierAnnuel?.id, type: "DOSSIER_GENERE" },
      orderBy: { numeroVersion: "desc" },
      select: { numeroVersion: true, nomFichier: true, cheminRelatif: true, contenuHash: true },
    });

    if (derniereVersion && derniereVersion.contenuHash === contenuHash) {
      // Rien n'a changé depuis la dernière version téléchargée : on renvoie
      // celle-ci telle quelle plutôt que de rendre et enregistrer un doublon.
      pdf = await lireDocument(derniereVersion.cheminRelatif);
      nomFichier = derniereVersion.nomFichier;
    } else {
      pdf = await rendreDossierPdf(html);
      const numeroVersion = (derniereVersion?.numeroVersion ?? 0) + 1;

      nomFichier = nomFichierDocument({
        type: "DOSSIER_GENERE",
        nom: etudiant.nom,
        prenom: etudiant.prenom,
        extension: "pdf",
        suffixe: formatSuffixeVersion(numeroVersion),
      });
      const cheminRelatif = await enregistrerDocumentEtudiant(
        {
          matricule: etudiant.matricule,
          nom: etudiant.nom,
          prenom: etudiant.prenom,
          anneeLibelle: dossierAnnuel?.anneeScolaire.libelle ?? null,
        },
        nomFichier,
        pdf,
      );

      await prisma.document.create({
        data: {
          etudiantId,
          dossierAnnuelId: dossierAnnuel?.id,
          numeroVersion,
          type: "DOSSIER_GENERE",
          nomFichier,
          cheminRelatif,
          mimeType: "application/pdf",
          tailleOctets: pdf.length,
          creeParId: session.id,
          contenuHash,
        },
      });
    }
  } else {
    // Aperçu : nom de fichier indicatif seulement (visible si l'utilisateur
    // enregistre manuellement depuis le visualiseur PDF), aucune écriture
    // disque/BDD.
    pdf = await rendreDossierPdf(html);
    nomFichier = nomFichierDocument({
      type: "DOSSIER_GENERE",
      nom: etudiant.nom,
      prenom: etudiant.prenom,
      extension: "pdf",
      suffixe: "",
    });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": enTeteContentDisposition(telecharger ? "attachment" : "inline", nomFichier),
    },
  });
}
