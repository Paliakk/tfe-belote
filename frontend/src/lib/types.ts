// frontend/src/lib/types.ts

// --- Modèles de base ---
export type Joueur = { id: number; username: string };

export type Lobby = {
  id: number;
  nom: string;
  statut: 'en_attente' | 'en_cours' | string;
  estPrive?: boolean;
  createdAt?: string;
  createur?: { id: number; username: string } | null;
  nbMembres?: number;
  membres?: Joueur[];
  partie?: { id: number; statut: string; scoreMax: number; nombreJoueurs: number } | null;
};

// --- DTO Lobbies (miroir backend) ---
export type CreateLobbyDto = {
  nom: string;
  password?: string;
};

export type JoinLobbyDto = {
  lobbyId: number; // OUI, le backend le veut dans le body aussi
  joueurId: number;
  password?: string;
};

export type StartGameDto = {
  joueurId: number;   // temporaire (Auth0 plus tard)
  scoreMax?: number;  // optionnel, défaut 301 côté back
};

export type ActiveManche = { id: number; numero: number };

// --- État d’enchères retourné par le backend ---
export type BiddingState = {
  mancheId: number;
  tourActuel: 1 | 2;
  joueurActuelId: number;
  preneurId: number | null;
  atout: { id: number; nom?: string } | null;
  carteRetournee: { id: number; valeur: string; couleurId: number } | null;
  historique: {
    joueur: Joueur;
    type: 'pass' | 'take_card' | 'choose_color';
    couleurAtoutId?: number | null;
    at: string;
  }[];
};

// --- Enchères (miroir create-bid.dto.ts) ---
export type BidType = 'pass' | 'take_card' | 'choose_color';

export type BidPayload =
  | { joueurId: number; type: 'pass' }
  | { joueurId: number; type: 'take_card' } // tour 1 : prise de la carte retournée
  | { joueurId: number; type: 'choose_color'; couleurAtoutId: number };

// (pratique pour l’UI si tu choisis d’utiliser un enum)
export enum CouleurId {
  PIQUE = 1,
  COEUR = 2,
  CARREAU = 3,
  TREFLE = 4,
}

export type LobbyMembersDto = {
  lobbyId: number;
  nbMembres: number;
  membres: Joueur[];
};
