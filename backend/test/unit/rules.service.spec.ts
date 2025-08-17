import { RulesService } from "src/play/rules.service";

type C = { id: number; valeur: string; couleurId: number };
type TrickCard = { ordre: number; joueurId: number; carte: C };
type Seat = { seat: number; joueurId: number; team: 1 | 2 };

const S = (over?: Partial<Seat>): Seat => ({ seat: 0, joueurId: 1, team: 1, ...over });
const card = (id: number, valeur: string, couleurId: number): C => ({ id, valeur, couleurId });

describe('RulesService', () => {
  let rules: RulesService;

  beforeEach(() => {
    rules = new RulesService();
  });

  it('premier du pli : toutes les cartes de la main sont jouables', () => {
    const hand = [card(1, 'As', 1), card(2, '10', 2), card(3, 'Roi', 3)];
    const playable = rules.playableCards({
      hand,
      trickCards: [],
      atoutId: null,
      seats: [S()],
      currentPlayerId: 1,
    });
    expect(playable.sort()).toEqual([1, 2, 3]);
  });

  it('obligation de fournir la couleur demandée si on l’a', () => {
    const hand = [card(1, 'As', 1), card(2, '10', 2), card(3, 'Roi', 3)];
    const trick: TrickCard[] = [{ ordre: 0, joueurId: 99, carte: card(100, '7', 1) }]; // couleur demandée = 1
    const playable = rules.playableCards({
      hand, trickCards: trick, atoutId: 4, seats: [S({ joueurId: 1 })], currentPlayerId: 1,
    });
    expect(playable).toEqual([1]); // seulement la couleur 1
  });

  it('si on ne peut pas fournir, obligation de couper si on a atout et que le partenaire ne mène pas', () => {
    // atout = 4 ; demande = 1
    const hand = [card(10, 'Valet', 4), card(2, '10', 2)]; // a de l'atout
    const trick: TrickCard[] = [
      { ordre: 0, joueurId: 2, carte: card(100, '7', 1) }, // adversaire mène
    ];
    const seats: Seat[] = [S({ joueurId: 1, team: 1 }), S({ joueurId: 2, team: 2 })];
    const playable = rules.playableCards({
      hand, trickCards: trick, atoutId: 4, seats, currentPlayerId: 1,
    });
    expect(playable).toEqual([10]); // doit couper
  });

  it('si partenaire mène le pli, pas d’obligation de couper (défausse libre)', () => {
    const hand = [card(10, 'Valet', 4), card(2, '10', 2)];
    const trick: TrickCard[] = [
      { ordre: 0, joueurId: 2, carte: card(100, '7', 1) }, // partenaire (team identique) mène
    ];
    const seats: Seat[] = [S({ joueurId: 1, team: 1 }), S({ joueurId: 2, team: 1 })];
    const playable = rules.playableCards({
      hand, trickCards: trick, atoutId: 4, seats, currentPlayerId: 1,
    });
    expect(playable.sort((a, b) => a - b)).toEqual([2, 10]); // tout est libre
  });

  it('surcoupe obligatoire si un atout a déjà été posé et que l’adversaire mène, si possible', () => {
    // atout = 4
    const hand = [card(10, '9', 4), card(11, '8', 4)]; // 9 (fort), 8 (faible)
    const trick: TrickCard[] = [
      { ordre: 0, joueurId: 2, carte: card(200, 'Valet', 4) }, // adversaire a déjà coupé avec Valet (plus fort)
    ];
    const seats: Seat[] = [S({ joueurId: 1, team: 1 }), S({ joueurId: 2, team: 2 })];
    const playable = rules.playableCards({
      hand, trickCards: trick, atoutId: 4, seats, currentPlayerId: 1,
    });
    // Ici, on DOIT surcouper si on peut → aucun de nos atouts ne bat Valet (Valet est le plus fort à l’atout)
    // donc on peut jouer n’importe lequel de nos atouts (règle de secours dans l’implémentation).
    expect(playable.sort()).toEqual([10, 11]);
  });

  it('beats() : à l’atout Valet > 9 > As… et hors atout As > 10 > Roi…', () => {
    const atoutId = 4;
    const demande = 1;
    // à l’atout
    expect(rules.beats(card(1, 'Valet', 4), card(2, '9', 4), atoutId, demande)).toBe(true);
    expect(rules.beats(card(3, '9', 4), card(4, 'Valet', 4), atoutId, demande)).toBe(false);
    // hors atout (couleur demandée)
    expect(rules.beats(card(5, 'As', 1), card(6, '10', 1), atoutId, demande)).toBe(true);
    expect(rules.beats(card(7, '10', 1), card(8, 'As', 1), atoutId, demande)).toBe(false);
    // autre couleur ne bat pas la demandée (hors atout)
    expect(rules.beats(card(9, 'As', 2), card(10, '7', 1), atoutId, demande)).toBe(false);
  });

  it('isPlayable() reflète playableCards()', () => {
    const hand = [card(1, 'As', 1), card(2, '10', 2)];
    const trick: TrickCard[] = [{ ordre: 0, joueurId: 9, carte: card(100, '7', 1) }];
    const res = rules.isPlayable({
      cardId: 2, hand, trickCards: trick, atoutId: null, seats: [S({ joueurId: 1 })], currentPlayerId: 1
    });
    // obligation de fournir la 1 → 2 n’est pas jouable
    expect(res.valid).toBe(false);
    expect(res.playableIds).toEqual([1]);
  });
});
