import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updateMany = vi.fn();
const findFirst = vi.fn();
const documentCreate = vi.fn();
const journalAuditCreate = vi.fn();
const transaction = vi.fn((ops: unknown[]) => Promise.all(ops));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dossierAnnuel: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
    document: { create: (...args: unknown[]) => documentCreate(...args) },
    journalAudit: { create: (...args: unknown[]) => journalAuditCreate(...args) },
    $transaction: (...args: unknown[]) => transaction(...(args as [unknown[]])),
  },
}));

const telechargerDocumentSigne = vi.fn();
vi.mock("@/lib/documenso", () => ({
  telechargerDocumentSigne: (...args: unknown[]) => telechargerDocumentSigne(...args),
}));

const enregistrerDocumentEtudiant = vi.fn();
vi.mock("@/lib/documents", () => ({
  enregistrerDocumentEtudiant: (...args: unknown[]) => enregistrerDocumentEtudiant(...args),
}));

const { POST } = await import("./route");

const SECRET = "s".repeat(64);

function requete(body: unknown, secret: string | null = SECRET): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set("x-documenso-secret", secret);
  return new NextRequest("http://localhost/api/webhooks/documenso", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function payloadComplete(overrides: Record<string, unknown> = {}) {
  return {
    event: "DOCUMENT_COMPLETED",
    payload: { id: 42, status: "COMPLETED", completedAt: new Date().toISOString(), externalId: "dos1", ...overrides },
  };
}

describe("POST /api/webhooks/documenso", () => {
  const original = process.env.DOCUMENSO_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.DOCUMENSO_WEBHOOK_SECRET = SECRET;
    updateMany.mockReset();
    findFirst.mockReset();
    documentCreate.mockReset();
    journalAuditCreate.mockReset();
    transaction.mockClear();
    telechargerDocumentSigne.mockReset();
    enregistrerDocumentEtudiant.mockReset();
  });

  afterEach(() => {
    process.env.DOCUMENSO_WEBHOOK_SECRET = original;
  });

  it("rejette une requête sans secret, sans même interroger la base", async () => {
    const reponse = await POST(requete(payloadComplete(), null));
    expect(reponse.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejette un secret incorrect", async () => {
    const reponse = await POST(requete(payloadComplete(), "mauvais-secret-mais-de-la-bonne-longueur-quand-meme"));
    expect(reponse.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("ignore un événement qui n'est pas une complétion, sans toucher le statut", async () => {
    const reponse = await POST(
      requete({ event: "DOCUMENT_OPENED", payload: { id: 42, status: "PENDING", completedAt: null, externalId: "dos1" } }),
    );
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ ignore: true });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("scénario 9 — traite l'événement de complétion une seule fois : télécharge et stocke le PDF signé", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "dos1", etudiantId: "et1", versionConfirmeeNumero: 2 });
    telechargerDocumentSigne.mockResolvedValue(Buffer.from("pdf-signe"));
    enregistrerDocumentEtudiant.mockResolvedValue("et1/dossier-signe-v2.pdf");

    const reponse = await POST(requete(payloadComplete()));

    expect(reponse.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { documensoDocumentId: 42, statutSignature: { not: "SIGNEE" } },
      data: { statutSignature: "SIGNEE", signeLe: expect.any(Date) },
    });
    expect(telechargerDocumentSigne).toHaveBeenCalledTimes(1);
    expect(telechargerDocumentSigne).toHaveBeenCalledWith(42);
    expect(documentCreate).toHaveBeenCalledTimes(1);
    expect(documentCreate.mock.calls[0][0]).toMatchObject({
      data: expect.objectContaining({ type: "DOSSIER_SIGNE", dossierAnnuelId: "dos1", numeroVersion: 2 }),
    });
    expect(journalAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("scénario 9 — un même événement reçu une seconde fois (retry Documenso) ne retélécharge ni ne recrée rien", async () => {
    // updateMany ne fait avancer le statut que s'il n'était pas déjà SIGNEE :
    // count = 0 simule exactement le rejeu d'un webhook déjà traité.
    updateMany.mockResolvedValue({ count: 0 });

    const reponse = await POST(requete(payloadComplete()));

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ dejaTraite: true });
    expect(findFirst).not.toHaveBeenCalled();
    expect(telechargerDocumentSigne).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it("pose le statut SIGNEE même si le téléchargement du PDF signé échoue ponctuellement", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: "dos1", etudiantId: "et1", versionConfirmeeNumero: 1 });
    telechargerDocumentSigne.mockRejectedValue(new Error("Documenso indisponible"));

    const reponse = await POST(requete(payloadComplete()));

    expect(reponse.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(documentCreate).not.toHaveBeenCalled();
  });
});
