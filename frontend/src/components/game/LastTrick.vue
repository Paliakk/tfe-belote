<template>
  <section>
    <h3 class="text-white mb-1">Dernier pli</h3>
    <div class="min-h-[110px] flex flex-row items-center justify-center gap-2">
      <div
        v-for="pc in sorted"
        :key="pc.ordre"
        class="inline-flex rounded-xl p-0.5"
        :class="ringClass(pc.joueurId)"
      >
        <Card :card="pc.carte" mini />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useGameStore } from "@/stores/game"
import Card from "@/components/game/Card.vue"

const game = useGameStore()

const sorted = computed(() =>
  game.lastTrick.slice().sort((a,b)=>a.ordre - b.ordre)
)

function teamOfSeat(seat:number){ return (seat % 2 === 0) ? 1 : 2 }
function teamOfJoueur(jid:number){
  const seat = game.seats.find(s=>s.joueurId===jid)?.seat
  return seat == null ? 1 : teamOfSeat(seat)
}
function ringClass(jid:number){
  return teamOfJoueur(jid) === 1 ? "ring-team1" : "ring-team2"
}
</script>

<style scoped>
.ring-wrap{
  display: inline-block;
  border-radius: 12px;
  box-shadow: 0 0 0 4px transparent inset;
}
.ring-team1{ box-shadow: 0 0 0 4px #2563eb inset, 0 2px 6px rgba(0,0,0,.35); }
.ring-team2{ box-shadow: 0 0 0 4px #f59e0b inset, 0 2px 6px rgba(0,0,0,.35); }
</style>
