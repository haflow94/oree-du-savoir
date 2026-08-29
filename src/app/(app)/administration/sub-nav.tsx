import Link from "next/link";
import { getSession } from "@/lib/auth";
import { peutAccederModule, Module } from "@/lib/permissions";
import { Role } from "@/lib/roles";
import { etudiantsEligiblesAnonymisation } from "@/lib/rgpd-eligibles";
import { Badge } from "@/components/ui/badge";

type Item = { href: string; label: string; badge?: number };

// Navigation latérale entre les ~10 référentiels d'Administration : jusqu'ici
// seule la page /administration listait ces liens (mur de boutons), ce qui
// obligeait à revenir en arrière pour changer de référentiel une fois dans
// une sous-page (audit UX, point 1/14 → P2). Server Component autonome
// (relit sa propre session) pour rester une simple ligne à ajouter dans
// chaque sous-page, sans changer la logique de chargement de données de
// celle-ci.
export async function AdminSubNav({ current }: { current: string }) {
  const session = await getSession();
  if (!session) return null;
  const estBureau = session.role === Role.BUREAU;
  const peutAccederGouvernance = await peutAccederModule(session.role, Module.GOUVERNANCE, "LECTURE");
  const nbRgpdEligibles = estBureau ? (await etudiantsEligiblesAnonymisation()).length : 0;

  const items: Item[] = [
    { href: "/administration", label: estBureau ? "Comptes" : "Vue d'ensemble" },
    { href: "/administration/organisation", label: "Organisation" },
    { href: "/administration/sections", label: "Sections" },
    { href: "/administration/salles", label: "Salles" },
    { href: "/administration/annees-scolaires", label: "Année scolaire" },
    ...(estBureau ? [{ href: "/administration/enseignants", label: "Enseignants" }] : []),
    ...(estBureau ? [{ href: "/administration/activites", label: "Responsables activités" }] : []),
    ...(estBureau ? [{ href: "/administration/journal", label: "Journal d'audit" }] : []),
    ...(peutAccederGouvernance
      ? [{ href: "/administration/gouvernance", label: "Gouvernance (CA/AG)" }]
      : []),
    ...(estBureau ? [{ href: "/administration/permissions", label: "Permissions" }] : []),
    ...(estBureau
      ? [{ href: "/administration/rgpd", label: "RGPD", badge: nbRgpdEligibles }]
      : []),
  ];

  return (
    <nav aria-label="Sections d'administration" className="flex flex-wrap gap-1.5 border-b border-border pb-4">
      {items.map((item) => {
        const actif = item.href === current;
        return (
          <Link
            key={item.href}
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
      })}
    </nav>
  );
}
