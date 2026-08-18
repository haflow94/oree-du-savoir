import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, hasRole } from "@/lib/roles";
import { formaterMontant } from "@/lib/paiements";
import { JOUR_LABELS } from "@/lib/planning";
import { TYPE_DOCUMENT_LABELS } from "@/lib/documents";
import { TypeDocument } from "@/generated/prisma/enums";
import {
  modifierEtudiantAction,
  ajouterResponsableAction,
  modifierResponsableAction,
  supprimerResponsableAction,
  validerInscriptionAction,
  televerserDocumentAction,
  supprimerDocumentAction,
} from "./actions";

const PEUT_MODIFIER = [Role.ACCUEIL, Role.ADMINISTRATION, Role.BUREAU];
const PEUT_CREER_DOSSIER = [Role.ACCUEIL, Role.TRESORIER, Role.ADMINISTRATION, Role.BUREAU];

const MESSAGES: Record<string, string> = {
  CHAMPS_MANQUANTS: "Le nom et le prénom sont obligatoires.",
  FICHIER_MANQUANT: "Choisissez un fichier et un type de document.",
  INTROUVABLE: "Ce document n'existe plus.",
};

function versChampDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function Champ({
  label,
  name,
  defaultValue,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
    </div>
  );
}

export default async function EtudiantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const peutModifier = hasRole(session.role, PEUT_MODIFIER);
  const peutCreerDossier = hasRole(session.role, PEUT_CREER_DOSSIER);
  const { id } = await params;
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const [etudiant, sections] = await Promise.all([
    prisma.etudiant.findUnique({
      where: { id },
      include: {
        responsables: true,
        inscriptions: {
          include: { classe: { include: { cours: true, anneeScolaire: true } } },
          orderBy: { classe: { anneeScolaire: { libelle: "desc" } } },
        },
        dossiersAnnuels: {
          include: {
            anneeScolaire: true,
            echeances: { include: { paiements: true } },
          },
          orderBy: { anneeScolaire: { libelle: "desc" } },
        },
        documents: { orderBy: { creeLe: "desc" } },
      },
    }),
    prisma.section.findMany({ orderBy: { nom: "asc" } }),
  ]);

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
          <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
            {etudiant.prenom} {etudiant.nom}
            {etudiant.statutInscription === "PREINSCRIT" && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Préinscrit — à valider
              </span>
            )}
          </h2>
        </div>
        {peutModifier && etudiant.statutInscription === "PREINSCRIT" && (
          <form action={validerInscriptionAction}>
            <input type="hidden" name="etudiantId" value={etudiant.id} />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Valider l&apos;inscription
            </button>
          </form>
        )}
      </div>

      {message && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}
      {ok && !message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Modification enregistrée.
        </p>
      )}

      {peutModifier ? (
        <form action={modifierEtudiantAction} className="space-y-6">
          <input type="hidden" name="etudiantId" value={etudiant.id} />

          <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-slate-800">Identité</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Civilité
                </label>
                <select
                  name="civilite"
                  defaultValue={etudiant.civilite ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">—</option>
                  <option value="M">M.</option>
                  <option value="MME">Mme</option>
                </select>
              </div>
              <div />
              <Champ label="Nom" name="nom" defaultValue={etudiant.nom} required />
              <Champ label="Prénom" name="prenom" defaultValue={etudiant.prenom} required />
              <Champ
                label="Date de naissance"
                name="dateNaissance"
                type="date"
                defaultValue={versChampDate(etudiant.dateNaissance)}
              />
              <Champ
                label="Ville de naissance"
                name="villeNaissance"
                defaultValue={etudiant.villeNaissance ?? ""}
              />
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-slate-800">Coordonnées</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ
                label="Téléphone mobile"
                name="telephoneMobile"
                defaultValue={etudiant.telephoneMobile ?? ""}
              />
              <Champ
                label="Téléphone fixe"
                name="telephoneFixe"
                defaultValue={etudiant.telephoneFixe ?? ""}
              />
              <Champ label="Email" name="email" type="email" defaultValue={etudiant.email ?? ""} />
              <div />
              <div className="sm:col-span-2">
                <Champ label="Adresse" name="adresse" defaultValue={etudiant.adresse ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Champ
                  label="Complément d'adresse"
                  name="complementAdresse"
                  defaultValue={etudiant.complementAdresse ?? ""}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-semibold text-slate-800">Situation</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Profession" name="profession" defaultValue={etudiant.profession ?? ""} />
              <Champ
                label="Niveau d'études"
                name="niveauEtudes"
                defaultValue={etudiant.niveauEtudes ?? ""}
              />
              <Champ
                label="Dernier diplôme obtenu"
                name="dernierDiplome"
                defaultValue={etudiant.dernierDiplome ?? ""}
              />
              <div />
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Remarque
                </label>
                <textarea
                  name="remarque"
                  rows={3}
                  defaultValue={etudiant.remarque ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
            </div>
          </fieldset>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Enregistrer les modifications
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Identité</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  Date de naissance
                </dt>
                <dd className="mt-0.5 text-sm text-slate-800">
                  {etudiant.dateNaissance
                    ? new Date(etudiant.dateNaissance).toLocaleDateString("fr-FR")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">
                  Ville de naissance
                </dt>
                <dd className="mt-0.5 text-sm text-slate-800">
                  {etudiant.villeNaissance || "—"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Coordonnées</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">Téléphone</dt>
                <dd className="mt-0.5 text-sm text-slate-800">
                  {etudiant.telephoneMobile || etudiant.telephoneFixe || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">Email</dt>
                <dd className="mt-0.5 text-sm text-slate-800">{etudiant.email || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase text-slate-400">Adresse</dt>
                <dd className="mt-0.5 text-sm text-slate-800">{etudiant.adresse || "—"}</dd>
              </div>
            </dl>
          </div>
        </>
      )}

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
                {peutModifier ? (
                  <form action={modifierResponsableAction} className="space-y-3">
                    <input type="hidden" name="etudiantId" value={etudiant.id} />
                    <input type="hidden" name="responsableId" value={r.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Civilité
                        </label>
                        <select
                          name="civilite"
                          defaultValue={r.civilite ?? ""}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        >
                          <option value="">—</option>
                          <option value="M">M.</option>
                          <option value="MME">Mme</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Lien
                        </label>
                        <input
                          name="lien"
                          defaultValue={r.lien}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Nom
                        </label>
                        <input
                          name="nom"
                          required
                          defaultValue={r.nom}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Prénom
                        </label>
                        <input
                          name="prenom"
                          required
                          defaultValue={r.prenom}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Téléphone
                        </label>
                        <input
                          name="telephone"
                          defaultValue={r.telephone ?? ""}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Email
                        </label>
                        <input
                          name="email"
                          type="email"
                          defaultValue={r.email ?? ""}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Adresse
                        </label>
                        <input
                          name="adresse"
                          defaultValue={r.adresse ?? ""}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {r.prenom} {r.nom} <span className="font-normal text-slate-500">({r.lien})</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {r.telephone || "—"} · {r.email || "—"}
                    </p>
                  </div>
                )}
                {peutModifier && (
                  <form action={supprimerResponsableAction} className="mt-1 flex justify-end">
                    <input type="hidden" name="etudiantId" value={etudiant.id} />
                    <input type="hidden" name="responsableId" value={r.id} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Supprimer ce responsable
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {peutModifier && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              + Ajouter un responsable
            </summary>
            <form action={ajouterResponsableAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="etudiantId" value={etudiant.id} />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Civilité</label>
                <select
                  name="civilite"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">—</option>
                  <option value="M">M.</option>
                  <option value="MME">Mme</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Lien</label>
                <input
                  name="lien"
                  placeholder="Père, mère, tuteur…"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Nom</label>
                <input
                  name="nom"
                  required
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Prénom</label>
                <input
                  name="prenom"
                  required
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Téléphone</label>
                <input
                  name="telephone"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                <input
                  name="email"
                  type="email"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Adresse</label>
                <input
                  name="adresse"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Ajouter
                </button>
              </div>
            </form>
          </details>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-800">Cours suivis</h3>
        {etudiant.inscriptions.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune inscription en cours.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {etudiant.inscriptions.map((i) => (
              <li key={i.id} className="py-2.5">
                <Link
                  href={`/classes/${i.classe.id}`}
                  className="text-sm font-medium text-slate-800 hover:underline"
                >
                  {i.classe.cours.nom}
                  {i.classe.niveau && ` — ${i.classe.niveau}`}
                </Link>
                <p className="text-xs text-slate-500">
                  {JOUR_LABELS[i.classe.jour]} {i.classe.heureDebut}–{i.classe.heureFin} ·{" "}
                  {i.classe.anneeScolaire.libelle}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Situation financière</h3>
          {peutCreerDossier && (
            <Link
              href={`/paiements/nouveau?etudiantId=${etudiant.id}`}
              className="text-xs font-medium text-slate-600 hover:underline"
            >
              + Nouveau dossier (réinscription)
            </Link>
          )}
        </div>
        {etudiant.dossiersAnnuels.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun dossier de paiement pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {etudiant.dossiersAnnuels.map((d) => {
              const du = Number.parseFloat(d.montantDu.toString());
              const encaisse = d.echeances
                .flatMap((e) => e.paiements)
                .reduce((total, p) => total + Number.parseFloat(p.montant.toString()), 0);
              const reste = du - encaisse;
              const statut = reste <= 0 ? "Soldé" : encaisse > 0 ? "Partiel" : "Impayé";
              const statutClasses =
                statut === "Soldé"
                  ? "bg-emerald-50 text-emerald-700"
                  : statut === "Partiel"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700";
              return (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <Link
                    href={`/paiements/${d.id}`}
                    className="text-sm font-medium text-slate-800 hover:underline"
                  >
                    {d.anneeScolaire.libelle}
                  </Link>
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <span>Dû {formaterMontant(du)}</span>
                    <span>Reste {formaterMontant(reste)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statutClasses}`}>
                      {statut}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {peutModifier && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Dossier officiel</h3>
          <p className="mb-3 text-xs text-slate-500">
            Génère le dossier pré-rempli à imprimer et faire signer. Le
            fichier est conservé et réapparaît dans les documents ci-dessous.
          </p>
          {sections.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune section enregistrée.</p>
          ) : (
            <form className="flex flex-wrap items-end gap-2" action={`/etudiants/${etudiant.id}/dossier`}>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Section</label>
                <select
                  name="sectionId"
                  required
                  defaultValue={sections[0]?.id}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                formTarget="_blank"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Générer et imprimer
              </button>
            </form>
          )}
        </div>
      )}

      {peutModifier && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Documents</h3>
          {etudiant.documents.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun document pour l&apos;instant.</p>
          ) : (
            <ul className="mb-4 divide-y divide-slate-100">
              {etudiant.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <a
                      href={`/etudiants/${etudiant.id}/documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-slate-800 hover:underline"
                    >
                      {d.nomFichier}
                    </a>
                    <p className="text-xs text-slate-500">
                      {TYPE_DOCUMENT_LABELS[d.type]} ·{" "}
                      {new Date(d.creeLe).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <form action={supprimerDocumentAction}>
                    <input type="hidden" name="etudiantId" value={etudiant.id} />
                    <input type="hidden" name="documentId" value={d.id} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Supprimer
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form
            action={televerserDocumentAction}
            encType="multipart/form-data"
            className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"
          >
            <input type="hidden" name="etudiantId" value={etudiant.id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
              <select
                name="type"
                required
                defaultValue=""
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {Object.values(TypeDocument)
                  .filter((t) => t !== "DOSSIER_GENERE")
                  .map((t) => (
                    <option key={t} value={t}>
                      {TYPE_DOCUMENT_LABELS[t]}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Fichier</label>
              <input
                type="file"
                name="fichier"
                required
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Téléverser
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
