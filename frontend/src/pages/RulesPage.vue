<template>
  <main class="min-h-dvh p-6 text-slate-100 bg-slate-950">
    <div class="max-w-3xl mx-auto">
      <header class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-semibold">Règles</h1>
        <button class="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700"
                @click="$router.back()">Retour</button>
      </header>
      <p class="text-slate-300">
        Cette page décrira les règles de la Belote pour ton TFE (atout, enchères, belote/rebelote, etc.).
      </p>
    </div>
  </main>
</template>
