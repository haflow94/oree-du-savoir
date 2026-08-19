"use server";

import { redirect } from "next/navigation";
import { logout } from "@/lib/auth";

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

// Variante sans redirection serveur, pour le bouton « Quitter » de la
// feuille isolée (/appel/[seanceId]) : le client tente de fermer l'onglet
// lui-même juste après, et ne retombe sur /login que si le navigateur
// refuse de fermer (restriction courante hors des onglets ouverts par
// script — voir QuitterButton).
export async function logoutSansRedirectAction(): Promise<void> {
  await logout();
}
