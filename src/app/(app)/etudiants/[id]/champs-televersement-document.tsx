"use client";

import { useState } from "react";
import { ChampSelect, Champ } from "@/components/ui/champ";

// Type de pièce + date d'expiration ne concernent que le type PIECE_IDENTITE
// (voir Document.typePieceIdentite/dateExpiration, lib/documents.ts) : ne
// les révéler que dans ce cas, plutôt que de toujours les afficher pour tous
// les types de document — même principe que ChampsMoyenPaiement
// (paiements/[id]/champs-moyen-paiement.tsx) pour chèque/prélèvement.
export function ChampsTeleversementDocument({
  typesDocument,
  typesPieceIdentite,
}: {
  typesDocument: { value: string; label: string }[];
  typesPieceIdentite: { value: string; label: string }[];
}) {
  const [type, setType] = useState("");

  return (
    <>
      <ChampSelect
        label="Type"
        name="type"
        required
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="" disabled>
          Choisir…
        </option>
        {typesDocument.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </ChampSelect>

      {type === "PIECE_IDENTITE" && (
        <>
          <ChampSelect label="Type de pièce" name="typePieceIdentite" required defaultValue="">
            <option value="" disabled>
              Choisir…
            </option>
            {typesPieceIdentite.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </ChampSelect>
          <Champ label="Date d'expiration" name="dateExpiration" type="date" required />
        </>
      )}
    </>
  );
}
