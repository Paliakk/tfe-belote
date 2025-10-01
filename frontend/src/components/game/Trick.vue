<template>
  <div class="absolute inset-0 pointer-events-none">
    <div
      v-for="slot in slots"
      :key="slot"
      class="absolute -translate-x-1/2 -translate-y-1/2"
      :style="slotStyle[slot]"
    >
      <div v-if="cardBySlot[slot]" class="pointer-events-none">
        <div :class="['inline-flex rounded-xl p-0.5', ringClass(cardBySlot[slot]!.joueurId)]">
          <Card :card="cardBySlot[slot]!.carte" mini />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useGameStore } from "@/stores/game"
import Card from "@/components/game/Card.vue"

type Carte = { id:number; valeur:string; couleurId:number }
type PlayedCard = { ordre:number; joueurId:number; carte:Carte }

// --- clé de slots tapée ---
const slots = ['n','e','s','w'] as const
type Slot = typeof slots[number]

const game = useGameStore()

function relSlotOf(jid:number): Slot {
  const me = game.mySeatIdx ?? 0
  const him = game.seats.find(s => s.joueurId === jid)?.seat
  if (him == null) return 'n'
  const d = (him - me + 4) % 4
  return (['s','e','n','w'][d] as Slot)
}

const sorted = computed<PlayedCard[]>(() =>
  game.trick.slice().sort((a,b)=>a.ordre - b.ordre)
)

const cardBySlot = computed<Record<Slot, PlayedCard | null>>(() => {
  const map = { s:null, e:null, n:null, w:null } as Record<Slot, PlayedCard|null>
  for (const pc of sorted.value) map[relSlotOf(pc.joueurId)] = pc
  return map
})

const slotStyle: Record<Slot, Record<string,string>> = {
  n: { left:'50%', top:'26%' },
  e: { left:'76%', top:'50%' },
  s: { left:'50%', top:'78%' },
  w: { left:'24%', top:'50%' },
}

// anneau par équipe
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
