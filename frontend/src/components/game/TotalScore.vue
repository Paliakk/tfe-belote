<!-- src/components/game/TotalScore.vue -->
<template>
  <section class="w-full flex gap-3 justify-center">
    <div class="bg-white text-emerald-900 px-3 py-2 rounded-lg min-w-[150px] text-center ring-1 ring-blue-500">
      Total Équipe 1 : <strong>{{ t1 }}</strong>
    </div>
    <div class="bg-white text-emerald-900 px-3 py-2 rounded-lg min-w-[150px] text-center ring-1 ring-amber-500">
      Total Équipe 2 : <strong>{{ t2 }}</strong>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue"
import { useGameStore } from "@/stores/game"
const game = useGameStore()
const t1 = computed(()=> game.totals.team1)
const t2 = computed(()=> game.totals.team2)
</script>
