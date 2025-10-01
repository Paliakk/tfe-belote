export enum GameEvent {
    LobbyJoined = 'lobby:joined',
    LobbyState = 'lobby:state',
    LobbyUpdate = 'lobby:update',
    LobbyClosed = 'lobby:closed',
    LobbyGameStarted = 'lobby:gameStarted',
    PartieStarted = 'partie:started',
    JoinedPartie = 'joinedPartie',
    GameOver = 'game:over',
    BiddingState = 'bidding:state',
    BiddingPlaced = 'bidding:placed',
    BiddingEnded = 'bidding:ended',
    BeloteDeclared = 'belote:declared',
    BeloteRebelote = 'belote:rebelote',
    BeloteReset = 'belote:reset',
    HandState = 'hand:state',
    PlayPlayable = 'play:playable',
    TurnState = 'turn:state',
    TrickState = 'trick:state',
    TrickClosed = 'trick:closed',
    MancheEnded = 'manche:ended',
    ScoreLive = 'score:live',
    DonneRelancee = 'donne:relancee'
}

export interface JoinedPartiePayload { partieId: number; joueurId: number; mancheId: number; at: string }
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
        createdAt: string;
    }[];
}
export interface BiddingPlacedPayload { mancheId: number; joueurId: number; type: 'pass' | 'take_card' | 'choose_color'; couleurAtoutId?: number; encherePoints?: number; tour: 1 | 2; at: string }
export interface BiddingEndedPayload { mancheId: number; preneurId: number; atoutId: number | null }
export interface HandStatePayload { mancheId: number; cartes: { id: number; valeur: string; couleurId: number }[] }
export interface PlayPlayablePayload { carteIds: number[] }
export interface TurnStatePayload { mancheId: number; joueurActuelId: number | null; seats?: { seat: number; joueurId: number; username: string }[] }
export interface TrickStatePayload { mancheId: number; numero: number; cartes: { ordre: number; joueurId: number; carte: { id: number; valeur: string; couleurId: number } }[] }
export interface TrickClosedPayload { cartes: { ordre: number; joueurId: number; carte: { id: number; valeur: string; couleurId: number } }[]; gagnantId?: number | null; numero?: number }
export interface ScoreLivePayload { mancheId: number; team1: number; team2: number }
export interface DonneRelanceePayload { oldMancheId?: number; newMancheId: number; numero?: number }
export interface GameOverPayload { partieId: number; winnerTeamNumero?: 1 | 2; totals?: { team1: number; team2: number }; lobbyId?: number | null }
export interface LobbyJoinedPayload { lobbyId: number }
export interface LobbyStatePayload { lobbyId: number; lobbyName?: string; membres: { id: number; username: string }[] }
export interface LobbyUpdatePayload { lobbyId: number; type: 'join' | 'leave'; joueur: string }
export interface LobbyGameStartedPayload { lobbyId?: number; partieId: number }