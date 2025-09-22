/*
  Warnings:

  - A unique constraint covering the columns `[fromId,toId,status]` on the table `FriendRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."FriendRequest_fromId_toId_key";

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequest_fromId_toId_status_key" ON "public"."FriendRequest"("fromId", "toId", "status");
