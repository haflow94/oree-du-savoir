import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const findUniqueOrThrow = vi.fn();
const create = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jetonPreinscriptionPermanent: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrow(...args),
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

const { obtenirOuCreerJetonPermanent, jetonPermanentEstValide } = await import(
  "./preinscription-token"
);

function ligne(overrides: Partial<{ jeton: string; jetonHash: string }> = {}) {
  return {
    id: "permanent",
    jeton: "jeton-existant",
    jetonHash: "hash-existant",
    creeLe: new Date(),
    ...overrides,
  };
}

describe("obtenirOuCreerJetonPermanent", () => {
  afterEach(() => vi.clearAllMocks());

  it("crée un premier jeton (id fixe, jamais expiré) quand aucun n'existe encore", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({});

    const { jeton } = await obtenirOuCreerJetonPermanent();

    expect(jeton).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const donnees = create.mock.calls[0][0].data;
    expect(donnees.id).toBe("permanent");
    expect(donnees.jeton).toBe(jeton);
    expect(donnees.jetonHash).toMatch(/^[0-9a-f]{64}$/);
    expect(donnees.jetonHash).not.toBe(jeton);
  });

  it("réutilise le jeton déjà en base, sans en recréer un autre", async () => {
    findUnique.mockResolvedValueOnce(ligne({ jeton: "deja-la" }));

    const { jeton } = await obtenirOuCreerJetonPermanent();

    expect(jeton).toBe("deja-la");
    expect(create).not.toHaveBeenCalled();
  });

  it("reste identique d'un appel à l'autre, y compris quand rien ne persiste en mémoire entre les deux (simule un redémarrage du conteneur)", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({});
    const { jeton: premier } = await obtenirOuCreerJetonPermanent();

    // Deuxième "consultation" : uniquement pilotée par ce que la base
    // renverrait désormais — aucun état en mémoire n'est réutilisé par le
    // module lui-même, contrairement au code accueil de
    // preinscription-code.ts.
    findUnique.mockResolvedValueOnce(ligne({ jeton: premier }));
    const { jeton: second } = await obtenirOuCreerJetonPermanent();

    expect(second).toBe(premier);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("relit la ligne créée entre-temps si la création concurrente échoue sur l'id fixe déjà pris", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockRejectedValueOnce(new Error("Unique constraint failed on id"));
    findUniqueOrThrow.mockResolvedValueOnce(ligne({ jeton: "cree-par-une-autre-requete" }));

    const { jeton } = await obtenirOuCreerJetonPermanent();

    expect(jeton).toBe("cree-par-une-autre-requete");
  });
});

describe("jetonPermanentEstValide", () => {
  afterEach(() => vi.clearAllMocks());

  it("valide un jeton dont le hash existe en base", async () => {
    findUnique.mockResolvedValueOnce(ligne());
    expect(await jetonPermanentEstValide("un-jeton")).toBe(true);
  });

  it("rejette un jeton introuvable", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await jetonPermanentEstValide("mauvais-jeton")).toBe(false);
  });

  it("rejette une entrée vide sans même interroger la base", async () => {
    expect(await jetonPermanentEstValide("")).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
