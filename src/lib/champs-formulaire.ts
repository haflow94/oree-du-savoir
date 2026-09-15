// Règles de format partagées par tous les formulaires de l'application pour
// les quelques types de champs qui reviennent partout (email, téléphone,
// code postal) : une seule source pour la regex, réutilisée à la fois comme
// attribut HTML `pattern` (blocage natif à la saisie, voir Champ dans
// components/ui/champ.tsx qui répercute `pattern`/`inputMode`/`title` sur
// l'<input>) et comme revalidation serveur dans chaque actions.ts. Volontairement
// de simples fonctions pures plutôt qu'une lib de formulaire partagée (voir
// CLAUDE.md, convention "pas de lib de formulaire partagée").

// Téléphone français : fixe ou mobile, 10 chiffres commençant par 0 (ou +33
// à la place du 0), séparateurs espace/point/tiret tolérés entre les paires
// de chiffres. Le tiret doit être échappé (`\\-`) : Chrome compile l'attribut
// HTML `pattern` en mode "v" (Unicode Sets), plus strict que le mode JS
// classique utilisé par `new RegExp` côté serveur — un tiret non échappé
// dans une classe de caractères combinée à `\s` y est une erreur de syntaxe,
// ce qui désactive silencieusement toute validation native sur le champ.
const SOURCE_TELEPHONE = "(?:\\+33[\\s.\\-]?|0)[1-9](?:[\\s.\\-]?\\d{2}){4}";
// Code postal français : 5 chiffres.
const SOURCE_CODE_POSTAL = "\\d{5}";
// Email : format standard local@domaine.tld, sans viser l'exhaustivité de la
// RFC (le navigateur fait déjà l'essentiel via <input type="email">, cette
// regex sert surtout de garde-fou côté serveur).
const SOURCE_EMAIL = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";

// Attributs `pattern` pour les <input> (voir preinscription-form.tsx,
// etudiant-form.tsx, etc.) : HTML ancre implicitement ^...$, donc pas besoin
// de les répéter ici.
export const PATTERN_TELEPHONE = SOURCE_TELEPHONE;
export const PATTERN_CODE_POSTAL = SOURCE_CODE_POSTAL;

const REGEX_TELEPHONE = new RegExp(`^${SOURCE_TELEPHONE}$`);
const REGEX_CODE_POSTAL = new RegExp(`^${SOURCE_CODE_POSTAL}$`);
const REGEX_EMAIL = new RegExp(`^${SOURCE_EMAIL}$`);

export function estTelephoneValide(valeur: string): boolean {
  return REGEX_TELEPHONE.test(valeur);
}

export function estCodePostalValide(valeur: string): boolean {
  return REGEX_CODE_POSTAL.test(valeur);
}

export function estEmailValide(valeur: string): boolean {
  return REGEX_EMAIL.test(valeur);
}

// Normalise un numéro de téléphone français POUR COMPARAISON UNIQUEMENT
// (voir lib/doublons-etudiant.ts) : ne réécrit jamais une valeur stockée en
// base, ne valide pas non plus le format (voir estTelephoneValide) — sert
// seulement à reconnaître que "06 12 34 56 78", "06.12.34.56.78",
// "06-12-34-56-78", "+33 6 12 34 56 78" et "+33612345678" désignent le même
// numéro, alors qu'aujourd'hui rien n'harmonise leur écriture à la saisie.
// Supprime espaces/points/tirets puis ramène un préfixe international +33 à
// l'écriture nationale (0) — au-delà de ces deux formes, tolérées côté
// validation (voir SOURCE_TELEPHONE ci-dessus), rien d'autre à normaliser.
export function normaliserTelephone(brut: string): string {
  const sansSeparateurs = brut.replace(/[\s.\-]/g, "");
  return sansSeparateurs.startsWith("+33") ? `0${sansSeparateurs.slice(3)}` : sansSeparateurs;
}

// Critère ayant déclenché le signalement d'un doublon potentiel (voir
// lib/doublons-etudiant.ts) — type + libellés définis ici plutôt que dans
// doublons-etudiant.ts (qui a `import "server-only"`) pour rester
// importables depuis un composant client (voir etudiant-form.tsx, qui
// affiche ces libellés dans sa liste de doublons potentiels).
export type CritereCorrespondanceDoublon = "NOM_DATE" | "EMAIL" | "TELEPHONE" | "EMAIL_ET_TELEPHONE";

export const LIBELLE_CRITERE_DOUBLON: Record<CritereCorrespondanceDoublon, string> = {
  NOM_DATE: "même nom, prénom et date de naissance",
  EMAIL: "même e-mail",
  TELEPHONE: "même téléphone",
  EMAIL_ET_TELEPHONE: "même e-mail et téléphone",
};

// Majorité légale (18 ans) calculée sur la date de naissance elle-même,
// jamais déduite de la section choisie seule (voir preinscription-form.tsx
// et preinscription/actions.ts) : un mineur peut s'inscrire à un cours pensé
// pour des adultes (ex. Langue Arabe à 17 ans), auquel cas il lui faut quand
// même un responsable légal au dossier.
export function estMineur(dateNaissance: Date, reference: Date = new Date()): boolean {
  let age = reference.getFullYear() - dateNaissance.getFullYear();
  const moisDecalage = reference.getMonth() - dateNaissance.getMonth();
  if (moisDecalage < 0 || (moisDecalage === 0 && reference.getDate() < dateNaissance.getDate())) {
    age--;
  }
  return age < 18;
}
