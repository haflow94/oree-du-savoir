// Fonctions PURES de nommage (dossier + fichier) du stockage documentaire
// étudiant sur le NAS — volontairement séparées de documents.ts (qui porte
// `import "server-only"` pour les accès disque), même principe que
// documents-statut.ts, pour rester testables sans dépendance à Prisma/disque.
//
// Contrat non négociable : ce module ne fait QUE construire des noms/chemins,
// jamais n'écrit sur disque. Il ne sert jamais à RETROUVER un fichier déjà
// enregistré — seul Document.cheminRelatif (base) est la source de vérité en
// lecture (voir CLAUDE.md/documents.ts). Il sert uniquement à calculer où
// ÉCRIRE un nouveau fichier, ou la cible d'un renommage explicite (nom/
// prénom modifié, fusion de doublon).

import type { TypeDocument } from "@/generated/prisma/enums";

// Étudiant sans aucun DossierAnnuel résolvable au moment de l'écriture
// (préinscription dont la génération best-effort a échoué, fiche créée à la
// main sans dossier de paiement encore ouvert...) : emplacement exceptionnel
// et temporaire, jamais un lieu d'archivage — voir le déclencheur de sortie
// dans lib/documents.ts (reconcilierAnneeEtudiant, posé au moment où un
// DossierAnnuel est enfin créé pour cet étudiant).
export const BUCKET_SANS_ANNEE = "_A_CLASSER";

