import { prisma } from "@/lib/prisma";
import { resoudreAccesDossier } from "@/lib/acces-dossier";
import { DossierVerification } from "./dossier-verification";

// Page publique, sans authentification, sans compte ni mot de passe (voir
// CLAUDE.md/analyse de conversation — "page sécurisée minimale") : l'accès
// tient entièrement au token de l'URL (voir lib/acces-dossier.ts). Message
// volontairement générique en cas de token invalide/expiré/révoqué — même
// principe que MESSAGE_JETON_INVALIDE (preinscription-token.ts) — pour ne
// rien révéler à qui essaierait de deviner un lien.
export default async function DossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { token } = await params;
  const { erreur } = await searchParams;
  const resolution = await resoudreAccesDossier(token);

  if (!resolution.valide) {
    return (
      <Message titre="Lien invalide">
        Ce lien n&apos;est plus valide. Merci de contacter l&apos;association pour recevoir un
        nouveau lien vers votre dossier.
      </Message>
    );
  }

  const dossier = await prisma.dossierAnnuel.findUnique({
    where: { id: resolution.dossierAnnuelId },
    include: {
      etudiant: { include: { responsables: { orderBy: { creeLe: "asc" } } } },
      demandesCorrection: { orderBy: { creeLe: "desc" } },
    },
  });
  if (!dossier) {
    return (
      <Message titre="Dossier introuvable">
        Ce dossier n&apos;existe plus. Merci de contacter l&apos;association.
      </Message>
    );
  }

  const derniereVersion = await prisma.document.findFirst({
    where: { dossierAnnuelId: dossier.id, type: "DOSSIER_GENERE" },
    orderBy: { numeroVersion: "desc" },
  });

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <DossierVerification
          token={token}
          erreurUrl={erreur}
          etudiant={{
            nom: dossier.etudiant.nom,
            prenom: dossier.etudiant.prenom,
            niveauDeclare: dossier.etudiant.niveauDeclare,
            telephoneMobile: dossier.etudiant.telephoneMobile,
            telephoneFixe: dossier.etudiant.telephoneFixe,
            email: dossier.etudiant.email,
            adresse: dossier.etudiant.adresse,
            complementAdresse: dossier.etudiant.complementAdresse,
            codePostal: dossier.etudiant.codePostal,
            ville: dossier.etudiant.ville,
            contactUrgence: dossier.etudiant.contactUrgence,
          }}
          statutSignature={dossier.statutSignature}
          numeroVersionActuelle={derniereVersion?.numeroVersion ?? null}
          versionConfirmeeNumero={dossier.versionConfirmeeNumero}
          demandesCorrectionOuvertes={dossier.demandesCorrection.filter((d) => !d.traiteeLe).length}
        />
      </div>
    </div>
  );
}

function Message({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-6 text-center shadow-card">
        <h1 className="font-display text-base font-semibold text-pine-strong">{titre}</h1>
        <p className="mt-2 text-sm text-ink-muted">{children}</p>
      </div>
    </div>
  );
}
