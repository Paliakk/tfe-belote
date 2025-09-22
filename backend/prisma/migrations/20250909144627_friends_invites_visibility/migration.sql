-- CreateEnum
CREATE TYPE "public"."LobbyVisibility" AS ENUM ('public', 'friends', 'private');

-- CreateEnum
CREATE TYPE "public"."LobbyInviteStatus" AS ENUM ('sent', 'accepted', 'declined', 'expired');

-- AlterTable
ALTER TABLE "public"."Lobby" ADD COLUMN     "visibility" "public"."LobbyVisibility" NOT NULL DEFAULT 'public';

-- CreateTable
CREATE TABLE "public"."FriendRequest" (
    "id" SERIAL NOT NULL,
    "fromId" INTEGER NOT NULL,
    "toId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Friendship" (
    "id" SERIAL NOT NULL,
    "aId" INTEGER NOT NULL,
    "bId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LobbyInvite" (
    "id" SERIAL NOT NULL,
    "lobbyId" INTEGER NOT NULL,
    "fromId" INTEGER NOT NULL,
    "toId" INTEGER NOT NULL,
    "status" "public"."LobbyInviteStatus" NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FriendRequest_fromId_idx" ON "public"."FriendRequest"("fromId");

-- CreateIndex
CREATE INDEX "FriendRequest_toId_idx" ON "public"."FriendRequest"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequest_fromId_toId_key" ON "public"."FriendRequest"("fromId", "toId");

-- CreateIndex
CREATE INDEX "Friendship_aId_idx" ON "public"."Friendship"("aId");

-- CreateIndex
CREATE INDEX "Friendship_bId_idx" ON "public"."Friendship"("bId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_aId_bId_key" ON "public"."Friendship"("aId", "bId");

-- CreateIndex
CREATE INDEX "LobbyInvite_lobbyId_idx" ON "public"."LobbyInvite"("lobbyId");

-- CreateIndex
CREATE INDEX "LobbyInvite_toId_idx" ON "public"."LobbyInvite"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "LobbyInvite_lobbyId_toId_status_key" ON "public"."LobbyInvite"("lobbyId", "toId", "status");

-- AddForeignKey
ALTER TABLE "public"."FriendRequest" ADD CONSTRAINT "FriendRequest_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FriendRequest" ADD CONSTRAINT "FriendRequest_toId_fkey" FOREIGN KEY ("toId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Friendship" ADD CONSTRAINT "Friendship_aId_fkey" FOREIGN KEY ("aId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Friendship" ADD CONSTRAINT "Friendship_bId_fkey" FOREIGN KEY ("bId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LobbyInvite" ADD CONSTRAINT "LobbyInvite_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "public"."Lobby"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LobbyInvite" ADD CONSTRAINT "LobbyInvite_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LobbyInvite" ADD CONSTRAINT "LobbyInvite_toId_fkey" FOREIGN KEY ("toId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