// Caractères interdits sur un partage NAS/SMB (héritage Windows) — s'applique
// à un SEGMENT de chemin (un nom de dossier ou de fichier), jamais à un
// chemin complet (le "/" séparateur de niveaux reste géré ailleurs).
const CARACTERES_INTERDITS = /[\\/:*?"<>|]/g;

export function sanitiserSegmentChemin(valeur: string): string {
  return valeur
    .replace(CARACTERES_INTERDITS, "")
    .trim()
    // Points/espaces finaux : restriction historique Windows/SMB.
    .replace(/[.\s]+$/, "")
    .slice(0, 150)
    .trim();
}

// "NOM Prénom" : nom en majuscules (convention état-civil déjà utilisée dans
// vos exemples), prénom tel que saisi. Exportée : réutilisée telle quelle
// pour reconstruire le PRÉFIXE d'un nom de fichier existant lors d'un
// renommage (voir lib/documents.ts#renommerFichiersEtudiant), sans devoir
// recalculer libellé/suffixe (qui ne dépendent pas du nom).
export function segmentPersonne(nom: string, prenom: string): string {
  return sanitiserSegmentChemin(`${nom.toUpperCase()} ${prenom}`);
}

// "2026/2027" (AnneeScolaire.libelle) -> "2026-2027" (le "/" casserait un
// niveau de dossier) ; null -> BUCKET_SANS_ANNEE.
export function segmentAnnee(anneeLibelle: string | null): string {
  if (!anneeLibelle) return BUCKET_SANS_ANNEE;
  return sanitiserSegmentChemin(anneeLibelle.replace(/\//g, "-"));
}

// Segment "NOM Prénom — matricule" seul (sans le segment année) : garantit
// l'unicité même entre deux homonymes (voir matricule) — jamais de suffixe
// "(2)" dépendant d'un ordre de création.
export function segmentEtudiant(params: { matricule: string; nom: string; prenom: string }): string {
  return `${segmentPersonne(params.nom, params.prenom)} — ${params.matricule}`;
}

// Dossier physique d'un étudiant pour une année donnée (relatif à la racine
// "Etudiant/" du NAS, voir docker-compose.yml) :
//   "2026-2027/BENALI Mohamed — 000042"
export function dossierPhysiqueEtudiant(params: {
  matricule: string;
  nom: string;
  prenom: string;
  anneeLibelle: string | null;
}): string {
  return `${segmentAnnee(params.anneeLibelle)}/${segmentEtudiant(params)}`;
}

// Renomme UNIQUEMENT le segment "NOM Prénom — matricule" d'un chemin de
// dossier déjà existant, en conservant tel quel son segment année — utilisé
// pour un changement de nom/prénom (voir modifierEtudiantAction) sans avoir
// à ré-résoudre quelle année s'applique : le chemin déjà stocké en base
// (Document.cheminRelatif) est justement la seule source de vérité de "où"
// vit physiquement le document aujourd'hui, y compris après une éventuelle
// sortie de _A_CLASSER entre-temps.
export function renommerSegmentEtudiant(
  dossierRelatifExistant: string,
  params: { matricule: string; nom: string; prenom: string },
): string {
  const anneeSegment = dossierRelatifExistant.split("/")[0] ?? BUCKET_SANS_ANNEE;
  return `${anneeSegment}/${segmentEtudiant(params)}`;
}

// Vrai si un chemin de document (Document.cheminRelatif, ex.
// "etudiants/2026-2027/BENALI Mohamed — 000042/BENALI Mohamed — Photo
// identité.jpg") vit dans le dossier physique donné (ex.
// "2026-2027/BENALI Mohamed — 000042") — sert à scoper la désambiguïsation
// (suffixesDesambiguisation) aux seuls documents RÉELLEMENT co-localisés
// dans le même répertoire : deux documents du même type mais dans deux
// dossiers différents (années différentes) ne peuvent jamais entrer en
// collision de nom, donc n'ont pas besoin de suffixe l'un à cause de l'autre.
export function estDansDossierEtudiant(cheminRelatifDocument: string, dossierRelatif: string): boolean {
  return cheminRelatifDocument.startsWith(`etudiants/${dossierRelatif}/`);
}

// Libellés utilisés dans le NOM DE FICHIER — volontairement distincts de
// TYPE_DOCUMENT_LABELS (documents-statut.ts, affichage écran) : un nom de
// fichier NAS évite l'apostrophe et reste au plus près de la convention
// validée ("Pièce identité", pas "Pièce d'identité").
const LIBELLES_TYPE_FICHIER: Record<TypeDocument, string> = {
  PIECE_IDENTITE: "Pièce identité",
  PHOTO: "Photo identité",
  DOSSIER_GENERE: "Dossier inscription",
  DOSSIER_SIGNE: "Dossier inscription signé",
  JUSTIFICATIF_PAIEMENT: "Justificatif paiement",
  ATTESTATION_SCOLARITE: "Attestation scolarité",
  // AUTRE n'a pas de sens fixe : voir nomOriginalNettoye ci-dessous, jamais
  // ce libellé seul (source de confusion si plusieurs "Autre" existent).
  AUTRE: "Autre",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// AAAA-MM-JJ, dans le fuseau serveur (TZ=Europe/Paris, voir docker-compose.yml).
export function formatDateSegment(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// HHhMM, même fuseau.
export function formatHeureSegment(date: Date): string {
  return `${pad2(date.getHours())}h${pad2(date.getMinutes())}`;
}

// Calcule, pour un GROUPE de documents de MÊME type appartenant au MÊME
// étudiant, le suffixe de désambiguïsation de chacun — recalculé à chaque
// ajout/suppression d'un document de ce type (voir
// lib/documents.ts#reconcilierDesambiguisationType), jamais figé à la
// création : si le 2e document d'un type est supprimé, le 1er redevient
// automatiquement sans suffixe.
//
// Règle, par palier :
//   - un seul document de ce type -> pas de suffixe ;
//   - plusieurs -> suffixe date (creeLe, propriété immuable du document,
//     donc jamais recalculé "en cascade" quand un autre document du groupe
//     change) ;
//   - deux documents du même type ET de la même date -> heure ajoutée, mais
//     UNIQUEMENT pour les documents en collision réelle (les autres du même
//     groupe qui ont une date distincte n'ont pas besoin de l'heure).
//
// Jamais de rang/position (pas de "(2)", pas d'ordre de création) : la
// stabilité du nom d'un document ne doit jamais dépendre de ses voisins
// passés, seulement de sa propre date.
export function suffixesDesambiguisation(
  documents: { id: string; creeLe: Date }[],
): Record<string, string> {
  if (documents.length <= 1) {
    return Object.fromEntries(documents.map((d) => [d.id, ""]));
  }

  const parDate = new Map<string, { id: string; creeLe: Date }[]>();
  for (const d of documents) {
    const cle = formatDateSegment(d.creeLe);
    const groupe = parDate.get(cle) ?? [];
    groupe.push(d);
    parDate.set(cle, groupe);
  }

  const resultat: Record<string, string> = {};
  for (const [dateSegment, groupe] of parDate) {
    for (const d of groupe) {
      resultat[d.id] =
        groupe.length > 1
          ? ` — ${dateSegment} ${formatHeureSegment(d.creeLe)}`
          : ` — ${dateSegment}`;
    }
  }
  return resultat;
}

// Suffixe de version pour DOSSIER_GENERE/DOSSIER_SIGNE (Document.numeroVersion,
// déjà la mécanique anti-collision existante pour ces deux types précisément
// — voir prisma/schema.prisma). `null` défensif (ne devrait pas arriver en
// pratique pour ces deux types) -> pas de suffixe plutôt qu'un "(v)" cassé.
// La toute première version ne porte pas non plus de suffixe : sur le NAS,
// tant qu'il n'existe qu'un seul fichier, l'étiqueter "(v1)" laisse croire à
// tort qu'il existe d'autres versions. Le numéro n'apparaît qu'à partir de la
// 2e version réellement générée — le fichier v1 déjà écrit sur le disque
// n'est lui jamais renommé rétroactivement (voir enregistrerDocumentEtudiant :
// on n'écrase/renomme jamais un fichier déjà présent).
export function formatSuffixeVersion(numeroVersion: number | null): string {
  return numeroVersion === null || numeroVersion <= 1 ? "" : ` (v${numeroVersion})`;
}

// Suffixe de désambiguïsation prêt à l'emploi pour un document non versionné
// (tout type sauf DOSSIER_GENERE/DOSSIER_SIGNE) : "" si `documents` (tous les
// documents de même type pour cet étudiant, CELUI-CI inclus) ne contient
// qu'un seul élément, sinon le résultat de suffixesDesambiguisation ci-dessus
// pour son id.
export function formatSuffixeDesambiguisation(
  documentId: string,
  documentsDuMemeType: { id: string; creeLe: Date }[],
): string {
  return suffixesDesambiguisation(documentsDuMemeType)[documentId] ?? "";
}

// Nom de fichier après un changement de nom/prénom : substitue UNIQUEMENT le
// préfixe "ANCIEN NOM Prénom — " par le nouveau, laisse le reste (libellé,
// suffixe éventuel, extension) strictement intact — plus robuste qu'une
// reconstruction complète via nomFichierDocument, qui devrait re-dériver un
// libellé AUTRE/tiers-chèque déjà "figé" dans le nom existant et non
// reconstituable après coup (voir nomOriginalNettoye ci-dessus).
export function renommerNomFichier(
  ancienNomFichier: string,
  ancien: { nom: string; prenom: string },
  nouveau: { nom: string; prenom: string },
): string {
  const ancienPrefixe = `${segmentPersonne(ancien.nom, ancien.prenom)} — `;
  const nouveauPrefixe = `${segmentPersonne(nouveau.nom, nouveau.prenom)} — `;
  return ancienNomFichier.startsWith(ancienPrefixe)
    ? nouveauPrefixe + ancienNomFichier.slice(ancienPrefixe.length)
    : ancienNomFichier; // format inattendu : ne touche à rien plutôt que de corrompre le nom
}

// Nom de fichier final (avec extension), sans jamais d'UUID/CUID visible.
// Le `suffixe` (désambiguïsation ou version) est calculé par l'appelant :
// - DOSSIER_GENERE / DOSSIER_SIGNE -> `(v${numeroVersion})` ;
// - tout autre type -> le résultat de suffixesDesambiguisation ci-dessus
//   pour ce document précis (chaîne vide si seul document de son type).
export function nomFichierDocument(params: {
  type: TypeDocument;
  nom: string;
  prenom: string;
  extension: string; // sans le point, ex. "pdf"
  suffixe: string; // déjà formaté (" (v2)", " — 2026-09-10", ou "")
  // AUTRE uniquement : seule source descriptive disponible, pas de libellé
  // fixe possible pour ce type. SANS l'extension (déjà portée par le
  // paramètre `extension` ci-dessus) — à l'appelant de la retirer du nom de
  // fichier original avant de la passer ici, pour ne jamais produire un
  // double ".pdf.pdf".
  nomOriginalNettoye?: string;
  // Pièce d'identité du TIERS payeur d'un chèque (Document.chequeId non nul,
  // voir Cheque.titulaireEstEtudiant / titulaireNom / titulairePrenom) :
  // jamais confondue avec la pièce de l'étudiant lui-même.
  titulaireChequeNom?: string;
  titulaireChequePrenom?: string;
}): string {
  const personne = segmentPersonne(params.nom, params.prenom);

  let libelle: string;
  if (params.titulaireChequeNom && params.titulaireChequePrenom) {
    libelle = `Pièce identité titulaire chèque — ${segmentPersonne(params.titulaireChequeNom, params.titulaireChequePrenom)}`;
  } else if (params.type === "AUTRE") {
    const original = params.nomOriginalNettoye ? sanitiserSegmentChemin(params.nomOriginalNettoye) : "";
    libelle = original ? `Autre — ${original}` : "Autre";
  } else {
    libelle = LIBELLES_TYPE_FICHIER[params.type];
  }

  const extension = params.extension.replace(/^\.+/, "").toLowerCase();
  return `${personne} — ${libelle}${params.suffixe}.${extension}`;
}
