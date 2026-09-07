import { describe, expect, it, vi } from "vitest";
import { limiteDebitDepassee } from "./rate-limit";

describe("limiteDebitDepassee", () => {
  it("autorise les tentatives sous le seuil", () => {
    const cle = `test-${Math.random()}`;
    expect(limiteDebitDepassee(cle, 3, 60_000)).toBe(false);
    expect(limiteDebitDepassee(cle, 3, 60_000)).toBe(false);
    expect(limiteDebitDepassee(cle, 3, 60_000)).toBe(false);
  });

  it("bloque une fois le seuil dépassé, sur la même fenêtre", () => {
    const cle = `test-${Math.random()}`;
    expect(limiteDebitDepassee(cle, 2, 60_000)).toBe(false);
    expect(limiteDebitDepassee(cle, 2, 60_000)).toBe(false);
    expect(limiteDebitDepassee(cle, 2, 60_000)).toBe(true);
    expect(limiteDebitDepassee(cle, 2, 60_000)).toBe(true);
  });

  it("ne mélange pas les compteurs de deux clés différentes (ex. deux IP distinctes)", () => {
    const cleA = `test-a-${Math.random()}`;
    const cleB = `test-b-${Math.random()}`;
    expect(limiteDebitDepassee(cleA, 1, 60_000)).toBe(false);
    expect(limiteDebitDepassee(cleA, 1, 60_000)).toBe(true);
    // La clé B n'a pas encore été sollicitée : son propre seuil ne doit rien
    // devoir à l'historique de la clé A.
    expect(limiteDebitDepassee(cleB, 1, 60_000)).toBe(false);
  });

  it("réinitialise le compteur une fois la fenêtre glissante écoulée", () => {
    vi.useFakeTimers();
    try {
      const cle = `test-${Math.random()}`;
      expect(limiteDebitDepassee(cle, 1, 1_000)).toBe(false);
      expect(limiteDebitDepassee(cle, 1, 1_000)).toBe(true);
      vi.advanceTimersByTime(1_001);
      expect(limiteDebitDepassee(cle, 1, 1_000)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
