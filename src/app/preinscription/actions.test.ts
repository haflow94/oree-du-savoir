import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sectionFindMany = vi.fn();
const creneauSectionFindMany = vi.fn();
const etudiantCreate = vi.fn();
const documentCreate = vi.fn();
// Par défaut aucune année scolaire active (findFirst résout `undefined`,
// mêmes valeurs par défaut que Prisma) : la génération automatique du
// dossier (voir preinscription/actions.ts, appelée uniquement si
// `anneeActive` existe) reste alors un no-op silencieux dans ces tests, qui
// ne portent pas sur ce comportement — voir dossier/generation.test.ts pour
// celui-ci.
const anneeScolaireFindFirst = vi.fn();
const dossierAnnuelCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    section: { findMany: (...args: unknown[]) => sectionFindMany(...args) },
    creneauSection: { findMany: (...args: unknown[]) => creneauSectionFindMany(...args) },
    etudiant: { create: (...args: unknown[]) => etudiantCreate(...args) },
    document: { create: (...args: unknown[]) => documentCreate(...args) },
    anneeScolaire: { findFirst: (...args: unknown[]) => anneeScolaireFindFirst(...args) },
    dossierAnnuel: { create: (...args: unknown[]) => dossierAnnuelCreate(...args) },
  },
}));

const genererNouvelleVersionDossier = vi.fn();
vi.mock("@/lib/dossier/generation", () => ({
  genererNouvelleVersionDossier: (...args: unknown[]) => genererNouvelleVersionDossier(...args),
}));

const trouverDoublonEtudiant = vi.fn();
vi.mock("@/lib/doublons-etudiant", () => ({
  trouverDoublonEtudiant: (...args: unknown[]) => trouverDoublonEtudiant(...args),
  // Repris à l'identique de champs-formulaire.ts (source réelle) plutôt que
  // ré-importé : ce module a `import "server-only"` retiré exprès pour
  // rester testable (voir doublons-etudiant.ts), mais on garde ici un mock
  // complet et volontairement isolé des autres tests.
  LIBELLE_CRITERE_DOUBLON: {
    NOM_DATE: "même nom, prénom et date de naissance",
    EMAIL: "même e-mail",
    TELEPHONE: "même téléphone",
    EMAIL_ET_TELEPHONE: "même e-mail et téléphone",
  },
}));

const enregistrerDocumentEtudiant = vi.fn();
// N'utilise PAS importOriginal() ici : "@/lib/documents" porte
// `import "server-only"`, qui lève dès que le module réel est exécuté hors
// d'un composant serveur (y compris dans ce contexte de test) — on
// réimporte donc les fonctions pures directement depuis
// lib/documents-nommage.ts (sans cette garde), jamais depuis documents.ts.
vi.mock("@/lib/documents", async () => {
  const nommage = await import("@/lib/documents-nommage");
  return {
    ...nommage,
    enregistrerDocumentEtudiant: (...args: unknown[]) => enregistrerDocumentEtudiant(...args),
  };
});

