// Fonction pure, séparée de context.ts (qui porte `import "server-only"`)
// pour rester testable sans DB — même principe que relation-legale.ts.
//
// Détermine si le créneau catalogue (CreneauSection, donnée affichée sur le
// dossier) correspond au créneau réel de la Classe suivie par l'étudiant,
// pour cocher automatiquement la bonne carte sur le dossier généré depuis
// sa fiche (jamais sur un dossier vierge, qui reste entièrement manuscrit).
// Rapprochement au mieux entre deux systèmes indépendants (jour/horaire en
// texte libre côté catalogue, JourSemaine + heures côté Classe) : pas de
// garantie de correspondance stricte si le texte du catalogue s'écarte du
// format "mardi et jeudi" / "19h00 – 21h00" attendu.
import { JOUR_LABELS } from "@/lib/planning";
import type { JourSemaine } from "@/generated/prisma/enums";

function versHeureLibelle(heure: string): string {
  const [h, m] = heure.split(":");
  return `${h}h${m}`;
}

export function estCreneauChoisi(
  creneau: { jour: string; horaire: string },
  classe: { jour: JourSemaine; heureDebut: string; heureFin: string },
): boolean {
  const jourClasse = JOUR_LABELS[classe.jour].toLowerCase();
  if (!creneau.jour.toLowerCase().includes(jourClasse)) return false;

  const horaireCreneau = creneau.horaire.toLowerCase().replace(/\s/g, "");
  const debut = versHeureLibelle(classe.heureDebut).toLowerCase();
  const fin = versHeureLibelle(classe.heureFin).toLowerCase();
  return horaireCreneau.includes(debut) && horaireCreneau.includes(fin);
}

// Détermine la carte de créneau à cocher sur le dossier généré, avec le bon
// ordre de priorité entre les deux seules sources possibles — jamais
// simultanément actives pour une même section (voir Etudiant.creneauSouhaiteId,
// prisma/schema.prisma) :
// 1. Le choix explicite fait à la préinscription (creneauSouhaiteId) tant
//    qu'aucune inscription effective n'a eu lieu — c'est le cas le plus
//    fréquent : le dossier est généré et peut être signé dès la
//    préinscription (voir preinscription/actions.ts), bien avant qu'une
//    Classe réelle n'existe (règle "signature ≠ validation finale").
// 2. À défaut (creneauSouhaiteId vaut null) : la classe réellement suivie
//    (estCreneauChoisi ci-dessus) — inscrireEtudiantAction efface
//    systématiquement creneauSouhaiteId au moment où il pose l'inscription
//    effective (voir presences/actions.ts), donc les deux sources ne sont
//    jamais en concurrence pour un même étudiant/section : pas de risque de
//    cocher une carte périmée après un changement d'horaire décidé par
//    l'administration.
export function estCreneauCoche(
  creneau: { id: string; jour: string; horaire: string },
  {
    creneauSouhaiteId,
    classesSuivies,
  }: {
    creneauSouhaiteId: string | null;
    classesSuivies: { jour: JourSemaine; heureDebut: string; heureFin: string }[];
  },
): boolean {
  if (creneauSouhaiteId) return creneau.id === creneauSouhaiteId;
  return classesSuivies.some((classe) => estCreneauChoisi(creneau, classe));
}
