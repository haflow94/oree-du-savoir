import { describe, expect, it } from "vitest";
import { echeanceArrivee, statutCotisation, totalEncaisse, totalEncaisseMature } from "./paiements";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function paiement(montant: number, chequeStatut?: "RECU" | "DEPOSE" | "ENCAISSE" | "REJETE") {
  return {
    montant: { toString: () => montant.toString() },
    cheque: chequeStatut ? { statut: chequeStatut } : null,
    prelevement: null,
  };
}

describe("echeanceArrivee", () => {
  it("est vraie le jour même de l'échéance", () => {
    expect(echeanceArrivee(d("2026-09-19"), d("2026-09-19"))).toBe(true);
  });

  it("est vraie pour une échéance passée", () => {
    expect(echeanceArrivee(d("2026-09-01"), d("2026-09-19"))).toBe(true);
  });

  it("est fausse pour une échéance future", () => {
    expect(echeanceArrivee(d("2026-10-01"), d("2026-09-19"))).toBe(false);
  });
});

describe("totalEncaisseMature", () => {
  it("ignore les paiements d'une échéance dont la date n'est pas encore passée", () => {
    const echeances = [
      { dateEcheance: d("2026-09-01"), paiements: [paiement(100, "RECU")] },
      { dateEcheance: d("2026-12-01"), paiements: [paiement(200, "RECU")] },
    ];
    expect(totalEncaisseMature(echeances, d("2026-09-19"))).toBe(100);
  });

  it("compte tout une fois toutes les échéances arrivées à échéance", () => {
    const echeances = [
      { dateEcheance: d("2026-09-01"), paiements: [paiement(100, "RECU")] },
      { dateEcheance: d("2026-12-01"), paiements: [paiement(200, "RECU")] },
    ];
    expect(totalEncaisseMature(echeances, d("2026-12-01"))).toBe(300);
  });

  it("exclut toujours un chèque/prélèvement rejeté, même mature (voir totalEncaisse)", () => {
    const echeances = [{ dateEcheance: d("2026-09-01"), paiements: [paiement(100, "REJETE")] }];
    expect(totalEncaisseMature(echeances, d("2026-09-19"))).toBe(0);
  });
});

describe("statutCotisation", () => {
  // Cas réel qui motive cette règle : 3 chèques postdatés remis d'un coup à
  // l'inscription (paiement en plusieurs fois) ne doivent pas afficher le
  // dossier "Soldé" avant que chaque échéance soit réellement arrivée.
  it("n'affiche pas Soldé pour des échéances futures déjà payées d'avance (chèques postdatés)", () => {
    const dossier = {
      montantDu: { toString: () => "300" },
      echeances: [
        { dateEcheance: d("2026-09-01"), paiements: [paiement(100, "RECU")] },
        { dateEcheance: d("2026-12-01"), paiements: [paiement(100, "RECU")] },
        { dateEcheance: d("2027-03-01"), paiements: [paiement(100, "RECU")] },
      ],
    };
    const resultat = statutCotisation(dossier, d("2026-09-19"));
    expect(resultat.encaisse).toBe(100);
    expect(resultat.reste).toBe(200);
    expect(resultat.statut).toBe("Partiel");
  });

  it("passe Soldé une fois la dernière échéance arrivée, sans nouvelle saisie", () => {
    const dossier = {
      montantDu: { toString: () => "300" },
      echeances: [
        { dateEcheance: d("2026-09-01"), paiements: [paiement(100, "RECU")] },
        { dateEcheance: d("2026-12-01"), paiements: [paiement(100, "RECU")] },
        { dateEcheance: d("2027-03-01"), paiements: [paiement(100, "RECU")] },
      ],
    };
    const resultat = statutCotisation(dossier, d("2027-03-01"));
    expect(resultat.encaisse).toBe(300);
    expect(resultat.reste).toBe(0);
    expect(resultat.statut).toBe("Soldé");
  });

  it("Impayé quand la seule échéance existante n'est pas encore arrivée", () => {
    const dossier = {
      montantDu: { toString: () => "100" },
      echeances: [{ dateEcheance: d("2026-12-01"), paiements: [paiement(100, "RECU")] }],
    };
    expect(statutCotisation(dossier, d("2026-09-19")).statut).toBe("Impayé");
  });

  it("Remboursé prime sur tout calcul de maturité", () => {
    const dossier = {
      montantDu: { toString: () => "100" },
      rembourse: true,
      echeances: [{ dateEcheance: d("2026-12-01"), paiements: [] }],
    };
    expect(statutCotisation(dossier, d("2026-09-19")).statut).toBe("Remboursé");
  });

  it("Gratuit quand le montant dû est nul, quelles que soient les échéances", () => {
    const dossier = {
      montantDu: { toString: () => "0" },
      echeances: [],
    };
    expect(statutCotisation(dossier, d("2026-09-19")).statut).toBe("Gratuit");
  });
});

describe("totalEncaisse (par échéance, non affecté par la maturité)", () => {
  it("compte un paiement reçu sur une échéance future comme déjà encaissé", () => {
    expect(totalEncaisse([paiement(100, "RECU")])).toBe(100);
  });
});
