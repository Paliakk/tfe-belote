-- DropForeignKey
ALTER TABLE "public"."LobbyJoueur" DROP CONSTRAINT "LobbyJoueur_joueurId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LobbyJoueur" DROP CONSTRAINT "LobbyJoueur_lobbyId_fkey";

-- AddForeignKey
ALTER TABLE "public"."LobbyJoueur" ADD CONSTRAINT "LobbyJoueur_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "public"."Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LobbyJoueur" ADD CONSTRAINT "LobbyJoueur_joueurId_fkey" FOREIGN KEY ("joueurId") REFERENCES "public"."Joueur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
