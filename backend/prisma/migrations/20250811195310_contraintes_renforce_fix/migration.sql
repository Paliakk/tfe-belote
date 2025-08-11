/*
  Warnings:

  - A unique constraint covering the columns `[couleurId,valeur]` on the table `Carte` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mancheId,joueurId,carteId]` on the table `Main` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."EquipeJoueur_ordreSiege_key";

-- CreateIndex
CREATE UNIQUE INDEX "Carte_couleurId_valeur_key" ON "public"."Carte"("couleurId", "valeur");

-- CreateIndex
CREATE UNIQUE INDEX "Main_mancheId_joueurId_carteId_key" ON "public"."Main"("mancheId", "joueurId", "carteId");
