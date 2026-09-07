// Pas de `import "server-only"` ici : même raison que preinscription-code.ts
// et preinscription-token.ts — ne touche que Prisma et hashSessionToken,
// jamais importé depuis un composant client.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashSessionToken } from "@/lib/session-token";

const OCTETS_TOKEN = 32; // 256 bits d'entropie, encodés en base64url
const DUREE_VALIDITE_JOURS = 60;

function genererTokenBrut(): string {
  return randomBytes(OCTETS_TOKEN).toString("base64url");
}

export function dateExpirationAccesDossier(depuis: Date = new Date()): Date {
  return new Date(depuis.getTime() + DUREE_VALIDITE_JOURS * 24 * 60 * 60 * 1000);
}

// Crée (ou remplace, voir régénérerAccesDossier) le lien sécurisé donnant à
// la famille l'accès à SON dossier — un seul lien actif par DossierAnnuel
// (contrainte unique sur dossierAnnuelId, voir prisma/schema.prisma). Le
// token brut n'est retourné qu'ici, jamais stocké en clair (même principe
// que Session/CodePreinscription) : à intégrer immédiatement dans l'URL
// envoyée par email, jamais journalisé.
export async function creerAccesDossier(dossierAnnuelId: string): Promise<{ token: string }> {
  const token = genererTokenBrut();
  await prisma.accesDossier.upsert({
    where: { dossierAnnuelId },
    create: {
      dossierAnnuelId,
      tokenHash: hashSessionToken(token),
      expireLe: dateExpirationAccesDossier(),
    },
    update: {
      tokenHash: hashSessionToken(token),
      expireLe: dateExpirationAccesDossier(),
      revoqueLe: null,
    },
  });
  return { token };
}

export type ResolutionAccesDossier =
  | { valide: true; dossierAnnuelId: string }
  | { valide: false; raison: "TOKEN_INCONNU" | "EXPIRE" | "REVOQUE" };

// Vérification sans consommation (un même lien reste utilisable pour toute
// la durée de validité — la famille peut revenir consulter/corriger son
// dossier plusieurs fois avant signature) : chaque appel réussi met à jour
// `dernierAccesLe` pour la traçabilité côté staff, sans effet sur la
// validité elle-même.
export async function resoudreAccesDossier(tokenBrut: string): Promise<ResolutionAccesDossier> {
  if (!tokenBrut) return { valide: false, raison: "TOKEN_INCONNU" };

  const acces = await prisma.accesDossier.findUnique({
    where: { tokenHash: hashSessionToken(tokenBrut) },
  });
  if (!acces) return { valide: false, raison: "TOKEN_INCONNU" };
  if (acces.revoqueLe) return { valide: false, raison: "REVOQUE" };
  if (acces.expireLe.getTime() <= Date.now()) return { valide: false, raison: "EXPIRE" };

  await prisma.accesDossier.update({
    where: { dossierAnnuelId: acces.dossierAnnuelId },
    data: { dernierAccesLe: new Date() },
  }).catch(() => {});

  return { valide: true, dossierAnnuelId: acces.dossierAnnuelId };
}

// Invalidation manuelle (fuite suspectée) — même geste que
// invaliderCodeAccueilAutoEnCours (preinscription-code.ts) : avance juste un
// marqueur, ne supprime rien.
export async function revoquerAccesDossier(dossierAnnuelId: string): Promise<void> {
  await prisma.accesDossier.updateMany({
    where: { dossierAnnuelId, revoqueLe: null },
    data: { revoqueLe: new Date() },
  });
}
