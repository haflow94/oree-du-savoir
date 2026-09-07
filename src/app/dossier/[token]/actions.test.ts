import { beforeEach, describe, expect, it, vi } from "vitest";

const resoudreAccesDossier = vi.fn();
vi.mock("@/lib/acces-dossier", () => ({
  resoudreAccesDossier: (...args: unknown[]) => resoudreAccesDossier(...args),
}));

const dossierAnnuelFindUnique = vi.fn();
const dossierAnnuelFindUniqueOrThrow = vi.fn();
const dossierAnnuelUpdate = vi.fn();
const dossierAnnuelUpdateMany = vi.fn();
const documentFindFirst = vi.fn();
const etudiantUpdate = vi.fn();
const demandeCorrectionCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dossierAnnuel: {
      findUnique: (...args: unknown[]) => dossierAnnuelFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => dossierAnnuelFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => dossierAnnuelUpdate(...args),
      updateMany: (...args: unknown[]) => dossierAnnuelUpdateMany(...args),
    },
    document: { findFirst: (...args: unknown[]) => documentFindFirst(...args) },
    etudiant: { update: (...args: unknown[]) => etudiantUpdate(...args) },
    demandeCorrection: { create: (...args: unknown[]) => demandeCorrectionCreate(...args) },
  },
}));

const genererNouvelleVersionDossier = vi.fn();
vi.mock("@/lib/dossier/generation", () => ({
  genererNouvelleVersionDossier: (...args: unknown[]) => genererNouvelleVersionDossier(...args),
}));

const creerEtEnvoyerDocumentSignature = vi.fn();
const annulerDocumentSignature = vi.fn();
const obtenirLienSignature = vi.fn();
vi.mock("@/lib/documenso", () => ({
  creerEtEnvoyerDocumentSignature: (...args: unknown[]) => creerEtEnvoyerDocumentSignature(...args),
  annulerDocumentSignature: (...args: unknown[]) => annulerDocumentSignature(...args),
  obtenirLienSignature: (...args: unknown[]) => obtenirLienSignature(...args),
}));

const lireDocument = vi.fn();
vi.mock("@/lib/documents", () => ({
  lireDocument: (...args: unknown[]) => lireDocument(...args),
}));

vi.mock("@/lib/champs-formulaire", () => ({
  estEmailValide: (v: string) => v.includes("@"),
  estTelephoneValide: () => true,
  estCodePostalValide: () => true,
}));

