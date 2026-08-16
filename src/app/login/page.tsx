import { loginAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  IDENTIFIANTS_INVALIDES: "Email ou mot de passe incorrect.",
  COMPTE_DESACTIVE: "Ce compte a été désactivé. Contactez un administrateur.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">
            L&apos;Orée du Savoir
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Application de gestion administrative
          </p>
        </div>

        <form
          action={loginAction}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <input type="hidden" name="from" value={from ?? "/"} />

          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errorMessage}
            </p>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="motDePasse"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Mot de passe
            </label>
            <input
              id="motDePasse"
              name="motDePasse"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Se connecter
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Accès réservé aux membres de l&apos;association. Les comptes sont
          créés par un administrateur.
        </p>
      </div>
    </div>
  );
}
