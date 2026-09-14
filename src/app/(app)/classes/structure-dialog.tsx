"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { CoursPanel } from "./cours-panel";
import { CohortePanel } from "./cohorte-panel";
import { JOURS_ORDONNES } from "@/lib/planning";

type Onglet = "cours" | "cohortes";

type Cours = {
  id: string;
  nom: string;
  section: { id: string; nom: string };
  _count: { cohortesLiees: number; classes: number };
};
type Section = { id: string; nom: string };
type Cohorte = {
  id: string;
  section: Section;
  niveau: string | null;
  jour: (typeof JOURS_ORDONNES)[number];
  capacite: { capaciteMax: number | null; salleNom: string | null } | null;
  cours: { id: string; nom: string }[];
  _count: { classes: number };
};

// Mémorise l'onglet actif juste avant qu'un formulaire interne (créer/modifier/
// supprimer un Cours ou une Cohorte) ne déclenche le redirect serveur qui
// remonte ce composant : sans ça, chaque action refermait la popup et
// ramenait toujours à l'état par défaut — obligeant à rouvrir puis
// re-sélectionner l'onglet à chaque ajout. Posé/lu une seule fois par cycle
// (voir useEffect ci-dessous), jamais laissé traîner au-delà.
const ONGLET_STORAGE_KEY = "classes:structureModalOnglet";

// Regroupe les popups "Cours" et "Cohortes" — jusqu'ici deux boutons/modals
// distincts (cours-dialog.tsx / cohorte-dialog.tsx) alors que gérer une
// Cohorte suppose presque toujours d'aller-retourner vers les Cours (voir
// git history). Un seul déclencheur, deux onglets, popup qui reste ouverte
// (sur le bon onglet) après chaque action au lieu de se refermer.
export function StructureDialog({
  cours,
  cohortes,
  sections,
  joursActifs,
  peutGerer,
  ongletAuChargement,
}: {
  cours: Cours[];
  cohortes: Cohorte[];
  sections: Section[];
  joursActifs: (typeof JOURS_ORDONNES)[number][];
  peutGerer: boolean;
  /** Onglet à ouvrir automatiquement si une erreur Cours/Cohorte revient dans l'URL. */
  ongletAuChargement: Onglet | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [onglet, setOnglet] = useState<Onglet>(ongletAuChargement ?? "cours");

  useEffect(() => {
    let ongletMemorise: string | null = null;
    try {
      ongletMemorise = sessionStorage.getItem(ONGLET_STORAGE_KEY);
      sessionStorage.removeItem(ONGLET_STORAGE_KEY);
    } catch {
      // sessionStorage indisponible : pas de réouverture automatique, la
      // popup reste simplement fermée par défaut.
    }
    if (ongletAuChargement) {
      setOnglet(ongletAuChargement);
      dialogRef.current?.showModal();
    } else if (ongletMemorise === "cours" || ongletMemorise === "cohortes") {
      setOnglet(ongletMemorise);
      dialogRef.current?.showModal();
    }
    // ongletAuChargement ne change pas pendant la vie du composant (nouveau
    // montage à chaque navigation) : la dépendance ne redéclenche jamais
    // l'effet en pratique, juste pour satisfaire exhaustive-deps.
  }, [ongletAuChargement]);

  function memoriserOngletAvantEnvoi() {
    try {
      sessionStorage.setItem(ONGLET_STORAGE_KEY, onglet);
    } catch {
      // Dégrade simplement en "ne rouvre pas automatiquement".
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "secondary" })}
      >
        Cours & cohortes
      </button>
      <ModalShell
        dialogRef={dialogRef}
        maxWidth="max-w-2xl"
        title={
          <div className="flex gap-1 rounded-lg bg-bg-sunken p-1">
            <OngletBouton actif={onglet === "cours"} onClick={() => setOnglet("cours")}>
              Cours ({cours.length})
            </OngletBouton>
            <OngletBouton actif={onglet === "cohortes"} onClick={() => setOnglet("cohortes")}>
              Cohortes ({cohortes.length})
            </OngletBouton>
          </div>
        }
      >
        <div onSubmit={memoriserOngletAvantEnvoi}>
          {onglet === "cours" ? (
            <CoursPanel cours={cours} sections={sections} peutGerer={peutGerer} />
          ) : (
            <CohortePanel
              cohortes={cohortes}
              cours={cours}
              sections={sections}
              joursActifs={joursActifs}
              peutGerer={peutGerer}
            />
          )}
        </div>
      </ModalShell>
    </>
  );
}

function OngletBouton({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        actif ? "bg-bg-elevated text-pine-strong shadow-sm" : "text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
