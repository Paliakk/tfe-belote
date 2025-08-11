/*
  Warnings:

  - You are about to drop the column `equipeId` on the `Bonus` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Bonus" DROP CONSTRAINT "Bonus_equipeId_fkey";

-- AlterTable
ALTER TABLE "public"."Bonus" DROP COLUMN "equipeId";

-- CreateTable
CREATE TABLE "public"."LobbyJoueur" (
    "lobbyId" INTEGER NOT NULL,
    "joueurId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyJoueur_pkey" PRIMARY KEY ("lobbyId","joueurId")
);

-- CreateIndex
CREATE INDEX "LobbyJoueur_joueurId_idx" ON "public"."LobbyJoueur"("joueurId");

-- AddForeignKey
ALTER TABLE "public"."LobbyJoueur" ADD CONSTRAINT "LobbyJoueur_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "public"."Lobby"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LobbyJoueur" ADD CONSTRAINT "LobbyJoueur_joueurId_fkey" FOREIGN KEY ("joueurId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
