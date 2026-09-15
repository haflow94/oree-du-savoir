import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const parametresRelanceFindFirst = vi.fn();
const utilisateurFindMany = vi.fn();
const chequeFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    parametresRelance: { findFirst: (...args: unknown[]) => parametresRelanceFindFirst(...args) },
    utilisateur: { findMany: (...args: unknown[]) => utilisateurFindMany(...args) },
    cheque: { findMany: (...args: unknown[]) => chequeFindMany(...args) },
  },
}));

const { GET } = await import("./route");

const SECRET = "s".repeat(64);
const JOUR = 24 * 60 * 60 * 1000;

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/cheques-a-alerter", { headers });
}

function cheque(overrides: Record<string, unknown> = {}) {
  return {
    id: "chq1",
    banque: "Banque Test",
    numero: "1234",
    nombreAlertesEnvoyees: 0,
    derniereAlerteEnvoyeeLe: null,
    paiement: {
      montant: { toString: () => "150.00" },
      datePaiement: new Date(Date.now() - 20 * JOUR),
      echeance: { dossierAnnuel: { etudiant: { nom: "Dupont", prenom: "Léo" } } },
    },
    ...overrides,
  };
}

describe("GET /api/internal/n8n/cheques-a-alerter", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    parametresRelanceFindFirst.mockReset();
    utilisateurFindMany.mockReset();
    chequeFindMany.mockReset();
    parametresRelanceFindFirst.mockResolvedValue({ nombreMaxAlertesCheque: 1, delaiJoursCheque: 10 });
    utilisateurFindMany.mockResolvedValue([{ email: "bureau@example.com" }]);
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même interroger la base", async () => {
    const reponse = await GET(requete());
    expect(reponse.status).toBe(401);
    expect(chequeFindMany).not.toHaveBeenCalled();
  });

  it("liste vide si aucun ParametresRelance en base", async () => {
    parametresRelanceFindFirst.mockResolvedValue(null);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps).toEqual({ destinataires: [], candidats: [] });
    expect(chequeFindMany).not.toHaveBeenCalled();
  });

  it("liste vide si aucun compte Bureau actif avec email", async () => {
    utilisateurFindMany.mockResolvedValue([]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps).toEqual({ destinataires: [], candidats: [] });
    expect(chequeFindMany).not.toHaveBeenCalled();
  });

  it("alerte un chèque reçu depuis plus longtemps que le délai", async () => {
    const candidat = cheque();
    chequeFindMany.mockResolvedValue([candidat]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(reponse.status).toBe(200);
    expect(corps.destinataires).toEqual(["bureau@example.com"]);
    expect(corps.candidats).toEqual([
      {
        chequeId: "chq1",
        numeroAlerte: 1,
        banque: "Banque Test",
        numero: "1234",
        montant: "150.00",
        etudiantNom: "Dupont",
        etudiantPrenom: "Léo",
        datePaiement: candidat.paiement.datePaiement.toISOString(),
      },
    ]);
  });

  it("filtre les chèques pas encore dus via le seuil de date passé à Prisma, pas en JS après coup (évite l'effet de tête de file)", async () => {
    chequeFindMany.mockResolvedValue([]);
    const avant = Date.now();
    await GET(requete(SECRET));

    const appel = chequeFindMany.mock.calls[0][0];
    expect(appel.where.OR).toEqual([
      { derniereAlerteEnvoyeeLe: null, paiement: { datePaiement: { lte: expect.any(Date) } } },
      { derniereAlerteEnvoyeeLe: { lte: expect.any(Date) } },
    ]);
    // Seuil ancré sur delaiJoursCheque (10, voir mock ParametresRelance ci-dessus) avant maintenant.
    const seuil = appel.where.OR[0].paiement.datePaiement.lte.getTime();
    expect(Math.abs(seuil - (avant - 10 * JOUR))).toBeLessThan(2000);
  });

  it("propage le bon numéro d'alerte à envoyer", async () => {
    chequeFindMany.mockResolvedValue([cheque({ nombreAlertesEnvoyees: 1 })]);
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats[0].numeroAlerte).toBe(2);
  });
});
