-- CreateEnum
CREATE TYPE "public"."EnchereType" AS ENUM ('pass', 'take_card', 'choose_color');

-- CreateEnum
CREATE TYPE "public"."BonusType" AS ENUM ('belote', 'capot', 'dix_de_der');

-- CreateTable
CREATE TABLE "public"."Joueur" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "estConnecte" BOOLEAN NOT NULL DEFAULT false,
    "derniereConnexion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectionId" TEXT,

    CONSTRAINT "Joueur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Couleur" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "Couleur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Carte" (
    "id" SERIAL NOT NULL,
    "couleurId" INTEGER NOT NULL,
    "valeur" TEXT NOT NULL,
    "pointsAtout" INTEGER NOT NULL,
    "pointsNonAtout" INTEGER NOT NULL,

    CONSTRAINT "Carte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Partie" (
    "id" SERIAL NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'waiting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoreMax" INTEGER NOT NULL,
    "nombreJoueurs" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "Partie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Equipe" (
    "id" SERIAL NOT NULL,
    "partieId" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EquipeJoueur" (
    "equipeId" INTEGER NOT NULL,
    "joueurId" INTEGER NOT NULL,
    "ordreSiege" INTEGER NOT NULL,

    CONSTRAINT "EquipeJoueur_pkey" PRIMARY KEY ("equipeId","joueurId")
);

-- CreateTable
CREATE TABLE "public"."Manche" (
    "id" SERIAL NOT NULL,
    "partieId" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "couleurAtoutId" INTEGER,
    "donneurJoueurId" INTEGER,
    "beloteJoueurId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "carteRetourneeId" INTEGER,

    CONSTRAINT "Manche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Main" (
    "id" SERIAL NOT NULL,
    "joueurId" INTEGER NOT NULL,
    "mancheId" INTEGER NOT NULL,
    "carteId" INTEGER NOT NULL,
    "jouee" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Main_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Enchere" (
    "id" SERIAL NOT NULL,
    "joueurId" INTEGER NOT NULL,
    "mancheId" INTEGER NOT NULL,
    "valeur" TEXT NOT NULL,
    "enchereType" "public"."EnchereType" NOT NULL,
    "couleurAtoutId" INTEGER,
    "encherePoints" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enchere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Pli" (
    "id" SERIAL NOT NULL,
    "mancheId" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "gagnantId" INTEGER,

    CONSTRAINT "Pli_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PliCarte" (
    "id" SERIAL NOT NULL,
    "pliId" INTEGER NOT NULL,
    "joueurId" INTEGER NOT NULL,
    "carteId" INTEGER NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "PliCarte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lobby" (
    "id" SERIAL NOT NULL,
    "partieId" INTEGER,
    "nom" TEXT NOT NULL,
    "password" TEXT,
    "createurId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',

    CONSTRAINT "Lobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScoreManche" (
    "id" SERIAL NOT NULL,
    "mancheId" INTEGER NOT NULL,
    "equipeId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreManche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Bonus" (
    "id" SERIAL NOT NULL,
    "scoreboardId" INTEGER NOT NULL,
    "type" "public"."BonusType" NOT NULL,
    "points" INTEGER NOT NULL,
    "equipeId" INTEGER,

    CONSTRAINT "Bonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Joueur_username_key" ON "public"."Joueur"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Joueur_email_key" ON "public"."Joueur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Couleur_nom_key" ON "public"."Couleur"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "EquipeJoueur_ordreSiege_key" ON "public"."EquipeJoueur"("ordreSiege");

-- CreateIndex
CREATE UNIQUE INDEX "Lobby_partieId_key" ON "public"."Lobby"("partieId");

-- AddForeignKey
ALTER TABLE "public"."Carte" ADD CONSTRAINT "Carte_couleurId_fkey" FOREIGN KEY ("couleurId") REFERENCES "public"."Couleur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Equipe" ADD CONSTRAINT "Equipe_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "public"."Partie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EquipeJoueur" ADD CONSTRAINT "EquipeJoueur_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "public"."Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EquipeJoueur" ADD CONSTRAINT "EquipeJoueur_joueurId_fkey" FOREIGN KEY ("joueurId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Manche" ADD CONSTRAINT "Manche_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "public"."Partie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Manche" ADD CONSTRAINT "Manche_couleurAtoutId_fkey" FOREIGN KEY ("couleurAtoutId") REFERENCES "public"."Couleur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Manche" ADD CONSTRAINT "Manche_donneurJoueurId_fkey" FOREIGN KEY ("donneurJoueurId") REFERENCES "public"."Joueur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Manche" ADD CONSTRAINT "Manche_beloteJoueurId_fkey" FOREIGN KEY ("beloteJoueurId") REFERENCES "public"."Joueur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Manche" ADD CONSTRAINT "Manche_carteRetourneeId_fkey" FOREIGN KEY ("carteRetourneeId") REFERENCES "public"."Carte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Main" ADD CONSTRAINT "Main_joueurId_fkey" FOREIGN KEY ("joueurId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Main" ADD CONSTRAINT "Main_mancheId_fkey" FOREIGN KEY ("mancheId") REFERENCES "public"."Manche"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Main" ADD CONSTRAINT "Main_carteId_fkey" FOREIGN KEY ("carteId") REFERENCES "public"."Carte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Enchere" ADD CONSTRAINT "Enchere_joueurId_fkey" FOREIGN KEY ("joueurId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Enchere" ADD CONSTRAINT "Enchere_mancheId_fkey" FOREIGN KEY ("mancheId") REFERENCES "public"."Manche"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Enchere" ADD CONSTRAINT "Enchere_couleurAtoutId_fkey" FOREIGN KEY ("couleurAtoutId") REFERENCES "public"."Couleur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pli" ADD CONSTRAINT "Pli_mancheId_fkey" FOREIGN KEY ("mancheId") REFERENCES "public"."Manche"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pli" ADD CONSTRAINT "Pli_gagnantId_fkey" FOREIGN KEY ("gagnantId") REFERENCES "public"."Joueur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PliCarte" ADD CONSTRAINT "PliCarte_pliId_fkey" FOREIGN KEY ("pliId") REFERENCES "public"."Pli"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PliCarte" ADD CONSTRAINT "PliCarte_joueurId_fkey" FOREIGN KEY ("joueurId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PliCarte" ADD CONSTRAINT "PliCarte_carteId_fkey" FOREIGN KEY ("carteId") REFERENCES "public"."Carte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lobby" ADD CONSTRAINT "Lobby_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "public"."Partie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lobby" ADD CONSTRAINT "Lobby_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "public"."Joueur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScoreManche" ADD CONSTRAINT "ScoreManche_mancheId_fkey" FOREIGN KEY ("mancheId") REFERENCES "public"."Manche"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScoreManche" ADD CONSTRAINT "ScoreManche_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "public"."Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bonus" ADD CONSTRAINT "Bonus_scoreboardId_fkey" FOREIGN KEY ("scoreboardId") REFERENCES "public"."ScoreManche"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bonus" ADD CONSTRAINT "Bonus_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "public"."Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
