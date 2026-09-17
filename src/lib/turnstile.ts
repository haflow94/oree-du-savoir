import "server-only";

// Vérification serveur du widget Cloudflare Turnstile embarqué dans le
// formulaire public de préinscription (voir preinscription-form.tsx) — en
// complément, jamais en remplacement, de la limitation de débit applicative
// (src/lib/rate-limit.ts) : contrairement à celle-ci (qui ne compte qu'un
// volume de requêtes), Turnstile distingue un navigateur humain d'un script
// dès la première tentative, quelle que soit l'IP.
//
// Volontairement différent de la règle de sécurité Cloudflare host-level
// utilisée un temps sur preinscription.loreedusavoir.fr (Managed Challenge,
// voir ARCHITECTURE-PREINSCRIPTION.md/DEPLOIEMENT-PREINSCRIPTION.md) :
// celle-ci interceptait TOUTE requête avant même d'atteindre l'application
// (page bloquante), et s'est révélée bloquer indéfiniment de vrais visiteurs
// dont le navigateur refuse le cookie `cf_clearance` (bloqueurs de
// trackers). Ce widget-ci s'exécute dans le contexte de la page elle-même :
// la famille voit et remplit le formulaire normalement, seule la soumission
// est vérifiée.
//
// TURNSTILE_SECRET_KEY absent (valeur par défaut, voir .env.example) :
// vérification désactivée (retourne toujours true), sans effet sur le reste
// du formulaire — même idiome que N8N_INTERNAL_API_SECRET/PUPPETEER_EXECUTABLE_PATH.
// Ne pas activer avant d'avoir créé le widget correspondant dans le
// dashboard Cloudflare (Turnstile) et renseigné TURNSTILE_SITE_KEY/
// TURNSTILE_SECRET_KEY, et testé la soumission dans plusieurs navigateurs
// (dont un avec bloqueur de trackers actif) — voir la mémoire de l'incident
// du 2026-09-16 avant de réactiver une protection anti-bot sur ce hostname.
export async function verifierTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true;

  // Secret configuré mais aucun jeton reçu (widget non chargé côté client,
  // JS désactivé, ou formulaire altéré) : refusé, jamais interprété comme un
  // laissez-passer implicite (même règle que champAutorisationPhotoVideo
  // dans actions.ts — ne jamais deviner).
  if (!token) return false;

  const corps = new URLSearchParams({ secret: secretKey, response: token, remoteip: ip });

  try {
    const reponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corps,
    });
    if (!reponse.ok) return false;
    const resultat = (await reponse.json()) as { success?: boolean };
    return resultat.success === true;
  } catch (erreur) {
    // Cloudflare injoignable : on refuse plutôt que de laisser passer en
    // silence (voir "ne jamais deviner", CLAUDE.md) — un incident réseau
    // ponctuel affecte alors la préinscription plutôt que la sécurité,
    // arbitrage volontaire tant que cette vérification reste désactivée par
    // défaut (TURNSTILE_SECRET_KEY vide).
    console.error("Vérification Turnstile impossible :", erreur);
    return false;
  }
}
