import "server-only";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Civilite } from "@/generated/prisma/enums";
import { MOYEN_LABELS, formaterMontant, type MoyenPaiement } from "@/lib/paiements";

const NOM_ASSOCIATION = "L'Orée du Savoir";

const CIVILITE_LABELS: Record<Civilite, string> = { M: "M.", MME: "Mme" };

function nomComplet(etudiant: { civilite: Civilite | null; nom: string; prenom: string }): string {
  const civilite = etudiant.civilite ? `${CIVILITE_LABELS[etudiant.civilite]} ` : "";
  return `${civilite}${etudiant.prenom} ${etudiant.nom}`;
}

function formaterDate(date: Date): string {
  return new Date(date).toLocaleDateString("fr-FR");
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: "#1a1a1a" },
  entete: { marginBottom: 24 },
  association: { fontSize: 14, fontWeight: 700 },
  titre: { fontSize: 16, fontWeight: 700, marginBottom: 16, textAlign: "center" },
  paragraphe: { marginBottom: 10, lineHeight: 1.5 },
  table: { marginTop: 12, marginBottom: 12, borderTop: 1, borderColor: "#cccccc" },
  ligne: {
    flexDirection: "row",
    borderBottom: 1,
    borderColor: "#cccccc",
    paddingVertical: 6,
  },
  celluleDate: { width: "25%" },
  celluleMoyen: { width: "45%" },
  celluleMontant: { width: "30%", textAlign: "right" },
  recap: { marginTop: 8, alignItems: "flex-end" },
  pied: { marginTop: 32, fontSize: 10, color: "#555555" },
});

export type LignePaiementRecu = {
  datePaiement: Date;
  moyen: MoyenPaiement;
  montant: number;
};

export type DonneesRecuPaiement = {
  etudiant: { civilite: Civilite | null; nom: string; prenom: string };
  anneeScolaireLibelle: string;
  numeroRecu: string;
  montantDu: number;
  montantEncaisse: number;
  montantReste: number;
  paiements: LignePaiementRecu[];
  dateEdition: Date;
};

function RecuPaiementDocument({ donnees }: { donnees: DonneesRecuPaiement }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <Text style={styles.association}>{NOM_ASSOCIATION}</Text>
        </View>

        <Text style={styles.titre}>Reçu de paiement</Text>

        <Text style={styles.paragraphe}>
          L&apos;association {NOM_ASSOCIATION} atteste avoir reçu de{" "}
          {nomComplet(donnees.etudiant)} la somme totale de{" "}
          {formaterMontant(donnees.montantEncaisse)} au titre de la cotisation pour
          l&apos;année scolaire {donnees.anneeScolaireLibelle}.
        </Text>

        <View style={styles.table}>
          <View style={[styles.ligne, { fontWeight: 700 }]}>
            <Text style={styles.celluleDate}>Date</Text>
            <Text style={styles.celluleMoyen}>Moyen de paiement</Text>
            <Text style={styles.celluleMontant}>Montant</Text>
          </View>
          {donnees.paiements.map((p, i) => (
            <View key={i} style={styles.ligne}>
              <Text style={styles.celluleDate}>{formaterDate(p.datePaiement)}</Text>
              <Text style={styles.celluleMoyen}>{MOYEN_LABELS[p.moyen]}</Text>
              <Text style={styles.celluleMontant}>{formaterMontant(p.montant)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.recap}>
          <Text>Montant dû : {formaterMontant(donnees.montantDu)}</Text>
          <Text>Montant encaissé : {formaterMontant(donnees.montantEncaisse)}</Text>
          <Text>Reste à payer : {formaterMontant(donnees.montantReste)}</Text>
        </View>

        <Text style={styles.pied}>
          Reçu n° {donnees.numeroRecu} — édité le {formaterDate(donnees.dateEdition)}.
        </Text>
      </Page>
    </Document>
  );
}

export async function genererRecuPaiementPdf(donnees: DonneesRecuPaiement): Promise<Buffer> {
  return renderToBuffer(<RecuPaiementDocument donnees={donnees} />);
}

export type DonneesAttestationScolarite = {
  etudiant: {
    civilite: Civilite | null;
    nom: string;
    prenom: string;
    dateNaissance: Date | null;
    villeNaissance: string | null;
  };
  anneeScolaireLibelle: string;
  classesSuivies: string[];
  // null quand la Section suivie ne comporte aucune séance passée à ce
  // jour-là (rien à rapporter) — distinct de "0 présence sur 0 séance", qui
  // se lirait comme une absence systématique alors qu'il n'y a simplement
  // rien eu à valider pour l'instant.
  presence: { nbPresences: number; nbSeancesPassees: number } | null;
  dateEdition: Date;
};

function AttestationScolariteDocument({ donnees }: { donnees: DonneesAttestationScolarite }) {
  const { etudiant } = donnees;
  const naissance =
    etudiant.dateNaissance &&
    `, né(e) le ${formaterDate(etudiant.dateNaissance)}${
      etudiant.villeNaissance ? ` à ${etudiant.villeNaissance}` : ""
    },`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <Text style={styles.association}>{NOM_ASSOCIATION}</Text>
        </View>

        <Text style={styles.titre}>Attestation de scolarité</Text>

        <Text style={styles.paragraphe}>
          Nous soussignés, l&apos;association {NOM_ASSOCIATION}, certifions que{" "}
          {nomComplet(etudiant)}
          {naissance || ""} est régulièrement inscrit(e) au sein de notre association
          pour l&apos;année scolaire {donnees.anneeScolaireLibelle}, dans le(s) cours
          suivant(s) :
        </Text>

        <View style={{ marginBottom: 10 }}>
          {donnees.classesSuivies.length > 0 ? (
            donnees.classesSuivies.map((c, i) => <Text key={i}>• {c}</Text>)
          ) : (
            <Text>• (aucun cours enregistré pour cette année)</Text>
          )}
        </View>

        {donnees.presence && (
          <Text style={styles.paragraphe}>
            Présence enregistrée à ce jour : {donnees.presence.nbPresences} séance(s)
            sur {donnees.presence.nbSeancesPassees} séance(s) passée(s).
          </Text>
        )}

        <Text style={styles.paragraphe}>
          Cette attestation est délivrée à la demande de l&apos;intéressé(e) pour
          servir et valoir ce que de droit.
        </Text>

        <Text style={styles.pied}>Fait le {formaterDate(donnees.dateEdition)}.</Text>
      </Page>
    </Document>
  );
}

export async function genererAttestationScolaritePdf(
  donnees: DonneesAttestationScolarite,
): Promise<Buffer> {
  return renderToBuffer(<AttestationScolariteDocument donnees={donnees} />);
}
