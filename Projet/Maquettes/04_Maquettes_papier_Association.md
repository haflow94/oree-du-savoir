# Maquettes papier V1 --- Application de gestion administrative

## Principes

-   Interface web responsive : ordinateur, tablette et téléphone.
-   Navigation simple.
-   Opérations fréquentes en 2 à 3 actions maximum.
-   Ne pas reproduire les Excel techniquement : conserver les usages
    utiles.
-   Une information est saisie une seule fois.
-   La trésorerie reste simple.
-   La comptabilité complète reste hors application.
-   n8n automatise en arrière-plan.

## 1. Tableau de bord

``` text
TABLEAU DE BORD — 2026/2027

[ Étudiants ] [ Classes ] [ Paiements ]

À TRAITER
- Dossiers incomplets
- Paiements en attente
- Documents manquants
- Absences à vérifier

PROCHAINS ÉVÉNEMENTS

TRÉSORERIE
Solde actuel : XXXX €
```

## 2. Étudiants

``` text
ÉTUDIANTS                         [+ Ajouter]

Recherche nom / téléphone / email

Filtres : [Année] [Cours] [Classe] [Statut]

Nom       Prénom    Cours       Classe    Statut
Dupont    Ahmed     Arabe       A2        Actif
Dupont    Ahmed     Coran       C1        Actif
Martin    Sarah     Arabe       A1        Actif
```

Un même étudiant peut participer à plusieurs cours sans créer plusieurs
fiches.

## 3. Fiche étudiant

``` text
AHMED DUPONT                         [Modifier]

Téléphone    Email
Adresse      Date de naissance

[Informations] [Inscriptions] [Paiements]
[Présence] [Documents] [Historique]
```

### Inscriptions

``` text
2026/2027
- Arabe → Classe A
- Coran → Classe C

2025/2026
- Arabe → Classe B
- Coran → Classe C
```

### Documents

``` text
✓ Pièce d'identité
✓ Photo
✓ Assurance
⚠ Fiche sanitaire à renouveler
```

### Paiements

``` text
Montant dû    450 €
Encaissé      300 €
Reste         150 €

Échéance 1    150 € ✓
Échéance 2    150 € ✓
Échéance 3    150 € ⏳
```

## 4. Inscriptions

``` text
INSCRIPTIONS

[Nouvelle inscription]

[Rechercher un ancien étudiant]

DOSSIERS EN COURS
Ahmed Dupont   Documents ✓   Paiement ✓
Sarah Martin   Documents ⚠   Paiement ⏳
```

### Nouvelle inscription

``` text
Formulaire
→ Création / recherche étudiant
→ Dossier
→ Documents + moyen de paiement
→ Validation
→ Affectation à un ou plusieurs cours/classes
→ Inscription confirmée
```

### Réinscription

``` text
Recherche étudiant
→ Historique
→ Mise à jour
→ Nouveaux documents + moyen de paiement
→ Choix d'un ou plusieurs cours
→ Affectation
```

## 5. Classes

``` text
CLASSES                            [+ Nouvelle classe]

ARABE DÉBUTANT
Samedi 09h00 — Salle 1
17 / 19 étudiants                  [Voir]

CORAN
Samedi 14h00 — Salle 3
19 / 19 étudiants                  [Voir]
```

## 6. Paiements

La vue doit conserver la simplicité du tableau Excel actuel tout en
fiabilisant les données.

``` text
PAIEMENTS — 2026/2027

Recherche   [Cours] [Classe] [Statut] [Impayés] [Échéance]

Étudiant | Cours | Dû | Éch.1 | Éch.2 | Éch.3 | Encaissé | Reste | Statut
Ahmed    | A+C   |450 |150 ✓  |150 ✓  |150 ⏳  |300       |150    |Partiel
Sarah    | A     |300 |300 ✓  | —     | —      |300       |0      |Payé
```

### Détail paiement

``` text
Échéance : 3
Prévu : 150 €
Encaissé : 0 €

Moyen :
○ Chèque
○ Prélèvement

[Enregistrer]
```

## 7. Trésorerie

La trésorerie remplace le fichier Excel habituel par une vue simple dans
l'application.

``` text
TRÉSORERIE — 2026

[+ Recette]  [+ Dépense]

Solde : XXXX €

Date | Libellé | Catégorie | Recette | Dépense | Justificatif
05/09 | Cotisation | Cours | 300 € | | 📎
08/09 | Fournitures | Général | | 45 € | 📎
```

Pas de logiciel comptable dans l'application.

## 8. Documents

Les documents sont centralisés sans créer une GED complexe.

``` text
DOCUMENTS

Recherche

Étudiant / Inscription / Trésorerie

Pièces d'identité
Photos
Assurances
Fiches sanitaires
Justificatifs
```

Le fichier Excel de trésorerie habituel n'est donc pas conservé comme
outil principal : **l'application reprend cette fonction**, avec une
interface simple. Des exports pourront être prévus si nécessaires.

## 9. Parcours critiques

1.  Nouvelle inscription : formulaire → dossier → documents + paiement →
    validation → cours/classes → confirmation.
2.  Réinscription : recherche → historique → mise à jour → documents +
    paiement → cours/classes.
3.  Plusieurs cours : une fiche étudiant → plusieurs participations.
4.  Paiement : étudiant → échéance → moyen → montant encaissé → reste
    recalculé.
5.  Impayés : Paiements → filtre Impayés → liste → détail.
6.  Trésorerie : recette/dépense → catégorie → montant → justificatif
    éventuel → solde.
7.  Présence : classe → séance → liste → présent/absent/justifié.

## 10. Critères de validation

La maquette doit permettre sans explication technique : - retrouver un
étudiant ; - consulter son historique ; - voir ses différents cours ; -
créer une inscription ; - vérifier les documents ; - enregistrer un
paiement ; - voir le reste à payer ; - retrouver les impayés ; - gérer
une classe ; - faire la présence ; - enregistrer une recette ou une
dépense.

## 11. Hors périmètre V1

-   Comptabilité complète
-   Gestion RH
-   Remplacement de Moodle
-   Gestion pédagogique avancée
-   Application mobile native
-   Mécanisme technique du prélèvement avant choix du prestataire
-   IA
-   GED avancée
-   Automatisations n8n visibles dans l'interface

## 12. Dossier projet

1.  Matrice de recueil des besoins
2.  Cartographie des processus
3.  Modèle métier
4.  Maquettes papier
5.  Maquette interactive
6.  Spécifications fonctionnelles MVP

Ce dossier sera ensuite transmis à Claude Code pour la planification
technique et le développement.
