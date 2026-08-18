import "server-only";

function champCsv(valeur: unknown): string {
  const texte = valeur === null || valeur === undefined ? "" : String(valeur);
  // Toujours entre guillemets : évite tout problème avec les virgules,
  // guillemets ou retours à la ligne dans un libellé/nom.
  return `"${texte.replace(/"/g, '""')}"`;
}

export function versCsv(entetes: string[], lignes: unknown[][]): string {
  const corps = [entetes, ...lignes]
    .map((ligne) => ligne.map(champCsv).join(";"))
    .join("\r\n");
  // BOM UTF-8 : Excel (utilisé par l'association) n'affiche correctement
  // les accents que si le fichier commence par ce marqueur.
  return `﻿${corps}`;
}

export function reponseCsv(nomFichier: string, contenu: string): Response {
  return new Response(contenu, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
    },
  });
}
