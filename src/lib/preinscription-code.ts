// Pas de `import "server-only"` ici : ne touche que Prisma (déjà mocké dans
// les tests, voir preinscription-code.test.ts) et hashSessionToken, jamais
// importé depuis un composant client — même raison que auth-n8n.ts.
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashSessionToken } from "@/lib/session-token";

// Code d'accès pour la préinscription publique (voir ARCHITECTURE-
// PREINSCRIPTION.md) — jamais un verrou global sur /preinscription : n'entre
// en jeu que si l'URL porte `?code=...`, voir preinscription/page.tsx.
//
// Deux origines, distinguées par `CodePreinscription.estAccueilAuto`, avec
// un mode de consommation différent (`usageUnique`) :
// - email (estAccueilAuto = false, usageUnique = true) : campagne ciblée, un
//   code généré à la main par le staff pour une famille précise
//   (`creerCodeEmailPreinscription`) — consommé de façon atomique à la
//   première soumission réussie (`tenterConsommerCode`), comme avant.
// - accueil (estAccueilAuto = true, usageUnique = false) : généré
//   automatiquement par GET /accueil-preinscription (voir
//   src/app/accueil-preinscription/route.ts), valable jusqu'à la fin de la
//   journée courante. Plusieurs familles scannent le même QR affiché sur
//   place le même jour : jamais consommé à la soumission, seule
//   l'expiration l'invalide (`obtenirOuCreerCodeAccueilAuto` régénère
//   paresseusement au prochain GET une fois expiré). Le staff peut aussi
//   forcer une régénération anticipée (ex. fuite suspectée) via
//   `invaliderCodeAccueilAutoEnCours`.
//
// Même principe de stockage que Session (src/lib/session-token.ts) : seul le
// hash SHA-256 du code est persisté, jamais le code en clair — on réutilise
// directement hashSessionToken plutôt que d'introduire une seconde fonction
// de hash pour le même besoin. Conséquence pour le code accueil : le code en
// clair du code actuellement en cours n'est donc récupérable qu'en mémoire
// process (voir `codeAccueilAutoEnCours` plus bas), jamais depuis la base —
// perdu à chaque redémarrage du conteneur, ce qui ne fait alors que
// provoquer la génération d'un nouveau code au scan suivant (même
// dégradation acceptable que src/lib/rate-limit.ts).

// Alphabet sans caractères ambigus à la lecture/saisie manuelle (pas de
// 0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LONGUEUR_CODE = 10;

// Message volontairement identique quelle que soit la cause réelle (code
// introuvable, expiré ou déjà utilisé) : partagé entre preinscription/page.tsx
// (avant affichage du formulaire) et preinscription/actions.ts (à la
// soumission), pour ne jamais laisser deviner par énumération quel cas
// précis a échoué.
export const MESSAGE_CODE_INVALIDE =
  "Ce lien de préinscription n'est plus valide (code incorrect, expiré ou déjà utilisé). Merci de vérifier le lien reçu par e-mail ou de contacter l'association.";

// Message dédié pour un code accueil devenu invalide (déjà utilisé par une
// autre famille entre-temps, ou expiré d'inactivité) : contrairement à
// MESSAGE_CODE_INVALIDE, révéler que "c'est normal, il suffit de rescanner"
// n'ouvre aucune brèche d'énumération ici — le visiteur est déjà passé par
// un canal légitime (le QR affiché sur place), on ne fait que le rassurer.
export const MESSAGE_CODE_ACCUEIL_EXPIRE =
  "Ce lien a déjà été utilisé ou a expiré. Merci de rescanner le QR affiché à l'accueil pour obtenir un nouveau lien.";

