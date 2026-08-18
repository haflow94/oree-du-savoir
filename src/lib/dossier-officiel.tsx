import "server-only";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const NOM_ASSOCIATION = "L'Orée du Savoir";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  entete: { textAlign: "center", marginBottom: 16 },
  association: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  titre: { fontSize: 13, fontWeight: 700, marginTop: 8 },
  section: { marginTop: 12, marginBottom: 6 },
  sectionTitre: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
    color: "#7c4a26",
  },
  ligne: { flexDirection: "row", marginBottom: 2 },
  champLabel: { width: 140, fontWeight: 700 },
  champValeur: { flex: 1 },
  paragraphe: { marginBottom: 6, lineHeight: 1.4, textAlign: "justify" },
  article: { marginBottom: 6 },
  articleTitre: { fontWeight: 700, marginBottom: 2 },
  signatureZone: { marginTop: 24, flexDirection: "row", justifyContent: "space-between" },
});

function formaterDate(date: Date | null | undefined): string {
  return date ? new Date(date).toLocaleDateString("fr-FR") : "…………………";
}

function formaterMontant(valeur: string | number): string {
  const n = typeof valeur === "string" ? Number.parseFloat(valeur) : valeur;
  return `${n.toFixed(2).replace(".", ",")} €`;
}

export type DonneesEtudiantDossier = {
  civilite: string | null;
  nom: string;
  prenom: string;
  dateNaissance: Date | null;
  villeNaissance: string | null;
  adresse: string | null;
  telephoneMobile: string | null;
  telephoneFixe: string | null;
  email: string | null;
  profession: string | null;
  niveauEtudes: string | null;
  dernierDiplome: string | null;
};

export type DonneesResponsableDossier = {
  civilite: string | null;
  nom: string;
  prenom: string;
  lien: string;
  telephone: string | null;
  adresse: string | null;
};

export type DonneesSectionDossier = {
  nom: string;
  fraisFormation: string | number;
  fraisDossier: string | number;
  volumeHoraireAnnuel: number | null;
  remboursementAvant15Jours: number;
  remboursementAvant29Jours: number;
};

function InformationsPersonnelles({ etudiant }: { etudiant: DonneesEtudiantDossier }) {
  const civiliteLabel = etudiant.civilite === "M" ? "M." : etudiant.civilite === "MME" ? "Mme" : "";
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>Informations personnelles</Text>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Nom</Text>
        <Text style={styles.champValeur}>{civiliteLabel} {etudiant.nom}</Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Prénom</Text>
        <Text style={styles.champValeur}>{etudiant.prenom}</Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Date de naissance</Text>
        <Text style={styles.champValeur}>
          {formaterDate(etudiant.dateNaissance)}
          {etudiant.villeNaissance ? ` à ${etudiant.villeNaissance}` : ""}
        </Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Adresse</Text>
        <Text style={styles.champValeur}>{etudiant.adresse ?? "…………………"}</Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Téléphone</Text>
        <Text style={styles.champValeur}>
          {etudiant.telephoneMobile ?? etudiant.telephoneFixe ?? "…………………"}
        </Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Email</Text>
        <Text style={styles.champValeur}>{etudiant.email ?? "…………………"}</Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Profession</Text>
        <Text style={styles.champValeur}>{etudiant.profession ?? "…………………"}</Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Niveau d&apos;études</Text>
        <Text style={styles.champValeur}>{etudiant.niveauEtudes ?? "…………………"}</Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Dernier diplôme</Text>
        <Text style={styles.champValeur}>{etudiant.dernierDiplome ?? "…………………"}</Text>
      </View>
    </View>
  );
}

function ResponsableLegalBloc({ responsable }: { responsable: DonneesResponsableDossier | null }) {
  const civiliteLabel =
    responsable?.civilite === "M" ? "M." : responsable?.civilite === "MME" ? "Mme" : "";
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>Responsable légal du mineur</Text>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Nom</Text>
        <Text style={styles.champValeur}>
          {responsable ? `${civiliteLabel} ${responsable.prenom} ${responsable.nom}` : "…………………"}
        </Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Lien</Text>
        <Text style={styles.champValeur}>{responsable?.lien ?? "…………………"}</Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Téléphone</Text>
        <Text style={styles.champValeur}>{responsable?.telephone ?? "…………………"}</Text>
      </View>
      <View style={styles.ligne}>
        <Text style={styles.champLabel}>Adresse</Text>
        <Text style={styles.champValeur}>{responsable?.adresse ?? "…………………"}</Text>
      </View>
    </View>
  );
}

function FraisEtVolume({ section }: { section: DonneesSectionDossier }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>Frais de scolarité et volume horaire</Text>
      <Text style={styles.paragraphe}>
        Frais de la formation : {formaterMontant(section.fraisFormation)} + {formaterMontant(section.fraisDossier)}{" "}
        de frais de dossier (prix TTC).
        {section.volumeHoraireAnnuel ? ` Nombre d'heures : ${section.volumeHoraireAnnuel}h/an.` : ""}{" "}
        Période de formation : voir calendrier annuel.
      </Text>
    </View>
  );
}

