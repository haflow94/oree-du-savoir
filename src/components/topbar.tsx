"use client";

import { useEffect, useRef, useTransition } from "react";
import { Menu, Search, LogOut, Bell } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { logoutAction } from "@/app/(app)/logout-action";
import { marquerNotificationPreinscriptionLueAction } from "@/app/(app)/inscriptions/actions";

// Intervalle de rafraîchissement léger (voir plus bas) : assez court pour
// qu'une nouvelle préinscription apparaisse « automatiquement » dans un
// onglet déjà ouvert sans attendre une action de l'utilisateur, assez long
// pour rester négligeable en charge sur une petite appli associative — pas
// de WebSocket/SSE nécessaire à ce volume (voir l'audit du flux
// "nouvelle préinscription").
const INTERVALLE_RAFRAICHISSEMENT_MS = 25_000;

export type NotificationPreinscriptionTopbar = {
  id: string;
  etudiantId: string;
  nom: string;
  prenom: string;
  creeLe: Date;
  lue: boolean;
};

type TopbarProps = {
  nom: string;
  prenom: string;
  role: Role;
  /**
   * Href déjà filtrés selon les droits de la session (voir (app)/layout.tsx).
   * Uniquement des chaînes : NAV_ITEMS (avec ses icônes, non sérialisables)
   * reste importé ici côté client plutôt que transmis en prop depuis le
   * Server Component.
   */
  hrefsVisibles: string[];
  anneeActive: string | null;
  /** Compte non lu POUR CET UTILISATEUR (voir (app)/layout.tsx) — jamais un état partagé entre membres du staff. */
  nombreNotificationsNonLues: number;
  /** Dernières notifications (lues ou non), état de lecture déjà calculé pour cet utilisateur. */
  dernieresNotifications: NotificationPreinscriptionTopbar[];
};

