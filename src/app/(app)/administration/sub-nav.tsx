import Link from "next/link";
import { getSession } from "@/lib/auth";
import { peutAccederModule, Module } from "@/lib/permissions";
import { Role } from "@/lib/roles";
import { etudiantsEligiblesAnonymisation } from "@/lib/rgpd-eligibles";
import { Badge } from "@/components/ui/badge";

type Item = { href: string; label: string; badge?: number };
type Groupe = { label: string; items: Item[] };

const GROUPE_LABEL_CLASSES = "text-xs font-semibold uppercase text-ink-faint";

function TabLink({ item, actif }: { item: Item; actif: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={actif ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        actif ? "bg-pine-soft text-pine-strong" : "text-ink-muted hover:bg-bg-sunken hover:text-ink"
      }`}
    >
      {item.label}
      {!!item.badge && <Badge variant="warning">{item.badge}</Badge>}
    </Link>
  );
}

// Navigation latérale entre les référentiels d'Administration, groupée par
// nature plutôt qu'en une seule rangée d'onglets plate (comptes/rôles,
// référentiels de config, conformité) : la Gouvernance (CA/AG) est isolée à
// part, dans son propre encart — c'est un sous-système autonome avec sa
// propre porte d'accès (Module.GOUVERNANCE, pas forcément réservé au Bureau,
// voir schema.prisma), pas un simple référentiel comme Sections/Salles.
// Server Component autonome (relit sa propre session) pour rester une
// simple ligne à ajouter dans chaque sous-page, sans changer la logique de
// chargement de données de celle-ci.
export async function AdminSubNav({ current }: { current: string }) {
  const session = await getSession();
  if (!session) return null;
  const estBureau = session.role === Role.BUREAU;
  const peutAccederGouvernance = await peutAccederModule(session.role, Module.GOUVERNANCE, "LECTURE");
  const nbRgpdEligibles = estBureau ? (await etudiantsEligiblesAnonymisation()).length : 0;

  const groupes: Groupe[] = [
    {
      label: "Comptes & sécurité",
      items: [
        { href: "/administration", label: estBureau ? "Comptes" : "Vue d'ensemble" },
        ...(estBureau ? [{ href: "/administration/permissions", label: "Permissions" }] : []),
        ...(estBureau ? [{ href: "/administration/journal", label: "Journal d'audit" }] : []),
      ],
    },
    {
      label: "Référentiels",
      items: [
        { href: "/administration/organisation", label: "Organisation" },
        { href: "/administration/sections", label: "Sections" },
        { href: "/administration/salles", label: "Salles" },
        { href: "/administration/annees-scolaires", label: "Année scolaire" },
        { href: "/administration/relances", label: "Relances" },
        ...(estBureau ? [{ href: "/administration/enseignants", label: "Enseignants" }] : []),
        ...(estBureau ? [{ href: "/administration/activites", label: "Responsables activités" }] : []),
      ],
    },
    ...(estBureau
      ? [{ label: "Conformité", items: [{ href: "/administration/rgpd", label: "RGPD", badge: nbRgpdEligibles }] }]
      : []),
  ];

  return (
    <div className="space-y-3 border-b border-border pb-4">
      <nav aria-label="Sections d'administration" className="flex flex-wrap items-start gap-x-6 gap-y-3">
        {groupes.map((groupe) => (
          <div key={groupe.label} className="flex flex-col gap-1.5">
            <span className={GROUPE_LABEL_CLASSES}>{groupe.label}</span>
            <div className="flex flex-wrap gap-1.5">
              {groupe.items.map((item) => (
                <TabLink key={item.href} item={item} actif={item.href === current} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {peutAccederGouvernance && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-bg-sunken/40 p-3">
          <span className={GROUPE_LABEL_CLASSES}>Gouvernance associative</span>
          <div className="flex flex-wrap gap-1.5">
            <TabLink
              item={{ href: "/administration/gouvernance", label: "Gouvernance (CA/AG)" }}
              actif={current === "/administration/gouvernance"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
