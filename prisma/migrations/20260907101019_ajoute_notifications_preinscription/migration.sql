-- CreateTable
CREATE TABLE "notifications_preinscription" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifieParEmailLe" TIMESTAMP(3),

    CONSTRAINT "notifications_preinscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lectures_notification_preinscription" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "luLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lectures_notification_preinscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_preinscription_notifieParEmailLe_idx" ON "notifications_preinscription"("notifieParEmailLe");

-- CreateIndex
CREATE UNIQUE INDEX "lectures_notification_preinscription_notificationId_utilisa_key" ON "lectures_notification_preinscription"("notificationId", "utilisateurId");

-- AddForeignKey
ALTER TABLE "notifications_preinscription" ADD CONSTRAINT "notifications_preinscription_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectures_notification_preinscription" ADD CONSTRAINT "lectures_notification_preinscription_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications_preinscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lectures_notification_preinscription" ADD CONSTRAINT "lectures_notification_preinscription_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
