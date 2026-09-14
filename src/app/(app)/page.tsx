import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Home,
  Users,
  GraduationCap,
  CreditCard,
  Receipt,
  FolderOpen,
  UserSearch,
  Paperclip,
  RotateCcw,
  Landmark,
  ClipboardCheck,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, Role } from "@/lib/roles";
import { peutAccederModule, Module } from "@/lib/permissions";
import { formaterMontant, statutCotisation } from "@/lib/paiements";
import { filtreParReinscription } from "@/lib/sections-etudiant";
import { dossierDocumentaireComplet } from "@/lib/documents";
import { activitesARappeler } from "@/lib/activites";
import { nombreNotificationsPreinscriptionNonLues } from "@/lib/notifications-preinscription";
import { nombreNotificationsListeAttenteNonLues } from "@/lib/notifications-liste-attente";
import { JOUR_LABELS } from "@/lib/planning";
import { aujourdhuiUTC, ajouterJoursUTC } from "@/lib/calendrier";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChip, type Accent } from "@/components/ui/icon-chip";

const ACCENT_TEXT: Record<Accent, string> = {
  pine: "text-pine-strong",
  sage: "text-sage",
  ochre: "text-ochre",
  sky: "text-sky",
  rust: "text-rust",
};

// Fenêtre de recherche des séances passées sans feuille validée : au-delà,
// une séance ancienne non validée est probablement du passif normal (classe
// arrêtée, rattrapage papier jamais ressaisi) plutôt qu'un oubli récent à
// relancer — pas la peine d'alourdir l'indicateur avec tout l'historique.
const FENETRE_SEANCES_NON_VALIDEES_JOURS = 14;

