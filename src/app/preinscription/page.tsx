import { prisma } from "@/lib/prisma";
import { PreinscriptionForm } from "./preinscription-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Champ } from "@/components/ui/champ";
import { Button } from "@/components/ui/button";
import {
  codeEstValide,
  estCodeAccueilAuto,
  MESSAGE_CODE_INVALIDE,
  MESSAGE_CODE_ACCUEIL_EXPIRE,
} from "@/lib/preinscription-code";
import { jetonPermanentEstValide, MESSAGE_JETON_INVALIDE } from "@/lib/preinscription-token";
import { adresseIpClient, limiteDebitDepassee } from "@/lib/rate-limit";

// Sans ceci, Next préoptimiserait la page en statique (aucun cookie/searchParams
// lu) : la liste des sections serait figée au moment du build Docker, pas
// relue en base à chaque visite — un tarif changé depuis Administration
// n'apparaîtrait jamais sur ce formulaire public sans reconstruire l'image.
export const dynamic = "force-dynamic";

// Petit formulaire GET (pas de JS nécessaire, cohérent avec le reste du
// formulaire) permettant de saisir un code manuellement — repli si le lien
// reçu par e-mail a été altéré par un client mail (le paramètre ?code=
// tronqué ou retiré), ou si le code accueil embarqué par
// /accueil-preinscription a expiré entre le scan et l'ouverture de la page.
// Réaffiché aussi bien en haut du formulaire ouvert (accès direct, URL sans
// code) qu'à la place du formulaire quand un code fourni dans l'URL s'avère
// invalide.
function FormulaireCode({ valeurInitiale }: { valeurInitiale?: string }) {
  return (
    <form action="/preinscription" method="GET" className="flex items-end gap-2">
      <Champ
        label="Code de préinscription reçu par e-mail (optionnel)"
        name="code"
        defaultValue={valeurInitiale}
        placeholder="XXXXX-XXXXX"
        className="flex-1"
      />
      <Button type="submit" variant="secondary">
        Valider
      </Button>
    </form>
  );
}

