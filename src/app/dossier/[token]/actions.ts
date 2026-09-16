"use server";

// Actions publiques, sans authentification (comme preinscription/actions.ts) :
// chaque action revalide le token elle-même côté serveur (jamais fait
// confiance à un champ caché ou à l'URL affichée) et n'agit que sur LE
// dossier auquel ce token donne accès — jamais un id passé librement par le
// client.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resoudreAccesDossier } from "@/lib/acces-dossier";
import { genererNouvelleVersionDossier } from "@/lib/dossier/generation";
import { creerEtEnvoyerDocumentSignature, annulerDocumentSignature, obtenirLienSignature } from "@/lib/documenso";
import type { ChampSignatureDossier } from "@/lib/dossier/render";
import { lireDocument } from "@/lib/documents";
import { estEmailValide, estTelephoneValide, estCodePostalValide } from "@/lib/champs-formulaire";
import { adresseIpClient, limiteDebitDepassee } from "@/lib/rate-limit";

// Champs qu'un étudiant/parent peut corriger lui-même (voir règle "corrections
// simples") — liste figée dans le code plutôt que configurable : c'est une
// distinction structurelle (donnée de contact ordinaire vs donnée d'identité/
// légale), pas une décision associative appelée à changer.
const CHAMPS_ETUDIANT_MODIFIABLES = [
  "telephoneMobile",
  "telephoneFixe",
  "email",
  "adresse",
  "complementAdresse",
  "codePostal",
  "ville",
  "contactUrgenceNom",
  "contactUrgencePrenom",
  "contactUrgenceTelephone",
] as const;

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

async function dossierDepuisToken(tokenBrut: string) {
  const resolution = await resoudreAccesDossier(tokenBrut);
  if (!resolution.valide) return null;

  return prisma.dossierAnnuel.findUnique({
    where: { id: resolution.dossierAnnuelId },
    include: {
      etudiant: {
        include: {
          responsables: { orderBy: { creeLe: "asc" } },
          sectionSouhaitee: { select: { modeleDossier: true } },
        },
      },
    },
  });
}

export async function modifierChampsAction(
  formData: FormData,
): Promise<{ erreur: string } | { ok: true }> {
  const token = champTexte(formData, "token");
  if (!token) return { erreur: "Lien invalide." };

  const ip = await adresseIpClient();
  if (limiteDebitDepassee(`dossier-modification:${ip}`, 10, 15 * 60 * 1000)) {
    return { erreur: "Trop de tentatives depuis cette connexion. Merci de réessayer dans quelques minutes." };
  }

  const dossier = await dossierDepuisToken(token);
  if (!dossier) return { erreur: "Lien invalide ou expiré." };
  if (dossier.statutSignature === "SIGNEE") {
    return { erreur: "Ce dossier est déjà signé : contactez l'association pour toute correction." };
  }

  const donnees: Record<string, string | null> = {};
  for (const champ of CHAMPS_ETUDIANT_MODIFIABLES) {
    if (formData.has(champ)) donnees[champ] = champTexte(formData, champ);
  }

  if (donnees.email && !estEmailValide(donnees.email)) {
    return { erreur: "L'email n'a pas un format valide." };
  }
  if (donnees.telephoneMobile && !estTelephoneValide(donnees.telephoneMobile)) {
    return { erreur: "Le téléphone mobile n'a pas un format valide." };
  }
  if (donnees.telephoneFixe && !estTelephoneValide(donnees.telephoneFixe)) {
    return { erreur: "Le téléphone fixe n'a pas un format valide." };
  }
  if (donnees.contactUrgenceTelephone && !estTelephoneValide(donnees.contactUrgenceTelephone)) {
    return { erreur: "Le téléphone du contact d'urgence n'a pas un format valide." };
  }
  if (donnees.codePostal && !estCodePostalValide(donnees.codePostal)) {
    return { erreur: "Le code postal doit comporter 5 chiffres." };
  }

  await prisma.etudiant.update({ where: { id: dossier.etudiantId }, data: donnees });

  // Enveloppe Documenso déjà créée pour la version périmée : annulée avant
  // de régénérer, jamais laissée signable avec des données obsolètes (voir
  // lib/documenso.ts#annulerDocumentSignature).
  if (dossier.documensoDocumentId) {
    await annulerDocumentSignature(dossier.documensoDocumentId);
    await prisma.dossierAnnuel.update({
      where: { id: dossier.id },
      data: { documensoDocumentId: null },
    });
  }

  if (dossier.etudiant.sectionSouhaiteeId) {
    await genererNouvelleVersionDossier({
      etudiantId: dossier.etudiantId,
      sectionId: dossier.etudiant.sectionSouhaiteeId,
      dossierAnnuelId: dossier.id,
    });
  }

  revalidatePath(`/dossier/${token}`);
  return { ok: true };
}

