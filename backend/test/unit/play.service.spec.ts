// test/unit/play.service.spec.ts
import { PlayService } from 'src/play/play.service';
import { RulesService } from 'src/play/rules.service';
import { TrickService } from 'src/play/trick.service';

describe('PlayService (unit)', () => {
  let service: PlayService;

  // Mocks simples
  let prisma: any;
  let rules: jest.Mocked<RulesService>;
  let trick: jest.Mocked<TrickService>;

  beforeEach(() => {
    // ---- TrickService mock
    trick = {
      closeCurrentTrick: jest.fn(),
    } as any;

    // ---- RulesService mock
    rules = {
      // on laisse la logique “vraie” si tu veux, mais ici on retourne toujours valide
      isPlayable: jest.fn().mockReturnValue({ valid: true, playableIds: [] }),
      playableCards: jest.fn(),
      currentWinning: jest.fn(),
      beats: jest.fn(),
      strongestAtout: jest.fn(),
      isStrongerAtout: jest.fn(),
      teamOf: jest.fn(),
    } as any;

    // ---- Prisma mock (min nécessaire pour UC07)
    // On construit dynamiquement dans chaque test via helpers,
    // mais il faut l’enveloppe $transaction ici.
    prisma = {
      $transaction: async (cb: (tx: any) => Promise<any>) => {
        // Chaque test remplacera prisma.__tx par ses mocks de modèles
        return cb(prisma.__tx);
      },
    };

    service = new PlayService(prisma, rules, trick);
  });

  /**
   * Fabrique une manche cohérente pour UC07
   * - 4 sièges (1..4), joueurActuel = 1
   * - 1er pli existant (contenu paramétrable)
   */
  function makeManche({
    trickCards = [] as Array<{
      id: number;
      ordre: number;
      joueurId: number;
      carte: any;
    }>,
  } = {}) {
    return {
      id: 1,
      joueurActuelId: 1,
      couleurAtoutId: 4, // peu importe
      mains: [
        // cartes non jouées dans la main du joueur 1
        { joueurId: 1, carte: { id: 10, valeur: 'As', couleurId: 1 } },
        { joueurId: 1, carte: { id: 11, valeur: '10', couleurId: 2 } },
      ],
      partie: {
        equipes: [
          {
            joueurs: [
              { ordreSiege: 0, joueurId: 1 },
              { ordreSiege: 2, joueurId: 3 },
            ],
          },
          {
            joueurs: [
              { ordreSiege: 1, joueurId: 2 },
              { ordreSiege: 3, joueurId: 4 },
            ],
          },
        ],
      },
      plis: [
        {
          id: 500,
          numero: 1,
          cartes: trickCards, // injecté par le test (0..3 cartes avant le coup)
        },
      ],
    };
  }

  /**
   * Monte tous les mocks Prisma pour un scénario donné :
   * - manche.findUnique -> renvoie notre manche
   * - pliCarte/findUnique -> map id -> joueurId
   * - pli/create, pli/findUnique, pliCarte/create, main/updateMany, manche/update
   */
  function wirePrismaForScenario({
    manche,
    beforeCountInTrick,
    afterCountInTrick,
    pliCarteOwnerById = {} as Record<number, number>,
    nextPlayerExpected,
  }: {
    manche: any;
    beforeCountInTrick: number; // nb de cartes avant le coup
    afterCountInTrick: number; // nb de cartes après le coup
    pliCarteOwnerById?: Record<number, number>;
    nextPlayerExpected?: number | null;
  }) {
    const mancheModel = {
      findUnique: jest.fn().mockResolvedValue(manche),
      update: jest.fn().mockResolvedValue({}),
    };

    const pliModel = {
      // si le dernier pli est “plein” ou inexistant, le service peut créer un nouveau pli
      create: jest.fn().mockResolvedValue({
        id: 600,
        numero: (manche.plis?.length || 0) + 1,
        cartes: [],
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: manche.plis[0].id,
        numero: manche.plis[0].numero,
        // Après l’insertion, on contrôle combien de cartes le service doit “voir”
        cartes: Array.from({ length: afterCountInTrick }).map((_, i) => ({
          id: 700 + i,
          ordre: i,
        })),
      }),
    };

    const pliCarteModel = {
      // utilisé par PlayService.findPlayerIdByPliCarte()
      findUnique: jest.fn(({ where }: any) => {
        const owner = pliCarteOwnerById[where.id];
        return Promise.resolve(owner ? { joueurId: owner } : null);
      }),
      create: jest.fn().mockResolvedValue({ id: 999 }),
    };

    const mainModel = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    // assemble le “tx”
    prisma.__tx = {
      manche: mancheModel,
      pli: pliModel,
      pliCarte: pliCarteModel,
      main: mainModel,
      // simulate Prisma signature
      $transaction: prisma.$transaction,
    };

    return {
      mancheModel,
      pliModel,
      pliCarteModel,
      mainModel,
      expectNextPlayerWasSet: () => {
        if (nextPlayerExpected == null) {
          expect(mancheModel.update).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
              data: expect.objectContaining({
                joueurActuelId: expect.any(Number),
              }),
            }),
          );
        } else {
          // ✅ Prisma.update reçoit un seul objet { where, data }
          expect(mancheModel.update).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: manche.id },
              data: { joueurActuelId: nextPlayerExpected },
            }),
          );
        }
      },
    };
  }

  it('joue une carte dans un pli non complet et passe au joueur suivant', async () => {
    // Pli avant coup : 0 carte -> après : 1 carte (non complet)
    const m = makeManche({ trickCards: [] });
    const { expectNextPlayerWasSet } = wirePrismaForScenario({
      manche: m,
      beforeCountInTrick: 0,
      afterCountInTrick: 1,
      pliCarteOwnerById: {}, // aucun pc présent avant -> rien à résoudre
      nextPlayerExpected: 2, // seats 0..3 => après joueur 1 vient joueur 2
    });

    // isPlayable -> true
    rules.isPlayable.mockReturnValue({ valid: true, playableIds: [10, 11] });

    const res = await service.playCard(1, 1, 10);

    // le service doit retourner le flag “requiresEndOfTrick=false” et un nextPlayerId
    expect(res).toEqual(
      expect.objectContaining({
        message: 'Carte jouée.',
        cartesDansPli: 1,
        requiresEndOfTrick: false,
        nextPlayerId: 2,
      }),
    );
    expectNextPlayerWasSet();
    expect(trick.closeCurrentTrick).not.toHaveBeenCalled();
  });

  it('quand le pli devient complet (4 cartes), on déclenche la clôture via TrickService', async () => {
    // Pli avant coup : 3 cartes -> après : 4 cartes (complet)
    // On fournit des ids de pliCarte “existants” pour que findPlayerIdByPliCarte() puisse résoudre les joueurs
    const trickCards = [
      {
        id: 100,
        ordre: 0,
        joueurId: 4,
        carte: { id: 21, valeur: 'Roi', couleurId: 1 },
      },
      {
        id: 101,
        ordre: 1,
        joueurId: 2,
        carte: { id: 22, valeur: 'Dame', couleurId: 1 },
      },
      {
        id: 102,
        ordre: 2,
        joueurId: 3,
        carte: { id: 23, valeur: 'Valet', couleurId: 1 },
      },
    ];
    const m = makeManche({ trickCards });
    wirePrismaForScenario({
      manche: m,
      beforeCountInTrick: 3,
      afterCountInTrick: 4,
      // mapping pour findPlayerIdByPliCarte()
      pliCarteOwnerById: { 100: 4, 101: 2, 102: 3 },
      nextPlayerExpected: null, // pas de nextPlayerId côté UC07 (c’est UC11 qui prendra la main)
    });

    // isPlayable -> true
    rules.isPlayable.mockReturnValue({ valid: true, playableIds: [10, 11] });

    // le closeCurrentTrick renvoie un payload “réaliste”
    const uc11Payload = {
      message: 'Pli 1 clôturé.',
      pliId: 500,
      numero: 1,
      winnerId: 2,
      winnerTeam: 1 as 1 | 2,
      trickPoints: 10,
      totals: { team1: 10, team2: 0 },
      nextLeads: 2,
      createdNextTrick: true,
      requiresEndOfHand: false,
    };
    trick.closeCurrentTrick.mockResolvedValue(uc11Payload);

    const res = await service.playCard(1, 1, 10);

    // Quand le pli est complet, le service retourne le résultat de TrickService.closeCurrentTrick()
    expect(trick.closeCurrentTrick).toHaveBeenCalledWith(1);
    expect(res).toEqual(uc11Payload);
  });
});
