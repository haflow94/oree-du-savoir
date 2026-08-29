import { prisma } from "@/lib/prisma";
import { requireModule, Module } from "@/lib/permissions";
import { modifierOrganisationAction } from "./actions";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle } from "@/components/ui/card";
import { Champ } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const MESSAGES: Record<string, string> = {
  CHAMPS_INVALIDES: "Le nom de l'association est obligatoire.",
  INTROUVABLE: "Organisation introuvable — relancer le seed (npm run db:seed).",
  LOGO_FORMAT_INVALIDE: "Format de logo non pris en charge (PNG, JPG, SVG ou WebP).",
};

export default async function OrganisationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireModule(Module.ADMINISTRATION, "ECRITURE");
  const { error, ok } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  const organisation = await prisma.organisation.findFirst();

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/administration" label="Administration" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-pine-strong">Organisation</h1>
        <p className="text-sm text-ink-muted">
          Identité de l&apos;association utilisée dans les dossiers
          d&apos;inscription générés (nom, coordonnées, logo) — jamais codée
          en dur dans les modèles.
        </p>
      </div>

      {message && <Alert variant="danger">{message}</Alert>}
      {ok && !message && <Alert variant="success">Modification enregistrée.</Alert>}

      {!organisation ? (
        <Alert variant="danger">Aucune organisation en base — exécuter le seed (npm run db:seed).</Alert>
      ) : (
        <Card>
          <CardTitle>Identité</CardTitle>
          <form
            action={modifierOrganisationAction}
            className="mt-3 grid gap-3 sm:grid-cols-2"
            encType="multipart/form-data"
          >
            <input type="hidden" name="organisationId" value={organisation.id} />
            <Champ label="Nom" name="nom" required defaultValue={organisation.nom} className="sm:col-span-2" />
            <Champ
              label="Sous-titre (optionnel)"
              name="sousTitre"
              defaultValue={organisation.sousTitre ?? ""}
              placeholder="ex. Institut des cultures et des savoirs · Créteil"
              className="sm:col-span-2"
            />
            <Champ label="Adresse" name="adresse" defaultValue={organisation.adresse ?? ""} className="sm:col-span-2" />
            <Champ label="Code postal" name="codePostal" defaultValue={organisation.codePostal ?? ""} />
            <Champ label="Ville" name="ville" defaultValue={organisation.ville ?? ""} />
            <Champ label="Téléphone" name="telephone" defaultValue={organisation.telephone ?? ""} />
            <Champ label="Email" name="email" type="email" defaultValue={organisation.email ?? ""} />
            <Champ label="SIRET" name="siret" defaultValue={organisation.siret ?? ""} />
            <Champ label="NAF" name="naf" defaultValue={organisation.naf ?? ""} />

            <div className="sm:col-span-2">
              <p className="mb-1 block text-sm font-medium text-ink">Logo</p>
              <div className="flex items-center gap-4">
                {organisation.logoCheminRelatif && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/administration/organisation/logo"
                    alt="Logo actuel"
                    className="h-16 w-16 rounded-md border border-border object-contain p-1"
                  />
                )}
                <input
                  type="file"
                  name="logo"
                  accept=".png,.jpg,.jpeg,.svg,.webp"
                  className="text-sm text-ink-muted"
                />
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                PNG, JPG, SVG ou WebP. Remplacer le fichier suffit : les
                modèles de dossier l&apos;utilisent automatiquement.
              </p>
            </div>

            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" variant="primary">
                Enregistrer
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
