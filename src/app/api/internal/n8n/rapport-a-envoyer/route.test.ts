import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const anneeScolaireFindFirst = vi.fn();
const parametresRelanceFindFirst = vi.fn();
const utilisateurFindMany = vi.fn();
const etudiantCount = vi.fn();
const mouvementTresorerieAggregate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    anneeScolaire: { findFirst: (...args: unknown[]) => anneeScolaireFindFirst(...args) },
    parametresRelance: { findFirst: (...args: unknown[]) => parametresRelanceFindFirst(...args) },
    utilisateur: { findMany: (...args: unknown[]) => utilisateurFindMany(...args) },
    etudiant: { count: (...args: unknown[]) => etudiantCount(...args) },
    mouvementTresorerie: { aggregate: (...args: unknown[]) => mouvementTresorerieAggregate(...args) },
  },
}));

const { GET } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/rapport-a-envoyer", { headers });
}

function montant(valeur: number) {
  return { toString: () => valeur.toFixed(2) };
}

// 2026 : la période intensive est ancrée sur le 1er septembre (mardi),
// calendaire — indépendante d'AnneeScolaire.dateDebut. Avec une durée de 4
// semaines, elle court jusqu'au 29 septembre. Le 5 octobre est un lundi hors
// période intensive, le 30 septembre un mercredi (dernier jour du mois, hors
// période intensive), le 31 octobre un samedi (dernier jour du mois).
// dateDebut est volontairement tardive (rentrée pédagogique réelle) dans les
// mocks ci-dessous, pour vérifier que la cadence ne s'y ancre plus.
const DATE_DEBUT_PEDAGOGIQUE = new Date(Date.UTC(2026, 9, 5)); // lundi 5 octobre 2026

describe("GET /api/internal/n8n/rapport-a-envoyer", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    anneeScolaireFindFirst.mockReset();
    parametresRelanceFindFirst.mockReset();
    utilisateurFindMany.mockReset();
    etudiantCount.mockReset();
    mouvementTresorerieAggregate.mockReset();

    anneeScolaireFindFirst.mockResolvedValue({ dateDebut: DATE_DEBUT_PEDAGOGIQUE });
    parametresRelanceFindFirst.mockResolvedValue({ dureeIntensiveRapportSemaines: 4 });
    utilisateurFindMany.mockResolvedValue([{ email: "bureau@example.com" }]);
    etudiantCount.mockResolvedValue(0);
    mouvementTresorerieAggregate.mockResolvedValue({ _sum: { montant: null } });
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
    vi.useRealTimers();
  });

  it("401 sans token, sans même interroger la base", async () => {
    const reponse = await GET(requete());
    expect(reponse.status).toBe(401);
    expect(anneeScolaireFindFirst).not.toHaveBeenCalled();
  });

  it("rien à envoyer si aucune année scolaire active", async () => {
    anneeScolaireFindFirst.mockResolvedValue(null);
    const reponse = await GET(requete(SECRET));
    expect(await reponse.json()).toEqual({ aEnvoyer: false, destinataires: [] });
  });

  it("rien à envoyer si aucun ParametresRelance en base", async () => {
    parametresRelanceFindFirst.mockResolvedValue(null);
    const reponse = await GET(requete(SECRET));
    expect(await reponse.json()).toEqual({ aEnvoyer: false, destinataires: [] });
  });

  it("en période intensive, rien un jour qui n'est pas un lundi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 8, 12))); // mardi 8 septembre
    const reponse = await GET(requete(SECRET));
    expect(await reponse.json()).toEqual({ aEnvoyer: false, destinataires: [] });
    expect(utilisateurFindMany).not.toHaveBeenCalled();
  });

  it("en période intensive, envoi hebdomadaire un lundi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 14, 12))); // lundi 14 septembre
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.aEnvoyer).toBe(true);
    expect(corps.cadence).toBe("HEBDOMADAIRE");
    expect(corps.destinataires).toEqual(["bureau@example.com"]);
    expect(corps.periodeDebut).toBe(new Date(Date.UTC(2026, 8, 8)).toISOString());
    expect(corps.periodeFin).toBe(new Date(Date.UTC(2026, 8, 14)).toISOString());
  });

  it("période intensive dès début septembre, même si AnneeScolaire.dateDebut (rentrée pédagogique) est postérieure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 7, 12))); // lundi 7 septembre 2026, avant la rentrée pédagogique du 5 octobre
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.aEnvoyer).toBe(true);
    expect(corps.cadence).toBe("HEBDOMADAIRE");
  });

  it("hors période intensive, rien un jour qui n'est pas le dernier du mois", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 15, 12))); // 15 octobre, hors période (4 semaines après le 7/09)
    const reponse = await GET(requete(SECRET));
    expect(await reponse.json()).toEqual({ aEnvoyer: false, destinataires: [] });
  });

  it("hors période intensive, envoi mensuel le dernier jour du mois", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 31, 12))); // 31 octobre
    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.aEnvoyer).toBe(true);
    expect(corps.cadence).toBe("MENSUELLE");
    expect(corps.periodeDebut).toBe(new Date(Date.UTC(2026, 9, 1)).toISOString());
    expect(corps.periodeFin).toBe(new Date(Date.UTC(2026, 9, 31)).toISOString());
  });

  it("rien à envoyer si aucun compte Bureau actif avec email, même un jour d'envoi", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 14, 12))); // lundi 14 septembre
    utilisateurFindMany.mockResolvedValue([]);
    const reponse = await GET(requete(SECRET));
    expect(await reponse.json()).toEqual({ aEnvoyer: false, destinataires: [] });
  });

  it("agrège effectifs et trésorerie de la période", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 14, 12))); // lundi 14 septembre
    etudiantCount.mockResolvedValueOnce(120).mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    mouvementTresorerieAggregate
      .mockResolvedValueOnce({ _sum: { montant: montant(1500) } }) // entrées période
      .mockResolvedValueOnce({ _sum: { montant: montant(300) } }) // sorties période
      .mockResolvedValueOnce({ _sum: { montant: montant(42000) } }) // recettes cumulées
      .mockResolvedValueOnce({ _sum: { montant: montant(31000) } }); // dépenses cumulées

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.effectifs).toEqual({
      nbEtudiantsValides: 120,
      nbNouvellesFichesPeriode: 5,
      nbDoublonsEnAttente: 2,
    });
    expect(corps.tresorerie).toEqual({
      soldeActuel: "11000.00",
      entreesPeriode: "1500.00",
      sortiesPeriode: "300.00",
    });
  });
});
