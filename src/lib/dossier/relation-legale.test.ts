import { describe, expect, it } from "vitest";
import { relationAutre } from "./relation-legale";

describe("relationAutre", () => {
  it("masque le texte quand le lien est Père", () => {
    expect(relationAutre("Père")).toBe("");
  });

  it("masque le texte quand le lien est Mère (insensible à la casse et aux espaces)", () => {
    expect(relationAutre(" mère ")).toBe("");
  });

  it("affiche le lien tel quel pour toute autre valeur (case Autre)", () => {
    expect(relationAutre("Tuteur")).toBe("Tuteur");
    expect(relationAutre("Grand-mère")).toBe("Grand-mère");
  });
});
