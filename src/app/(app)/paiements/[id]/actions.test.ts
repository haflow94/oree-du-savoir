import { afterEach, describe, expect, it, vi } from "vitest";

const echeanceCreate = vi.fn();
const echeanceFindUnique = vi.fn();
const paiementFindUnique = vi.fn();
const paiementUpdate = vi.fn();
const paiementDelete = vi.fn();
const dossierAnnuelFindUnique = vi.fn();
const dossierAnnuelUpdate = vi.fn();
const chequeUpdate = vi.fn();
const prelevementUpdate = vi.fn();
const journalAuditCreate = vi.fn();
const mouvementTresorerieUpdateMany = vi.fn();
const mouvementTresorerieDeleteMany = vi.fn();
const transaction = vi.fn((operations: unknown[]) => Promise.all(operations));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    echeance: {
      create: (...args: unknown[]) => echeanceCreate(...args),
      findUnique: (...args: unknown[]) => echeanceFindUnique(...args),
    },
    paiement: {
      findUnique: (...args: unknown[]) => paiementFindUnique(...args),
      update: (...args: unknown[]) => paiementUpdate(...args),
      delete: (...args: unknown[]) => paiementDelete(...args),
    },
    dossierAnnuel: {
      findUnique: (...args: unknown[]) => dossierAnnuelFindUnique(...args),
      update: (...args: unknown[]) => dossierAnnuelUpdate(...args),
    },
    cheque: { update: (...args: unknown[]) => chequeUpdate(...args) },
    prelevement: { update: (...args: unknown[]) => prelevementUpdate(...args) },
    journalAudit: { create: (...args: unknown[]) => journalAuditCreate(...args) },
    mouvementTresorerie: {
      updateMany: (...args: unknown[]) => mouvementTresorerieUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mouvementTresorerieDeleteMany(...args),
    },
    $transaction: (operations: unknown[]) => transaction(operations),
  },
}));

const requireModule = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(
  async () => ({ id: "user1" }),
);
vi.mock("@/lib/permissions", () => ({
  requireModule: (...args: unknown[]) => requireModule(...args),
  Module: { PAIEMENTS: "PAIEMENTS" },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/documents", () => ({
  enregistrerDocumentEtudiant: vi.fn(),
  nomFichierDocument: vi.fn(),
  supprimerFichierDocument: vi.fn(),
  nettoyerDossierEtudiantSiVide: vi.fn(),
}));
vi.mock("@/lib/tresorerie", () => ({ getOuCreerCategorieCotisations: vi.fn() }));

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

const {
  ajouterEcheanceAction,
  modifierMontantDuAction,
  modifierPaiementAction,
  supprimerPaiementAction,
} = await import("./actions");

