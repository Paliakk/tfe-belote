<template>
  <div v-if="card" class="flex flex-col items-center gap-1">
    <div class="w-[70px] h-[100px] bg-white rounded-lg grid place-items-center shadow">
      <div class="text-2xl" :class="cls(card.couleurId)">{{ sym(card.couleurId) }}</div>
    </div>
    <div class="text-xs px-2 py-0.5 rounded-full bg-white/80 text-slate-700">carte retournée</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useGameStore } from "@/stores/game"

const game = useGameStore()

// visible uniquement si on est EN PHASE D'ENCHÈRES (pas de preneur)
const card = computed(() => (!game.isPlayingPhase ? game.returnedCard : null))

const sym = (id:number) => ({1:'♥',2:'♦',3:'♣',4:'♠'} as any)[id] ?? '?'
const cls = (id:number) => (id===1||id===2 ? 'text-rose-600' : 'text-slate-900')
</script>