function EngagementAdulte({ nomComplet }: { nomComplet: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>Engagement</Text>
      <Text style={styles.paragraphe}>
        Je soussigné(e) {nomComplet} sollicite mon admission aux formations choisies et m&apos;engage à
        verser les frais de formation et à respecter le règlement intérieur de {NOM_ASSOCIATION}.
        J&apos;accepte d&apos;être filmé(e) et/ou photographié(e) lors des activités organisées au sein
        de {NOM_ASSOCIATION}.
      </Text>
      <View style={styles.signatureZone}>
        <Text>Fait le : {"…………………"}</Text>
        <Text>Signature de l&apos;étudiant</Text>
      </View>
    </View>
  );
}

function EngagementJeunes({ nomComplet, nomEnfant }: { nomComplet: string; nomEnfant: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>Engagement</Text>
      <Text style={styles.paragraphe}>
        Je soussigné(e) {nomComplet}, responsable légal de l&apos;enfant {nomEnfant}, sollicite son
        admission aux formations choisies. Je m&apos;engage à verser les frais de formation et à
        respecter le contrat de formation. J&apos;autorise mon enfant à quitter seul l&apos;établissement
        après son cours. J&apos;accepte que mon enfant soit filmé et/ou photographié lors des activités
        organisées au sein de {NOM_ASSOCIATION}.
      </Text>
      <View style={styles.signatureZone}>
        <Text>Fait le : {"…………………"}</Text>
        <Text>Signature</Text>
      </View>
    </View>
  );
}

function ReglementAdulte({ section }: { section: DonneesSectionDossier }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>Règlement intérieur</Text>
      <Text style={styles.paragraphe}>
        Le présent règlement définit les modalités d&apos;inscription et la vie au sein de
        l&apos;établissement. Toute inscription engage l&apos;étudiant à le respecter.
      </Text>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Horaires</Text>
        <Text style={styles.paragraphe}>
          Pendant les jours de cours, {NOM_ASSOCIATION} ouvre ses portes 15 minutes avant le début des
          cours et referme 10 minutes après. Les horaires sont mentionnés dans la fiche d&apos;inscription.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Inscription et contribution de l&apos;étudiant</Text>
        <Text style={styles.paragraphe}>
          L&apos;inscription du candidat sera effective à partir du moment où les formalités
          administratives seront effectuées et les frais de scolarité payés. Pour certains cas
          particuliers, sur autorisation du trésorier, il sera possible de payer en plusieurs fois par
          chèques datés au dos, à remettre au moment de l&apos;inscription. Pour les femmes enceintes, une
          inscription par semestre est possible (sur présentation d&apos;un certificat médical).
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Assiduité et absences</Text>
        <Text style={styles.paragraphe}>
          L&apos;étudiant devra observer une présence régulière à tous les cours. Il devra informer
          l&apos;administration au préalable en cas d&apos;absence, et aura trois jours pour se justifier.
          En cas d&apos;absences répétées et non justifiées (maximum 2), l&apos;étudiant sera convoqué pour
          un entretien. Trois absences non justifiées donnent à l&apos;administration le droit
          d&apos;annuler l&apos;inscription sans droit au remboursement. Le même traitement est adopté pour
          les retards.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Annulation d&apos;inscription et remboursement</Text>
        <Text style={styles.paragraphe}>
          Pour demander l&apos;annulation de son inscription, l&apos;étudiant devra envoyer une lettre
          recommandée avec accusé de réception au directeur (le cachet de la poste faisant foi). Si la
          demande intervient avant le début des cours, {NOM_ASSOCIATION} rembourse la totalité des frais
          d&apos;études (les frais de dossier ne sont jamais remboursables). Si la demande intervient
          après le début des cours : entre le 1er et le 15e jour, remboursement de{" "}
          {section.remboursementAvant15Jours}% des frais d&apos;études ; entre le 15e et le 29e jour,
          remboursement de {section.remboursementAvant29Jours}% ; après le 29e jour, aucun remboursement.
          Aucune réduction ni remboursement en cas d&apos;absences ou de départ en cours d&apos;année.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Vie estudiantine et environnement</Text>
        <Text style={styles.paragraphe}>
          L&apos;étudiant devra observer les règles de bonne conduite et adopter une tenue vestimentaire
          convenable au sein de l&apos;académie, et respecter les règles de bon voisinage dans les
          environs.
        </Text>
      </View>
      <Text style={styles.paragraphe}>
        Je soussigné(e) atteste avoir pris connaissance des dispositions ci-dessus et m&apos;engage à les
        respecter.
      </Text>
      <View style={styles.signatureZone}>
        <Text>Fait le : {"…………………"}</Text>
        <Text>Signature de l&apos;étudiant</Text>
      </View>
    </View>
  );
}

