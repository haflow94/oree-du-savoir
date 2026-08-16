import { requireSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";

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
        <h2 className="text-lg font-semibold text-slate-900">
          Bonjour {session.prenom}
        </h2>
        <p className="text-sm text-slate-500">
          Connecté en tant que {ROLE_LABELS[session.role]}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {METRICS.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-sm text-slate-500">
              <span className="mr-1.5">{m.icon}</span>
              {m.label}
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-300">—</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          Fondations en place (Phase 0)
        </h3>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
          <li>✓ Authentification et sessions</li>
          <li>✓ Rôles (Bureau, Administration, Accueil, Trésorier, Enseignant)</li>
          <li>✓ Contrôle d&apos;accès par rôle (page Administration)</li>
          <li>✓ Sauvegarde/restauration de base de données (scripts déploiement)</li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          Les indicateurs ci-dessus s&apos;activeront au fil des phases
          suivantes (Étudiants, Inscriptions, Classes, Paiements). Aucune
          donnée n&apos;est simulée ici.
        </p>
      </div>
    </div>
  );
}
