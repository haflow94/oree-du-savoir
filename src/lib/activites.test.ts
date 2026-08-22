import { describe, expect, it } from "vitest";
import { datesOccurrencesActivite, diffJoursUTC, MAX_OCCURRENCES_SERIE } from "./activites-recurrence";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isos = (dates: Date[]) => dates.map((x) => x.toISOString().slice(0, 10));

describe("datesOccurrencesActivite", () => {
  it("renvoie une seule occurrence si la fréquence est AUCUNE", () => {
    const dates = datesOccurrencesActivite(d("2026-09-05"), "AUCUNE", d("2026-12-31"));
    expect(isos(dates)).toEqual(["2026-09-05"]);
  });

  it("renvoie une seule occurrence si aucune date de fin de récurrence", () => {
    const dates = datesOccurrencesActivite(d("2026-09-05"), "HEBDOMADAIRE", null);
    expect(isos(dates)).toEqual(["2026-09-05"]);
  });

  it("génère une occurrence par jour jusqu'à la date de fin incluse", () => {
    const dates = datesOccurrencesActivite(d("2026-09-01"), "QUOTIDIENNE", d("2026-09-04"));
    expect(isos(dates)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
  });

  it("génère une occurrence par semaine jusqu'à la date de fin incluse", () => {
    const dates = datesOccurrencesActivite(d("2026-09-01"), "HEBDOMADAIRE", d("2026-09-22"));
    expect(isos(dates)).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
  });

  it("préserve le jour du mois pour une récurrence mensuelle", () => {
    const dates = datesOccurrencesActivite(d("2026-01-15"), "MENSUELLE", d("2026-04-15"));
    expect(isos(dates)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("recale au dernier jour du mois quand le jour de départ n'existe pas (31 janvier -> février)", () => {
    const dates = datesOccurrencesActivite(d("2026-01-31"), "MENSUELLE", d("2026-03-31"));
    expect(isos(dates)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("plafonne le nombre d'occurrences générées", () => {
    const dates = datesOccurrencesActivite(d("2020-01-01"), "QUOTIDIENNE", d("2030-01-01"));
    expect(dates.length).toBe(MAX_OCCURRENCES_SERIE);
  });
});

describe("diffJoursUTC", () => {
  it("compte le nombre de jours entre deux dates", () => {
    expect(diffJoursUTC(d("2026-09-05"), d("2026-09-01"))).toBe(4);
  });

  it("renvoie 0 pour la même date", () => {
    expect(diffJoursUTC(d("2026-09-05"), d("2026-09-05"))).toBe(0);
  });
});
