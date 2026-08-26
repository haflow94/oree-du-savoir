import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { peutAccederClasse } from "@/lib/acces-presence";
import { resoudreSeanceDuJourPourSalle, type CandidatSeanceSalle } from "@/lib/qr";
import { QuitterButton } from "@/components/ui/quitter-button";

/**
 * Cible du QR affiché en salle quand ce QR représente la salle elle-même
 * (un seul code fixe, jamais changé entre les cours qui s'y succèdent —
 * contrainte physique de l'association, voir src/lib/qr.ts) plutôt qu'une
 * classe précise comme /qr/[token]. Même règle non négociable : le QR est un
 * raccourci d'accès, jamais une authentification.
 */
export default async function QrSallePage({
  params,
}: {
  params: Promise<{ salle: string }>;
}) {
  const { salle } = await params;
  const salleDecodee = decodeURIComponent(salle);
  const session = await getSession();

  if (!session) {
    redirect(`/login?from=${encodeURIComponent(`/qr-salle/${salle}`)}`);
  }

  // Session restreinte à une séance (connexion via QR, voir requireSession
  // dans src/lib/auth.ts) : toujours renvoyée vers sa propre séance, quel
  // que soit le QR scanné ensuite — jamais vers cette salle.
  if (session.seanceRestreinteId) {
    redirect(`/appel/${session.seanceRestreinteId}`);
  }

  const resolution = await resoudreSeanceDuJourPourSalle(salleDecodee);

  if (resolution.trouvee) {
    if (!(await peutAccederClasse(session, resolution.classeId))) {
      redirect("/acces-refuse");
    }
    redirect(`/appel/${resolution.seanceId}`);
  }

  if (resolution.raison === "SALLE_INCONNUE") {
    return (
      <Message titre="Salle inconnue">
        Aucune classe n&apos;est rattachée à la salle « {salleDecodee} ». Ce
        QR a peut-être été affiché dans la mauvaise salle, ou la salle a été
        renommée depuis la fiche de la classe.
      </Message>
    );
  }

  if (resolution.raison === "PAS_DE_SEANCE") {
    return (
      <Message titre={`${salleDecodee} — pas de séance aujourd'hui`}>
        Aucune séance n&apos;est prévue dans cette salle aujourd&apos;hui.
      </Message>
    );
  }

  // AMBIGU : plusieurs cours ont une séance aujourd'hui dans cette salle et
  // l'heure actuelle ne permet pas de trancher seule (avant/après tous les
  // créneaux, ou chevauchement) — jamais deviner, on demande de choisir.
  // Filtré aux classes réellement accessibles à cette session : un
  // enseignant ne doit voir ni pouvoir choisir la classe d'un collègue.
  const candidatsAutorises: CandidatSeanceSalle[] = [];
  for (const candidat of resolution.candidats) {
    if (await peutAccederClasse(session, candidat.classeId)) {
      candidatsAutorises.push(candidat);
    }
  }

  if (candidatsAutorises.length === 0) {
    redirect("/acces-refuse");
  }

  if (candidatsAutorises.length === 1) {
    redirect(`/appel/${candidatsAutorises[0].seanceId}`);
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-6 text-center shadow-card">
        <h1 className="font-display text-base font-semibold text-pine-strong">
          {salleDecodee} — plusieurs cours aujourd&apos;hui
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Choisissez le cours pour lequel faire l&apos;appel.
        </p>
        <ul className="mt-4 space-y-2 text-left">
          {candidatsAutorises.map((c) => (
            <li key={c.seanceId}>
              <a
                href={`/appel/${c.seanceId}`}
                className="block rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-bg-sunken"
              >
                <span className="font-medium text-ink">
                  {c.heureDebut}–{c.heureFin} · {c.coursNom}
                  {c.niveau && ` — ${c.niveau}`}
                </span>
                <span className="block text-xs text-ink-faint">{c.enseignants}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <QuitterButton className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-bg-sunken" />
        </div>
      </div>
    </div>
  );
}

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
        <div className="mt-4">
          <QuitterButton className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-bg-sunken" />
        </div>
      </div>
    </div>
  );
}
