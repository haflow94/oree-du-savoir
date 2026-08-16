# 01 — Cahier fonctionnel MVP

## Objectif
Remplacer les principaux Excel de l'association par une application simple, fiable, sécurisée, responsive et évolutive. Le MVP accompagne le fonctionnement actuel ; il ne cherche pas à figer toute la future organisation.

## MVP
- préinscription publique ;
- dossier et génération du dossier officiel ;
- étudiants / responsables ;
- réinscriptions ;
- plusieurs cours par étudiant ;
- classes / planning de base ;
- présences ;
- paiements / échéances / chèques ;
- trésorerie simple ;
- utilisateurs / droits ;
- recherche / historique ;
- sauvegardes.

## Préinscription
Parcours :
Préinscription → dossier enregistré → dossier officiel généré → email → venue sur place → signature + documents + paiement → contrôle → validation → cours/classes → confirmation.

Le publipostage Excel/Word actuel n'est pas le mécanisme cible. Le modèle officiel du dossier est conservé.

Documents MVP : pièce d'identité, photo, chèque ou informations nécessaires au paiement bancaire.

## Étudiant
Une fiche unique par personne. Réinscription multi-années. Multi-cours la même année. Recherche et détection de doublons.

Le champ DDF de l'ancienne BDD doit être clarifié avant intégration.

## Cours / classes
Un étudiant peut suivre plusieurs cours.
Une classe est un groupe concret relié au planning : cours, niveau/section, enseignant(s), jour, horaire, période/semestre, salle, capacité.

## Présence
Statuts actuels : P Présent, R Retard, RE Retard excusé, A Absent, AE Absent excusé.
Parcours : QR de classe → authentification enseignant → séance du jour → Tous présents → exceptions → Valider.
Séances générées automatiquement depuis le planning. Relance si non validée. Papier de secours.

## Paiements
Vue simple inspirée de l'Excel :
Étudiant | Coordonnées | Cours/classes | Dû | Échéances | Encaissé | Reste | Statut

Les mois ne sont pas des colonnes de données : utiliser échéances et paiements structurés.
Chèque structuré. Prélèvement prévu mais intégration non bloquante pour le MVP.

## Trésorerie
Très simple : date, libellé, catégorie, recette/dépense, moyen, montant, justificatif éventuel, solde. Pas de comptabilité complète.

## Documents
Fichiers séparés de la base, stockage local/NAS privilégié. PDF/images visualisables dans l'application.

## Utilisateurs
Création, rôle, permissions, activation/désactivation, révocation. Rôles : Président/Bureau, Administration, Accueil, Trésorier, Direction, CA selon besoin.

## n8n
Automatisations : emails, relances, alertes, présences non validées, paiements, rapports. L'application doit fonctionner sans n8n.

## UX
Simple, logique, rapide, jolie, professionnelle, responsive. Pas de double saisie. Situation du dossier et situation financière visibles sur la fiche étudiant.

## Évolution
Prélèvement automatisé, reporting comptable avancé, CA/AG, portail plus riche, règles pédagogiques futures et autres automatisations seront ajoutés progressivement.
