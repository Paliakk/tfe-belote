<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const returned = computed(()=> game.returnedCard)
const atoutId = computed(()=> game.atoutId)
</script>

<template>
  <div class="flex items-center justify-center gap-4">
    <!-- Carte retournée: visible UNIQUEMENT si enchères en cours -->
    <div v-if="returned" class="flex flex-col items-center">
      <Card :card="returned" />
      <div class="mt-1 px-2 py-0.5 rounded-full bg-white text-slate-800 text-xs font-semibold">
        carte retournée
      </div>
    </div>

    <!-- Tapis / Trick -->
    <Trick />
  </div>
</template>
