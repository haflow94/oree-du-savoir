import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function TresoreriePage() {
  return (
    <PlaceholderScreen
      title="Trésorerie"
      phase="Phase 5 — à venir"
      description="Mouvements recette/dépense, justificatif optionnel, solde calculé en cumul. Volontairement simple : pas de comptabilité complète."
      pending={[
        "Liste définitive des moyens (espèces/chèque/virement/CB) et catégories de mouvement, à valider",
      ]}
    />
  );
}
