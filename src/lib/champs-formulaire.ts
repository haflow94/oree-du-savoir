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
