"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Champ, ChampTextarea } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { modifierChampsAction, demanderCorrectionAction, confirmerEtSignerAction } from "./actions";

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
  const [vue, setVue] = useState<"accueil" | "modifier" | "corriger">("accueil");
  const [erreur, setErreur] = useState<string | null>(null);
  const [succesModification, setSuccesModification] = useState(false);
  const [succesCorrection, setSuccesCorrection] = useState(false);
  const [pending, startTransition] = useTransition();

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

      <Card>
        <p className="text-sm font-medium text-ink">Dossier PDF{numeroVersionActuelle ? ` — version ${numeroVersionActuelle}` : ""}</p>
        <p className="text-xs text-ink-faint">
          Vous pourrez le consulter avant de le signer électroniquement (2 signatures requises).
        </p>
      </Card>

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
      ) : vue === "accueil" ? (
        <div className="space-y-3">
          {erreur && <Alert variant="danger">{erreur}</Alert>}
          <form
            action={confirmerEtSignerAction}
            onSubmit={() => setErreur(null)}
          >
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {statutSignature === "ENVOYEE_SIGNATURE"
                ? "Continuer vers la signature"
                : "Consulter et signer mon dossier"}
            </Button>
          </form>
          {statutSignature !== "ENVOYEE_SIGNATURE" && (
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="secondary" onClick={() => setVue("modifier")}>
                Modifier mes informations
              </Button>
              <Button type="button" variant="secondary" onClick={() => setVue("corriger")}>
                Demander une correction
              </Button>
            </div>
          )}
          {!versionAJour && numeroVersionActuelle && (
            <p className="text-center text-xs text-ink-faint">
              La version {numeroVersionActuelle} n&apos;a pas encore été confirmée — signer transmettra
              cette version.
            </p>
          )}
        </div>
      ) : vue === "modifier" ? (
        <Card>
          {succesModification ? (
            <Alert variant="success">
              Vos informations ont été mises à jour. Une nouvelle version du dossier a été générée —
              merci de la vérifier avant de signer.
            </Alert>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setErreur(null);
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const resultat = await modifierChampsAction(formData);
                  if ("erreur" in resultat) setErreur(resultat.erreur);
                  else setSuccesModification(true);
                });
              }}
            >
              <input type="hidden" name="token" value={token} />
              {erreur && <Alert variant="danger">{erreur}</Alert>}
              <Champ label="Téléphone mobile" name="telephoneMobile" defaultValue={etudiant.telephoneMobile ?? ""} />
              <Champ label="Téléphone fixe" name="telephoneFixe" defaultValue={etudiant.telephoneFixe ?? ""} />
              <Champ label="Email" name="email" type="email" defaultValue={etudiant.email ?? ""} />
              <Champ label="Adresse" name="adresse" defaultValue={etudiant.adresse ?? ""} />
              <Champ label="Complément d'adresse" name="complementAdresse" defaultValue={etudiant.complementAdresse ?? ""} />
              <Champ label="Code postal" name="codePostal" defaultValue={etudiant.codePostal ?? ""} />
              <Champ label="Ville" name="ville" defaultValue={etudiant.ville ?? ""} />
              <Champ
                label="Contact d'urgence — nom"
                name="contactUrgenceNom"
                defaultValue={etudiant.contactUrgenceNom ?? ""}
              />
              <Champ
                label="Contact d'urgence — prénom"
                name="contactUrgencePrenom"
                defaultValue={etudiant.contactUrgencePrenom ?? ""}
              />
              <Champ
                label="Contact d'urgence — téléphone"
                name="contactUrgenceTelephone"
                defaultValue={etudiant.contactUrgenceTelephone ?? ""}
              />
              <div className="flex gap-3">
                <Button type="submit" disabled={pending}>Enregistrer</Button>
                <Button type="button" variant="ghost" onClick={() => setVue("accueil")}>Annuler</Button>
              </div>
            </form>
          )}
        </Card>
      ) : (
        <Card>
          {succesCorrection ? (
            <Alert variant="success">
              Votre demande a bien été transmise à l&apos;association, qui vous recontactera.
            </Alert>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setErreur(null);
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const resultat = await demanderCorrectionAction(formData);
                  if ("erreur" in resultat) setErreur(resultat.erreur);
                  else setSuccesCorrection(true);
                });
              }}
            >
              <input type="hidden" name="token" value={token} />
              {erreur && <Alert variant="danger">{erreur}</Alert>}
              <ChampTextarea
                label="Quelle information souhaitez-vous faire corriger ?"
                name="message"
                required
                rows={4}
                placeholder="ex. mon nom est mal orthographié, ma date de naissance est incorrecte…"
              />
              <div className="flex gap-3">
                <Button type="submit" disabled={pending}>Envoyer la demande</Button>
                <Button type="button" variant="ghost" onClick={() => setVue("accueil")}>Annuler</Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
