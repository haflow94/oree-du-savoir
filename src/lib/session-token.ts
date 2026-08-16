import { randomBytes, createHash } from "node:crypto";

export const SESSION_DURATION_HOURS = 12;
export const SESSION_COOKIE_NAME = "session";

// Le token brut n'est jamais stocké : seule son empreinte SHA-256 est
// persistée en base. Voler la base ne permet donc pas de rejouer une session.
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
}

export function isExpired(expireLe: Date, now: Date = new Date()): boolean {
  return expireLe.getTime() <= now.getTime();
}
