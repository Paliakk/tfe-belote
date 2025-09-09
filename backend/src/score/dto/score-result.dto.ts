export type BonusTypeDto = 'dix_de_der' | 'belote' | 'capot';

export type BonusDetail = { type: BonusTypeDto; points: number };

export type TeamScore = {
  equipeId: number;
  pointsBase: number; // somme cartes hors bonus (corrigée chute si besoin)
  bonus: number; // somme bonus attribués
  total: number; // pointsBase + bonus
  capot: boolean;
  detailsBonus: BonusDetail[];
};

export type ScoreResultDto = {
  mancheId: number;
  preneurId: number | null;
  preneurEquipeId: number | null;
  scores: [TeamScore, TeamScore]; // ordre par Equipe.numero: 1 puis 2
  contratReussi: boolean | null; // null si pas de preneur/atout (cas anormal)
  bonusAppliques: BonusTypeDto[];
  scoreMancheIds: number[]; // 2 ids
};
