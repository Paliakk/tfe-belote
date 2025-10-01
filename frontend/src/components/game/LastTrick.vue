<!-- src/components/game/LastTrick.vue -->
<template>
  <section>
    <h3 class="text-white mb-1">Dernier pli</h3>
    <div class="min-h-[110px] flex items-center justify-center gap-2">
      <div v-for="pc in sorted" :key="pc.ordre"
           class="w-[70px] h-[100px] rounded-md bg-white grid place-items-center text-2xl shadow relative"
           :class="ringClass(pc.joueurId)">
        <div class="absolute text-sm font-semibold left-1.5 top-1 text-black/80">
          {{ pc.carte.valeur }}
        </div>
        <div :class="(pc.carte.couleurId===1||pc.carte.couleurId===2)?'text-red-600':'text-black'">
          {{ ({1:'♥',2:'♦',3:'♣',4:'♠'} as any)[pc.carte.couleurId] }}
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useGameStore } from "@/stores/game"
const game = useGameStore()
const sorted = computed(()=> game.lastTrick.slice().sort((a,b)=>a.ordre-b.ordre))
function teamOfSeat(seat:number){ return (seat%2===0)?1:2 }
function teamOfJoueur(jid:number){
  const seat = game.seats.find(s=>s.joueurId===jid)?.seat
  return seat==null?1:teamOfSeat(seat)
}
function ringClass(jid:number){
  return teamOfJoueur(jid)===1 ? "ring-4 ring-blue-500" : "ring-4 ring-amber-500"
}
</script>
