import { describe, expect, it } from "vitest";
import { estCreneauChoisi, estCreneauCoche } from "./creneau-correspondance";

describe("estCreneauChoisi", () => {
  it("reconnaît un créneau du soir sur deux jours (mardi et jeudi)", () => {
    expect(
      estCreneauChoisi(
        { jour: "mardi et jeudi", horaire: "19h00 – 21h00" },
        { jour: "MARDI", heureDebut: "19:00", heureFin: "21:00" },
      ),
    ).toBe(true);
  });

  it("reconnaît un créneau du dimanche", () => {
    expect(
      estCreneauChoisi(
        { jour: "Dimanche", horaire: "09h00 – 13h00" },
        { jour: "DIMANCHE", heureDebut: "09:00", heureFin: "13:00" },
      ),
    ).toBe(true);
  });

  it("refuse un jour différent", () => {
    expect(
      estCreneauChoisi(
        { jour: "Samedi", horaire: "09h00 – 13h00" },
        { jour: "DIMANCHE", heureDebut: "09:00", heureFin: "13:00" },
      ),
    ).toBe(false);
  });

  it("refuse un horaire différent le même jour", () => {
    expect(
      estCreneauChoisi(
        { jour: "Dimanche", horaire: "14h00 – 18h00" },
        { jour: "DIMANCHE", heureDebut: "09:00", heureFin: "13:00" },
      ),
    ).toBe(false);
  });
});

// Régression : le dossier PDF est généré (et peut être signé) dès la
// préinscription, avant toute inscription effective à une Classe — voir
// preinscription/actions.ts#genererNouvelleVersionDossier appelé juste après
// la création de l'étudiant. `classesSuivies` est alors systématiquement
// vide, et estCreneauChoisi seul ne coche donc jamais aucune carte : c'est le
// bug observé ("aucune des trois cases n'est cochée"). estCreneauCoche doit
// se rabattre sur le choix explicite de la préinscription dans ce cas.
describe("estCreneauCoche", () => {
  const creneauCS = { id: "creneau-cs", jour: "mardi et jeudi", horaire: "19h00 – 21h00" };
  const creneauS = { id: "creneau-s", jour: "Samedi", horaire: "09h00 – 13h00" };
  const creneauD = { id: "creneau-d", jour: "Dimanche", horaire: "09h00 – 13h00" };

  it("coche la carte correspondant au choix de préinscription, sans aucune classe suivie", () => {
    expect(estCreneauCoche(creneauS, { creneauSouhaiteId: "creneau-s", classesSuivies: [] })).toBe(true);
    expect(estCreneauCoche(creneauCS, { creneauSouhaiteId: "creneau-s", classesSuivies: [] })).toBe(false);
    expect(estCreneauCoche(creneauD, { creneauSouhaiteId: "creneau-s", classesSuivies: [] })).toBe(false);
  });

  it("ne coche rien quand aucun choix n'est enregistré et qu'aucune classe n'est suivie", () => {
    expect(estCreneauCoche(creneauS, { creneauSouhaiteId: null, classesSuivies: [] })).toBe(false);
  });

  it("se rabat sur la classe réellement suivie une fois le choix de préinscription effacé (inscription effective)", () => {
    const classeSamedi = { jour: "SAMEDI" as const, heureDebut: "09:00", heureFin: "13:00" };
    expect(estCreneauCoche(creneauS, { creneauSouhaiteId: null, classesSuivies: [classeSamedi] })).toBe(true);
    expect(estCreneauCoche(creneauD, { creneauSouhaiteId: null, classesSuivies: [classeSamedi] })).toBe(false);
  });

  it("priorise le choix de préinscription même si une classe suivie correspondrait à une autre carte", () => {
    // Cas normalement impossible en pratique (inscrireEtudiantAction efface
    // creneauSouhaiteId dès l'inscription effective, voir presences/actions.ts)
    // — vérifie que la priorité documentée est bien respectée si jamais les
    // deux étaient renseignés simultanément.
    const classeDimanche = { jour: "DIMANCHE" as const, heureDebut: "09:00", heureFin: "13:00" };
    expect(
      estCreneauCoche(creneauS, { creneauSouhaiteId: "creneau-s", classesSuivies: [classeDimanche] }),
    ).toBe(true);
    expect(
      estCreneauCoche(creneauD, { creneauSouhaiteId: "creneau-s", classesSuivies: [classeDimanche] }),
    ).toBe(false);
  });
});
