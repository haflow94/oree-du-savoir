import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, hasRole } from "@/lib/roles";
import { estAdministratif } from "@/lib/acces-presence";
import { formaterMontant, statutCotisation, STATUT_COTISATION_VARIANTS } from "@/lib/paiements";
import { JOUR_LABELS } from "@/lib/planning";
import { TYPE_DOCUMENT_LABELS } from "@/lib/documents";
import { TypeDocument } from "@/generated/prisma/enums";
import { estNouveau, estReinscrit } from "@/lib/sections-etudiant";
import { BackLink } from "@/components/ui/back-link";
import { inscrireEtudiantAction, retirerEtudiantAction } from "../../presences/actions";
import {
  modifierEtudiantAction,
  ajouterResponsableAction,
  modifierResponsableAction,
  supprimerResponsableAction,
  validerInscriptionAction,
  televerserDocumentAction,
  supprimerDocumentAction,
  supprimerEtudiantAction,
} from "./actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect, ChampTextarea } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ChampSelectAuto } from "@/components/ui/auto-submit";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PEUT_MODIFIER = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];
const PEUT_CREER_DOSSIER = [Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];
const PEUT_SUPPRIMER = [Role.ADMINISTRATION, Role.BUREAU];

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Le nom et le prénom sont obligatoires.",
  FICHIER_MANQUANT: "Choisissez un fichier et un type de document.",
  INTROUVABLE: "Ce document n'existe plus.",
  ETUDIANT_UTILISE:
    "Impossible de supprimer : un dossier annuel, une inscription ou des présences existent déjà pour cet étudiant.",
  INSCRIPTION_INVALIDE: "Sélectionnez une classe à inscrire.",
};

function versChampDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

const FIELDSET_CLASSES = "rounded-xl border border-border bg-bg-elevated p-5 shadow-card";
const LEGEND_CLASSES = "px-1 text-sm font-semibold text-ink";
const DT_CLASSES = "text-xs font-medium uppercase text-ink-faint";
const DD_CLASSES = "mt-0.5 text-sm text-ink";
const ZONE_TITLE_CLASSES = "mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint";
const ZONE_CLASSES = "scroll-mt-20 space-y-4";
const NAV_LINK_CLASSES = "font-medium text-ink-muted hover:text-pine-strong";

