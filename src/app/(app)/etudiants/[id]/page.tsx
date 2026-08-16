import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CIVILITE_LABELS: Record<string, string> = { M: "M.", MME: "Mme" };

function Champ({ label, valeur }: { label: string; valeur: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{valeur || "—"}</dd>
    </div>
  );
}

export default async function EtudiantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const etudiant = await prisma.etudiant.findUnique({
    where: { id },
    include: { responsables: true },
  });

  if (!etudiant) {
    notFound();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/etudiants" className="text-sm text-slate-500 hover:underline">
            ← Étudiants
          </Link>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            {CIVILITE_LABELS[etudiant.civilite ?? ""] ?? ""} {etudiant.prenom}{" "}
            {etudiant.nom}
          </h2>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Identité</h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Champ
            label="Date de naissance"
            valeur={
              etudiant.dateNaissance
                ? new Date(etudiant.dateNaissance).toLocaleDateString("fr-FR")
                : null
            }
          />
          <Champ label="Ville de naissance" valeur={etudiant.villeNaissance} />
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Coordonnées</h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Champ label="Téléphone mobile" valeur={etudiant.telephoneMobile} />
          <Champ label="Téléphone fixe" valeur={etudiant.telephoneFixe} />
          <Champ label="Email" valeur={etudiant.email} />
          <div />
          <Champ label="Adresse" valeur={etudiant.adresse} />
          <Champ label="Complément d'adresse" valeur={etudiant.complementAdresse} />
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Situation</h3>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Champ label="Profession" valeur={etudiant.profession} />
          <Champ label="Niveau d'études" valeur={etudiant.niveauEtudes} />
          <Champ label="Dernier diplôme obtenu" valeur={etudiant.dernierDiplome} />
        </dl>
        {etudiant.remarque && (
          <div className="mt-4">
            <dt className="text-xs font-medium uppercase text-slate-400">
              Remarque
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
              {etudiant.remarque}
            </dd>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">
          Responsables légaux
        </h3>
        {etudiant.responsables.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun responsable enregistré.</p>
        ) : (
          <ul className="space-y-4">
            {etudiant.responsables.map((r) => (
              <li key={r.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                <p className="text-sm font-medium text-slate-800">
                  {CIVILITE_LABELS[r.civilite ?? ""] ?? ""} {r.prenom} {r.nom}{" "}
                  <span className="font-normal text-slate-500">({r.lien})</span>
                </p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Champ label="Téléphone" valeur={r.telephone} />
                  <Champ label="Email" valeur={r.email} />
                  <Champ label="Adresse" valeur={r.adresse} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        Historique des inscriptions, cours et paiements : à venir avec les
        modèles Cours/Classe/Paiement (phases suivantes).
      </div>
    </div>
  );
}
