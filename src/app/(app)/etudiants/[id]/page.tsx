import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Trash2, Upload, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { Role } from "@/lib/roles";
import { formaterMontant, statutCotisation, STATUT_COTISATION_VARIANTS } from "@/lib/paiements";
import { JOUR_LABELS } from "@/lib/planning";
import {
  MIME_DOCX,
  TYPE_DOCUMENT_LABELS,
  TYPE_PIECE_IDENTITE_LABELS,
  TYPES_DOCUMENTS_GENERES,
  TYPES_DOCUMENTS_REQUIS,
  statutDocumentsRequis,
  dossierDocumentaireComplet,
  type StatutDocumentRequis,
} from "@/lib/documents";
import { TypeDocument } from "@/generated/prisma/enums";
import { champsComparaisonDoublon } from "@/lib/doublons-etudiant";
import { PopupDoublon } from "../doublon-popup";
import { ChampsTeleversementDocument } from "./champs-televersement-document";
import { cumulerTarif, estNouveau, estReinscrit } from "@/lib/sections-etudiant";
import { BackLink } from "@/components/ui/back-link";
import { retirerEtudiantAction } from "../../presences/actions";
import { creerDossierAction } from "../../paiements/nouveau/actions";
import {
  modifierEtudiantAction,
  ajouterResponsableAction,
  modifierResponsableAction,
  supprimerResponsableAction,
  validerInscriptionAction,
  affecterCohorteAction,
  televerserDocumentAction,
  supprimerDocumentAction,
  supprimerEtudiantAction,
  fusionnerDoublonAction,
  confirmerHomonymeAction,
} from "./actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect, ChampTextarea } from "@/components/ui/champ";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { SubmitMontantDu } from "@/components/ui/submit-montant-du";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconChip } from "@/components/ui/icon-chip";
import { PATTERN_TELEPHONE, PATTERN_CODE_POSTAL } from "@/lib/champs-formulaire";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Le nom et le prénom sont obligatoires.",
  PROFIL_CHAMPS_MANQUANTS:
    "La civilité, le nom, le prénom, la date de naissance, la ville de naissance, le téléphone mobile, l'email, l'adresse, le code postal, la ville et le niveau d'études sont obligatoires.",
  TELEPHONE_INVALIDE: "Ce numéro de téléphone n'a pas un format valide (ex. 06 12 34 56 78).",
  EMAIL_INVALIDE: "Cet email n'a pas un format valide.",
  CODE_POSTAL_INVALIDE: "Le code postal doit comporter 5 chiffres.",
  FICHIER_MANQUANT: "Choisissez un fichier et un type de document.",
  TYPE_RESERVE: "Ce type de document est réservé au dossier généré automatiquement par l'application.",
  PIECE_IDENTITE_INCOMPLETE: "Le type de pièce et sa date d'expiration sont obligatoires pour une pièce d'identité.",
  INTROUVABLE: "Ce document n'existe plus.",
  ETUDIANT_UTILISE:
    "Impossible de supprimer : un dossier annuel, une inscription ou des présences existent déjà pour cet étudiant.",
  INSCRIPTION_INVALIDE: "Sélectionnez une classe à inscrire.",
  AFFECTATION_INVALIDE: "Sélectionnez une cohorte à affecter.",
  DOUBLON_INTROUVABLE: "Ce signalement de doublon n'existe plus.",
  DOUBLON_NON_FUSIONNABLE:
    "Fusion impossible : cette fiche porte déjà un dossier annuel ou des présences réelles. Transférez-les manuellement avant de la supprimer.",
};

const STATUT_DOCUMENT_LABELS: Record<StatutDocumentRequis, string> = {
  OK: "OK",
  MANQUANT: "Manquant",
  EXPIRE: "Expiré",
};
const STATUT_DOCUMENT_VARIANTS: Record<StatutDocumentRequis, "success" | "warning" | "danger"> = {
  OK: "success",
  MANQUANT: "danger",
  EXPIRE: "warning",
};

function versChampDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

type DocumentEtudiant = {
  id: string;
  type: TypeDocument;
  nomFichier: string;
  mimeType: string;
  creeLe: Date;
};