function form(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

describe("validation des montants financiers", () => {
  afterEach(() => vi.clearAllMocks());

  it.each(["-10", "0", "-0.01"] as const)(
    "ajouterEcheanceAction refuse un montant %s (négatif ou nul)",
    async (montant) => {
      await expect(
        ajouterEcheanceAction(
          form({ dossierAnnuelId: "dos1", montant, dateEcheance: "2026-10-01" }),
        ),
      ).rejects.toMatchObject({ url: "/paiements/dos1?error=MONTANT_INVALIDE" });
      expect(echeanceCreate).not.toHaveBeenCalled();
    },
  );

  it("ajouterEcheanceAction accepte un montant strictement positif", async () => {
    echeanceCreate.mockResolvedValue({ id: "ech1" });
    await expect(
      ajouterEcheanceAction(
        form({ dossierAnnuelId: "dos1", montant: "150.50", dateEcheance: "2026-10-01" }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(echeanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ montant: "150.50" }) }),
    );
  });

  it("modifierMontantDuAction refuse un montant dû négatif", async () => {
    dossierAnnuelFindUnique.mockResolvedValue({ id: "dos1", montantDu: "100" });
    await expect(
      modifierMontantDuAction(form({ dossierAnnuelId: "dos1", montantDu: "-1" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?error=MONTANT_INVALIDE" });
    expect(dossierAnnuelUpdate).not.toHaveBeenCalled();
  });

  it("modifierMontantDuAction accepte 0 (exonération totale) contrairement à une échéance/un paiement", async () => {
    dossierAnnuelFindUnique.mockResolvedValue({ id: "dos1", montantDu: { toString: () => "100" } });
    await expect(
      modifierMontantDuAction(form({ dossierAnnuelId: "dos1", montantDu: "0" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(dossierAnnuelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { montantDu: "0" } }),
    );
  });
});

describe("modifierPaiementAction — point de correction unique (montant + chèque/prélèvement)", () => {
  afterEach(() => vi.clearAllMocks());

  it("corrige uniquement le montant d'un paiement en espèces (pas de cheque/prelevement)", async () => {
    paiementFindUnique.mockResolvedValue({
      id: "pai1",
      montant: { toString: () => "100" },
      echeance: { dossierAnnuelId: "dos1" },
      cheque: null,
      prelevement: null,
    });
    await expect(
      modifierPaiementAction(form({ dossierAnnuelId: "dos1", paiementId: "pai1", montant: "120" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(paiementUpdate).toHaveBeenCalledWith({ where: { id: "pai1" }, data: { montant: "120" } });
    expect(mouvementTresorerieUpdateMany).toHaveBeenCalledWith({
      where: { paiementId: "pai1" },
      data: { montant: "120" },
    });
    expect(chequeUpdate).not.toHaveBeenCalled();
    expect(prelevementUpdate).not.toHaveBeenCalled();
  });

  it("corrige montant + infos bancaires + statut d'un chèque en une seule soumission", async () => {
    paiementFindUnique.mockResolvedValue({
      id: "pai1",
      montant: { toString: () => "100" },
      echeance: { dossierAnnuelId: "dos1" },
      cheque: { id: "cheq1", statut: "RECU" },
      prelevement: null,
    });
    await expect(
      modifierPaiementAction(
        form({
          dossierAnnuelId: "dos1",
          paiementId: "pai1",
          montant: "100",
          banque: "Nouvelle banque",
          numero: "222",
          statut: "DEPOSE",
        }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(chequeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ banque: "Nouvelle banque", numero: "222", statut: "DEPOSE" }),
      }),
    );
    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: { statutChequeAvant: "RECU", statutChequeApres: "DEPOSE" },
        }),
      }),
    );
  });

  it("refuse un saut d'étape de statut de chèque (RECU -> ENCAISSE) sans rien écrire", async () => {
    paiementFindUnique.mockResolvedValue({
      id: "pai1",
      montant: { toString: () => "100" },
      echeance: { dossierAnnuelId: "dos1" },
      cheque: { id: "cheq1", statut: "RECU" },
      prelevement: null,
    });
    await expect(
      modifierPaiementAction(
        form({ dossierAnnuelId: "dos1", paiementId: "pai1", montant: "100", statut: "ENCAISSE" }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?error=TRANSITION_INVALIDE" });
    expect(chequeUpdate).not.toHaveBeenCalled();
    expect(paiementUpdate).not.toHaveBeenCalled();
  });

  it("corrige l'IBAN d'un prélèvement sans changement de statut", async () => {
    paiementFindUnique.mockResolvedValue({
      id: "pai1",
      montant: { toString: () => "100" },
      echeance: { dossierAnnuelId: "dos1" },
      cheque: null,
      prelevement: { id: "prel1", statut: "EMIS" },
    });
    await expect(
      modifierPaiementAction(
        form({ dossierAnnuelId: "dos1", paiementId: "pai1", montant: "100", iban: "FR002", statut: "EMIS" }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(prelevementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ iban: "FR002", statut: "EMIS" }) }),
    );
    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ details: {} }) }),
    );
  });

  it("refuse de faire repartir en arrière un prélèvement déjà rejeté (statut définitif)", async () => {
    paiementFindUnique.mockResolvedValue({
      id: "pai1",
      montant: { toString: () => "100" },
      echeance: { dossierAnnuelId: "dos1" },
      cheque: null,
      prelevement: { id: "prel1", statut: "REJETE" },
    });
    await expect(
      modifierPaiementAction(
        form({ dossierAnnuelId: "dos1", paiementId: "pai1", montant: "100", statut: "EMIS" }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?error=TRANSITION_INVALIDE" });
    expect(prelevementUpdate).not.toHaveBeenCalled();
  });
});

describe("annulation d'un paiement", () => {
  afterEach(() => vi.clearAllMocks());

  it("supprime le paiement et le mouvement de trésorerie associé", async () => {
    paiementFindUnique.mockResolvedValue({
      id: "pai1",
      montant: { toString: () => "100" },
      moyen: "ESPECES",
      echeanceId: "ech1",
      echeance: { dossierAnnuelId: "dos1" },
      cheque: null,
    });
    await expect(
      supprimerPaiementAction(form({ dossierAnnuelId: "dos1", paiementId: "pai1" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(mouvementTresorerieDeleteMany).toHaveBeenCalledWith({ where: { paiementId: "pai1" } });
    expect(paiementDelete).toHaveBeenCalledWith({ where: { id: "pai1" } });
    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "annulation_paiement", entiteId: "pai1" }),
      }),
    );
  });

  it("refuse d'annuler un paiement introuvable", async () => {
    paiementFindUnique.mockResolvedValue(null);
    await expect(
      supprimerPaiementAction(form({ dossierAnnuelId: "dos1", paiementId: "inconnu" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?error=PAIEMENT_INTROUVABLE" });
    expect(paiementDelete).not.toHaveBeenCalled();
  });
});
