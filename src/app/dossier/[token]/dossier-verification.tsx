"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { confirmerEtSignerAction } from "./actions";

type Etudiant = {
  nom: string;
  prenom: string;
  niveauDeclare: string | null;
  telephoneMobile: string | null;
  telephoneFixe: string | null;
  email: string | null;
  adresse: string | null;
  complementAdresse: string | null;
  codePostal: string | null;
  ville: string | null;
  contactUrgenceNom: string | null;
  contactUrgencePrenom: string | null;
  contactUrgenceTelephone: string | null;
};

const MESSAGES_ERREUR: Record<string, string> = {
  DEJA_SIGNE: "Ce dossier est déjà signé.",
  SIGNATURE_INDISPONIBLE: "Le lien de signature n'a pas pu être récupéré. Merci de réessayer dans un instant.",
  DOSSIER_INDISPONIBLE: "Le dossier n'est pas encore prêt. Merci de réessayer dans un instant.",
  SIGNATAIRE_INCOMPLET:
    "L'adresse email du signataire est manquante. Merci de contacter l'association pour la compléter.",
  TROP_DE_TENTATIVES: "Trop de tentatives depuis cette connexion. Merci de réessayer dans quelques minutes.",
};

export function DossierVerification({
  token,
  erreurUrl,
  etudiant,
  statutSignature,
  numeroVersionActuelle,
  versionConfirmeeNumero,
  demandesCorrectionOuvertes,
}: {
  token: string;
  erreurUrl?: string;
  etudiant: Etudiant;
  statutSignature: string;
  numeroVersionActuelle: number | null;
  versionConfirmeeNumero: number | null;
  demandesCorrectionOuvertes: number;
}) {
  const versionAJour = numeroVersionActuelle !== null && versionConfirmeeNumero === numeroVersionActuelle;

  return (
    <>
      <div className="text-center">
        <h1 className="font-display text-lg font-semibold text-pine-strong">
          Dossier d&apos;inscription — {etudiant.prenom} {etudiant.nom}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {statutSignature === "SIGNEE"
            ? "Votre dossier est signé."
            : statutSignature === "ENVOYEE_SIGNATURE"
              ? "Votre dossier est en attente de signature."
              : "Votre dossier d'inscription est prêt."}
        </p>
      </div>

      {erreurUrl && MESSAGES_ERREUR[erreurUrl] && <Alert variant="danger">{MESSAGES_ERREUR[erreurUrl]}</Alert>}
      {demandesCorrectionOuvertes > 0 && (
        <Alert variant="info">
          {demandesCorrectionOuvertes === 1
            ? "Une demande de correction est en cours de traitement par l'association."
            : `${demandesCorrectionOuvertes} demandes de correction sont en cours de traitement par l'association.`}
        </Alert>
      )}

      <Card className="space-y-1 text-sm text-ink">
        <p>
          <span className="text-ink-muted">Niveau déclaré : </span>
          {etudiant.niveauDeclare || "—"}
        </p>
        <p>
          <span className="text-ink-muted">Téléphone : </span>
          {etudiant.telephoneMobile || etudiant.telephoneFixe || "—"}
        </p>
        <p>
          <span className="text-ink-muted">Email : </span>
          {etudiant.email || "—"}
        </p>
        <p>
          <span className="text-ink-muted">Adresse : </span>
          {[etudiant.adresse, etudiant.complementAdresse, etudiant.codePostal, etudiant.ville]
            .filter(Boolean)
            .join(", ") || "—"}
        </p>
      </Card>

      {statutSignature === "SIGNEE" ? (
        <Alert variant="success">
          Votre dossier a bien été signé. L&apos;association reprendra contact avec vous pour la suite
          (paiement sur place, validation finale).
        </Alert>
      ) : (
        <div className="space-y-3">
          <form action={confirmerEtSignerAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="primary" className="w-full">
              {statutSignature === "ENVOYEE_SIGNATURE"
                ? "Continuer vers la signature"
                : "Consulter et signer mon dossier"}
            </Button>
          </form>
          {!versionAJour && numeroVersionActuelle && (
            <p className="text-center text-xs text-ink-faint">
              La version {numeroVersionActuelle} n&apos;a pas encore été confirmée — signer transmettra
              cette version.
            </p>
          )}
        </div>
      )}
    </>
  );
}
