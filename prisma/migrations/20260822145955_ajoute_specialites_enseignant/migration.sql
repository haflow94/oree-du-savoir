-- CreateTable
CREATE TABLE "_EnseignantSpecialites" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EnseignantSpecialites_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_EnseignantSpecialites_B_index" ON "_EnseignantSpecialites"("B");

-- AddForeignKey
ALTER TABLE "_EnseignantSpecialites" ADD CONSTRAINT "_EnseignantSpecialites_A_fkey" FOREIGN KEY ("A") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EnseignantSpecialites" ADD CONSTRAINT "_EnseignantSpecialites_B_fkey" FOREIGN KEY ("B") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
