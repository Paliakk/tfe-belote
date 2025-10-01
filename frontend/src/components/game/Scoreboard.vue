<!-- src/components/game/Scoreboard.vue -->
<template>
  <section class="w-full flex gap-3 justify-center">
    <div class="bg-white text-emerald-900 px-3 py-2 rounded-lg min-w-[150px] text-center ring-1 ring-blue-500">
      Équipe 1 : <strong>{{ s1 }}</strong>
    </div>
    <div class="bg-white text-emerald-900 px-3 py-2 rounded-lg min-w-[150px] text-center ring-1 ring-amber-500">
      Équipe 2 : <strong>{{ s2 }}</strong>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue"
import { useGameStore } from "@/stores/game"
const game = useGameStore()
const s1 = computed(()=> game.scoreLive.team1)
const s2 = computed(()=> game.scoreLive.team2)
</script>
