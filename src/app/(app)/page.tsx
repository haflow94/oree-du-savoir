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
  type LucideIcon,
} from "lucide-react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, Role } from "@/lib/roles";
import { formaterMontant, statutCotisation } from "@/lib/paiements";
import { filtreParReinscription } from "@/lib/sections-etudiant";
import { dossierDocumentaireComplet } from "@/lib/documents";
import { activitesARappeler } from "@/lib/activites";
import { aujourdhuiUTC, ajouterJoursUTC } from "@/lib/calendrier";
import { Card } from "@/components/ui/card";
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

  const [anneeActive, rappels] = await Promise.all([
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    activitesARappeler(),
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

  const metrics: {
    label: string;
    icon: LucideIcon;
    valeur: string | number;
    href: string;
    accent: Accent;
  }[] = [
    { label: "Étudiants", icon: Users, valeur: nbEtudiants, href: "/etudiants", accent: "sage" },
    { label: "Classes", icon: GraduationCap, valeur: nbClasses, href: "/classes", accent: "sage" },
    {
      label: "Reste à encaisser",
      icon: CreditCard,
      valeur: formaterMontant(resteAEncaisser),
      href: "/paiements",
      accent: "ochre",
    },
    {
      label: "Paiements incomplets",
      icon: Receipt,
      valeur: nbPaiementsIncomplets,
      href: "/paiements",
      accent: "rust",
    },
    {
      label: "Dossiers à traiter",
      icon: FolderOpen,
      valeur: nbPreinscrits,
      href: "/inscriptions",
      accent: "sky",
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
    },
    {
      label: "Non réinscrits",
      icon: RotateCcw,
      valeur: nbNonReinscrits,
      href: "/etudiants?reinscription=non",
      accent: "rust",
    },
    {
      label: "Chèques en attente",
      icon: Landmark,
      valeur: nbChequesEnAttente,
      href: "/paiements",
      accent: "rust",
    },
    {
      label: "Séances non validées",
      icon: ClipboardCheck,
      valeur: nbSeancesNonValidees,
      href: "/presences",
      accent: "ochre",
    },
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
            <Card className="transition-colors hover:border-border-strong">
              <div className="flex items-center gap-1.5 text-sm text-ink-muted">
                <m.icon aria-hidden size={14} className="shrink-0" />
                {m.label}
              </div>
              <div className={`mt-2 text-2xl font-bold ${ACCENT_TEXT[m.accent]}`}>
                {m.valeur}
              </div>
            </Card>
          </Link>
        ))}
      </div>

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
