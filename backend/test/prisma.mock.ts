export type MockFn<T extends (...a: any[]) => any> = jest.Mock<ReturnType<T>, Parameters<T>>;

export function createMockPrisma() {
  return {
    enchere: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    manche: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    partie: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}
export type MockPrisma = ReturnType<typeof createMockPrisma>;