export default async function EtudiantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; classeSectionId?: string }>;
}) {
  const session = await requireSession();
  const peutModifier = hasRole(session.role, PEUT_MODIFIER);
  const peutCreerDossier = hasRole(session.role, PEUT_CREER_DOSSIER);
  const peutInscrire = estAdministratif(session.role) || session.role === Role.ACCUEIL;
  const { id } = await params;
  const { error, ok, classeSectionId: classeSectionIdParam } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const [etudiant, sections, anneeActive] = await Promise.all([
    prisma.etudiant.findUnique({
      where: { id },
      include: {
        responsables: true,
        sectionSouhaitee: true,
        inscriptions: {
          include: {
            classe: { include: { cours: { include: { section: true } }, anneeScolaire: true } },
          },
          orderBy: { classe: { anneeScolaire: { libelle: "desc" } } },
        },
        dossiersAnnuels: {
          include: {
            anneeScolaire: true,
            echeances: { include: { paiements: true } },
          },
          orderBy: { anneeScolaire: { libelle: "desc" } },
        },
        documents: { orderBy: { creeLe: "desc" } },
        // Une inscription peut être retirée sans effacer les présences déjà
        // enregistrées (relation séparée) : à compter à part pour le
        // garde-fou de suppression, voir supprimerEtudiantAction.
        _count: { select: { presences: true } },
      },
    }),
    prisma.section.findMany({ orderBy: { nom: "asc" } }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
  ]);

  if (!etudiant) {
    notFound();
  }

  const dejaInscritClasseIds = new Set(etudiant.inscriptions.map((i) => i.classe.id));
  // Section demandée à la préinscription : présélectionne le filtre tant que
  // le staff n'a pas explicitement changé/vidé le filtre (voir
  // Etudiant.sectionSouhaiteeId et inscrireEtudiantAction).
  const classeSectionId = classeSectionIdParam ?? etudiant.sectionSouhaiteeId ?? undefined;
  const anneeActiveId = anneeActive?.id ?? null;
  const reinscritAnneeActive = anneeActiveId
    ? estReinscrit({
        inscriptions: etudiant.inscriptions.filter((i) => i.classe.anneeScolaireId === anneeActiveId),
        dossiersAnnuels: etudiant.dossiersAnnuels.filter((d) => d.anneeScolaireId === anneeActiveId),
      })
    : false;
  // Nouvel étudiant (aucun historique avant l'année active) : "Inscrit"/"Non
  // inscrit" plutôt que "Réinscrit"/"Non réinscrit", qui suppose à tort une
  // inscription passée (voir estNouveau).
  const nouveauEtudiant = anneeActiveId ? estNouveau(etudiant, anneeActiveId) : true;
  const classesDisponibles =
    peutInscrire && anneeActiveId
      ? (
          await prisma.classe.findMany({
            where: {
              anneeScolaireId: anneeActiveId,
              ...(classeSectionId ? { cours: { sectionId: classeSectionId } } : {}),
            },
            include: { cours: { include: { section: true } } },
            orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
          })
        ).filter((c) => !dejaInscritClasseIds.has(c.id))
      : [];

  const peutSupprimer = hasRole(session.role, PEUT_SUPPRIMER);
  const etudiantSupprimable =
    etudiant.dossiersAnnuels.length === 0 &&
    etudiant.inscriptions.length === 0 &&
    etudiant._count.presences === 0;

  // Bandeau d'état : ce que la fiche cachait jusqu'ici (dossier financier de
  // l'année active manquant, ou pas encore soldé) devient visible en tête,
  // au lieu d'être enterré dans la carte Situation financière.
  const dossierAnneeActive = anneeActiveId
    ? etudiant.dossiersAnnuels.find((d) => d.anneeScolaireId === anneeActiveId)
    : undefined;
  let banniereFinance: { texte: string; lien: string } | null = null;
  if (etudiant.statutInscription === "VALIDE" && anneeActive) {
    if (!dossierAnneeActive) {
      banniereFinance = {
        texte: `Dossier financier ${anneeActive.libelle} manquant.`,
        lien: `/paiements/nouveau?etudiantId=${etudiant.id}&anneeScolaireId=${anneeActive.id}`,
      };
    } else {
      const { reste } = statutCotisation(dossierAnneeActive);
      if (reste > 0 && !dossierAnneeActive.rembourse) {
        banniereFinance = {
          texte: `Reste ${formaterMontant(reste)} à encaisser pour ${anneeActive.libelle}.`,
          lien: `/paiements/${dossierAnneeActive.id}`,
        };
      }
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <BackLink href="/etudiants" label="Étudiants" />
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-semibold text-pine-strong">
            {etudiant.prenom} {etudiant.nom}
            {etudiant.statutInscription === "PREINSCRIT" && (
              <Badge variant="info">Préinscrit — à valider</Badge>
            )}
            {etudiant.statutInscription === "VALIDE" && anneeActive && (
              <Badge variant={reinscritAnneeActive ? "success" : "warning"}>
                {nouveauEtudiant
                  ? reinscritAnneeActive
                    ? "Inscrit"
                    : "Non inscrit"
                  : reinscritAnneeActive
                    ? "Réinscrit"
                    : "Non réinscrit"}{" "}
                {anneeActive.libelle}
              </Badge>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {peutModifier && etudiant.statutInscription === "PREINSCRIT" && (
            <form action={validerInscriptionAction}>
              <input type="hidden" name="etudiantId" value={etudiant.id} />
              <Button type="submit" variant="primary">
                Valider l&apos;inscription
              </Button>
            </form>
          )}
          {peutSupprimer && (
            <>
              <form id="supprimer-etudiant" action={supprimerEtudiantAction}>
                <input type="hidden" name="etudiantId" value={etudiant.id} />
              </form>
              <ConfirmDialog
                formId="supprimer-etudiant"
                triggerLabel="Supprimer la fiche"
                title="Supprimer cette fiche ?"
                description={`Cette action supprime définitivement la fiche de ${etudiant.prenom} ${etudiant.nom} et ne peut pas être annulée.`}
                confirmLabel="Supprimer définitivement"
                disabled={!etudiantSupprimable}
                disabledTitle="Un dossier annuel, une inscription ou des présences existent déjà : impossible de supprimer cette fiche."
              />
            </>
          )}
        </div>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      {banniereFinance && (
        <Alert variant="warning">
          {peutCreerDossier ? (
            <Link href={banniereFinance.lien} className="underline">
              {banniereFinance.texte}
            </Link>
          ) : (
            banniereFinance.texte
          )}
        </Alert>
      )}

      <nav className="flex flex-wrap gap-4 border-b border-border pb-2 text-sm">
        <a href="#zone-profil" className={NAV_LINK_CLASSES}>
          Profil
        </a>
        <a href="#cours-suivis" className={NAV_LINK_CLASSES}>
          Cours suivis
        </a>
        <a href="#zone-finances" className={NAV_LINK_CLASSES}>
          Situation financière
        </a>
        {peutModifier && (
          <a href="#zone-documents" className={NAV_LINK_CLASSES}>
            Documents
          </a>
        )}
      </nav>

      <section id="zone-profil" className={ZONE_CLASSES}>
      <p className={ZONE_TITLE_CLASSES}>Profil</p>
      {peutModifier ? (
        <form action={modifierEtudiantAction} className="space-y-6">
          <input type="hidden" name="etudiantId" value={etudiant.id} />

          <fieldset className={FIELDSET_CLASSES}>
            <legend className={LEGEND_CLASSES}>Identité</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <ChampSelect label="Civilité" name="civilite" defaultValue={etudiant.civilite ?? ""}>
                <option value="">—</option>
                <option value="M">M.</option>
                <option value="MME">Mme</option>
              </ChampSelect>
              <div />
              <Champ label="Nom" name="nom" defaultValue={etudiant.nom} required />
              <Champ label="Prénom" name="prenom" defaultValue={etudiant.prenom} required />
              <Champ
                label="Date de naissance"
                name="dateNaissance"
                type="date"
                defaultValue={versChampDate(etudiant.dateNaissance)}
              />
              <Champ
                label="Ville de naissance"
                name="villeNaissance"
                defaultValue={etudiant.villeNaissance ?? ""}
              />
            </div>
          </fieldset>

          <fieldset className={FIELDSET_CLASSES}>
            <legend className={LEGEND_CLASSES}>Coordonnées</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ
                label="Téléphone mobile"
                name="telephoneMobile"
                defaultValue={etudiant.telephoneMobile ?? ""}
              />
              <Champ
                label="Téléphone fixe"
                name="telephoneFixe"
                defaultValue={etudiant.telephoneFixe ?? ""}
              />
              <Champ label="Email" name="email" type="email" defaultValue={etudiant.email ?? ""} />
              <Champ
                label="Contact d'urgence"
                name="contactUrgence"
                defaultValue={etudiant.contactUrgence ?? ""}
              />
              <Champ
                label="Adresse"
                name="adresse"
                defaultValue={etudiant.adresse ?? ""}
                className="sm:col-span-2"
              />
              <Champ
                label="Complément d'adresse"
                name="complementAdresse"
                defaultValue={etudiant.complementAdresse ?? ""}
              />
              <Champ
                label="Code postal"
                name="codePostal"
                defaultValue={etudiant.codePostal ?? ""}
              />
            </div>
          </fieldset>

          <fieldset className={FIELDSET_CLASSES}>
            <legend className={LEGEND_CLASSES}>Situation</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Profession" name="profession" defaultValue={etudiant.profession ?? ""} />
              <Champ
                label="Niveau d'études"
                name="niveauEtudes"
                defaultValue={etudiant.niveauEtudes ?? ""}
              />
              <Champ
                label="Dernier diplôme obtenu"
                name="dernierDiplome"
                defaultValue={etudiant.dernierDiplome ?? ""}
              />
              <div />
              <ChampTextarea
                label="Remarque"
                name="remarque"
                rows={3}
                defaultValue={etudiant.remarque ?? ""}
                className="sm:col-span-2"
              />
            </div>
          </fieldset>

          <div className="flex justify-end">
            <Button type="submit" variant="primary">
              Enregistrer les informations personnelles
            </Button>
          </div>
        </form>
      ) : (
        <>
          <Card>
            <CardTitle>Identité</CardTitle>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className={DT_CLASSES}>Date de naissance</dt>
                <dd className={DD_CLASSES}>
                  {etudiant.dateNaissance
                    ? new Date(etudiant.dateNaissance).toLocaleDateString("fr-FR")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className={DT_CLASSES}>Ville de naissance</dt>
                <dd className={DD_CLASSES}>{etudiant.villeNaissance || "—"}</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <CardTitle>Coordonnées</CardTitle>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className={DT_CLASSES}>Téléphone</dt>
                <dd className={DD_CLASSES}>{etudiant.telephoneMobile || etudiant.telephoneFixe || "—"}</dd>
              </div>
              <div>
                <dt className={DT_CLASSES}>Email</dt>
                <dd className={DD_CLASSES}>{etudiant.email || "—"}</dd>
              </div>
              <div>
                <dt className={DT_CLASSES}>Contact d&apos;urgence</dt>
                <dd className={DD_CLASSES}>{etudiant.contactUrgence || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className={DT_CLASSES}>Adresse</dt>
                <dd className={DD_CLASSES}>
                  {etudiant.adresse || "—"}
                  {etudiant.codePostal ? ` — ${etudiant.codePostal}` : ""}
                </dd>
              </div>
            </dl>
          </Card>
        </>
      )}

      <Card>
        <CardTitle>Responsables légaux</CardTitle>
        {etudiant.responsables.length === 0 ? (
          <div className="mt-4">
            <EmptyState message="Aucun responsable enregistré." />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {etudiant.responsables.map((r) => (
              <li key={r.id} className="py-4 first:pt-0">
                {peutModifier ? (
                  <form action={modifierResponsableAction} className="space-y-3">
                    <input type="hidden" name="etudiantId" value={etudiant.id} />
                    <input type="hidden" name="responsableId" value={r.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ChampSelect label="Civilité" name="civilite" defaultValue={r.civilite ?? ""}>
                        <option value="">—</option>
                        <option value="M">M.</option>
                        <option value="MME">Mme</option>
                      </ChampSelect>
                      <Champ label="Lien" name="lien" defaultValue={r.lien} />
                      <Champ label="Nom" name="nom" required defaultValue={r.nom} />
                      <Champ label="Prénom" name="prenom" required defaultValue={r.prenom} />
                      <Champ label="Téléphone" name="telephone" defaultValue={r.telephone ?? ""} />
                      <Champ label="Email" name="email" type="email" defaultValue={r.email ?? ""} />
                      <Champ
                        label="Adresse"
                        name="adresse"
                        defaultValue={r.adresse ?? ""}
                        className="sm:col-span-2"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="submit" variant="secondary" size="sm">
                        Enregistrer
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {r.prenom} {r.nom} <span className="font-normal text-ink-muted">({r.lien})</span>
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {r.telephone || "—"} · {r.email || "—"}
                    </p>
                  </div>
                )}
                {peutModifier && (
                  <form action={supprimerResponsableAction} className="mt-1 flex justify-end">
                    <input type="hidden" name="etudiantId" value={etudiant.id} />
                    <input type="hidden" name="responsableId" value={r.id} />
                    <button
                      type="submit"
                      className="flex items-center gap-1 text-xs font-medium text-rust hover:underline"
                    >
                      <Trash2 size={12} aria-hidden />
                      Supprimer ce responsable
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {peutModifier && (
          <details className="mt-4">
            <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-pine">
              <Plus size={14} aria-hidden />
              Ajouter un responsable
            </summary>
            <form action={ajouterResponsableAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="etudiantId" value={etudiant.id} />
              <ChampSelect label="Civilité" name="civilite" defaultValue="">
                <option value="">—</option>
                <option value="M">M.</option>
                <option value="MME">Mme</option>
              </ChampSelect>
              <Champ label="Lien" name="lien" placeholder="Père, mère, tuteur…" />
              <Champ label="Nom" name="nom" required />
              <Champ label="Prénom" name="prenom" required />
              <Champ label="Téléphone" name="telephone" />
              <Champ label="Email" name="email" type="email" />
              <Champ label="Adresse" name="adresse" className="sm:col-span-2" />
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" variant="secondary" size="sm">
                  Ajouter
                </Button>
              </div>
            </form>
          </details>
        )}
      </Card>
      </section>

      <section id="cours-suivis" className={ZONE_CLASSES}>
      <p className={ZONE_TITLE_CLASSES}>Cours suivis</p>
      <Card>
        {etudiant.sectionSouhaitee && (
          <div className="mt-3">
            <Alert variant="info">
              Section souhaitée à la préinscription :{" "}
              <strong>{etudiant.sectionSouhaitee.nom}</strong> — choisissez une
              classe ci-dessous pour l&apos;assigner.
            </Alert>
          </div>
        )}
        {etudiant.inscriptions.length === 0 ? (
          <div className="mt-4">
            <EmptyState message="Aucune inscription en cours." />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {etudiant.inscriptions.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/classes/${i.classe.id}`}
                      className="text-sm font-medium text-ink hover:underline"
                    >
                      {i.classe.cours.section.nom} · {i.classe.cours.nom}
                      {i.classe.niveau && ` — ${i.classe.niveau}`}
                    </Link>
                    {i.statut === "LISTE_ATTENTE" && (
                      <Badge variant="danger">Liste d&apos;attente</Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-faint">
                    {JOUR_LABELS[i.classe.jour]} {i.classe.heureDebut}–{i.classe.heureFin} ·{" "}
                    {i.classe.anneeScolaire.libelle}
                  </p>
                </div>
                {peutInscrire && (
                  <form action={retirerEtudiantAction}>
                    <input type="hidden" name="origine" value="etudiant" />
                    <input type="hidden" name="inscriptionId" value={i.id} />
                    <input type="hidden" name="classeId" value={i.classe.id} />
                    <input type="hidden" name="etudiantId" value={etudiant.id} />
                    <button type="submit" className="text-xs font-medium text-rust hover:underline">
                      Retirer
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {peutInscrire && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <form
              className="flex flex-wrap items-end gap-2"
              action={`/etudiants/${etudiant.id}#cours-suivis`}
              method="GET"
            >
              <ChampSelectAuto label="Section" name="classeSectionId" defaultValue={classeSectionId ?? ""}>
                <option value="">Toutes les sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </ChampSelectAuto>
            </form>

            {classesDisponibles.length > 0 ? (
              <form action={inscrireEtudiantAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="origine" value="etudiant" />
                <input type="hidden" name="etudiantId" value={etudiant.id} />
                <ChampSelect label="Classe" name="classeId" required className="w-full max-w-sm">
                  {classesDisponibles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cours.section.nom} · {c.cours.nom}
                      {c.niveau && ` — ${c.niveau}`} · {JOUR_LABELS[c.jour]} {c.heureDebut}-
                      {c.heureFin}
                    </option>
                  ))}
                </ChampSelect>
                <Button type="submit" variant="secondary" size="sm">
                  Inscrire
                </Button>
              </form>
            ) : (
              <EmptyState
                message={
                  anneeActiveId
                    ? "Aucune classe disponible pour ce filtre."
                    : "Aucune année scolaire active."
                }
              />
            )}
          </div>
        )}
      </Card>
      </section>

      <section id="zone-finances" className={ZONE_CLASSES}>
      <p className={ZONE_TITLE_CLASSES}>Situation financière</p>

      {peutCreerDossier && anneeActive && etudiant.statutInscription === "VALIDE" && !dossierAnneeActive && (
        <div className="rounded-lg border border-dashed border-border-strong bg-bg-sunken/40 p-4 text-center">
          <p className="text-sm text-ink-muted">
            Aucun dossier pour l&apos;année <strong>{anneeActive.libelle}</strong>.
          </p>
          <Link
            href={`/paiements/nouveau?etudiantId=${etudiant.id}&anneeScolaireId=${anneeActive.id}`}
            className={`mt-2 inline-flex ${buttonVariants({ variant: "primary", size: "sm" })}`}
          >
            Créer le dossier {anneeActive.libelle}
          </Link>
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-faint">Historique des dossiers</span>
          {peutCreerDossier && (
            <Link
              href={`/paiements/nouveau?etudiantId=${etudiant.id}`}
              className="flex items-center gap-1 text-xs font-medium text-pine hover:underline"
            >
              <Plus size={12} aria-hidden />
              Nouveau dossier
            </Link>
          )}
        </div>
        {etudiant.dossiersAnnuels.length === 0 ? (
          <div className="mt-4">
            <EmptyState message="Aucun dossier de paiement pour l'instant." />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {etudiant.dossiersAnnuels.map((d) => {
              const { du, reste, statut } = statutCotisation(d);
              const statutVariant = STATUT_COTISATION_VARIANTS[statut];
              return (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <Link
                    href={`/paiements/${d.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {d.anneeScolaire.libelle}
                  </Link>
                  <div className="flex items-center gap-3 text-sm text-ink-muted">
                    <span>Dû {formaterMontant(du)}</span>
                    <span>Reste {formaterMontant(reste)}</span>
                    <Badge variant={statutVariant}>{statut}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      </section>

      {peutModifier && (
      <section id="zone-documents" className={ZONE_CLASSES}>
      <p className={ZONE_TITLE_CLASSES}>Documents</p>
        <Card>
          <CardTitle>Dossier officiel</CardTitle>
          <p className="mb-3 mt-1 text-xs text-ink-faint">
            Génère le dossier Word pré-rempli (gabarit officiel de
            l&apos;association) : à ouvrir dans Word ou LibreOffice pour
            l&apos;imprimer et le faire signer. Le fichier est conservé et
            réapparaît dans les documents ci-dessous.
          </p>
          {sections.length === 0 ? (
            <EmptyState message="Aucune section enregistrée." />
          ) : (
            <form className="flex flex-wrap items-end gap-2" action={`/etudiants/${etudiant.id}/dossier`}>
              <ChampSelect label="Section" name="sectionId" required defaultValue={sections[0]?.id}>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </ChampSelect>
              <button
                type="submit"
                formTarget="_blank"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Générer (Word)
              </button>
            </form>
          )}
        </Card>

        <Card>
          <CardTitle>Documents</CardTitle>
          {etudiant.documents.length === 0 ? (
            <div className="mt-4">
              <EmptyState message="Aucun document pour l'instant." />
            </div>
          ) : (
            <ul className="mb-4 mt-4 divide-y divide-border">
              {etudiant.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{d.nomFichier}</p>
                    <p className="text-xs text-ink-faint">
                      {TYPE_DOCUMENT_LABELS[d.type]} ·{" "}
                      {new Date(d.creeLe).toLocaleDateString("fr-FR")}
                    </p>
                    <div className="mt-1 flex gap-3">
                      <a
                        href={`/etudiants/${etudiant.id}/documents/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-pine hover:underline"
                      >
                        Voir
                      </a>
                      <a
                        href={`/etudiants/${etudiant.id}/documents/${d.id}?telecharger=1`}
                        className="text-xs font-medium text-pine hover:underline"
                      >
                        Télécharger
                      </a>
                    </div>
                  </div>
                  <form id={`supprimer-document-${d.id}`} action={supprimerDocumentAction}>
                    <input type="hidden" name="etudiantId" value={etudiant.id} />
                    <input type="hidden" name="documentId" value={d.id} />
                  </form>
                  <ConfirmDialog
                    formId={`supprimer-document-${d.id}`}
                    triggerLabel="Supprimer"
                    title="Supprimer ce document ?"
                    description={`« ${d.nomFichier} » sera définitivement supprimé.`}
                    confirmLabel="Supprimer"
                  />
                </li>
              ))}
            </ul>
          )}
          <form
            action={televerserDocumentAction}
            encType="multipart/form-data"
            className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
          >
            <input type="hidden" name="etudiantId" value={etudiant.id} />
            <ChampSelect label="Type" name="type" required defaultValue="">
              <option value="" disabled>
                Choisir…
              </option>
              {Object.values(TypeDocument)
                .filter((t) => t !== "DOSSIER_GENERE")
                .map((t) => (
                  <option key={t} value={t}>
                    {TYPE_DOCUMENT_LABELS[t]}
                  </option>
                ))}
            </ChampSelect>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Fichier</label>
              <input
                type="file"
                name="fichier"
                required
                className="rounded-md border border-border-strong bg-bg-elevated px-3 py-1.5 text-sm text-ink file:mr-2 file:rounded file:border-0 file:bg-pine-soft file:px-2 file:py-1 file:text-xs file:text-pine-strong"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              <Upload size={13} aria-hidden />
              Téléverser
            </Button>
          </form>
        </Card>
      </section>
      )}
    </div>
  );
}
