<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const now = ref(Date.now())
let t: number | null = null
onMounted(() => { t = window.setInterval(() => now.value = Date.now(), 200) })
onBeforeUnmount(() => { if (t) clearInterval(t) })

const isMyTurnNow = computed(() =>
  (game.biddingOpen && game.isMyBiddingTurn) ||   // enchères
  (game.isPlayingPhase && game.isMyTurn)          // jeu
)

const phaseLabel = computed(() => game.biddingOpen ? 'enchères' : 'jeu')

// petit timer restant si dispo (backend émet 'turn:deadline')
const remaining = computed(() => {
  if (!game.deadlineTs) return null
  const ms = Math.max(0, game.deadlineTs - now.value)
  return Math.ceil(ms / 1000)
})
</script>

<template>
  <div v-if="isMyTurnNow"
       class="fixed left-1/2 -translate-x-1/2 bottom-6 z-[999] px-3 py-2 rounded-xl bg-black/80 text-white text-sm shadow-lg flex items-center gap-2">
    <span>🟢 À ton tour ({{ phaseLabel }})</span>
    <span v-if="remaining !== null" class="px-2 py-0.5 rounded-md bg-white/15">{{ remaining }}s</span>
  </div>
</template>
