"use client";

import { useId, useState } from "react";
import { MoyenPaiement, MOYEN_LABELS } from "@/lib/paiements";

const CHAMP_CLASSES =
  "w-28 rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

// Les champs bancaires n'ont de sens que pour le moyen choisi (chèque vs
// prélèvement) : ne pas les afficher tous en permanence, contrairement à
// l'ancien formulaire qui montrait toujours Banque/N° chèque/Titulaire.
export function ChampsMoyenPaiement({
  etudiantNom,
  etudiantPrenom,
}: {
  etudiantNom: string;
  etudiantPrenom: string;
}) {
  const idMoyen = useId();
  const [moyen, setMoyen] = useState<MoyenPaiement>(MoyenPaiement.ESPECES);
  // Cas par défaut : le titulaire du chèque est l'étudiant lui-même — pas
  // besoin de ressaisir son nom/prénom ni de redemander une pièce
  // d'identité, celle du dossier étudiant suffit (voir CLAUDE.md). Décoché
  // seulement quand un tiers paie (ex. grand-parent).
  const [titulaireEstEtudiant, setTitulaireEstEtudiant] = useState(true);

  return (
    <>
      <div>
        <label htmlFor={idMoyen} className={LABEL_CLASSES}>
          Moyen
        </label>
        <select
          id={idMoyen}
          name="moyen"
          required
          value={moyen}
          onChange={(e) => setMoyen(e.target.value as MoyenPaiement)}
          className="rounded-md border border-border-strong bg-bg-elevated px-2 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft"
        >
          {Object.values(MoyenPaiement).map((m) => (
            <option key={m} value={m}>
              {MOYEN_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      {moyen === "CHEQUE" && (
        <>
          <div>
            <label className={LABEL_CLASSES}>Banque</label>
            <input type="text" name="chequeBanque" className={CHAMP_CLASSES} />
          </div>
          <div>
            <label className={LABEL_CLASSES}>N° chèque</label>
            <input type="text" name="chequeNumero" className={CHAMP_CLASSES} />
          </div>
          <label className="flex items-center gap-1.5 self-end pb-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              name="titulaireEstEtudiant"
              checked={titulaireEstEtudiant}
              onChange={(e) => setTitulaireEstEtudiant(e.target.checked)}
            />
            Le titulaire est l&apos;étudiant ({etudiantPrenom} {etudiantNom})
          </label>
          {!titulaireEstEtudiant && (
            <>
              <div>
                <label className={LABEL_CLASSES}>Nom du titulaire</label>
                <input type="text" name="chequeTitulaireNom" className={CHAMP_CLASSES} />
              </div>
              <div>
                <label className={LABEL_CLASSES}>Prénom du titulaire</label>
                <input type="text" name="chequeTitulairePrenom" className={CHAMP_CLASSES} />
              </div>
              <div>
                <label className={LABEL_CLASSES}>Pièce d&apos;identité du titulaire</label>
                <input
                  type="file"
                  name="chequeTitulairePieceIdentite"
                  accept="image/*,application/pdf"
                  className="text-xs text-ink"
                />
              </div>
            </>
          )}
        </>
      )}

      {moyen === "PRELEVEMENT" && (
        <>
          <div>
            <label className={LABEL_CLASSES}>IBAN</label>
            <input type="text" name="prelevementIban" className={CHAMP_CLASSES} />
          </div>
          <div>
            <label className={LABEL_CLASSES}>BIC</label>
            <input type="text" name="prelevementBic" className={CHAMP_CLASSES} />
          </div>
          <div>
            <label className={LABEL_CLASSES}>Titulaire</label>
            <input type="text" name="prelevementTitulaire" className={CHAMP_CLASSES} />
          </div>
          <div>
            <label className={LABEL_CLASSES}>Réf. mandat</label>
            <input type="text" name="prelevementReferenceMandat" className={CHAMP_CLASSES} />
          </div>
        </>
      )}
    </>
  );
}
