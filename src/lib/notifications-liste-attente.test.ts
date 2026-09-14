import { afterEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const findMany = vi.fn();
const upsert = vi.fn();

// Même précaution que notifications-preinscription.test.ts : aucune méthode
// `delete`/`update` mockée sur `notificationListeAttente` — une notification
// devenue inactive (affectation promue) ne doit jamais être supprimée ni
// modifiée, seulement exclue par un `where` (voir
// notifications-liste-attente.ts).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationListeAttente: {
      count: (...args: unknown[]) => count(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
    lectureListeAttente: {
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

const {
  nombreNotificationsListeAttenteNonLues,
  dernieresNotificationsListeAttente,
  marquerNotificationListeAttenteLue,
} = await import("./notifications-liste-attente");

describe("nombreNotificationsListeAttenteNonLues", () => {
  afterEach(() => vi.clearAllMocks());

  it("compte les notifications sans ligne de lecture pour cet utilisateur, parmi les affectations toujours EN_ATTENTE", async () => {
    count.mockResolvedValueOnce(3);
    const resultat = await nombreNotificationsListeAttenteNonLues("u1");
    expect(resultat).toBe(3);
    expect(count.mock.calls[0][0].where).toEqual({
      lectures: { none: { utilisateurId: "u1" } },
      affectationCohorte: { statut: "EN_ATTENTE" },
    });
  });

  it("des utilisateurs différents peuvent obtenir des comptes différents (état de lecture individuel)", async () => {
    count.mockResolvedValueOnce(2);
    const pourA = await nombreNotificationsListeAttenteNonLues("userA");
    count.mockResolvedValueOnce(0);
    const pourB = await nombreNotificationsListeAttenteNonLues("userB");

    expect(pourA).toBe(2);
    expect(pourB).toBe(0);
    expect(count.mock.calls[0][0].where.lectures.none.utilisateurId).toBe("userA");
    expect(count.mock.calls[1][0].where.lectures.none.utilisateurId).toBe("userB");
  });
});

describe("dernieresNotificationsListeAttente", () => {
  afterEach(() => vi.clearAllMocks());

  it("mappe l'affectation liée (étudiant, cohorte) et calcule la lecture pour cet utilisateur", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: "n1",
        creeLe: new Date("2026-09-14T10:00:00Z"),
        affectationCohorte: {
          etudiantId: "e1",
          cohorteId: "c1",
          rangListeAttente: 2,
          etudiant: { nom: "Dupont", prenom: "Ali" },
          cohorte: { niveau: "Débutant", jour: "SAMEDI", section: { nom: "Langue Arabe" } },
        },
        lectures: [{ id: "l1" }],
      },
    ]);

    const notifications = await dernieresNotificationsListeAttente("u1");

    expect(notifications).toEqual([
      {
        id: "n1",
        etudiantId: "e1",
        nomEtudiant: "Dupont",
        prenomEtudiant: "Ali",
        cohorteId: "c1",
        sectionNom: "Langue Arabe",
        niveau: "Débutant",
        jour: "SAMEDI",
        rangListeAttente: 2,
        creeLe: new Date("2026-09-14T10:00:00Z"),
        lue: true,
      },
    ]);
    expect(findMany.mock.calls[0][0].include.lectures.where).toEqual({ utilisateurId: "u1" });
  });

  it("ne demande à Prisma que les notifications dont l'affectation est toujours EN_ATTENTE", async () => {
    findMany.mockResolvedValueOnce([]);
    await dernieresNotificationsListeAttente("u1");
    expect(findMany.mock.calls[0][0].where).toEqual({ affectationCohorte: { statut: "EN_ATTENTE" } });
  });
});

describe("marquerNotificationListeAttenteLue", () => {
  afterEach(() => vi.clearAllMocks());

  it("upsert la lecture (idempotent, ne touche que cet utilisateur)", async () => {
    upsert.mockResolvedValueOnce({});
    await marquerNotificationListeAttenteLue("n1", "u1");

    expect(upsert).toHaveBeenCalledWith({
      where: { notificationId_utilisateurId: { notificationId: "n1", utilisateurId: "u1" } },
      create: { notificationId: "n1", utilisateurId: "u1" },
      update: {},
    });
  });

  it("un second appel (clic répété) ne plante pas — même upsert rejoué", async () => {
    upsert.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    await marquerNotificationListeAttenteLue("n1", "u1");
    await marquerNotificationListeAttenteLue("n1", "u1");
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
