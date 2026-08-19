import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function AccesRefusePage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-4">
      <div className="max-w-sm rounded-xl border border-border bg-bg-elevated p-6 text-center shadow-card">
        <h1 className="font-display text-lg font-semibold text-pine-strong">Accès refusé</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Votre rôle ne permet pas d&apos;accéder à cette page.
        </p>
        <Link href="/" className={`mt-4 inline-block ${buttonVariants({ variant: "primary" })}`}>
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
