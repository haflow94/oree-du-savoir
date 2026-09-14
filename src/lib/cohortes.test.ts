import { afterEach, describe, expect, it, vi } from "vitest";

const cohorteFindUnique = vi.fn();
const etudiantFindUnique = vi.fn();
const affectationFindUnique = vi.fn();
const affectationFindMany = vi.fn();
const affectationCount = vi.fn();
const classeFindMany = vi.fn();
const inscriptionClasseCreateMany = vi.fn();
const $transaction = vi.fn();

const etudiantFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cohorte: { findUnique: (...a: unknown[]) => cohorteFindUnique(...a) },
    etudiant: {
      findUnique: (...a: unknown[]) => etudiantFindUnique(...a),
      findMany: (...a: unknown[]) => etudiantFindMany(...a),
    },
    affectationCohorte: {
      findUnique: (...a: unknown[]) => affectationFindUnique(...a),
      findMany: (...a: unknown[]) => affectationFindMany(...a),
      count: (...a: unknown[]) => affectationCount(...a),
      create: (data: unknown) => ({ __op: "affectationCohorte.create", data }),
    },
    classe: { findMany: (...a: unknown[]) => classeFindMany(...a) },
    inscriptionClasse: {
      createMany: (...a: unknown[]) => {
        inscriptionClasseCreateMany(...a);
        return { __op: "inscriptionClasse.createMany", data: a[0] };
      },
    },
    journalAudit: { create: (data: unknown) => ({ __op: "journalAudit.create", data }) },
    $transaction: (ops: unknown[]) => $transaction(ops),
  },
}));

const { affecterEtudiantACohorte, synchroniserInscriptionsClasse, etudiantsValidesSansClasse } =
  await import("./cohortes");

function cohorte() {
  return { id: "cohorte-1", sectionId: "section-1", niveau: "Débutant", jour: "SAMEDI" };
}

describe("affecterEtudiantACohorte — règle signature ≠ validation finale", () => {
  afterEach(() => vi.clearAllMocks());

  it("scénario 4 — n'inscrit JAMAIS en classe effective un étudiant non validé, même si une place est disponible", async () => {
    cohorteFindUnique.mockResolvedValueOnce(cohorte());
    etudiantFindUnique.mockResolvedValueOnce({ statutInscription: "PREINSCRIT" });
    affectationFindUnique.mockResolvedValueOnce(null);
    classeFindMany.mockResolvedValueOnce([{ id: "classe-1", salle: null }]);
    affectationCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    $transaction.mockResolvedValueOnce([]);

    const resultat = await affecterEtudiantACohorte({
      etudiantId: "etu-1",
      cohorteId: "cohorte-1",
      anneeScolaireId: "annee-1",
      utilisateurId: "user-1",
    });

    expect(resultat).toEqual({ statut: "AFFECTE" });
    const operations = $transaction.mock.calls[0][0] as { __op: string }[];
    // L'AffectationCohorte est bien créée (la cohorte est "identifiée")…
    expect(operations.some((op) => op.__op === "affectationCohorte.create")).toBe(true);
    // … mais AUCUNE InscriptionClasse : pas de fan-out avant validation finale.
    expect(operations.some((op) => op.__op === "inscriptionClasse.createMany")).toBe(false);
  });

  it("scénario 5 — un étudiant déjà validé obtient bien son inscription effective dès l'affectation", async () => {
    cohorteFindUnique.mockResolvedValueOnce(cohorte());
    etudiantFindUnique.mockResolvedValueOnce({ statutInscription: "VALIDE" });
    affectationFindUnique.mockResolvedValueOnce(null);
    classeFindMany.mockResolvedValueOnce([
      { id: "classe-1", salle: null },
      { id: "classe-2", salle: null },
    ]);
    affectationCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    $transaction.mockResolvedValueOnce([]);

    await affecterEtudiantACohorte({
      etudiantId: "etu-2",
      cohorteId: "cohorte-1",
      anneeScolaireId: "annee-1",
      utilisateurId: "user-1",
    });

    const operations = $transaction.mock.calls[0][0] as { __op: string; data?: { data?: unknown[] } }[];
    const fanOut = operations.find((op) => op.__op === "inscriptionClasse.createMany");
    expect(fanOut).toBeDefined();
    expect((fanOut!.data!.data as unknown[]).length).toBe(2);
  });

  it("ne fait jamais de fan-out quand la cohorte est complète (liste d'attente), même si l'étudiant est déjà validé", async () => {
    cohorteFindUnique.mockResolvedValueOnce(cohorte());
    etudiantFindUnique.mockResolvedValueOnce({ statutInscription: "VALIDE" });
    affectationFindUnique.mockResolvedValueOnce(null);
    classeFindMany.mockResolvedValueOnce([{ id: "classe-1", salle: { capaciteMax: 1 } }]);
    affectationCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0); // déjà 1 affecté = complet
    $transaction.mockResolvedValueOnce([]);

    const resultat = await affecterEtudiantACohorte({
      etudiantId: "etu-3",
      cohorteId: "cohorte-1",
      anneeScolaireId: "annee-1",
      utilisateurId: "user-1",
    });

    expect(resultat).toEqual({ statut: "EN_ATTENTE" });
    const operations = $transaction.mock.calls[0][0] as { __op: string }[];
    expect(operations.some((op) => op.__op === "inscriptionClasse.createMany")).toBe(false);
  });

  it("cohorte introuvable : ne touche rien", async () => {
    cohorteFindUnique.mockResolvedValueOnce(null);
    const resultat = await affecterEtudiantACohorte({
      etudiantId: "etu-1",
      cohorteId: "inconnue",
      anneeScolaireId: "annee-1",
      utilisateurId: "user-1",
    });
    expect(resultat).toEqual({ statut: "COHORTE_INTROUVABLE" });
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe("synchroniserInscriptionsClasse — rattrapage à la validation finale (scénario 3)", () => {
  afterEach(() => vi.clearAllMocks());

  it("scénario 3 — une classe déjà identifiée avant validation devient effective une fois la validation posée", async () => {
    affectationFindMany.mockResolvedValueOnce([{ cohorteId: "cohorte-1", anneeScolaireId: "annee-1" }]);
    classeFindMany.mockResolvedValueOnce([{ id: "classe-1" }]);

    await synchroniserInscriptionsClasse("etu-1");

    expect(inscriptionClasseCreateMany).toHaveBeenCalledWith({
      data: [{ etudiantId: "etu-1", classeId: "classe-1" }],
      skipDuplicates: true,
    });
  });

  it("ne fait rien si aucune AffectationCohorte AFFECTE n'existe", async () => {
    affectationFindMany.mockResolvedValueOnce([]);
    await synchroniserInscriptionsClasse("etu-1");
    expect(classeFindMany).not.toHaveBeenCalled();
  });
});

describe("etudiantsValidesSansClasse — scénario 3 (visibilité admin)", () => {
  afterEach(() => vi.clearAllMocks());

  it("interroge uniquement les étudiants VALIDE sans InscriptionClasse pour l'année active", async () => {
    etudiantFindMany.mockResolvedValueOnce([{ id: "etu-1", nom: "Dupont", prenom: "A", misAJourLe: new Date() }]);

    const resultat = await etudiantsValidesSansClasse("annee-1");

    expect(resultat).toHaveLength(1);
    const conditions = etudiantFindMany.mock.calls[0][0].where;
    expect(conditions.statutInscription).toBe("VALIDE");
    expect(conditions.inscriptions.none.classe.anneeScolaireId).toBe("annee-1");
  });
});
