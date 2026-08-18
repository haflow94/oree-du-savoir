"use client";

import { useState, useTransition } from "react";
import { preinscrireAction } from "./actions";

type Section = { id: string; nom: string };

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

export function PreinscriptionForm({ sections }: { sections: Section[] }) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const sectionChoisie = sections.find((s) => s.id === sectionId);
  const estJeunes = sectionChoisie?.nom === "Jeunes";

  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [pending, startTransition] = useTransition();

  if (succes) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h2 className="text-base font-semibold text-emerald-900">
          Préinscription enregistrée
        </h2>
        <p className="mt-2 text-sm text-emerald-800">
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
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="sectionId" className="mb-1 block text-sm font-medium text-slate-700">
          Section souhaitée
        </label>
        <select
          id="sectionId"
          name="sectionId"
          required
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          {estJeunes ? "Informations de l'enfant" : "Vos informations"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Civilité</label>
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
          {!estJeunes && (
            <>
              <Champ label="Téléphone mobile" name="telephoneMobile" />
              <Champ label="Email" name="email" type="email" />
              <div className="sm:col-span-2">
                <Champ label="Adresse" name="adresse" />
              </div>
              <Champ label="Profession" name="profession" />
              <Champ label="Niveau d'études" name="niveauEtudes" />
              <Champ label="Dernier diplôme obtenu" name="dernierDiplome" />
            </>
          )}
        </div>
      </fieldset>

      {estJeunes && (
        <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-slate-800">
            Responsable légal
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Civilité</label>
              <select
                name="responsableCivilite"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="">—</option>
                <option value="M">M.</option>
                <option value="MME">Mme</option>
              </select>
            </div>
            <Champ label="Lien (père, mère, tuteur…)" name="responsableLien" />
            <Champ label="Nom" name="responsableNom" required />
            <Champ label="Prénom" name="responsablePrenom" required />
            <Champ label="Téléphone" name="responsableTelephone" />
            <Champ label="Email" name="responsableEmail" type="email" />
            <div className="sm:col-span-2">
              <Champ label="Adresse" name="responsableAdresse" />
            </div>
          </div>
        </fieldset>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Envoyer ma préinscription"}
      </button>
    </form>
  );
}
