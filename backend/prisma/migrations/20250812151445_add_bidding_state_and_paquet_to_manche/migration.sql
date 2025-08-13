/*
  Warnings:

  - Added the required column `joueurActuelId` to the `Manche` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Manche" ADD COLUMN     "joueurActuelId" INTEGER NOT NULL,
ADD COLUMN     "paquet" INTEGER[],
ADD COLUMN     "preneurId" INTEGER,
ADD COLUMN     "tourActuel" INTEGER NOT NULL DEFAULT 1;
