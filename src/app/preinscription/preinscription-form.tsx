"use client";

import { useState, useTransition } from "react";
import { preinscrireAction } from "./actions";
import { Card } from "@/components/ui/card";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PATTERN_TELEPHONE, PATTERN_CODE_POSTAL } from "@/lib/champs-formulaire";

type Section = { id: string; nom: string };
type Creneau = { id: string; sectionId: string; label: string };
type Ligne = { id: number; sectionId: string; classeId: string };

const FIELDSET_CLASSES = "rounded-xl border border-border bg-bg-elevated p-5 shadow-card";
const LEGEND_CLASSES = "px-1 text-sm font-semibold text-ink";

// Laissé vide en attendant que le CA désigne l'adresse à afficher pour
// l'exercice des droits RGPD ; en attendant, le texte reste correct en
// renvoyant vers un contact générique plutôt qu'un placeholder brut.
const EMAIL_CONTACT_RGPD = "";

export function PreinscriptionForm({
  sections,
  creneaux,
}: {
  sections: Section[];
  creneaux: Creneau[];
}) {
  // Une même personne peut vouloir suivre plusieurs cours/sections en une
  // seule préinscription (ex. Jeunes + Études Coraniques pour le même
  // enfant) : chaque ligne porte sa propre section + créneau, reliées côté
  // serveur par `ligneId` (voir actions.ts) plutôt que par position dans le
  // tableau, pour rester fiable même quand un créneau est indisponible et
  // donc absent du FormData (champ désactivé).
  const [lignes, setLignes] = useState<Ligne[]>([{ id: 0, sectionId: sections[0]?.id ?? "", classeId: "" }]);
  const prochainId = lignes.reduce((max, l) => Math.max(max, l.id), 0) + 1;

  function ajouterLigne() {
    setLignes((prev) => [...prev, { id: prochainId, sectionId: sections[0]?.id ?? "", classeId: "" }]);
  }
  function retirerLigne(id: number) {
    setLignes((prev) => prev.filter((l) => l.id !== id));
  }
  function modifierLigne(id: number, patch: Partial<Ligne>) {
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  // Un responsable légal est demandé dès qu'une des sections choisies est
  // "Jeunes", quelle que soit la ligne (même enfant, plusieurs cours).
  const estJeunes = lignes.some(
    (l) => sections.find((s) => s.id === l.sectionId)?.nom === "Jeunes",
  );

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
        <p className="text-sm font-medium text-ink">Cours souhaités</p>
        {lignes.map((ligne, index) => {
          const creneauxLigne = creneaux.filter((c) => c.sectionId === ligne.sectionId);
          return (
            <div key={ligne.id} className="space-y-3 rounded-lg border border-border p-3">
              <input type="hidden" name="ligneId" value={ligne.id} />
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-ink-faint">Cours {index + 1}</p>
                {lignes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => retirerLigne(ligne.id)}
                    className="text-xs font-medium text-rust hover:underline"
                  >
                    Retirer
                  </button>
                )}
              </div>
              <ChampSelect
                id={`sectionId-${ligne.id}`}
                label="Section souhaitée"
                name={`sectionId-${ligne.id}`}
                required
                value={ligne.sectionId}
                onChange={(e) => modifierLigne(ligne.id, { sectionId: e.target.value, classeId: "" })}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </ChampSelect>

              <ChampSelect
                key={ligne.sectionId}
                id={`classeId-${ligne.id}`}
                label="Créneau souhaité"
                name={`classeId-${ligne.id}`}
                required={creneauxLigne.length > 0}
                disabled={creneauxLigne.length === 0}
                defaultValue=""
                onChange={(e) => modifierLigne(ligne.id, { classeId: e.target.value })}
                hint={
                  creneauxLigne.length === 0
                    ? "Aucun créneau n'est encore ouvert pour cette section : l'association vous en proposera un."
                    : undefined
                }
              >
                <option value="" disabled={creneauxLigne.length > 0}>
                  {creneauxLigne.length > 0
                    ? "Choisir un créneau…"
                    : "Aucun créneau disponible pour le moment"}
                </option>
                {creneauxLigne.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </ChampSelect>
            </div>
          );
        })}
        <button
          type="button"
          onClick={ajouterLigne}
          className="text-sm font-medium text-pine hover:underline"
        >
          + Ajouter un autre cours ou section
        </button>
      </Card>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>
          {estJeunes ? "Informations de l'enfant" : "Vos informations"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChampSelect label="Civilité" name="civilite" required defaultValue="">
            <option value="">—</option>
            <option value="M">M.</option>
            <option value="MME">Mme</option>
          </ChampSelect>
          <div />
          <Champ label="Nom" name="nom" required />
          <Champ label="Prénom" name="prenom" required />
          <Champ label="Date de naissance" name="dateNaissance" type="date" required />
          <Champ label="Ville de naissance" name="villeNaissance" required />
          {!estJeunes && (
            <>
              <Champ
                label="Téléphone mobile"
                name="telephoneMobile"
                required
                inputMode="tel"
                pattern={PATTERN_TELEPHONE}
                title="Numéro français, ex. 06 12 34 56 78"
                placeholder="06 12 34 56 78"
              />
              <Champ label="Email" name="email" type="email" required />
              <Champ label="Adresse" name="adresse" className="sm:col-span-2" required />
              <Champ
                label="Code postal"
                name="codePostal"
                required
                inputMode="numeric"
                pattern={PATTERN_CODE_POSTAL}
                maxLength={5}
                title="5 chiffres"
                placeholder="69000"
              />
              <Champ label="Profession" name="profession" />
              <Champ label="Niveau d'études" name="niveauEtudes" required />
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

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Protection des données</legend>
        <p className="text-sm text-ink-muted">
          Les données collectées dans ce formulaire sont utilisées par L&apos;Orée
          du Savoir pour la gestion des inscriptions, des cours et des
          activités proposées.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Ces données sont conservées pendant toute la durée de l&apos;inscription
          de l&apos;étudiant, puis pendant une durée de 3 à 5 ans après la fin de
          son parcours, à des fins de gestion administrative (justificatifs de
          paiement, attestations de scolarité).
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Conformément au Règlement Général sur la Protection des Données
          (RGPD), vous disposez d&apos;un droit d&apos;accès, de rectification et de
          suppression des données concernant votre enfant. Pour exercer ce
          droit, vous pouvez contacter{" "}
          {EMAIL_CONTACT_RGPD || "l'association"}.
        </p>
        <label className="mt-4 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="rgpd"
            required
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          J&apos;ai pris connaissance de cette information.
        </label>
      </fieldset>

      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Envoi…" : "Envoyer ma préinscription"}
      </Button>
    </form>
  );
}
