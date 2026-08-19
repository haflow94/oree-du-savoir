import { requireRole } from "@/lib/auth";
import { Role } from "@/lib/roles";
import { EtudiantForm } from "./etudiant-form";

export default async function NouvelEtudiantPage() {
  await requireRole([Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-pine-strong">
          Nouvel étudiant
        </h1>
        <p className="text-sm text-ink-muted">
          Jusqu&apos;à deux responsables légaux peuvent être ajoutés ici.
          D&apos;autres pourront être ajoutés depuis la fiche étudiant.
        </p>
      </div>
      <EtudiantForm />
    </div>
  );
}
