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
type Ligne = { id: number; sectionId: string };

const FIELDSET_CLASSES = "scroll-mt-20 rounded-xl border border-border bg-bg-elevated p-5 shadow-card";
const LEGEND_CLASSES = "px-1 text-sm font-semibold text-ink";
const STEP_NAV_LINK_CLASSES =
  "shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-pine hover:text-pine-strong";

// Même jeu de champs que ResponsableLegal (voir prisma/schema.prisma) et
// que le bloc "Ajouter un responsable" de la fiche étudiant côté staff
// (etudiants/[id]/page.tsx) — nécessaire pour que le dossier généré
// (src/lib/dossier/context.ts, modèle Jeunes) affiche déjà l'adresse, le
// téléphone professionnel etc. du responsable sans ressaisie sur place.
// Responsable 1 obligatoire (un mineur a toujours un responsable légal),
// responsable 2 facultatif (ex. père et mère tous deux au dossier — voir
// rl_pere/rl_mere sur la dernière page du gabarit Jeunes).
function BlocResponsable({ index }: { index: 1 | 2 }) {
  return (
    <fieldset id={index === 1 ? "section-responsables" : undefined} className={FIELDSET_CLASSES}>
      <legend className={LEGEND_CLASSES}>
        Responsable légal {index} {index === 2 && "(optionnel)"}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampSelect label="Civilité" name={`responsable${index}Civilite`} defaultValue="">
          <option value="">—</option>
          <option value="M">M.</option>
          <option value="MME">Mme</option>
        </ChampSelect>
        <Champ label="Lien (père, mère, tuteur…)" name={`responsable${index}Lien`} required={index === 1} />
        <Champ label="Nom" name={`responsable${index}Nom`} required={index === 1} />
        <Champ label="Prénom" name={`responsable${index}Prenom`} required={index === 1} />
        <Champ
          label="Téléphone"
          name={`responsable${index}Telephone`}
          required={index === 1}
          inputMode="tel"
          pattern={PATTERN_TELEPHONE}
          title="Numéro français, ex. 06 12 34 56 78"
          placeholder="06 12 34 56 78"
        />
        <Champ
          label="Téléphone professionnel"
          name={`responsable${index}TelephoneProfessionnel`}
          inputMode="tel"
          pattern={PATTERN_TELEPHONE}
          title="Numéro français, ex. 04 91 23 45 67"
          placeholder="04 91 23 45 67"
        />
        <Champ label="Email" name={`responsable${index}Email`} type="email" required={index === 1} />
        <Champ label="Profession" name={`responsable${index}Profession`} />
        <Champ
          label="Adresse"
          name={`responsable${index}Adresse`}
          className="sm:col-span-2"
        />
        <Champ
          label="Code postal"
          name={`responsable${index}CodePostal`}
          inputMode="numeric"
          pattern={PATTERN_CODE_POSTAL}
          maxLength={5}
          title="5 chiffres"
          placeholder="69000"
        />
        <Champ label="Ville" name={`responsable${index}Ville`} />
      </div>
    </fieldset>
  );
}

// Laissé vide en attendant que le CA désigne l'adresse à afficher pour
// l'exercice des droits RGPD ; en attendant, le texte reste correct en
// renvoyant vers un contact générique plutôt qu'un placeholder brut.
const EMAIL_CONTACT_RGPD = "";

