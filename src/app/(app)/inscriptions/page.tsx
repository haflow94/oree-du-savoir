import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function InscriptionsPage() {
  return (
    <PlaceholderScreen
      title="Inscriptions"
      phase="Phase 2 — à venir"
      description="Préinscription publique, dossier annuel, documents + moyen de paiement, contrôle, validation, réinscription."
      pending={[
        "Liste exacte des documents attendus (identité/photo/paiement vs assurance/fiche sanitaire/dossier signé)",
        "Gabarit du dossier officiel (aucun fichier modèle fourni pour l'instant)",
      ]}
    />
  );
}
