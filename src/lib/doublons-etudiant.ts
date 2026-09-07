// Pas de `import "server-only"` ici : même raison que preinscription-code.ts
// et preinscription-token.ts — le seul import client de ce module
// (doublon-popup.tsx) est un `import type` (FicheComparaisonDoublon), donc
// déjà effacé à la compilation ; aucun code de ce fichier ne s'exécute
// jamais côté client. Retiré délibérément pour que ce module reste
// importable tel quel depuis les tests (voir doublons-etudiant.test.ts).
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  normaliserTelephone,
  type CritereCorrespondanceDoublon,
} from "@/lib/champs-formulaire";

// Réexporté ici pour que les appelants côté serveur (préinscription,
// création manuelle) n'aient qu'un seul module à importer pour la détection
// de doublon — le type/libellé lui-même vit dans champs-formulaire.ts (sans
// `import "server-only"`) pour rester importable aussi depuis un composant
// client (voir etudiant-form.tsx).
export type { CritereCorrespondanceDoublon };
export { LIBELLE_CRITERE_DOUBLON } from "@/lib/champs-formulaire";

// Champs utilisés par la popup de comparaison (doublon-popup.tsx) pour
// afficher les deux fiches côte à côte — partagés entre la fiche étudiant
// et la liste centralisée /etudiants/doublons pour éviter que les deux
// vues divergent sur les champs comparés.
export const champsComparaisonDoublon = {
  id: true,
  civilite: true,
  nom: true,
  prenom: true,
  dateNaissance: true,
  villeNaissance: true,
  telephoneMobile: true,
  telephoneFixe: true,
  email: true,
  adresse: true,
  codePostal: true,
  ville: true,
  statutInscription: true,
  creeLe: true,
} satisfies Prisma.EtudiantSelect;

export type FicheComparaisonDoublon = Prisma.EtudiantGetPayload<{
  select: typeof champsComparaisonDoublon;
}>;

export type CorrespondanceDoublon = {
  id: string;
  nom: string;
  prenom: string;
  critere: CritereCorrespondanceDoublon;
};

// Recherche par e-mail/téléphone SEULS, volontairement indépendante du nom,
// du prénom et de la date de naissance (contrairement à la branche
// nom+prénom+date de trouverDoublonEtudiant ci-dessous) : deux fiches
// distinctes peuvent légitimement partager un même contact (fratrie inscrite
// par le même responsable) — cette fonction ne fait AUCUN blocage, elle
// remonte simplement tout ce qui correspond pour que le staff en soit
// informé (voir LIBELLE_CRITERE_DOUBLON) et tranche lui-même.
//
// Compare aussi bien les coordonnées propres de l'étudiant
// (Etudiant.email/telephoneMobile/telephoneFixe — seuls renseignés pour un
// dossier Adultes, jamais vérifiés jusqu'ici) que celles d'un responsable
// légal (ResponsableLegal.email/telephone/telephoneProfessionnel — dossier
// Jeunes).
//
// Comparaison en mémoire plutôt qu'en SQL pour le téléphone : aucun numéro
// n'est stocké normalisé en base (voir normaliserTelephone) et Postgres ne
// peut donc pas faire correspondre "06 12 34 56 78" et "+33612345678" par un
// simple WHERE — sur le volume d'une petite association, récupérer les
// candidats et normaliser en JS reste largement suffisant (voir CLAUDE.md,
// pas de sur-ingénierie) ; à revoir avec une colonne normalisée dédiée si le
// volume grossissait significativement.
export async function trouverCorrespondancesContact({
  emails,
  telephones,
}: {
  emails: (string | null | undefined)[];
  telephones: (string | null | undefined)[];
}): Promise<CorrespondanceDoublon[]> {
  const emailsRecherches = new Set(
    emails.filter((e): e is string => !!e).map((e) => e.trim().toLowerCase()),
  );
  const telephonesRecherches = new Set(
    telephones.filter((t): t is string => !!t).map(normaliserTelephone),
  );
  if (emailsRecherches.size === 0 && telephonesRecherches.size === 0) return [];

  const candidats = await prisma.etudiant.findMany({
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      telephoneMobile: true,
      telephoneFixe: true,
      responsables: { select: { email: true, telephone: true, telephoneProfessionnel: true } },
    },
    orderBy: { creeLe: "asc" },
  });

  const resultats: CorrespondanceDoublon[] = [];
  for (const candidat of candidats) {
    const emailsCandidat = [candidat.email, ...candidat.responsables.map((r) => r.email)]
      .filter((e): e is string => !!e)
      .map((e) => e.trim().toLowerCase());
    const telephonesCandidat = [
      candidat.telephoneMobile,
      candidat.telephoneFixe,
      ...candidat.responsables.flatMap((r) => [r.telephone, r.telephoneProfessionnel]),
    ]
      .filter((t): t is string => !!t)
      .map(normaliserTelephone);

    const emailCorrespond = emailsCandidat.some((e) => emailsRecherches.has(e));
    const telephoneCorrespond = telephonesCandidat.some((t) => telephonesRecherches.has(t));
    if (!emailCorrespond && !telephoneCorrespond) continue;

    resultats.push({
      id: candidat.id,
      nom: candidat.nom,
      prenom: candidat.prenom,
      critere: emailCorrespond && telephoneCorrespond ? "EMAIL_ET_TELEPHONE" : emailCorrespond ? "EMAIL" : "TELEPHONE",
    });
  }

  return resultats;
}

