import { afterEach, describe, expect, it, vi } from "vitest";

// Seule rendreDossierPdfEtChampsSignature nous intéresse ici (le garde-fou
// ne dépend que d'elle) — les autres exports de ./render sont stubés vides,
// simplement pour que le module se charge sans lever.
const rendreDossierPdfEtChampsSignature = vi.fn();
vi.mock("./render", () => ({
  rendreDossierHtml: vi.fn(),
  rendreDossierPdfEtChampsSignature: (...args: unknown[]) => rendreDossierPdfEtChampsSignature(...args),
}));

// generation.ts importe aussi ./context, @/lib/documents et @/lib/prisma au
// niveau module : jamais appelés par rendrePdfAvecZonesValidees (testée
// isolément ici), mais nécessaires pour que le module se charge — voir le
// même patron dans etudiants/[id]/actions.test.ts.
vi.mock("./context", () => ({ construireContexteDossierEtudiant: vi.fn() }));
vi.mock("@/lib/documents", () => ({
  enregistrerDocumentEtudiant: vi.fn(),
  nomFichierDocument: vi.fn(),
  formatSuffixeVersion: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    etudiant: { findUniqueOrThrow: vi.fn() },
    document: { findFirst: vi.fn(), create: vi.fn() },
    dossierAnnuel: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { rendrePdfAvecZonesValidees } = await import("./generation");

// 2 zones = le nombre attendu (voir NB_ZONES_SIGNATURE_ATTENDUES,
// generation.ts) ; un nombre différent simule un rendu invalide.
function resultatRendu(nombreDeZones: number) {
  return {
    pdf: Buffer.from("pdf-simule"),
    champsSignature: Array.from({ length: nombreDeZones }, (_, i) => ({
      pageNumber: i + 1,
      pageX: 0,
      pageY: 0,
      pageWidth: 0,
      pageHeight: 0,
    })),
  };
}

describe("rendrePdfAvecZonesValidees", () => {
  afterEach(() => vi.clearAllMocks());

  it("première tentative correcte : utilisée telle quelle, une seule tentative effectuée", async () => {
    rendreDossierPdfEtChampsSignature.mockResolvedValueOnce(resultatRendu(2));

    const resultat = await rendrePdfAvecZonesValidees("<html/>");

    expect(resultat.champsSignature).toHaveLength(2);
    expect(rendreDossierPdfEtChampsSignature).toHaveBeenCalledTimes(1);
  });

  it("première tentative vide, seconde correcte : le résultat de la seconde tentative est utilisé", async () => {
    rendreDossierPdfEtChampsSignature
      .mockResolvedValueOnce(resultatRendu(0))
      .mockResolvedValueOnce(resultatRendu(2));

    const resultat = await rendrePdfAvecZonesValidees("<html/>");

    expect(resultat.champsSignature).toHaveLength(2);
    expect(rendreDossierPdfEtChampsSignature).toHaveBeenCalledTimes(2);
  });

  it("deux tentatives invalides : lève une erreur explicite plutôt que de renvoyer un résultat inutilisable", async () => {
    rendreDossierPdfEtChampsSignature
      .mockResolvedValueOnce(resultatRendu(0))
      .mockResolvedValueOnce(resultatRendu(1));

    await expect(rendrePdfAvecZonesValidees("<html/>")).rejects.toThrow(/zones de signature/i);
    expect(rendreDossierPdfEtChampsSignature).toHaveBeenCalledTimes(2);
  });
});
