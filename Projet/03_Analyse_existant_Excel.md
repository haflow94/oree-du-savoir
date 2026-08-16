# 07 — Analyse de l'existant Excel

## 1. Objectif

Ce document analyse les fichiers Excel actuellement utilisés par l'association afin de distinguer :

- les informations réellement nécessaires ;
- les règles métier implicites ;
- les pratiques à conserver ;
- les mécanismes Excel à remplacer ;
- les éléments à intégrer dans l'application ;
- les éléments à ne pas reproduire.

**Principe :** l'application doit reprendre le fonctionnement métier utile, mais ne doit pas reproduire la structure des fichiers Excel lorsque celle-ci est seulement une conséquence des limites d'Excel.

---

# 2. Fichiers analysés

| Fichier | Fonction actuelle | Rôle dans le futur système |
|---|---|---|
| `BD.xlsx` | Base de données étudiants | Source de référence pour le modèle Étudiant |
| `Trés.xlsx` | Suivi des paiements étudiants | Source de référence pour le modèle Paiement / Échéance |
| `ES.xlsx` | Entrées / sorties de trésorerie | Source de référence pour la Trésorerie simple |
| `Modele présence.xlsx` | Feuille annuelle de présence | Source de référence pour Présence / Séance |
| `Exemple Planning des cours.xlsx` | Planning des cours | Source de référence pour Cours / Classe / Planning |

Les fichiers fournis semblent être principalement des **modèles ou structures de travail**, et non une base complète de données à migrer. L'analyse porte donc surtout sur leur structure et les règles qu'elle révèle.

---

# 3. `BD.xlsx` — Base étudiants

## 3.1 Structure constatée

La feuille contient notamment :

- Nom ;
- Prénom ;
- Classe ;
- Numéro mobile ;
- Numéro fixe ;
- Adresse e-mail ;
- Adresse postale ;
- Complément d'adresse ;
- DDF ;
- DDN ;
- Remarque ;
- Ville de naissance ;
- Profession ;
- Niveau d'études ;
- Dernier diplôme obtenu ;
- Civilité.

## 3.2 Ce que cela révèle

La base actuelle mélange :

1. l'identité permanente de la personne ;
2. ses coordonnées ;
3. des informations personnelles ;
4. sa situation scolaire ;
5. une notion de `Classe`.

Cette dernière ne doit pas être conservée comme simple champ texte dans l'application.

### Décision cible

L'application doit séparer :

```text
Étudiant
   │
   ├── Informations personnelles
   ├── Coordonnées
   └── Historique des inscriptions
             │
             └── Participation à un ou plusieurs cours/classes
```

Ainsi, une réinscription ne crée pas une nouvelle personne.

## 3.3 `DDF`

Le champ `DDF` apparaît dans la BDD mais son signification métier doit être confirmée avec l'association avant d'être intégré tel quel.

**Ne pas inventer sa signification.**

## 3.4 À conserver

La majorité des informations de la BDD sont pertinentes, sous réserve de validation :

- identité ;
- coordonnées ;
- date de naissance ;
- profession ;
- niveau d'études ;
- diplôme ;
- informations d'adresse.

## 3.5 À ne pas reproduire

Ne pas créer une table ou une fiche avec une simple colonne `Classe` comme dans Excel.

La classe doit être issue de la relation :

```text
Étudiant → Inscription → Participation → Classe
```

---

# 4. `Trés.xlsx` — Paiements étudiants

## 4.1 Structure constatée

Le modèle contient notamment :

- Nom ;
- Prénom ;
- Classe ;
- Montant dû ;
- Téléphone ;
- Mail ;
- Date de facturation ;
- Nom de facturation ;
- Banque ;
- N° de chèque ;
- colonnes mensuelles ;
- Montant réglé ;
- Remarque.

Les colonnes mensuelles permettent de noter les montants encaissés au fil de l'année.

## 4.2 Règle métier importante

Le fichier confirme que l'association raisonne actuellement sur :

> **un étudiant → montant dû → plusieurs paiements/échéances → montant réglé → reste**

Il ne faut donc pas reproduire les mois sous forme de colonnes fixes.

### Modèle cible

```text
Étudiant
   │
   └── Dossier d'inscription annuel
          │
          └── Plan de paiement
                 ├── Échéance 1
                 ├── Échéance 2
                 └── Échéance 3
                        │
                        └── Paiement(s)
```

Cela permet également les paiements partiels et les montants différents.

## 4.3 Chèques

Le fichier confirme l'importance du chèque :

- banque ;
- numéro de chèque ;
- titulaire / nom de facturation.

Il faudra ajouter les informations nécessaires au suivi du dépôt et de l'encaissement, conformément au besoin métier déjà recueilli.

