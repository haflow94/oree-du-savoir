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
// Supporte les deux formes utilisées par les actions testées :
// prisma.$transaction([...]) (fusionnerDoublonAction) et
// prisma.$transaction(async (tx) => {...}) (supprimerEtudiantAction) — dans
// ce second cas, `tx` réutilise directement les mêmes mocks que `prisma.*`
// ci-dessus, aucune différence de comportement pour les actions testées.
const transaction = vi.fn((operationsOuCallback: unknown) =>
  typeof operationsOuCallback === "function"
    ? (operationsOuCallback as (tx: unknown) => unknown)({
        etudiant: { findUnique: etudiantFindUnique, delete: etudiantDelete },
        journalAudit: { create: journalAuditCreate },
      })
    : Promise.all(operationsOuCallback as unknown[]),
);

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
const nettoyerDossierEtudiantSiVide = vi.fn();
const dossierDocumentaireComplet = vi.fn();
const statutDocumentsRequis = vi.fn().mockReturnValue({});
const renommerDossierEtudiant = vi.fn().mockResolvedValue(true);
const deplacerDocumentVersEtudiant = vi.fn();
const renommerCheminBrut = vi.fn().mockResolvedValue(true);
// Fonctions PURES (voir lib/documents-nommage.ts) réimportées directement
// depuis ce module sans "server-only" : celui-ci lève dès qu'il est exécuté
// hors d'un composant serveur, y compris dans ce contexte de test.
vi.mock("@/lib/documents", async () => {
  const nommage = await import("@/lib/documents-nommage");
  return {
    ...nommage,
    enregistrerDocumentEtudiant: vi.fn(),
    supprimerFichierDocument: (...args: unknown[]) => supprimerFichierDocument(...args),
    nettoyerDossierEtudiantSiVide: (...args: unknown[]) => nettoyerDossierEtudiantSiVide(...args),
    dossierDocumentaireComplet: (...args: unknown[]) => dossierDocumentaireComplet(...args),
    statutDocumentsRequis: (...args: unknown[]) => statutDocumentsRequis(...args),
    renommerDossierEtudiant: (...args: unknown[]) => renommerDossierEtudiant(...args),
    deplacerDocumentVersEtudiant: (...args: unknown[]) => deplacerDocumentVersEtudiant(...args),
    renommerCheminBrut: (...args: unknown[]) => renommerCheminBrut(...args),
  };
});

vi.mock("@/lib/doublons-etudiant", () => ({ redetecterDoublonApresModification: vi.fn() }));
vi.mock("@/lib/dossier/context", () => ({ construireContexteDossierEtudiant: vi.fn() }));
vi.mock("@/lib/dossier/render", () => ({ rendreDossierHtml: vi.fn(), rendreDossierPdf: vi.fn() }));
const synchroniserInscriptionsClasse = vi.fn();
vi.mock("@/lib/cohortes", () => ({
  affecterEtudiantACohorte: vi.fn(),
  synchroniserInscriptionsClasse: (...args: unknown[]) => synchroniserInscriptionsClasse(...args),
}));

const { fusionnerDoublonAction, validerInscriptionAction, supprimerEtudiantAction } =
  await import("./actions");

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
        // Même nom/prénom que le doublon : aucun renommage physique déclenché
        // par ce test, qui porte sur le reparentage des notifications — voir
        // les tests dédiés au renommage/déplacement physique.
        matricule: "000001",
        nom: "Dupont",
        prenom: "Ali",
        responsables: [],
        inscriptions: [],
        documents: [],
        dossiersAnnuels: [],
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
    const operationsTransmises = transaction.mock.calls[0][0] as unknown[];
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

