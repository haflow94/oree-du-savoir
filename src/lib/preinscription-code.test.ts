import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const updateMany = vi.fn();
const create = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    codePreinscription: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

const {
  codeEstValide,
  estCodeAccueilAuto,
  tenterConsommerCode,
  creerCodeEmailPreinscription,
  obtenirOuCreerCodeAccueilAuto,
  reinitialiserCodeAccueilAutoPourTests,
} = await import("./preinscription-code");

function code(
  overrides: Partial<{
    utiliseLe: Date | null;
    expireLe: Date;
    estAccueilAuto: boolean;
    usageUnique: boolean;
  }> = {},
) {
  return {
    id: "cp1",
    codeHash: "peu-importe",
    campagneLabel: "Test",
    utiliseLe: null,
    expireLe: new Date(Date.now() + 24 * 60 * 60 * 1000),
    estAccueilAuto: false,
    usageUnique: true,
    creeLe: new Date(),
    creeParId: null,
    ...overrides,
  };
}

describe("codeEstValide", () => {
  afterEach(() => vi.clearAllMocks());

  it("valide un code non utilisé et non expiré", async () => {
    findUnique.mockResolvedValueOnce(code());
    expect(await codeEstValide("ABCDE-12345")).toBe(true);
  });

  it("rejette un code déjà utilisé", async () => {
    findUnique.mockResolvedValueOnce(code({ utiliseLe: new Date() }));
    expect(await codeEstValide("ABCDE-12345")).toBe(false);
  });

  it("rejette un code expiré", async () => {
    findUnique.mockResolvedValueOnce(code({ expireLe: new Date(Date.now() - 1000) }));
    expect(await codeEstValide("ABCDE-12345")).toBe(false);
  });

  it("rejette un code introuvable (format invalide ou inexistant)", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await codeEstValide("N-IMPORTE-QUOI")).toBe(false);
  });

  it("rejette une entrée vide sans même interroger la base", async () => {
    expect(await codeEstValide("   ")).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("normalise la casse et les tirets avant de hasher (le hash consulté est identique)", async () => {
    findUnique.mockResolvedValue(code());
    await codeEstValide("abcde-12345");
    const hashMinuscules = findUnique.mock.calls[0][0].where.codeHash;
    findUnique.mockClear();
    findUnique.mockResolvedValue(code());
    await codeEstValide("ABCDE12345");
    const hashMajuscules = findUnique.mock.calls[0][0].where.codeHash;
    expect(hashMinuscules).toBe(hashMajuscules);
  });
});

describe("estCodeAccueilAuto", () => {
  afterEach(() => vi.clearAllMocks());

  it("reconnaît un code émis par la route accueil, même expiré ou déjà utilisé", async () => {
    findUnique.mockResolvedValueOnce(code({ estAccueilAuto: true, utiliseLe: new Date() }));
    expect(await estCodeAccueilAuto("ABCDE-12345")).toBe(true);
  });

  it("rejette un code email", async () => {
    findUnique.mockResolvedValueOnce(code({ estAccueilAuto: false }));
    expect(await estCodeAccueilAuto("ABCDE-12345")).toBe(false);
  });

  it("rejette un code introuvable, sans planter", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await estCodeAccueilAuto("ABCDE-12345")).toBe(false);
  });
});

describe("tenterConsommerCode", () => {
  afterEach(() => vi.clearAllMocks());

  it("consomme un code valide (une seule ligne mise à jour)", async () => {
    findUnique.mockResolvedValueOnce(code());
    updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await tenterConsommerCode("ABCDE-12345")).toBe(true);
  });

  it("échoue si le code est expiré, sans même tenter la mise à jour", async () => {
    findUnique.mockResolvedValueOnce(code({ expireLe: new Date(Date.now() - 1000) }));
    expect(await tenterConsommerCode("ABCDE-12345")).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("échoue en cas de consommation concurrente (WHERE utiliseLe: null ne matche plus)", async () => {
    findUnique.mockResolvedValueOnce(code());
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await tenterConsommerCode("ABCDE-12345")).toBe(false);
  });

  it("échoue immédiatement pour une entrée vide, sans appel base", async () => {
    expect(await tenterConsommerCode("")).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("échoue pour un code introuvable", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await tenterConsommerCode("ABCDE-12345")).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("consomme aussi bien un code accueil qu'un code email (même logique pour les deux origines)", async () => {
    findUnique.mockResolvedValueOnce(code({ estAccueilAuto: true }));
    updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await tenterConsommerCode("ABCDE-12345")).toBe(true);
  });
});

describe("creerCodeEmailPreinscription", () => {
  afterEach(() => vi.clearAllMocks());

  it("stocke uniquement le hash du code (estAccueilAuto = false), jamais le code en clair", async () => {
    create.mockResolvedValueOnce({});
    const { code: brut } = await creerCodeEmailPreinscription({
      campagneLabel: "Relance",
      joursValidite: 14,
      creeParId: "u1",
    });
    const donnees = create.mock.calls[0][0].data;
    expect(donnees.codeHash).not.toContain(brut.replace(/-/g, ""));
    expect(donnees.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(donnees.estAccueilAuto).toBe(false);
  });
});

describe("obtenirOuCreerCodeAccueilAuto", () => {
  afterEach(() => {
    vi.clearAllMocks();
    reinitialiserCodeAccueilAutoPourTests();
  });

  it("crée un premier code accueil (estAccueilAuto = true) quand aucun n'est en cours", async () => {
    create.mockResolvedValueOnce({});
    const { code: brut } = await obtenirOuCreerCodeAccueilAuto();
    expect(brut).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    const donnees = create.mock.calls[0][0].data;
    expect(donnees.estAccueilAuto).toBe(true);
  });

  it("réutilise le même code tant qu'il reste valide, sans recréer de ligne", async () => {
    create.mockResolvedValueOnce({});
    const { code: premier } = await obtenirOuCreerCodeAccueilAuto();

    // Le second appel revérifie la validité du code en mémoire via un
    // findUnique — on simule qu'il est toujours valide (ni utilisé, ni expiré).
    findUnique.mockResolvedValueOnce(code({ estAccueilAuto: true }));
    const { code: second } = await obtenirOuCreerCodeAccueilAuto();

    expect(second).toBe(premier);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("régénère un nouveau code différent une fois l'actuel consommé", async () => {
    create.mockResolvedValueOnce({});
    const { code: premier } = await obtenirOuCreerCodeAccueilAuto();

    // Le code en mémoire a été consommé entre-temps par une soumission
    // réussie (utiliseLe non nul) : la revérification échoue.
    findUnique.mockResolvedValueOnce(code({ estAccueilAuto: true, utiliseLe: new Date() }));
    create.mockResolvedValueOnce({});
    const { code: second } = await obtenirOuCreerCodeAccueilAuto();

    expect(second).not.toBe(premier);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("régénère un nouveau code une fois l'actuel expiré d'inactivité", async () => {
    create.mockResolvedValueOnce({});
    const { code: premier } = await obtenirOuCreerCodeAccueilAuto();

    findUnique.mockResolvedValueOnce(
      code({ estAccueilAuto: true, expireLe: new Date(Date.now() - 1000) }),
    );
    create.mockResolvedValueOnce({});
    const { code: second } = await obtenirOuCreerCodeAccueilAuto();

    expect(second).not.toBe(premier);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
