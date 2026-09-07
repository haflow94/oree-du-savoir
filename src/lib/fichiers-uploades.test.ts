import { describe, expect, it } from "vitest";
import { detecterTypeMimeReel } from "./fichiers-uploades";

const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n...");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe("detecterTypeMimeReel", () => {
  it("reconnaît un PDF à sa signature", () => {
    expect(detecterTypeMimeReel(PDF)).toBe("application/pdf");
  });

  it("reconnaît un JPEG à sa signature", () => {
    expect(detecterTypeMimeReel(JPEG)).toBe("image/jpeg");
  });

  it("reconnaît un PNG à sa signature", () => {
    expect(detecterTypeMimeReel(PNG)).toBe("image/png");
  });

  it("rejette un fichier HTML/script renommé en .jpg (extension trompeuse)", () => {
    const faux = Buffer.from("<html><body><script>alert(document.cookie)</script></body></html>");
    expect(detecterTypeMimeReel(faux)).toBeNull();
  });

  it("rejette un SVG (peut contenir du JS) même si son type déclaré serait image/svg+xml", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(detecterTypeMimeReel(svg)).toBeNull();
  });

  it("rejette un fichier vide ou trop court pour porter une signature", () => {
    expect(detecterTypeMimeReel(Buffer.from(""))).toBeNull();
    expect(detecterTypeMimeReel(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("ne se laisse pas abuser par une signature ailleurs qu'en tête de fichier", () => {
    const contenu = Buffer.concat([Buffer.from("du texte quelconque "), PDF]);
    expect(detecterTypeMimeReel(contenu)).toBeNull();
  });
});
