# Belote – Frontend Vue 3 SPA + PWA

## Setup
- `cp .env.example .env.local` et ajuster les URLs / Auth0
- `pnpm i`
- `pnpm dev` → http://localhost:5173

## Conventions
- JWT envoyé sur REST via `Authorization: Bearer <token>`
- Socket.IO envoie le token via `handshake.auth.token` (et en fallback `?token=`)
- Routes protégées par guard Auth0
- PWA: App shell offline ; REST GET en SWR ; WS non mis en cache

## Mapping migration
- `lobby.js`  → `src/stores/lobby.ts` + `LobbyPage.vue`
- `game.js`   → `src/stores/game.ts` + `GamePage.vue`
- `stats*.js` → `src/stores/stats.ts` + `StatsPage.vue`
- Événements WS centralisés → `src/types/events.ts`
