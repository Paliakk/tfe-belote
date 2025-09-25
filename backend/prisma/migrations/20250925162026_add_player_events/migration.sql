-- CreateEnum
CREATE TYPE "public"."PlayerEventType" AS ENUM ('TURN_TIMEOUT', 'ABANDON_TRIGGERED');

-- CreateTable
CREATE TABLE "public"."PlayerEvent" (
    "id" SERIAL NOT NULL,
    "joueurId" INTEGER NOT NULL,
    "partieId" INTEGER NOT NULL,
    "mancheId" INTEGER,
    "type" "public"."PlayerEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerEvent_joueurId_type_createdAt_idx" ON "public"."PlayerEvent"("joueurId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerEvent_partieId_idx" ON "public"."PlayerEvent"("partieId");

-- AddForeignKey
ALTER TABLE "public"."PlayerEvent" ADD CONSTRAINT "PlayerEvent_joueurId_fkey" FOREIGN KEY ("joueurId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
