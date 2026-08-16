import Link from "next/link";

export default function AccesRefusePage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-slate-100 px-4">
      <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Accès refusé</h1>
        <p className="mt-2 text-sm text-slate-600">
          Votre rôle ne permet pas d&apos;accéder à cette page.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
