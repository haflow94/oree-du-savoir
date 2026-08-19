import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, hasRole } from "@/lib/roles";
import { estAdministratif } from "@/lib/acces-presence";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import { anneeScolaireActiveId, filtreParSection } from "@/lib/sections-etudiant";
import {
  genererSeancesAction,
  inscrireEtudiantAction,
  retirerEtudiantAction,
} from "../../presences/actions";
import { modifierClasseAction, supprimerClasseAction } from "./actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PEUT_GERER = [Role.ADMINISTRATION, Role.BUREAU];
const CONTROL_CLASSES =
  "rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft";
const LABEL_CLASSES = "mb-1 block text-xs font-medium text-ink-muted";

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Jour et horaires sont obligatoires.",
  CLASSE_UTILISEE:
    "Impossible de supprimer : des séances ou des inscriptions existent déjà pour cette classe.",
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
    etudSectionId?: string;
  }>;
}) {
  const session = await requireSession();
  const peutGerer = hasRole(session.role, PEUT_GERER);
  const { id } = await params;
  const { error, ok, etudQ, etudSectionId } = await searchParams;
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
        orderBy: { etudiant: { nom: "asc" } },
      },
      _count: { select: { seances: true, inscriptions: true } },
    },
  });

  if (!classe) {
    notFound();
  }

  const administratif = estAdministratif(session.role);
  const peutInscrire = administratif || session.role === Role.ACCUEIL;

  const enseignantsDisponibles = peutGerer
    ? await prisma.utilisateur.findMany({
        where: { role: Role.ENSEIGNANT, actif: true },
        orderBy: [{ nom: "asc" }],
      })
    : [];
  const enseignantsAssignes = new Set(classe.enseignants.map((e) => e.utilisateurId));
  const peutSupprimer = classe._count.seances === 0 && classe._count.inscriptions === 0;

  const dejaInscrits = new Set(classe.inscriptions.map((i) => i.etudiantId));
  const [sectionsFiltre, anneeActiveId] = peutInscrire
    ? await Promise.all([
        prisma.section.findMany({ orderBy: { nom: "asc" } }),
        anneeScolaireActiveId(),
      ])
    : [[], null];
  const etudiantsDisponibles = peutInscrire
    ? (
        await prisma.etudiant.findMany({
          where: {
            ...(etudRecherche
              ? {
                  OR: [
                    { nom: { contains: etudRecherche, mode: "insensitive" } },
                    { prenom: { contains: etudRecherche, mode: "insensitive" } },
                  ],
                }
              : {}),
            ...(etudSectionId && anneeActiveId
              ? filtreParSection(anneeActiveId, etudSectionId)
              : {}),
          },
          orderBy: [{ nom: "asc" }, { prenom: "asc" }],
        })
      ).filter((e) => !dejaInscrits.has(e.id))
    : [];

  // Le QR pointe vers une URL relative : il reste valable quel que soit le
  // nom d'hôte du serveur (voir DEPLOIEMENT.md, cible non figée).
  const cheminQr = `/qr/${classe.qrToken}`;
  const qrSvg = await QRCode.toString(cheminQr, {
    type: "svg",
    margin: 1,
    width: 160,
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/classes" className="text-sm text-ink-muted hover:underline">
          ← Classes
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold text-pine-strong">
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
            <>
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
            </>
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
              <Champ label="Salle" name="salle" defaultValue={classe.salle ?? ""} />
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
              <Champ
                label="Capacité"
                type="number"
                min={0}
                name="capacite"
                defaultValue={classe.capacite ?? ""}
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
          <CardTitle>QR d&apos;accès à la séance du jour</CardTitle>
          <p className="mt-1 text-xs text-ink-faint">
            À afficher en salle. Le QR ne connecte personne : l&apos;enseignant
            doit être authentifié.
          </p>
          <div
            className="mt-3 inline-block rounded-lg bg-bg-elevated p-2 ring-1 ring-border"
            // SVG produit côté serveur par la bibliothèque qrcode à partir
            // d'un chemin interne : aucune donnée utilisateur n'y transite.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 break-all font-mono text-xs text-ink-faint">{cheminQr}</p>
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
        <CardTitle>
          Étudiants inscrits ({classe.inscriptions.length}
          {classe.capacite ? ` / ${classe.capacite}` : ""})
        </CardTitle>

        {classe.inscriptions.length === 0 ? (
          <div className="mt-3">
            <EmptyState message="Aucun étudiant inscrit." />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {classe.inscriptions.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2.5">
                <Link
                  href={`/etudiants/${i.etudiantId}`}
                  className="text-sm font-medium text-ink hover:underline"
                >
                  {i.etudiant.prenom} {i.etudiant.nom}
                </Link>
                {peutInscrire && (
                  <form action={retirerEtudiantAction}>
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

        {peutInscrire && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <form className="flex flex-wrap gap-2" action={`/classes/${classe.id}`} method="GET">
              <input
                type="search"
                name="etudQ"
                defaultValue={etudRecherche}
                placeholder="Filtrer par nom ou prénom…"
                className={CONTROL_CLASSES}
              />
              <select
                name="etudSectionId"
                defaultValue={etudSectionId ?? ""}
                className={CONTROL_CLASSES}
              >
                <option value="">Toutes les sections</option>
                {sectionsFiltre.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary">
                Filtrer
              </Button>
            </form>

            {etudiantsDisponibles.length > 0 ? (
              <form action={inscrireEtudiantAction} className="flex flex-wrap gap-2">
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
                {etudRecherche || etudSectionId
                  ? "Aucun étudiant ne correspond à ce filtre."
                  : "Aucun étudiant disponible."}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
