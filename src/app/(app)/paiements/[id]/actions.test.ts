import { afterEach, describe, expect, it, vi } from "vitest";

const echeanceCreate = vi.fn();
const echeanceFindUnique = vi.fn();
const paiementFindUnique = vi.fn();
const paiementDelete = vi.fn();
const dossierAnnuelFindUnique = vi.fn();
const dossierAnnuelUpdate = vi.fn();
const chequeFindUnique = vi.fn();
const chequeUpdate = vi.fn();
const prelevementFindUnique = vi.fn();
const prelevementUpdate = vi.fn();
const journalAuditCreate = vi.fn();
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
      delete: (...args: unknown[]) => paiementDelete(...args),
    },
    dossierAnnuel: {
      findUnique: (...args: unknown[]) => dossierAnnuelFindUnique(...args),
      update: (...args: unknown[]) => dossierAnnuelUpdate(...args),
    },
    cheque: {
      findUnique: (...args: unknown[]) => chequeFindUnique(...args),
      update: (...args: unknown[]) => chequeUpdate(...args),
    },
    prelevement: {
      findUnique: (...args: unknown[]) => prelevementFindUnique(...args),
      update: (...args: unknown[]) => prelevementUpdate(...args),
    },
    journalAudit: { create: (...args: unknown[]) => journalAuditCreate(...args) },
    mouvementTresorerie: {
      updateMany: vi.fn(),
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
  mettreAJourChequeAction,
  mettreAJourPrelevementAction,
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

describe("transitions de statut de chèque", () => {
  afterEach(() => vi.clearAllMocks());

  function cheque(statut: string) {
    return {
      id: "cheq1",
      statut,
      paiement: { echeance: { dossierAnnuelId: "dos1" } },
    };
  }

  it("refuse un saut d'étape RECU -> ENCAISSE", async () => {
    chequeFindUnique.mockResolvedValue(cheque("RECU"));
    await expect(
      mettreAJourChequeAction(form({ dossierAnnuelId: "dos1", chequeId: "cheq1", statut: "ENCAISSE" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?error=TRANSITION_INVALIDE" });
    expect(chequeUpdate).not.toHaveBeenCalled();
    expect(journalAuditCreate).not.toHaveBeenCalled();
  });

  it("refuse de faire repartir en arrière un chèque déjà encaissé (statut définitif)", async () => {
    chequeFindUnique.mockResolvedValue(cheque("ENCAISSE"));
    await expect(
      mettreAJourChequeAction(form({ dossierAnnuelId: "dos1", chequeId: "cheq1", statut: "RECU" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?error=TRANSITION_INVALIDE" });
    expect(chequeUpdate).not.toHaveBeenCalled();
  });

  it("autorise RECU -> DEPOSE et journalise le changement", async () => {
    chequeFindUnique.mockResolvedValue(cheque("RECU"));
    await expect(
      mettreAJourChequeAction(form({ dossierAnnuelId: "dos1", chequeId: "cheq1", statut: "DEPOSE" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(chequeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statut: "DEPOSE" }) }),
    );
    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "changement_statut_cheque",
          details: { avant: "RECU", apres: "DEPOSE" },
        }),
      }),
    );
  });

  it("resoumettre le même statut est un no-op silencieux, sans écriture ni audit", async () => {
    chequeFindUnique.mockResolvedValue(cheque("DEPOSE"));
    await expect(
      mettreAJourChequeAction(form({ dossierAnnuelId: "dos1", chequeId: "cheq1", statut: "DEPOSE" })),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(chequeUpdate).not.toHaveBeenCalled();
    expect(journalAuditCreate).not.toHaveBeenCalled();
  });
});

describe("transitions de statut de prélèvement", () => {
  afterEach(() => vi.clearAllMocks());

  function prelevement(statut: string) {
    return {
      id: "prel1",
      statut,
      paiement: { echeance: { dossierAnnuelId: "dos1" } },
    };
  }

  it("refuse de faire repartir en arrière un prélèvement déjà rejeté (statut définitif)", async () => {
    prelevementFindUnique.mockResolvedValue(prelevement("REJETE"));
    await expect(
      mettreAJourPrelevementAction(
        form({ dossierAnnuelId: "dos1", prelevementId: "prel1", statut: "EMIS" }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?error=TRANSITION_INVALIDE" });
    expect(prelevementUpdate).not.toHaveBeenCalled();
  });

  it("autorise EMIS -> ENCAISSE et journalise le changement", async () => {
    prelevementFindUnique.mockResolvedValue(prelevement("EMIS"));
    await expect(
      mettreAJourPrelevementAction(
        form({ dossierAnnuelId: "dos1", prelevementId: "prel1", statut: "ENCAISSE" }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(prelevementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statut: "ENCAISSE" }) }),
    );
    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "changement_statut_prelevement",
          details: { avant: "EMIS", apres: "ENCAISSE" },
        }),
      }),
    );
  });
});

describe("correction des informations d'un chèque/prélèvement sans changement de statut", () => {
  afterEach(() => vi.clearAllMocks());

  it("met à jour la banque/le numéro sans exiger de transition de statut", async () => {
    chequeFindUnique.mockResolvedValue({
      id: "cheq1",
      statut: "RECU",
      banque: "Ancienne banque",
      numero: "111",
      titulaireNom: null,
      titulairePrenom: null,
      paiement: { echeance: { dossierAnnuelId: "dos1" } },
    });
    await expect(
      mettreAJourChequeAction(
        form({
          dossierAnnuelId: "dos1",
          chequeId: "cheq1",
          statut: "RECU",
          banque: "Nouvelle banque",
          numero: "222",
        }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(chequeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ banque: "Nouvelle banque", numero: "222", statut: "RECU" }),
      }),
    );
    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "modification_infos_cheque" }),
      }),
    );
  });

  it("met à jour l'IBAN d'un prélèvement sans changement de statut", async () => {
    prelevementFindUnique.mockResolvedValue({
      id: "prel1",
      statut: "EMIS",
      iban: "FR001",
      bic: null,
      titulaire: null,
      referenceMandat: null,
      paiement: { echeance: { dossierAnnuelId: "dos1" } },
    });
    await expect(
      mettreAJourPrelevementAction(
        form({ dossierAnnuelId: "dos1", prelevementId: "prel1", statut: "EMIS", iban: "FR002" }),
      ),
    ).rejects.toMatchObject({ url: "/paiements/dos1?ok=1" });
    expect(prelevementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ iban: "FR002" }) }),
    );
    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "modification_infos_prelevement" }),
      }),
    );
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
