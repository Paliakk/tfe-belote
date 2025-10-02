<template>
  <div class="relative w-full h-full">
    <SeatNode :style="{ left:'50%', top:'8%'  }" :player="seatOpp"   :turn="isTurn(seatOpp?.joueurId)" />
    <SeatNode :style="{ left:'92%', top:'50%' }" :player="seatRight" :turn="isTurn(seatRight?.joueurId)" />
    <SeatNode :style="{ left:'50%', top:'92%' }" :player="seatMe"    :turn="isTurn(seatMe?.joueurId)" me />
    <SeatNode :style="{ left:'8%',  top:'50%' }" :player="seatLeft"  :turn="isTurn(seatLeft?.joueurId)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import SeatNode from './TableFrameSeatNode.vue'

const game = useGameStore()
const mySeat = computed(()=> game.mySeatIdx ?? 0)
const seatByIndex = (i:number) => game.seats.find(s=>s.seat===i) ?? null

const seatMe    = computed(()=> game.seats.find(s=>s.joueurId===game.joueurId) ?? null)
const seatLeft  = computed(()=> seatByIndex((mySeat.value + 1) % 4))
const seatOpp   = computed(()=> seatByIndex((mySeat.value + 2) % 4))
const seatRight = computed(()=> seatByIndex((mySeat.value + 3) % 4))

const isTurn = (jid?:number|null)=> !!jid && jid === game.currentTurnPlayerId
</script>
