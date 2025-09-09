// backend/test/setup/jest.setup.ts
import 'reflect-metadata';

// ✅ Mock léger d'AuthGuard pour nos tests
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockAuthGuard {
      canActivate() {
        return true;
      }
    },
}));

// ✅ Ne tente de mocker @nestjs/throttler que s'il est installé
try {
  // Si le module est présent, on le mocke pour neutraliser le throttling en test
  require.resolve('@nestjs/throttler');
  jest.mock('@nestjs/throttler', () => ({
    ThrottlerGuard: class {
      canActivate() {
        return true;
      }
    },
  }));
} catch {
  // Module non installé → on ne fait rien
}
