import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  ClipboardList,
  GraduationCap,
  CalendarDays,
  PartyPopper,
  CheckSquare,
  CreditCard,
  Wallet,
  FileText,
  Settings,
} from "lucide-react";
import { Module } from "@/generated/prisma/enums";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Module gouvernant la visibilité de ce lien (grille de permissions, voir
   * lib/permissions.ts). Absent = visible par tout rôle connecté (cas du
   * tableau de bord, qui agrège plusieurs modules).
   */
  module?: Module;
};

// Reprend l'arborescence de la maquette (05_Maquette_interactive.html). Le
// filtrage par module se fait côté serveur dans (app)/layout.tsx (les
// niveaux d'accès viennent de la base, pas d'une liste de rôles en dur ici).
// La gestion des comptes/rôles utilisateurs, à l'intérieur de la page
// Administration, reste filtrée au seul Bureau indépendamment de ce menu
// (voir administration/page.tsx).
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: Home },
  { href: "/etudiants", label: "Étudiants", icon: Users, module: Module.ETUDIANTS },
  { href: "/inscriptions", label: "Inscriptions", icon: ClipboardList, module: Module.INSCRIPTIONS },
  { href: "/classes", label: "Classes", icon: GraduationCap, module: Module.CLASSES },
  { href: "/calendrier", label: "Planning", icon: CalendarDays, module: Module.CALENDRIER },
  { href: "/activites", label: "Activités", icon: PartyPopper, module: Module.ACTIVITES },
  { href: "/presences", label: "Présences", icon: CheckSquare, module: Module.PRESENCES },
  { href: "/paiements", label: "Paiements", icon: CreditCard, module: Module.PAIEMENTS },
  { href: "/tresorerie", label: "Trésorerie", icon: Wallet, module: Module.TRESORERIE },
  { href: "/documents", label: "Documents", icon: FileText, module: Module.DOCUMENTS },
  {
    href: "/administration",
    label: "Administration",
    icon: Settings,
    module: Module.ADMINISTRATION,
  },
];
