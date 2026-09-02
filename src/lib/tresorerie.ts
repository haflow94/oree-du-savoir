import { prisma } from "@/lib/prisma";

// Clé technique stable (jamais le nom affiché, renommable depuis
// Administration → Trésorerie) identifiant la catégorie de trésorerie
// alimentée automatiquement par les encaissements (voir
// enregistrerPaiementAction, paiements/[id]/actions.ts).
export const CLE_CATEGORIE_COTISATIONS = "cotisations_paiements";
const NOM_CATEGORIE_COTISATIONS = "Cotisations";

export async function getOuCreerCategorieCotisations() {
  const parCle = await prisma.categorieMouvement.findUnique({
    where: { cle: CLE_CATEGORIE_COTISATIONS },
  });
  if (parCle) return parCle;

  // Compatible avec une catégorie "Cotisations" déjà existante (seed démo,
  // ou créée à la main avant cette fonctionnalité) : on la rattache plutôt
  // que de violer la contrainte unique sur `nom` en recréant un doublon.
  const parNom = await prisma.categorieMouvement.findUnique({
    where: { nom: NOM_CATEGORIE_COTISATIONS },
  });
  if (parNom) {
    return prisma.categorieMouvement.update({
      where: { id: parNom.id },
      data: { cle: CLE_CATEGORIE_COTISATIONS },
    });
  }

  return prisma.categorieMouvement.create({
    data: { cle: CLE_CATEGORIE_COTISATIONS, nom: NOM_CATEGORIE_COTISATIONS },
  });
}
