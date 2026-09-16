"use client";

import { ChampSelect } from "@/components/ui/champ";

export function ChampsTeleversementDocument({
  typesDocument,
}: {
  typesDocument: { value: string; label: string }[];
}) {
  return (
    <ChampSelect label="Type" name="type" required defaultValue="">
      <option value="" disabled>
        Choisir…
      </option>
      {typesDocument.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </ChampSelect>
  );
}
