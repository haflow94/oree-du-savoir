"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FrequenceActivite } from "@/generated/prisma/enums";
import { datesOccurrencesActivite, diffJoursUTC } from "@/lib/activites";
import { requireModule, Module } from "@/lib/permissions";

function champTexte(formData: FormData, nom: string): string | null {
  const valeur = formData.get(nom);
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim();
  return nettoye.length > 0 ? nettoye : null;
}

function champDate(formData: FormData, nom: string): Date | null {
  const valeur = champTexte(formData, nom);
  if (!valeur) return null;
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function champFrequence(formData: FormData): FrequenceActivite {
  const valeur = champTexte(formData, "frequence");
  return valeur && valeur in FrequenceActivite ? (valeur as FrequenceActivite) : FrequenceActivite.AUCUNE;
}

function champResponsableIds(formData: FormData): string[] {
  return formData.getAll("responsables").filter((v): v is string => typeof v === "string" && v.length > 0);
}

function retour(activiteId?: string, erreur?: string): never {
  const params = new URLSearchParams();
  params.set(erreur ? "error" : "ok", erreur ?? "1");
  if (activiteId) params.set("activiteId", activiteId);
  redirect(`/activites?${params.toString()}`);
}

function revalider() {
  revalidatePath("/activites");
  revalidatePath("/calendrier");
  revalidatePath("/");
}

export async function creerActiviteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ACTIVITES, "ECRITURE");

  const titre = champTexte(formData, "titre");
  const date = champDate(formData, "date");
  const dateFin = champDate(formData, "dateFin");
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");
  const lieu = champTexte(formData, "lieu");
  const contenu = champTexte(formData, "contenu");
  const frequence = champFrequence(formData);
  const dateFinRecurrence = champDate(formData, "dateFinRecurrence");
  const responsableIds = champResponsableIds(formData);
  if (!titre || !date) retour(undefined, "CHAMPS_MANQUANTS");
  if (dateFin && dateFin < date) retour(undefined, "PLAGE_INVALIDE");
  if (frequence !== FrequenceActivite.AUCUNE && !dateFinRecurrence) {
    retour(undefined, "FIN_RECURRENCE_MANQUANTE");
  }

  // Durée (en jours) de la première occurrence, reproduite à l'identique sur
  // chaque occurrence générée par la récurrence (voir
  // datesOccurrencesActivite).
  const dureeJours = dateFin ? diffJoursUTC(dateFin, date) : 0;
  const occurrences = datesOccurrencesActivite(date, frequence, dateFinRecurrence);
  const serieId = occurrences.length > 1 ? crypto.randomUUID() : null;

  const creees = await prisma.$transaction(
    occurrences.map((occDate) => {
      const occDateFin = dureeJours > 0 ? new Date(occDate.getTime() + dureeJours * 86400000) : null;
      return prisma.activite.create({
        data: {
          titre,
          contenu,
          date: occDate,
          dateFin: occDateFin,
          heureDebut,
          heureFin,
          lieu,
          frequence,
          dateFinRecurrence,
          serieId,
          creeParId: session.id,
          responsables: { create: responsableIds.map((utilisateurId) => ({ utilisateurId })) },
        },
      });
    }),
  );

  await prisma.journalAudit.create({
    data: {
      utilisateurId: session.id,
      action: "creation_activite",
      entite: "Activite",
      entiteId: creees[0].id,
      details: { titre, occurrences: creees.length },
    },
  });

  revalider();
  retour();
}

export async function modifierActiviteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ACTIVITES, "ECRITURE");

  const activiteId = champTexte(formData, "activiteId");
  const titre = champTexte(formData, "titre");
  const date = champDate(formData, "date");
  const dateFin = champDate(formData, "dateFin");
  const heureDebut = champTexte(formData, "heureDebut");
  const heureFin = champTexte(formData, "heureFin");
  const lieu = champTexte(formData, "lieu");
  const contenu = champTexte(formData, "contenu");
  const responsableIds = champResponsableIds(formData);
  if (!activiteId) retour(undefined, "CHAMPS_MANQUANTS");
  if (!titre || !date) retour(activiteId, "CHAMPS_MANQUANTS");
  if (dateFin && dateFin < date) retour(activiteId, "PLAGE_INVALIDE");

  const existante = await prisma.activite.findUnique({ where: { id: activiteId } });
  if (!existante) retour(undefined, "INTROUVABLE");

  await prisma.$transaction([
    prisma.activite.update({
      where: { id: activiteId },
      data: { titre, date, dateFin, heureDebut, heureFin, lieu, contenu },
    }),
    prisma.activiteResponsable.deleteMany({ where: { activiteId } }),
    prisma.activiteResponsable.createMany({
      data: responsableIds.map((utilisateurId) => ({ activiteId, utilisateurId })),
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "modification_activite",
        entite: "Activite",
        entiteId: activiteId,
        details: { titre },
      },
    }),
  ]);

  revalider();
  retour();
}

export async function supprimerActiviteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ACTIVITES, "ECRITURE");

  const activiteId = champTexte(formData, "activiteId");
  if (!activiteId) retour(undefined, "CHAMPS_MANQUANTS");

  const existante = await prisma.activite.findUnique({ where: { id: activiteId } });
  if (!existante) retour(undefined, "INTROUVABLE");

  await prisma.$transaction([
    prisma.activite.delete({ where: { id: activiteId } }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_activite",
        entite: "Activite",
        entiteId: activiteId,
        details: { titre: existante.titre },
      },
    }),
  ]);

  revalider();
  retour();
}

// Supprime cette occurrence et toutes celles de la même série à partir de sa
// date (« cette occurrence et les suivantes »), en laissant intact
// l'historique des occurrences passées de la série.
export async function supprimerSerieActiviteAction(formData: FormData): Promise<void> {
  const session = await requireModule(Module.ACTIVITES, "ECRITURE");

  const activiteId = champTexte(formData, "activiteId");
  if (!activiteId) retour(undefined, "CHAMPS_MANQUANTS");

  const existante = await prisma.activite.findUnique({ where: { id: activiteId } });
  if (!existante) retour(undefined, "INTROUVABLE");
  if (!existante.serieId) retour(undefined, "INTROUVABLE");

  const aSupprimer = await prisma.activite.findMany({
    where: { serieId: existante.serieId, date: { gte: existante.date } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.activite.deleteMany({
      where: { serieId: existante.serieId, date: { gte: existante.date } },
    }),
    prisma.journalAudit.create({
      data: {
        utilisateurId: session.id,
        action: "suppression_serie_activite",
        entite: "Activite",
        entiteId: existante.id,
        details: { titre: existante.titre, occurrencesSupprimees: aSupprimer.length },
      },
    }),
  ]);

  revalider();
  retour();
}
