# 02 — Modèle métier

```text
Étudiant
├── Responsables légaux
└── Dossier annuel
    ├── Préinscription / état
    ├── Documents
    ├── Participations à plusieurs cours
    │   └── Classes
    │       └── Séances
    │           └── Présences
    └── Situation financière annuelle
        └── Échéancier
            └── Paiements
                ├── Chèque
                └── Prélèvement
```

## Entités
- Étudiant
- Responsable légal
- Année scolaire
- Préinscription
- Dossier annuel
- Participation à un cours
- Cours
- Niveau / section
- Classe / groupe
- Planning
- Séance
- Présence
- Document
- Échéancier
- Paiement
- Chèque
- Prélèvement
- Mouvement de trésorerie
- Utilisateur

## Règles
1. Une personne = une fiche.
2. Plusieurs années possibles.
3. Plusieurs cours la même année.
4. Documents + paiement finalisent normalement le dossier sur place.
5. Paiements structurés, pas de mois en colonnes.
6. Classe reliée au planning.
7. Séances générées depuis le planning.
8. Présences structurées par séance.
9. Trésorerie simple.
10. Fichiers séparés de la base.
11. n8n hors cœur métier.
12. Modèle évolutif.