export function Topbar({
  nom,
  prenom,
  role,
  hrefsVisibles,
  anneeActive,
  nombreNotificationsNonLues,
  dernieresNotifications,
}: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  // La navigation déclenchée par un <Link> dans le dropdown est côté client
  // (SPA) : le DOM du <details> n'est jamais démonté, donc son attribut
  // `open` persiste après le clic si on ne le referme pas explicitement.
  const notificationsDetailsRef = useRef<HTMLDetailsElement>(null);
  const items = NAV_ITEMS.filter((item) => hrefsVisibles.includes(item.href));
  const current =
    items.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
    ) ?? items[0];

  // Polling léger : router.refresh() ré-exécute les Server Components de la
  // route courante (layout inclus), sans rechargement navigateur — c'est ce
  // qui fait apparaître une nouvelle préinscription sur un onglet /inscriptions
  // déjà ouvert, et met à jour ce compteur partout dans l'app. Ne dépend ni
  // de n8n ni d'aucune connexion persistante (pas de WebSocket/SSE) : un
  // simple minuteur, qui se contente de redemander l'état actuel à
  // intervalles réguliers — se remet de lui-même après un redémarrage du
  // conteneur ou une coupure réseau passagère, sans reconnexion à gérer.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVALLE_RAFRAICHISSEMENT_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <header className="sticky top-0 z-10 flex flex-col border-b border-border bg-bg-elevated print:hidden">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex items-center gap-3">
          {/* Menu mobile : disclosure HTML pur, pas de JS nécessaire */}
          <details className="md:hidden">
            <summary className="list-none cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-ink-muted">
              <Menu aria-hidden size={18} />
            </summary>
            <div className="absolute left-0 right-0 top-16 z-20 border-b border-border bg-bg-elevated p-3 shadow-elevated">
              <nav className="flex flex-col gap-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink hover:bg-pine-soft"
                    >
                      <Icon aria-hidden size={17} strokeWidth={1.75} />
                      {item.label}
                    </a>
                  );
                })}
              </nav>
            </div>
          </details>
          <h1 className="font-display text-lg font-semibold text-pine-strong md:text-xl">
            {current?.label ?? "Tableau de bord"}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <form action="/recherche" method="GET" className="hidden sm:block">
            <label className="relative block">
              <Search
                aria-hidden
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                name="q"
                placeholder="Rechercher…"
                className="w-40 rounded-md border border-border py-1.5 pl-8 pr-3 text-sm text-ink transition-all focus:w-56 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-soft"
              />
            </label>
          </form>
          {anneeActive && (
            <span className="hidden rounded-full bg-pine-soft px-3 py-1 text-xs font-medium text-pine-strong sm:inline-block">
              Année active : {anneeActive}
            </span>
          )}

          {/* Cloche de notifications (préinscriptions) : disclosure HTML pur
              (même mécanisme que le menu mobile ci-dessus), pas de state
              React nécessaire pour ouvrir/fermer. N'apparaît que pour les
              rôles ayant LECTURE sur Module.INSCRIPTIONS — voir
              (app)/layout.tsx, qui passe alors des tableaux non vides. */}
          {(dernieresNotifications.length > 0 || nombreNotificationsNonLues > 0) && (
            <details ref={notificationsDetailsRef} className="relative">
              <summary
                className="relative flex list-none cursor-pointer items-center rounded-md border border-border p-1.5 text-ink-muted transition-colors hover:bg-bg-sunken"
                aria-label="Notifications"
              >
                <Bell aria-hidden size={16} />
                {nombreNotificationsNonLues > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ochre px-1 text-[10px] font-semibold text-on-accent">
                    {nombreNotificationsNonLues > 9 ? "9+" : nombreNotificationsNonLues}
                  </span>
                )}
              </summary>
              <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-lg border border-border bg-bg-elevated shadow-elevated">
                <div className="border-b border-border px-4 py-2.5 text-xs font-semibold text-ink-muted">
                  Nouvelles préinscriptions
                </div>
                <ul className="max-h-96 overflow-y-auto">
                  {dernieresNotifications.length === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-ink-faint">
                      Aucune notification pour l&apos;instant.
                    </li>
                  )}
                  {dernieresNotifications.map((notif) => (
                    <li key={notif.id} className="border-b border-border last:border-b-0">
                      <Link
                        href={`/etudiants/${notif.etudiantId}`}
                        onClick={() => {
                          // Fire-and-forget : la navigation ne doit pas
                          // attendre la confirmation serveur. Le compteur se
                          // met ensuite à jour via le polling ci-dessus
                          // (router.refresh()), pas par un revalidatePath
                          // dédié ici.
                          startTransition(() => {
                            marquerNotificationPreinscriptionLueAction(notif.id);
                          });
                          if (notificationsDetailsRef.current) {
                            notificationsDetailsRef.current.open = false;
                          }
                        }}
                        className={`flex items-start gap-2 px-4 py-2.5 text-sm hover:bg-bg-sunken ${
                          notif.lue ? "text-ink-muted" : "text-ink"
                        }`}
                      >
                        {!notif.lue && (
                          <span
                            aria-hidden
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ochre"
                          />
                        )}
                        <span className={notif.lue ? "ml-3.5" : ""}>
                          <span className="font-medium">
                            {notif.prenom} {notif.nom}
                          </span>
                          <span className="block text-xs text-ink-faint">
                            {notif.creeLe.toLocaleString("fr-FR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/inscriptions"
                  onClick={() => {
                    if (notificationsDetailsRef.current) {
                      notificationsDetailsRef.current.open = false;
                    }
                  }}
                  className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-pine-strong hover:bg-bg-sunken"
                >
                  Voir toutes les préinscriptions
                </Link>
              </div>
            </details>
          )}

          <div className="hidden text-right text-xs leading-tight sm:block">
            <div className="font-medium text-ink">
              {prenom} {nom}
            </div>
            <div className="text-ink-faint">{ROLE_LABELS[role]}</div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-bg-sunken"
            >
              <LogOut aria-hidden size={14} />
              Déconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