export default async function PreinscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; a?: string }>;
}) {
  const { code, a: jetonBrut } = await searchParams;

  // Vide par défaut (voir .env.example) : widget Turnstile non rendu, aucun
  // effet sur le formulaire — voir src/lib/turnstile.ts pour la vérification
  // côté serveur correspondante (elle aussi désactivée tant que
  // TURNSTILE_SECRET_KEY est vide). Clé publique, sans risque à transmettre
  // au client via les props (contrairement à TURNSTILE_SECRET_KEY, jamais lu
  // ici).
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || undefined;

  // Jeton permanent du QR officiel Internet (voir src/proxy.ts, qui réécrit
  // `/` en `/preinscription?a=...` sur le hostname public, et
  // src/lib/preinscription-token.ts) : contrairement à `code`, jamais
  // consommé, jamais affiché comme un « code » à l'utilisateur — seule sa
  // présence/validité conditionne l'affichage du formulaire ci-dessous. Le
  // proxy a déjà vérifié que `a` est présent avant de réécrire vers cette
  // page ; ici on vérifie sa validité réelle (hash en base), la seule chose
  // que le middleware Edge ne pouvait pas faire.
  let jetonValide = false;
  if (jetonBrut) {
    const ip = await adresseIpClient();
    if (limiteDebitDepassee(`preinscription-verif-jeton:${ip}`, 8, 10 * 60 * 1000)) {
      return (
        <div className="flex min-h-screen flex-1 justify-center bg-bg px-4 py-10">
          <div className="w-full max-w-lg">
            <Alert variant="warning">
              Trop de tentatives depuis cette connexion. Merci de réessayer dans
              quelques minutes.
            </Alert>
          </div>
        </div>
      );
    }

    jetonValide = await jetonPermanentEstValide(jetonBrut);
    if (!jetonValide) {
      return (
        <div className="flex min-h-screen flex-1 justify-center bg-bg px-4 py-10">
          <div className="w-full max-w-lg space-y-4">
            <div className="mb-4 text-center">
              <h1 className="font-display text-xl font-bold text-pine-strong">L&apos;Orée du Savoir</h1>
              <p className="mt-1 text-sm text-ink-muted">Préinscription en ligne</p>
            </div>
            <Alert variant="danger">{MESSAGE_JETON_INVALIDE}</Alert>
          </div>
        </div>
      );
    }
  }

  // Le code n'est un verrou QUE quand il est explicitement fourni dans
  // l'URL — soit un lien de campagne email, soit (depuis l'ajout de
  // /accueil-preinscription) le code accueil du jour embarqué par cette
  // redirection : son absence pure et simple (URL directe, sans passer par
  // le QR) laisse le formulaire ouvert, comportement historique volontaire.
  if (code) {
    const ip = await adresseIpClient();
    if (limiteDebitDepassee(`preinscription-verif-code:${ip}`, 8, 10 * 60 * 1000)) {
      return (
        <div className="flex min-h-screen flex-1 justify-center bg-bg px-4 py-10">
          <div className="w-full max-w-lg">
            <Alert variant="warning">
              Trop de tentatives depuis cette connexion. Merci de réessayer dans
              quelques minutes.
            </Alert>
          </div>
        </div>
      );
    }

    if (!(await codeEstValide(code))) {
      // Message dédié si le code invalide provient de la route accueil (déjà
      // consommé par une autre famille, ou expiré d'inactivité) : rescanner
      // suffit, contrairement à un lien email périmé — voir le commentaire
      // de MESSAGE_CODE_ACCUEIL_EXPIRE.
      const message = (await estCodeAccueilAuto(code)) ? MESSAGE_CODE_ACCUEIL_EXPIRE : MESSAGE_CODE_INVALIDE;
      return (
        <div className="flex min-h-screen flex-1 justify-center bg-bg px-4 py-10">
          <div className="w-full max-w-lg space-y-4">
            <div className="mb-4 text-center">
              <h1 className="font-display text-xl font-bold text-pine-strong">L&apos;Orée du Savoir</h1>
              <p className="mt-1 text-sm text-ink-muted">Préinscription en ligne</p>
            </div>
            <Alert variant="danger">{message}</Alert>
            <FormulaireCode valeurInitiale={code} />
          </div>
        </div>
      );
    }
  }

  const [sections, catalogue] = await Promise.all([
    prisma.section.findMany({ orderBy: { nom: "asc" } }),
    prisma.creneauSection.findMany({ orderBy: [{ sectionId: "asc" }, { ordre: "asc" }] }),
  ]);

  // Catalogue des créneaux (CS/S/D + restriction, voir Administration →
  // Sections) : la préinscription propose toujours ce catalogue générique,
  // jamais une Classe réelle (matière/niveau précis) — la classe exacte
  // reste un choix du staff à la confirmation sur place, quelle que soit la
  // section (voir preinscription-form.tsx et actions.ts).
  const creneaux = catalogue.map((c) => ({
    id: c.id,
    sectionId: c.sectionId,
    label: `${c.code} — ${c.jour}, ${c.horaire}${c.restriction ? ` (${c.restriction})` : ""}`,
  }));

  return (
    <div className="flex min-h-screen flex-1 justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="font-display text-xl font-bold text-pine-strong">L&apos;Orée du Savoir</h1>
          <p className="mt-1 text-sm text-ink-muted">Préinscription en ligne</p>
        </div>

        {sections.length === 0 ? (
          <EmptyState
            message="La préinscription en ligne n'est pas encore disponible."
            hint="Merci de contacter directement l'association."
          />
        ) : code ? (
          // Code déjà vérifié valide ci-dessus : embarqué en champ caché
          // pour être consommé à la soumission (voir preinscription/actions.ts).
          <>
            <Alert variant="success">Code vérifié. Vous pouvez compléter votre dossier ci-dessous.</Alert>
            <div className="mt-4">
              <PreinscriptionForm
                sections={sections.map((s) => ({ id: s.id, nom: s.nom, catalogueNiveaux: s.catalogueNiveaux }))}
                creneaux={creneaux}
                code={code}
                turnstileSiteKey={turnstileSiteKey}
              />
            </div>
          </>
        ) : jetonValide ? (
          // Jeton permanent du QR officiel déjà vérifié valide ci-dessus :
          // pas de code à consommer, pas de champ de saisie manuelle à
          // proposer — l'utilisateur atterrit directement sur le formulaire.
          <PreinscriptionForm
            sections={sections.map((s) => ({ id: s.id, nom: s.nom, catalogueNiveaux: s.catalogueNiveaux }))}
            creneaux={creneaux}
            turnstileSiteKey={turnstileSiteKey}
          />
        ) : (
          <>
            <div className="mb-6">
              <FormulaireCode />
            </div>
            <PreinscriptionForm
              sections={sections.map((s) => ({ id: s.id, nom: s.nom, catalogueNiveaux: s.catalogueNiveaux }))}
              creneaux={creneaux}
              turnstileSiteKey={turnstileSiteKey}
            />
          </>
        )}

        <p className="mt-6 text-center text-xs text-ink-faint">
          Cette préinscription n&apos;est pas définitive : elle sera confirmée
          sur place (signature, documents, paiement).
        </p>
      </div>
    </div>
  );
}