## 4.4 Ce qui doit apparaître dans l'application

La vue principale doit rester proche de l'usage actuel :

```text
Étudiant | Coordonnées | Cours | Dû | Échéances | Encaissé | Reste | Statut
```

Mais les données doivent être structurées derrière cette vue.

## 4.5 Prélèvement

Le fichier actuel ne montre pas de véritable structure de prélèvement.

Le besoin de prélèvement provient de la cible fonctionnelle et doit donc être conçu séparément, sans essayer de le déduire de l'Excel actuel.

---

# 5. `ES.xlsx` — Entrées / sorties

## 5.1 Structure constatée

Colonnes :

- Date ;
- Entrée espèces ;
- Dépenses espèces ;
- Entrée chèques / virements ;
- Dépôt espèces ;
- Sortie chèques ;
- Sortie CB / virements ;
- Désignation ;
- Solde ;
- ligne de totaux.

## 5.2 Ce que cela confirme

La trésorerie actuelle est **simple**.

Il ne faut surtout pas transformer ce module en logiciel de comptabilité.

Le modèle cible peut rester :

```text
Mouvement
├── Date
├── Type
├── Montant
├── Moyen
├── Catégorie
├── Désignation
├── Justificatif
└── Solde calculé
```

## 5.3 Point à clarifier

Le fichier distingue actuellement plusieurs moyens de mouvement :

- espèces ;
- chèques ;
- virements ;
- CB.

L'application devra déterminer avec l'association si cette distinction doit être conservée comme `moyen de paiement`/`moyen de mouvement`.

---

# 6. `Modele présence.xlsx` — Présence

## 6.1 Structure constatée

Le modèle contient :

- année ;
- professeur ;
- cours ;
- horaires ;
- noms ;
- prénoms ;
- une colonne par date ;
- mois ;
- jours.

Les statuts actuels sont :

- `P` = Présent ;
- `R` = En retard ;
- `RE` = Retard excusé ;
- `A` = Absent ;
- `AE` = Absent excusé.

## 6.2 Règle métier importante

L'Excel représente les présences sous la forme :

> **une ligne étudiant × une colonne séance**

C'est efficace pour l'impression et le suivi annuel, mais ce n'est pas le meilleur modèle informatique.

### Modèle cible

```text
Classe
   │
   └── Séances
          │
          └── Présences
                 ├── Étudiant
                 ├── Statut
                 └── Date/heure
```

La vue annuelle peut ensuite être reconstruite automatiquement si l'association souhaite l'imprimer ou l'exporter.

## 6.3 Statuts à conserver

Les statuts `P`, `R`, `RE`, `A`, `AE` sont une information métier réelle et doivent être pris en compte dans le modèle.

Ils complètent notre spécification précédente.

### Décision

La V1 doit donc prévoir :

- Présent ;
- Retard ;
- Retard excusé ;
- Absent ;
- Absent excusé.

Le bouton `Tous présents` reste l'action principale.

## 6.4 QR code

Le fonctionnement actuel ne contient pas de QR code : c'est une **amélioration cible** proposée pour simplifier l'usage.

Le QR code ne remplace pas la notion de séance.

Il fournit simplement un accès rapide à :

```text
Classe → Séance du jour → Présence
```

---

# 7. `Exemple Planning des cours.xlsx`

## 7.1 Structure constatée

Le planning est organisé par :

- jour ;
- semestre ;
- niveau/année ;
- créneau ;
- cours ;
- enseignant ;
- salle.

Exemples de créneaux :

- 9h00–10h15 ;
- 10h30–11h45 ;
- 12h00–13h15.

Le fichier contient notamment des plannings dimanche et samedi, avec des variantes selon les semestres.

## 7.2 Ce que cela confirme

Le planning est un **référentiel d'organisation**, pas une simple liste de classes.

Il doit permettre de déterminer :

```text
Quand ?
Où ?
Quel cours ?
Quel niveau ?
Quel groupe ?
Quel enseignant ?
```

## 7.3 Modèle cible

```text
Cours
  │
  └── Classe / Groupe
          ├── Niveau
          ├── Enseignant(s)
          ├── Jour
          ├── Heure début
          ├── Heure fin
          ├── Salle
          ├── Capacité
          └── Étudiants
```

Le planning doit également pouvoir évoluer entre les semestres.

---

# 8. Synthèse des règles métier révélées par les Excel

## 8.1 Étudiant

```text
Une personne possède une fiche unique.
```

## 8.2 Historique

```text
Une personne peut être inscrite plusieurs années.
```

## 8.3 Multi-cours

```text
Un étudiant peut suivre plusieurs cours la même année.
```

## 8.4 Paiement

