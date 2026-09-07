// Pas de `import "server-only"` ici : limiteDebitDepassee est un calcul pur
// (aucun accès disque/réseau), volontairement testable — seule
// adresseIpClient touche next/headers, jamais importée depuis un composant
// client.
import { headers } from "next/headers";

// Limitation de débit applicative, en complément — jamais en remplacement —
// de la limitation de débit au niveau du point d'entrée public (Cloudflare,
// voir ARCHITECTURE-PREINSCRIPTION.md) : celle-ci reste la protection
// principale contre un volume d'attaque important. Implémentation en
// mémoire (Map), volontairement pas de table dédiée ni de dépendance externe
// (Redis) pour ce volume — voir CLAUDE.md, pas de sur-ingénierie. Un
// redémarrage du conteneur réinitialise les compteurs : acceptable pour une
// protection secondaire.
type Fenetre = { debut: number; compteur: number };

const compteurs = new Map<string, Fenetre>();

// Purge périodique pour ne pas laisser grossir la Map indéfiniment (process
// long-running, voir docker-compose.yml) : un nettoyage simple à chaque
// appel suffit à ce volume, pas besoin d'un minuteur dédié.
function purgerEntreesExpirees(maintenant: number, fenetreMs: number): void {
  for (const [cle, fenetre] of compteurs) {
    if (maintenant - fenetre.debut > fenetreMs) compteurs.delete(cle);
  }
}

// Retourne true si la limite est dépassée pour cette clé (ex.
// "verif-code:1.2.3.4") sur la fenêtre glissante donnée, et enregistre la
// tentative dans tous les cas.
export function limiteDebitDepassee(
  cle: string,
  maxTentatives: number,
  fenetreMs: number,
): boolean {
  const maintenant = Date.now();
  if (compteurs.size > 10_000) purgerEntreesExpirees(maintenant, fenetreMs);

  const fenetre = compteurs.get(cle);
  if (!fenetre || maintenant - fenetre.debut > fenetreMs) {
    compteurs.set(cle, { debut: maintenant, compteur: 1 });
    return false;
  }

  fenetre.compteur += 1;
  return fenetre.compteur > maxTentatives;
}

// Adresse IP du client, du point de vue de l'application : en Docker Compose
// sans reverse proxy TLS dédié (voir DEPLOIEMENT.md), et derrière le futur
// tunnel sortant (cloudflared, voir ARCHITECTURE-PREINSCRIPTION.md) qui
// transmet l'IP réelle via X-Forwarded-For. Valeur non authentifiée (un
// client peut envoyer n'importe quel X-Forwarded-For) : suffisant pour une
// protection anti-abus de second rang, pas pour une décision de sécurité
// forte — voir le filtrage réseau externe pour ça.
//
// `enTetesRequete` optionnel : à passer (ex. `request.headers` d'un Route
// Handler) quand `next/headers` n'est pas utilisable — cette API exige un
// contexte de requête Next actif, absent lors d'un appel direct du handler
// en test (voir accueil-preinscription/route.test.ts). Sans argument,
// comportement inchangé pour les Server Components/Actions existants.
export async function adresseIpClient(enTetesRequete?: Headers): Promise<string> {
  const enTetes = enTetesRequete ?? (await headers());
  const xff = enTetes.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return enTetes.get("cf-connecting-ip") ?? enTetes.get("x-real-ip") ?? "inconnue";
}
