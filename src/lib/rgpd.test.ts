import { describe, expect, it } from "vitest";
import { dateFinParcours, estEligibleAnonymisation, SEUIL_ANNEES_INACTIVITE } from "./rgpd";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Ancre les tests sur une date fixe plutôt que `new Date()` : sinon un
// dossier "il y a exactement 5 ans" bascule de non-éligible à éligible selon
// le jour où les tests tournent.
const AUJOURDHUI = d("2026-08-23");
const ilYA = (annees: number) => {
  const date = new Date(AUJOURDHUI);
  date.setFullYear(date.getFullYear() - annees);
  return date;
};

describe("dateFinParcours", () => {
  it("retombe sur la création de la fiche quand aucun dossier annuel n'existe", () => {
    const etudiant = { anonymiseLe: null, creeLe: d("2018-03-01"), dossiersAnnuels: [] };
    expect(dateFinParcours(etudiant)).toEqual(d("2018-03-01"));
  });

  it("retient la fin d'année du dossier annuel le plus récent", () => {
    const etudiant = {
      anonymiseLe: null,
      creeLe: d("2015-01-01"),
      dossiersAnnuels: [
        { anneeScolaire: { dateFin: d("2019-06-30") } },
        { anneeScolaire: { dateFin: d("2021-06-30") } },
        { anneeScolaire: { dateFin: d("2020-06-30") } },
      ],
    };
    expect(dateFinParcours(etudiant)).toEqual(d("2021-06-30"));
  });

  it("ignore l'ordre des dossiers annuels dans le tableau", () => {
    const etudiant = {
      anonymiseLe: null,
      creeLe: d("2015-01-01"),
      dossiersAnnuels: [
        { anneeScolaire: { dateFin: d("2023-06-30") } },
        { anneeScolaire: { dateFin: d("2017-06-30") } },
      ],
    };
    expect(dateFinParcours(etudiant)).toEqual(d("2023-06-30"));
  });
});

describe("estEligibleAnonymisation", () => {
  it("n'est jamais éligible si déjà anonymisé, même très ancien", () => {
    const etudiant = { anonymiseLe: d("2010-01-01"), creeLe: d("2000-01-01"), dossiersAnnuels: [] };
    expect(estEligibleAnonymisation(etudiant, AUJOURDHUI)).toBe(false);
  });

  it("n'est pas éligible tant que le seuil n'est pas dépassé (dossier récent)", () => {
    const etudiant = {
      anonymiseLe: null,
      creeLe: d("2010-01-01"),
      dossiersAnnuels: [{ anneeScolaire: { dateFin: ilYA(1) } }],
    };
    expect(estEligibleAnonymisation(etudiant, AUJOURDHUI)).toBe(false);
  });

  it("devient éligible une fois le seuil de rétention dépassé", () => {
    const etudiant = {
      anonymiseLe: null,
      creeLe: d("2010-01-01"),
      dossiersAnnuels: [{ anneeScolaire: { dateFin: ilYA(SEUIL_ANNEES_INACTIVITE + 1) } }],
    };
    expect(estEligibleAnonymisation(etudiant, AUJOURDHUI)).toBe(true);
  });

  it("n'est pas encore éligible pile au seuil (comparaison stricte)", () => {
    const etudiant = {
      anonymiseLe: null,
      creeLe: d("2010-01-01"),
      dossiersAnnuels: [{ anneeScolaire: { dateFin: ilYA(SEUIL_ANNEES_INACTIVITE) } }],
    };
    expect(estEligibleAnonymisation(etudiant, AUJOURDHUI)).toBe(false);
  });

  it("s'appuie sur la création de la fiche pour une préinscription jamais confirmée", () => {
    const ancienne = { anonymiseLe: null, creeLe: ilYA(SEUIL_ANNEES_INACTIVITE + 1), dossiersAnnuels: [] };
    const recente = { anonymiseLe: null, creeLe: ilYA(1), dossiersAnnuels: [] };
    expect(estEligibleAnonymisation(ancienne, AUJOURDHUI)).toBe(true);
    expect(estEligibleAnonymisation(recente, AUJOURDHUI)).toBe(false);
  });

  it("reste non éligible si un dossier plus récent que la création existe", () => {
    // La fiche a été créée il y a longtemps, mais l'étudiant a un dossier
    // annuel récent : c'est ce dernier point de contact qui compte.
    const etudiant = {
      anonymiseLe: null,
      creeLe: ilYA(SEUIL_ANNEES_INACTIVITE + 5),
      dossiersAnnuels: [{ anneeScolaire: { dateFin: ilYA(1) } }],
    };
    expect(estEligibleAnonymisation(etudiant, AUJOURDHUI)).toBe(false);
  });
});
