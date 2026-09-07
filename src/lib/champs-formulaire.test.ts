import { describe, expect, it } from "vitest";
import { normaliserTelephone } from "./champs-formulaire";

describe("normaliserTelephone", () => {
  it("reconnaît comme équivalentes les mêmes variantes d'écriture d'un numéro français", () => {
    const attendu = "0612345678";
    expect(normaliserTelephone("06 12 34 56 78")).toBe(attendu);
    expect(normaliserTelephone("06.12.34.56.78")).toBe(attendu);
    expect(normaliserTelephone("06-12-34-56-78")).toBe(attendu);
    expect(normaliserTelephone("+33 6 12 34 56 78")).toBe(attendu);
    expect(normaliserTelephone("+33612345678")).toBe(attendu);
    expect(normaliserTelephone("0612345678")).toBe(attendu);
  });

  it("ne modifie pas un numéro déjà sans séparateur ni indicatif", () => {
    expect(normaliserTelephone("0491234567")).toBe("0491234567");
  });

  it("ne touche pas à un format qui ne commence pas par 0 ou +33 (reste tel quel, non validé ici)", () => {
    expect(normaliserTelephone("612345678")).toBe("612345678");
  });
});
