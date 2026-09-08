import { afterEach, describe, expect, it, vi } from "vitest";

const login = vi.fn();
vi.mock("@/lib/auth", () => ({ login: (...args: unknown[]) => login(...args) }));

vi.mock("@/lib/qr", () => ({ resoudreSeanceDuJourPourSalle: vi.fn() }));

const limiteDebitDepassee = vi.fn<(cle: string, maxTentatives: number, fenetreMs: number) => boolean>(
  () => false,
);
vi.mock("@/lib/rate-limit", () => ({
  limiteDebitDepassee: (...args: [string, number, number]) => limiteDebitDepassee(...args),
}));

class RedirectSignal extends Error {
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { loginAction } = await import("./actions");

function form(email: string, motDePasse: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("motDePasse", motDePasse);
  return fd;
}

describe("loginAction — limitation de débit", () => {
  afterEach(() => vi.clearAllMocks());

  it("bloque avant même d'appeler login() quand la limite est dépassée pour cet email", async () => {
    limiteDebitDepassee.mockReturnValue(true);
    await expect(loginAction(form("staff@association.local", "mauvais"))).rejects.toMatchObject({
      url: "/login?error=TROP_DE_TENTATIVES&from=%2F",
    });
    expect(login).not.toHaveBeenCalled();
  });

  it("clé la limitation par email normalisé (trim + minuscule), pas par IP", async () => {
    limiteDebitDepassee.mockReturnValue(false);
    login.mockResolvedValue({ ok: true });
    await expect(loginAction(form("  Staff@Association.LOCAL ", "secret"))).rejects.toMatchObject({
      url: "/",
    });
    expect(limiteDebitDepassee).toHaveBeenCalledWith(
      "login:staff@association.local",
      10,
      15 * 60 * 1000,
    );
  });

  it("laisse passer une tentative normale (sous la limite) et journalise l'échec applicatif habituel en cas d'erreur", async () => {
    limiteDebitDepassee.mockReturnValue(false);
    login.mockResolvedValue({ ok: false, error: "IDENTIFIANTS_INVALIDES" });
    await expect(loginAction(form("staff@association.local", "mauvais"))).rejects.toMatchObject({
      url: "/login?error=IDENTIFIANTS_INVALIDES&from=%2F",
    });
    expect(login).toHaveBeenCalled();
  });

  it("n'affame pas les autres comptes : deux emails différents ont chacun leur propre compteur", async () => {
    limiteDebitDepassee.mockImplementation((cle: string) => cle === "login:attaque@cible.local");
    login.mockResolvedValue({ ok: true });

    await expect(loginAction(form("attaque@cible.local", "x"))).rejects.toMatchObject({
      url: "/login?error=TROP_DE_TENTATIVES&from=%2F",
    });
    await expect(loginAction(form("collegue@association.local", "bonmotdepasse"))).rejects.toMatchObject(
      { url: "/" },
    );
  });
});