```text
Montant dû
→ plusieurs échéances/paiements
→ montant encaissé
→ reste à payer
```

## 8.5 Présence

```text
Une classe
→ plusieurs séances
→ une présence par étudiant et par séance
```

## 8.6 Planning

```text
Planning
→ jour
→ semestre
→ créneau
→ cours
→ enseignant
→ salle
```

## 8.7 Trésorerie

```text
Entrée / sortie
→ montant
→ moyen
→ désignation
→ solde
```

---

# 9. Ce que l'application doit reprendre

| Élément actuel | Cible |
|---|---|
| BDD étudiants | Fiche étudiant structurée |
| Classe dans BDD | Relation inscription → cours/classe |
| Colonnes mensuelles paiement | Échéances/paiements structurés |
| N° chèque | Objet paiement/chèque |
| Montant réglé | Total encaissé calculé |
| Reste | Calculé automatiquement |
| Couleurs Excel | Statuts métier |
| Colonnes de présence | Séances + présences |
| P/R/RE/A/AE | Statuts de présence |
| Planning Excel | Planning structuré |
| ES Entrée/Sortie | Trésorerie simple |
| Totaux Excel | Calculs automatiques |
| Publipostage | Génération automatique du dossier |
| Excel comme source centrale | Application comme source de vérité |

---

# 10. Ce qu'il ne faut PAS reproduire

L'application ne doit pas devenir :

- un Excel géant dans un navigateur ;
- une table avec des mois en colonnes ;
- une colonne `Classe` libre ;
- une feuille annuelle de présence de 40 colonnes ;
- plusieurs fichiers parallèles ;
- un système de couleurs sans statuts ;
- une comptabilité complète.

Le principe est :

> **Conserver la logique métier, supprimer les contraintes liées à Excel.**

---

# 11. Éléments nécessitant validation

L'analyse des fichiers fait apparaître plusieurs points à confirmer avec l'association :

### Étudiants

- signification exacte de `DDF` ;
- définition précise de `Classe` dans l'ancien système ;
- données réellement obligatoires ;
- données devenues inutiles.

### Paiements

- signification exacte de `Date de facturation` ;
- distinction entre nom de facturation et titulaire du paiement ;
- informations de dépôt/encaissement des chèques ;
- gestion exacte des prélèvements.

### Présences

- le retard et retard excusé doivent-ils être conservés ?
- l'administration doit-elle pouvoir modifier toutes les présences ?
- délai de correction d'une présence validée ?

### Planning

- différence exacte entre `cours`, `classe`, `niveau`, `année` et `groupe` ;
- règles de changement entre semestre 1 et semestre 2 ;
- capacité réelle des salles ;
- plusieurs enseignants pour une même classe.

### Trésorerie

- catégories définitives ;
- moyens à conserver ;
- besoin réel d'un justificatif sur chaque mouvement ;
- informations attendues par le comptable.

---

# 12. Impact sur les documents précédents

Cette analyse ne remet pas en cause l'architecture générale définie précédemment.

Elle apporte cependant plusieurs **précisions qui doivent être intégrées au document 6** :

1. Les statuts de présence doivent inclure `Présent`, `Retard`, `Retard excusé`, `Absent`, `Absent excusé`.
2. La notion de classe doit être reliée au planning et non stockée comme simple texte étudiant.
3. Le planning doit gérer les semestres.
4. Les paiements doivent être modélisés comme des échéances/paiements et non comme des colonnes mensuelles.
5. La trésorerie doit conserver la distinction utile entre les moyens de mouvement.
6. Le dossier étudiant doit reprendre les données pertinentes de la BDD actuelle, après validation.
7. Le modèle de présence annuel peut être généré automatiquement à partir des séances.
8. Le QR code est une optimisation d'accès, pas un élément du modèle métier.

---

# 13. Conclusion

Les Excel actuels confirment globalement les choix fonctionnels déjà réalisés.

Ils montrent surtout que l'application doit faire une transformation :

```text
                    AUJOURD'HUI
┌─────────┐ ┌─────────┐ ┌──────────┐
│   BD    │ │  Trés.  │ │ Présence │
└─────────┘ └─────────┘ └──────────┘
      │          │           │
      └──────────┼───────────┘
                 │
              Excel
                 │
          opérations manuelles


                    CIBLE
              ┌──────────────┐
              │  APPLICATION │
              └───────┬──────┘
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   Étudiants       Paiements      Planning
       │              │              │
   Inscriptions    Trésorerie    Classes
       │              │              │
   Documents        Rapports     Présences
                      │
                     n8n
                      │
           automatisations / emails
```

**Objectif : ne pas reproduire les Excel ; transformer leur logique en système métier cohérent.**
