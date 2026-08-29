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
import {
  modifierClasseAction,
  supprimerClasseAction,
  creerCohorteAction,
  supprimerCohorteAction,
  modifierMembresCohorteAction,
  affecterCohorteAction,
} from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect, CONTROL_CLASSES } from "@/components/ui/champ";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
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
  COHORTE_NOM_MANQUANT: "Donnez un nom à la cohorte.",
  COHORTE_DEJA_EXISTANTE: "Une cohorte porte déjà ce nom pour cette classe.",
  COHORTE_INTROUVABLE: "Cette cohorte n'existe plus.",
  COHORTE_VIDE: "Ajoutez au moins un étudiant à la cohorte avant de l'affecter.",
  CLASSE_CIBLE_INVALIDE: "Sélectionnez une classe à laquelle affecter la cohorte.",
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
      salle: true,
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

  const salles = await prisma.salle.findMany({
    orderBy: { nom: "asc" },
    select: { id: true, nom: true },
  });

  const administratif = estAdministratif(session.role);
  const peutInscrire = await peutAccederModule(session.role, Module.ETUDIANTS, "ECRITURE");

  // Cohortes de cette classe : raccourci pour affecter plusieurs étudiants
  // d'un coup à une autre classe (voir actions.ts#affecterCohorteAction),
  // sans confondre avec les inscriptions individuelles ci-dessous.
  const cohortes = peutInscrire
    ? await prisma.cohorte.findMany({
        where: { classeId: id },
        include: { membres: { include: { etudiant: true }, orderBy: { ajouteLe: "asc" } } },
        orderBy: { creeLe: "asc" },
      })
    : [];
  // Classes cibles proposées pour l'affectation en masse : la même année
  // scolaire que la classe courante (portée la plus pertinente), à
  // l'exclusion d'elle-même — un étudiant peut suivre plusieurs cours, donc
  // aucune restriction de section ici (contrairement à l'inscription
  // individuelle ci-dessous, filtrée par section pour rester lisible).
  const classesCibles =
    peutInscrire && cohortes.length > 0
      ? await prisma.classe.findMany({
          where: { anneeScolaireId: classe.anneeScolaireId, id: { not: classe.id } },
          include: { cours: true },
          orderBy: [{ cours: { nom: "asc" } }, { niveau: "asc" }],
        })
      : [];

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
  // Le QR est désormais permanent par salle (voir Salle.qrToken et
  // src/lib/qr.ts), pas par classe : simple rappel/raccourci vers celui de
  // la salle assignée, géré depuis Administration → Salles (où il peut aussi
  // être imprimé sans passer par une classe précise).
  const urlQr = classe.salle ? `${protocole}://${hote}/qr/${classe.salle.qrToken}` : null;
  const qrSvg = urlQr ? await QRCode.toString(urlQr, { type: "svg", margin: 1, width: 160 }) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <BackLink href="/classes" label="Classes" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">
          {classe.cours.nom}
          {classe.niveau && ` — ${classe.niveau}`}
        </h1>
        <p className="text-sm text-ink-muted">
          {JOUR_LABELS[classe.jour]} {classe.heureDebut}–{classe.heureFin}
          {classe.salle && ` · ${classe.salle.nom}`}
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
              <ChampSelect label="Salle (optionnel)" name="salleId" defaultValue={classe.salleId ?? ""}>
                <option value="">Aucune salle</option>
                {salles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </ChampSelect>
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
              <SubmitButton variant="primary">
                Enregistrer
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>{classe.salle ? `QR de la salle ${classe.salle.nom}` : "QR d'accès"}</CardTitle>
          {classe.salle && qrSvg ? (
            <>
              <p className="mt-1 text-xs text-ink-faint">
                Ce même QR sert pour tous les cours de cette salle : il peut
                rester affiché en permanence, le bon cours est retrouvé
                automatiquement à l&apos;heure du scan (ou proposé au choix
                si plusieurs cours s&apos;y suivent). Le QR ne connecte
                personne : l&apos;enseignant doit être authentifié.
              </p>
              <div
                className="mt-3 inline-block rounded-lg bg-bg-elevated p-2 ring-1 ring-border"
                // SVG produit côté serveur par la bibliothèque qrcode à
                // partir d'un chemin interne : aucune donnée utilisateur n'y
                // transite.
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p className="mt-2 break-all font-mono text-xs text-ink-faint">{urlQr}</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-ink-faint">
              Aucune salle assignée à cette classe : sélectionnez-en une
              ci-dessus pour afficher son QR, ou gérez les salles depuis
              Administration → Salles.
            </p>
          )}
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
              <SubmitButton variant="secondary">
                Générer les séances manquantes
              </SubmitButton>
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
              <SubmitButton variant="secondary">
                Filtrer
              </SubmitButton>
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
                <SubmitButton variant="secondary">
                  Inscrire
                </SubmitButton>
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

      {peutInscrire && (
        <Card>
          <CardTitle>Cohortes</CardTitle>
          <p className="mt-1 text-xs text-ink-faint">
            Un groupe nommé d&apos;étudiants de cette classe, pour les affecter
            d&apos;un coup à un autre cours au lieu de les sélectionner un par
            un. Chaque affectation reste ensuite modifiable individuellement
            depuis la fiche de la classe cible.
          </p>

          <form action={creerCohorteAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="classeId" value={classe.id} />
            <input
              type="text"
              name="nom"
              placeholder="Nom de la cohorte (ex. Groupe A)"
              required
              className={`w-64 ${CONTROL_CLASSES}`}
            />
            <SubmitButton variant="secondary">
              Créer la cohorte
            </SubmitButton>
          </form>

          {cohortes.length === 0 ? (
            <div className="mt-3">
              <EmptyState message="Aucune cohorte pour cette classe." />
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {cohortes.map((cohorte) => {
                const membresIds = new Set(cohorte.membres.map((m) => m.etudiantId));
                return (
                  <li key={cohorte.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-semibold text-ink">{cohorte.nom}</span>
                        <span className="ml-2 text-xs text-ink-faint">
                          {cohorte.membres.length} étudiant{cohorte.membres.length > 1 ? "s" : ""}
                        </span>
                        {cohorte.membres.length > 0 && (
                          <p className="mt-1 text-xs text-ink-muted">
                            {cohorte.membres
                              .map((m) => `${m.etudiant.prenom} ${m.etudiant.nom}`)
                              .join(", ")}
                          </p>
                        )}
                      </div>
                      <div>
                        <form id={`supprimer-cohorte-${cohorte.id}`} action={supprimerCohorteAction}>
                          <input type="hidden" name="classeId" value={classe.id} />
                          <input type="hidden" name="cohorteId" value={cohorte.id} />
                        </form>
                        <ConfirmDialog
                          formId={`supprimer-cohorte-${cohorte.id}`}
                          triggerLabel="Supprimer"
                          title="Supprimer cette cohorte ?"
                          description="Les étudiants déjà affectés via cette cohorte restent inscrits : seul le groupe est supprimé."
                          confirmLabel="Supprimer"
                        />
                      </div>
                    </div>

                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-pine">
                        Gérer les membres
                      </summary>
                      {classe.inscriptions.length === 0 ? (
                        <p className="mt-2 text-xs text-ink-faint">
                          Inscrivez d&apos;abord des étudiants à cette classe.
                        </p>
                      ) : (
                        <form action={modifierMembresCohorteAction} className="mt-2 space-y-2">
                          <input type="hidden" name="classeId" value={classe.id} />
                          <input type="hidden" name="cohorteId" value={cohorte.id} />
                          <div className="flex flex-wrap gap-2">
                            {classe.inscriptions.map((i) => (
                              <label
                                key={i.etudiantId}
                                className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs text-ink-muted"
                              >
                                <input
                                  type="checkbox"
                                  name="etudiants"
                                  value={i.etudiantId}
                                  defaultChecked={membresIds.has(i.etudiantId)}
                                />
                                {i.etudiant.prenom} {i.etudiant.nom}
                              </label>
                            ))}
                          </div>
                          <SubmitButton variant="secondary" size="sm">
                            Enregistrer les membres
                          </SubmitButton>
                        </form>
                      )}
                    </details>

                    {classesCibles.length > 0 && (
                      <form
                        action={affecterCohorteAction}
                        className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
                      >
                        <input type="hidden" name="classeId" value={classe.id} />
                        <input type="hidden" name="cohorteId" value={cohorte.id} />
                        <select
                          name="classeCibleId"
                          required
                          className={`w-full max-w-xs ${CONTROL_CLASSES}`}
                        >
                          <option value="">Affecter à…</option>
                          {classesCibles.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.cours.nom}
                              {c.niveau ? ` — ${c.niveau}` : ""} ({JOUR_LABELS[c.jour]} {c.heureDebut})
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="primary" size="sm">
                          Affecter la cohorte
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
