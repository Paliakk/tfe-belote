/*
  Warnings:

  - A unique constraint covering the columns `[auth0Sub]` on the table `Joueur` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Joueur" ADD COLUMN     "auth0Sub" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Joueur_auth0Sub_key" ON "public"."Joueur"("auth0Sub");
