"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  rechercherDoublonsAction,
  creerEtudiantAction,
  type Doublon,
} from "./actions";
import { Champ, ChampSelect, ChampTextarea } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const FIELDSET_CLASSES = "rounded-xl border border-border bg-bg-elevated p-5 shadow-card";
const LEGEND_CLASSES = "px-1 text-sm font-semibold text-ink";

function BlocResponsable({ index }: { index: 1 | 2 }) {
  return (
    <fieldset className="rounded-xl border border-border p-4">
      <legend className={LEGEND_CLASSES}>
        Responsable légal {index} {index === 2 && "(optionnel)"}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampSelect label="Civilité" name={`responsable${index}Civilite`} defaultValue="">
          <option value="">—</option>
          <option value="M">M.</option>
          <option value="MME">Mme</option>
        </ChampSelect>
        <Champ label="Lien (père, mère, tuteur…)" name={`responsable${index}Lien`} />
        <Champ label="Nom" name={`responsable${index}Nom`} />
        <Champ label="Prénom" name={`responsable${index}Prenom`} />
        <Champ label="Téléphone" name={`responsable${index}Telephone`} />
        <Champ label="Email" name={`responsable${index}Email`} type="email" />
        <Champ
          label="Adresse"
          name={`responsable${index}Adresse`}
          className="sm:col-span-2"
        />
      </div>
    </fieldset>
  );
}

export function EtudiantForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [doublons, setDoublons] = useState<Doublon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function soumettre(formulaire: HTMLFormElement, forcer: boolean) {
    setError(null);
    const formData = new FormData(formulaire);

    startTransition(async () => {
      try {
        if (!forcer) {
          const nom = String(formData.get("nom") ?? "");
          const prenom = String(formData.get("prenom") ?? "");
          const trouves = await rechercherDoublonsAction(nom, prenom);
          if (trouves.length > 0) {
            setDoublons(trouves);
            return;
          }
        }
        setDoublons(null);
        const { id } = await creerEtudiantAction(formData);
        router.push(`/etudiants/${id}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Une erreur est survenue.",
        );
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        soumettre(e.currentTarget, false);
      }}
      className="space-y-6"
    >
      {error && <Alert variant="danger">{error}</Alert>}

      {doublons && doublons.length > 0 && (
        <div className="rounded-xl border border-ochre-border bg-ochre-bg p-5">
          <h3 className="text-sm font-semibold text-ochre">
            Étudiant(s) similaire(s) déjà enregistré(s)
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-ochre">
            {doublons.map((d) => (
              <li key={d.id}>
                <Link href={`/etudiants/${d.id}`} className="underline" target="_blank">
                  {d.prenom} {d.nom}
                </Link>
                {d.dateNaissance &&
                  ` — né(e) le ${new Date(d.dateNaissance).toLocaleDateString("fr-FR")}`}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ochre">
            Vérifiez qu&apos;il ne s&apos;agit pas de la même personne avant de continuer.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (formRef.current) soumettre(formRef.current, true);
            }}
            className="mt-3"
          >
            Créer quand même une nouvelle fiche
          </Button>
        </div>
      )}

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Identité</legend>
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
        </div>
      </fieldset>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Coordonnées</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Téléphone mobile" name="telephoneMobile" />
          <Champ label="Téléphone fixe" name="telephoneFixe" />
          <Champ label="Email" name="email" type="email" />
          <Champ label="Contact d'urgence" name="contactUrgence" />
          <Champ label="Adresse" name="adresse" className="sm:col-span-2" />
          <Champ label="Complément d'adresse" name="complementAdresse" />
          <Champ label="Code postal" name="codePostal" />
        </div>
      </fieldset>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Situation</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Profession" name="profession" />
          <Champ label="Niveau d'études" name="niveauEtudes" />
          <Champ label="Dernier diplôme obtenu" name="dernierDiplome" />
          <div />
          <ChampTextarea label="Remarque" name="remarque" rows={3} className="sm:col-span-2" />
        </div>
      </fieldset>

      <BlocResponsable index={1} />
      <BlocResponsable index={2} />

      <div className="flex justify-end gap-3">
        <Link href="/etudiants" className={buttonVariants({ variant: "secondary" })}>
          Annuler
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Enregistrement…" : "Créer la fiche"}
        </Button>
      </div>
    </form>
  );
}
