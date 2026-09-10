import { describe, expect, it } from "vitest";
import {
  BUCKET_SANS_ANNEE,
  dossierPhysiqueEtudiant,
  estDansDossierEtudiant,
  formatSuffixeDesambiguisation,
  formatSuffixeVersion,
  nomFichierDocument,
  renommerNomFichier,
  renommerSegmentEtudiant,
  sanitiserSegmentChemin,
  segmentAnnee,
  segmentEtudiant,
  suffixesDesambiguisation,
} from "./documents-nommage";

describe("sanitiserSegmentChemin", () => {
  it("retire les caractères interdits sur un partage NAS/SMB", () => {
    expect(sanitiserSegmentChemin('A/B\\C:D*E?F"G<H>I|J')).toBe("ABCDEFGHIJ");
  });

  it("retire les espaces et points finaux", () => {
    expect(sanitiserSegmentChemin("Dupont.  ")).toBe("Dupont");
  });

  it("tronque au-delà de 150 caractères", () => {
    expect(sanitiserSegmentChemin("A".repeat(200)).length).toBe(150);
  });

  it("conserve les accents", () => {
    expect(sanitiserSegmentChemin("Bénali Léa")).toBe("Bénali Léa");
  });
});

describe("segmentAnnee", () => {
  it("remplace le / du libellé année par un tiret", () => {
    expect(segmentAnnee("2026/2027")).toBe("2026-2027");
  });

  it("retombe sur le bucket _A_CLASSER si aucune année", () => {
    expect(segmentAnnee(null)).toBe(BUCKET_SANS_ANNEE);
  });
});

describe("dossierPhysiqueEtudiant", () => {
  it("construit le chemin année/NOM Prénom — matricule", () => {
    expect(
      dossierPhysiqueEtudiant({
        matricule: "000001",
        nom: "Benali",
        prenom: "Mohamed",
        anneeLibelle: "2026/2027",
      }),
    ).toBe("2026-2027/BENALI Mohamed — 000001");
  });

  it("utilise _A_CLASSER quand aucune année n'est connue", () => {
    expect(
      dossierPhysiqueEtudiant({
        matricule: "000002",
        nom: "Martin",
        prenom: "Sofia",
        anneeLibelle: null,
      }),
    ).toBe("_A_CLASSER/MARTIN Sofia — 000002");
  });
});

describe("segmentEtudiant", () => {
  it("combine NOM Prénom et matricule, sans dépendre d'un ordre de création", () => {
    expect(segmentEtudiant({ matricule: "000042", nom: "Dupont", prenom: "Léo" })).toBe(
      "DUPONT Léo — 000042",
    );
  });
});

describe("renommerSegmentEtudiant", () => {
  it("conserve le segment année, ne change que NOM Prénom — matricule", () => {
    expect(
      renommerSegmentEtudiant("2026-2027/DUPONT Léo — 000042", {
        matricule: "000042",
        nom: "Dupont",
        prenom: "Léopold",
      }),
    ).toBe("2026-2027/DUPONT Léopold — 000042");
  });

  it("fonctionne aussi pour le bucket _A_CLASSER", () => {
    expect(
      renommerSegmentEtudiant(`${BUCKET_SANS_ANNEE}/DUPONT Léo — 000042`, {
        matricule: "000042",
        nom: "Martin",
        prenom: "Léo",
      }),
    ).toBe(`${BUCKET_SANS_ANNEE}/MARTIN Léo — 000042`);
  });
});

describe("estDansDossierEtudiant", () => {
  it("vrai pour un document réellement dans ce dossier", () => {
    expect(
      estDansDossierEtudiant(
        "etudiants/2026-2027/DUPONT Léo — 000042/DUPONT Léo — Photo identité.jpg",
        "2026-2027/DUPONT Léo — 000042",
      ),
    ).toBe(true);
  });

  it("faux pour un document d'une autre année du même étudiant", () => {
    expect(
      estDansDossierEtudiant(
        "etudiants/2025-2026/DUPONT Léo — 000042/DUPONT Léo — Photo identité.jpg",
        "2026-2027/DUPONT Léo — 000042",
      ),
    ).toBe(false);
  });
});

describe("renommerNomFichier", () => {
  it("ne change que le préfixe NOM Prénom, laisse le reste intact", () => {
    expect(
      renommerNomFichier(
        "DUPONT Léo — Pièce identité — 2026-09-10.pdf",
        { nom: "Dupont", prenom: "Léo" },
        { nom: "Dupont", prenom: "Léopold" },
      ),
    ).toBe("DUPONT Léopold — Pièce identité — 2026-09-10.pdf");
  });

  it("préserve un libellé AUTRE déjà figé, non reconstituable", () => {
    expect(
      renommerNomFichier(
        "DUPONT Léo — Autre — certificat medical.pdf",
        { nom: "Dupont", prenom: "Léo" },
        { nom: "Martin", prenom: "Léo" },
      ),
    ).toBe("MARTIN Léo — Autre — certificat medical.pdf");
  });

  it("ne touche à rien si le préfixe attendu ne correspond pas (défensif)", () => {
    expect(
      renommerNomFichier("nom-inattendu.pdf", { nom: "Dupont", prenom: "Léo" }, { nom: "Martin", prenom: "Léo" }),
    ).toBe("nom-inattendu.pdf");
  });
});

