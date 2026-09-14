import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { lireDocument } from "@/lib/documents";
import { verifierAuthN8n } from "@/lib/auth-n8n";
import { enTeteContentDisposition } from "@/lib/content-disposition";

// Ne sert que les documents DOSSIER_GENERE ou DOSSIER_SIGNE : ce sont les
// seuls destinés à quitter l'app par email (dossier généré pour la relance
// "dossier prêt à vérifier"/"bienvenue", dossier signé pour la notification
// "signature confirmée", voir .../dossiers-signes-a-notifier). Un id d'un
// autre type (pièce d'identité, photo…) est traité comme introuvable, même
// avec un token valide — cette route ne doit jamais devenir un accès
// générique à tous les documents.
const TYPES_AUTORISES = new Set(["DOSSIER_GENERE", "DOSSIER_SIGNE"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const nonAutorise = verifierAuthN8n(request);
  if (nonAutorise) return nonAutorise;

  const { documentId } = await params;
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document || !TYPES_AUTORISES.has(document.type)) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  let contenu: Buffer;
  try {
    contenu = await lireDocument(document.cheminRelatif);
  } catch {
    // Le fichier référencé en base n'existe plus sur le volume (ex.
    // restauré depuis une sauvegarde de la base sans celle des fichiers,
    // voir DEPLOIEMENT.md) : mieux vaut un 404 explicite qu'une erreur
    // serveur qui ferait échouer toute l'exécution n8n.
    return NextResponse.json({ error: "Fichier introuvable sur le serveur." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": enTeteContentDisposition("attachment", document.nomFichier),
    },
  });
}
