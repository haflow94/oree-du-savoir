import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    accesDossier: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
      update: (...args: unknown[]) => update(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

const { creerAccesDossier, resoudreAccesDossier, revoquerAccesDossier } = await import(
  "./acces-dossier"
);

function ligne(overrides: Partial<{
  dossierAnnuelId: string;
  tokenHash: string;
  expireLe: Date;
  revoqueLe: Date | null;
}> = {}) {
  return {
    id: "acces-1",
    dossierAnnuelId: "dossier-1",
    tokenHash: "hash",
    expireLe: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    revoqueLe: null,
    dernierAccesLe: null,
    creeLe: new Date(),
    ...overrides,
  };
}

describe("creerAccesDossier", () => {
  afterEach(() => vi.clearAllMocks());

  it("génère un token suffisamment aléatoire, jamais stocké en clair", async () => {
    upsert.mockResolvedValueOnce({});
    const { token } = await creerAccesDossier("dossier-1");

    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const donnees = upsert.mock.calls[0][0];
    expect(donnees.where).toEqual({ dossierAnnuelId: "dossier-1" });
    expect(donnees.create.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(donnees.create.tokenHash).not.toBe(token);
    expect(donnees.update.tokenHash).toBe(donnees.create.tokenHash);
  });

  it("génère un token différent à chaque régénération (fuite suspectée)", async () => {
    upsert.mockResolvedValue({});
    const { token: premier } = await creerAccesDossier("dossier-1");
    const { token: second } = await creerAccesDossier("dossier-1");

    expect(premier).not.toBe(second);
    expect(upsert.mock.calls[1][0].update.revoqueLe).toBeNull();
  });
});

describe("resoudreAccesDossier — sécurité (scénario 8)", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejette une entrée vide sans même interroger la base", async () => {
    const resultat = await resoudreAccesDossier("");
    expect(resultat).toEqual({ valide: false, raison: "TOKEN_INCONNU" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejette un token inconnu (mauvais token)", async () => {
    findUnique.mockResolvedValueOnce(null);
    const resultat = await resoudreAccesDossier("mauvais-token");
    expect(resultat).toEqual({ valide: false, raison: "TOKEN_INCONNU" });
  });

  it("rejette un token expiré", async () => {
    findUnique.mockResolvedValueOnce(ligne({ expireLe: new Date(Date.now() - 1000) }));
    const resultat = await resoudreAccesDossier("token-expire");
    expect(resultat).toEqual({ valide: false, raison: "EXPIRE" });
  });

  it("rejette un token révoqué, même non expiré", async () => {
    findUnique.mockResolvedValueOnce(ligne({ revoqueLe: new Date() }));
    const resultat = await resoudreAccesDossier("token-revoque");
    expect(resultat).toEqual({ valide: false, raison: "REVOQUE" });
  });

  it("accepte un token valide et ne donne accès qu'au dossier qui lui correspond", async () => {
    update.mockResolvedValueOnce({});
    findUnique.mockResolvedValueOnce(ligne({ dossierAnnuelId: "dossier-precis" }));
    const resultat = await resoudreAccesDossier("bon-token");
    expect(resultat).toEqual({ valide: true, dossierAnnuelId: "dossier-precis" });
  });

  it("ne permet jamais d'accéder à un autre dossier via un id fourni séparément — le dossier vient uniquement du token", async () => {
    update.mockResolvedValueOnce({});
    findUnique.mockResolvedValueOnce(ligne({ dossierAnnuelId: "dossier-a" }));
    const resultat = await resoudreAccesDossier("token-de-a");
    // La seule sortie possible est le dossierAnnuelId associé au token en
    // base — aucune façon d'influencer ce résultat depuis l'appelant.
    expect(resultat).toEqual({ valide: true, dossierAnnuelId: "dossier-a" });
  });
});

describe("revoquerAccesDossier", () => {
  afterEach(() => vi.clearAllMocks());

  it("pose revoqueLe sans jamais toucher un accès déjà révoqué", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    await revoquerAccesDossier("dossier-1");

    const conditions = updateMany.mock.calls[0][0];
    expect(conditions.where).toEqual({ dossierAnnuelId: "dossier-1", revoqueLe: null });
  });
});
