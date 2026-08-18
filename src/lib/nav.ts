import { Role } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Rôles autorisés à voir ce lien. Absent = visible par tous les rôles connectés. */
  rolesAllowed?: Role[];
};

// Reprend l'arborescence de la maquette (05_Maquette_interactive.html).
// Administration est ouverte à Bureau et Administration (référentiels :
// sections, année scolaire) ; la gestion des comptes/rôles utilisateurs,
// à l'intérieur de cette page, reste filtrée au seul Bureau (voir
// administration/page.tsx).
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: "🏠" },
  { href: "/etudiants", label: "Étudiants", icon: "👥" },
  { href: "/inscriptions", label: "Inscriptions", icon: "📝" },
  { href: "/classes", label: "Classes", icon: "🏫" },
  { href: "/presences", label: "Présences", icon: "✅" },
  { href: "/paiements", label: "Paiements", icon: "💳" },
  { href: "/tresorerie", label: "Trésorerie", icon: "💰" },
  { href: "/documents", label: "Documents", icon: "📄" },
  {
    href: "/administration",
    label: "Administration",
    icon: "⚙",
    rolesAllowed: [Role.BUREAU, Role.ADMINISTRATION],
  },
];
