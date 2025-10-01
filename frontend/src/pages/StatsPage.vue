<template>
  <div class="modal-backdrop grid place-items-center p-6">
    <div class="card p-6 max-w-3xl w-full">
      <header class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Statistiques joueur</h2>
        <button class="px-3 py-1 rounded bg-slate-800" @click="$router.back()">Fermer</button>
      </header>

      <div v-if="store.loading">Chargement…</div>
      <div v-else-if="store.error" class="text-red-400">Erreur: {{ store.error }}</div>
      <div v-else-if="store.data" class="grid grid-cols-2 gap-4">
        <div class="card p-4">Total parties: {{ store.data.totalParties ?? '—' }}</div>
        <div class="card p-4">Winrate: {{ store.data.winrate ?? '—' }}%</div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useStatsStore } from '@/stores/stats'

const store = useStatsStore()
const route = useRoute()

onMounted(() => {
  const id = Number(route.params.joueurId || 0)
  if (id) store.load(id)
})
</script>