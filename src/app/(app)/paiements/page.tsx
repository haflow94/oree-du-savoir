import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function PaiementsPage() {
  return (
    <PlaceholderScreen
      title="Paiements"
      phase="Phase 4 — à venir"
      description="Échéancier et paiements structurés, chèque, placeholder prélèvement, vue Étudiant | Dû | Échéances | Encaissé | Reste | Statut."
      pending={[
        "Montant dû porté par le dossier annuel (agrégé) plutôt que par cours, à confirmer",
        "États du cycle de vie du chèque (reçu / déposé / encaissé / rejeté), à valider",
      ]}
    />
  );
}