export async function demanderCorrectionAction(
  formData: FormData,
): Promise<{ erreur: string } | { ok: true }> {
  const token = champTexte(formData, "token");
  const message = champTexte(formData, "message");
  if (!token) return { erreur: "Lien invalide." };
  if (!message) return { erreur: "Merci de préciser la correction souhaitée." };

  const ip = await adresseIpClient();
  if (limiteDebitDepassee(`dossier-correction:${ip}`, 10, 15 * 60 * 1000)) {
    return { erreur: "Trop de tentatives depuis cette connexion. Merci de réessayer dans quelques minutes." };
  }

  const dossier = await dossierDepuisToken(token);
  if (!dossier) return { erreur: "Lien invalide ou expiré." };

  await prisma.demandeCorrection.create({
    data: { dossierAnnuelId: dossier.id, message },
  });

  revalidatePath(`/dossier/${token}`);
  return { ok: true };
}

// "Consulter et signer mon dossier" : verrouille la version courante comme
// confirmée puis transmet immédiatement à Documenso — un seul geste côté
// famille (voir bilan de session, page de vérification minimale). Un
// re-clic (retour arrière navigateur, etc.) est sans danger : si le dossier
// est déjà ENVOYEE_SIGNATURE, on redemande juste le lien de signature déjà
// ouvert plutôt que d'en recréer un second (voir lib/documenso.ts#obtenirLienSignature).
//
// Concurrence (voir bilan d'audit — I1) : la création de l'enveloppe
// Documenso est une opération EXTERNE, impossible à inclure dans une
// transaction Prisma. La réservation ci-dessous (updateMany conditionné sur
// versionConfirmeeNumero=null) est donc le seul point qui doit être
// atomique — une fois qu'une requête l'a gagnée, plus aucune autre ne peut
// créer une deuxième enveloppe pour la même confirmation, même en cas de
// double-clic ou de retry réseau simultané.
export async function confirmerEtSignerAction(formData: FormData): Promise<void> {
  const token = champTexte(formData, "token");
  if (!token) redirect("/acces-refuse");

  const ip = await adresseIpClient();
  if (limiteDebitDepassee(`dossier-signature:${ip}`, 10, 15 * 60 * 1000)) {
    redirect(`/dossier/${token}?erreur=TROP_DE_TENTATIVES`);
  }

  const dossier = await dossierDepuisToken(token);
  if (!dossier) redirect("/acces-refuse");

  if (dossier.statutSignature === "SIGNEE") {
    redirect(`/dossier/${token}?erreur=DEJA_SIGNE`);
  }

  if (dossier.statutSignature === "ENVOYEE_SIGNATURE" && dossier.documensoDocumentId) {
    const lien = await obtenirLienSignature(dossier.documensoDocumentId).catch(() => null);
    if (lien) redirect(lien);
    redirect(`/dossier/${token}?erreur=SIGNATURE_INDISPONIBLE`);
  }

  const derniereVersion = await prisma.document.findFirst({
    where: { dossierAnnuelId: dossier.id, type: "DOSSIER_GENERE" },
    orderBy: { numeroVersion: "desc" },
  });
  if (!derniereVersion) redirect(`/dossier/${token}?erreur=DOSSIER_INDISPONIBLE`);

  // Le signataire dépend du modèle de dossier, jamais de l'âge réel (voir
  // etudiants/[id]/page.tsx#estFormationJeunesConfirmee, même règle) : un
  // étudiant Adultes signe toujours lui-même, quel que soit son âge — un
  // représentant légal n'est plus jamais collecté pour ce modèle (décision
  // association du 2026-09-16). Modèle inconnu (fiche créée à la main par le
  // staff sans section connue) traité comme Adultes, par cohérence avec le
  // reste de la fiche étudiant.
  const estFormationJeunes = dossier.etudiant.sectionSouhaitee?.modeleDossier === "JEUNES";
  const responsablePrincipal = dossier.etudiant.responsables[0];
  const signataireNom = estFormationJeunes
    ? responsablePrincipal
      ? `${responsablePrincipal.prenom} ${responsablePrincipal.nom}`
      : null
    : `${dossier.etudiant.prenom} ${dossier.etudiant.nom}`;
  const signataireEmail = estFormationJeunes ? responsablePrincipal?.email : dossier.etudiant.email;

  if (!signataireNom || !signataireEmail) {
    redirect(`/dossier/${token}?erreur=SIGNATAIRE_INCOMPLET`);
  }

  // Réservation atomique de cette tentative de confirmation : le WHERE porte
  // à la fois sur statutSignature ET sur versionConfirmeeNumero=null, de
  // sorte qu'une deuxième requête concurrente (double-clic, retry réseau)
  // ne matche plus la ligne une fois la première validée par Postgres
  // (isolation READ COMMITTED : la deuxième requête réévalue son WHERE
  // après le commit de la première) — sans verrou applicatif ni délai,
  // seulement une contrainte déjà disponible sur des colonnes existantes.
  const reservation = await prisma.dossierAnnuel.updateMany({
    where: { id: dossier.id, statutSignature: "A_VERIFIER", versionConfirmeeNumero: null },
    data: { versionConfirmeeNumero: derniereVersion.numeroVersion, versionConfirmeeLe: new Date() },
  });

  if (reservation.count === 0) {
    // Une requête concurrente a déjà réservé cette confirmation : ne jamais
    // créer de deuxième enveloppe. Se comporter comme un re-clic, en
    // relisant l'état réellement écrit par l'autre requête plutôt qu'en
    // supposant lequel des deux cas s'applique (elle peut avoir déjà réussi,
    // ou avoir déjà échoué et relâché la réservation, voir catch ci-dessous
    // — dans ce dernier cas on redirige vers une erreur générique plutôt que
    // de boucler sur une nouvelle tentative automatique, pour ne jamais
    // créer de contention en cascade : un simple re-clic suffit).
    const etatActuel = await prisma.dossierAnnuel.findUniqueOrThrow({ where: { id: dossier.id } });
    if (etatActuel.statutSignature === "SIGNEE") {
      redirect(`/dossier/${token}?erreur=DEJA_SIGNE`);
    }
    if (etatActuel.statutSignature === "ENVOYEE_SIGNATURE" && etatActuel.documensoDocumentId) {
      const lien = await obtenirLienSignature(etatActuel.documensoDocumentId).catch(() => null);
      if (lien) redirect(lien);
    }
    redirect(`/dossier/${token}?erreur=SIGNATURE_INDISPONIBLE`);
  }

  let documentId: number;
  let signingUrl: string;
  try {
    const pdf = await lireDocument(derniereVersion.cheminRelatif);
    const champsSignature = (derniereVersion.champsSignature as ChampSignatureDossier[] | null) ?? [];
    ({ documentId, signingUrl } = await creerEtEnvoyerDocumentSignature({
      titre: derniereVersion.nomFichier,
      pdf,
      signataireNom,
      signataireEmail,
      externalId: dossier.id,
      champsSignature,
    }));
  } catch (erreur) {
    // La réservation a réussi mais l'envoi à Documenso a échoué — ou son
    // résultat est resté indéterminé : un appel intermédiaire (upload,
    // pose du champ signature, envoi) peut avoir réellement abouti côté
    // Documenso avant que ce process ne reçoive l'erreur, laissant un
    // document Documenso orphelin. C'est un compromis assumé (voir bilan) :
    // ce document reste inatteignable (son signingUrl n'a jamais quitté ce
    // process, jamais transmis à la famille), donc sans risque de
    // signature "perdue" — seulement du bruit côté Documenso. On relâche
    // ici la réservation pour permettre un nouvel essai, plutôt que de
    // laisser le dossier bloqué "confirmé" sans enveloppe exploitable.
    await prisma.dossierAnnuel.updateMany({
      where: { id: dossier.id, versionConfirmeeNumero: derniereVersion.numeroVersion },
      data: { versionConfirmeeNumero: null, versionConfirmeeLe: null },
    });
    console.error("confirmerEtSignerAction — échec de l'envoi à Documenso :", erreur);
    redirect(`/dossier/${token}?erreur=SIGNATURE_INDISPONIBLE`);
  }

  await prisma.dossierAnnuel.update({
    where: { id: dossier.id },
    data: { documensoDocumentId: documentId, statutSignature: "ENVOYEE_SIGNATURE", envoyeSignatureLe: new Date() },
  });

  redirect(signingUrl);
}
