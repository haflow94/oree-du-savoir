import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { etudiant: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { GET } = await import("./route");

const SECRET = "s".repeat(64);

function requete(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest("http://localhost/api/internal/n8n/inscriptions-a-notifier", {
    headers,
  });
}

// Étudiant "conforme" par défaut : VALIDE, dossier annuel SIGNEE, dossier
// documentaire complet (dossier signé — voir TYPES_DOCUMENTS_REQUIS) et
// dossier généré présent — chaque test ci-dessous ne fait dévier qu'un seul
// de ces axes pour vérifier que le verrou (voir route.ts) exclut bien le
// candidat.
function etudiantConforme(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "et1",
    nom: "Dupont",
    prenom: "Léo",
    email: "leo@example.com",
    statutInscription: "VALIDE",
    documents: [
      { id: "doc1", type: "DOSSIER_GENERE", nomFichier: "dossier-leo.pdf", dateExpiration: null, creeLe: new Date("2026-01-01") },
      { id: "doc2", type: "PIECE_IDENTITE", nomFichier: "ci.pdf", dateExpiration: null, creeLe: new Date("2026-01-01") },
      { id: "doc3", type: "PHOTO", nomFichier: "photo.jpg", dateExpiration: null, creeLe: new Date("2026-01-01") },
      { id: "doc4", type: "DOSSIER_SIGNE", nomFichier: "signe.pdf", dateExpiration: null, creeLe: new Date("2026-01-01") },
    ],
    dossiersAnnuels: [{ statutSignature: "SIGNEE" }],
    responsables: [{ email: "parent@example.com", prenom: "Karim" }],
    ...overrides,
  };
}

describe("GET /api/internal/n8n/inscriptions-a-notifier", () => {
  const original = process.env.N8N_INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = SECRET;
    findMany.mockReset();
  });

  afterEach(() => {
    process.env.N8N_INTERNAL_API_SECRET = original;
  });

  it("401 sans token, sans même interroger la base", async () => {
    const reponse = await GET(requete());
    expect(reponse.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("401 avec un mauvais token", async () => {
    const reponse = await GET(requete("mauvais-token"));
    expect(reponse.status).toBe(401);
  });

  it("renvoie un candidat conforme (VALIDE, dossier annuel SIGNEE, dossier documentaire complet)", async () => {
    findMany.mockResolvedValue([etudiantConforme()]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps.candidats).toEqual([
      {
        etudiantId: "et1",
        nom: "Dupont",
        prenom: "Léo",
        destinataireEmail: "parent@example.com",
        destinatairePrenom: "Karim",
        documentId: "doc4",
        nomFichier: "signe.pdf",
      },
    ]);
  });

  it("se rabat sur l'email de l'étudiant quand aucun responsable n'a d'email", async () => {
    findMany.mockResolvedValue([
      etudiantConforme({
        id: "et2",
        nom: "Martin",
        prenom: "Sofia",
        email: "sofia@example.com",
        responsables: [],
      }),
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();

    expect(corps.candidats[0].destinataireEmail).toBe("sofia@example.com");
    expect(corps.candidats[0].destinatairePrenom).toBe("Sofia");
  });

  it("exclut un candidat sans dossier signé ou sans email exploitable", async () => {
    findMany.mockResolvedValue([
      etudiantConforme({
        id: "et3",
        nom: "SansDossier",
        prenom: "X",
        email: "x@example.com",
        documents: etudiantConforme().documents.filter((d) => d.type !== "DOSSIER_SIGNE"),
      }),
      etudiantConforme({
        id: "et4",
        nom: "SansEmail",
        prenom: "Y",
        email: null,
        responsables: [],
      }),
    ]);

    const reponse = await GET(requete(SECRET));
    const corps = await reponse.json();
    expect(corps.candidats).toEqual([]);
  });

  // Verrou de sécurité fonctionnelle redondant (Flux 1) : même si le `where`
  // Prisma ne devrait déjà remonter que des étudiants VALIDE avec un dossier
  // généré, la route revérifie elle-même statutInscription, la signature
  // réelle (DossierAnnuel.statutSignature) et le dossier documentaire complet
  // avant de rendre un candidat à n8n — ces tests couvrent chaque axe
  // indépendamment, pour un étudiant par ailleurs conforme.
  describe("verrou de sécurité fonctionnelle redondant", () => {
    it("exclut un candidat dont statutInscription n'est pas (ou plus) VALIDE", async () => {
      findMany.mockResolvedValue([etudiantConforme({ statutInscription: "PREINSCRIT" })]);

      const reponse = await GET(requete(SECRET));
      const corps = await reponse.json();
      expect(corps.candidats).toEqual([]);
    });

    it("exclut un candidat sans aucun DossierAnnuel", async () => {
      findMany.mockResolvedValue([etudiantConforme({ dossiersAnnuels: [] })]);

      const reponse = await GET(requete(SECRET));
      const corps = await reponse.json();
      expect(corps.candidats).toEqual([]);
    });

    it("exclut un candidat dont le DossierAnnuel n'est pas SIGNEE (ex. ENVOYEE_SIGNATURE)", async () => {
      findMany.mockResolvedValue([
        etudiantConforme({ dossiersAnnuels: [{ statutSignature: "ENVOYEE_SIGNATURE" }] }),
      ]);

      const reponse = await GET(requete(SECRET));
      const corps = await reponse.json();
      expect(corps.candidats).toEqual([]);
    });

    it("inclut le candidat si au moins un DossierAnnuel (parmi plusieurs) est SIGNEE", async () => {
      findMany.mockResolvedValue([
        etudiantConforme({
          dossiersAnnuels: [{ statutSignature: "A_GENERER" }, { statutSignature: "SIGNEE" }],
        }),
      ]);

      const reponse = await GET(requete(SECRET));
      const corps = await reponse.json();
      expect(corps.candidats).toHaveLength(1);
    });

    it("n'exclut pas un candidat sans pièce d'identité ni photo (plus des conditions de validation)", async () => {
      findMany.mockResolvedValue([
        etudiantConforme({
          documents: etudiantConforme().documents.filter(
            (d) => d.type !== "PIECE_IDENTITE" && d.type !== "PHOTO",
          ),
        }),
      ]);

      const reponse = await GET(requete(SECRET));
      const corps = await reponse.json();
      expect(corps.candidats).toHaveLength(1);
    });

    it("exclut un candidat dont le document 'dossier signé' est absent (statutSignature incohérent)", async () => {
      findMany.mockResolvedValue([
        etudiantConforme({
          documents: etudiantConforme().documents.filter((d) => d.type !== "DOSSIER_SIGNE"),
        }),
      ]);

      const reponse = await GET(requete(SECRET));
      const corps = await reponse.json();
      expect(corps.candidats).toEqual([]);
    });
  });
});