// limiteDebitDepassee est mockée ici (contrairement à d'autres fichiers de
// ce projet qui réutilisent l'implémentation réelle) : ce fichier compte
// désormais assez de `it()` appelant confirmerEtSignerAction avec la même
// IP mockée pour dépasser en pratique le seuil réel de 10 tentatives/15 min
// (compteur en mémoire, partagé entre tous les tests du fichier) — la
// mocker évite un déclenchement du rate limit dépendant de l'ordre
// d'exécution des tests. Un test dédié (scénario I2) contrôle explicitement
// son retour à true pour vérifier le blocage lui-même.
const limiteDebitDepassee = vi.fn<(cle: string, maxTentatives: number, fenetreMs: number) => boolean>(
  () => false,
);
vi.mock("@/lib/rate-limit", () => ({
  adresseIpClient: async () => "127.0.0.1",
  limiteDebitDepassee: (...args: [string, number, number]) => limiteDebitDepassee(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class RedirectSignal extends Error {
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { modifierChampsAction, demanderCorrectionAction, confirmerEtSignerAction } = await import("./actions");

function form(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

function dossier(overrides: Record<string, unknown> = {}) {
  return {
    id: "dos1",
    etudiantId: "et1",
    statutSignature: "A_VERIFIER",
    documensoDocumentId: null,
    etudiant: {
      sectionSouhaiteeId: "sec1",
      dateNaissance: new Date("2000-01-01"), // majeur par défaut
      prenom: "Léo",
      nom: "Dupont",
      email: "leo@example.com",
      responsables: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  resoudreAccesDossier.mockReset();
  dossierAnnuelFindUnique.mockReset();
  dossierAnnuelFindUniqueOrThrow.mockReset();
  dossierAnnuelUpdate.mockReset();
  dossierAnnuelUpdateMany.mockReset();
  documentFindFirst.mockReset();
  etudiantUpdate.mockReset();
  demandeCorrectionCreate.mockReset();
  genererNouvelleVersionDossier.mockReset();
  creerEtEnvoyerDocumentSignature.mockReset();
  annulerDocumentSignature.mockReset();
  obtenirLienSignature.mockReset();
  lireDocument.mockReset();
  limiteDebitDepassee.mockReset();
  limiteDebitDepassee.mockReturnValue(false);
  // Réservation atomique de confirmerEtSignerAction (voir bilan d'audit —
  // I1) : gagnée par défaut dans tous les tests qui ne testent pas
  // spécifiquement la perte de la course.
  dossierAnnuelUpdateMany.mockResolvedValue({ count: 1 });
});

describe("modifierChampsAction", () => {
  it("refuse un token invalide", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: false, raison: "TOKEN_INCONNU" });
    const res = await modifierChampsAction(form({ token: "x", telephoneMobile: "0600000000" }));
    expect(res).toEqual({ erreur: "Lien invalide ou expiré." });
    expect(etudiantUpdate).not.toHaveBeenCalled();
  });

  it("refuse toute modification une fois le dossier signé", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier({ statutSignature: "SIGNEE" }));
    const res = await modifierChampsAction(form({ token: "x", telephoneMobile: "0600000000" }));
    expect("erreur" in res && res.erreur).toMatch(/déjà signé/);
    expect(etudiantUpdate).not.toHaveBeenCalled();
  });

  it("scénario 2 — une correction simple invalide la confirmation et régénère une nouvelle version", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    genererNouvelleVersionDossier.mockResolvedValue({ documentId: "doc2", numeroVersion: 2 });

    const res = await modifierChampsAction(form({ token: "x", telephoneMobile: "0611111111" }));

    expect(res).toEqual({ ok: true });
    expect(etudiantUpdate).toHaveBeenCalledWith({
      where: { id: "et1" },
      data: { telephoneMobile: "0611111111" },
    });
    expect(genererNouvelleVersionDossier).toHaveBeenCalledWith({
      etudiantId: "et1",
      sectionId: "sec1",
      dossierAnnuelId: "dos1",
    });
  });

  it("annule l'enveloppe Documenso périmée avant de régénérer si une version était déjà envoyée en signature", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier({ statutSignature: "ENVOYEE_SIGNATURE", documensoDocumentId: 42 }));
    genererNouvelleVersionDossier.mockResolvedValue({ documentId: "doc2", numeroVersion: 2 });

    await modifierChampsAction(form({ token: "x", adresse: "1 rue Neuve" }));

    expect(annulerDocumentSignature).toHaveBeenCalledWith(42);
    expect(dossierAnnuelUpdate).toHaveBeenCalledWith({
      where: { id: "dos1" },
      data: { documensoDocumentId: null },
    });
  });

  it("rejette un email mal formé sans toucher la base", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    const res = await modifierChampsAction(form({ token: "x", email: "pas-un-email" }));
    expect("erreur" in res).toBe(true);
    expect(etudiantUpdate).not.toHaveBeenCalled();
  });
});

describe("demanderCorrectionAction", () => {
  it("crée une demande de correction rattachée au dossier résolu par le token", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier());

    const res = await demanderCorrectionAction(form({ token: "x", message: "Erreur sur ma date de naissance" }));

    expect(res).toEqual({ ok: true });
    expect(demandeCorrectionCreate).toHaveBeenCalledWith({
      data: { dossierAnnuelId: "dos1", message: "Erreur sur ma date de naissance" },
    });
  });
});

