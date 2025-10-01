<template>
  <div ref="wrap" class="relative w-full" :style="{ aspectRatio }">
    <!-- rectangle -->
    <div class="abs-center rounded-xl border border-white/30" :style="rectStyle"></div>

    <!-- joueurs -->
    <SeatNode :style="posTop" :player="seatOpp" :turn="isTurn(seatOpp?.joueurId)" />
    <SeatNode :style="posRight" :player="seatRight" :turn="isTurn(seatRight?.joueurId)" />
    <SeatNode :style="posBottom" :player="seatMe" :turn="isTurn(seatMe?.joueurId)" me />
    <SeatNode :style="posLeft" :player="seatLeft" :turn="isTurn(seatLeft?.joueurId)" />

    <!-- slotted center (trick/returned) -->
    <div class="absolute inset-0">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import { useGameStore } from '@/stores/game'
import SeatNode from './TableFrameSeatNode.vue'

const aspectRatio = '1000 / 600'

const game = useGameStore()
const mySeat = computed(() => game.mySeatIdx)
const seatByIndex = (i:number) => game.seats.find(s => s.seat === i) ?? null
const seatMe    = computed(() => game.seats.find(s => s.joueurId === game.joueurId) ?? null)
const seatRight = computed(() => seatByIndex(((mySeat.value ?? 0) + 1) % 4))
const seatOpp   = computed(() => seatByIndex(((mySeat.value ?? 0) + 2) % 4))
const seatLeft  = computed(() => seatByIndex(((mySeat.value ?? 0) + 3) % 4))
const isTurn = (jid?: number|null) => !!jid && jid === game.currentTurnPlayerId

// ✅ type the style objects as CSSProperties
const rectStyle: CSSProperties = {
  position: 'absolute',
  left: '12%',
  top: '16%',
  width: '76%',
  height: '60%',
  boxShadow: 'inset 0 0 0 6px rgba(13,85,51,.6)',
}

const posTop: CSSProperties    = { left:'50%', top:'10%',  position:'absolute', transform:'translate(-50%,-50%)' }
const posRight: CSSProperties  = { left:'90%', top:'50%',  position:'absolute', transform:'translate(-50%,-50%)' }
const posBottom: CSSProperties = { left:'50%', top:'90%',  position:'absolute', transform:'translate(-50%,-50%)' }
const posLeft: CSSProperties   = { left:'10%', top:'50%',  position:'absolute', transform:'translate(-50%,-50%)' }
</script>

<style scoped>
.abs-center {
  position: absolute;
  transform: translate(-50%, -50%);
  left: 50%;
  top: 50%;
}
/* util: position à partir d’un style inline left/top */
</style>
