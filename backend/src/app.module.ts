import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { LobbyModule } from './lobby/lobby.module';
import { GameModule } from './game/game.module';
import { BiddingModule } from './bidding/bidding.module';
/**
 * ============================================================
 *   📌 API Backend Belote TFE — Endpoints (MVP actuel)
 * ============================================================
 * Base URL (dev) : http://localhost:3000
 *
 * ---------------------------
 *  LOBBY (UC03, UC04, UC04b, UC05)
 * ---------------------------
 * [Créer un lobby]
 * POST /lobby
 * Body:
 * {
 *   "nom": "Salon de test",
 *   "password": "optionnel",
 *   "createurId": 1
 * }
 *
 * [Récupérer un lobby]
 * GET /lobby/:id
 *
 * [Rejoindre un lobby]
 * POST /lobby/:id/join
 * Body:
 * {
 *   "joueurId": 2,
 *   "password": "si_defini"
 * }
 *
 * [Quitter un lobby]
 * POST /lobby/:id/leave
 * Body:
 * {
 *   "joueurId": 2
 * }
 *
 * [Lancer une partie]
 * POST /lobby/:id/start
 * Body:
 * {
 *   "joueurId": 1,
 *   "scoreMax": 301
 * }
 *
 * ---------------------------
 *  BIDDING / ENCHÈRES (UC06)
 * ---------------------------
 * [Manche active pour une partie]
 * GET /bidding/active/:partieId
 *
 * [État des enchères]
 * GET /bidding/state/:mancheId
 *
 * [Poser une enchère]
 * POST /bidding/:mancheId/bid
 * Body:
 * { "joueurId": 2, "type": "pass" }
 *
 * Types supportés :
 *   Tour 1: pass | take_card
 *   Tour 2: pass | choose_color (⚠️ couleurAtoutId requis, ≠ carte retournée)
 *
 * Exemple choose_color:
 * { "joueurId": 3, "type": "choose_color", "couleurAtoutId": 2 }
 *
 * Réponses possibles :
 *   - Pass → { message: "Pass. Joueur suivant: <id>" }
 *   - Take card → { message: "Preneur fixé...", ... }
 *   - Choose color → { message: "Preneur fixé...", ... }
 *   - 8 passes → { message: "Donne relancée (UC14)", newMancheId }
 *   - Manche périmée → { message: "...", activeMancheId, activeMancheNumero }
 *
 * ---------------------------
 *  PARTIE (abandon global)
 * ---------------------------
 * [Quitter une partie]
 * POST /game/:partieId/quit
 * Body:
 * { "joueurId": 3 }
 *
 * Effets :
 * - Partie.statut = 'abandonnee'
 * - Lobby lié remis en 'en_attente', suppression du membre qui quitte
 *
 * ============================================================
 *  📋 SEQUENCES POSTMAN RAPIDES
 * ============================================================
 *
 * Scénario A: Tour 1 → prise
 * 1. POST /lobby/:lobbyId/start
 * 2. GET  /bidding/active/:partieId
 * 3. GET  /bidding/state/:mancheId
 * 4. POST /bidding/:mancheId/bid (pass)
 * 5. POST /bidding/:mancheId/bid (pass)
 * 6. POST /bidding/:mancheId/bid (take_card)
 *
 * Scénario B: Tour 1 complet → Tour 2 → choose_color
 * 1. 4x pass (Tour 1)
 * 2. choose_color (couleur ≠ retournée)
 *
 * Scénario C: 8 passes → relance
 * 1. 4x pass (Tour 1)
 * 2. 4x pass (Tour 2)
 * 3. GET /bidding/active/:partieId → newMancheId
 * 4. Enchère sur ancienne manche → 409 + activeMancheId
 * 
 * POST http://localhost:3000/lobby/{{lobbyId}}/start
Body: { "joueurId": {{createurId}}, "scoreMax": 301 }

GET http://localhost:3000/bidding/active/{{partieId}}

GET http://localhost:3000/bidding/state/{{mancheId}}

POST http://localhost:3000/bidding/{{mancheId}}/bid (pass)
Body: { "joueurId": {{joueurActuelId}}, "type":"pass" }

POST http://localhost:3000/bidding/{{mancheId}}/bid (take_card)
Body: { "joueurId": {{joueurActuelId}}, "type":"take_card" }

POST http://localhost:3000/bidding/{{mancheId}}/bid (choose_color)
Body: { "joueurId": {{joueurActuelId}}, "type":"choose_color", "couleurAtoutId": {{Y}} }

POST http://localhost:3000/lobby/{{lobbyId}}/join
Body: { "joueurId": {{joueurId}}, "password": "si_defini" }

POST http://localhost:3000/lobby/{{lobbyId}}/leave
Body: { "joueurId": {{joueurId}} }

GET http://localhost:3000/lobby/{{lobbyId}} (détails lobby)

POST http://localhost:3000/game/{{partieId}}/quit
Body: { "joueurId": {{joueurId}} }
 */

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true}), PrismaModule, LobbyModule, GameModule, BiddingModule,],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