// Forçage de la validation malgré un dossier incomplet : réservé au Bureau,
// via une case de confirmation explicite (`force=1`) — voir la page pour le
// formulaire, actions.ts pour la revérification serveur du rôle.
describe("validerInscriptionAction — forçage réservé au Bureau", () => {
  afterEach(() => vi.clearAllMocks());

  function etudiantIncomplet(overrides: Record<string, unknown> = {}) {
    return {
      id: "et1",
      nom: "Dupont",
      prenom: "Léo",
      sectionSouhaiteeId: null,
      documents: [],
      _count: { dossiersAnnuels: 0 },
      ...overrides,
    };
  }

  function formulaireForce(etudiantId: string): FormData {
    const fd = formulaire(etudiantId);
    fd.set("force", "1");
    return fd;
  }

  it("un Bureau peut forcer la validation d'un dossier incomplet", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(etudiantIncomplet());
    dossierDocumentaireComplet.mockReturnValue(false);
    etudiantUpdate.mockResolvedValue({});
    journalAuditCreate.mockResolvedValue({});
    synchroniserInscriptionsClasse.mockResolvedValue(undefined);
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(validerInscriptionAction(formulaireForce("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants/et1?ok=1",
    );

    expect(etudiantUpdate).toHaveBeenCalledWith({
      where: { id: "et1" },
      data: { statutInscription: "VALIDE" },
    });
    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "validation_inscription_forcee" }),
      }),
    );
  });

  it("un rôle non-Bureau (ex. Administration) ne peut pas forcer, même avec force=1", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "ADMINISTRATION" });
    etudiantFindUnique.mockResolvedValue(etudiantIncomplet());
    dossierDocumentaireComplet.mockReturnValue(false);
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(validerInscriptionAction(formulaireForce("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants/et1?error=FORCAGE_RESERVE_BUREAU",
    );
    expect(etudiantUpdate).not.toHaveBeenCalled();
  });

  it("force=1 est sans effet quand le dossier est déjà complet (chemin normal, pas de forçage)", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(etudiantIncomplet({ _count: { dossiersAnnuels: 1 } }));
    dossierDocumentaireComplet.mockReturnValue(true);
    etudiantUpdate.mockResolvedValue({});
    journalAuditCreate.mockResolvedValue({});
    synchroniserInscriptionsClasse.mockResolvedValue(undefined);
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(validerInscriptionAction(formulaireForce("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants/et1?ok=1",
    );

    expect(journalAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "validation_inscription" }),
      }),
    );
  });
});

// Un DossierAnnuel existe dès la préinscription (voir
// app/preinscription/actions.ts), avant toute signature ou tout paiement :
// le bloquer inconditionnellement empêchait de supprimer une préinscription
// de test ou abandonnée. Seul un dossier réellement engagé (signature
// envoyée/faite, ou un paiement déjà apporté sur une de ses échéances) doit
// rester protégé.
describe("supprimerEtudiantAction — dossier annuel engagé ou non", () => {
  afterEach(() => vi.clearAllMocks());

  function etudiant(overrides: Record<string, unknown> = {}) {
    return {
      id: "et1",
      nom: "Martin",
      prenom: "Karima",
      documents: [{ id: "doc1", cheminRelatif: "etudiants/2026-2027/Martin Karima/photo.jpeg" }],
      dossiersAnnuels: [],
      _count: { inscriptions: 0, presences: 0 },
      ...overrides,
    };
  }

  it("supprime un étudiant dont le dossier annuel n'a ni signature envoyée ni paiement", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(
      etudiant({
        dossiersAnnuels: [
          { statutSignature: "A_VERIFIER", echeances: [{ _count: { paiements: 0 } }] },
        ],
      }),
    );
    etudiantDelete.mockResolvedValue({});
    journalAuditCreate.mockResolvedValue({});
    supprimerFichierDocument.mockResolvedValue(undefined);
    nettoyerDossierEtudiantSiVide.mockResolvedValue(undefined);
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(supprimerEtudiantAction(formulaire("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants?supprime=1",
    );

    expect(etudiantDelete).toHaveBeenCalledWith({ where: { id: "et1" } });
    expect(supprimerFichierDocument).toHaveBeenCalledWith(
      "etudiants/2026-2027/Martin Karima/photo.jpeg",
    );
    // Nettoyage du dossier physique devenu vide (voir lib/documents.ts) :
    // dérivé du chemin d'un des documents supprimés, jamais reconstruit à
    // la main depuis nom/prénom/matricule.
    expect(nettoyerDossierEtudiantSiVide).toHaveBeenCalledWith(
      "etudiants/2026-2027/Martin Karima/photo.jpeg",
    );
  });

  it("refuse de supprimer un étudiant dont la signature a déjà été envoyée", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(
      etudiant({ dossiersAnnuels: [{ statutSignature: "ENVOYEE_SIGNATURE", echeances: [] }] }),
    );
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(supprimerEtudiantAction(formulaire("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants/et1?error=ETUDIANT_UTILISE",
    );
    expect(etudiantDelete).not.toHaveBeenCalled();
  });

  it("refuse de supprimer un étudiant dont une échéance a déjà un paiement, même sans signature", async () => {
    requireModule.mockResolvedValue({ id: "staff1", role: "BUREAU" });
    etudiantFindUnique.mockResolvedValue(
      etudiant({
        dossiersAnnuels: [
          { statutSignature: "A_VERIFIER", echeances: [{ _count: { paiements: 1 } }] },
        ],
      }),
    );
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    await expect(supprimerEtudiantAction(formulaire("et1"))).rejects.toThrow(
      "REDIRECT:/etudiants/et1?error=ETUDIANT_UTILISE",
    );
    expect(etudiantDelete).not.toHaveBeenCalled();
  });
});
