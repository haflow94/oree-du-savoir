import { describe, expect, it } from "vitest";
import {
  datesDesSeances,
  enseignantPeutCorriger,
  normaliserDateUTC,
} from "./presences";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isos = (dates: Date[]) => dates.map((x) => x.toISOString().slice(0, 10));

describe("datesDesSeances", () => {
  it("retient uniquement le jour de la semaine de la classe", () => {
    // 2026-09-05 est un samedi.
    const dates = datesDesSeances("SAMEDI", d("2026-09-01"), d("2026-09-30"), []);
    expect(isos(dates)).toEqual([
      "2026-09-05",
      "2026-09-12",
      "2026-09-19",
      "2026-09-26",
    ]);
  });

  it("saute les séances tombant dans une période de fermeture", () => {
    const dates = datesDesSeances("SAMEDI", d("2026-09-01"), d("2026-09-30"), [
      { dateDebut: d("2026-09-10"), dateFin: d("2026-09-20") },
    ]);
    expect(isos(dates)).toEqual(["2026-09-05", "2026-09-26"]);
  });

  it("traite les bornes de fermeture comme incluses", () => {
    const dates = datesDesSeances("SAMEDI", d("2026-09-01"), d("2026-09-30"), [
      { dateDebut: d("2026-09-05"), dateFin: d("2026-09-05") },
    ]);
    expect(isos(dates)).not.toContain("2026-09-05");
  });

  it("gère le dimanche, dont l'index natif est 0", () => {
    // 2026-09-06 est un dimanche.
    const dates = datesDesSeances("DIMANCHE", d("2026-09-01"), d("2026-09-13"), []);
    expect(isos(dates)).toEqual(["2026-09-06", "2026-09-13"]);
  });

  it("renvoie une liste vide si la période est inversée", () => {
    expect(datesDesSeances("LUNDI", d("2026-09-30"), d("2026-09-01"), [])).toEqual([]);
  });
});

describe("normaliserDateUTC", () => {
  it("ne décale pas le jour d'une date stockée en UTC", () => {
    const stockee = new Date("2026-09-05T00:00:00.000Z");
    expect(normaliserDateUTC(stockee).toISOString()).toBe(
      "2026-09-05T00:00:00.000Z",
    );
  });
});

describe("enseignantPeutCorriger", () => {
  const seance = d("2026-09-05");

  it("autorise la correction le jour même", () => {
    // Tard dans la journée, heure locale : encore le même jour pour l'usager.
    expect(enseignantPeutCorriger(seance, new Date("2026-09-05T23:30:00"))).toBe(true);
  });

  it("refuse la correction le lendemain", () => {
    expect(enseignantPeutCorriger(seance, new Date("2026-09-06T08:00:00"))).toBe(false);
  });

  it("autorise avant la séance (saisie anticipée impossible côté UI)", () => {
    expect(enseignantPeutCorriger(seance, new Date("2026-09-04T10:00:00"))).toBe(true);
  });
});
