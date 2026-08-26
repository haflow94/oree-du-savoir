import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { estAdministratif } from "@/lib/acces-presence";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import { enseignantsActifsAvecSections } from "@/lib/enseignants";
import { filtreParSection } from "@/lib/sections-etudiant";
import {
  genererSeancesAction,
  inscrireEtudiantAction,
  retirerEtudiantAction,
} from "../../presences/actions";
import { modifierClasseAction, supprimerClasseAction } from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect, CONTROL_CLASSES } from "@/components/ui/champ";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const LABEL_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Jour et horaires sont obligatoires.",
  CLASSE_UTILISEE:
    "Impossible de supprimer : des séances ou des inscriptions existent déjà pour cette classe.",
  CLASSE_INTROUVABLE: "Cette classe n'existe plus.",
  INSCRIPTION_INVALIDE: "Sélectionnez un étudiant à inscrire.",
  CLASSE_DEJA_EXISTANTE:
    "Une classe identique (même cours, niveau et session) existe déjà pour cette année scolaire.",
};

export default async function ClasseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    ok?: string;
    etudQ?: string;
  }>;
}) {
  const session = await requireModule(Module.CLASSES, "LECTURE");
  const peutGerer = await peutAccederModule(session.role, Module.CLASSES, "ECRITURE");
  const { id } = await params;
  const { error, ok, etudQ } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;
  const etudRecherche = etudQ?.trim() ?? "";

  const classe = await prisma.classe.findUnique({
    where: { id },
    include: {
      cours: true,
      anneeScolaire: true,
      enseignants: { include: { utilisateur: true } },
      inscriptions: {
        include: { etudiant: true },
        orderBy: { creeLe: "asc" },
      },
      _count: { select: { seances: true, inscriptions: true } },
    },
  });

  if (!classe) {
    notFound();
  }

  // Salles déjà utilisées par d'autres classes, proposées via un <datalist> :
  // pas de référentiel Salle séparé (l'appli n'en a pas besoin ailleurs), mais
  // un typo dans ce champ casse le rapprochement du QR de salle (voir
  // src/lib/qr.ts) — ce datalist réduit ce risque tout en laissant la saisie
  // libre pour une salle réellement nouvelle.
  const sallesDistinctes = await prisma.classe.findMany({
    where: { salle: { not: null } },
    distinct: ["salle"],
    select: { salle: true },
    orderBy: { salle: "asc" },
  });

  const administratif = estAdministratif(session.role);
  const peutInscrire = await peutAccederModule(session.role, Module.ETUDIANTS, "ECRITURE");

  const enseignantsAssignes = new Set(classe.enseignants.map((e) => e.utilisateurId));
  // Ne proposer que les enseignants déjà rattachés à la section de ce cours
  // (voir lib/enseignants.ts) — sans quoi la liste mélangeait tous les
  // enseignants actifs, toutes sections confondues. Un enseignant déjà
  // assigné à cette classe reste affiché même hors filtre, pour ne jamais
  // perdre la possibilité de le décocher.
  const enseignantsDisponibles = peutGerer
    ? (await enseignantsActifsAvecSections()).filter(
        (e) =>
          enseignantsAssignes.has(e.id) ||
          e.sectionIds.length === 0 ||
          e.sectionIds.includes(classe.cours.sectionId),
      )
    : [];
  const peutSupprimer = classe._count.seances === 0 && classe._count.inscriptions === 0;

  const dejaInscrits = new Set(classe.inscriptions.map((i) => i.etudiantId));
  // Ne proposer que les étudiants de la section de cette classe (déjà inscrits
  // à une autre classe de la section cette année, ou en attente d'affectation
  // avec cette section comme souhait de préinscription) : sans ce filtre, le
  // menu déroulant mélangeait tous les étudiants de l'appli, toutes sections
  // confondues (voir filtreParSection dans lib/sections-etudiant.ts).
  const filtreSection = {
    OR: [
      filtreParSection(classe.anneeScolaireId, classe.cours.sectionId),
      { sectionSouhaiteeId: classe.cours.sectionId },
    ],
  };
  const etudiantsDisponibles = peutInscrire
    ? (
        await prisma.etudiant.findMany({
          where: {
            AND: [
              filtreSection,
              etudRecherche
                ? {
                    OR: [
                      { nom: { contains: etudRecherche, mode: "insensitive" } },
                      { prenom: { contains: etudRecherche, mode: "insensitive" } },
                    ],
                  }
                : {},
            ],
          },
          orderBy: [{ nom: "asc" }, { prenom: "asc" }],
        })
      ).filter((e) => !dejaInscrits.has(e.id))
    : [];

  // Un scanner de QR sur téléphone n'ouvre un lien que si le contenu est une
  // URL absolue (schéma + hôte) : un simple chemin relatif comme "/qr/xxx"
  // s'affiche en texte brut, sans action possible. Par défaut on lit l'hôte
  // réel de la requête (peu importe IP/nom de domaine, cible de déploiement
  // non figée — voir DEPLOIEMENT.md), mais si la page est ouverte via
  // "localhost" ou un tunnel/nom interne (poste du staff en SSH sur le
  // serveur, par ex.), ce host n'est pas joignable depuis un téléphone sur le
  // même réseau : PUBLIC_HOST permet de forcer l'IP/le nom réellement
  // accessible depuis la salle (voir .env.example).
  const enTetes = await headers();
  const hote = process.env.PUBLIC_HOST || enTetes.get("host") || "localhost:3000";
  const protocole = enTetes.get("x-forwarded-proto") ?? "http";
  // Une salle accueille en général plusieurs classes différentes au fil
  // d'une même journée, et l'association ne peut afficher/imprimer qu'un
  // seul QR fixe par salle (jamais échangé entre les cours) : le QR pointe
  // donc sur la salle plutôt que sur cette classe précise dès qu'une salle
  // est renseignée (résolution du bon cours à l'heure du scan, voir
  // src/lib/qr.ts) ; le QR par classe ne reste utile que sans salle définie.
  const cheminQr = classe.salle
    ? `/qr-salle/${encodeURIComponent(classe.salle)}`
    : `/qr/${classe.qrToken}`;
  const urlQr = `${protocole}://${hote}${cheminQr}`;
  const qrSvg = await QRCode.toString(urlQr, {
    type: "svg",
    margin: 1,
    width: 160,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <datalist id="salles-existantes">
        {sallesDistinctes.map(
          (s) => s.salle && <option key={s.salle} value={s.salle} />,
        )}
      </datalist>
      <div>
        <BackLink href="/classes" label="Classes" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
          {classe.cours.nom}
          {classe.niveau && ` — ${classe.niveau}`}
        </h1>
        <p className="text-sm text-ink-muted">
          {JOUR_LABELS[classe.jour]} {classe.heureDebut}–{classe.heureFin}
          {classe.salle && ` · ${classe.salle}`}
          {` · ${classe.anneeScolaire.libelle}`}
          {classe.semestre && ` · semestre ${classe.semestre}`}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Enseignant(s) :{" "}
          {classe.enseignants.length > 0
            ? classe.enseignants
                .map((e) => `${e.utilisateur.prenom} ${e.utilisateur.nom}`)
                .join(", ")
            : "—"}
        </p>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      {peutGerer && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle>Modifier la classe</CardTitle>
            <div className="flex items-center gap-3">
              <Link
                href={`/classes/nouveau?depuis=${classe.id}`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Dupliquer cette classe
              </Link>
              <form id="supprimer-classe" action={supprimerClasseAction}>
                <input type="hidden" name="classeId" value={classe.id} />
              </form>
              <ConfirmDialog
                formId="supprimer-classe"
                triggerLabel="Supprimer la classe"
                title="Supprimer cette classe ?"
                description="Cette action supprime définitivement la classe et ne peut pas être annulée."
                confirmLabel="Supprimer définitivement"
                disabled={!peutSupprimer}
                disabledTitle="Des séances ou des inscriptions existent déjà : impossible de supprimer cette classe."
              />
            </div>
          </div>
          <form action={modifierClasseAction} className="space-y-4">
            <input type="hidden" name="classeId" value={classe.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Champ label="Niveau" name="niveau" defaultValue={classe.niveau ?? ""} />
              <ChampSelect label="Semestre (optionnel)" name="semestre" defaultValue={classe.semestre ?? ""}>
                <option value="">Toute l&apos;année</option>
                <option value="1">Semestre 1</option>
                <option value="2">Semestre 2</option>
              </ChampSelect>
              <Champ
                label="Salle"
                name="salle"
                list="salles-existantes"
                defaultValue={classe.salle ?? ""}
              />
              <ChampSelect label="Jour" name="jour" required defaultValue={classe.jour}>
                {JOURS_ORDONNES.map((j) => (
                  <option key={j} value={j}>
                    {JOUR_LABELS[j]}
                  </option>
                ))}
              </ChampSelect>
              <Champ
                label="Heure de début"
                type="time"
                name="heureDebut"
                required
                defaultValue={classe.heureDebut}
              />
              <Champ
                label="Heure de fin"
                type="time"
                name="heureFin"
                required
                defaultValue={classe.heureFin}
              />
            </div>

            <div>
              <label className={LABEL_CLASSES}>Enseignant(s)</label>
              {enseignantsDisponibles.length === 0 ? (
                <p className="text-sm text-ink-faint">Aucun compte Enseignant actif.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {enseignantsDisponibles.map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-ink-muted"
                    >
                      <input
                        type="checkbox"
                        name="enseignants"
                        value={e.id}
                        defaultChecked={enseignantsAssignes.has(e.id)}
                      />
                      {e.prenom} {e.nom}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="primary">
                Enregistrer
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>
            {classe.salle ? `QR de la salle ${classe.salle}` : "QR d'accès à la séance du jour"}
          </CardTitle>
          <p className="mt-1 text-xs text-ink-faint">
            {classe.salle
              ? "Ce même QR sert pour tous les cours de cette salle : il peut rester affiché en permanence, le bon cours est retrouvé automatiquement à l'heure du scan (ou proposé au choix si plusieurs cours s'y suivent). Le QR ne connecte personne : l'enseignant doit être authentifié."
              : "À afficher en salle. Le QR ne connecte personne : l'enseignant doit être authentifié."}
          </p>
          <div
            className="mt-3 inline-block rounded-lg bg-bg-elevated p-2 ring-1 ring-border"
            // SVG produit côté serveur par la bibliothèque qrcode à partir
            // d'un chemin interne : aucune donnée utilisateur n'y transite.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 break-all font-mono text-xs text-ink-faint">{urlQr}</p>
        </Card>

        <Card>
          <CardTitle>Séances</CardTitle>
          <p className="mt-1 text-3xl font-bold text-ink">{classe._count.seances}</p>
          <p className="mt-1 text-xs text-ink-faint">
            Générées depuis le planning sur {classe.anneeScolaire.libelle}, en
            sautant les périodes de fermeture.
          </p>
          {administratif && (
            <form action={genererSeancesAction} className="mt-3">
              <input type="hidden" name="classeId" value={classe.id} />
              <Button type="submit" variant="secondary">
                Générer les séances manquantes
              </Button>
            </form>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>Étudiants inscrits ({classe.inscriptions.length})</CardTitle>

        {peutInscrire && (
          <div className="mt-3 space-y-3 border-b border-border pb-4">
            <form className="flex flex-wrap gap-2" action={`/classes/${classe.id}`} method="GET">
              <input
                type="search"
                name="etudQ"
                defaultValue={etudRecherche}
                placeholder="Filtrer par nom ou prénom…"
                className={CONTROL_CLASSES}
              />
              <Button type="submit" variant="secondary">
                Filtrer
              </Button>
            </form>

            {etudiantsDisponibles.length > 0 ? (
              <form action={inscrireEtudiantAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="origine" value="classe" />
                <input type="hidden" name="classeId" value={classe.id} />
                <select name="etudiantId" required className={`w-full max-w-xs ${CONTROL_CLASSES}`}>
                  {etudiantsDisponibles.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nom} {e.prenom}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="secondary">
                  Inscrire
                </Button>
              </form>
            ) : (
              <p className="text-sm text-ink-faint">
                {etudRecherche
                  ? "Aucun étudiant ne correspond à ce filtre."
                  : "Aucun étudiant de cette section disponible."}
              </p>
            )}
          </div>
        )}

        {classe.inscriptions.length === 0 ? (
          <div className="mt-3">
            <EmptyState message="Aucun étudiant inscrit." />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {classe.inscriptions.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/etudiants/${i.etudiantId}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {i.etudiant.prenom} {i.etudiant.nom}
                  </Link>
                  {i.etudiant.statutInscription === "PREINSCRIT" && (
                    <Badge variant="info">Préinscrit</Badge>
                  )}
                </div>
                {peutInscrire && (
                  <form action={retirerEtudiantAction}>
                    <input type="hidden" name="origine" value="classe" />
                    <input type="hidden" name="inscriptionId" value={i.id} />
                    <input type="hidden" name="classeId" value={classe.id} />
                    <input type="hidden" name="etudiantId" value={i.etudiantId} />
                    <button type="submit" className="text-xs font-medium text-rust hover:underline">
                      Retirer
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
