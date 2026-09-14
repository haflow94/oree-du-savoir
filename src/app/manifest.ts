import type { MetadataRoute } from "next";

// Raccourci "Ajouter à l'écran d'accueil" (Android/Chrome) : mêmes icônes
// que icon.tsx/apple-icon.tsx, dérivées du logo de l'association (voir
// lib/organisation.ts) — `sizes: "any"` car la taille réelle dépend du
// fichier téléversé depuis Administration → Organisation, jamais redimensionné.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "L'Orée du Savoir — Gestion",
    short_name: "Orée du Savoir",
    description: "Application de gestion administrative de l'association",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f6ee",
    theme_color: "#0a5a0a",
    icons: [
      { src: "/icon", sizes: "any", type: "image/png" },
      { src: "/apple-icon", sizes: "any", type: "image/png" },
    ],
  };
}
