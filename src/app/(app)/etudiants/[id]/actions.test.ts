import { afterEach, describe, expect, it, vi } from "vitest";

// fusionnerDoublonAction touche plusieurs modèles dans une seule transaction
// (voir le fichier testé) : seuls ceux réellement utilisés sont mockés avec
// un comportement, les autres imports du module (dossier/context,
// dossier/render, cohortes) sont stubés vides — non appelés par cette
// action, juste nécessaires pour que le module se charge.
const etudiantFindUnique = vi.fn();
const etudiantUpdate = vi.fn();
const etudiantDelete = vi.fn();
const inscriptionClasseUpdate = vi.fn();
const responsableLegalUpdate = vi.fn();
const documentUpdateMany = vi.fn();
const documentDeleteMany = vi.fn();
const notificationPreinscriptionUpdateMany = vi.fn();
const journalAuditCreate = vi.fn();
const transaction = vi.fn((operations: unknown[]) => Promise.all(operations));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    etudiant: {
      findUnique: (...args: unknown[]) => etudiantFindUnique(...args),
      update: (...args: unknown[]) => etudiantUpdate(...args),
      delete: (...args: unknown[]) => etudiantDelete(...args),
    },
    inscriptionClasse: { update: (...args: unknown[]) => inscriptionClasseUpdate(...args) },
    responsableLegal: { update: (...args: unknown[]) => responsableLegalUpdate(...args) },
    document: {
      updateMany: (...args: unknown[]) => documentUpdateMany(...args),
      deleteMany: (...args: unknown[]) => documentDeleteMany(...args),
    },
    notificationPreinscription: {
      updateMany: (...args: unknown[]) => notificationPreinscriptionUpdateMany(...args),
    },
    journalAudit: { create: (...args: unknown[]) => journalAuditCreate(...args) },
    $transaction: (operations: unknown[]) => transaction(operations),
  },
}));

const requireModule = vi.fn();
vi.mock("@/lib/permissions", () => ({
  requireModule: (...args: unknown[]) => requireModule(...args),
  Module: { ETUDIANTS: "ETUDIANTS" },
}));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const supprimerFichierDocument = vi.fn();
const dossierDocumentaireComplet = vi.fn();
vi.mock("@/lib/documents", () => ({
  enregistrerDocumentEtudiant: vi.fn(),
  supprimerFichierDocument: (...args: unknown[]) => supprimerFichierDocument(...args),
  dossierDocumentaireComplet: (...args: unknown[]) => dossierDocumentaireComplet(...args),
}));

vi.mock("@/lib/doublons-etudiant", () => ({ redetecterDoublonApresModification: vi.fn() }));
vi.mock("@/lib/dossier/context", () => ({ construireContexteDossierEtudiant: vi.fn() }));
vi.mock("@/lib/dossier/render", () => ({ rendreDossierHtml: vi.fn(), rendreDossierPdf: vi.fn() }));
const synchroniserInscriptionsClasse = vi.fn();
vi.mock("@/lib/cohortes", () => ({
  affecterEtudiantACohorte: vi.fn(),
  synchroniserInscriptionsClasse: (...args: unknown[]) => synchroniserInscriptionsClasse(...args),
}));

const { fusionnerDoublonAction, validerInscriptionAction } = await import("./actions");

function formulaire(etudiantId: string): FormData {
  const fd = new FormData();
  fd.set("etudiantId", etudiantId);
  return fd;
}

describe("fusionnerDoublonAction — conservation de l'historique des notifications", () => {
  afterEach(() => vi.clearAllMocks());

  it("rattache les notifications de préinscription du doublon supprimé à la fiche conservée, dans la même transaction", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });

    // Le doublon (fiche à supprimer) : aucun dossier annuel ni présence,
    // sinon fusionnerDoublonAction refuse la fusion avant d'atteindre la
    // transaction — voir DOUBLON_NON_FUSIONNABLE dans le fichier testé.
    etudiantFindUnique
      .mockResolvedValueOnce({
        id: "doublon1",
        nom: "Dupont",
        prenom: "Ali",
        doublonPotentielId: "existant1",
        responsables: [],
        inscriptions: [],
        documents: [],
        _count: { dossiersAnnuels: 0, presences: 0 },
      })
      .mockResolvedValueOnce({
        id: "existant1",
        responsables: [],
        inscriptions: [],
        documents: [],
      });

    etudiantUpdate.mockResolvedValue({});
    notificationPreinscriptionUpdateMany.mockResolvedValue({ count: 1 });
    etudiantDelete.mockResolvedValue({});
    journalAuditCreate.mockResolvedValue({});
    redirect.mockImplementation(() => {
      throw new Error("REDIRECT");
    });

    await expect(fusionnerDoublonAction(formulaire("doublon1"))).rejects.toThrow("REDIRECT");

    // Reparentage explicite AVANT la suppression de la fiche doublon
    // (onDelete: Cascade sur NotificationPreinscription.etudiantId, voir
    // prisma/schema.prisma) : sans ce reparentage, la suppression
    // effacerait silencieusement l'historique de notification.
    expect(notificationPreinscriptionUpdateMany).toHaveBeenCalledWith({
      where: { etudiantId: "doublon1" },
      data: { etudiantId: "existant1" },
    });
    expect(etudiantDelete).toHaveBeenCalledWith({ where: { id: "doublon1" } });

    // Les deux opérations font partie du même tableau passé à
    // $transaction : la fusion reste atomique (tout ou rien).
    const operationsTransmises = transaction.mock.calls[0][0];
    expect(operationsTransmises.length).toBeGreaterThanOrEqual(2);
  });
});

