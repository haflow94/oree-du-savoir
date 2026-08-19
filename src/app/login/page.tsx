import { loginAction } from "./actions";
import { Champ } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

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
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-xl font-bold text-pine-strong">
            L&apos;Orée du Savoir
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Application de gestion administrative
          </p>
        </div>

        <form
          action={loginAction}
          className="space-y-4 rounded-xl border border-border bg-bg-elevated p-6 shadow-card"
        >
          <input type="hidden" name="from" value={from ?? "/"} />

          {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}

          <Champ label="Email" name="email" type="email" autoComplete="username" required />
          <Champ
            label="Mot de passe"
            name="motDePasse"
            type="password"
            autoComplete="current-password"
            required
          />

          <Button type="submit" variant="primary" className="w-full">
            Se connecter
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-faint">
          Accès réservé aux membres de l&apos;association. Les comptes sont
          créés par un administrateur.
        </p>
      </div>
    </div>
  );
}
