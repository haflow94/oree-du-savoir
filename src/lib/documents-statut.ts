// Labels et calcul de statut du dossier documentaire : fonctions PURES,
// volontairement séparées de documents.ts (qui porte `import "server-only"`
// pour les accès disque) afin de rester testables/importables depuis un
// composant client ou un test (voir documents.test.ts) sans déclencher la
// garde server-only.

export const TYPE_DOCUMENT_LABELS: Record<string, string> = {
  PIECE_IDENTITE: "Pièce d'identité",
  PHOTO: "Photo",
  DOSSIER_GENERE: "Dossier d'inscription généré",
  DOSSIER_SIGNE: "Dossier signé",
  JUSTIFICATIF_PAIEMENT: "Justificatif de paiement",
  ATTESTATION_SCOLARITE: "Attestation de scolarité",
  AUTRE: "Autre",
};

export const TYPE_PIECE_IDENTITE_LABELS: Record<string, string> = {
  CARTE_IDENTITE: "Carte d'identité",
  PASSEPORT: "Passeport",
  TITRE_SEJOUR: "Titre de séjour",
  PERMIS_CONDUIRE: "Permis de conduire",
  AUTRE: "Autre",
};

// Documents attendus pour considérer le dossier papier d'un étudiant comme
// complet (pièce d'identité, photo, dossier signé — voir
// Projet/01_Cahier_fonctionnel_MVP.md §Documents). Le dossier généré et le
// justificatif de paiement ne comptent pas : ce sont des sorties de
// l'application, pas des pièces à fournir par la famille.
export const TYPES_DOCUMENTS_REQUIS = ["PIECE_IDENTITE", "PHOTO", "DOSSIER_SIGNE"] as const;

// Types produits par l'appli elle-même (dossier rempli, reçu, attestation) —
// à distinguer des documents fournis par la famille : ils ne comptent pas
// dans le dossier documentaire complet, et sont affichés à part (archive en
// lecture seule) sur la fiche étudiant pour ne pas les confondre entre eux
// au clic.
export const TYPES_DOCUMENTS_GENERES = [
  "DOSSIER_GENERE",
  "JUSTIFICATIF_PAIEMENT",
  "ATTESTATION_SCOLARITE",
] as const;

export type StatutDocumentRequis = "OK" | "MANQUANT" | "EXPIRE";

type DocumentPourStatut = { type: string; dateExpiration?: Date | string | null };

// Statut détaillé, type de document requis par type de document requis
// (voir TYPES_DOCUMENTS_REQUIS) : MANQUANT si aucun document de ce type,
// EXPIRE si le(s) document(s) présents ont tous une date d'expiration
// dépassée (uniquement pertinent pour PIECE_IDENTITE — les autres types
// n'ont pas de date d'expiration, donc toujours OK dès qu'un document
// existe), OK sinon. Sert au détail affiché sur la fiche étudiant (bloc
// DOSSIER) et à dossierDocumentaireComplet ci-dessous.
export function statutDocumentsRequis(
  documents: DocumentPourStatut[],
): Record<(typeof TYPES_DOCUMENTS_REQUIS)[number], StatutDocumentRequis> {
  const aujourdHui = new Date();
  const resultat = {} as Record<(typeof TYPES_DOCUMENTS_REQUIS)[number], StatutDocumentRequis>;
  for (const type of TYPES_DOCUMENTS_REQUIS) {
    const documentsDuType = documents.filter((d) => d.type === type);
    if (documentsDuType.length === 0) {
      resultat[type] = "MANQUANT";
      continue;
    }
    const auMoinsUnValide = documentsDuType.some(
      (d) => !d.dateExpiration || new Date(d.dateExpiration) >= aujourdHui,
    );
    resultat[type] = auMoinsUnValide ? "OK" : "EXPIRE";
  }
  return resultat;
}

export function dossierDocumentaireComplet(documents: DocumentPourStatut[]): boolean {
  return Object.values(statutDocumentsRequis(documents)).every((s) => s === "OK");
}
