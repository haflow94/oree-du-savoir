import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, hasRole } from "@/lib/roles";
import { estAdministratif } from "@/lib/acces-presence";
import { JOURS_ORDONNES, JOUR_LABELS } from "@/lib/planning";
import {
  genererSeancesAction,
  inscrireEtudiantAction,
  retirerEtudiantAction,
} from "../../presences/actions";
import { modifierClasseAction, supprimerClasseAction } from "./actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ, ChampSelect } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  }>;
}) {
  const session = await requireSession();
  const peutGerer = hasRole(session.role, PEUT_GERER);
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
        // Confirmées d'abord, puis liste d'attente (ordre alphabétique déjà
        // exact ici : "CONFIRMEE" < "LISTE_ATTENTE") ; par ancienneté à
        // l'intérieur de chaque groupe pour refléter l'ordre d'arrivée.
        orderBy: [{ statut: "asc" }, { creeLe: "asc" }],
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
  const inscriptionsConfirmees = classe.inscriptions.filter((i) => i.statut === "CONFIRMEE");
  const inscriptionsEnAttente = classe.inscriptions.filter((i) => i.statut === "LISTE_ATTENTE");

  const dejaInscrits = new Set(classe.inscriptions.map((i) => i.etudiantId));
  const etudiantsDisponibles = peutInscrire
    ? (
        await prisma.etudiant.findMany({
          where: etudRecherche
            ? {
                OR: [
                  { nom: { contains: etudRecherche, mode: "insensitive" } },
                  { prenom: { contains: etudRecherche, mode: "insensitive" } },
                ],
              }
            : undefined,
          orderBy: [{ nom: "asc" }, { prenom: "asc" }],
        })
      ).filter((e) => !dejaInscrits.has(e.id))
    : [];

  // Un scanner de QR sur téléphone n'ouvre un lien que si le contenu est une
  // URL absolue (schéma + hôte) : un simple chemin relatif comme "/qr/xxx"
  // s'affiche en texte brut, sans action possible. On lit donc l'hôte réel
  // de la requête (peu importe IP/nom de domaine, cible de déploiement non
  // figée — voir DEPLOIEMENT.md) plutôt que de coder une URL en dur.
  const enTetes = await headers();
  const hote = enTetes.get("host") ?? "localhost:3000";
  const protocole = enTetes.get("x-forwarded-proto") ?? "http";
  const cheminQr = `/qr/${classe.qrToken}`;
  const urlQr = `${protocole}://${hote}${cheminQr}`;
  const qrSvg = await QRCode.toString(urlQr, {
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
        <CardTitle>
          Étudiants inscrits ({inscriptionsConfirmees.length}
          {classe.capacite ? ` / ${classe.capacite}` : ""})
          {inscriptionsEnAttente.length > 0 && (
            <span className="ml-2 font-normal text-ink-faint">
              · {inscriptionsEnAttente.length} en liste d&apos;attente
            </span>
          )}
        </CardTitle>

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
                  {i.statut === "LISTE_ATTENTE" && <Badge variant="danger">Liste d&apos;attente</Badge>}
                  {i.etudiant.statutInscription === "PREINSCRIT" && (
                    <Badge variant="info">Préinscrit</Badge>
                  )}
                </div>
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
                {etudRecherche
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
