// Labels et calcul de statut du dossier documentaire : fonctions PURES,
// volontairement séparées de documents.ts (qui porte `import "server-only"`
// pour les accès disque) afin de rester testables/importables depuis un
// composant client ou un test (voir documents.test.ts) sans déclencher la
// garde server-only.

export const TYPE_DOCUMENT_LABELS: Record<string, string> = {
  PIECE_IDENTITE: "Pièce d'identité",
  PHOTO: "Photo",
  DOSSIER_GENERE: "Dossier – brouillon PDF (non signé)",
  DOSSIER_SIGNE: "Dossier signé",
  JUSTIFICATIF_PAIEMENT: "Justificatif de paiement",
  ATTESTATION_SCOLARITE: "Attestation de scolarité",
  AUTRE: "Autre",
};

// Documents attendus pour considérer le dossier papier d'un étudiant comme
// complet. Ni la pièce d'identité ni la photo ne sont plus une condition de
// validation (décision association du 2026-09-16 : la pièce d'identité n'est
// plus collectée du tout, la photo reste collectée mais ne bloque plus). Le
// dossier généré et le justificatif de paiement ne comptent pas non plus :
// ce sont des sorties de l'application, pas des pièces à fournir par la
// famille.
export const TYPES_DOCUMENTS_REQUIS = ["DOSSIER_SIGNE"] as const;

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
// dépassée, OK sinon. Sert au détail affiché sur la fiche étudiant (bloc
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

// "Statut dossier" affiché à l'accueil (voir /etudiants et /inscriptions) :
// une lecture combinée, purement d'affichage, de trois statuts qui existent
// déjà en base — Etudiant.statutInscription, DossierAnnuel.statutSignature
// (voir prisma/schema.prisma#StatutSignature) et le dossier documentaire
// (dossierDocumentaireComplet ci-dessus). Volontairement PAS un nouvel enum
// ni une donnée stockée : juste une fonction pure qui les combine pour
// donner au staff d'accueil une vision immédiate de l'avancement, sans rien
// changer aux trois statuts sources ni à leurs transitions (voir CLAUDE.md —
// "signature ≠ validation finale").
export type StatutDossierAffiche =
  | "RECUE_EN_COURS"
  | "A_VERIFIER"
  | "ENVOYE_SIGNATURE"
  | "DOSSIER_SIGNE"
  | "A_COMPLETER"
  | "VALIDE_DEFINITIVEMENT";

// Libellés volontairement explicites sur QUI attend QUOI (retour d'un
// échange avec le staff : "À vérifier"/"Envoyé en signature" laissaient
// deviner un geste du staff ou de Documenso, sans dire clairement que
// c'est la famille qui n'a encore rien fait à ce stade) :
// - A_VERIFIER : le dossier a été généré et le mail envoyé, mais la
//   famille n'a pas encore ouvert le lien / cliqué "Consulter et signer"
//   (voir dossier/[token]/actions.ts#confirmerEtSignerAction).
// - ENVOYE_SIGNATURE : la famille a cliqué et a été redirigée vers
//   Documenso, mais la signature n'est pas encore confirmée reçue (elle
//   peut être en train de signer ou avoir abandonné en route — les deux
//   sont indiscernables ici, d'où un libellé qui ne prétend pas "en cours").
export const STATUT_DOSSIER_LABELS: Record<StatutDossierAffiche, string> = {
  RECUE_EN_COURS: "Reçue / en cours",
  A_VERIFIER: "En attente d'ouverture",
  ENVOYE_SIGNATURE: "En attente de signature",
  DOSSIER_SIGNE: "Dossier signé",
  A_COMPLETER: "À compléter",
  VALIDE_DEFINITIVEMENT: "Validé définitivement",
};

export const STATUT_DOSSIER_VARIANTS: Record<
  StatutDossierAffiche,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  RECUE_EN_COURS: "neutral",
  A_VERIFIER: "warning",
  ENVOYE_SIGNATURE: "info",
  DOSSIER_SIGNE: "success",
  A_COMPLETER: "warning",
  VALIDE_DEFINITIVEMENT: "success",
};

// `statutSignature` à null = aucun DossierAnnuel pour cet étudiant (ex. fiche
// créée à la main par le staff sans dossier de paiement ouvert, voir
// etudiants/nouveau/actions.ts, ou génération automatique à la préinscription
// qui a échoué avant même de créer la ligne — voir preinscription/actions.ts)
// : renvoie null, affiché à part par l'appelant (ex. "—") plutôt que de
// forcer une des 6 étiquettes ci-dessus sur un cas qui n'en est aucun.
//
// statutInscription = VALIDE l'emporte toujours sur le cycle de signature :
// une validation administrative peut intervenir sans que le dossier ait
// suivi tout le circuit Documenso (règle "signature ≠ validation finale").
export function statutDossierAffiche({
  statutInscription,
  statutSignature,
  documents,
}: {
  statutInscription: string;
  statutSignature: string | null;
  documents: DocumentPourStatut[];
}): StatutDossierAffiche | null {
  if (statutInscription === "VALIDE") return "VALIDE_DEFINITIVEMENT";
  if (statutSignature === null) return null;
  switch (statutSignature) {
    case "A_VERIFIER":
      return "A_VERIFIER";
    case "ENVOYEE_SIGNATURE":
      return "ENVOYE_SIGNATURE";
    case "SIGNEE":
      return dossierDocumentaireComplet(documents) ? "DOSSIER_SIGNE" : "A_COMPLETER";
    default:
      return "RECUE_EN_COURS"; // A_GENERER
  }
}
