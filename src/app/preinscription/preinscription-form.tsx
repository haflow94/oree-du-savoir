"use client";

import { useState, useTransition } from "react";
import { preinscrireAction } from "./actions";
import { Card } from "@/components/ui/card";
import { Champ, ChampSelect, ChampRadioGroup } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PATTERN_TELEPHONE, PATTERN_CODE_POSTAL, estMineur } from "@/lib/champs-formulaire";
import { NIVEAUX_PAR_CATALOGUE } from "@/lib/niveaux-section";
import type { CatalogueNiveaux } from "@/generated/prisma/enums";

type Section = { id: string; nom: string; catalogueNiveaux: CatalogueNiveaux };
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
function BlocResponsable({ index, requis }: { index: 1 | 2; requis: boolean }) {
  // Seul le responsable 1 peut devenir obligatoire, et seulement pour la
  // section "Jeunes" (voir estJeunes plus bas) : le responsable 2 (ex. père
  // ET mère au dossier) reste toujours facultatif.
  const obligatoire = index === 1 && requis;
  return (
    <fieldset id={index === 1 ? "section-responsables" : undefined} className={FIELDSET_CLASSES}>
      <legend className={LEGEND_CLASSES}>
        Responsable légal {index} {!obligatoire && "(optionnel)"}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampSelect label="Civilité" name={`responsable${index}Civilite`} defaultValue="">
          <option value="">—</option>
          <option value="M">M.</option>
          <option value="MME">Mme</option>
        </ChampSelect>
        <Champ label="Lien (père, mère, tuteur…)" name={`responsable${index}Lien`} required={obligatoire} />
        <Champ label="Nom" name={`responsable${index}Nom`} required={obligatoire} />
        <Champ label="Prénom" name={`responsable${index}Prenom`} required={obligatoire} />
        <Champ
          label="Téléphone"
          name={`responsable${index}Telephone`}
          required={obligatoire}
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
        <Champ label="Email" name={`responsable${index}Email`} type="email" required={obligatoire} />
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
  code,
}: {
  sections: Section[];
  // Catalogue CS/S/D + restriction de chaque section (voir Administration →
  // Sections) : toujours ce catalogue générique qui est proposé ici, jamais
  // une Classe réelle (matière/niveau précis) — voir preinscrireAction.
  creneaux: Creneau[];
  // Non nul uniquement quand la page (preinscription/page.tsx) a déjà
  // vérifié ce code comme valide (lien de campagne email, ou code accueil
  // obtenu via /accueil-preinscription) : embarqué en champ caché pour être
  // consommé à la soumission (voir preinscrireAction/tenterConsommerCode).
  // Absent pour un accès direct par URL, sans code.
  code?: string;
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

  // Rubrique "Identité" (voir plus bas) : suivie en state (au lieu d'un
  // simple <input> non contrôlé) uniquement pour recalculer ci-dessous si le
  // responsable légal est requis — la section Jeunes ne couvre pas tout un
  // mineur peut très bien s'inscrire à un cours pensé pour des adultes (ex.
  // Langue Arabe à 17 ans), et lui aussi a besoin d'un responsable légal au
  // dossier. Vide tant que le champ n'est pas rempli : pas encore mineur
  // avéré, donc pas encore affiché — la rubrique apparaît dès la saisie.
  const [dateNaissance, setDateNaissance] = useState("");
  const mineur = dateNaissance ? estMineur(new Date(dateNaissance)) : false;
  const responsableRequis = estJeunes || mineur;

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
      {code && <input type="hidden" name="code" value={code} />}

      <nav
        aria-label="Sections du formulaire"
        className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-bg px-4 py-2 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {[
          { href: "#section-cours", label: "Cours" },
          { href: "#section-identite", label: estJeunes ? "Enfant" : "Vous" },
          ...(!estJeunes ? [{ href: "#section-coordonnees", label: "Coordonnées" }] : []),
          ...(!estJeunes ? [{ href: "#section-situation", label: "Situation" }] : []),
          ...(responsableRequis ? [{ href: "#section-responsables", label: "Responsable(s)" }] : []),
          { href: "#section-documents", label: "Documents" },
          { href: "#section-autorisation-image", label: "Autorisation image" },
          { href: "#section-rgpd", label: "Confidentialité" },
        ].map((etape, index) => (
          <a key={etape.href} href={etape.href} className={STEP_NAV_LINK_CLASSES}>
            {index + 1}. {etape.label}
          </a>
        ))}
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
                  key={`creneau-${ligne.sectionId}`}
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
                  key={`creneau-${ligne.sectionId}`}
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

              {(() => {
                const section = sections.find((s) => s.id === ligne.sectionId);
                const options = section ? NIVEAUX_PAR_CATALOGUE[section.catalogueNiveaux] : [];
                if (options.length === 0) return null;
                return (
                  <ChampRadioGroup
                    key={`niveau-${ligne.sectionId}`}
                    label="Niveau"
                    name={`niveau-${ligne.id}`}
                    options={options}
                    required
                    hint="Le niveau réel sera confirmé par l'association lors de la première séance."
                  />
                );
              })()}
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
          <Champ
            label="Date de naissance"
            name="dateNaissance"
            type="date"
            required
            defaultValue={dateNaissance}
            onChange={(e) => setDateNaissance(e.target.value)}
          />
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

      <fieldset id="section-contact-urgence" className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Contact d&apos;urgence</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Nom" name="contactUrgenceNom" required />
          <Champ label="Prénom" name="contactUrgencePrenom" required />
          <Champ
            label="Téléphone"
            name="contactUrgenceTelephone"
            required
            inputMode="tel"
            pattern={PATTERN_TELEPHONE}
            title="Numéro français, ex. 06 12 34 56 78"
            placeholder="06 12 34 56 78"
          />
        </div>
      </fieldset>

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

      {responsableRequis && (
        <>
          <BlocResponsable index={1} requis={responsableRequis} />
          <BlocResponsable index={2} requis={responsableRequis} />
        </>
      )}

      <fieldset id="section-documents" className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Documents</legend>
        <p className="mb-3 text-sm text-ink-muted">
          Merci de joindre une photo d&apos;identité et une pièce
          d&apos;identité — elles sont nécessaires pour finaliser
          l&apos;inscription.
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
              required
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
              required
              className="w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-1.5 text-sm text-ink file:mr-2 file:rounded file:border-0 file:bg-pine-soft file:px-2 file:py-1 file:text-xs file:text-pine-strong"
            />
          </div>
          <ChampSelect label="Type de pièce" name="typePieceIdentite" required defaultValue="">
            <option value="" disabled>
              Choisir…
            </option>
            <option value="CARTE_IDENTITE">Carte d&apos;identité</option>
            <option value="PASSEPORT">Passeport</option>
            <option value="TITRE_SEJOUR">Titre de séjour</option>
            <option value="PERMIS_CONDUIRE">Permis de conduire</option>
            <option value="AUTRE">Autre</option>
          </ChampSelect>
          <Champ label="Date d'expiration" name="dateExpirationPiece" type="date" required />
        </div>
      </fieldset>

      <fieldset id="section-autorisation-image" className={FIELDSET_CLASSES}>
        <legend className={LEGEND_CLASSES}>Autorisation image</legend>
        <p className="text-sm text-ink-muted">
          {estJeunes
            ? "J'accepte que mon enfant soit filmé et/ou photographié lors des activités organisées au sein de l'association."
            : "J'accepte d'être filmé(e) et/ou photographié(e) lors des activités organisées au sein de l'association."}
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name="autorisationPhotoVideo"
              value="oui"
              required
              className="h-4 w-4 border-border"
            />
            Oui, j&apos;accepte
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name="autorisationPhotoVideo"
              value="non"
              required
              className="h-4 w-4 border-border"
            />
            Non, je refuse
          </label>
        </div>
      </fieldset>

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
