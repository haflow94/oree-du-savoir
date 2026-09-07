// Pas de `import "server-only"` ici : même raison que preinscription-code.ts
// — ne touche que Prisma (déjà mocké dans les tests, voir
// preinscription-token.test.ts) et hashSessionToken, jamais importé depuis
// un composant client.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashSessionToken } from "@/lib/session-token";

// Jeton permanent embarqué dans le QR officiel de préinscription publique
// (voir /inscriptions) — volontairement distinct de CodePreinscription
// (src/lib/preinscription-code.ts) : celui-ci gère des codes à
// expiration/rotation (email, accueil), le jeton ci-dessous n'a ni l'un ni
// l'autre. Ce n'est PAS un mécanisme d'authentification : un simple filtre
// contre les robots qui découvriraient le hostname public sans être passés
// par le QR physique — voir ARCHITECTURE-PREINSCRIPTION.md. La vérification
// réelle d'un formulaire soumis reste, comme avant, la validation serveur
// des champs (src/app/preinscription/actions.ts) : ce jeton ne gouverne que
// l'affichage de la page, jamais la soumission.

const ID_SINGLETON = "permanent";
const OCTETS_JETON = 32; // 256 bits d'entropie, encodés en base64url (~43 caractères)

// Message volontairement générique (ne révèle pas si le jeton est
// introuvable, malformé ou simplement absent) — même logique que
// MESSAGE_CODE_INVALIDE dans preinscription-code.ts.
export const MESSAGE_JETON_INVALIDE =
  "Ce lien de préinscription n'est plus valide. Merci de scanner le QR officiel affiché par l'association ou de contacter l'association.";

function genererJetonBrut(): string {
  return randomBytes(OCTETS_JETON).toString("base64url");
}

function hashJeton(brut: string): string {
  return hashSessionToken(brut);
}

// Crée le jeton permanent s'il n'existe pas encore, le réutilise sinon —
// jamais régénéré automatiquement (voir (app)/inscriptions/page.tsx, appelé
// à chaque affichage de la page) : le QR imprimé une fois doit rester
// valable indéfiniment, y compris après un redémarrage du conteneur (aucun
// état en mémoire ici, contrairement au code accueil de
// preinscription-code.ts — tout vit en base). `id` fixe (ID_SINGLETON)
// plutôt que laissé à Prisma : si deux requêtes arrivent en même temps sur
// un jeton pas encore créé, la seconde `create` échoue sur la contrainte de
// clé primaire déjà prise par la première — on relit alors simplement la
// ligne créée entre-temps plutôt que d'échouer, pour ne jamais finir avec
// deux jetons permanents valides à la fois.
export async function obtenirOuCreerJetonPermanent(): Promise<{ jeton: string }> {
  const existant = await prisma.jetonPreinscriptionPermanent.findUnique({
    where: { id: ID_SINGLETON },
  });
  if (existant) return { jeton: existant.jeton };

  const jeton = genererJetonBrut();
  try {
    await prisma.jetonPreinscriptionPermanent.create({
      data: { id: ID_SINGLETON, jeton, jetonHash: hashJeton(jeton) },
    });
    return { jeton };
  } catch {
    const cree = await prisma.jetonPreinscriptionPermanent.findUniqueOrThrow({
      where: { id: ID_SINGLETON },
    });
    return { jeton: cree.jeton };
  }
}

// Vérification sans effet de bord (affichage du formulaire, voir
// preinscription/page.tsx) : jamais de consommation — le jeton reste valide
// indéfiniment tant qu'il n'a pas été supprimé manuellement en base (aucun
// écran de rotation/révocation prévu pour cette première version).
export async function jetonPermanentEstValide(brut: string): Promise<boolean> {
  if (!brut) return false;
  const jeton = await prisma.jetonPreinscriptionPermanent.findUnique({
    where: { jetonHash: hashJeton(brut) },
  });
  return !!jeton;
}
