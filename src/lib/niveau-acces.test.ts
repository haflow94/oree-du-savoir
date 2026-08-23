import { describe, expect, it } from "vitest";
import { couvre } from "./niveau-acces";

describe("couvre", () => {
  it("AUCUN ne couvre aucun niveau requis autre que AUCUN", () => {
    expect(couvre("AUCUN", "AUCUN")).toBe(true);
    expect(couvre("AUCUN", "LECTURE")).toBe(false);
    expect(couvre("AUCUN", "ECRITURE")).toBe(false);
  });

  it("LECTURE couvre LECTURE mais pas ECRITURE", () => {
    expect(couvre("LECTURE", "LECTURE")).toBe(true);
    expect(couvre("LECTURE", "ECRITURE")).toBe(false);
  });

  it("ECRITURE couvre tous les niveaux, y compris LECTURE", () => {
    expect(couvre("ECRITURE", "AUCUN")).toBe(true);
    expect(couvre("ECRITURE", "LECTURE")).toBe(true);
    expect(couvre("ECRITURE", "ECRITURE")).toBe(true);
  });
});
