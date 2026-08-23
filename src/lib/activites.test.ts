import { describe, expect, it } from "vitest";
import {
  datesOccurrencesActivite,
  diffJoursUTC,
  MAX_OCCURRENCES_SERIE,
  numeroTrimestre,
  libelleAnneeScolaireDe,
  cleTrimestre,
  grouperParTrimestre,
} from "./activites-recurrence";

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

describe("numeroTrimestre", () => {
  it("place septembre à décembre dans le 1er trimestre", () => {
    expect(numeroTrimestre(d("2026-09-01"))).toBe(1);
    expect(numeroTrimestre(d("2026-12-31"))).toBe(1);
  });

  it("place janvier à mars dans le 2e trimestre", () => {
    expect(numeroTrimestre(d("2027-01-01"))).toBe(2);
    expect(numeroTrimestre(d("2027-03-31"))).toBe(2);
  });

  it("place avril à août dans le 3e trimestre", () => {
    expect(numeroTrimestre(d("2027-04-01"))).toBe(3);
    expect(numeroTrimestre(d("2027-08-31"))).toBe(3);
  });
});

describe("libelleAnneeScolaireDe", () => {
  it("rattache septembre à décembre à l'année scolaire qui démarre cette année-là", () => {
    expect(libelleAnneeScolaireDe(d("2026-09-01"))).toBe("2026/2027");
    expect(libelleAnneeScolaireDe(d("2026-12-31"))).toBe("2026/2027");
  });

  it("rattache janvier à août à l'année scolaire démarrée l'année civile précédente", () => {
    expect(libelleAnneeScolaireDe(d("2027-01-01"))).toBe("2026/2027");
    expect(libelleAnneeScolaireDe(d("2027-08-31"))).toBe("2026/2027");
  });
});

describe("cleTrimestre", () => {
  it("trie chronologiquement par simple comparaison de chaînes", () => {
    const cles = [
      cleTrimestre(d("2027-04-01")), // T3 2026/2027
      cleTrimestre(d("2026-09-01")), // T1 2026/2027
      cleTrimestre(d("2027-09-01")), // T1 2027/2028
      cleTrimestre(d("2027-01-01")), // T2 2026/2027
    ];
    expect([...cles].sort()).toEqual([
      cleTrimestre(d("2026-09-01")),
      cleTrimestre(d("2027-01-01")),
      cleTrimestre(d("2027-04-01")),
      cleTrimestre(d("2027-09-01")),
    ]);
  });
});

describe("grouperParTrimestre", () => {
  it("regroupe des activités triées par date en conservant l'ordre chronologique des groupes", () => {
    const activites = [
      { id: "a", date: d("2026-09-05") },
      { id: "b", date: d("2026-11-20") },
      { id: "c", date: d("2027-02-10") },
      { id: "d", date: d("2027-05-01") },
    ];
    const groupes = grouperParTrimestre(activites);
    expect(groupes.map((g) => g.activites.map((a) => a.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
    ]);
    expect(groupes.map((g) => g.libelle)).toEqual([
      "1er trimestre (sept.–déc.) · 2026/2027",
      "2e trimestre (janv.–mars) · 2026/2027",
      "3e trimestre (avril–août) · 2026/2027",
    ]);
  });

  it("renvoie un tableau vide pour une liste vide", () => {
    expect(grouperParTrimestre([])).toEqual([]);
  });
});
