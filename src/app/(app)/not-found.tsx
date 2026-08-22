import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center">
      <div className="max-w-sm rounded-xl border border-border bg-bg-elevated p-6 text-center shadow-card">
        <h1 className="font-display text-lg font-semibold text-pine-strong">
          Page introuvable
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Cette fiche ou cette page n&apos;existe plus, ou l&apos;adresse est incorrecte.
        </p>
        <Link href="/" className={`mt-4 inline-block ${buttonVariants({ variant: "primary" })}`}>
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
