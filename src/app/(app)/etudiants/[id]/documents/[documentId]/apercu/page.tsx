import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { BackLink } from "@/components/ui/back-link";
import { ApercuDocx } from "./apercu-docx";

// Un navigateur ne prévisualise jamais un .docx nativement (contrairement à
// un PDF/image, déjà géré en "inline" par la route documents/[documentId]) :
// cette page le rend en HTML côté client via docx-preview pour offrir un
// vrai mode lecteur au lieu d'un téléchargement forcé.
export default async function ApercuDocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  await requireModule(Module.DOCUMENTS, "LECTURE");
  const { id: etudiantId, documentId } = await params;

  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document || document.etudiantId !== etudiantId) {
    notFound();
  }

  const urlFichier = `/etudiants/${etudiantId}/documents/${documentId}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackLink href={`/etudiants/${etudiantId}`} label="Retour à l'étudiant" />
          <h1 className="mt-3 font-display text-xl font-semibold text-pine-strong">
            {document.nomFichier}
          </h1>
        </div>
        <a
          href={`${urlFichier}?telecharger=1`}
          className="text-sm font-medium text-pine hover:underline"
        >
          Télécharger le .docx
        </a>
      </div>

      <ApercuDocx urlFichier={urlFichier} nomFichier={document.nomFichier} />
    </div>
  );
}
