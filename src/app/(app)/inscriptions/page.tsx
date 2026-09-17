import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ClipboardList, QrCode } from "lucide-react";
import { requireModule, peutAccederModule, Module } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { TableWrap, TableHead } from "@/components/ui/table";
import { IconChip } from "@/components/ui/icon-chip";
import { Badge } from "@/components/ui/badge";
import { TabLinks } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { CONTROL_SM_CLASSES, TOOLBAR_CLASSES } from "@/components/ui/champ";
import { GenererCodeForm } from "./generer-code-form";
import { InvaliderCodeAccueilButton } from "./invalider-code-accueil-button";
import { obtenirOuCreerJetonPermanent } from "@/lib/preinscription-token";
import { etudiantsValidesSansClasse } from "@/lib/cohortes";
import { statutDossierAffiche, STATUT_DOSSIER_LABELS, STATUT_DOSSIER_VARIANTS } from "@/lib/documents";
import type { StatutDossierAffiche } from "@/lib/documents";
import { traiterDemandeCorrectionAction } from "./actions";

// Étapes du parcours dossier pertinentes ici : cette page ne liste que des
// PREINSCRIT (voir la requête plus bas), donc VALIDE_DEFINITIVEMENT ne peut
// jamais y apparaître — inutile de lui donner un onglet de filtre.
const ETAPES_STATUT_DOSSIER = [
  "RECUE_EN_COURS",
  "A_VERIFIER",
  "ENVOYE_SIGNATURE",
  "DOSSIER_SIGNE",
  "A_COMPLETER",
] as const satisfies readonly StatutDossierAffiche[];

// "aucun" : aucun DossierAnnuel pour cet étudiant (génération automatique
// échouée à la préinscription, voir preinscription/actions.ts) — un cas que
// l'accueil doit pouvoir repérer pour relancer la génération à la main
// depuis la fiche, distinct des 5 étapes normales du parcours.
type CleStatutDossier = (typeof ETAPES_STATUT_DOSSIER)[number] | "aucun";

