import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrganisation, versDataUri, logoDataUri as chargerLogoDataUri } from "@/lib/organisation";
import { formaterMontant } from "@/lib/paiements";
import { JOUR_LABELS } from "@/lib/planning";
import { relationAutre } from "./relation-legale";
import { estCreneauCoche } from "./creneau-correspondance";
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
    rna: v(organisation.rna),
    adresseComplete,
    logoDataUri: await chargerLogoDataUri(),
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

// "Cours"/"Classe"/"Horaires retenus" : dérivés en priorité des inscriptions
// EFFECTIVES de l'étudiant (InscriptionClasse), qui ne sont créées qu'à la
// validation finale (voir lib/cohortes.ts — règle "signature ≠ validation
// finale"). Un dossier peut désormais être généré et signé AVANT ce moment
// (voir bilan de session) : à défaut d'inscription effective, on retombe
// sur l'AffectationCohorte déjà choisie (proposée par une réinscription
// déterministe ou par le staff), qui donne au moins le niveau/la Cohorte —
// les horaires précis (propres à la Classe) restent alors vides plutôt que
// devinés (règle non négociable "ne jamais deviner"). `classes` (jour/heures
// bruts) sert à cocher automatiquement la bonne carte de créneau (voir
// estCreneauChoisi) — jamais utilisé pour le dossier vierge.
async function contexteInscription(
  etudiantId: string,
  sectionId: string,
): Promise<{ cours: string; classe: string; horaires: string; classes: ClasseSuivie[] }> {
  const anneeActive = await prisma.anneeScolaire.findFirst({ where: { active: true } });
  if (!anneeActive) return { cours: "", classe: "", horaires: "", classes: [] };

  const inscriptions = await prisma.inscriptionClasse.findMany({
    where: { etudiantId, classe: { anneeScolaireId: anneeActive.id, cours: { sectionId } } },
    include: { classe: { include: { cohorte: true, cours: true } } },
  });

  if (inscriptions.length > 0) {
    return {
      cours: [...new Set(inscriptions.map((i) => i.classe.cours.nom))].join(" ; "),
      classe: [...new Set(inscriptions.map((i) => i.classe.cohorte.niveau).filter((n): n is string => !!n))].join(
        " ; ",
      ),
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

  const affectations = await prisma.affectationCohorte.findMany({
    where: { etudiantId, anneeScolaireId: anneeActive.id, cohorte: { sectionId } },
    include: { cohorte: { include: { coursLies: { include: { cours: true }, orderBy: { ordre: "asc" } } } } },
  });
  if (affectations.length === 0) return { cours: "", classe: "", horaires: "", classes: [] };

  return {
    cours: [...new Set(affectations.flatMap((a) => a.cohorte.coursLies.map((cl) => cl.cours.nom)))].join(" ; "),
    classe: [...new Set(affectations.map((a) => a.cohorte.niveau).filter((n): n is string => !!n))].join(" ; "),
    horaires: "",
    classes: [],
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

  // Carte de créneau cochée automatiquement (jamais sur le dossier vierge,
  // qui reste entièrement manuscrit — voir construireContexteDossierVierge,
  // non touché ici) : priorité au choix explicite de la préinscription
  // (Etudiant.creneauSouhaiteId), sinon la classe réellement suivie — voir
  // estCreneauCoche pour l'ordre de priorité et pourquoi les deux sources ne
  // sont jamais en concurrence. `sectionSouhaiteeId === sectionId` évite de
  // cocher une carte d'une autre section quand la famille a demandé
  // plusieurs sections à la préinscription (Etudiant ne garde qu'un seul
  // couple section/créneau souhaité, voir preinscription/actions.ts).
  const creneauSouhaiteId =
    etudiant.sectionSouhaiteeId === sectionId ? etudiant.creneauSouhaiteId : null;
  const sectionCtx = contexteSection(section);
  const creneauxAvecCoche = section.creneaux.map((c) => ({
    code: c.code,
    jour: c.jour,
    horaire: c.horaire,
    restriction: c.restriction,
    coche: estCreneauCoche(c, { creneauSouhaiteId, classesSuivies }),
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
    contact_urgence_nom: v(etudiant.contactUrgenceNom),
    contact_urgence_prenom: v(etudiant.contactUrgencePrenom),
    contact_urgence_telephone: v(etudiant.contactUrgenceTelephone),
    sexe: etudiant.sexe,
    sexeF: etudiant.sexe === "F",
    sexeM: etudiant.sexe === "M",
    niveau_scolaire: v(etudiant.niveauScolaire),
    // Déclaré librement par la famille à la préinscription (voir
    // Etudiant.niveauDeclare) — distinct du niveau réellement retenu
    // (Cohorte.niveau via AffectationCohorte/InscriptionClasse, voir
    // `classe` ci-dessous) et de niveau_admission (réservé à
    // l'administration, dossier Jeunes) : reste exposé pour qui veut
    // l'afficher séparément, mais sert surtout de repli ci-dessous tant
    // qu'aucune classe/cohorte réelle n'est encore assignée.
    niveau_declare: v(etudiant.niveauDeclare),

    niveau_admission: v(dossierAnnuel?.niveauAdmission),

    // Consentement photo/vidéo (voir Etudiant.autorisationPhotoVideo) : deux
    // drapeaux exclusifs, jamais tous les deux vrais ni un défaut implicite
    // — ni l'un ni l'autre coché tant que la question n'a pas été répondue
    // (fiche créée avant son introduction, ou par le staff hors
    // préinscription), jamais une case cochée par défaut (règle non
    // négociable "ne jamais deviner").
    autorisation_photo_video_oui: etudiant.autorisationPhotoVideo === true,
    autorisation_photo_video_non: etudiant.autorisationPhotoVideo === false,

    ...inscription,
  };

  // Le champ "Niveau" du dossier (`classe`) reste vide tant que le staff n'a
  // pas affecté l'étudiant à une Cohorte/Classe réelle (signature possible
  // avant cette affectation, voir contexteInscription ci-dessus) : en
  // attendant, on affiche le niveau déclaré par la famille à la
  // préinscription plutôt qu'un champ vide, à condition qu'il concerne bien
  // la section de CE dossier (même garde que creneauSouhaiteId ci-dessus —
  // une préinscription peut porter sur plusieurs sections).
  if (!contexte.classe && etudiant.sectionSouhaiteeId === sectionId) {
    contexte.classe = v(etudiant.niveauDeclare);
  }

  if (section.modeleDossier === "JEUNES") {
    contexte.creneau = section.creneaux[0]
      ? {
          jour: section.creneaux[0].jour,
          horaire: section.creneaux[0].horaire,
          coche: estCreneauCoche(section.creneaux[0], { creneauSouhaiteId, classesSuivies }),
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
    contact_urgence_nom: "",
    contact_urgence_prenom: "",
    contact_urgence_telephone: "",
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
