/*
  Warnings:

  - A unique constraint covering the columns `[mancheCouranteId]` on the table `Partie` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."MancheStatut" AS ENUM ('active', 'relancee', 'terminee');

-- AlterTable
ALTER TABLE "public"."Manche" ADD COLUMN     "statut" "public"."MancheStatut" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "public"."Partie" ADD COLUMN     "mancheCouranteId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Partie_mancheCouranteId_key" ON "public"."Partie"("mancheCouranteId");

-- AddForeignKey
ALTER TABLE "public"."Partie" ADD CONSTRAINT "Partie_mancheCouranteId_fkey" FOREIGN KEY ("mancheCouranteId") REFERENCES "public"."Manche"("id") ON DELETE SET NULL ON UPDATE CASCADE;
