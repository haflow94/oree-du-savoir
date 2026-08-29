"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  rechercherDoublonsAction,
  rechercherEtudiantsAction,
  creerEtudiantAction,
  type Doublon,
} from "./actions";
import { Champ, ChampSelect, ChampTextarea } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PATTERN_TELEPHONE, PATTERN_CODE_POSTAL } from "@/lib/champs-formulaire";

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
        <Champ
          label="Téléphone"
          name={`responsable${index}Telephone`}
          inputMode="tel"
          pattern={PATTERN_TELEPHONE}
          title="Numéro français, ex. 06 12 34 56 78"
          placeholder="06 12 34 56 78"
        />
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

// Recherche proactive d'une fiche existante, avant même de commencer à
// remplir le formulaire de création : un ancien étudiant qui se réinscrit
// doit rouvrir sa fiche (historique, documents déjà fournis conservés),
// jamais en recréer une nouvelle. Débounce simple (300ms) plutôt qu'une lib
// dédiée, cohérent avec le reste de l'appli (pas de lib de formulaire
// partagée, voir CLAUDE.md).
function RechercheEtudiantExistant() {
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Doublon[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const nettoyee = recherche.trim();
    const delai = setTimeout(() => {
      if (nettoyee.length < 2) {
        setResultats([]);
        return;
      }
      startTransition(async () => {
        setResultats(await rechercherEtudiantsAction(nettoyee));
      });
    }, 300);
    return () => clearTimeout(delai);
  }, [recherche]);

  return (
    <div className="rounded-xl border border-border bg-bg-elevated p-5 shadow-card">
      <label className="mb-1 block text-sm font-semibold text-ink" htmlFor="recherche-etudiant-existant">
        Vérifier d&apos;abord si l&apos;étudiant a déjà une fiche
      </label>
      <input
        id="recherche-etudiant-existant"
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Nom ou prénom…"
        className="w-full rounded-md border border-border-strong bg-bg px-3 py-1.5 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft"
      />
      <p className="mt-1 text-xs text-ink-faint">
        Un ancien étudiant qui se réinscrit doit rouvrir sa fiche existante
        (historique et documents déjà fournis conservés), pas en créer une
        nouvelle.
      </p>
      {pending && <p className="mt-2 text-xs text-ink-faint">Recherche…</p>}
      {resultats.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-border bg-bg-sunken/40 p-2">
          {resultats.map((d) => (
            <li key={d.id}>
              <Link
                href={`/etudiants/${d.id}`}
                className="flex items-center justify-between rounded px-2 py-1 text-sm text-pine hover:bg-bg-elevated hover:underline"
              >
                <span>{d.prenom} {d.nom}</span>
                {d.dateNaissance && (
                  <span className="text-xs text-ink-faint">
                    né(e) le {new Date(d.dateNaissance).toLocaleDateString("fr-FR")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
    <div className="space-y-6">
      <RechercheEtudiantExistant />
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
        </div>
      </fieldset>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Coordonnées</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            label="Téléphone mobile"
            name="telephoneMobile"
            required
            inputMode="tel"
            pattern={PATTERN_TELEPHONE}
            title="Numéro français, ex. 06 12 34 56 78"
            placeholder="06 12 34 56 78"
          />
          <Champ
            label="Téléphone fixe"
            name="telephoneFixe"
            inputMode="tel"
            pattern={PATTERN_TELEPHONE}
            title="Numéro français, ex. 04 91 23 45 67"
            placeholder="04 91 23 45 67"
          />
          <Champ label="Email" name="email" type="email" required />
          <Champ
            label="Contact d'urgence"
            name="contactUrgence"
            placeholder="Nom Prénom Numéro de mobile"
          />
          <Champ label="Adresse" name="adresse" className="sm:col-span-2" required />
          <Champ label="Complément d'adresse" name="complementAdresse" />
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
          <Champ label="Ville" name="ville" required />
        </div>
      </fieldset>

      <fieldset className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Situation</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Profession" name="profession" />
          <Champ label="Niveau d'études" name="niveauEtudes" required />
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
    </div>
  );
}
