<!-- src/components/game/TurnTimer.vue -->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from "vue"
import { storeToRefs } from "pinia"
import { useGameStore } from "@/stores/game"

const game = useGameStore()
const { deadlineTs, currentTurnPlayerId, joueurId, isPlayingPhase } = storeToRefs(game)

const now = ref(Date.now())
let timer: number | null = null

const TOTAL_MS = (window as any).TURN_TIMEOUT_MS ?? 20000

const remainingMs = computed(() => {
  const dl = deadlineTs.value
  if (!dl || !Number.isFinite(dl)) return 0
  return Math.max(0, dl - now.value)
})

const percent = computed(() => {
  const pct = (remainingMs.value / TOTAL_MS) * 100
  return Math.max(0, Math.min(100, pct))
})

const secs = computed(() => Math.ceil(remainingMs.value / 1000))

// small hint: who’s turn
const isMyTurn = computed(() =>
  !!joueurId.value && currentTurnPlayerId.value === joueurId.value
)

onMounted(() => {
  // tick ~5fps — cheap and smooth enough
  timer = window.setInterval(() => { now.value = Date.now() }, 200)
})

onBeforeUnmount(() => {
  if (timer) { clearInterval(timer); timer = null }
})
</script>

<template>
  <!-- Hide entirely if no timer set -->
  <div
    v-if="deadlineTs && remainingMs > 0"
    class="fixed right-4 bottom-4 z-50 min-w-[220px] pointer-events-none"
  >
    <div class="bg-white/95 text-emerald-900 rounded-xl shadow-2xl p-3">
      <div class="text-xs font-semibold mb-1">
        {{ isPlayingPhase ? 'Tour de jeu' : 'Tour d’enchères' }}
        <span class="ml-2 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
          {{ isMyTurn ? 'À VOUS' : 'Adversaire' }}
        </span>
      </div>

      <div class="h-2 bg-gray-200 rounded overflow-hidden">
        <div
          class="h-full bg-blue-500 transition-[width] duration-150"
          :style="{ width: percent + '%' }"
        />
      </div>

      <div class="text-right text-xs mt-1 font-mono">
        {{ secs }}s
      </div>
    </div>
  </div>
</template>
