-- CreateTable
CREATE TABLE "notifications_liste_attente" (
    "id" TEXT NOT NULL,
    "affectationCohorteId" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_liste_attente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectures_notification_liste_attente" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "luLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lectures_notification_liste_attente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_liste_attente_affectationCohorteId_key" ON "notifications_liste_attente"("affectationCohorteId");

-- CreateIndex
CREATE UNIQUE INDEX "lectures_notification_liste_attente_notificationId_utilisat_key" ON "lectures_notification_liste_attente"("notificationId", "utilisateurId");

-- AddForeignKey
ALTER TABLE "notifications_liste_attente" ADD CONSTRAINT "notifications_liste_attente_affectationCohorteId_fkey" FOREIGN KEY ("affectationCohorteId") REFERENCES "affectations_cohorte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectures_notification_liste_attente" ADD CONSTRAINT "lectures_notification_liste_attente_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications_liste_attente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectures_notification_liste_attente" ADD CONSTRAINT "lectures_notification_liste_attente_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
