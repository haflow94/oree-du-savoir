import { afterEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const findMany = vi.fn();
const upsert = vi.fn();

// Volontairement aucune méthode `delete`/`deleteMany`/`update` mockée sur
// `notificationPreinscription` : une notification devenue « inactive »
// (dossier validé) ne doit jamais être supprimée ni modifiée, seulement
// exclue par un `where` (voir notifications-preinscription.ts) — si
// l'implémentation tentait un jour d'y toucher, l'appel échouerait ici
// (méthode absente du mock), faisant échouer le test correspondant.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreinscription: {
      count: (...args: unknown[]) => count(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
    lecturePreinscription: {
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

const {
  nombreNotificationsPreinscriptionNonLues,
  dernieresNotificationsPreinscription,
  marquerNotificationPreinscriptionLue,
} = await import("./notifications-preinscription");

describe("nombreNotificationsPreinscriptionNonLues", () => {
  afterEach(() => vi.clearAllMocks());

  it("compte les notifications sans ligne de lecture pour cet utilisateur, parmi les préinscriptions actives", async () => {
    count.mockResolvedValueOnce(3);
    const resultat = await nombreNotificationsPreinscriptionNonLues("u1");
    expect(resultat).toBe(3);
    expect(count.mock.calls[0][0].where).toEqual({
      lectures: { none: { utilisateurId: "u1" } },
      etudiant: { statutInscription: "PREINSCRIT" },
    });
  });

  // Le dossier passe VALIDE dans validerInscriptionAction
  // ((app)/etudiants/[id]/actions.ts), jamais ici : ce test vérifie
  // seulement que la fonction demande à Prisma de ne compter que les
  // préinscriptions encore PREINSCRIT — le filtre réel (exclusion d'une
  // notification VALIDE) est de la responsabilité de Postgres, pas de
  // l'application, voir la description du comportement dans
  // notifications-preinscription.ts.
  it("filtre sur statutInscription = PREINSCRIT, jamais un autre statut", async () => {
    count.mockResolvedValueOnce(0);
    await nombreNotificationsPreinscriptionNonLues("u1");
    expect(count.mock.calls[0][0].where.etudiant).toEqual({ statutInscription: "PREINSCRIT" });
  });

  it("des utilisateurs différents peuvent obtenir des comptes différents (état de lecture individuel)", async () => {
    count.mockResolvedValueOnce(2);
    const pourA = await nombreNotificationsPreinscriptionNonLues("userA");
    count.mockResolvedValueOnce(0);
    const pourB = await nombreNotificationsPreinscriptionNonLues("userB");

    expect(pourA).toBe(2);
    expect(pourB).toBe(0);
    expect(count.mock.calls[0][0].where.lectures.none.utilisateurId).toBe("userA");
    expect(count.mock.calls[1][0].where.lectures.none.utilisateurId).toBe("userB");
  });
});

describe("dernieresNotificationsPreinscription", () => {
  afterEach(() => vi.clearAllMocks());

  it("marque lue une notification dont la lecture de cet utilisateur est présente", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: "n1",
        etudiantId: "e1",
        creeLe: new Date("2026-09-07T10:00:00Z"),
        etudiant: { nom: "Dupont", prenom: "Ali" },
        lectures: [{ id: "l1" }],
      },
      {
        id: "n2",
        etudiantId: "e2",
        creeLe: new Date("2026-09-07T09:00:00Z"),
        etudiant: { nom: "Martin", prenom: "Yasmine" },
        lectures: [],
      },
    ]);

    const notifications = await dernieresNotificationsPreinscription("u1");

    expect(notifications).toEqual([
      { id: "n1", etudiantId: "e1", nom: "Dupont", prenom: "Ali", creeLe: new Date("2026-09-07T10:00:00Z"), lue: true },
      { id: "n2", etudiantId: "e2", nom: "Martin", prenom: "Yasmine", creeLe: new Date("2026-09-07T09:00:00Z"), lue: false },
    ]);
    // La lecture est filtrée par utilisateur directement dans la requête,
    // jamais recalculée sur un état global.
    expect(findMany.mock.calls[0][0].include.lectures.where).toEqual({ utilisateurId: "u1" });
  });

  it("ne demande à Prisma que les préinscriptions actives (statutInscription = PREINSCRIT)", async () => {
    findMany.mockResolvedValueOnce([]);
    await dernieresNotificationsPreinscription("u1");
    expect(findMany.mock.calls[0][0].where).toEqual({ etudiant: { statutInscription: "PREINSCRIT" } });
  });

  it("le filtre par statut n'affecte pas le calcul de lecture individuel (deux utilisateurs, deux résultats indépendants)", async () => {
    const ligne = {
      id: "n1",
      etudiantId: "e1",
      creeLe: new Date("2026-09-07T10:00:00Z"),
      etudiant: { nom: "Dupont", prenom: "Ali" },
    };
    findMany.mockResolvedValueOnce([{ ...ligne, lectures: [{ id: "l1" }] }]);
    const pourA = await dernieresNotificationsPreinscription("userA");
    findMany.mockResolvedValueOnce([{ ...ligne, lectures: [] }]);
    const pourB = await dernieresNotificationsPreinscription("userB");

    expect(pourA[0].lue).toBe(true);
    expect(pourB[0].lue).toBe(false);
  });
});

describe("marquerNotificationPreinscriptionLue", () => {
  afterEach(() => vi.clearAllMocks());

  it("upsert la lecture (idempotent, ne touche que cet utilisateur)", async () => {
    upsert.mockResolvedValueOnce({});
    await marquerNotificationPreinscriptionLue("n1", "u1");

    expect(upsert).toHaveBeenCalledWith({
      where: { notificationId_utilisateurId: { notificationId: "n1", utilisateurId: "u1" } },
      create: { notificationId: "n1", utilisateurId: "u1" },
      update: {},
    });
  });

  it("un second appel (clic répété) ne plante pas — même upsert rejoué", async () => {
    upsert.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    await marquerNotificationPreinscriptionLue("n1", "u1");
    await marquerNotificationPreinscriptionLue("n1", "u1");
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
