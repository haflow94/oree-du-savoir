"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/auth";
import { resoudreSeanceDuJourPourSalle } from "@/lib/qr";

function safeRedirectTarget(from: FormDataEntryValue | null): string {
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    return from;
  }
  return "/";
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const from = safeRedirectTarget(formData.get("from"));

  // Connexion faite en scannant le QR permanent d'une salle (voir
  // /qr/[token] et src/lib/qr.ts) : la session créée est restreinte à la
  // séance du jour dès qu'elle est résolue sans ambiguïté, quoi qu'il
  // arrive ensuite (voir requireSession dans src/lib/auth.ts). Si plusieurs
  // cours ont une séance aujourd'hui dans cette salle sans que l'heure
  // actuelle ne tranche, on laisse volontairement la session non restreinte
  // — /qr/[token] proposera un choix explicite juste après, et un
  // enseignant n'a de toute façon accès qu'à Présences.
  const matchQr = from.match(/^\/qr\/([^/?]+)/);
  const seanceRestreinteId = matchQr
    ? await resoudreSeanceDuJourPourSalle(matchQr[1]).then((r) => (r.trouvee ? r.seanceId : null))
    : null;

  const result = await login(email, motDePasse, seanceRestreinteId);

  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error, from });
    redirect(`/login?${params.toString()}`);
  }

  redirect(from);
}
