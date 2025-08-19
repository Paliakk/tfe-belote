export enum LobbyEvent {
  MemberJoined = 'memberJoined',
  MemberLeft = 'memberLeft',
  LobbyUpdated = 'lobbyUpdated',
  PartieStarted = 'partieStarted',
}

export interface LobbyMember {
  id: number;
  username: string;
}

export interface LobbySnapshot {
  id: number;
  nom: string;
  estPrive: boolean;
  statut: string; // en_attente / en_cours / ferme
  nbMembres: number;
  createur: LobbyMember;
  membres: LobbyMember[];
}

export interface PartieStartedPayload {
  lobbyId: number;
  partieId: number;
  mancheId: number;
}
