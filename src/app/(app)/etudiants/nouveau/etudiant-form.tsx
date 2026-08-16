"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  rechercherDoublonsAction,
  creerEtudiantAction,
  type Doublon,
} from "./actions";

function Champ({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
    </div>
  );
}

function BlocResponsable({ index }: { index: 1 | 2 }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-800">
        Responsable légal {index} {index === 2 && "(optionnel)"}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Civilité
          </label>
          <select
            name={`responsable${index}Civilite`}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">—</option>
            <option value="M">M.</option>
            <option value="MME">Mme</option>
          </select>
        </div>
        <Champ label="Lien (père, mère, tuteur…)" name={`responsable${index}Lien`} />
        <Champ label="Nom" name={`responsable${index}Nom`} />
        <Champ label="Prénom" name={`responsable${index}Prenom`} />
        <Champ label="Téléphone" name={`responsable${index}Telephone`} />
        <Champ label="Email" name={`responsable${index}Email`} type="email" />
        <div className="sm:col-span-2">
          <Champ label="Adresse" name={`responsable${index}Adresse`} />
        </div>
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
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {doublons && doublons.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-semibold text-amber-900">
            Étudiant(s) similaire(s) déjà enregistré(s)
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
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
          <p className="mt-3 text-sm text-amber-800">
            Vérifiez qu&apos;il ne s&apos;agit pas de la même personne avant de continuer.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (formRef.current) soumettre(formRef.current, true);
            }}
            className="mt-3 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Créer quand même une nouvelle fiche
          </button>
        </div>
      )}

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          Identité
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Civilité
            </label>
            <select
              name="civilite"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">—</option>
              <option value="M">M.</option>
              <option value="MME">Mme</option>
            </select>
          </div>
          <div />
          <Champ label="Nom" name="nom" required />
          <Champ label="Prénom" name="prenom" required />
          <Champ label="Date de naissance" name="dateNaissance" type="date" />
          <Champ label="Ville de naissance" name="villeNaissance" />
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          Coordonnées
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Téléphone mobile" name="telephoneMobile" />
          <Champ label="Téléphone fixe" name="telephoneFixe" />
          <Champ label="Email" name="email" type="email" />
          <div />
          <div className="sm:col-span-2">
            <Champ label="Adresse" name="adresse" />
          </div>
          <div className="sm:col-span-2">
            <Champ label="Complément d'adresse" name="complementAdresse" />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          Situation
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Profession" name="profession" />
          <Champ label="Niveau d'études" name="niveauEtudes" />
          <Champ label="Dernier diplôme obtenu" name="dernierDiplome" />
          <div />
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Remarque
            </label>
            <textarea
              name="remarque"
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
        </div>
      </fieldset>

      <BlocResponsable index={1} />
      <BlocResponsable index={2} />

      <div className="flex justify-end gap-3">
        <Link
          href="/etudiants"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Annuler
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Créer la fiche"}
        </button>
      </div>
    </form>
  );
}
