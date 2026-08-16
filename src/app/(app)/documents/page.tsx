import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function DocumentsPage() {
  return (
    <PlaceholderScreen
      title="Documents"
      phase="Phase 2 — à venir"
      description="Fichiers stockés séparément de la base (métadonnées seulement en base), classés par étudiant/inscription/trésorerie. Visualisation intégrée, pas de GED avancée."
      pending={[
        "Liste exacte des types de documents attendus pour le MVP",
      ]}
    />
  );
}
