"use client";

import { useState, useTransition } from "react";
import { preinscrireAction } from "./actions";
import { Card } from "@/components/ui/card";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Section = { id: string; nom: string };
type Creneau = { id: string; sectionId: string; label: string };

const FIELDSET_CLASSES = "rounded-xl border border-border bg-bg-elevated p-5 shadow-card";
const LEGEND_CLASSES = "px-1 text-sm font-semibold text-ink";

export function PreinscriptionForm({
  sections,
  creneaux,
}: {
  sections: Section[];
  creneaux: Creneau[];
}) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const sectionChoisie = sections.find((s) => s.id === sectionId);
  const estJeunes = sectionChoisie?.nom === "Jeunes";
  const creneauxDisponibles = creneaux.filter((c) => c.sectionId === sectionId);

  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [pending, startTransition] = useTransition();

  if (succes) {
    return (
      <div className="rounded-xl border border-sage-border bg-sage-bg p-6 text-center">
        <h2 className="font-display text-base font-semibold text-pine-strong">
          Préinscription enregistrée
        </h2>
        <p className="mt-2 text-sm text-sage">
          Merci ! Un membre de l&apos;association vous contactera pour finaliser
          l&apos;inscription (signature, documents, paiement).
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const resultat = await preinscrireAction(formData);
          if ("erreur" in resultat) {
            setError(resultat.erreur);
          } else {
            setSucces(true);
          }
        });
      }}
      className="space-y-6"
    >
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="space-y-4">
        <ChampSelect
          label="Section souhaitée"
          name="sectionId"
          required
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </ChampSelect>

        <ChampSelect
          key={sectionId}
          label="Créneau souhaité"
          name="classeId"
          required={creneauxDisponibles.length > 0}
          disabled={creneauxDisponibles.length === 0}
          defaultValue=""
          hint={
            creneauxDisponibles.length === 0
              ? "Aucun créneau n'est encore ouvert pour cette section : l'association vous en proposera un."
              : undefined
          }
        >
          <option value="" disabled={creneauxDisponibles.length > 0}>
            {creneauxDisponibles.length > 0
              ? "Choisir un créneau…"
              : "Aucun créneau disponible pour le moment"}
          </option>
          {creneauxDisponibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </ChampSelect>
      </Card>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>
          {estJeunes ? "Informations de l'enfant" : "Vos informations"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampSelect label="Civilité" name="civilite" defaultValue="">
            <option value="">—</option>
            <option value="M">M.</option>
            <option value="MME">Mme</option>
          </ChampSelect>
          <div />
          <Champ label="Nom" name="nom" required />
          <Champ label="Prénom" name="prenom" required />
          <Champ label="Date de naissance" name="dateNaissance" type="date" />
          <Champ label="Ville de naissance" name="villeNaissance" />
          {!estJeunes && (
            <>
              <Champ label="Téléphone mobile" name="telephoneMobile" />
              <Champ label="Email" name="email" type="email" />
              <Champ label="Adresse" name="adresse" className="sm:col-span-2" />
              <Champ label="Profession" name="profession" />
              <Champ label="Niveau d'études" name="niveauEtudes" />
              <Champ label="Dernier diplôme obtenu" name="dernierDiplome" />
            </>
          )}
        </div>
      </fieldset>

      {estJeunes && (
        <fieldset className={FIELDSET_CLASSES}>
          <legend className={LEGEND_CLASSES}>Responsable légal</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChampSelect label="Civilité" name="responsableCivilite" defaultValue="">
              <option value="">—</option>
              <option value="M">M.</option>
              <option value="MME">Mme</option>
            </ChampSelect>
            <Champ label="Lien (père, mère, tuteur…)" name="responsableLien" />
            <Champ label="Nom" name="responsableNom" required />
            <Champ label="Prénom" name="responsablePrenom" required />
            <Champ label="Téléphone" name="responsableTelephone" />
            <Champ label="Email" name="responsableEmail" type="email" />
            <Champ label="Adresse" name="responsableAdresse" className="sm:col-span-2" />
          </div>
        </fieldset>
      )}

      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Envoi…" : "Envoyer ma préinscription"}
      </Button>
    </form>
  );
}
