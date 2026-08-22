"use client";

import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import {
  changerActivationAction,
  changerRoleAction,
  changerSpecialitesAction,
  reinitialiserMotDePasseAction,
  revoquerSessionsAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CONTROL_SM_CLASSES } from "@/components/ui/champ";
import { Role, ROLE_LABELS, ROLES_STAFF } from "@/lib/roles";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/comptes";

const LABEL_XS_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

export type UtilisateurLigne = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  actif: boolean;
  dernierLogin: Date | null;
  sessionsActives: number;
};

// Une ligne compacte (nom, rôle, statut) qui ouvre toutes les actions du
// compte (rôle, mot de passe, sessions, activation) dans une <dialog> au
// clic, plutôt que quatre formulaires dépliés en permanence par compte.
// Partagée entre Administration > Comptes et Administration > Enseignants
// (voir `from`, `infoExtra`, `roleOptions`, `rolePlaceholder`).
export function UtilisateurRow({
  utilisateur: u,
  soiMeme = false,
  ouvrirAuChargement,
  from,
  infoExtra,
  roleOptions = ROLES_STAFF,
  rolePlaceholder,
  sectionsDisponibles,
  specialiteIds,
}: {
  utilisateur: UtilisateurLigne;
  soiMeme?: boolean;
  ouvrirAuChargement: boolean;
  from?: string;
  infoExtra?: string;
  roleOptions?: Role[];
  rolePlaceholder?: string;
  // Fournis uniquement depuis Administration > Enseignants : affiche le
  // formulaire d'édition des spécialités.
  sectionsDisponibles?: { id: string; nom: string }[];
  specialiteIds?: string[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Rouvre automatiquement si une action déclenchée depuis cette pastille
  // vient d'échouer (retour avec ?error=...&utilisateurId=..., voir
  // actions.ts) : sans ça, le message d'erreur s'afficherait en haut de page
  // sans que le formulaire fautif soit visible.
  useEffect(() => {
    if (ouvrirAuChargement) dialogRef.current?.showModal();
  }, [ouvrirAuChargement]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-sunken/40 ${
          u.actif ? "" : "opacity-60"
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-medium text-ink">
            <span className="truncate">
              {u.prenom} {u.nom}
            </span>
            {soiMeme && <Badge variant="neutral">vous</Badge>}
          </div>
          <div className="truncate text-sm text-ink-muted">{u.email}</div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="neutral">{ROLE_LABELS[u.role]}</Badge>
          <Badge variant={u.actif ? "success" : "danger"}>{u.actif ? "Actif" : "Désactivé"}</Badge>
          <span className="hidden text-xs text-ink-faint sm:inline">
            {u.dernierLogin
              ? `Connecté le ${new Date(u.dernierLogin).toLocaleDateString("fr-FR")}`
              : "Jamais connecté"}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
        </div>
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-lg rounded-xl border border-border bg-bg-elevated p-0 shadow-modal backdrop:bg-ink/40"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                {u.prenom} {u.nom}
                {soiMeme && <Badge variant="neutral">vous</Badge>}
              </h3>
              <p className="text-xs text-ink-muted">{u.email}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {infoExtra && `${infoExtra} · `}
                {u.dernierLogin
                  ? `Dernière connexion : ${new Date(u.dernierLogin).toLocaleString("fr-FR")}`
                  : "Jamais connecté"}
                {u.sessionsActives > 0 && ` · ${u.sessionsActives} session(s) active(s)`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink-faint hover:text-ink"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <form action={changerRoleAction} className="flex flex-wrap items-end gap-2">
              {from && <input type="hidden" name="from" value={from} />}
              <input type="hidden" name="utilisateurId" value={u.id} />
              <div>
                <label className={LABEL_XS_CLASSES}>Rôle</label>
                <select
                  name="role"
                  defaultValue={rolePlaceholder ? "" : u.role}
                  className={CONTROL_SM_CLASSES}
                >
                  {rolePlaceholder && (
                    <option value="" disabled>
                      {rolePlaceholder}
                    </option>
                  )}
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Changer
              </Button>
            </form>

            {sectionsDisponibles && sectionsDisponibles.length > 0 && (
              <form action={changerSpecialitesAction} className="space-y-2">
                {from && <input type="hidden" name="from" value={from} />}
                <input type="hidden" name="utilisateurId" value={u.id} />
                <span className={LABEL_XS_CLASSES}>
                  Spécialité(s) (vide = proposé sur toutes les sections)
                </span>
                <div className="flex flex-wrap gap-2">
                  {sectionsDisponibles.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-ink-muted"
                    >
                      <input
                        type="checkbox"
                        name="specialites"
                        value={s.id}
                        defaultChecked={specialiteIds?.includes(s.id)}
                      />
                      {s.nom}
                    </label>
                  ))}
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  Enregistrer les spécialités
                </Button>
              </form>
            )}

            <form action={reinitialiserMotDePasseAction} className="flex flex-wrap items-end gap-2">
              {from && <input type="hidden" name="from" value={from} />}
              <input type="hidden" name="utilisateurId" value={u.id} />
              <div>
                <label className={LABEL_XS_CLASSES}>Nouveau mot de passe</label>
                <input
                  type="password"
                  name="motDePasse"
                  required
                  minLength={LONGUEUR_MIN_MOT_DE_PASSE}
                  autoComplete="new-password"
                  className={`w-44 ${CONTROL_SM_CLASSES}`}
                />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Réinitialiser
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {u.sessionsActives > 0 && (
                <form action={revoquerSessionsAction}>
                  {from && <input type="hidden" name="from" value={from} />}
                  <input type="hidden" name="utilisateurId" value={u.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    Révoquer les sessions
                  </Button>
                </form>
              )}
              <form action={changerActivationAction}>
                {from && <input type="hidden" name="from" value={from} />}
                <input type="hidden" name="utilisateurId" value={u.id} />
                <input type="hidden" name="activer" value={u.actif ? "0" : "1"} />
                <button
                  type="submit"
                  disabled={soiMeme && u.actif}
                  title={
                    soiMeme && u.actif
                      ? "Vous ne pouvez pas désactiver votre propre compte"
                      : undefined
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                    u.actif
                      ? "border-rust-border text-rust hover:bg-rust-bg"
                      : "border-sage-border text-sage hover:bg-sage-bg"
                  }`}
                >
                  {u.actif ? "Désactiver" : "Réactiver"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
