import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  ClipboardList,
  GraduationCap,
  CheckSquare,
  CreditCard,
  Wallet,
  FileText,
  Settings,
} from "lucide-react";
import { Role } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rôles autorisés à voir ce lien. Absent = visible par tous les rôles connectés. */
  rolesAllowed?: Role[];
};

// Reprend l'arborescence de la maquette (05_Maquette_interactive.html).
// Administration est ouverte à Bureau et Administration (référentiels :
// sections, année scolaire) ; la gestion des comptes/rôles utilisateurs,
// à l'intérieur de cette page, reste filtrée au seul Bureau (voir
// administration/page.tsx).
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: Home },
  { href: "/etudiants", label: "Étudiants", icon: Users },
  { href: "/inscriptions", label: "Inscriptions", icon: ClipboardList },
  { href: "/classes", label: "Classes", icon: GraduationCap },
  { href: "/presences", label: "Présences", icon: CheckSquare },
  { href: "/paiements", label: "Paiements", icon: CreditCard },
  { href: "/tresorerie", label: "Trésorerie", icon: Wallet },
  { href: "/documents", label: "Documents", icon: FileText },
  {
    href: "/administration",
    label: "Administration",
    icon: Settings,
    rolesAllowed: [Role.BUREAU, Role.ADMINISTRATION],
  },
];
