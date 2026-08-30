import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrganisation, versDataUri } from "@/lib/organisation";
import { formaterMontant } from "@/lib/paiements";
import { JOUR_LABELS } from "@/lib/planning";
import { relationAutre } from "./relation-legale";
import { estCreneauChoisi } from "./creneau-correspondance";
import type { ModeleDossier, JourSemaine } from "@/generated/prisma/enums";

function v(valeur: string | null | undefined): string {
  return valeur ?? "";
}

function formaterDate(date: Date | null | undefined): string {
  return date ? new Date(date).toLocaleDateString("fr-FR") : "";
}

async function contexteOrganisation() {
  const organisation = await getOrganisation();
  const adresseComplete = [organisation.adresse, [organisation.codePostal, organisation.ville].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return {
    nom: v(organisation.nom),
    sousTitre: v(organisation.sousTitre),
    ville: v(organisation.ville),
    telephone: v(organisation.telephone),
    siret: v(organisation.siret),
    naf: v(organisation.naf),
    adresseComplete,
    logoDataUri: organisation.logoCheminRelatif
      ? await versDataUri(organisation.logoCheminRelatif)
      : null,
  };
}

type SectionAvecCreneaux = {
  nom: string;
  fraisFormation: { toString(): string };
  fraisDossier: { toString(): string };
  volumeHoraireAnnuel: number | null;
  remboursementAvant15Jours: number;
  remboursementAvant29Jours: number;
  reglesSpecifiques: string[];
  creneaux: { code: string; jour: string; horaire: string; restriction: string | null }[];
};

function contexteSection(section: SectionAvecCreneaux) {
  const fraisFormation = Number.parseFloat(section.fraisFormation.toString());
  const fraisDossier = Number.parseFloat(section.fraisDossier.toString());
  return {
    section_nom: section.nom,
    tarif_formation: formaterMontant(fraisFormation),
    frais_dossier: formaterMontant(fraisDossier),
    total: formaterMontant(fraisFormation + fraisDossier),
    volume_horaire: section.volumeHoraireAnnuel ? `${section.volumeHoraireAnnuel} h` : "",
    remboursement_avant_15_jours: section.remboursementAvant15Jours,
    remboursement_avant_29_jours: section.remboursementAvant29Jours,
    reglesSpecifiques: section.reglesSpecifiques,
    creneaux: section.creneaux.map((c) => ({
      code: c.code,
      jour: c.jour,
      horaire: c.horaire,
      restriction: c.restriction,
    })),
  };
}

type ClasseSuivie = { jour: JourSemaine; heureDebut: string; heureFin: string };

// "Cours"/"Classe"/"Horaires retenus" : dérivés des inscriptions réelles de
// l'étudiant sur la section demandée pour l'année active, pas d'un choix
// saisi séparément — même logique que l'ancien horaireChoisi de
// src/app/(app)/etudiants/[id]/dossier/route.ts. `classes` (jour/heures
// bruts) sert ensuite à cocher automatiquement la bonne carte de créneau
// (voir estCreneauChoisi) — jamais utilisé pour le dossier vierge.
async function contexteInscription(
  etudiantId: string,
  sectionId: string,
): Promise<{ cours: string; classe: string; horaires: string; classes: ClasseSuivie[] }> {
  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { active: true } });
  if (!anneeActive) return { cours: "", classe: "", horaires: "", classes: [] };

  const inscriptions = await prisma.inscriptionClasse.findMany({
    where: { etudiantId, classe: { anneeScolaireId: anneeActive.id, cohorte: { cours: { sectionId } } } },
    include: { classe: { include: { cohorte: { include: { cours: true } } } } },
  });

  return {
    cours: [...new Set(inscriptions.map((i) => i.classe.cohorte.cours.nom))].join(" ; "),
    classe: [...new Set(inscriptions.map((i) => i.classe.cohorte.niveau).filter((n): n is string => !!n))].join(" ; "),
    horaires: inscriptions
      .map((i) => `${JOUR_LABELS[i.classe.cohorte.jour]} ${i.classe.heureDebut}-${i.classe.heureFin}`)
      .join(" ; "),
    classes: inscriptions.map((i) => ({
      jour: i.classe.cohorte.jour,
      heureDebut: i.classe.heureDebut,
      heureFin: i.classe.heureFin,
    })),
  };
}

