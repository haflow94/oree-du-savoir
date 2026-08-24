"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";

// Rendu du .docx en HTML directement dans le navigateur (aucune conversion
// serveur, aucune dépendance Chromium/LibreOffice — cohérent avec l'absence
// de headless browser côté serveur, voir dossier-officiel.ts). docx-preview
// n'est chargé qu'ici, côté client.
export function ApercuDocx({
  urlFichier,
  nomFichier,
}: {
  urlFichier: string;
  nomFichier: string;
}) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;

    async function afficher() {
      try {
        const [reponse, docxPreview] = await Promise.all([
          fetch(urlFichier),
          import("docx-preview"),
        ]);
        if (!reponse.ok) throw new Error("Fichier introuvable.");
        const blob = await reponse.blob();
        if (annule || !conteneurRef.current || !stylesRef.current) return;

        await docxPreview.renderAsync(blob, conteneurRef.current, stylesRef.current, {
          inWrapper: true,
          ignoreLastRenderedPageBreak: false,
        });
      } catch {
        if (!annule) setErreur("Impossible d'afficher ce document dans le navigateur.");
      } finally {
        if (!annule) setChargement(false);
      }
    }

    afficher();
    return () => {
      annule = true;
    };
  }, [urlFichier]);

  return (
    <div className="rounded-xl border border-border bg-bg-sunken/40 p-4 shadow-card sm:p-8">
      {chargement && <p className="text-sm text-ink-muted">Chargement de {nomFichier}…</p>}
      {erreur && (
        <Alert variant="danger">
          {erreur} Utilisez le lien « Télécharger » ci-dessus pour l&apos;ouvrir dans Word ou
          LibreOffice.
        </Alert>
      )}
      <div ref={stylesRef} />
      <div
        ref={conteneurRef}
        className="docx-apercu mx-auto max-w-full overflow-x-auto [&_.docx-wrapper]:mx-auto [&_.docx-wrapper]:!bg-transparent [&_section.docx]:mx-auto [&_section.docx]:!shadow-md"
      />
    </div>
  );
}
