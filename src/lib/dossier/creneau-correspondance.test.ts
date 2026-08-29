import { describe, expect, it } from "vitest";
import { estCreneauChoisi } from "./creneau-correspondance";

describe("estCreneauChoisi", () => {
  it("reconnaît un créneau du soir sur deux jours (mardi et jeudi)", () => {
    expect(
      estCreneauChoisi(
        { jour: "mardi et jeudi", horaire: "19h00 – 21h00" },
        { jour: "MARDI", heureDebut: "19:00", heureFin: "21:00" },
      ),
    ).toBe(true);
  });

  it("reconnaît un créneau du dimanche", () => {
    expect(
      estCreneauChoisi(
        { jour: "Dimanche", horaire: "09h00 – 13h00" },
        { jour: "DIMANCHE", heureDebut: "09:00", heureFin: "13:00" },
      ),
    ).toBe(true);
  });

  it("refuse un jour différent", () => {
    expect(
      estCreneauChoisi(
        { jour: "Samedi", horaire: "09h00 – 13h00" },
        { jour: "DIMANCHE", heureDebut: "09:00", heureFin: "13:00" },
      ),
    ).toBe(false);
  });

  it("refuse un horaire différent le même jour", () => {
    expect(
      estCreneauChoisi(
        { jour: "Dimanche", horaire: "14h00 – 18h00" },
        { jour: "DIMANCHE", heureDebut: "09:00", heureFin: "13:00" },
      ),
    ).toBe(false);
  });
});
