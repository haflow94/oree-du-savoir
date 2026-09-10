import { describe, expect, it } from "vitest";
import { rendreDossierHtml } from "./render";

// Test RÉEL du rendu (compile le vrai fichier .hbs sur disque via
// Handlebars, aucun mock) — même esprit que render.test.ts (rendu réel via
// Chromium) mais sans dépendance à Chromium : suffisant ici puisqu'on
// n'inspecte que le HTML produit, jamais le PDF binaire. Couvre les deux
// bugs corrigés :
//   1. Aucune case CS/S/D cochée sur le dossier généré à la préinscription
//      (avant toute inscription effective à une Classe) — voir
//      creneau-correspondance.test.ts pour la logique pure, ce fichier
//      vérifie qu'elle est bien câblée jusqu'au gabarit réel.
//   2. La case d'autorisation photo/vidéo restait toujours vide, quelle que
//      soit la réponse de la famille.
// Les attributs data-creneau-coche / data-autorisation-photo-video-coche
// (templates .hbs) sont des marqueurs techniques invisibles à l'impression
// (même principe que data-documenso-signature déjà présent) : ils ne
// changent ni le contenu ni l'apparence du dossier, ils servent uniquement à
// vérifier ici, sans lancer Chromium, quelle case le gabarit a réellement
// cochée.

function cocheCreneau(html: string, code: string): boolean {
  const regex = new RegExp(`data-creneau-code="${code}" data-creneau-coche="(\\d)"`);
  const match = regex.exec(html);
  if (!match) throw new Error(`Carte créneau "${code}" introuvable dans le HTML rendu.`);
  return match[1] === "1";
}

function cocheAutorisation(html: string, reponse: "oui" | "non"): boolean {
  const regex = new RegExp(
    `data-autorisation-photo-video="${reponse}" data-autorisation-photo-video-coche="(\\d)"`,
  );
  const match = regex.exec(html);
  if (!match) throw new Error(`Case autorisation photo/vidéo "${reponse}" introuvable dans le HTML rendu.`);
  return match[1] === "1";
}

const creneauxSection = [
  { code: "CS", jour: "mardi et jeudi", horaire: "19h00 – 21h00", restriction: null },
  { code: "S", jour: "Samedi", horaire: "09h00 – 13h00", restriction: null },
  { code: "D", jour: "Dimanche", horaire: "09h00 – 13h00", restriction: null },
];

describe("Gabarit ADULTES — cases cochées automatiquement (rendu réel du .hbs)", () => {
  it("coche uniquement la carte correspondant au créneau souhaité à la préinscription", async () => {
    const contexte = {
      creneaux: creneauxSection.map((c) => ({ ...c, coche: c.code === "S" })),
      autorisation_photo_video_oui: false,
      autorisation_photo_video_non: false,
    };
    const html = await rendreDossierHtml("ADULTES", contexte);

    expect(cocheCreneau(html, "CS")).toBe(false);
    expect(cocheCreneau(html, "S")).toBe(true);
    expect(cocheCreneau(html, "D")).toBe(false);
  });

  it("ne coche aucune case quand aucun choix n'est enregistré (jamais de case cochée par défaut)", async () => {
    const contexte = {
      creneaux: creneauxSection.map((c) => ({ ...c, coche: false })),
      autorisation_photo_video_oui: false,
      autorisation_photo_video_non: false,
    };
    const html = await rendreDossierHtml("ADULTES", contexte);

    expect(cocheCreneau(html, "CS")).toBe(false);
    expect(cocheCreneau(html, "S")).toBe(false);
    expect(cocheCreneau(html, "D")).toBe(false);
  });

  it("coche la case OUI quand la famille a accepté", async () => {
    const contexte = {
      creneaux: creneauxSection.map((c) => ({ ...c, coche: false })),
      autorisation_photo_video_oui: true,
      autorisation_photo_video_non: false,
    };
    const html = await rendreDossierHtml("ADULTES", contexte);

    expect(cocheAutorisation(html, "oui")).toBe(true);
    expect(cocheAutorisation(html, "non")).toBe(false);
  });

  it("coche la case NON quand la famille a refusé (jamais confondu avec une absence de réponse)", async () => {
    const contexte = {
      creneaux: creneauxSection.map((c) => ({ ...c, coche: false })),
      autorisation_photo_video_oui: false,
      autorisation_photo_video_non: true,
    };
    const html = await rendreDossierHtml("ADULTES", contexte);

    expect(cocheAutorisation(html, "oui")).toBe(false);
    expect(cocheAutorisation(html, "non")).toBe(true);
  });

  it("ne coche ni OUI ni NON quand la réponse n'est pas renseignée (fiche antérieure à la question)", async () => {
    const contexte = {
      creneaux: creneauxSection.map((c) => ({ ...c, coche: false })),
      autorisation_photo_video_oui: false,
      autorisation_photo_video_non: false,
    };
    const html = await rendreDossierHtml("ADULTES", contexte);

    expect(cocheAutorisation(html, "oui")).toBe(false);
    expect(cocheAutorisation(html, "non")).toBe(false);
  });
});

describe("Gabarit JEUNES — case cochée automatiquement (rendu réel du .hbs)", () => {
  it("coche la carte créneau unique quand elle est le choix souhaité à la préinscription", async () => {
    const contexte = {
      creneau: { jour: "Dimanche", horaire: "13h30 – 16h30", coche: true },
      autorisation_photo_video_oui: true,
      autorisation_photo_video_non: false,
    };
    const html = await rendreDossierHtml("JEUNES", contexte);

    const match = /data-creneau-coche="(\d)"/.exec(html);
    expect(match?.[1]).toBe("1");
    expect(cocheAutorisation(html, "oui")).toBe(true);
    expect(cocheAutorisation(html, "non")).toBe(false);
  });

  it("coche la case NON pour un refus sur le dossier Jeunes", async () => {
    const contexte = {
      creneau: { jour: "Dimanche", horaire: "13h30 – 16h30", coche: false },
      autorisation_photo_video_oui: false,
      autorisation_photo_video_non: true,
    };
    const html = await rendreDossierHtml("JEUNES", contexte);

    expect(cocheAutorisation(html, "oui")).toBe(false);
    expect(cocheAutorisation(html, "non")).toBe(true);
  });
});
