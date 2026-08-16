import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { peutAccederClasse } from "@/lib/acces-presence";
import { aujourdhuiUTC } from "@/lib/presences";

/**
 * Cible du QR affiché en salle. Le QR est un raccourci d'accès, jamais une
 * authentification (règle non négociable) : sans session valide, on renvoie
 * vers /login, et l'accès à la classe est vérifié comme partout ailleurs.
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
        Vérifiez le planning, ou passez par la liste des présences.
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

  redirect(`/presences/${seance.id}`);
}

function Message({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-base font-semibold text-slate-900">{titre}</h1>
        <p className="mt-2 text-sm text-slate-600">{children}</p>
        <Link
          href="/presences"
          className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Voir les présences
        </Link>
      </div>
    </div>
  );
}
