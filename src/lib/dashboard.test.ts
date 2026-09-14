import { describe, expect, it } from "vitest";
import { serieQuotidienne, sommeQuotidienne } from "./dashboard";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dh = (iso: string) => new Date(iso); // avec heure, ex. "2026-09-10T14:30:00.000Z"

describe("serieQuotidienne", () => {
  it("retourne une série de zéros sur la fenêtre demandée quand il n'y a aucun événement", () => {
    expect(serieQuotidienne([], 5, d("2026-09-14"))).toEqual([0, 0, 0, 0, 0]);
  });

  it("regroupe les horodatages par jour local, en ignorant l'heure", () => {
    const serie = serieQuotidienne(
      [dh("2026-09-12T23:59:00.000Z"), dh("2026-09-12T00:01:00.000Z"), dh("2026-09-14T10:00:00.000Z")],
      3,
      d("2026-09-14"),
    );
    // Fenêtre : 12, 13, 14 (aujourd'hui inclus, ordre chronologique croissant).
    expect(serie).toEqual([2, 0, 1]);
  });

  it("ignore les horodatages hors fenêtre plutôt que d'échouer", () => {
    const serie = serieQuotidienne([dh("2026-08-01T00:00:00.000Z")], 3, d("2026-09-14"));
    expect(serie).toEqual([0, 0, 0]);
  });
});

describe("sommeQuotidienne", () => {
  it("somme les valeurs tombant sur le même jour local", () => {
    const serie = sommeQuotidienne(
      [
        { date: dh("2026-09-14T08:00:00.000Z"), valeur: 30 },
        { date: dh("2026-09-14T18:00:00.000Z"), valeur: 20 },
        { date: dh("2026-09-13T08:00:00.000Z"), valeur: 15 },
      ],
      2,
      d("2026-09-14"),
    );
    expect(serie).toEqual([15, 50]);
  });
});
