"use client";

import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/ui/modal-shell";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import type { FicheComparaisonDoublon } from "@/lib/doublons-etudiant";

const CIVILITE_LABELS: Record<string, string> = { M: "M.", MME: "Mme" };
const STATUT_LABELS: Record<string, string> = { PREINSCRIT: "Préinscrit", VALIDE: "Validé" };

function formaterDate(date: Date | string | null): string {
  return date ? new Date(date).toLocaleDateString("fr-FR") : "—";
}

function identite(f: FicheComparaisonDoublon): string {
  return `${f.civilite ? `${CIVILITE_LABELS[f.civilite]} ` : ""}${f.prenom} ${f.nom}`;
}

function adresseComplete(f: FicheComparaisonDoublon): string {
  return [f.adresse, f.codePostal, f.ville].filter(Boolean).join(" ") || "—";
}

function LigneComparaison({
  label,
  aSupprimer,
  aConserver,
}: {
  label: string;
  aSupprimer: string;
  aConserver: string;
}) {
  const difference = aSupprimer !== aConserver;
  return (
    <tr className={difference ? "bg-ochre-bg" : undefined}>
      <th scope="row" className="py-1.5 pr-3 text-left text-xs font-medium uppercase text-ink-faint">
        {label}
      </th>
      <td className="py-1.5 pr-3 text-sm text-ink">{aSupprimer}</td>
      <td className="py-1.5 text-sm text-ink">{aConserver}</td>
    </tr>
  );
}

// Popup de résolution rapide d'un doublon détecté (voir
// Etudiant.doublonPotentielId, lib/doublons-etudiant.ts) : compare les deux
// fiches côte à côte plutôt que de renvoyer le staff comparer manuellement
// dans un nouvel onglet, pour réduire le risque de fusionner/supprimer la
// mauvaise fiche. `doublon` est toujours la fiche qui sera supprimée en cas
// de fusion, `existant` celle qui sera conservée — ce sens est fixe (voir
// fusionnerDoublonAction).
export function PopupDoublon({
  doublon,
  existant,
  fusionBloquee,
  fusionnerAction,
  confirmerHomonymeAction,
  redirectTo,
  triggerLabel = "Comparer et résoudre",
}: {
  doublon: FicheComparaisonDoublon;
  existant: FicheComparaisonDoublon;
  fusionBloquee: boolean;
  fusionnerAction: (formData: FormData) => void | Promise<void>;
  confirmerHomonymeAction: (formData: FormData) => void | Promise<void>;
  redirectTo?: string;
  triggerLabel?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const lignes = [
    { label: "Identité", aSupprimer: identite(doublon), aConserver: identite(existant) },
    {
      label: "Date de naissance",
      aSupprimer: formaterDate(doublon.dateNaissance),
      aConserver: formaterDate(existant.dateNaissance),
    },
    {
      label: "Ville de naissance",
      aSupprimer: doublon.villeNaissance ?? "—",
      aConserver: existant.villeNaissance ?? "—",
    },
    {
      label: "Téléphone",
      aSupprimer: doublon.telephoneMobile ?? doublon.telephoneFixe ?? "—",
      aConserver: existant.telephoneMobile ?? existant.telephoneFixe ?? "—",
    },
    { label: "Email", aSupprimer: doublon.email ?? "—", aConserver: existant.email ?? "—" },
    { label: "Adresse", aSupprimer: adresseComplete(doublon), aConserver: adresseComplete(existant) },
    {
      label: "Statut",
      aSupprimer: STATUT_LABELS[doublon.statutInscription],
      aConserver: STATUT_LABELS[existant.statutInscription],
    },
    { label: "Créée le", aSupprimer: formaterDate(doublon.creeLe), aConserver: formaterDate(existant.creeLe) },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        {triggerLabel}
      </button>
      <ModalShell
        dialogRef={dialogRef}
        maxWidth="max-w-2xl"
        title={
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-pine-strong">
            <AlertTriangle size={18} aria-hidden className="text-ochre" />
            Doublon potentiel
          </h2>
        }
      >
        <p className="mt-2 text-sm text-ink-muted">
          Comparez les deux fiches avant de choisir. Les lignes surlignées
          diffèrent entre les deux.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-xs font-medium uppercase text-ink-faint">
                <th className="py-1.5 pr-3" />
                <th className="py-1.5 pr-3">
                  <Badge variant="danger">Sera supprimée</Badge>
                </th>
                <th className="py-1.5">
                  <Badge variant="success">Conservée</Badge>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((l) => (
                <LigneComparaison key={l.label} {...l} />
              ))}
            </tbody>
          </table>
        </div>

        {fusionBloquee ? (
          <div className="mt-4">
            <Alert variant="warning">
              Fusion automatique impossible : la fiche à supprimer porte déjà
              un dossier annuel ou des présences enregistrées. Transférez ces
              données à la main avant de la supprimer.
            </Alert>
          </div>
        ) : (
          <form action={fusionnerAction} className="mt-4">
            <input type="hidden" name="etudiantId" value={doublon.id} />
            {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
            <SubmitButton variant="primary" size="sm" pendingLabel="Fusion…">
              Fusionner : garder la fiche conservée
            </SubmitButton>
          </form>
        )}

        <form action={confirmerHomonymeAction} className="mt-2">
          <input type="hidden" name="etudiantId" value={doublon.id} />
          {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
          <SubmitButton variant="secondary" size="sm">
            Ce n&apos;est pas un doublon (homonymie)
          </SubmitButton>
        </form>
      </ModalShell>
    </>
  );
}
