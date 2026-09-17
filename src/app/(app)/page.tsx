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
  Activity,
  type LucideIcon,
} from "lucide-react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, Role } from "@/lib/roles";
import { peutAccederModule, Module } from "@/lib/permissions";
import { formaterMontant, totalEncaisse, MOYEN_LABELS } from "@/lib/paiements";
import { filtreParReinscription } from "@/lib/sections-etudiant";
import { activitesARappeler } from "@/lib/activites";
import { nombreNotificationsPreinscriptionNonLues } from "@/lib/notifications-preinscription";
import { nombreNotificationsListeAttenteNonLues } from "@/lib/notifications-liste-attente";
import { JOUR_LABELS } from "@/lib/planning";
import { aujourdhuiUTC, ajouterJoursUTC } from "@/lib/calendrier";
import { serieQuotidienne, sommeQuotidienne } from "@/lib/dashboard";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconChip, type Accent } from "@/components/ui/icon-chip";
import { Sparkline } from "@/components/ui/sparkline";

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

// Fenêtre des mini-courbes de tendance (Sparkline) et de l'agrégation des
// événements « Activité récente » plus bas — 14 jours donne une vue de
// rythme récent (pas un historique complet) sans faire exploser le volume
// de la requête sur une base qui reste modeste (association, pas un SaaS).
const FENETRE_ACTIVITE_JOURS = 14;

