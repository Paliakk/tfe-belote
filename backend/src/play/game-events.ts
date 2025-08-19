export enum GameEvent {
  CarteJouee = 'carteJouee',
  PliTermine = 'pliTermine',
  MancheTerminee = 'mancheTerminee',
  ScoreMisAJour = 'scoreMisAJour',
  NouvelleManche = 'nouvelleManche',
  FinDePartie = 'finDePartie',
  EncherePlacee = 'encherePlacee',
  TourSuivant = 'tourSuivant',
  LobbyCommence = 'lobby:partieCommencee',
  RetourLobby = 'partieQuittee',
  PartieCommencee = "PartieCommencee",
}

export interface CarteDto {
  id: number;
  couleurId: number;
  valeur: string;
}

export interface CarteJoueePayload {
  mancheId: number;
  pliNumero: number;
  joueurId: number;
  carte: CarteDto;
  cartesDansPli: number;
  nextPlayerId?: number;
  appliedBonuses: string[];
}

export interface JouerCarteDto {
  carteId: number;
  mancheId: number;
}

export interface PingMancheStateDto {
  mancheId: number;
}

export interface EncherePlaceePayload {
  mancheId: number;
  joueurId: number;
  type: 'pass' | 'take_card' | 'choose_color';
  couleurAtoutId?: number;
  tour: number;
}

export interface TourSuivantPayload {
  mancheId: number;
  joueurId: number;
  tour: number;
}

export interface PartieCommenceePayload {
  partieId: number;
  mancheId: number;
  at: string;
}

export interface RetourLobbyPayload {
  partieId: number;
  message?: string;
}

export interface JoueurExpulsePayload {
  lobbyId: number;
  joueurId: number;
  raison?: string;
}

export interface MancheTermineePayload {
  partieId: number;
  mancheId: number;
  recap: any | null; // Tu pourras le typer plus tard
  at: string;
}

export interface ScoreMisAJourPayload {
  partieId: number;
  scores: { team1: number; team2: number };
  scoreMax: number;
  at: string;
}

export interface NouvelleManchePayload {
  partieId: number;
  nouvelleMancheId: number;
  at: string;
}

export interface FinDePartiePayload {
  partieId: number;
  winnerTeam: 1 | 2;
  finalScores: { team1: number; team2: number };
  at: string;
}
export interface PliTerminePayload {
  mancheId: number;
  pliId: number;
  pliNumero: number;
  numero: number; // alias pour compat
  winnerId: number;
  winnerTeam: 1 | 2;
  trickPoints: number;
  totals: { team1: number; team2: number };
  nextLeads: number;
  requiresEndOfHand: boolean;
  at: string;
}