describe("confirmerEtSignerAction", () => {
  it("redirige vers l'accès refusé pour un token invalide", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: false, raison: "TOKEN_INCONNU" });
    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({ url: "/acces-refuse" });
  });

  it("refuse de re-signer un dossier déjà signé", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier({ statutSignature: "SIGNEE" }));
    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "/dossier/x?erreur=DEJA_SIGNE",
    });
    expect(creerEtEnvoyerDocumentSignature).not.toHaveBeenCalled();
  });

  it("un second clic sur une enveloppe déjà envoyée redemande le même lien plutôt que d'en recréer un second", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier({ statutSignature: "ENVOYEE_SIGNATURE", documensoDocumentId: 42 }));
    obtenirLienSignature.mockResolvedValue("https://documenso.local/sign/abc");

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "https://documenso.local/sign/abc",
    });
    expect(creerEtEnvoyerDocumentSignature).not.toHaveBeenCalled();
  });

  it("scénario 7 — un étudiant majeur signe lui-même", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    documentFindFirst.mockResolvedValue({ numeroVersion: 3, nomFichier: "dossier-v3.pdf", cheminRelatif: "et1/dossier-v3.pdf" });
    lireDocument.mockResolvedValue(Buffer.from("pdf"));
    creerEtEnvoyerDocumentSignature.mockResolvedValue({ documentId: 99, signingUrl: "https://documenso.local/sign/xyz" });

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "https://documenso.local/sign/xyz",
    });

    expect(creerEtEnvoyerDocumentSignature).toHaveBeenCalledWith(
      expect.objectContaining({ signataireNom: "Léo Dupont", signataireEmail: "leo@example.com" }),
    );
    // Réservation atomique (voir bilan d'audit — I1) avant l'appel Documenso.
    expect(dossierAnnuelUpdateMany).toHaveBeenCalledWith({
      where: { id: "dos1", statutSignature: "A_VERIFIER", versionConfirmeeNumero: null },
      data: { versionConfirmeeNumero: 3, versionConfirmeeLe: expect.any(Date) },
    });
    // Écriture finale après succès Documenso.
    expect(dossierAnnuelUpdate).toHaveBeenCalledWith({
      where: { id: "dos1" },
      data: { documensoDocumentId: 99, statutSignature: "ENVOYEE_SIGNATURE", envoyeSignatureLe: expect.any(Date) },
    });
  });

  it("scénario 6 — un étudiant mineur fait signer son responsable légal", async () => {
    const dansDixAns = new Date();
    dansDixAns.setFullYear(dansDixAns.getFullYear() - 15);
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(
      dossier({
        etudiant: {
          sectionSouhaiteeId: "sec1",
          dateNaissance: dansDixAns,
          prenom: "Léa",
          nom: "Martin",
          email: null,
          responsables: [{ prenom: "Fatima", nom: "Martin", email: "fatima@example.com" }],
        },
      }),
    );
    documentFindFirst.mockResolvedValue({ numeroVersion: 1, nomFichier: "dossier-v1.pdf", cheminRelatif: "et2/dossier-v1.pdf" });
    lireDocument.mockResolvedValue(Buffer.from("pdf"));
    creerEtEnvoyerDocumentSignature.mockResolvedValue({ documentId: 100, signingUrl: "https://documenso.local/sign/resp" });

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "https://documenso.local/sign/resp",
    });

    expect(creerEtEnvoyerDocumentSignature).toHaveBeenCalledWith(
      expect.objectContaining({ signataireNom: "Fatima Martin", signataireEmail: "fatima@example.com" }),
    );
  });

  it("bloque la signature si aucun signataire exploitable n'est disponible (mineur sans responsable connu)", async () => {
    const dansDixAns = new Date();
    dansDixAns.setFullYear(dansDixAns.getFullYear() - 15);
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(
      dossier({
        etudiant: {
          sectionSouhaiteeId: "sec1",
          dateNaissance: dansDixAns,
          prenom: "Léa",
          nom: "Martin",
          email: null,
          responsables: [],
        },
      }),
    );
    documentFindFirst.mockResolvedValue({ numeroVersion: 1, nomFichier: "dossier-v1.pdf", cheminRelatif: "et2/dossier-v1.pdf" });

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "/dossier/x?erreur=SIGNATAIRE_INCOMPLET",
    });
    expect(creerEtEnvoyerDocumentSignature).not.toHaveBeenCalled();
  });

  // --- I1 : robustesse face à la concurrence (voir bilan d'audit) ---

  it("I1/cas A+E — une requête concurrente qui perd la réservation ne crée jamais de deuxième enveloppe : elle réutilise le lien de celle qui a gagné", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    // Cette requête lit encore A_VERIFIER (avant que l'autre n'ait committé)...
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    documentFindFirst.mockResolvedValue({ numeroVersion: 1, nomFichier: "dossier-v1.pdf", cheminRelatif: "et1/dossier-v1.pdf" });
    // ...mais perd la réservation atomique : l'autre requête a déjà committé.
    dossierAnnuelUpdateMany.mockResolvedValue({ count: 0 });
    dossierAnnuelFindUniqueOrThrow.mockResolvedValue({
      statutSignature: "ENVOYEE_SIGNATURE",
      documensoDocumentId: 77,
    });
    obtenirLienSignature.mockResolvedValue("https://documenso.local/sign/gagnant");

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "https://documenso.local/sign/gagnant",
    });

    expect(creerEtEnvoyerDocumentSignature).not.toHaveBeenCalled();
    expect(obtenirLienSignature).toHaveBeenCalledWith(77);
  });

  it("I1/cas E — une requête concurrente qui perd la réservation contre un dossier déjà SIGNEE affiche l'erreur déjà-signé, sans nouvelle enveloppe", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    documentFindFirst.mockResolvedValue({ numeroVersion: 1, nomFichier: "dossier-v1.pdf", cheminRelatif: "et1/dossier-v1.pdf" });
    dossierAnnuelUpdateMany.mockResolvedValue({ count: 0 });
    dossierAnnuelFindUniqueOrThrow.mockResolvedValue({ statutSignature: "SIGNEE", documensoDocumentId: 77 });

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "/dossier/x?erreur=DEJA_SIGNE",
    });
    expect(creerEtEnvoyerDocumentSignature).not.toHaveBeenCalled();
  });

  it("I1/cas D — une requête qui perd la réservation contre une autre déjà repartie en A_VERIFIER (échec+retry de l'autre) redirige vers une erreur générique, sans boucler ni créer d'enveloppe", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    documentFindFirst.mockResolvedValue({ numeroVersion: 1, nomFichier: "dossier-v1.pdf", cheminRelatif: "et1/dossier-v1.pdf" });
    dossierAnnuelUpdateMany.mockResolvedValue({ count: 0 });
    dossierAnnuelFindUniqueOrThrow.mockResolvedValue({ statutSignature: "A_VERIFIER", documensoDocumentId: null });

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "/dossier/x?erreur=SIGNATURE_INDISPONIBLE",
    });
    expect(creerEtEnvoyerDocumentSignature).not.toHaveBeenCalled();
  });

  it("I1/cas B — réservation gagnée mais échec de l'envoi à Documenso : relâche la réservation pour permettre un nouvel essai, sans bloquer le dossier", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    documentFindFirst.mockResolvedValue({ numeroVersion: 5, nomFichier: "dossier-v5.pdf", cheminRelatif: "et1/dossier-v5.pdf" });
    lireDocument.mockResolvedValue(Buffer.from("pdf"));
    dossierAnnuelUpdateMany.mockResolvedValueOnce({ count: 1 }); // réservation gagnée
    creerEtEnvoyerDocumentSignature.mockRejectedValue(new Error("Documenso indisponible"));

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "/dossier/x?erreur=SIGNATURE_INDISPONIBLE",
    });

    // Deuxième appel à updateMany : relâche la réservation (jamais de statut
    // ENVOYEE_SIGNATURE écrit sans enveloppe Documenso réellement exploitable).
    expect(dossierAnnuelUpdateMany).toHaveBeenCalledTimes(2);
    expect(dossierAnnuelUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "dos1", versionConfirmeeNumero: 5 },
      data: { versionConfirmeeNumero: null, versionConfirmeeLe: null },
    });
    expect(dossierAnnuelUpdate).not.toHaveBeenCalled();
  });

  it("I1/cas D — un nouvel essai après un échec Documenso repart normalement (réservation à nouveau libre) et aboutit", async () => {
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    // Le dossier est revenu à son état d'origine après le revert du cas B :
    // statutSignature toujours A_VERIFIER, versionConfirmeeNumero à nouveau null.
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    documentFindFirst.mockResolvedValue({ numeroVersion: 5, nomFichier: "dossier-v5.pdf", cheminRelatif: "et1/dossier-v5.pdf" });
    lireDocument.mockResolvedValue(Buffer.from("pdf"));
    dossierAnnuelUpdateMany.mockResolvedValue({ count: 1 });
    creerEtEnvoyerDocumentSignature.mockResolvedValue({ documentId: 101, signingUrl: "https://documenso.local/sign/retry" });

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "https://documenso.local/sign/retry",
    });
    expect(dossierAnnuelUpdate).toHaveBeenCalledWith({
      where: { id: "dos1" },
      data: { documensoDocumentId: 101, statutSignature: "ENVOYEE_SIGNATURE", envoyeSignatureLe: expect.any(Date) },
    });
  });

  // --- I2 : rate limiting ---

  it("I2 — bloque une confirmation quand la limite de tentatives est dépassée, sans contacter Documenso ni la base du dossier", async () => {
    limiteDebitDepassee.mockReturnValue(true);

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "/dossier/x?erreur=TROP_DE_TENTATIVES",
    });

    expect(resoudreAccesDossier).not.toHaveBeenCalled();
    expect(creerEtEnvoyerDocumentSignature).not.toHaveBeenCalled();
  });

  it("I2 — une confirmation légitime sous le seuil n'est jamais bloquée", async () => {
    limiteDebitDepassee.mockReturnValue(false);
    resoudreAccesDossier.mockResolvedValue({ valide: true, dossierAnnuelId: "dos1" });
    dossierAnnuelFindUnique.mockResolvedValue(dossier());
    documentFindFirst.mockResolvedValue({ numeroVersion: 1, nomFichier: "dossier-v1.pdf", cheminRelatif: "et1/dossier-v1.pdf" });
    lireDocument.mockResolvedValue(Buffer.from("pdf"));
    creerEtEnvoyerDocumentSignature.mockResolvedValue({ documentId: 1, signingUrl: "https://documenso.local/sign/ok" });

    await expect(confirmerEtSignerAction(form({ token: "x" }))).rejects.toMatchObject({
      url: "https://documenso.local/sign/ok",
    });
  });
});