async function contextePhoto(etudiantId: string): Promise<string | null> {
  const photo = await prisma.document.findFirst({
    where: { etudiantId, type: "PHOTO" },
    orderBy: { creeLe: "desc" },
  });
  return photo ? versDataUri(photo.cheminRelatif) : null;
}

async function chargerSectionAvecCreneaux(sectionId: string) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { creneaux: { orderBy: { ordre: "asc" } } },
  });
  if (!section) throw new Error(`Section introuvable : ${sectionId}`);
  return section;
}

export async function construireContexteDossierEtudiant({
  etudiantId,
  sectionId,
}: {
  etudiantId: string;
  sectionId: string;
}): Promise<{ modeleDossier: ModeleDossier; contexte: Record<string, unknown>; sectionNom: string }> {
  const [etudiant, responsables, section, anneeActive, organisation, photoDataUri] = await Promise.all([
    prisma.etudiant.findUniqueOrThrow({ where: { id: etudiantId } }),
    prisma.responsableLegal.findMany({ where: { etudiantId }, orderBy: { creeLe: "asc" } }),
    chargerSectionAvecCreneaux(sectionId),
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    contexteOrganisation(),
    contextePhoto(etudiantId),
  ]);

  const dossierAnnuel = anneeActive
    ? await prisma.dossierAnnuel.findUnique({
        where: { etudiantId_anneeScolaireId: { etudiantId, anneeScolaireId: anneeActive.id } },
      })
    : null;

  const { classes: classesSuivies, ...inscription } = await contexteInscription(etudiantId, sectionId);
  const responsablePrincipal = responsables[0] ?? null;
  const mere = responsables.find((r) => r.lien.trim().toLowerCase() === "mère");
  const pere = responsables.find((r) => r.lien.trim().toLowerCase() === "père");

  const referenceSource = dossierAnnuel?.id ?? etudiant.id;
  const dateDepot = dossierAnnuel?.creeLe ?? etudiant.creeLe;

  // Carte de créneau cochée automatiquement quand elle correspond à une
  // classe réellement suivie par l'étudiant sur cette section (jamais sur
  // le dossier vierge, qui reste entièrement manuscrit — voir
  // construireContexteDossierVierge, non touché ici).
  const sectionCtx = contexteSection(section);
  const creneauxAvecCoche = sectionCtx.creneaux.map((c) => ({
    ...c,
    coche: classesSuivies.some((classe) => estCreneauChoisi(c, classe)),
  }));

  const contexte: Record<string, unknown> = {
    organisation,
    annee_scolaire: anneeActive?.libelle ?? "",
    ...sectionCtx,
    creneaux: creneauxAvecCoche,
    reference: referenceSource.slice(-8).toUpperCase(),
    date_depot: formaterDate(dateDepot),
    date: formaterDate(new Date()),
    // Montant réglé/mode de paiement : jamais déduits de l'historique des
    // paiements (qui peut être partiel/étalé) — champ laissé vierge comme
    // sur le formulaire papier, à servir au moment de la remise en main
    // propre (voir règle "ne jamais deviner", même esprit qu'en présences).
    montant: "",
    mode_paiement: "",
    photoDataUri,

    nom: etudiant.nom,
    prenom: etudiant.prenom,
    nom_prenom: `${etudiant.prenom} ${etudiant.nom}`,
    date_naissance: formaterDate(etudiant.dateNaissance),
    lieu_naissance: v(etudiant.villeNaissance),
    adresse: v(etudiant.adresse),
    code_postal: v(etudiant.codePostal),
    ville: v(etudiant.ville),
    telephone_fixe: v(etudiant.telephoneFixe),
    telephone_mobile: v(etudiant.telephoneMobile),
    email: v(etudiant.email),
    profession: v(etudiant.profession),
    niveau_etudes: v(etudiant.niveauEtudes),
    dernier_diplome: v(etudiant.dernierDiplome),
    contact_urgence: v(etudiant.contactUrgence),
    sexe: etudiant.sexe,
    sexeF: etudiant.sexe === "F",
    sexeM: etudiant.sexe === "M",
    niveau_scolaire: v(etudiant.niveauScolaire),

    niveau_admission: v(dossierAnnuel?.niveauAdmission),

    ...inscription,
  };

  if (section.modeleDossier === "JEUNES") {
    contexte.creneau = section.creneaux[0]
      ? {
          jour: section.creneaux[0].jour,
          horaire: section.creneaux[0].horaire,
          coche: classesSuivies.some((classe) => estCreneauChoisi(section.creneaux[0], classe)),
        }
      : { jour: "", horaire: "", coche: false };
    const lienPrincipal = responsablePrincipal?.lien.trim().toLowerCase();
    contexte.rl_nom = v(responsablePrincipal?.nom);
    contexte.rl_prenom = v(responsablePrincipal?.prenom);
    contexte.rl_nom_prenom = responsablePrincipal
      ? `${responsablePrincipal.prenom} ${responsablePrincipal.nom}`
      : "";
    contexte.rl_relation_autre = responsablePrincipal ? relationAutre(responsablePrincipal.lien) : "";
    contexte.rl_est_pere = lienPrincipal === "père";
    contexte.rl_est_mere = lienPrincipal === "mère";
    contexte.rl_adresse = v(responsablePrincipal?.adresse);
    contexte.rl_code_postal = v(responsablePrincipal?.codePostal);
    contexte.rl_ville = v(responsablePrincipal?.ville);
    contexte.rl_telephone = v(responsablePrincipal?.telephone);
    contexte.rl_mobile = v(responsablePrincipal?.telephone);
    contexte.rl_tel_pro = v(responsablePrincipal?.telephoneProfessionnel);
    contexte.rl_email = v(responsablePrincipal?.email);
    contexte.rl_profession = v(responsablePrincipal?.profession);
    contexte.rl_mere = mere ? `${mere.prenom} ${mere.nom}` : "";
    contexte.rl_pere = pere ? `${pere.prenom} ${pere.nom}` : "";
  }

  return { modeleDossier: section.modeleDossier, contexte, sectionNom: section.nom };
}

