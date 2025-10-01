<template>
  <main class="min-h-dvh flex flex-col items-center justify-center p-6 text-slate-100 bg-slate-950">
    <!-- Logo / visuel -->
    <div class="w-24 h-24 rounded-2xl border border-slate-800 grid place-items-center mb-8 bg-slate-900">
      <span class="text-xs opacity-60">Logo</span>
    </div>

    <!-- Titre -->
    <h1 class="text-3xl sm:text-4xl font-semibold text-center leading-tight tracking-tight">
      Belote en ligne –<br class="sm:hidden" /> Jeu Multijoueur
    </h1>

    <!-- Sous-texte -->
    <p class="mt-4 text-center text-slate-300 max-w-prose">
      Connectez-vous pour accéder au lobby.
    </p>

    <!-- CTA principal -->
    <div class="mt-8 w-full max-w-xs">
      <button
        class="w-full h-11 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 transition
               font-medium"
        @click="loginToLobby"
      >
        Se connecter
      </button>
    </div>

    <!-- Boutons secondaires -->
    <div class="mt-5 grid grid-cols-2 gap-3 w-full max-w-xs">
      <button
        class="h-11 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-800
               active:bg-slate-900 transition"
        @click="$router.push({ path: '/rules' })"
      >
        Règles
      </button>
      <button
        class="h-11 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-800
               active:bg-slate-900 transition"
        @click="$router.push({ path: '/about' })"
      >
        À propos
      </button>
    </div>

    <!-- Footer -->
    <footer class="mt-10 w-full max-w-xl border-t border-slate-800 pt-4 text-center text-slate-400 text-sm">
      <div>Projet TFE – EPHEC 2025 — Igor Mioduszewski</div>
      <div class="opacity-80 mt-1">Tous droits réservés</div>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { useSessionStore } from '@/stores/session'
const session = useSessionStore()

async function loginToLobby() {
  await session.login('/lobby') // Auth0 → callback → redirection vers /lobby
}
</script>
