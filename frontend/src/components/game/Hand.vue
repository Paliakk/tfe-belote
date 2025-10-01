<!-- src/components/game/Hand.vue -->
<template>
  <div class="flex flex-wrap gap-2 justify-center">
    <div v-for="c in game.myHand" :key="c.id"
         class="w-[70px] h-[100px] rounded-md bg-white shadow hover:scale-105 transition"
         :class="isPlayable(c) ? 'cursor-pointer' : 'opacity-50 grayscale pointer-events-none'"
         @click="play(c)">
      <div class="absolute text-sm font-semibold left-1.5 top-1 text-black/80">
        {{ shortRank(c.valeur) }}
      </div>
      <div class="h-full grid place-items-center text-2xl" :class="suitClass(c.couleurId)">
        {{ suitSymbol(c.couleurId) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGameStore } from "@/stores/game"
import { getGameSocket } from "@/services/game.socket"
import { playCard } from '@/services/game.socket'
const game = useGameStore()

function isPlayable(c:{id:number}) {
  return game.isPlayingPhase && game.isMyTurn && game.playableIds.has(c.id)
}
function play(c:{id:number}) {
  if (!isPlayable(c)) return
  const s = getGameSocket()
  if (!s || !game.mancheId) return
  s.emit("play:card", { mancheId: game.mancheId, carteId: c.id })
}
function shortRank(v:string){ return ({Valet:"J", Dame:"Q", Roi:"K"} as any)[v] || v }
function suitSymbol(id:number){ return ({1:"♥",2:"♦",3:"♣",4:"♠"} as any)[id] ?? "?" }
function suitClass(id:number){ return (id===1||id===2) ? "text-red-600" : "text-black" }
const canPlay = (id:number) => game.isPlayingPhase && game.isMyTurn && game.playableIds.has(id)

function onPlay(id:number) {
  if (!canPlay(id)) return
  playCard(id)
}
</script>