export default async function InscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statutDossier?: string }>;
}) {
  const session = await requireModule(Module.INSCRIPTIONS, "LECTURE");
  const peutGenererCode = await peutAccederModule(session.role, Module.INSCRIPTIONS, "ECRITURE");
  const { q, statutDossier } = await searchParams;
  const recherche = q?.trim() ?? "";
  const statutDossierFiltre: CleStatutDossier | null =
    statutDossier === "aucun" ||
    ETAPES_STATUT_DOSSIER.includes(statutDossier as (typeof ETAPES_STATUT_DOSSIER)[number])
      ? (statutDossier as CleStatutDossier)
      : null;

  // Même logique que le QR permanent de salle (voir
  // (app)/classes/[id]/page.tsx) : un scanner de téléphone n'ouvre un lien
  // que si le contenu est une URL absolue. PUBLIC_HOST permet de forcer
  // l'IP/le nom réellement accessible depuis l'accueil si l'appli est
  // servie en interne via "localhost" ou un nom non joignable par un
  // téléphone (voir .env.example).
  //
  // Le QR pointe vers /accueil-preinscription (jamais directement vers
  // /preinscription) : cette route redirige avec le code accueil du jour,
  // régénéré automatiquement à la demande (voir
  // src/app/accueil-preinscription/route.ts et
  // src/lib/preinscription-code.ts) — le lien encodé ici reste donc valable
  // indéfiniment, jamais besoin de réimprimer ce QR.
  const enTetes = await headers();
  const hote = process.env.PUBLIC_HOST || enTetes.get("host") || "localhost:3000";
  const protocole = enTetes.get("x-forwarded-proto") ?? "http";
  const urlAccueilPreinscription = `${protocole}://${hote}/accueil-preinscription`;
  const qrSvg = await QRCode.toString(urlAccueilPreinscription, { type: "svg", margin: 1, width: 160 });

  // QR officiel Internet (voir src/proxy.ts et src/lib/preinscription-token.ts) :
  // construit sur PREINSCRIPTION_PUBLIC_HOSTNAME (le hostname du tunnel
  // public, toujours en HTTPS), jamais sur PUBLIC_HOST/le host de la requête
  // ci-dessus — celui-ci sert au QR d'accueil réservé au réseau local, pas
  // au flyer/QR imprimé pour Internet. `obtenirOuCreerJetonPermanent` crée
  // le jeton au tout premier affichage de cette page puis le réutilise
  // indéfiniment (jamais régénéré automatiquement) : le QR reste stable
  // d'une consultation à l'autre, y compris après un redémarrage du
  // conteneur.
  const hotePublicPreinscription = process.env.PREINSCRIPTION_PUBLIC_HOSTNAME;
  const { jeton } = await obtenirOuCreerJetonPermanent();
  const urlPreinscriptionPermanente = hotePublicPreinscription
    ? `https://${hotePublicPreinscription}/?a=${encodeURIComponent(jeton)}`
    : null;
  const qrPermanentSvg = urlPreinscriptionPermanente
    ? await QRCode.toString(urlPreinscriptionPermanente, { type: "svg", margin: 1, width: 160 })
    : null;

  // Exceptions à traiter par le staff (voir CLAUDE.md/analyse de
  // conversation — "l'administration ne doit intervenir que lorsqu'une
  // action administrative est réellement nécessaire") : demandes de
  // correction sensible déposées depuis /dossier/[token], et étudiants déjà
  // validés administrativement mais sans aucune classe effective (règle
  // "signature ≠ validation finale" — voir lib/cohortes.ts).
  const [demandesCorrection, anneeActive] = await Promise.all([
    prisma.demandeCorrection.findMany({
      where: { traiteeLe: null },
      include: { dossierAnnuel: { include: { etudiant: { select: { id: true, nom: true, prenom: true } } } } },
      orderBy: { creeLe: "asc" },
    }),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
  ]);
  const validesSansClasse = anneeActive ? await etudiantsValidesSansClasse(anneeActive.id) : [];

  const preinscritsBruts = await prisma.etudiant.findMany({
    where: {
      statutInscription: "PREINSCRIT",
      ...(recherche
        ? {
            OR: [
              { nom: { contains: recherche, mode: "insensitive" } },
              { prenom: { contains: recherche, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { creeLe: "desc" },
    include: {
      // Le plus récent : une préinscription n'a jamais qu'un seul
      // DossierAnnuel en pratique (créé une fois à la soumission, voir
      // preinscription/actions.ts), mais `take: 1` couvre aussi le cas
      // borderline où un second aurait été ouvert à la main.
      dossiersAnnuels: { orderBy: { creeLe: "desc" }, take: 1, select: { statutSignature: true } },
      documents: { where: { chequeId: null }, select: { type: true, dateExpiration: true } },
    },
  });

  // "Statut dossier" (voir lib/documents-statut.ts) calculé une fois ici pour
  // servir à la fois aux compteurs/filtres ci-dessous et à la colonne du
  // tableau — jamais stocké, purement dérivé des statuts existants.
  const preinscrits = preinscritsBruts.map((e) => ({
    ...e,
    statutDossier: statutDossierAffiche({
      statutInscription: e.statutInscription,
      statutSignature: e.dossiersAnnuels[0]?.statutSignature ?? null,
      documents: e.documents,
    }),
  }));

  // VALIDE_DEFINITIVEMENT ne peut jamais sortir de statutDossierAffiche ici
  // (population filtrée sur PREINSCRIT ci-dessus), mais le type de retour le
  // permet toujours : la clé reste dans ce compteur par exhaustivité plutôt
  // que de forcer un cast, sans jamais être affichée (voir ETAPES_STATUT_DOSSIER).
  const comptesStatutDossier = preinscrits.reduce(
    (comptes, e) => {
      const cle = e.statutDossier ?? "aucun";
      comptes[cle] += 1;
      return comptes;
    },
    {
      aucun: 0,
      RECUE_EN_COURS: 0,
      A_VERIFIER: 0,
      ENVOYE_SIGNATURE: 0,
      DOSSIER_SIGNE: 0,
      A_COMPLETER: 0,
      VALIDE_DEFINITIVEMENT: 0,
    } as Record<StatutDossierAffiche | "aucun", number>,
  );

  const preinscritsAffiches = statutDossierFiltre
    ? preinscrits.filter((e) => (e.statutDossier ?? "aucun") === statutDossierFiltre)
    : preinscrits;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IconChip icon={ClipboardList} accent="sky" />
        <div>
          <h1 className="font-display text-3xl font-semibold text-pine-strong">Inscriptions</h1>
          <p className="text-sm text-ink-muted">
            Préinscriptions en attente de contrôle sur place (signature,
            documents, paiement) avant validation.
          </p>
        </div>
      </div>

      {(demandesCorrection.length > 0 || validesSansClasse.length > 0) && (
        <Card>
          <CardTitle>Dossiers à traiter</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            Exceptions nécessitant une intervention du staff — le reste du parcours (génération du
            dossier, vérification, signature) se fait sans vous.
          </p>

          {demandesCorrection.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium text-ink">
                Demandes de correction ({demandesCorrection.length})
              </p>
              <ul className="mt-2 space-y-2">
                {demandesCorrection.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border bg-bg-sunken/40 px-3 py-2"
                  >
                    <div>
                      <Link href={`/etudiants/${d.dossierAnnuel.etudiant.id}`} className="text-sm font-medium text-ink hover:underline">
                        {d.dossierAnnuel.etudiant.prenom} {d.dossierAnnuel.etudiant.nom}
                      </Link>
                      <p className="text-sm text-ink-muted">{d.message}</p>
                      <p className="text-xs text-ink-faint">{new Date(d.creeLe).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <form action={traiterDemandeCorrectionAction}>
                      <input type="hidden" name="demandeId" value={d.id} />
                      <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Marquer traitée
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validesSansClasse.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium text-ink">
                Validés sans classe ({validesSansClasse.length})
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Inscription validée administrativement, mais aucune classe ne leur a encore été
                affectée pour l&apos;année active.
              </p>
              <ul className="mt-2 space-y-1">
                {validesSansClasse.map((e) => (
                  <li key={e.id}>
                    <Link href={`/etudiants/${e.id}`} className="text-sm text-ink hover:underline">
                      {e.prenom} {e.nom}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <form className={TOOLBAR_CLASSES} action="/inscriptions" method="GET">
        {statutDossierFiltre && <input type="hidden" name="statutDossier" value={statutDossierFiltre} />}
        <div>
          <label htmlFor="q" className="sr-only">
            Rechercher par nom ou prénom
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Nom ou prénom…"
            className={`w-48 ${CONTROL_SM_CLASSES}`}
          />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Rechercher
        </button>
        {(recherche || statutDossierFiltre) && (
          <Link href="/inscriptions" className="text-xs font-medium text-ink-muted hover:underline">
            Réinitialiser
          </Link>
        )}
      </form>

      <TabLinks
        tabs={(["tous", "aucun", ...ETAPES_STATUT_DOSSIER] as const).map((id) => {
          const params = new URLSearchParams(recherche ? { q: recherche } : {});
          if (id !== "tous") params.set("statutDossier", id);
          return {
            id,
            label:
              id === "tous"
                ? `Tous (${preinscrits.length})`
                : `${id === "aucun" ? "Aucun dossier" : STATUT_DOSSIER_LABELS[id]} (${comptesStatutDossier[id]})`,
            href: `/inscriptions?${params}`,
            active: id === "tous" ? !statutDossierFiltre : statutDossierFiltre === id,
          };
        })}
      />

      <TableWrap>
        <TableHead>
          <th className="px-4 py-3">Nom</th>
          <th className="px-4 py-3">Reçu le</th>
          <th className="px-4 py-3">Statut dossier</th>
          <th className="px-4 py-3">Remarque</th>
        </TableHead>
        <tbody className="divide-y divide-border">
          {preinscritsAffiches.map((e) => (
            <tr key={e.id} className="relative transition-colors hover:bg-bg-sunken/40">
              <td className="px-4 py-3 font-medium text-ink">
                <Link
                  href={`/etudiants/${e.id}`}
                  className="after:absolute after:inset-0 hover:underline"
                >
                  {e.prenom} {e.nom}
                </Link>
                {e.doublonPotentielId && (
                  <span className="ml-2">
                    <Badge variant="warning">Doublon possible</Badge>
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-ink-muted">
                {new Date(e.creeLe).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
              </td>
              <td className="px-4 py-3">
                {e.statutDossier ? (
                  <Badge variant={STATUT_DOSSIER_VARIANTS[e.statutDossier]}>
                    {STATUT_DOSSIER_LABELS[e.statutDossier]}
                  </Badge>
                ) : (
                  <Badge variant="neutral">Aucun dossier</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-ink-muted">{e.remarque ?? "—"}</td>
            </tr>
          ))}
          {preinscritsAffiches.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-ink-faint">
                {recherche || statutDossierFiltre
                  ? "Aucune préinscription ne correspond à cette recherche/ce filtre."
                  : "Aucune préinscription en attente."}
              </td>
            </tr>
          )}
        </tbody>
      </TableWrap>

      {/* Regroupe les 3 canaux d'accès au formulaire public (QR d'accueil
          local, QR permanent Internet, code à usage unique) — jusqu'ici 3
          Card pleine largeur affichées avant la liste elle-même, reléguant
          le vrai travail du jour (contrôler les préinscriptions en attente)
          en bas de page. Repliée par défaut : consultée seulement quand il
          faut réimprimer/régénérer un accès, jamais pour le suivi quotidien. */}
      <details className="group rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <IconChip icon={QrCode} accent="sky" />
          <span className="font-display text-lg font-semibold text-pine-strong">
            Accès au formulaire de préinscription
          </span>
          <span className="ml-auto text-ink-faint transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-ink">QR d&apos;accueil (réseau local)</p>
            <p className="mt-1 text-xs text-ink-muted">
              À afficher sur place : plusieurs familles peuvent le scanner le
              même jour. Se renouvelle seul chaque jour, jamais besoin de le
              réimprimer.
            </p>
            <div
              className="mt-2 inline-block rounded-lg bg-bg-elevated p-2 ring-1 ring-border"
              // SVG produit côté serveur par la bibliothèque qrcode à partir
              // d'un chemin interne : aucune donnée utilisateur n'y transite.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="mt-2 break-all font-mono text-xs text-ink-faint">{urlAccueilPreinscription}</p>
            {peutGenererCode && (
              <div className="mt-2">
                <InvaliderCodeAccueilButton />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-ink">QR permanent (flyer / affiche Internet)</p>
            {urlPreinscriptionPermanente && qrPermanentSvg ? (
              <>
                <p className="mt-1 text-xs text-ink-muted">
                  À imprimer une seule fois : ouvre le formulaire depuis
                  n&apos;importe où sur Internet. Ne change jamais.
                </p>
                <div
                  className="mt-2 inline-block rounded-lg bg-bg-elevated p-2 ring-1 ring-border"
                  // SVG produit côté serveur par la bibliothèque qrcode à
                  // partir d'une URL interne (hostname + jeton stocké en
                  // base) : aucune donnée utilisateur n'y transite.
                  dangerouslySetInnerHTML={{ __html: qrPermanentSvg }}
                />
                <p className="mt-2 break-all font-mono text-xs text-ink-faint">
                  {urlPreinscriptionPermanente}
                </p>
              </>
            ) : (
              <div className="mt-2">
                <Alert variant="warning">
                  Hostname public non configuré (
                  <code className="rounded bg-bg-sunken px-1 py-0.5 text-xs">
                    PREINSCRIPTION_PUBLIC_HOSTNAME
                  </code>
                  ).
                </Alert>
              </div>
            )}
          </div>

          {peutGenererCode && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-ink">Code à usage unique (campagne email)</p>
              <p className="mt-1 text-xs text-ink-muted">
                Lien valable une seule fois, à coller dans un e-mail à une
                famille déjà contactée.
              </p>
              <div className="mt-2">
                <GenererCodeForm />
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