export async function construireContexteDossierVierge({
  modeleDossier,
  sectionId,
}: {
  modeleDossier: ModeleDossier;
  sectionId?: string;
}): Promise<{ contexte: Record<string, unknown>; sectionNom: string }> {
  const section = sectionId
    ? await chargerSectionAvecCreneaux(sectionId)
    : await prisma.section
        .findFirstOrThrow({ where: { modeleDossier: "JEUNES" } })
        .then((s) => chargerSectionAvecCreneaux(s.id));

  const [anneeActive, organisation] = await Promise.all([
    prisma.anneeScolaire.findFirst({ where: { active: true } }),
    contexteOrganisation(),
  ]);

  const contexte: Record<string, unknown> = {
    organisation,
    annee_scolaire: anneeActive?.libelle ?? "",
    ...contexteSection(section),
    reference: "",
    date_depot: "",
    date: "",
    montant: "",
    mode_paiement: "",
    photoDataUri: null,

    nom: "",
    prenom: "",
    nom_prenom: "",
    date_naissance: "",
    lieu_naissance: "",
    adresse: "",
    code_postal: "",
    ville: "",
    telephone_fixe: "",
    telephone_mobile: "",
    email: "",
    profession: "",
    niveau_etudes: "",
    dernier_diplome: "",
    contact_urgence: "",
    sexe: null,
    niveau_scolaire: "",
    niveau_admission: "",
    cours: "",
    classe: "",
    horaires: "",
  };

  if (modeleDossier === "JEUNES") {
    contexte.creneau = section.creneaux[0]
      ? { jour: section.creneaux[0].jour, horaire: section.creneaux[0].horaire }
      : { jour: "", horaire: "" };
    contexte.rl_nom = "";
    contexte.rl_prenom = "";
    contexte.rl_nom_prenom = "";
    contexte.rl_relation_autre = "";
    contexte.rl_adresse = "";
    contexte.rl_code_postal = "";
    contexte.rl_ville = "";
    contexte.rl_telephone = "";
    contexte.rl_mobile = "";
    contexte.rl_tel_pro = "";
    contexte.rl_email = "";
    contexte.rl_profession = "";
    contexte.rl_mere = "";
    contexte.rl_pere = "";
  }

  return { contexte, sectionNom: section.nom };
}
