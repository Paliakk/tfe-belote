/*
  Warnings:

  - The `statut` column on the `Partie` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."PartieStatut" AS ENUM ('en_attente', 'en_cours', 'finie', 'abandonnee');

-- AlterTable
ALTER TABLE "public"."Partie" DROP COLUMN "statut",
ADD COLUMN     "statut" "public"."PartieStatut" NOT NULL DEFAULT 'en_attente';
