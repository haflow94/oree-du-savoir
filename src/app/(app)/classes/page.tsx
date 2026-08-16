import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function ClassesPage() {
  return (
    <PlaceholderScreen
      title="Classes"
      phase="Phase 1 puis Phase 3 (présence) — à venir"
      description="Cours, classes, créneaux, enseignants, capacité. La présence (QR, séances, validation) arrive avec la Phase 3."
      pending={[
        "Structure Cours / Niveau-Section / Classe (niveau = attribut simple, à confirmer)",
        "Un seul créneau hebdomadaire par classe pour le MVP, à valider",
        "Plusieurs enseignants par classe : usage réel à confirmer",
      ]}
    />
  );
}
