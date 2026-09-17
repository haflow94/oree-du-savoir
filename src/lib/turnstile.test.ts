import { afterEach, describe, expect, it, vi } from "vitest";
import { verifierTurnstile } from "./turnstile";

describe("verifierTurnstile", () => {
  const secretOriginal = process.env.TURNSTILE_SECRET_KEY;

  afterEach(() => {
    process.env.TURNSTILE_SECRET_KEY = secretOriginal;
    vi.unstubAllGlobals();
  });

  it("désactivée par défaut (clé secrète absente) : toujours autorisé", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(verifierTurnstile(null, "1.2.3.4")).resolves.toBe(true);
    await expect(verifierTurnstile("un-jeton", "1.2.3.4")).resolves.toBe(true);
  });

  it("clé secrète configurée mais aucun jeton reçu : refusé", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    await expect(verifierTurnstile(null, "1.2.3.4")).resolves.toBe(false);
  });

  it("jeton valide confirmé par Cloudflare : autorisé", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
    );
    await expect(verifierTurnstile("jeton-valide", "1.2.3.4")).resolves.toBe(true);
  });

  it("jeton refusé par Cloudflare : refusé", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }),
    );
    await expect(verifierTurnstile("jeton-invalide", "1.2.3.4")).resolves.toBe(false);
  });

  it("Cloudflare injoignable : refusé plutôt que deviné", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(verifierTurnstile("jeton", "1.2.3.4")).resolves.toBe(false);
  });
});
