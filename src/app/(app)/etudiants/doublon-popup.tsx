"use client";

import { useRef } from "react";
import Link from "next/link";
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
          Ces deux fiches se ressemblent (même nom/prénom/date de naissance,
          ou mêmes coordonnées). Comparez-les avant de choisir — les lignes
          surlignées diffèrent entre les deux.
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
          <div className="mt-4 space-y-2">
            <Alert variant="warning">
              <p className="font-medium">La fusion automatique est désactivée pour cette fiche.</p>
              <p className="mt-1">
                La fiche « Sera supprimée » a déjà un dossier annuel (paiements)
                ou des présences enregistrées à son nom. Les fusionner
                automatiquement risquerait de mélanger ou perdre ces données —
                l&apos;application le refuse volontairement.
              </p>
              <p className="mt-1">
                Il n&apos;y a pas encore d&apos;outil dans l&apos;application
                pour déplacer un dossier annuel ou des présences d&apos;une
                fiche à l&apos;autre. Pour l&apos;instant :
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>
                  si ce sont bien deux personnes différentes (homonymes), utilisez
                  le bouton ci-dessous — les deux fiches resteront distinctes ;
                </li>
                <li>
                  si c&apos;est vraiment un doublon, ouvrez la fiche à
                  supprimer pour voir en détail ce qu&apos;elle contient, puis
                  contactez la personne qui gère la base de données pour faire
                  consolider les deux fiches à la main — ne supprimez pas la
                  fiche vous-même, vous perdriez ses paiements/présences.
                </li>
              </ul>
            </Alert>
            <Link
              href={`/etudiants/${doublon.id}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Voir le détail de la fiche à supprimer
            </Link>
          </div>
        ) : (
          <form action={fusionnerAction} className="mt-4">
            <input type="hidden" name="etudiantId" value={doublon.id} />
            {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
            <SubmitButton variant="primary" size="sm" pendingLabel="Fusion…">
              Fusionner : supprimer cette fiche et garder l&apos;autre
            </SubmitButton>
            <p className="mt-1 text-xs text-ink-faint">
              Supprime la fiche « Sera supprimée » ; ses inscriptions,
              responsables et documents sont repris automatiquement sur la
              fiche « Conservée ».
            </p>
          </form>
        )}

        <div className="mt-3 border-t border-border pt-3">
          <form action={confirmerHomonymeAction}>
            <input type="hidden" name="etudiantId" value={doublon.id} />
            {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
            <SubmitButton variant="secondary" size="sm">
              Ce n&apos;est pas un doublon (homonymie)
            </SubmitButton>
          </form>
          <p className="mt-1 text-xs text-ink-faint">
            Aucune suppression ni fusion : les deux fiches restent séparées et
            ce message n&apos;apparaîtra plus pour cette paire.
          </p>
        </div>
      </ModalShell>
    </>
  );
}
