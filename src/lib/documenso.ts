import "server-only";

// Client HTTP minimal pour l'API REST v1 de Documenso self-hébergé (voir
// docker-compose.yml, service `documenso`) — Documenso reste le seul moteur
// de signature (règle non négociable, voir CLAUDE.md/analyse de
// conversation) : l'application ne fait jamais confiance à un statut local
// sans confirmation par webhook (voir api/webhooks/documenso/route.ts),
// et ne duplique jamais la logique de signature elle-même.
//
// Le token API (DOCUMENSO_API_TOKEN) est généré manuellement une fois depuis
// Documenso > Paramètres de l'équipe > Tokens API — jamais exposé au
// navigateur (ce module n'est importé que côté serveur, voir "server-only").

function baseUrl(): string {
  const url = process.env.DOCUMENSO_API_URL;
  if (!url) throw new Error("DOCUMENSO_API_URL n'est pas défini.");
  return url.replace(/\/+$/, "");
}

function apiToken(): string {
  const token = process.env.DOCUMENSO_API_TOKEN;
  if (!token) throw new Error("DOCUMENSO_API_TOKEN n'est pas défini.");
  return token;
}

async function appelDocumenso<T>(chemin: string, init?: RequestInit): Promise<T> {
  const reponse = await fetch(`${baseUrl()}${chemin}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      ...(init?.body && !(init.body instanceof Buffer) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => "");
    throw new Error(`Documenso ${init?.method ?? "GET"} ${chemin} -> ${reponse.status} : ${corps}`);
  }

  if (reponse.status === 204) return undefined as T;
  return (await reponse.json()) as T;
}

export type SignataireDocumenso = {
  recipientId: number;
  name: string;
  email: string;
  token: string;
  signingUrl: string;
};

type CreationDocumentReponse = {
  uploadUrl: string;
  documentId: number;
  recipients: SignataireDocumenso[];
};

// Crée l'enveloppe Documenso (métadonnées + destinataire), obtient une URL
// d'upload, y dépose le PDF confirmé par la famille, place un champ
// signature en page 1, puis envoie le document — `sendEmail: false` : c'est
// l'application (jamais Documenso lui-même, faute de SMTP réel configuré
// pour l'instant) qui communique le lien vers la page de vérification, puis
// redirige directement vers `signingUrl` au moment où l'utilisateur clique
// "Signer" depuis /dossier/[token] — voir bilan de session pour ce choix.
export async function creerEtEnvoyerDocumentSignature({
  titre,
  pdf,
  signataireNom,
  signataireEmail,
  externalId,
}: {
  titre: string;
  pdf: Buffer;
  signataireNom: string;
  signataireEmail: string;
  externalId: string;
}): Promise<{ documentId: number; signingUrl: string }> {
  const creation = await appelDocumenso<CreationDocumentReponse>("/documents", {
    method: "POST",
    body: JSON.stringify({
      title: titre,
      externalId,
      recipients: [{ name: signataireNom, email: signataireEmail, role: "SIGNER" }],
      meta: {
        subject: "Dossier d'inscription à signer",
        message: "Merci de vérifier puis signer le dossier d'inscription joint.",
        redirectUrl: "",
      },
    }),
  });

  const uploadReponse = await fetch(creation.uploadUrl, {
    method: "PUT",
    body: new Uint8Array(pdf),
  });
  if (!uploadReponse.ok) {
    throw new Error(`Documenso upload PDF -> ${uploadReponse.status}`);
  }

  const signataire = creation.recipients[0];

  await appelDocumenso(`/documents/${creation.documentId}/fields`, {
    method: "POST",
    body: JSON.stringify({
      recipientId: signataire.recipientId,
      type: "SIGNATURE",
      pageNumber: 1,
      pageX: 10,
      pageY: 85,
      pageWidth: 30,
      pageHeight: 8,
      fieldMeta: { type: "signature" },
    }),
  });

  await appelDocumenso(`/documents/${creation.documentId}/send`, {
    method: "POST",
    body: JSON.stringify({ sendEmail: false }),
  });

  return { documentId: creation.documentId, signingUrl: signataire.signingUrl };
}

type DocumentDocumenso = {
  id: number;
  status: string;
  completedAt: string | null;
  recipients: SignataireDocumenso[];
};

export async function obtenirDocumentDocumenso(documentId: number): Promise<DocumentDocumenso> {
  return appelDocumenso<DocumentDocumenso>(`/documents/${documentId}`);
}

// Le lien de signature (par destinataire, stable — basé sur son token
// interne, pas un lien à usage unique) n'est jamais persisté côté
// application : redemandé à Documenso à chaque fois qu'il sert (juste après
// l'envoi, ou si l'utilisateur revient sur /dossier/[token] avant d'avoir
// signé) plutôt que dupliqué en base — Documenso reste la seule source de
// vérité sur l'état de signature.
export async function obtenirLienSignature(documentId: number): Promise<string | null> {
  const document = await obtenirDocumentDocumenso(documentId);
  return document.recipients[0]?.signingUrl ?? null;
}

// Annule l'enveloppe Documenso d'une version périmée : appelée quand une
// correction est apportée après envoi en signature mais avant signature
// effective (voir /dossier/[token]/actions.ts#modifierChampsAction) — sans
// ça, l'ancien lien de signature resterait utilisable pour signer des
// données qui ne correspondent plus à ce qui est stocké en base. Best-effort
// (ne bloque jamais la correction elle-même : un document déjà signé ou
// déjà supprimé côté Documenso renvoie une erreur ignorée ici).
export async function annulerDocumentSignature(documentId: number): Promise<void> {
  await appelDocumenso(`/documents/${documentId}`, { method: "DELETE" }).catch(() => {});
}

// Le PDF signé n'est récupérable via l'API que lorsque le transport de
// stockage est S3 (vérifié dans le code source de Documenso — le transport
// "database" par défaut ne l'expose pas), d'où le service MinIO dédié dans
// docker-compose.yml.
export async function telechargerDocumentSigne(documentId: number): Promise<Buffer> {
  const { downloadUrl } = await appelDocumenso<{ downloadUrl: string }>(
    `/documents/${documentId}/download`,
  );
  const reponse = await fetch(downloadUrl);
  if (!reponse.ok) throw new Error(`Téléchargement PDF signé -> ${reponse.status}`);
  return Buffer.from(await reponse.arrayBuffer());
}