export function PreinscriptionForm({
  sections,
  creneaux,
}: {
  sections: Section[];
  // Catalogue CS/S/D + restriction de chaque section (voir Administration →
  // Sections) : toujours ce catalogue générique qui est proposé ici, jamais
  // une Classe réelle (matière/niveau précis) — voir preinscrireAction.
  creneaux: Creneau[];
}) {
  // Une même personne peut vouloir suivre plusieurs cours/sections en une
  // seule préinscription (ex. Jeunes + Études Coraniques pour le même
  // enfant) : chaque ligne porte sa propre section + créneau, reliées côté
  // serveur par `ligneId` (voir actions.ts) plutôt que par position dans le
  // tableau, pour rester fiable même quand un créneau est indisponible et
  // donc absent du FormData (champ désactivé).
  const [lignes, setLignes] = useState<Ligne[]>([{ id: 0, sectionId: sections[0]?.id ?? "" }]);
  const prochainId = lignes.reduce((max, l) => Math.max(max, l.id), 0) + 1;

  function ajouterLigne() {
    setLignes((prev) => [...prev, { id: prochainId, sectionId: sections[0]?.id ?? "" }]);
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
  const [pieceIdentiteFournie, setPieceIdentiteFournie] = useState(false);

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

      <nav
        aria-label="Sections du formulaire"
        className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-bg px-4 py-2 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        <a href="#section-cours" className={STEP_NAV_LINK_CLASSES}>
          1. Cours
        </a>
        <a href="#section-identite" className={STEP_NAV_LINK_CLASSES}>
          2. {estJeunes ? "Enfant" : "Vous"}
        </a>
        {!estJeunes && (
          <a href="#section-coordonnees" className={STEP_NAV_LINK_CLASSES}>
            3. Coordonnées
          </a>
        )}
        {!estJeunes && (
          <a href="#section-situation" className={STEP_NAV_LINK_CLASSES}>
            4. Situation
          </a>
        )}
        <a href="#section-documents" className={STEP_NAV_LINK_CLASSES}>
          {estJeunes ? "3." : "5."} Documents
        </a>
        {estJeunes && (
          <a href="#section-responsables" className={STEP_NAV_LINK_CLASSES}>
            4. Responsable(s)
          </a>
        )}
        <a href="#section-rgpd" className={STEP_NAV_LINK_CLASSES}>
          {estJeunes ? "5." : "6."} Confidentialité
        </a>
      </nav>

      <Card id="section-cours" className="scroll-mt-20 space-y-4">
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
                onChange={(e) => modifierLigne(ligne.id, { sectionId: e.target.value })}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </ChampSelect>

              {creneauxLigne.length > 0 ? (
                <ChampSelect
                  key={ligne.sectionId}
                  id={`creneauSouhaiteId-${ligne.id}`}
                  label="Créneau souhaité"
                  name={`creneauSouhaiteId-${ligne.id}`}
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choisir un créneau…
                  </option>
                  {creneauxLigne.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </ChampSelect>
              ) : (
                <ChampSelect
                  key={ligne.sectionId}
                  id={`creneauSouhaiteId-${ligne.id}`}
                  label="Créneau souhaité"
                  name={`creneauSouhaiteId-${ligne.id}`}
                  disabled
                  defaultValue=""
                  hint="Aucun créneau n'est encore défini pour cette section : contactez l'association."
                >
                  <option value="">Aucun créneau disponible pour le moment</option>
                </ChampSelect>
              )}
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

      <fieldset id="section-identite" className={FIELDSET_CLASSES}>
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
          {estJeunes && (
            <>
              <ChampSelect label="Sexe" name="sexe" defaultValue="">
                <option value="">—</option>
                <option value="F">F</option>
                <option value="M">M</option>
              </ChampSelect>
              <Champ label="Niveau scolaire" name="niveauScolaire" placeholder="ex. CM2" />
            </>
          )}
        </div>
      </fieldset>

      {!estJeunes && (
        <fieldset id="section-coordonnees" className={FIELDSET_CLASSES}>
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
      )}

      {!estJeunes && (
        <fieldset id="section-situation" className={FIELDSET_CLASSES}>
          <legend className={LEGEND_CLASSES}>Situation</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Profession" name="profession" />
            <Champ label="Niveau d'études" name="niveauEtudes" required />
            <Champ label="Dernier diplôme obtenu" name="dernierDiplome" />
          </div>
        </fieldset>
      )}

      <fieldset id="section-documents" className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Documents (facultatif)</legend>
        <p className="mb-3 text-sm text-ink-muted">
          Si vous les avez sous la main, vous pouvez déjà envoyer une photo et
          une pièce d&apos;identité — sinon l&apos;association vous les
          demandera lors du contrôle sur place.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="photo">
              Photo d&apos;identité
            </label>
            <input
              id="photo"
              type="file"
              name="photo"
              accept="image/*"
              className="w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-1.5 text-sm text-ink file:mr-2 file:rounded file:border-0 file:bg-pine-soft file:px-2 file:py-1 file:text-xs file:text-pine-strong"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="pieceIdentite">
              Pièce d&apos;identité
            </label>
            <input
              id="pieceIdentite"
              type="file"
              name="pieceIdentite"
              accept="image/*,application/pdf"
              onChange={(e) => setPieceIdentiteFournie(!!e.target.files?.length)}
              className="w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-1.5 text-sm text-ink file:mr-2 file:rounded file:border-0 file:bg-pine-soft file:px-2 file:py-1 file:text-xs file:text-pine-strong"
            />
          </div>
          {pieceIdentiteFournie && (
            <>
              <ChampSelect
                label="Type de pièce"
                name="typePieceIdentite"
                required={pieceIdentiteFournie}
                defaultValue=""
              >
                <option value="" disabled>
                  Choisir…
                </option>
                <option value="CARTE_IDENTITE">Carte d&apos;identité</option>
                <option value="PASSEPORT">Passeport</option>
                <option value="TITRE_SEJOUR">Titre de séjour</option>
                <option value="PERMIS_CONDUIRE">Permis de conduire</option>
                <option value="AUTRE">Autre</option>
              </ChampSelect>
              <Champ
                label="Date d'expiration"
                name="dateExpirationPiece"
                type="date"
                required={pieceIdentiteFournie}
              />
            </>
          )}
        </div>
      </fieldset>

      {estJeunes && (
        <>
          <BlocResponsable index={1} />
          <BlocResponsable index={2} />
        </>
      )}

      <fieldset id="section-rgpd" className={FIELDSET_CLASSES}>
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
