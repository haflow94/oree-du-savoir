import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { peutAccederClasse } from "@/lib/acces-presence";
import { aujourdhuiUTC } from "@/lib/presences";
import { logoutAction } from "@/app/(app)/logout-action";

/**
 * Cible du QR affiché en salle. Le QR est un raccourci d'accès, jamais une
 * authentification (règle non négociable) : sans session valide, on renvoie
 * vers /login, et l'accès à la classe est vérifié comme partout ailleurs.
 * Une fois la séance trouvée, direction /appel/{id} — une page isolée, sans
 * aucun lien vers le reste de l'appli (voir src/app/appel/[seanceId]).
 */
export default async function QrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`/login?from=${encodeURIComponent(`/qr/${token}`)}`);
  }

  // Session restreinte à une séance (connexion via QR, voir requireSession
  // dans src/lib/auth.ts) : toujours renvoyée vers sa propre séance, quel
  // que soit le QR scanné ensuite — jamais vers la classe de ce nouveau token.
  if (session.seanceRestreinteId) {
    redirect(`/appel/${session.seanceRestreinteId}`);
  }

  const classe = await prisma.classe.findUnique({
    where: { qrToken: token },
    include: { cours: true },
  });

  if (!classe) {
    return (
      <Message titre="QR code inconnu">
        Ce QR code ne correspond à aucune classe. Il a peut-être été régénéré.
      </Message>
    );
  }

  if (!(await peutAccederClasse(session, classe.id))) {
    redirect("/acces-refuse");
  }

  const seance = await prisma.seance.findUnique({
    where: { classeId_date: { classeId: classe.id, date: aujourdhuiUTC() } },
  });

  if (!seance) {
    return (
      <Message titre={`${classe.cours.nom} — pas de séance aujourd'hui`}>
        Aucune séance n&apos;est prévue pour cette classe aujourd&apos;hui.
      </Message>
    );
  }

  if (seance.statut === "ANNULEE") {
    return (
      <Message titre={`${classe.cours.nom} — séance annulée`}>
        La séance du jour a été annulée
        {seance.motifAnnulation ? ` (${seance.motifAnnulation})` : ""}.
      </Message>
    );
  }

  redirect(`/appel/${seance.id}`);
}

// Pas de lien vers le reste de l'appli, même ici : seule sortie possible,
// se déconnecter — voir la règle sur /appel/[seanceId].
function Message({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-6 text-center shadow-card">
        <h1 className="font-display text-base font-semibold text-pine-strong">{titre}</h1>
        <p className="mt-2 text-sm text-ink-muted">{children}</p>
        <form action={logoutAction} className="mt-4">
          <button
            type="submit"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-bg-sunken"
          >
            Quitter
          </button>
        </form>
      </div>
    </div>
  );
}
