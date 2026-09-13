// Construit un en-tête Content-Disposition sûr pour un nom de fichier
// contenant des caractères hors Latin-1 (ex. le tiret cadratin "—" de la
// convention de nommage documentaire, voir documents-nommage.ts) : une
// valeur d'en-tête HTTP doit être un ByteString (code <= 255 par caractère),
// donc `filename="${nomFichier}"` seul lève une TypeError dès qu'un tel
// caractère apparaît (ex. "—" = U+2014 = 8212). On fournit donc un repli
// ASCII dans `filename=` (pour les très rares clients qui ignorent
// filename*) et le nom exact, encodé UTF-8 (RFC 5987/6266), dans
// `filename*=`, que tous les navigateurs modernes préfèrent.
function nomFichierAsciiRepli(nomFichier: string): string {
  return nomFichier.replace(/[‐-―]/g, "-").replace(/[^\x20-\x7e]/g, "_");
}

export function enTeteContentDisposition(disposition: "inline" | "attachment", nomFichier: string): string {
  const repli = nomFichierAsciiRepli(nomFichier);
  return `${disposition}; filename="${repli}"; filename*=UTF-8''${encodeURIComponent(nomFichier)}`;
}
