export enum GameEvent {
  // Lobby
  LobbyJoined = 'lobby:joined',
  LobbyState = 'lobby:state',
  LobbyUpdate = 'lobby:update',
  LobbyClosed = 'lobby:closed',
  LobbyGameStarted = 'lobby:gameStarted',

  // Navigation/Partie
  PartieStarted = 'partie:started',
  JoinedPartie = 'joinedPartie',
  GameOver = 'game:over',

  // Enchères
  BiddingState = 'bidding:state',
  BiddingPlaced = 'bidding:placed',
  BiddingEnded = 'bidding:ended',

  // Belote
  BeloteDeclared = 'belote:declared',
  BeloteRebelote = 'belote:rebelote',
  BeloteReset = 'belote:reset',

  // Jeu
  HandState = 'hand:state',
  PlayPlayable = 'play:playable',
  TurnState = 'turn:state',
  TrickState = 'trick:state',
  TrickClosed = 'trick:closed',
  MancheEnded = 'manche:ended',

  // Score live
  ScoreLive = 'score:live',

  // Donne (nouvelle manche / relance)
  DonneRelancee = 'donne:relancee',
}

// ========== Payloads types ==========

// Emis par GameGateway.joinPartie()
export interface JoinedPartiePayload {
  partieId: number;
  joueurId: number;
  mancheId: number; // la gateway t’envoie toujours la manche courante (non null)
  at: string; // ISO string
}

// État d’enchères complet (BiddingGateway / PlayGateway.rehydrate)
export interface BiddingStatePayload {
  mancheId: number;
  joueurActuelId: number | null;
  tourActuel: 1 | 2;
  preneurId?: number | null;
  atout?: { id: number; nom?: string } | null;
  carteRetournee?: { id: number; valeur: string; couleurId: number } | null;
  seats?: { seat: number; joueurId: number; username: string }[];
  encheres: {
    joueurId: number;
    type: 'pass' | 'take_card' | 'choose_color';
    couleurAtoutId?: number;
    encherePoints?: number;
    createdAt: string; // ISO
  }[];
}

// Petit event court lors d’une enchère posée
export interface BiddingPlacedPayload {
  mancheId: number;
  joueurId: number;
  type: 'pass' | 'take_card' | 'choose_color';
  couleurAtoutId?: number;
  encherePoints?: number;
  tour: 1 | 2;
  at: string; // ISO
}

// Fin d’enchères (front passe en phase de jeu)
export interface BiddingEndedPayload {
  mancheId: number;
  preneurId: number;
  atoutId: number | null;
}

// Main privée du joueur
export interface HandStatePayload {
  mancheId: number;
  cartes: { id: number; valeur: string; couleurId: number }[];
}

// Cartes jouables pour le joueur courant
export interface PlayPlayablePayload {
  carteIds: number[]; // ou "cards/cartes" mais ton front consomme carteIds
}

// Tour de jeu (qui doit jouer)
export interface TurnStatePayload {
  mancheId: number;
  joueurActuelId: number | null;
  seats?: { seat: number; joueurId: number; username: string }[]; // parfois ajouté
}

// Tapis (pli courant, cartes posées)
export interface TrickStatePayload {
  mancheId: number;
  numero: number; // si dispo côté queries
  cartes: {
    ordre: number;
    joueurId: number;
    carte: { id: number; valeur: string; couleurId: number };
  }[];
}

// Pli fermé → pour afficher “dernier pli”
export interface TrickClosedPayload {
  cartes: {
    ordre: number;
    joueurId: number;
    carte: { id: number; valeur: string; couleurId: number };
  }[];
  gagnantId?: number | null;
  numero?: number;
}

// Score live (manche en cours)
export interface ScoreLivePayload {
  mancheId: number;
  team1: number;
  team2: number;
}

// Nouvelle donne (relance) créée
export interface DonneRelanceePayload {
  oldMancheId?: number; // présent dans certains cas
  newMancheId: number;
  numero?: number;
}

// Fin de partie (UC12 → décision == game over)
export interface GameOverPayload {
  partieId: number;
  winnerTeamNumero?: 1 | 2;
  totals?: { team1: number; team2: number };
  lobbyId?: number | null; // utile pour UI/redirect
}

// Lobby
export interface LobbyJoinedPayload {
  lobbyId: number;
}
export interface LobbyStatePayload {
  lobbyId: number;
  lobbyName?: string
  membres: { id: number; username: string }[];
}
export interface LobbyUpdatePayload {
  lobbyId: number;
  type: 'join' | 'leave';
  joueur: string; // username
}
export interface LobbyGameStartedPayload {
  lobbyId?: number;
  partieId: number;
}