function ListeDocuments({
  documents,
  etudiantId,
}: {
  documents: DocumentEtudiant[];
  etudiantId: string;
}) {
  return (
    <ul className="divide-y divide-border">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center justify-between py-2.5">
          <div>
            <p className="text-sm font-medium text-ink">{d.nomFichier}</p>
            <p className="text-xs text-ink-faint">
              {TYPE_DOCUMENT_LABELS[d.type]} · {new Date(d.creeLe).toLocaleDateString("fr-FR")}
            </p>
            <div className="mt-1 flex gap-3">
              <a
                href={`/etudiants/${etudiantId}/documents/${d.id}${d.mimeType === MIME_DOCX ? "/apercu" : ""}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-pine hover:underline"
              >
                Voir / imprimer
              </a>
              <a
                href={`/etudiants/${etudiantId}/documents/${d.id}?telecharger=1`}
                className="text-xs font-medium text-pine hover:underline"
              >
                Télécharger
              </a>
            </div>
          </div>
          <form id={`supprimer-document-${d.id}`} action={supprimerDocumentAction}>
            <input type="hidden" name="etudiantId" value={etudiantId} />
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
  );
}

const FIELDSET_CLASSES = "rounded-xl border border-border bg-bg-elevated p-5 shadow-card";
const LEGEND_CLASSES = "px-1 text-sm font-semibold text-ink";
const DT_CLASSES = "text-xs font-medium uppercase text-ink-faint";
const DD_CLASSES = "mt-0.5 text-sm text-ink";
// Titre de sous-section : palier intermédiaire entre le h1 de page (3xl) et
// le texte courant (sm), jusqu'ici sous-exploité dans l'appli (échelle
// réellement utilisée très concentrée sur xs/sm/3xl — voir audit UX). Sert de
// repère visuel fort sur une fiche volontairement longue plutôt que de
// masquer du contenu derrière de vrais onglets.
const ZONE_TITLE_CLASSES = "mb-3 font-display text-lg font-semibold text-pine-strong";
const ZONE_CLASSES = "scroll-mt-24 space-y-4";
const NAV_LINK_CLASSES =
  "rounded-md px-2.5 py-1.5 font-medium text-ink-muted transition-colors hover:bg-bg-sunken hover:text-pine-strong";

export default async function EtudiantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; cohorteEnAttente?: string }>;
}) {
  const session = await requireModule(Module.ETUDIANTS, "LECTURE");
  const [peutModifier, peutGererDocuments, peutCreerDossier, peutInscrire, peutSupprimer] =
    await Promise.all([
      peutAccederModule(session.role, Module.ETUDIANTS, "ECRITURE"),
      peutAccederModule(session.role, Module.DOCUMENTS, "ECRITURE"),
      peutAccederModule(session.role, Module.PAIEMENTS, "ECRITURE"),
      peutAccederModule(session.role, Module.ETUDIANTS, "ECRITURE"),
      peutAccederModule(session.role, Module.ETUDIANTS, "ECRITURE"),
    ]);
  const { id } = await params;
  const { error, ok, cohorteEnAttente } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  // Réservé Bureau/Administration à la demande explicite de l'association,
  // en dur (pas via Module.DOCUMENTS) — voir le commentaire des routes
  // recu/ et attestation/.
  const peutGenererPdf = session.role === Role.BUREAU || session.role === Role.ADMINISTRATION;

  const [etudiant, sections, anneeActive] = await Promise.all([
    prisma.etudiant.findUnique({
      where: { id },
      include: {
        responsables: true,
        sectionSouhaitee: true,
        creneauSouhaite: true,
        doublonPotentiel: { select: champsComparaisonDoublon },
        doublonsDetectes: {
          select: {
            ...champsComparaisonDoublon,
            _count: { select: { dossiersAnnuels: true, presences: true } },
          },
        },
        inscriptions: {
          include: {
            classe: {
              include: {
                cohorte: true,
                cours: { include: { section: true } },
                anneeScolaire: true,
              },
            },
          },
          orderBy: { classe: { anneeScolaire: { libelle: "desc" } } },
        },
        dossiersAnnuels: {
          include: {
            anneeScolaire: true,
            echeances: { include: { paiements: { include: { cheque: true, prelevement: true } } } },
          },
          orderBy: { anneeScolaire: { libelle: "desc" } },
        },
        // chequeId: null exclut la pièce d'identité d'un titulaire de chèque
        // tiers (voir Document.chequeId), qui n'appartient pas au dossier
        // documentaire de l'étudiant lui-même.
        documents: { where: { chequeId: null }, orderBy: { creeLe: "desc" } },
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

  // Tarif : une ligne par Section distincte suivie sur l'année active (une
  // même section peut regrouper plusieurs classes/cours), frais de
  // formation + frais de dossier de chaque Section (référentiel
  // Administration → Sections — voir aussi `tarifSuggereDossier`, qui
  // fait la même somme pour préremplir le dossier annuel). Affiché à titre
  // indicatif : le montant dû réel reste saisi à la main sur le dossier.
  const sectionsParId = new Map<
    string,
    (typeof etudiant.inscriptions)[number]["classe"]["cours"]["section"]
  >();
  for (const i of etudiant.inscriptions) {
    if (i.classe.anneeScolaireId === anneeActive?.id) {
      sectionsParId.set(i.classe.cours.section.id, i.classe.cours.section);
    }
  }
  const sectionsAvecTarif = [...sectionsParId.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  // Le dossier PDF est propre à une Section (tarifs, créneaux, règles de
  // remboursement différents par section) — jamais "le dossier de la fiche"
  // en général. On restreint donc le choix aux sections réellement suivies
  // par l'étudiant sur l'année active plutôt qu'à tout le référentiel
  // Sections de l'association ; repli sur la section souhaitée à la
  // préinscription si pas encore inscrit, puis sur tout le référentiel en
  // dernier recours.
  const sectionsPourDossier =
    sectionsAvecTarif.length > 0
      ? sectionsAvecTarif
      : etudiant.sectionSouhaitee
        ? [etudiant.sectionSouhaitee]
        : sections;
  const {
    formation: formationTarifSections,
    dossier: dossierTarifSections,
    total: totalTarifSections,
  } = cumulerTarif(sectionsAvecTarif);
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
  // L'affectation se fait au niveau de la Cohorte (bloc section + niveau +
  // jour), jamais Classe par Classe : en pratique un étudiant suit tout le
  // bloc, et affecterEtudiantACohorte (voir lib/cohortes.ts) fait le
  // fan-out vers chaque Classe du bloc pour l'année active, en respectant
  // la capacité/liste d'attente. Retirer une Classe précise reste possible
  // ci-dessous (ex. correction ponctuelle), sans repasser par ce chemin.
  const cohortesDejaAffecteesIds =
    anneeActiveId && peutInscrire
      ? new Set(
          (
            await prisma.affectationCohorte.findMany({
              where: { etudiantId: etudiant.id, anneeScolaireId: anneeActiveId },
              select: { cohorteId: true },
            })
          ).map((a) => a.cohorteId),
        )
      : new Set<string>();
  const [cohortesToutesSections, affectesParCohorte] =
    peutInscrire && anneeActiveId
      ? await Promise.all([
          prisma.cohorte.findMany({
            include: { section: { select: { id: true, nom: true } } },
            orderBy: [{ section: { nom: "asc" } }, { niveau: "asc" }, { jour: "asc" }],
          }),
          prisma.affectationCohorte.groupBy({
            by: ["cohorteId"],
            where: { anneeScolaireId: anneeActiveId, statut: "AFFECTE" },
            _count: { _all: true },
          }),
        ])
      : [[], []];
  const compteAffectesParCohorteId = new Map(
    affectesParCohorte.map((a) => [a.cohorteId, a._count._all]),
  );
  const cohortesDisponibles = cohortesToutesSections.filter(
    (c) => !cohortesDejaAffecteesIds.has(c.id),
  );
  // Groupé par Section pour l'affichage (un seul select, plutôt que deux
  // selects en cascade "Section" puis "Cohorte" qui portaient à confusion —
  // voir retours utilisateurs sur l'ancien select "Cours").
  const cohortesDisponiblesParSection = new Map<
    string,
    { nom: string; cohortes: typeof cohortesDisponibles }
  >();
  for (const c of cohortesDisponibles) {
    const groupe = cohortesDisponiblesParSection.get(c.section.id);
    if (groupe) {
      groupe.cohortes.push(c);
    } else {
      cohortesDisponiblesParSection.set(c.section.id, { nom: c.section.nom, cohortes: [c] });
    }
  }

  // Formation Jeunes (sexe, niveau scolaire) ne sert qu'au template de
  // dossier Jeunes (voir lib/dossier/templates/jeunes.hbs) : on ne l'affiche
  // que si on sait que ça s'applique. Fiche venue d'une préinscription
  // (sectionSouhaiteeId renseigné) → seulement si la section souhaitée est
  // du modèle Jeunes. Fiche créée directement par le staff → aucun signal
  // encore disponible, donc affiché par défaut plutôt que deviné à tort.
  const afficherFormationJeunes =
    !etudiant.sectionSouhaiteeId || etudiant.sectionSouhaitee?.modeleDossier === "JEUNES";

  const etudiantSupprimable =
    etudiant.dossiersAnnuels.length === 0 &&
    etudiant.inscriptions.length === 0 &&
    etudiant._count.presences === 0;

  const typesGeneres: readonly string[] = TYPES_DOCUMENTS_GENERES;
  const documentsGeneres = etudiant.documents.filter((d) => typesGeneres.includes(d.type));
  const documentsFournis = etudiant.documents.filter((d) => !typesGeneres.includes(d.type));

  // Bloc DOSSIER : statut Complet/Incomplet et détail par type requis, à ne
  // pas confondre avec le statut PAIEMENT plus bas (voir CLAUDE.md, retours
  // utilisateurs — deux situations distinctes).
  const statutDossier = statutDocumentsRequis(etudiant.documents);
  const dossierComplet = dossierDocumentaireComplet(etudiant.documents);

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
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconChip icon={Users} accent="sage" />
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
        </div>
        <div className="flex items-center gap-2">
          {peutModifier && etudiant.statutInscription === "PREINSCRIT" && (
            <form action={validerInscriptionAction}>
              <input type="hidden" name="etudiantId" value={etudiant.id} />
              <SubmitButton variant="primary" pendingLabel="Validation…">
                Valider l&apos;inscription
              </SubmitButton>
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
      {ok && !message && cohorteEnAttente === "1" && (
        <Alert variant="warning">
          Cohorte complète : l&apos;étudiant a été mis en liste d&apos;attente plutôt qu&apos;inscrit
          directement (voir Classes → Cohortes → « Voir l&apos;occupation et la liste d&apos;attente »).
        </Alert>
      )}
      {ok && !message && cohorteEnAttente !== "1" && <Alert variant="success">Modification enregistrée.</Alert>}

      {peutModifier && etudiant.doublonPotentiel && (
        <Alert variant="warning">
          <p>
            Doublon potentiel : cette préinscription ressemble à une fiche
            existante — même nom, prénom et date de naissance, ou mêmes
            coordonnées de responsable.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PopupDoublon
              doublon={etudiant}
              existant={etudiant.doublonPotentiel}
              fusionBloquee={etudiant.dossiersAnnuels.length > 0 || etudiant._count.presences > 0}
              fusionnerAction={fusionnerDoublonAction}
              confirmerHomonymeAction={confirmerHomonymeAction}
            />
            <Link
              href={`/etudiants/${etudiant.doublonPotentiel.id}`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Ouvrir la fiche conservée (nouvel onglet)
            </Link>
          </div>
        </Alert>
      )}

      {peutModifier && etudiant.doublonsDetectes.length > 0 && (
        <Alert variant="warning">
          <p>
            {etudiant.doublonsDetectes.length === 1
              ? "Une fiche en double pointe vers celle-ci."
              : `${etudiant.doublonsDetectes.length} fiches en double pointent vers celle-ci.`}{" "}
            Comparez chacune avant de fusionner ou de confirmer une
            homonymie.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {etudiant.doublonsDetectes.map((d) => (
              <PopupDoublon
                key={d.id}
                doublon={d}
                existant={etudiant}
                fusionBloquee={d._count.dossiersAnnuels > 0 || d._count.presences > 0}
                fusionnerAction={fusionnerDoublonAction}
                confirmerHomonymeAction={confirmerHomonymeAction}
                triggerLabel={`Comparer avec ${d.prenom} ${d.nom}`}
              />
            ))}
          </div>
        </Alert>
      )}

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

      {dossierAnneeActive &&
        (() => {
          const { du, encaisse, reste, statut } = statutCotisation(dossierAnneeActive);
          return (
            <Link
              href={`/paiements/${dossierAnneeActive.id}`}
              className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-sm shadow-card transition-colors hover:border-border-strong"
            >
              <span className="font-medium text-ink">Dossier {anneeActive!.libelle}</span>
              <span className="text-ink-muted">
                Dû <strong className="font-mono text-ink">{formaterMontant(du)}</strong>
              </span>
              <span className="text-ink-muted">
                Encaissé <strong className="font-mono text-ink">{formaterMontant(encaisse)}</strong>
              </span>
              <span className="text-ink-muted">
                Reste <strong className="font-mono text-ink">{formaterMontant(reste)}</strong>
              </span>
              <Badge variant={STATUT_COTISATION_VARIANTS[statut]}>{statut}</Badge>
              {dossierAnneeActive.nombreRelancesEnvoyees > 0 && (
                <Badge variant="warning">
                  Relance envoyée le{" "}
                  {new Date(dossierAnneeActive.derniereRelanceEnvoyeeLe!).toLocaleDateString("fr-FR")} (
                  {dossierAnneeActive.nombreRelancesEnvoyees})
                </Badge>
              )}
            </Link>
          );
        })()}

      <nav className="sticky top-16 z-[5] -mx-1 flex flex-wrap gap-1 border-b border-border bg-bg px-1 py-2 text-sm">
        <a href="#zone-profil" className={NAV_LINK_CLASSES}>
          Profil
        </a>
        <a href="#cours-suivis" className={NAV_LINK_CLASSES}>
          Cours suivis
        </a>
        <a href="#zone-finances" className={NAV_LINK_CLASSES}>
          Situation financière
        </a>
        {peutGererDocuments && (
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

          <div className="grid gap-6 lg:grid-cols-2">
          <fieldset className={FIELDSET_CLASSES}>
            <legend className={LEGEND_CLASSES}>Identité</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <ChampSelect
                label="Civilité"
                name="civilite"
                required
                defaultValue={etudiant.civilite ?? ""}
              >
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
                required
              />
              <Champ
                label="Ville de naissance"
                name="villeNaissance"
                defaultValue={etudiant.villeNaissance ?? ""}
                required
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
                required
                inputMode="tel"
                pattern={PATTERN_TELEPHONE}
                title="Numéro français, ex. 06 12 34 56 78"
                placeholder="06 12 34 56 78"
              />
              <Champ
                label="Téléphone fixe"
                name="telephoneFixe"
                defaultValue={etudiant.telephoneFixe ?? ""}
                inputMode="tel"
                pattern={PATTERN_TELEPHONE}
                title="Numéro français, ex. 04 91 23 45 67"
                placeholder="04 91 23 45 67"
              />
              <Champ
                label="Email"
                name="email"
                type="email"
                defaultValue={etudiant.email ?? ""}
                required
              />
              <Champ
                label="Contact d'urgence"
                name="contactUrgence"
                defaultValue={etudiant.contactUrgence ?? ""}
                placeholder="Nom Prénom Numéro de mobile"
              />
              <Champ
                label="Adresse"
                name="adresse"
                defaultValue={etudiant.adresse ?? ""}
                className="sm:col-span-2"
                required
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
                required
                inputMode="numeric"
                pattern={PATTERN_CODE_POSTAL}
                maxLength={5}
                title="5 chiffres"
                placeholder="69000"
              />
              <Champ label="Ville" name="ville" defaultValue={etudiant.ville ?? ""} required />
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
                required
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

          {afficherFormationJeunes && (
            <fieldset className={FIELDSET_CLASSES}>
              <legend className={LEGEND_CLASSES}>Formation Jeunes (optionnel)</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <ChampSelect label="Sexe" name="sexe" defaultValue={etudiant.sexe ?? ""}>
                  <option value="">—</option>
                  <option value="F">F</option>
                  <option value="M">M</option>
                </ChampSelect>
                <Champ
                  label="Niveau scolaire"
                  name="niveauScolaire"
                  defaultValue={etudiant.niveauScolaire ?? ""}
                  placeholder="ex. CM2"
                />
              </div>
            </fieldset>
          )}
          </div>

          <div className="flex justify-end">
            <SubmitButton variant="primary">
              Enregistrer les informations personnelles
            </SubmitButton>
          </div>
        </form>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
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
                  {etudiant.ville ? ` ${etudiant.ville}` : ""}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
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
                      <Champ
                        label="Téléphone"
                        name="telephone"
                        defaultValue={r.telephone ?? ""}
                        inputMode="tel"
                        pattern={PATTERN_TELEPHONE}
                        title="Numéro français, ex. 06 12 34 56 78"
                      />
                      <Champ
                        label="Téléphone professionnel"
                        name="telephoneProfessionnel"
                        defaultValue={r.telephoneProfessionnel ?? ""}
                        inputMode="tel"
                      />
                      <Champ label="Email" name="email" type="email" defaultValue={r.email ?? ""} />
                      <Champ label="Profession" name="profession" defaultValue={r.profession ?? ""} />
                      <Champ
                        label="Adresse"
                        name="adresse"
                        defaultValue={r.adresse ?? ""}
                        className="sm:col-span-2"
                      />
                      <Champ
                        label="Code postal"
                        name="codePostal"
                        defaultValue={r.codePostal ?? ""}
                        inputMode="numeric"
                        pattern={PATTERN_CODE_POSTAL}
                        maxLength={5}
                      />
                      <Champ label="Ville" name="ville" defaultValue={r.ville ?? ""} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <SubmitButton variant="secondary" size="sm">
                        Enregistrer
                      </SubmitButton>
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
              <Champ
                label="Téléphone"
                name="telephone"
                inputMode="tel"
                pattern={PATTERN_TELEPHONE}
                title="Numéro français, ex. 06 12 34 56 78"
              />
              <Champ label="Téléphone professionnel" name="telephoneProfessionnel" inputMode="tel" />
              <Champ label="Email" name="email" type="email" />
              <Champ label="Profession" name="profession" />
              <Champ label="Adresse" name="adresse" className="sm:col-span-2" />
              <Champ
                label="Code postal"
                name="codePostal"
                inputMode="numeric"
                pattern={PATTERN_CODE_POSTAL}
                maxLength={5}
              />
              <Champ label="Ville" name="ville" />
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton variant="secondary" size="sm">
                  Ajouter
                </SubmitButton>
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
              <strong>{etudiant.sectionSouhaitee.nom}</strong>
              {etudiant.creneauSouhaite && (
                <>
                  {" "}— créneau souhaité :{" "}
                  <strong>
                    {etudiant.creneauSouhaite.code} ({etudiant.creneauSouhaite.jour},{" "}
                    {etudiant.creneauSouhaite.horaire})
                  </strong>
                  {etudiant.creneauSouhaite.restriction && ` — ${etudiant.creneauSouhaite.restriction}`}
                </>
              )}
              {" "}— choisissez un cours ci-dessous pour l&apos;assigner.
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
                      {i.classe.cohorte.niveau && ` — ${i.classe.cohorte.niveau}`}
                    </Link>
                  </div>
                  <p className="text-xs text-ink-faint">
                    {JOUR_LABELS[i.classe.cohorte.jour]} {i.classe.heureDebut}–{i.classe.heureFin} ·{" "}
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

        {sectionsAvecTarif.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className={ZONE_TITLE_CLASSES}>Tarif {anneeActive?.libelle}</p>
            <ul className="mt-2 divide-y divide-border">
              {sectionsAvecTarif.map((s) => (
                <li key={s.id} className="py-1.5 text-sm">
                  <span className="text-ink">{s.nom}</span>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-ink-muted">
                    <span>Formation</span>
                    <span>{formaterMontant(Number(s.fraisFormation))}</span>
                  </div>
                </li>
              ))}
            </ul>
            {/* Frais de dossier compté une seule fois par étudiant, quel que
                soit le nombre de sections suivies — jamais un poste par
                section (voir cumulerTarif). */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-xs text-ink-muted">
              <span>Frais de dossier (unique)</span>
              <span>{formaterMontant(dossierTarifSections)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-sm font-semibold text-ink">
              <span>Total à payer</span>
              <span>{formaterMontant(totalTarifSections)}</span>
            </div>
          </div>
        )}

        {peutInscrire && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {cohortesDisponibles.length > 0 ? (
              <form action={affecterCohorteAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="etudiantId" value={etudiant.id} />
                <input type="hidden" name="anneeScolaireId" value={anneeActiveId ?? ""} />
                <ChampSelect
                  label="Cohorte"
                  name="cohorteId"
                  required
                  className="w-full max-w-sm"
                  hint="Inscrit à toutes les classes déjà créées pour ce bloc, ou met en liste d'attente si la cohorte est complète."
                >
                  {[...cohortesDisponiblesParSection.values()].map((groupe) => (
                    <optgroup key={groupe.nom} label={groupe.nom}>
                      {groupe.cohortes.map((c) => {
                        const compte = compteAffectesParCohorteId.get(c.id) ?? 0;
                        const occupation =
                          c.capaciteMax !== null
                            ? ` · ${compte}/${c.capaciteMax}${compte >= c.capaciteMax ? " (complet, liste d'attente)" : ""}`
                            : "";
                        return (
                          <option key={c.id} value={c.id}>
                            {c.niveau ? `${c.niveau} — ` : ""}
                            {JOUR_LABELS[c.jour]}
                            {occupation}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </ChampSelect>
                <SubmitButton variant="secondary" size="sm">
                  Inscrire
                </SubmitButton>
              </form>
            ) : (
              <EmptyState
                message={anneeActiveId ? "Aucune cohorte disponible." : "Aucune année scolaire active."}
              />
            )}
          </div>
        )}
      </Card>
      </section>

      <section id="zone-finances" className={ZONE_CLASSES}>
      <p className={ZONE_TITLE_CLASSES}>Situation financière</p>

      {peutCreerDossier && anneeActive && etudiant.statutInscription === "VALIDE" && !dossierAnneeActive && (
        <Card>
          <CardTitle>Dossier {anneeActive.libelle}</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">Aucun dossier pour cette année pour l&apos;instant.</p>
          <form action={creerDossierAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="etudiantId" value={etudiant.id} />
            <input type="hidden" name="anneeScolaireId" value={anneeActive.id} />
            <Champ
              label="Montant dû (€)"
              name="montantDu"
              type="number"
              step="0.01"
              min="0"
              required
              className="w-48"
              defaultValue={totalTarifSections > 0 ? totalTarifSections : undefined}
              hint={
                totalTarifSections > 0
                  ? `Suggéré : formation ${formaterMontant(formationTarifSections)} + dossier (unique) ${formaterMontant(dossierTarifSections)} = ${formaterMontant(totalTarifSections)} — modifiable.`
                  : undefined
              }
            />
            <SubmitMontantDu
              montantInputId="montantDu"
              montantSuggere={totalTarifSections > 0 ? totalTarifSections : null}
              pendingLabel="Création…"
            >
              Créer le dossier
            </SubmitMontantDu>
          </form>
        </Card>
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
              const { du, encaisse, reste, statut } = statutCotisation(d);
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
                    <span>Encaissé {formaterMontant(encaisse)}</span>
                    <span>Reste {formaterMontant(reste)}</span>
                    <Badge variant={statutVariant}>{statut}</Badge>
                    {peutGenererPdf && (
                      <>
                        <a
                          href={`/etudiants/${etudiant.id}/recu/${d.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-pine hover:underline"
                        >
                          Reçu (voir / imprimer)
                        </a>
                        <a
                          href={`/etudiants/${etudiant.id}/attestation/${d.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-pine hover:underline"
                        >
                          Attestation (voir / imprimer)
                        </a>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      </section>

      {peutGererDocuments && (
      <section id="zone-documents" className={ZONE_CLASSES}>
      <p className={ZONE_TITLE_CLASSES}>Documents</p>
        <Card>
          <CardTitle>Dossier d&apos;inscription</CardTitle>
          <p className="mb-3 mt-1 text-xs text-ink-faint">
            Génère le dossier d&apos;inscription en PDF (modèle Adultes ou
            Jeunes, tarifs et créneaux propres à la section suivie, mise en
            page identique à l&apos;impression) à partir des informations de
            l&apos;étudiant. Le fichier est conservé et réapparaît dans les
            documents ci-dessous.
          </p>
          {sectionsPourDossier.length === 0 ? (
            <EmptyState message="Aucune section enregistrée." />
          ) : (
            <form className="flex flex-wrap items-end gap-2" action={`/etudiants/${etudiant.id}/dossier`}>
              {sectionsPourDossier.length === 1 ? (
                <input type="hidden" name="sectionId" value={sectionsPourDossier[0].id} />
              ) : (
                <ChampSelect
                  label="Section"
                  name="sectionId"
                  required
                  defaultValue={sectionsPourDossier[0]?.id}
                  hint="Plusieurs sections suivies par cet étudiant : chacune a son propre gabarit et tarifs."
                >
                  {sectionsPourDossier.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </ChampSelect>
              )}
              <button
                type="submit"
                formTarget="_blank"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Voir / imprimer
              </button>
              <button
                type="submit"
                formTarget="_blank"
                name="dl"
                value="1"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Télécharger le PDF
              </button>
            </form>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Documents</CardTitle>
            <Badge variant={dossierComplet ? "success" : "danger"}>
              {dossierComplet ? "Complet" : "Incomplet"}
            </Badge>
          </div>
          <dl className="mt-3 divide-y divide-border">
            {TYPES_DOCUMENTS_REQUIS.map((type) => (
              <div key={type} className="flex items-center justify-between py-1.5 text-sm">
                <dt className="text-ink">{TYPE_DOCUMENT_LABELS[type]}</dt>
                <dd>
                  <Badge variant={STATUT_DOCUMENT_VARIANTS[statutDossier[type]]}>
                    {STATUT_DOCUMENT_LABELS[statutDossier[type]]}
                  </Badge>
                </dd>
              </div>
            ))}
          </dl>
          {etudiant.documents.length === 0 ? (
            <div className="mt-4 border-t border-border pt-4">
              <EmptyState message="Aucun document pour l'instant." />
            </div>
          ) : (
            <div className="mb-4 mt-4 space-y-5 border-t border-border pt-4">
              <div>
                <p className={ZONE_TITLE_CLASSES}>Documents fournis</p>
                {documentsFournis.length === 0 ? (
                  <p className="text-sm text-ink-faint">Aucun document fourni pour l&apos;instant.</p>
                ) : (
                  <ListeDocuments documents={documentsFournis} etudiantId={etudiant.id} />
                )}
              </div>
              {documentsGeneres.length > 0 && (
                <div>
                  <p className={ZONE_TITLE_CLASSES}>Documents générés (dossier, reçus, attestations)</p>
                  <ListeDocuments documents={documentsGeneres} etudiantId={etudiant.id} />
                </div>
              )}
            </div>
          )}
          <form
            action={televerserDocumentAction}
            className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
          >
            <input type="hidden" name="etudiantId" value={etudiant.id} />
            <ChampsTeleversementDocument
              typesDocument={Object.values(TypeDocument)
                .filter((t) => t !== "DOSSIER_GENERE")
                .map((t) => ({ value: t, label: TYPE_DOCUMENT_LABELS[t] }))}
              typesPieceIdentite={Object.entries(TYPE_PIECE_IDENTITE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Fichier</label>
              <input
                type="file"
                name="fichier"
                required
                className="rounded-md border border-field-border bg-field-bg px-3 py-1.5 text-sm text-ink file:mr-2 file:rounded file:border-0 file:bg-pine-soft file:px-2 file:py-1 file:text-xs file:text-pine-strong"
              />
            </div>
            <SubmitButton variant="secondary" size="sm">
              <Upload size={13} aria-hidden />
              Téléverser
            </SubmitButton>
          </form>
        </Card>
      </section>
      )}
    </div>
  );
}