// Nombre maximum d'événements affichés dans la section « Activité récente »,
// une fois les différentes sources (paiements, présences validées,
// préinscriptions, mises en liste d'attente) fusionnées et triées par date —
// un flux plus long n'apporterait rien ici, la source de vérité de chaque
// type d'événement reste consultable depuis son propre module.
const LIMITE_ACTIVITE_RECENTE = 8;

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
  // traiter" ci-dessous — même règle que la cloche du Topbar. Même principe
  // pour chacun des trois autres booléens : le Dashboard agrège plusieurs
  // modules et n'a pas de module propre (voir CLAUDE.md), donc chaque
  // sous-section (carte, sparkline, ligne d'« Activité récente ») se filtre
  // elle-même via peutAccederModule plutôt que par un requireModule global
  // en tête de page.
  const [
    peutVoirNotificationsPreinscription,
    peutVoirListesAttente,
    peutVoirPaiements,
    peutVoirPresencesActivite,
    peutVoirEtudiants,
  ] = await Promise.all([
    peutAccederModule(session.role, Module.INSCRIPTIONS, "LECTURE"),
    peutAccederModule(session.role, Module.CLASSES, "LECTURE"),
    peutAccederModule(session.role, Module.PAIEMENTS, "LECTURE"),
    // ECRITURE, pas LECTURE : la carte "Séances non validées" mène à
    // /presences, qui exige désormais ECRITURE (voir nav.ts#niveauRequis) —
    // pas de sens d'afficher la carte pour un rôle qui n'y accéderait pas.
    peutAccederModule(session.role, Module.PRESENCES, "ECRITURE"),
    peutAccederModule(session.role, Module.ETUDIANTS, "LECTURE"),
  ]);

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
  // Borne basse commune aux sparklines et à l'« Activité récente » — voir
  // FENETRE_ACTIVITE_JOURS ci-dessus.
  const debutFenetreActivite = ajouterJoursUTC(aujourdhui, -(FENETRE_ACTIVITE_JOURS - 1));

  const [
    nbEtudiants,
    nbClasses,
    dossiersAnnee,
    nbPreinscrits,
    nbDoublonsPotentiels,
    nbNonReinscrits,
    nbChequesEnAttente,
    nbSeancesNonValidees,
    affectationsEnAttente,
    notificationsPreinscriptionRecentes,
    seancesValideesRecentes,
    paiementsRecents,
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
            // Cycle du dossier généré jusqu'à la signature Documenso (voir
            // enum StatutSignature) — un dossier signé une année passée ne
            // dit rien sur celui de l'année active (contrairement à la
            // pièce d'identité/photo, un dossier signé est spécifique à
            // l'année qu'il représente), d'où ce calcul par
            // DossierAnnuel plutôt que par présence d'un Document
            // "DOSSIER_SIGNE" au niveau de l'étudiant (voir
            // lib/documents-statut.ts, qui reste inchangé pour la fiche
            // étudiant/page Documents/notification n8n — usages où le
            // "toutes années confondues" reste voulu).
            statutSignature: true,
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
    // Événements bruts des 14 derniers jours pour la sparkline "Dossiers à
    // traiter" et la section "Activité récente" — NotificationPreinscription
    // est créée UNE FOIS par préinscription, à l'arrivée (voir
    // src/app/preinscription/actions.ts), donc c'est le bon journal
    // d'événements même pour un dossier déjà traité depuis (son statut a pu
    // changer, l'horodatage d'arrivée reste correct).
    peutVoirNotificationsPreinscription
      ? prisma.notificationPreinscription.findMany({
          where: { creeLe: { gte: debutFenetreActivite } },
          orderBy: { creeLe: "desc" },
          select: { id: true, creeLe: true, etudiant: { select: { id: true, nom: true, prenom: true } } },
        })
      : Promise.resolve([]),
    // Même principe pour la sparkline "Séances non validées" et l'activité
    // récente : les séances déjà validées dans la fenêtre, peu importe leur
    // date de séance elle-même (une saisie tardive via la feuille papier de
    // secours doit compter le jour où elle est VRAIMENT faite).
    peutVoirPresencesActivite
      ? prisma.seance.findMany({
          where: { valideeLe: { gte: debutFenetreActivite } },
          orderBy: { valideeLe: "desc" },
          select: {
            id: true,
            valideeLe: true,
            classe: {
              select: {
                cours: { select: { nom: true } },
                cohorte: { select: { niveau: true, jour: true } },
              },
            },
            valideePar: { select: { nom: true, prenom: true } },
          },
        })
      : Promise.resolve([]),
    // Idem pour la sparkline "Reste à encaisser" et l'activité récente.
    peutVoirPaiements
      ? prisma.paiement.findMany({
          where: { creeLe: { gte: debutFenetreActivite } },
          orderBy: { creeLe: "desc" },
          select: {
            id: true,
            creeLe: true,
            montant: true,
            moyen: true,
            echeance: {
              select: { dossierAnnuel: { select: { etudiant: { select: { id: true, nom: true, prenom: true } } } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // totalEncaisse() (pas une simple somme des montants) : exclut les chèques
  // et prélèvements REJETE, sans quoi un chèque qui rebondit continuerait à
  // réduire ce total comme si l'argent avait été reçu (voir la fiche
  // dossier/statutCotisation, qui utilise la même fonction).
  const resteAEncaisser = dossiersAnnee.reduce((total, d) => {
    const du = Number.parseFloat(d.montantDu.toString());
    const encaisse = totalEncaisse(d.echeances.flatMap((e) => e.paiements));
    return total + Math.max(0, du - encaisse);
  }, 0);

  const nbDossiersNonSignes = dossiersAnnee.filter((d) => d.statutSignature !== "SIGNEE").length;

  // --- Sparklines de tendance (14 derniers jours), une par carte à laquelle
  // une lecture de rythme récent ajoute du sens (voir components/ui/sparkline.tsx).
  const sparklineEncaissements = sommeQuotidienne(
    paiementsRecents.map((p) => ({ date: p.creeLe, valeur: Number.parseFloat(p.montant.toString()) })),
    FENETRE_ACTIVITE_JOURS,
    aujourdhui,
  );
  const sparklinePreinscriptions = serieQuotidienne(
    notificationsPreinscriptionRecentes.map((n) => n.creeLe),
    FENETRE_ACTIVITE_JOURS,
    aujourdhui,
  );
  const sparklineSeancesValidees = serieQuotidienne(
    // Le filtre { valideeLe: { gte: ... } } de la requête garantit déjà la
    // non-nullité ici, Prisma ne le reflète pas dans le type généré.
    seancesValideesRecentes.map((s) => s.valideeLe as Date),
    FENETRE_ACTIVITE_JOURS,
    aujourdhui,
  );

  // --- « Activité récente » : fusion de plusieurs journaux d'événements
  // (paiement, feuille de présence validée, préinscription, mise en liste
  // d'attente) en un seul flux chronologique — chaque type reste consultable
  // en détail depuis son propre module, ceci n'est qu'un raccourci de lecture.
  type EvenementActivite = {
    id: string;
    horodatage: Date;
    icon: LucideIcon;
    accent: Accent;
    texte: string;
    detail?: string;
    href: string;
  };

  const evenementsPaiement: EvenementActivite[] = paiementsRecents.map((p) => {
    const etudiant = p.echeance.dossierAnnuel.etudiant;
    return {
      id: `paiement-${p.id}`,
      horodatage: p.creeLe,
      icon: Receipt,
      accent: "sage",
      texte: `${etudiant.prenom} ${etudiant.nom} — paiement de ${formaterMontant(Number.parseFloat(p.montant.toString()))}`,
      detail: MOYEN_LABELS[p.moyen],
      href: `/etudiants/${etudiant.id}`,
    };
  });

  const evenementsPresence: EvenementActivite[] = seancesValideesRecentes.map((s) => ({
    id: `seance-${s.id}`,
    horodatage: s.valideeLe as Date,
    icon: ClipboardCheck,
    accent: "ochre",
    texte: `${s.classe.cours.nom}${s.classe.cohorte.niveau ? ` — ${s.classe.cohorte.niveau}` : ""} (${JOUR_LABELS[s.classe.cohorte.jour]})`,
    detail: s.valideePar ? `Feuille validée par ${s.valideePar.prenom} ${s.valideePar.nom}` : "Feuille validée",
    href: "/presences",
  }));

  const evenementsPreinscription: EvenementActivite[] = notificationsPreinscriptionRecentes.map((n) => ({
    id: `preinscription-${n.id}`,
    horodatage: n.creeLe,
    icon: FolderOpen,
    accent: "sky",
    texte: `${n.etudiant.prenom} ${n.etudiant.nom} — nouvelle préinscription`,
    href: `/etudiants/${n.etudiant.id}`,
  }));

  const evenementsListeAttente: EvenementActivite[] = affectationsEnAttente.map((a) => ({
    id: `attente-${a.id}`,
    horodatage: a.creeLe,
    icon: Hourglass,
    accent: "ochre",
    texte: `${a.etudiant.prenom} ${a.etudiant.nom} — liste d'attente`,
    detail: `${a.cohorte.section.nom}${a.cohorte.niveau ? ` — ${a.cohorte.niveau}` : ""} · ${JOUR_LABELS[a.cohorte.jour]}${a.rangListeAttente ? ` · #${a.rangListeAttente}` : ""}`,
    href: `/classes/cohortes/${a.cohorte.id}`,
  }));

  const activiteRecente = [
    ...evenementsPaiement,
    ...evenementsPresence,
    ...evenementsPreinscription,
    ...evenementsListeAttente,
  ]
    .sort((a, b) => b.horodatage.getTime() - a.horodatage.getTime())
    .slice(0, LIMITE_ACTIVITE_RECENTE);

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

  // Nombre de jours pleins écoulés depuis la mise en attente (0 = créée
  // aujourd'hui) : la promotion restant toujours manuelle (voir plus haut),
  // une attente qui s'allonge est un signal utile à faire remonter au
  // Dashboard plutôt qu'à découvrir bloc par bloc.
  const SEUIL_ATTENTE_LONGUE_JOURS = 30;
  const joursAttente = (creeLe: (typeof affectationsEnAttente)[number]["creeLe"]) => {
    const jourCreation = Date.UTC(creeLe.getFullYear(), creeLe.getMonth(), creeLe.getDate());
    return Math.round((aujourdhui.getTime() - jourCreation) / 86_400_000);
  };
  const dureesAttente = affectationsEnAttente.map((a) => joursAttente(a.creeLe));
  const attenteMoyenneJours =
    dureesAttente.length > 0 ? Math.round(dureesAttente.reduce((s, j) => s + j, 0) / dureesAttente.length) : 0;
  const attenteMaxJours = dureesAttente.length > 0 ? Math.max(...dureesAttente) : 0;
  const nbAttentesLongues = dureesAttente.filter((j) => j >= SEUIL_ATTENTE_LONGUE_JOURS).length;

  // Chaque carte reste liée à un seul module métier (voir tableau des hrefs
  // ci-dessous) : gatée par le même peutVoirXxx que la requête Prisma qui a
  // produit sa valeur, jamais affichée pour un rôle sans LECTURE sur ce
  // module (ex. le rôle ACTIVITE, qui n'a accès qu'à Activités/Calendrier,
  // ne doit voir aucune de ces cartes).
  type Metric = {
    label: string;
    icon: LucideIcon;
    valeur: string | number;
    href: string;
    accent: Accent;
    /** Pastille de compte non lu (voir cloche du Topbar) — absent ou 0 = rien affiché. */
    badge?: number;
    /** Ligne de contexte supplémentaire sous la valeur (ex. répartition, fenêtre de calcul). */
    sousTexte?: string;
    /** Mini-courbe de tendance sur FENETRE_ACTIVITE_JOURS jours (voir components/ui/sparkline.tsx) — absente = pas de courbe affichée. */
    sparkline?: number[];
    /** Module dont dépend la carte (voir peutAccederModule ci-dessus) — carte masquée si false. */
    visible: boolean;
  };
  // Typé directement sur ce const (pas via .filter() plus bas, qui casserait
  // le typage contextuel des littéraux `accent` en `string` générique) :
  // voir metrics = toutesLesMetrics.filter(...) juste après.
  const toutesLesMetrics: Metric[] = [
    {
      label: "Étudiants",
      icon: Users,
      valeur: nbEtudiants,
      href: "/etudiants",
      accent: "sage",
      sousTexte: "Total toutes années confondues",
      visible: peutVoirEtudiants,
    },
    { label: "Classes", icon: GraduationCap, valeur: nbClasses, href: "/classes", accent: "sage", visible: peutVoirListesAttente },
    {
      label: "Reste à encaisser",
      icon: CreditCard,
      valeur: formaterMontant(resteAEncaisser),
      href: "/paiements",
      accent: "ochre",
      sousTexte:
        dossiersAnnee.length > 0 ? `Sur ${dossiersAnnee.length} dossier${dossiersAnnee.length > 1 ? "s" : ""} cette année` : undefined,
      sparkline: sparklineEncaissements,
      visible: peutVoirPaiements,
    },
    {
      label: "Dossiers à traiter",
      icon: FolderOpen,
      valeur: nbPreinscrits,
      href: "/inscriptions",
      accent: "sky",
      badge: nbNotificationsPreinscriptionNonLues,
      sousTexte: "Préinscriptions en attente de confirmation par le staff",
      sparkline: sparklinePreinscriptions,
      visible: peutVoirNotificationsPreinscription,
    },
    {
      label: "Doublons potentiels",
      icon: UserSearch,
      valeur: nbDoublonsPotentiels,
      href: "/etudiants/doublons",
      accent: "rust",
      visible: peutVoirEtudiants,
    },
    {
      label: "Dossiers non signés",
      icon: Paperclip,
      valeur: nbDossiersNonSignes,
      href: "/etudiants",
      accent: "sky",
      sousTexte:
        dossiersAnnee.length > 0
          ? `Sur ${dossiersAnnee.length} dossier${dossiersAnnee.length > 1 ? "s" : ""} de l'année en cours`
          : undefined,
      visible: peutVoirEtudiants,
    },
    {
      label: "Non réinscrits",
      icon: RotateCcw,
      valeur: nbNonReinscrits,
      href: "/etudiants?reinscription=non",
      accent: "rust",
      sousTexte: anneeActive ? `Non réinscrits sur ${anneeActive.libelle}` : undefined,
      visible: peutVoirEtudiants,
    },
    {
      label: "Chèques en attente",
      icon: Landmark,
      valeur: nbChequesEnAttente,
      href: "/paiements",
      accent: "rust",
      sousTexte: "Reçus ou déposés, pas encore encaissés",
      visible: peutVoirPaiements,
    },
    {
      label: "Séances non validées",
      icon: ClipboardCheck,
      valeur: nbSeancesNonValidees,
      href: "/presences",
      accent: "ochre",
      sousTexte: `Séances passées, ${FENETRE_SEANCES_NON_VALIDEES_JOURS} derniers jours`,
      sparkline: sparklineSeancesValidees,
      visible: peutVoirPresencesActivite,
    },
    {
      label: "En liste d'attente",
      icon: Hourglass,
      valeur: affectationsEnAttente.length,
      href: "#listes-attente",
      accent: "ochre",
      badge: nbNotificationsListeAttenteNonLues,
      sousTexte:
        listesAttenteParCohorte.length > 0
          ? `Sur ${listesAttenteParCohorte.length} bloc${listesAttenteParCohorte.length > 1 ? "s" : ""}`
          : undefined,
      visible: peutVoirListesAttente,
    },
  ];
  const metrics = toutesLesMetrics.filter((m) => m.visible);

  // Même règle de visibilité que les cartes `metrics` juste en dessous : ce
  // résumé en prose (sous "Bonjour") affichait ces mêmes chiffres sans les
  // gater, même faille que les cartes (voir peutVoirXxx plus haut).
  const ligneResume: string[] = [];
  if (peutVoirEtudiants) {
    ligneResume.push(`${nbEtudiants} étudiant${nbEtudiants > 1 ? "s" : ""} inscrit${nbEtudiants > 1 ? "s" : ""}`);
  }
  if (peutVoirListesAttente && anneeActive) {
    ligneResume.push(`${nbClasses} classe${nbClasses > 1 ? "s" : ""} cette année`);
  }
  if (peutVoirPaiements) {
    ligneResume.push(`${formaterMontant(resteAEncaisser)} restant à encaisser`);
  }
  if (activiteRecente.length > 0) {
    ligneResume.push(
      `${activiteRecente.length} événement${activiteRecente.length > 1 ? "s" : ""} récent${activiteRecente.length > 1 ? "s" : ""}`,
    );
  }

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
          {ligneResume.length > 0 && (
            <p className="mt-1 text-sm text-ink">{ligneResume.join(" · ")}.</p>
          )}
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
        {metrics.map((m, index) => (
          <Link
            key={m.label}
            href={m.href}
            className="group block animate-fade-up motion-reduce:animate-none"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <Card className="relative transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-elevated">
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
              {m.sparkline && (
                <div className={`mt-2 ${ACCENT_TEXT[m.accent]}`}>
                  <Sparkline values={m.sparkline} />
                </div>
              )}
            </Card>
          </Link>
        ))}
      </div>

      {activiteRecente.length > 0 && (
        <Card className="animate-fade-up motion-reduce:animate-none" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center gap-2">
            <Activity aria-hidden size={16} className="text-pine-strong" />
            <CardTitle>Activité récente</CardTitle>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            Derniers paiements, feuilles de présence validées, préinscriptions et mises en liste
            d&apos;attente, tous modules confondus — les {FENETRE_ACTIVITE_JOURS} derniers jours.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {activiteRecente.map((e) => (
              <li key={e.id}>
                <Link
                  href={e.href}
                  className="flex items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-bg-sunken"
                >
                  <span className={`mt-0.5 shrink-0 ${ACCENT_TEXT[e.accent]}`}>
                    <e.icon aria-hidden size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink">{e.texte}</span>
                    {e.detail && <span className="block text-xs text-ink-faint">{e.detail}</span>}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-ink-faint">
                    {e.horodatage.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {peutVoirListesAttente && (
        <Card
          id="listes-attente"
          className="animate-fade-up motion-reduce:animate-none"
          style={{ animationDelay: "220ms" }}
        >
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
          {affectationsEnAttente.length > 0 && (
            <p className="mt-2 text-sm text-ink-muted">
              Attente moyenne : <span className="font-medium text-ink">{attenteMoyenneJours} j</span>
              {" · "}la plus ancienne :{" "}
              <span className="font-medium text-ink">{attenteMaxJours} j</span>
              {nbAttentesLongues > 0 && (
                <>
                  {" · "}
                  <Badge variant="danger">
                    {nbAttentesLongues} attente{nbAttentesLongues > 1 ? "s" : ""} de plus de{" "}
                    {SEUIL_ATTENTE_LONGUE_JOURS} j
                  </Badge>
                </>
              )}
            </p>
          )}
          {listesAttenteParCohorte.length === 0 ? (
            <div className="mt-3">
              <EmptyState message="Personne en liste d'attente pour l'instant." />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {listesAttenteParCohorte.map((groupe) => (
                <li key={groupe.cohorteId} className="py-2">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-sunken">
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
                      {groupe.attente.map((a, index) => {
                        const jours = joursAttente(a.creeLe);
                        const attenteLongue = jours >= SEUIL_ATTENTE_LONGUE_JOURS;
                        return (
                          <li key={a.id} className="flex items-center gap-2 text-sm text-ink-muted">
                            <Badge variant="neutral">#{index + 1}</Badge>
                            <Link href={`/etudiants/${a.etudiant.id}`} className="hover:underline">
                              {a.etudiant.prenom} {a.etudiant.nom}
                            </Link>
                            <span className={`text-xs ${attenteLongue ? "font-medium text-rust" : "text-ink-faint"}`}>
                              depuis le {a.creeLe.toLocaleDateString("fr-FR")} ({jours} j)
                            </span>
                          </li>
                        );
                      })}
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
