import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "./button";

// Bouton retour standard de l'appli : un vrai bouton (bordure, fond au
// survol, icône), pas un simple lien texte gris — repris sur toutes les
// pages de détail/formulaire pour revenir à leur liste/page parente. Réutilise
// le variant "secondary" du design system pour rester cohérent avec les
// autres boutons secondaires de l'appli.
export function BackLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link href={href} className={buttonVariants({ variant: "secondary", size: "sm", className })}>
      <ArrowLeft size={16} aria-hidden />
      {label}
    </Link>
  );
}