describe("suffixesDesambiguisation", () => {
  it("ne met aucun suffixe pour un document seul", () => {
    const documents = [{ id: "d1", creeLe: new Date("2026-09-10T10:00:00") }];
    expect(suffixesDesambiguisation(documents)).toEqual({ d1: "" });
  });

  it("ajoute la date quand plusieurs documents du même type existent, dates distinctes", () => {
    const documents = [
      { id: "d1", creeLe: new Date("2024-03-12T10:00:00") },
      { id: "d2", creeLe: new Date("2026-09-10T14:32:00") },
    ];
    expect(suffixesDesambiguisation(documents)).toEqual({
      d1: " — 2024-03-12",
      d2: " — 2026-09-10",
    });
  });

  it("ajoute l'heure uniquement pour les documents en collision de date", () => {
    const documents = [
      { id: "d1", creeLe: new Date("2026-09-10T09:15:00") },
      { id: "d2", creeLe: new Date("2026-09-10T14:32:00") },
      { id: "d3", creeLe: new Date("2026-09-11T08:00:00") },
    ];
    expect(suffixesDesambiguisation(documents)).toEqual({
      d1: " — 2026-09-10 09h15",
      d2: " — 2026-09-10 14h32",
      d3: " — 2026-09-11",
    });
  });

  it("un suffixe ne dépend jamais des voisins : redevient vide seul une fois les autres retirés", () => {
    const document = { id: "d1", creeLe: new Date("2026-09-10T10:00:00") };
    expect(suffixesDesambiguisation([document])).toEqual({ d1: "" });
  });
});

describe("formatSuffixeVersion", () => {
  it("formate (vN)", () => {
    expect(formatSuffixeVersion(1)).toBe(" (v1)");
    expect(formatSuffixeVersion(2)).toBe(" (v2)");
  });

  it("ne met rien si la version est absente (défensif)", () => {
    expect(formatSuffixeVersion(null)).toBe("");
  });
});

describe("formatSuffixeDesambiguisation", () => {
  it("délègue à suffixesDesambiguisation pour l'id demandé", () => {
    const documents = [
      { id: "a", creeLe: new Date("2026-01-01T00:00:00") },
      { id: "b", creeLe: new Date("2026-02-01T00:00:00") },
    ];
    expect(formatSuffixeDesambiguisation("b", documents)).toBe(" — 2026-02-01");
  });
});

describe("nomFichierDocument", () => {
  const base = { nom: "Benali", prenom: "Mohamed", extension: "pdf" };

  it("dossier généré, version 1", () => {
    expect(
      nomFichierDocument({ ...base, type: "DOSSIER_GENERE", suffixe: formatSuffixeVersion(1) }),
    ).toBe("BENALI Mohamed — Dossier inscription (v1).pdf");
  });

  it("dossier signé, version 1", () => {
    expect(
      nomFichierDocument({ ...base, type: "DOSSIER_SIGNE", suffixe: formatSuffixeVersion(1) }),
    ).toBe("BENALI Mohamed — Dossier inscription signé (v1).pdf");
  });

  it("pièce identité, aucun suffixe", () => {
    expect(nomFichierDocument({ ...base, type: "PIECE_IDENTITE", suffixe: "" })).toBe(
      "BENALI Mohamed — Pièce identité.pdf",
    );
  });

  it("photo identité", () => {
    expect(
      nomFichierDocument({ ...base, type: "PHOTO", suffixe: "", extension: "jpg" }),
    ).toBe("BENALI Mohamed — Photo identité.jpg");
  });

  it("justificatif paiement", () => {
    expect(nomFichierDocument({ ...base, type: "JUSTIFICATIF_PAIEMENT", suffixe: "" })).toBe(
      "BENALI Mohamed — Justificatif paiement.pdf",
    );
  });

  it("attestation scolarité", () => {
    expect(nomFichierDocument({ ...base, type: "ATTESTATION_SCOLARITE", suffixe: "" })).toBe(
      "BENALI Mohamed — Attestation scolarité.pdf",
    );
  });

  it("pièce identité avec suffixe de désambiguïsation (plusieurs du même type)", () => {
    expect(
      nomFichierDocument({ ...base, type: "PIECE_IDENTITE", suffixe: " — 2026-09-10" }),
    ).toBe("BENALI Mohamed — Pièce identité — 2026-09-10.pdf");
  });

  it("autre, avec nom original nettoyé (sans extension, à retirer par l'appelant)", () => {
    expect(
      nomFichierDocument({
        ...base,
        type: "AUTRE",
        suffixe: "",
        nomOriginalNettoye: "certificat medical",
      }),
    ).toBe("BENALI Mohamed — Autre — certificat medical.pdf");
  });

  it("autre, sans nom original disponible", () => {
    expect(nomFichierDocument({ ...base, type: "AUTRE", suffixe: "" })).toBe(
      "BENALI Mohamed — Autre.pdf",
    );
  });

  it("pièce identité du titulaire tiers d'un chèque, distincte de celle de l'étudiant", () => {
    expect(
      nomFichierDocument({
        ...base,
        type: "PIECE_IDENTITE",
        suffixe: "",
        titulaireChequeNom: "Martin",
        titulaireChequePrenom: "Jeanne",
      }),
    ).toBe("BENALI Mohamed — Pièce identité titulaire chèque — MARTIN Jeanne.pdf");
  });
});