function ReglementJeunes({ section }: { section: DonneesSectionDossier }) {
  return (
    <View style={styles.section} break>
      <Text style={styles.sectionTitre}>Règlement intérieur — Section Jeunes</Text>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Article 1 — Horaires</Text>
        <Text style={styles.paragraphe}>
          {NOM_ASSOCIATION} ouvre ses portes 15 minutes avant le début et referme 15 minutes après la fin
          des cours, pour accueillir les élèves inscrits à la formation jeunes.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Article 2 — Sorties</Text>
        <Text style={styles.paragraphe}>
          En dehors des horaires d&apos;accueil, aucun élève ne sera autorisé à sortir, sauf motif grave
          et accord préalable des parents. Si l&apos;enfant rentre seul ou avec une tierce personne, une
          autorisation écrite doit être remise à l&apos;administration.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Article 3 — Retards</Text>
        <Text style={styles.paragraphe}>
          Tout élève en retard doit signaler son retard à l&apos;administration avant d&apos;accéder à la
          salle de cours. Les retards répétés peuvent entraîner une sanction.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Article 4 — Fréquentation</Text>
        <Text style={styles.paragraphe}>
          Les absences non justifiées sont consignées et signalées aux responsables. Répétées plus de deux
          fois, elles peuvent entraîner une sanction allant jusqu&apos;à l&apos;exclusion.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Article 5 — Comportement</Text>
        <Text style={styles.paragraphe}>
          Le respect mutuel entre tous les membres de la communauté éducative est la base du
          fonctionnement de {NOM_ASSOCIATION}. La violence, en acte comme en parole, est strictement
          interdite.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Article 9 — Sanctions</Text>
        <Text style={styles.paragraphe}>
          Quatre avertissements de conduite entraînent la convocation des parents ; deux convocations
          entraînent une exclusion temporaire ou définitive.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Article 10 — Sécurité</Text>
        <Text style={styles.paragraphe}>
          L&apos;assurance contre les accidents subis ou causés est obligatoire ; les parents en fournissent
          le justificatif en début d&apos;année.
        </Text>
      </View>
      <View style={styles.article}>
        <Text style={styles.articleTitre}>Article 11 — Annulation d&apos;inscription et remboursement</Text>
        <Text style={styles.paragraphe}>
          Si la demande d&apos;annulation intervient avant le début des cours, {NOM_ASSOCIATION} rembourse
          la totalité des frais d&apos;études (frais administratifs non remboursables). Après le début des
          cours : entre le 1er et le 15e jour, remboursement de {section.remboursementAvant15Jours}% ;
          entre le 15e et le 29e jour, {section.remboursementAvant29Jours}% ; après le 29e jour, aucun
          remboursement.
        </Text>
      </View>
      <Text style={styles.paragraphe}>
        Le(s) responsable(s) légal(aux) de l&apos;élève déclare(nt) avoir pris connaissance du règlement de
        l&apos;établissement et s&apos;engage(nt) à le respecter.
      </Text>
      <View style={styles.signatureZone}>
        <Text>Fait le : {"…………………"}</Text>
        <Text>Signature des responsables</Text>
      </View>
    </View>
  );
}

export async function genererDossierOfficielPdf(donnees: {
  section: DonneesSectionDossier;
  anneeLibelle: string;
  etudiant: DonneesEtudiantDossier;
  responsable: DonneesResponsableDossier | null;
}): Promise<Buffer> {
  const estJeunes = donnees.section.nom === "Jeunes";
  const nomComplet = `${donnees.etudiant.prenom} ${donnees.etudiant.nom}`;
  const nomResponsableComplet = donnees.responsable
    ? `${donnees.responsable.prenom} ${donnees.responsable.nom}`
    : "…………………";

  const document = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <Text style={styles.association}>{NOM_ASSOCIATION}</Text>
          <Text style={styles.titre}>
            DOSSIER D&apos;INSCRIPTION — {donnees.section.nom.toUpperCase()} — {donnees.anneeLibelle}
          </Text>
        </View>

        {estJeunes ? (
          <>
            <InformationsPersonnelles etudiant={donnees.etudiant} />
            <ResponsableLegalBloc responsable={donnees.responsable} />
          </>
        ) : (
          <InformationsPersonnelles etudiant={donnees.etudiant} />
        )}

        <FraisEtVolume section={donnees.section} />

        {estJeunes ? (
          <EngagementJeunes nomComplet={nomResponsableComplet} nomEnfant={nomComplet} />
        ) : (
          <EngagementAdulte nomComplet={nomComplet} />
        )}
      </Page>
      <Page size="A4" style={styles.page}>
        {estJeunes ? (
          <ReglementJeunes section={donnees.section} />
        ) : (
          <ReglementAdulte section={donnees.section} />
        )}
      </Page>
    </Document>
  );

  return renderToBuffer(document);
}
