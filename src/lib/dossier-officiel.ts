import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// Remplit directement les .docx d'origine de l'association (un gabarit par
// Section, voir src/lib/dossier-templates/) plutôt que de reconstruire le
// document depuis zéro : les balises {tag} ont été insérées à la main dans
// ces fichiers Word (voir historique de commit), le contenu et la mise en
// forme restent donc ceux que l'association connaît déjà.
const GABARIT_PAR_SECTION: Record<string, string> = {
  Jeunes: "jeunes.docx",
  "Langue Arabe": "langue-arabe.docx",
  "Études Coraniques": "etudes-coraniques.docx",
  "Études Islamiques": "etudes-islamiques.docx",
};

export type DonneesEtudiantDossier = {
  nom: string;
  prenom: string;
  dateNaissance: Date | null;
  villeNaissance: string | null;
  adresse: string | null;
  codePostal: string | null;
  telephoneMobile: string | null;
  telephoneFixe: string | null;
  email: string | null;
  profession: string | null;
  niveauEtudes: string | null;
  dernierDiplome: string | null;
  contactUrgence: string | null;
};

export type DonneesResponsableDossier = {
  nom: string;
  prenom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
};

function formaterDate(date: Date | null | undefined): string {
  return date ? new Date(date).toLocaleDateString("fr-FR") : "";
}

function v(valeur: string | null | undefined): string {
  return valeur ?? "";
}

export async function genererDossierOfficielDocx(donnees: {
  sectionNom: string;
  etudiant: DonneesEtudiantDossier;
  responsable: DonneesResponsableDossier | null;
  horaireChoisi: string;
}): Promise<Buffer> {
  const nomGabarit = GABARIT_PAR_SECTION[donnees.sectionNom];
  if (!nomGabarit) {
    throw new Error(`Aucun gabarit de dossier pour la section "${donnees.sectionNom}".`);
  }

  const cheminGabarit = path.join(process.cwd(), "src/lib/dossier-templates", nomGabarit);
  const contenu = await readFile(cheminGabarit);
  const zip = new PizZip(contenu);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  const e = donnees.etudiant;
  const r = donnees.responsable;
  const estJeunes = donnees.sectionNom === "Jeunes";

  doc.render(
    estJeunes
      ? {
          nom: e.nom,
          prenom: e.prenom,
          dateNaissance: formaterDate(e.dateNaissance),
          villeNaissance: v(e.villeNaissance),
          niveauEtudes: v(e.niveauEtudes),
          nomResponsable: r ? r.nom : "",
          prenomResponsable: r ? r.prenom : "",
          adresseResponsable: r ? v(r.adresse) : "",
          telephoneResponsable: r ? v(r.telephone) : "",
          emailResponsable: r ? v(r.email) : "",
        }
      : {
          nom: e.nom,
          prenom: e.prenom,
          dateNaissance: formaterDate(e.dateNaissance),
          villeNaissance: v(e.villeNaissance),
          adresse: v(e.adresse),
          codePostal: v(e.codePostal),
          // Pas de champ "ville" dédié dans le modèle Etudiant (une seule
          // adresse en texte libre) : laissé vide, à compléter à la main.
          ville: "",
          telephoneFixe: v(e.telephoneFixe),
          telephoneMobile: v(e.telephoneMobile),
          email: v(e.email),
          profession: v(e.profession),
          niveauEtudes: v(e.niveauEtudes),
          dernierDiplome: v(e.dernierDiplome),
          contactUrgence: v(e.contactUrgence),
          horaireChoisi: donnees.horaireChoisi,
        },
  );

  return doc.getZip().generate({ type: "nodebuffer" });
}