function normaliserCode(brut: string): string {
  return brut.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashCode(brut: string): string {
  return hashSessionToken(normaliserCode(brut));
}

function genererCodeBrut(): string {
  let code = "";
  for (let i = 0; i < LONGUEUR_CODE; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  // Regroupement lisible (XXXXX-XXXXX) : purement cosmétique, ignoré par
  // normaliserCode à la vérification.
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

async function creerCode(data: {
  campagneLabel: string;
  expireLe: Date;
  estAccueilAuto: boolean;
  usageUnique: boolean;
  creeParId?: string | null;
}): Promise<{ code: string; expireLe: Date }> {
  const code = genererCodeBrut();

  await prisma.codePreinscription.create({
    data: {
      codeHash: hashCode(code),
      campagneLabel: data.campagneLabel,
      expireLe: data.expireLe,
      estAccueilAuto: data.estAccueilAuto,
      usageUnique: data.usageUnique,
      creeParId: data.creeParId ?? null,
    },
  });

  return { code, expireLe: data.expireLe };
}

export async function creerCodeEmailPreinscription(options: {
  campagneLabel: string;
  joursValidite: number;
  creeParId: string;
}): Promise<{ code: string; expireLe: Date }> {
  const expireLe = new Date(Date.now() + options.joursValidite * 24 * 60 * 60 * 1000);
  return creerCode({
    campagneLabel: options.campagneLabel,
    expireLe,
    estAccueilAuto: false,
    usageUnique: true,
    creeParId: options.creeParId,
  });
}

// Vérification sans effet de bord (affichage du formulaire, voir
// preinscription/page.tsx) : ne consomme jamais le code, seule
// tenterConsommerCode le fait, à la soumission. Retourne un simple booléen —
// jamais la raison précise (introuvable / expiré / déjà utilisé) pour ne pas
// permettre à quelqu'un de deviner l'existence d'un code par énumération.
export async function codeEstValide(brut: string): Promise<boolean> {
  const normalise = normaliserCode(brut);
  if (!normalise) return false;

  const code = await prisma.codePreinscription.findUnique({
    where: { codeHash: hashCode(normalise) },
  });
  if (!code || code.utiliseLe) return false;
  return code.expireLe.getTime() > Date.now();
}

// Utilisé uniquement pour choisir le message d'erreur affiché (voir
// preinscription/page.tsx et preinscription/actions.ts) : indique si le code
// fourni — valide ou non, peu importe — a été émis par la route accueil,
// pour proposer "rescannez le QR" plutôt que le message générique. Ne révèle
// rien de plus qu'un guess aléatoire ne pourrait déjà déduire (il faut avoir
// deviné le code exact, hashé, pour obtenir une réponse différente de false).
export async function estCodeAccueilAuto(brut: string): Promise<boolean> {
  const normalise = normaliserCode(brut);
  if (!normalise) return false;

  const code = await prisma.codePreinscription.findUnique({
    where: { codeHash: hashCode(normalise) },
  });
  return code?.estAccueilAuto ?? false;
}

// Tente d'utiliser le code pour UNE soumission (voir preinscription/actions.ts).
// Comportement de consommation gouverné par `usageUnique` :
// - usageUnique = true (email) : consommé de façon atomique, la condition
//   `utiliseLe: null` dans le WHERE empêche deux soumissions concurrentes
//   avec le même code de réussir toutes les deux (la seconde ne met à jour
//   aucune ligne).
// - usageUnique = false (accueil) : jamais consommé — seule l'expiration
//   (déjà vérifiée juste avant) invalide le code, donc plusieurs soumissions
//   différentes le même jour réussissent toutes.
// Doit être appelé juste avant de créer l'étudiant, une fois le reste du
// formulaire déjà validé.
export async function tenterConsommerCode(brut: string): Promise<boolean> {
  const normalise = normaliserCode(brut);
  if (!normalise) return false;

  const code = await prisma.codePreinscription.findUnique({
    where: { codeHash: hashCode(normalise) },
  });
  if (!code) return false;
  if (code.expireLe.getTime() <= Date.now()) return false;

  if (!code.usageUnique) return true;

  const resultat = await prisma.codePreinscription.updateMany({
    where: { id: code.id, utiliseLe: null, expireLe: { gt: new Date() } },
    data: { utiliseLe: new Date() },
  });
  return resultat.count === 1;
}

// --- Code accueil auto-régénéré (GET /accueil-preinscription) ---

// Fin de la journée courante, heure locale du conteneur (voir la variable
// TZ dans docker-compose.yml/.env.example, déjà positionnée pour tout le
// process) — pas de calcul UTC manuel ici, on s'appuie sur ce TZ comme le
// reste de l'appli. Sert d'`expireLe` au code accueil : plusieurs familles
// peuvent soumettre le même code le même jour (usageUnique = false),
// jusqu'à minuit.
function finDeJourneeCourante(): Date {
  const fin = new Date();
  fin.setHours(23, 59, 59, 999);
  return fin;
}

// Mémorise le code accueil actuellement en cours pour éviter de le
// regénérer à chaque scan (le code en clair n'est jamais recalculable depuis
// le hash stocké en base, voir le commentaire d'en-tête). Un unique
// singleton process suffit : l'appli tourne en une seule instance (voir
// docker-compose.yml, pas de scaling horizontal) — pas de verrou nécessaire,
// une éventuelle double création concurrente au tout premier scan de la
// journée est sans conséquence (les deux codes restent valides, seul l'un
// des deux reste mémorisé pour la suite).
let codeAccueilAutoEnCours: { codeBrut: string } | null = null;

// Exporté uniquement pour réinitialiser l'état entre deux cas de test (le
// singleton ci-dessus persiste sinon d'un test à l'autre) — jamais appelé en
// dehors de preinscription-code.test.ts.
export function reinitialiserCodeAccueilAutoPourTests(): void {
  codeAccueilAutoEnCours = null;
}

// Renvoie le code accueil en cours s'il est toujours valide (jamais
// consommé, seule l'expiration compte — voir usageUnique = false plus
// haut), sinon en crée un nouveau valable jusqu'à la fin de journée —
// appelé à chaque requête sur GET /accueil-preinscription (voir
// src/app/accueil-preinscription/route.ts).
export async function obtenirOuCreerCodeAccueilAuto(): Promise<{ code: string }> {
  if (codeAccueilAutoEnCours && (await codeEstValide(codeAccueilAutoEnCours.codeBrut))) {
    return { code: codeAccueilAutoEnCours.codeBrut };
  }

  const { code } = await creerCode({
    campagneLabel: "Accueil (rotation automatique)",
    expireLe: finDeJourneeCourante(),
    estAccueilAuto: true,
    usageUnique: false,
    creeParId: null,
  });
  codeAccueilAutoEnCours = { codeBrut: code };
  return { code };
}

// Force l'invalidation du/des code(s) accueil actuellement valide(s) en
// base (avance `expireLe` à maintenant — jamais via `utiliseLe`, cohérent
// avec usageUnique = false, voir le commentaire d'en-tête), sans en créer
// un nouveau : le prochain GET /accueil-preinscription s'en charge
// paresseusement via obtenirOuCreerCodeAccueilAuto ci-dessus. Invalide
// TOUS les codes accueil encore valides plutôt que le seul singleton en
// mémoire — celui-ci peut être perdu après un redémarrage du conteneur
// (voir le commentaire d'en-tête), et ne pas retomber dessus ne doit pas
// empêcher l'action de fonctionner. Utilisé par le staff (voir
// invaliderCodeAccueilAction, (app)/inscriptions/actions.ts) en cas de
// doute sur une fuite du code du jour, sans attendre l'expiration
// naturelle en fin de journée.
export async function invaliderCodeAccueilAutoEnCours(): Promise<void> {
  await prisma.codePreinscription.updateMany({
    where: { estAccueilAuto: true, expireLe: { gt: new Date() } },
    data: { expireLe: new Date() },
  });
  codeAccueilAutoEnCours = null;
}
