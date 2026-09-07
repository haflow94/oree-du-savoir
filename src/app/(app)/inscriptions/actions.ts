"use server";

import { revalidatePath } from "next/cache";
import { requireModule, Module } from "@/lib/permissions";
import { creerCodeEmailPreinscription, invaliderCodeAccueilAutoEnCours } from "@/lib/preinscription-code";
import { marquerNotificationPreinscriptionLue } from "@/lib/notifications-preinscription";
import { prisma } from "@/lib/prisma";

// Génération d'un code d'accès pour une campagne de préinscription email
// ciblée (voir lib/preinscription-code.ts). Le besoin "accueil" (même QR
// affiché sur place toute la journée) est couvert automatiquement par
// GET /accueil-preinscription — pas de génération manuelle à faire pour ça,
// voir src/app/accueil-preinscription/route.ts.
//
// Pas d'écran de liste/révocation dédié pour l'instant (voir CLAUDE.md, pas
// de sur-ingénierie) : un code à purger avant terme se gère depuis Prisma
// Studio (`npm run db:studio`, déjà l'outil documenté pour ce type
// d'intervention ponctuelle).
//
// Renvoie le code en clair au composant appelant, une seule fois : il n'est
// jamais stocké nulle part une fois cette réponse envoyée (voir codeHash en
// base) — au staff de le copier tout de suite dans l'e-mail.
export async function genererCodePreinscriptionAction(
  formData: FormData,
): Promise<{ erreur: string } | { ok: true; code: string; lien: string; expireLe: string }> {
  const session = await requireModule(Module.INSCRIPTIONS, "ECRITURE");

  const campagneLabel = String(formData.get("campagneLabel") ?? "").trim();
  const joursValiditeBrut = String(formData.get("joursValidite") ?? "");
  const joursValidite = Number(joursValiditeBrut);

  if (!campagneLabel) {
    return { erreur: "Le libellé de la campagne est obligatoire (ex. \"Relance rentrée 2026\")." };
  }
  if (!Number.isInteger(joursValidite) || joursValidite < 1 || joursValidite > 90) {
    return { erreur: "La durée de validité doit être un nombre de jours entre 1 et 90." };
  }

  const { code, expireLe } = await creerCodeEmailPreinscription({
    campagneLabel,
    joursValidite,
    creeParId: session.id,
  });

  return {
    ok: true,
    code,
    lien: `/preinscription?code=${encodeURIComponent(code)}`,
    expireLe: expireLe.toLocaleDateString("fr-FR"),
  };
}

// Force l'invalidation immédiate du code accueil du jour (voir
// invaliderCodeAccueilAutoEnCours, lib/preinscription-code.ts), sans en
// régénérer un nouveau tout de suite — le prochain scan du QR d'accueil
// (GET /accueil-preinscription) en obtient un nouveau automatiquement.
// Usage prévu : réagir à une fuite suspectée du code du jour (ex. QR
// partagé hors des locaux) sans attendre son expiration naturelle en fin
// de journée. Toujours renvoie ok : requireModule redirige lui-même en cas
// de permission insuffisante, il n'y a pas d'autre cas d'échec possible ici.
export async function invaliderCodeAccueilAction(): Promise<{ ok: true }> {
  await requireModule(Module.INSCRIPTIONS, "ECRITURE");
  await invaliderCodeAccueilAutoEnCours();
  revalidatePath("/inscriptions");
  return { ok: true };
}

// Marque une notification de préinscription comme lue pour l'utilisateur
// courant UNIQUEMENT (voir LecturePreinscription, prisma/schema.prisma) —
// jamais un état partagé : deux membres du staff gardent chacun leur propre
// état de lecture sur la même notification. Appelée depuis la cloche du
// Topbar (voir components/topbar.tsx) au clic sur une notification, en
// parallèle de la navigation vers la fiche étudiant — le compteur affiché
// se met ensuite à jour via le même mécanisme de polling léger
// (router.refresh()) que le reste de l'interface, pas par un
// revalidatePath dédié ici.
//
// LECTURE suffit (pas ECRITURE) : lire une notification n'est pas une
// action de gestion des inscriptions, seulement une action de consultation
// — cohérent avec le fait que le badge est visible à quiconque a LECTURE
// sur Module.INSCRIPTIONS (voir (app)/layout.tsx).
export async function marquerNotificationPreinscriptionLueAction(
  notificationId: string,
): Promise<{ ok: true }> {
  const session = await requireModule(Module.INSCRIPTIONS, "LECTURE");
  await marquerNotificationPreinscriptionLue(notificationId, session.id);
  return { ok: true };
}

// Clôt une demande de correction déposée par la famille depuis
// /dossier/[token] (voir DemandeCorrection, prisma/schema.prisma) — le
// staff a fait la correction directement sur la fiche étudiant (aucun
// mécanisme dédié : c'est la même fiche que pour toute autre correction),
// ce bouton ne fait que retirer la demande de la file "à traiter".
export async function traiterDemandeCorrectionAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.INSCRIPTIONS, "ECRITURE");
  const demandeId = String(formData.get("demandeId") ?? "").trim();
  if (!demandeId) return;

  await prisma.demandeCorrection.updateMany({
    where: { id: demandeId, traiteeLe: null },
    data: { traiteeLe: new Date(), traiteeParId: session.id },
  });
  revalidatePath("/inscriptions");
}
