export enum GameEvent {
  // Partie / Lobby
  JoinedPartie = 'joinedPartie',

  // Enchères
  BiddingState = 'bidding:state',
  BiddingPlaced = 'bidding:placed',

  // Jeu
  CarteJouee = 'carteJouee',
  PliTermine = 'pliTermine',
  MancheTerminee = 'mancheTerminee',
  NouvelleManche = 'nouvelleManche',
  ScoreMisAJour = 'scoreMisAJour',
  FinDePartie = 'finDePartie',
}

// ========== Payloads ========== //

export interface JoinedPartiePayload {
  partieId: number;
  joueurId: number;
  equipeId: number;
  mancheId: number | null;
  at: string;
}

export interface CarteJoueePayload {
  joueurId: number;
  carteId: number;
  mancheId: number;
  pliNumero: number;
  ordre: number;
  at: string;
}

export interface PliTerminePayload {
  mancheId: number;
  pliId: number;
  pliNumero: number;
  winnerId: number;
  winnerTeam: 1 | 2;
  trickPoints: number;
  totals: { team1: number; team2: number };
  nextLeads: number;
  requiresEndOfHand: boolean;
  at: string;
}

export interface MancheTermineePayload {
  partieId: number;
  mancheId: number;
  recap: {
    scores: { team1: number; team2: number };
    bonus: {
      equipeId: number;
      type: 'belote' | 'capot' | 'dix_de_der';
      points: number;
    }[];
  };
  at: string;
}

export interface NouvelleManchePayload {
  partieId: number;
  nouvelleMancheId: number;
  at: string;
}

export interface ScoreMisAJourPayload {
  partieId: number;
  scores: {
    team1: number;
    team2: number;
  };
  scoreMax: number;
  at: string;
}

export interface FinDePartiePayload {
  partieId: number;
  winnerTeam: 1 | 2;
  finalScores: {
    team1: number;
    team2: number;
  };
  at: string;
}

export interface BiddingStatePayload {
  mancheId: number;
  joueurActuelId: number;
  tourActuel: 1 | 2;
  encheres: {
    joueurId: number;
    type: 'pass' | 'take_card' | 'choose_color';
    couleurAtoutId?: number;
    encherePoints?: number;
    createdAt: string;
  }[];
}

export interface BiddingPlacedPayload {
  mancheId: number;
  joueurId: number;
  type: 'pass' | 'take_card' | 'choose_color';
  couleurAtoutId?: number;
  encherePoints?: number;
  tour: 1 | 2;
  at: string;
}