export default async function DashboardPage() {
  const session = await requireSession();

  // Enseignant n'a accès qu'à la validation de présence sur ses classes
  // (voir la matrice de permissions) : le tableau de bord agrège des
  // modules auxquels il n'a pas accès, donc pas de sens pour ce rôle.
  if (session.role === Role.ENSEIGNANT) {
    redirect("/presences");
  }

  // Destinataires jamais codés en dur (voir NotificationPreinscription,
  // prisma/schema.prisma) : seul un rôle ayant LECTURE sur Module.INSCRIPTIONS
  // voit le badge « nouvelles préinscriptions » sur la carte "Dossiers à
  // traiter" ci-dessous — même règle que la cloche du Topbar.
  const peutVoirNotificationsPreinscription = await peutAccederModule(
    session.role,
    Module.INSCRIPTIONS,
    "LECTURE",
  );
  // Même principe pour les listes d'attente (voir NotificationListeAttente,
  // prisma/schema.prisma) : gouverné par Module.CLASSES, qui régit la
  // consultation des Cohortes/de leur liste d'attente. Un rôle sans ce droit
  // (ex. Trésorier) ne voit ni la carte ni la section détaillée plus bas.
  const peutVoirListesAttente = await peutAccederModule(session.role, Module.CLASSES, "LECTURE");

  const [
    anneeActive,
    rappels,
    nbNotificationsPreinscriptionNonLues,
    nbNotificationsListeAttenteNonLues,
  ] = await Promise.all([
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    activitesARappeler(),
    peutVoirNotificationsPreinscription
      ? nombreNotificationsPreinscriptionNonLues(session.id)
      : Promise.resolve(0),
    peutVoirListesAttente ? nombreNotificationsListeAttenteNonLues(session.id) : Promise.resolve(0),
  ]);
  const aujourdhui = aujourdhuiUTC();

  const [
    nbEtudiants,
    nbClasses,
    dossiersAnnee,
    nbPreinscrits,
    nbDoublonsPotentiels,
    nbNonReinscrits,
    etudiantsValides,
    nbChequesEnAttente,
    nbSeancesNonValidees,
    affectationsEnAttente,
  ] = await Promise.all([
    prisma.etudiant.count({ where: { statutInscription: "VALIDE" } }),
    anneeActive
      ? prisma.classe.count({ where: { anneeScolaireId: anneeActive.id } })
      : Promise.resolve(0),
    anneeActive
      ? prisma.dossierAnnuel.findMany({
          where: { anneeScolaireId: anneeActive.id },
          select: {
            montantDu: true,
            rembourse: true,
            echeances: {
              select: {
                paiements: {
                  select: {
                    montant: true,
                    cheque: { select: { statut: true } },
                    prelevement: { select: { statut: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.etudiant.count({ where: { statutInscription: "PREINSCRIT" } }),
    // Préinscriptions rapprochées automatiquement d'une fiche existante
    // (voir Etudiant.doublonPotentielId, lib/doublons-etudiant.ts) et pas
    // encore tranchées par le staff (fusion ou confirmation d'homonymie
    // depuis la fiche) : à surfacer sans attendre que le staff tombe dessus
    // en ouvrant chaque préinscription une par une.
    prisma.etudiant.count({ where: { doublonPotentielId: { not: null } } }),
    anneeActive
      ? prisma.etudiant.count({
          where: {
            statutInscription: "VALIDE",
            ...filtreParReinscription(anneeActive.id, false),
          },
        })
      : Promise.resolve(0),
    // Documents non liés à une année scolaire (pièce du dossier papier de
    // l'étudiant, pas un paiement) : on regarde tous les étudiants au
    // dossier confirmé, indépendamment de l'année active.
    prisma.etudiant.findMany({
      where: { statutInscription: "VALIDE" },
      // chequeId: null exclut la pièce d'identité d'un titulaire de chèque
      // tiers, qui n'appartient pas au dossier documentaire de l'étudiant
      // lui-même (voir Document.chequeId).
      select: { documents: { where: { chequeId: null }, select: { type: true, dateExpiration: true } } },
    }),
    // En attente de dépôt ou d'encaissement : un chèque qui traîne dans ces
    // deux statuts est le seul risque réel du cycle (perte, oubli), REJETE
    // n'en fait pas partie une fois traité.
    prisma.cheque.count({ where: { statut: { in: ["RECU", "DEPOSE"] } } }),
    // Une séance déjà passée mais toujours PREVUE = l'appel n'a jamais été
    // fait, ni via le QR ni via la feuille papier de secours — à distinguer
    // d'ANNULEE (fermeture/imprévu, rien à valider).
    prisma.seance.count({
      where: {
        statut: "PREVUE",
        date: { gte: ajouterJoursUTC(aujourdhui, -FENETRE_SEANCES_NON_VALIDEES_JOURS), lt: aujourdhui },
      },
    }),
    // Détail des listes d'attente (toutes cohortes confondues) pour l'année
    // active — voir AffectationCohorte/prisma/schema.prisma. La promotion
    // reste manuelle (jamais automatique même quand une place se libère),
    // donc cette file ne se vide jamais toute seule : elle mérite d'être
    // visible en un coup d'œil plutôt que découverte cohorte par cohorte.
    anneeActive && peutVoirListesAttente
      ? prisma.affectationCohorte.findMany({
          where: { anneeScolaireId: anneeActive.id, statut: "EN_ATTENTE" },
          select: {
            id: true,
            rangListeAttente: true,
            creeLe: true,
            etudiant: { select: { id: true, nom: true, prenom: true } },
            cohorte: {
              select: { id: true, niveau: true, jour: true, section: { select: { nom: true } } },
            },
          },
          orderBy: [{ rangListeAttente: "asc" }, { creeLe: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const resteAEncaisser = dossiersAnnee.reduce((total, d) => {
    const du = Number.parseFloat(d.montantDu.toString());
    const encaisse = d.echeances
      .flatMap((e) => e.paiements)
      .reduce((t, p) => t + Number.parseFloat(p.montant.toString()), 0);
    return total + Math.max(0, du - encaisse);
  }, 0);

  const nbDossiersIncomplets = etudiantsValides.filter(
    (e) => !dossierDocumentaireComplet(e.documents),
  ).length;

  const nbPaiementsIncomplets = dossiersAnnee.filter((d) => {
    const { statut } = statutCotisation(d);
    return statut === "Partiel" || statut === "Impayé";
  }).length;

  // Regroupement par bloc (Cohorte) pour l'affichage détaillé plus bas — le
  // décompte brut ci-dessus ne dit pas QUI attend QUOI.
  type AffectationEnAttente = (typeof affectationsEnAttente)[number];
  const listesAttenteParCohorte = Array.from(
    affectationsEnAttente
      .reduce((map, a) => {
        const existant = map.get(a.cohorte.id)?.attente ?? [];
        map.set(a.cohorte.id, {
          cohorteId: a.cohorte.id,
          label: `${a.cohorte.section.nom}${a.cohorte.niveau ? ` — ${a.cohorte.niveau}` : ""}`,
          jour: a.cohorte.jour,
          attente: [...existant, a],
        });
        return map;
      }, new Map<string, { cohorteId: string; label: string; jour: AffectationEnAttente["cohorte"]["jour"]; attente: AffectationEnAttente[] }>())
      .values(),
  ).sort((a, b) => b.attente.length - a.attente.length);

  const metrics: {
    label: string;
    icon: LucideIcon;
    valeur: string | number;
    href: string;
    accent: Accent;
    /** Pastille de compte non lu (voir cloche du Topbar) — absent ou 0 = rien affiché. */
    badge?: number;
    /** Ligne de contexte supplémentaire sous la valeur (ex. répartition, fenêtre de calcul). */
    sousTexte?: string;
  }[] = [
    { label: "Étudiants", icon: Users, valeur: nbEtudiants, href: "/etudiants", accent: "sage" },
    { label: "Classes", icon: GraduationCap, valeur: nbClasses, href: "/classes", accent: "sage" },
    {
      label: "Reste à encaisser",
      icon: CreditCard,
      valeur: formaterMontant(resteAEncaisser),
      href: "/paiements",
      accent: "ochre",
      sousTexte:
        dossiersAnnee.length > 0 ? `Sur ${dossiersAnnee.length} dossier${dossiersAnnee.length > 1 ? "s" : ""} cette année` : undefined,
    },
    {
      label: "Paiements incomplets",
      icon: Receipt,
      valeur: nbPaiementsIncomplets,
      href: "/paiements",
      accent: "rust",
      sousTexte:
        dossiersAnnee.length > 0
          ? `${Math.round((nbPaiementsIncomplets / dossiersAnnee.length) * 100)}% des dossiers de l'année`
          : undefined,
    },
    {
      label: "Dossiers à traiter",
      icon: FolderOpen,
      valeur: nbPreinscrits,
      href: "/inscriptions",
      accent: "sky",
      badge: nbNotificationsPreinscriptionNonLues,
    },
    {
      label: "Doublons potentiels",
      icon: UserSearch,
      valeur: nbDoublonsPotentiels,
      href: "/etudiants/doublons",
      accent: "rust",
    },
    {
      label: "Dossiers incomplets",
      icon: Paperclip,
      valeur: nbDossiersIncomplets,
      href: "/etudiants",
      accent: "sky",
      sousTexte:
        etudiantsValides.length > 0
          ? `Sur ${etudiantsValides.length} dossier${etudiantsValides.length > 1 ? "s" : ""} validé${etudiantsValides.length > 1 ? "s" : ""}`
          : undefined,
    },
    {
      label: "Non réinscrits",
      icon: RotateCcw,
      valeur: nbNonReinscrits,
      href: "/etudiants?reinscription=non",
      accent: "rust",
      sousTexte: anneeActive ? `Non réinscrits sur ${anneeActive.libelle}` : undefined,
    },
    {
      label: "Chèques en attente",
      icon: Landmark,
      valeur: nbChequesEnAttente,
      href: "/paiements",
      accent: "rust",
      sousTexte: "Reçus ou déposés, pas encore encaissés",
    },
    {
      label: "Séances non validées",
      icon: ClipboardCheck,
      valeur: nbSeancesNonValidees,
      href: "/presences",
      accent: "ochre",
      sousTexte: `Séances passées, ${FENETRE_SEANCES_NON_VALIDEES_JOURS} derniers jours`,
    },
    ...(peutVoirListesAttente
      ? [
          {
            label: "En liste d'attente",
            icon: Hourglass,
            valeur: affectationsEnAttente.length,
            href: "#listes-attente",
            accent: "ochre" as Accent,
            badge: nbNotificationsListeAttenteNonLues,
            sousTexte:
              listesAttenteParCohorte.length > 0
                ? `Sur ${listesAttenteParCohorte.length} bloc${listesAttenteParCohorte.length > 1 ? "s" : ""}`
                : undefined,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IconChip icon={Home} accent="pine" />
        <div>
          <h1 className="font-display text-3xl font-semibold text-pine-strong">
            Bonjour {session.prenom}
          </h1>
          <p className="text-sm text-ink-muted">
            Connecté en tant que {ROLE_LABELS[session.role]}
            {anneeActive ? ` · Année active : ${anneeActive.libelle}` : ""}.
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            Vue d&apos;ensemble mise à jour automatiquement, pas besoin de recharger la page.
          </p>
        </div>
      </div>

      {rappels.length > 0 && (
        <div className="rounded-lg border border-l-4 border-sky-border bg-sky-bg px-4 py-3 text-sm text-sky">
          <p className="font-medium">
            {rappels.length === 1
              ? "1 activité à venir bientôt"
              : `${rappels.length} activités à venir bientôt`}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {rappels.map((a) => (
              <li key={a.id}>
                <Link href="/activites" className="hover:underline">
                  {a.titre}
                </Link>
                {" — "}
                {new Date(a.date).toLocaleDateString("fr-FR", { timeZone: "UTC" })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href}>
            <Card className="relative transition-colors hover:border-border-strong">
              {!!m.badge && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-ochre px-1.5 text-[11px] font-semibold text-on-accent">
                  {m.badge > 9 ? "9+" : m.badge}
                </span>
              )}
              <div className="flex items-center gap-1.5 text-sm text-ink-muted">
                <m.icon aria-hidden size={14} className="shrink-0" />
                {m.label}
              </div>
              <div className={`mt-2 text-2xl font-bold ${ACCENT_TEXT[m.accent]}`}>
                {m.valeur}
              </div>
              {m.sousTexte && <div className="mt-1 text-xs text-ink-faint">{m.sousTexte}</div>}
            </Card>
          </Link>
        ))}
      </div>

      {peutVoirListesAttente && (
        <Card id="listes-attente">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Listes d&apos;attente ({affectationsEnAttente.length})</CardTitle>
            {nbNotificationsListeAttenteNonLues > 0 && (
              <Badge variant="warning">
                {nbNotificationsListeAttenteNonLues} nouvelle
                {nbNotificationsListeAttenteNonLues > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            La promotion depuis une liste d&apos;attente est toujours manuelle
            (même quand une place se libère) : ces étudiants restent en
            attente jusqu&apos;à ce qu&apos;un membre du staff les promeuve
            depuis la fiche de leur bloc.
          </p>
          {listesAttenteParCohorte.length === 0 ? (
            <div className="mt-3">
              <EmptyState message="Personne en liste d'attente pour l'instant." />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {listesAttenteParCohorte.map((groupe) => (
                <li key={groupe.cohorteId} className="py-2">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-bg-sunken">
                      <span className="text-sm font-medium text-ink">
                        {groupe.label}
                        <span className="ml-2 text-xs font-normal text-ink-faint">
                          {JOUR_LABELS[groupe.jour]}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant="neutral">
                          {groupe.attente.length} en attente
                        </Badge>
                        <Link
                          href={`/classes/cohortes/${groupe.cohorteId}`}
                          className="text-xs font-medium text-pine-strong hover:underline"
                        >
                          Ouvrir
                        </Link>
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 pl-2">
                      {groupe.attente.map((a, index) => (
                        <li key={a.id} className="flex items-center gap-2 text-sm text-ink-muted">
                          <Badge variant="neutral">#{index + 1}</Badge>
                          <Link href={`/etudiants/${a.etudiant.id}`} className="hover:underline">
                            {a.etudiant.prenom} {a.etudiant.nom}
                          </Link>
                          <span className="text-xs text-ink-faint">
                            depuis le {a.creeLe.toLocaleDateString("fr-FR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!anneeActive && (
        <p className="text-sm text-ink-faint">
          Aucune année scolaire active : les classes, le reste à encaisser et
          les paiements incomplets ne peuvent pas être calculés (voir
          Administration → Année scolaire).
        </p>
      )}
    </div>
  );
}
