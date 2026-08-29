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