// Clé d'unicité métier (voir CLAUDE.md et Etudiant.doublonPotentielId) :
// nom + prénom + date de naissance en priorité (voir CritereCorrespondanceDoublon
// NOM_DATE, comportement inchangé), complétée par une correspondance
// e-mail/téléphone indépendante du nom (voir trouverCorrespondancesContact
// ci-dessus) quand la première ne trouve rien — remplace l'ancienne branche
// qui exigeait nom+prénom ET contact du responsable : trop étroite pour
// détecter un dossier Adultes (jamais de responsable saisi) et contraire au
// besoin actuel (correspondance contact volontairement indépendante du nom).
// Une seule correspondance retenue ici : `doublonPotentielId` (voir
// prisma/schema.prisma) reste un simple pointeur, pas une liste — la
// plus ancienne fiche par nom+date, sinon la première correspondance
// contact trouvée (déjà triée par creeLe asc). Pour obtenir TOUTES les
// correspondances contact possibles (utile en confirmation interactive,
// voir (app)/etudiants/nouveau/actions.ts#rechercherDoublonsAction),
// appeler directement trouverCorrespondancesContact.
export async function trouverDoublonEtudiant({
  nom,
  prenom,
  dateNaissance,
  emails,
  telephones,
}: {
  nom: string;
  prenom: string;
  dateNaissance: Date | null;
  emails: (string | null | undefined)[];
  telephones: (string | null | undefined)[];
}): Promise<CorrespondanceDoublon | null> {
  if (dateNaissance) {
    const parDateNaissance = await prisma.etudiant.findFirst({
      where: {
        nom: { equals: nom, mode: "insensitive" },
        prenom: { equals: prenom, mode: "insensitive" },
        dateNaissance,
      },
      orderBy: { creeLe: "asc" },
      select: { id: true, nom: true, prenom: true },
    });
    if (parDateNaissance) return { ...parDateNaissance, critere: "NOM_DATE" };
  }

  const correspondancesContact = await trouverCorrespondancesContact({ emails, telephones });
  return correspondancesContact[0] ?? null;
}

// La détection ci-dessus ne tourne qu'à la création (préinscription) : une
// fois la fiche créée, corriger une faute de frappe sur le nom/prénom/date
// de naissance (voir modifierEtudiantAction) ne la déclenche jamais, un
// vrai doublon peut donc rester invisible indéfiniment après une correction
// après coup. Neutre si cette fiche porte déjà un signalement en cours (ne
// pas écraser une décision en attente) ou si l'autre fiche trouvée a déjà
// été tranchée (fusion/homonymie) — pose toujours le signalement sur la
// fiche la plus récente des deux, jamais sur la plus ancienne, pour rester
// cohérent avec le sens supposé par fusionnerDoublonAction.
export async function redetecterDoublonApresModification(etudiantId: string): Promise<void> {
  const etudiant = await prisma.etudiant.findUnique({
    where: { id: etudiantId },
    select: { id: true, nom: true, prenom: true, dateNaissance: true, creeLe: true, doublonPotentielId: true },
  });
  if (!etudiant || etudiant.doublonPotentielId || !etudiant.dateNaissance) return;

  const autre = await prisma.etudiant.findFirst({
    where: {
      id: { not: etudiant.id },
      nom: { equals: etudiant.nom, mode: "insensitive" },
      prenom: { equals: etudiant.prenom, mode: "insensitive" },
      dateNaissance: etudiant.dateNaissance,
    },
    orderBy: { creeLe: "asc" },
    select: { id: true, creeLe: true, doublonPotentielId: true },
  });
  if (!autre) return;

  if (autre.creeLe < etudiant.creeLe) {
    await prisma.etudiant.update({ where: { id: etudiant.id }, data: { doublonPotentielId: autre.id } });
  } else if (!autre.doublonPotentielId) {
    await prisma.etudiant.update({ where: { id: autre.id }, data: { doublonPotentielId: etudiant.id } });
  }
}
