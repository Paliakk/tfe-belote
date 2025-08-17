import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  roots: ['<rootDir>/src', '<rootDir>/test'], // <= dossier "test"
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],

  // Important: pointer ts-jest vers le tsconfig de test (ESM nodenext)
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        useESM: true
      }
    ]
  },

  // Si tu utilises des imports style "@/..." :
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^src/(.*)$': '<rootDir>/src/$1'
  },

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/main.ts',
    '!src/**/index.ts'
  ],
  coverageThreshold: {
    global: { branches: 60, functions: 70, lines: 70, statements: 70 }
  },

  // Ton setup de test (assure-toi que le fichier existe vraiment) :
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest.setup.ts'],

  // Pour que Jest accepte l’ESM en .ts
  extensionsToTreatAsEsm: ['.ts']
};

export default config;