// Règle corrigée suite au bilan d'audit du 07/09/2026 : "dossier de paiement
// ouvert" (existence d'un DossierAnnuel, voir validerInscriptionAction dans
// le fichier testé) — jamais "au moins un paiement encaissé". Ces tests
// n'incluent donc plus d'échéances/paiements : la fonction testée ne les
// regarde plus du tout, c'est précisément ce que ces scénarios vérifient.
describe("validerInscriptionAction — dossier de paiement ouvert (pas paiement encaissé)", () => {
  afterEach(() => vi.clearAllMocks());

  function etudiantPreinscrit(overrides: Record<string, unknown> = {}) {
    return {
      id: "et1",
      nom: "Dupont",
      prenom: "Léo",
      sectionSouhaiteeId: null, // évite la génération best-effort du dossier PDF, hors sujet ici
      documents: [],
      _count: { dossiersAnnuels: 1 },
      ...overrides,
    };
  }

  function attendreRedirectionSucces() {
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  }

  it("scénario 1 — dossier de paiement ouvert + aucun paiement encaissé : validation autorisée si le dossier est signé", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(etudiantPreinscrit({ _count: { dossiersAnnuels: 1 } }));
    dossierDocumentaireComplet.mockReturnValue(true); // inclut le dossier signé, voir TYPES_DOCUMENTS_REQUIS
    etudiantUpdate.mockResolvedValue({});
    journalAuditCreate.mockResolvedValue({});
    synchroniserInscriptionsClasse.mockResolvedValue(undefined);
    attendreRedirectionSucces();

    await expect(validerInscriptionAction(formulaire("et1"))).rejects.toThrow("REDIRECT:/etudiants/et1?ok=1");

    expect(etudiantUpdate).toHaveBeenCalledWith({
      where: { id: "et1" },
      data: { statutInscription: "VALIDE" },
    });
  });

  it("scénario 2 — dossier de paiement ouvert + paiement partiel : validation autorisée (même chemin de code que le scénario 1 — la fonction ne regarde plus l'état des paiements)", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(etudiantPreinscrit());
    dossierDocumentaireComplet.mockReturnValue(true);
    etudiantUpdate.mockResolvedValue({});
    journalAuditCreate.mockResolvedValue({});
    synchroniserInscriptionsClasse.mockResolvedValue(undefined);
    attendreRedirectionSucces();

    await expect(validerInscriptionAction(formulaire("et1"))).rejects.toThrow("REDIRECT:/etudiants/et1?ok=1");
    expect(etudiantUpdate).toHaveBeenCalled();
  });

  it("scénario 3 — dossier de paiement ouvert + paiement soldé : validation autorisée (même chemin de code que les scénarios 1/2)", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(etudiantPreinscrit());
    dossierDocumentaireComplet.mockReturnValue(true);
    etudiantUpdate.mockResolvedValue({});
    journalAuditCreate.mockResolvedValue({});
    synchroniserInscriptionsClasse.mockResolvedValue(undefined);
    attendreRedirectionSucces();

    await expect(validerInscriptionAction(formulaire("et1"))).rejects.toThrow("REDIRECT:/etudiants/et1?ok=1");
    expect(etudiantUpdate).toHaveBeenCalled();
  });

  it("scénario 4 — aucun dossier de paiement ouvert : validation refusée, même si le dossier documentaire est par ailleurs complet", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(etudiantPreinscrit({ _count: { dossiersAnnuels: 0 } }));
    dossierDocumentaireComplet.mockReturnValue(true);
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(validerInscriptionAction(formulaire("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants/et1?error=DOSSIER_INCOMPLET",
    );
    expect(etudiantUpdate).not.toHaveBeenCalled();
  });

  it("scénario 5 — dossier non signé (dossier documentaire incomplet) + dossier de paiement ouvert : validation refusée", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(etudiantPreinscrit({ _count: { dossiersAnnuels: 1 } }));
    dossierDocumentaireComplet.mockReturnValue(false);
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(validerInscriptionAction(formulaire("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants/et1?error=DOSSIER_INCOMPLET",
    );
    expect(etudiantUpdate).not.toHaveBeenCalled();
  });

  it("scénario 6 — dossier signé + aucun dossier de paiement ouvert : validation refusée", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(etudiantPreinscrit({ _count: { dossiersAnnuels: 0 } }));
    dossierDocumentaireComplet.mockReturnValue(true);
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(validerInscriptionAction(formulaire("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants/et1?error=DOSSIER_INCOMPLET",
    );
    expect(etudiantUpdate).not.toHaveBeenCalled();
  });
});