const adresseIpClient = vi.fn();
const limiteDebitDepassee = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  adresseIpClient: (...args: unknown[]) => adresseIpClient(...args),
  limiteDebitDepassee: (...args: unknown[]) => limiteDebitDepassee(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const { preinscrireAction } = await import("./actions");

// Mêmes signatures magiques que src/lib/fichiers-uploades.test.ts : le
// contenu réel importe pour detecterTypeMimeReel (aucun mock ici, la vraie
// validation tourne), pas besoin d'un fichier JPEG/PDF complet et valide.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n...");

// Formulaire minimal mais complet pour un dossier "Jeunes" (le plus court
// chemin de validation valide : les coordonnées de l'étudiant lui-même ne
// sont pas exigées, seulement celles du responsable légal — voir la
// branche `estJeunes` de preinscrireAction).
function formulaireValide(): FormData {
  const fd = new FormData();
  fd.set("civilite", "M");
  fd.set("nom", "Dupont");
  fd.set("prenom", "Ali");
  fd.set("dateNaissance", "2012-05-01");
  fd.set("villeNaissance", "Paris");
  fd.set("autorisationPhotoVideo", "oui");
  fd.set("rgpd", "on");
  fd.set("ligneId", "1");
  fd.set("sectionId-1", "sec-jeunes");
  fd.set("typePieceIdentite", "CARTE_IDENTITE");
  fd.set("dateExpirationPiece", "2030-01-01");
  fd.set("responsable1Nom", "Dupont");
  fd.set("responsable1Prenom", "Fatima");
  fd.set("responsable1Telephone", "0612345678");
  fd.set("responsable1Email", "fatima@example.com");
  fd.set("contactUrgenceNom", "Martin");
  fd.set("contactUrgencePrenom", "Sophie");
  fd.set("contactUrgenceTelephone", "0698765432");
  fd.set("photo", new File([JPEG], "photo.jpg", { type: "image/jpeg" }));
  fd.set("pieceIdentite", new File([PDF], "piece.pdf", { type: "application/pdf" }));
  return fd;
}

describe("preinscrireAction — notification de préinscription", () => {
  beforeEach(() => {
    adresseIpClient.mockResolvedValue("1.2.3.4");
    limiteDebitDepassee.mockReturnValue(false);
    sectionFindMany.mockResolvedValue([{ id: "sec-jeunes", nom: "Jeunes", catalogueNiveaux: "AUCUN" }]);
    trouverDoublonEtudiant.mockResolvedValue(null);
    etudiantCreate.mockResolvedValue({ id: "etu1" });
    enregistrerDocumentEtudiant.mockResolvedValue("etu1/photo.jpg");
    documentCreate.mockResolvedValue({});
  });

  afterEach(() => vi.clearAllMocks());

  it("crée la notification dans la même écriture Prisma que l'étudiant (nested create), jamais un job séparé", async () => {
    const resultat = await preinscrireAction(formulaireValide());

    expect(resultat).toEqual({ ok: true });
    expect(etudiantCreate).toHaveBeenCalledTimes(1);
    const donnees = etudiantCreate.mock.calls[0][0].data;
    expect(donnees.notificationsPreinscription).toEqual({ create: {} });
    expect(donnees.statutInscription).toBe("PREINSCRIT");
  });

  it("invalide le cache de /inscriptions juste après la mutation", async () => {
    await preinscrireAction(formulaireValide());
    expect(revalidatePath).toHaveBeenCalledWith("/inscriptions");
  });

  it("ne crée ni étudiant ni notification si la validation échoue avant la mutation", async () => {
    const fd = formulaireValide();
    fd.delete("rgpd");

    const resultat = await preinscrireAction(fd);

    expect(resultat).toEqual({ erreur: expect.any(String) });
    expect(etudiantCreate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un doublon NOM_DATE ne modifie pas remarque (déjà auto-explicatif via la popup de comparaison)", async () => {
    trouverDoublonEtudiant.mockResolvedValueOnce({ id: "existant1", nom: "Dupont", prenom: "Ali", critere: "NOM_DATE" });

    await preinscrireAction(formulaireValide());

    const donnees = etudiantCreate.mock.calls[0][0].data;
    expect(donnees.doublonPotentielId).toBe("existant1");
    expect(donnees.remarque).toBeNull();
  });

  it("un doublon EMAIL ajoute une remarque explicite, jamais bloquante (l'étudiant est créé quand même)", async () => {
    trouverDoublonEtudiant.mockResolvedValueOnce({ id: "existant1", nom: "Autre", prenom: "Personne", critere: "EMAIL" });

    const resultat = await preinscrireAction(formulaireValide());

    expect(resultat).toEqual({ ok: true });
    const donnees = etudiantCreate.mock.calls[0][0].data;
    expect(donnees.doublonPotentielId).toBe("existant1");
    expect(donnees.remarque).toBe("Doublon potentiel détecté (même e-mail).");
  });

  it("un doublon TELEPHONE ajoute la remarque correspondante", async () => {
    trouverDoublonEtudiant.mockResolvedValueOnce({ id: "existant1", nom: "Autre", prenom: "Personne", critere: "TELEPHONE" });

    await preinscrireAction(formulaireValide());

    expect(etudiantCreate.mock.calls[0][0].data.remarque).toBe("Doublon potentiel détecté (même téléphone).");
  });

  it("un doublon EMAIL_ET_TELEPHONE ajoute la remarque combinée", async () => {
    trouverDoublonEtudiant.mockResolvedValueOnce({ id: "existant1", nom: "Autre", prenom: "Personne", critere: "EMAIL_ET_TELEPHONE" });

    await preinscrireAction(formulaireValide());

    expect(etudiantCreate.mock.calls[0][0].data.remarque).toBe("Doublon potentiel détecté (même e-mail et téléphone).");
  });

  it("transmet les coordonnées de l'étudiant et du responsable à la détection de doublon, indépendamment du nom", async () => {
    await preinscrireAction(formulaireValide());

    const appel = trouverDoublonEtudiant.mock.calls[0][0];
    expect(appel.emails).toContain("fatima@example.com");
    expect(appel.telephones).toContain("0612345678");
  });
});

// Régression : le PDF affichait la phrase d'autorisation photo/vidéo sans
// aucune case cochée (ni "oui" ni "non") car aucune réponse n'était
// collectée à la préinscription. Toujours explicite, jamais de valeur
// implicite (règle non négociable "ne jamais deviner") — voir aussi
// src/lib/dossier/context.ts.
describe("preinscrireAction — autorisation photo/vidéo (OUI/NON explicite)", () => {
  beforeEach(() => {
    adresseIpClient.mockResolvedValue("1.2.3.4");
    limiteDebitDepassee.mockReturnValue(false);
    sectionFindMany.mockResolvedValue([{ id: "sec-jeunes", nom: "Jeunes", catalogueNiveaux: "AUCUN" }]);
    trouverDoublonEtudiant.mockResolvedValue(null);
    etudiantCreate.mockResolvedValue({ id: "etu1" });
    enregistrerDocumentEtudiant.mockResolvedValue("etu1/photo.jpg");
    documentCreate.mockResolvedValue({});
  });

  afterEach(() => vi.clearAllMocks());

  it("refuse la préinscription quand la question n'a pas de réponse (champ absent)", async () => {
    const fd = formulaireValide();
    fd.delete("autorisationPhotoVideo");

    const resultat = await preinscrireAction(fd);

    expect(resultat).toEqual({ erreur: expect.any(String) });
    expect(etudiantCreate).not.toHaveBeenCalled();
  });

  it("refuse toute valeur qui n'est ni 'oui' ni 'non' (jamais interprétée par défaut)", async () => {
    const fd = formulaireValide();
    fd.set("autorisationPhotoVideo", "peut-être");

    const resultat = await preinscrireAction(fd);

    expect(resultat).toEqual({ erreur: expect.any(String) });
    expect(etudiantCreate).not.toHaveBeenCalled();
  });

  it("enregistre autorisationPhotoVideo = true quand la famille répond « oui »", async () => {
    const fd = formulaireValide();
    fd.set("autorisationPhotoVideo", "oui");

    const resultat = await preinscrireAction(fd);

    expect(resultat).toEqual({ ok: true });
    expect(etudiantCreate.mock.calls[0][0].data.autorisationPhotoVideo).toBe(true);
  });

  it("enregistre autorisationPhotoVideo = false quand la famille répond « non » (jamais confondu avec « non renseigné »)", async () => {
    const fd = formulaireValide();
    fd.set("autorisationPhotoVideo", "non");

    const resultat = await preinscrireAction(fd);

    expect(resultat).toEqual({ ok: true });
    expect(etudiantCreate.mock.calls[0][0].data.autorisationPhotoVideo).toBe(false);
  });
});

// Régression : le niveau (Débutant/Intermédiaire, 1ère…5ème année — voir
// Section.catalogueNiveaux, src/lib/niveaux-section.ts) doit être un choix
// unique obligatoire dès que la section choisie porte un catalogue, pour
// permettre au staff de choisir la bonne cohorte — jamais fait confiance au
// seul client, revalidé contre le catalogue réel de la section.
describe("preinscrireAction — niveau obligatoire selon le catalogue de la section", () => {
  beforeEach(() => {
    adresseIpClient.mockResolvedValue("1.2.3.4");
    limiteDebitDepassee.mockReturnValue(false);
    sectionFindMany.mockResolvedValue([
      { id: "sec-coran", nom: "Études Coraniques", catalogueNiveaux: "DEBUTANT_INTERMEDIAIRE" },
    ]);
    trouverDoublonEtudiant.mockResolvedValue(null);
    etudiantCreate.mockResolvedValue({ id: "etu1" });
    enregistrerDocumentEtudiant.mockResolvedValue("etu1/photo.jpg");
    documentCreate.mockResolvedValue({});
  });

  afterEach(() => vi.clearAllMocks());

  function formulaireCoran(): FormData {
    const fd = formulaireValide();
    fd.set("sectionId-1", "sec-coran");
    // Une section hors "Jeunes" exige les coordonnées propres de l'étudiant
    // (voir la branche !estJeunes de preinscrireAction), pas seulement
    // celles du responsable légal.
    fd.set("telephoneMobile", "0611223344");
    fd.set("email", "ali@example.com");
    fd.set("adresse", "1 rue des Lilas");
    fd.set("codePostal", "75001");
    fd.set("ville", "Paris");
    fd.set("niveauEtudes", "Terminale");
    return fd;
  }

  it("refuse la préinscription si aucun niveau n'est coché pour une section à catalogue", async () => {
    const resultat = await preinscrireAction(formulaireCoran());

    expect(resultat).toEqual({ erreur: expect.any(String) });
    expect(etudiantCreate).not.toHaveBeenCalled();
  });

  it("refuse une valeur de niveau hors catalogue (client altéré, jamais fait confiance)", async () => {
    const fd = formulaireCoran();
    fd.set("niveau-1", "Avancé");

    const resultat = await preinscrireAction(fd);

    expect(resultat).toEqual({ erreur: expect.any(String) });
    expect(etudiantCreate).not.toHaveBeenCalled();
  });

  it("accepte un niveau du catalogue et l'enregistre sur niveauDeclare", async () => {
    const fd = formulaireCoran();
    fd.set("niveau-1", "Débutant");

    const resultat = await preinscrireAction(fd);

    expect(resultat).toEqual({ ok: true });
    expect(etudiantCreate.mock.calls[0][0].data.niveauDeclare).toBe("Débutant");
  });
});

describe("preinscrireAction — génération automatique du dossier (DossierAnnuel + PDF)", () => {
  beforeEach(() => {
    adresseIpClient.mockResolvedValue("1.2.3.4");
    limiteDebitDepassee.mockReturnValue(false);
    sectionFindMany.mockResolvedValue([
      { id: "sec-jeunes", nom: "Jeunes", fraisFormation: "100", fraisDossier: "20", catalogueNiveaux: "AUCUN" },
    ]);
    trouverDoublonEtudiant.mockResolvedValue(null);
    etudiantCreate.mockResolvedValue({ id: "etu1" });
    enregistrerDocumentEtudiant.mockResolvedValue("etu1/photo.jpg");
    documentCreate.mockResolvedValue({});
    anneeScolaireFindFirst.mockResolvedValue({ id: "annee1" });
    dossierAnnuelCreate.mockResolvedValue({ id: "dossier1" });
    genererNouvelleVersionDossier.mockResolvedValue({ documentId: "doc1", numeroVersion: 1 });
  });

  afterEach(() => vi.clearAllMocks());

  it("génère le dossier dès la préinscription quand aucun doublon n'est détecté", async () => {
    await preinscrireAction(formulaireValide());

    expect(dossierAnnuelCreate).toHaveBeenCalledTimes(1);
    expect(genererNouvelleVersionDossier).toHaveBeenCalledWith(
      expect.objectContaining({ etudiantId: "etu1", dossierAnnuelId: "dossier1" }),
    );
  });

  it("un doublon EMAIL (fratrie inscrite par le même responsable) n'empêche pas la génération automatique du dossier", async () => {
    trouverDoublonEtudiant.mockResolvedValueOnce({ id: "existant1", nom: "Autre", prenom: "Personne", critere: "EMAIL" });

    await preinscrireAction(formulaireValide());

    expect(dossierAnnuelCreate).toHaveBeenCalledTimes(1);
    expect(genererNouvelleVersionDossier).toHaveBeenCalledTimes(1);
  });

  it("un doublon TELEPHONE n'empêche pas non plus la génération automatique du dossier", async () => {
    trouverDoublonEtudiant.mockResolvedValueOnce({ id: "existant1", nom: "Autre", prenom: "Personne", critere: "TELEPHONE" });

    await preinscrireAction(formulaireValide());

    expect(dossierAnnuelCreate).toHaveBeenCalledTimes(1);
    expect(genererNouvelleVersionDossier).toHaveBeenCalledTimes(1);
  });

  it("un doublon EMAIL_ET_TELEPHONE n'empêche pas non plus la génération automatique du dossier", async () => {
    trouverDoublonEtudiant.mockResolvedValueOnce({
      id: "existant1",
      nom: "Autre",
      prenom: "Personne",
      critere: "EMAIL_ET_TELEPHONE",
    });

    await preinscrireAction(formulaireValide());

    expect(dossierAnnuelCreate).toHaveBeenCalledTimes(1);
    expect(genererNouvelleVersionDossier).toHaveBeenCalledTimes(1);
  });

  it("un doublon NOM_DATE (probable vrai doublon) laisse le staff trancher avant de créer un dossier", async () => {
    trouverDoublonEtudiant.mockResolvedValueOnce({ id: "existant1", nom: "Dupont", prenom: "Ali", critere: "NOM_DATE" });

    await preinscrireAction(formulaireValide());

    expect(dossierAnnuelCreate).not.toHaveBeenCalled();
    expect(genererNouvelleVersionDossier).not.toHaveBeenCalled();
  });
});
