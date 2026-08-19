import { requireSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { Card, CardTitle } from "@/components/ui/card";

const METRICS = [
  { label: "Étudiants", icon: "👥" },
  { label: "Classes", icon: "🏫" },
  { label: "Paiements", icon: "💳" },
  { label: "Dossiers à traiter", icon: "📁" },
];

export default async function DashboardPage() {
  const session = await requireSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-pine-strong">
          Bonjour {session.prenom}
        </h1>
        <p className="text-sm text-ink-muted">
          Connecté en tant que {ROLE_LABELS[session.role]}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {METRICS.map((m) => (
          <Card key={m.label}>
            <div className="text-sm text-ink-muted">
              <span className="mr-1.5">{m.icon}</span>
              {m.label}
            </div>
            <div className="mt-2 text-2xl font-bold text-ink-faint">—</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle>Fondations en place (Phase 0)</CardTitle>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
          <li>✓ Authentification et sessions</li>
          <li>✓ Rôles (Bureau, Administration, Accueil, Trésorier, Enseignant)</li>
          <li>✓ Contrôle d&apos;accès par rôle (page Administration)</li>
          <li>✓ Sauvegarde/restauration de base de données (scripts déploiement)</li>
        </ul>
        <p className="mt-4 text-sm text-ink-faint">
          Les indicateurs ci-dessus s&apos;activeront au fil des phases
          suivantes (Étudiants, Inscriptions, Classes, Paiements). Aucune
          donnée n&apos;est simulée ici.
        </p>
      </Card>
    </div>
  );
}
