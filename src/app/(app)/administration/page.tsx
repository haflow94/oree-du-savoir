import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, ROLE_LABELS } from "@/lib/roles";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export default async function AdministrationPage() {
  // Double vérification : le lien est déjà masqué pour les autres rôles
  // dans la barre latérale, mais l'accès direct à l'URL doit aussi être
  // bloqué ici (défense en profondeur).
  await requireRole([Role.BUREAU]);

  const utilisateurs = await prisma.utilisateur.findMany({
    orderBy: [{ role: "asc" }, { nom: "asc" }],
  });

  return (
    <div className="space-y-6">
      <PlaceholderScreen
        title="Administration"
        phase="Phase 0 (comptes) — gestion complète en Phase 6"
        description="Cette page liste les comptes existants en lecture seule. La création de compte, l'activation/désactivation, la révocation et le journal d'audit détaillé arrivent en Phase 6."
        pending={[
          "Périmètre exact des rôles Direction/CA (différés après le MVP)",
        ]}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Dernière connexion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {utilisateurs.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.prenom} {u.nom}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3 text-slate-600">
                  {ROLE_LABELS[u.role]}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.actif
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {u.actif ? "Actif" : "Désactivé"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {u.dernierLogin
                    ? new Date(u.dernierLogin).toLocaleString("fr-FR")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
