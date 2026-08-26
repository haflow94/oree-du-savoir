"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/auth";
import { resoudreSeanceDuJourPourToken, resoudreSeanceDuJourPourSalle } from "@/lib/qr";

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

  // Connexion faite en scannant un QR (voir /qr/[token]) : la session créée
  // est restreinte à la séance du jour de cette classe, quoi qu'il arrive
  // ensuite (voir requireSession dans src/lib/auth.ts). Une résolution
  // impossible ici (token inconnu, pas de séance aujourd'hui) n'empêche pas
  // la connexion : /qr/[token] affichera le message adapté juste après.
  const matchQr = from.match(/^\/qr\/([^/?]+)/);
  // Même principe pour le QR d'une salle (voir /qr-salle/[salle] et
  // src/lib/qr.ts) : verrouillage seulement si la résolution est
  // univoque. Si plusieurs cours ont une séance aujourd'hui dans cette
  // salle sans que l'heure actuelle ne tranche, on laisse volontairement la
  // session non restreinte — /qr-salle/[salle] proposera un choix explicite
  // juste après, et un enseignant n'a de toute façon accès qu'à Présences.
  const matchQrSalle = from.match(/^\/qr-salle\/([^/?]+)/);
  const seanceRestreinteId = matchQr
    ? await resoudreSeanceDuJourPourToken(matchQr[1]).then((r) =>
        r.trouvee ? r.seanceId : null,
      )
    : matchQrSalle
      ? await resoudreSeanceDuJourPourSalle(decodeURIComponent(matchQrSalle[1])).then((r) =>
          r.trouvee ? r.seanceId : null,
        )
      : null;

  const result = await login(email, motDePasse, seanceRestreinteId);

  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error, from });
    redirect(`/login?${params.toString()}`);
  }

  redirect(from);
}
