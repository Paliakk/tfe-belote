<template>
  <!-- 4 sièges / positions relatives à moi -->
  <SeatCard
    :style="{ left: '50%', top: '7%' }"
    :player="seatOpp"
    :turn="isTurn(seatOpp?.joueurId)"
    :team="teamOfSeat(seatOpp?.seat)"
  />
  <SeatCard
    :style="{ left: '92%', top: '50%' }"
    :player="seatRight"
    :turn="isTurn(seatRight?.joueurId)"
    :team="teamOfSeat(seatRight?.seat)"
  />
  <SeatCard
    :style="{ left: '50%', top: '93%' }"
    :player="seatMe"
    :turn="isTurn(seatMe?.joueurId)"
    :team="teamOfSeat(seatMe?.seat)"
    me
  />
  <SeatCard
    :style="{ left: '8%', top: '50%' }"
    :player="seatLeft"
    :turn="isTurn(seatLeft?.joueurId)"
    :team="teamOfSeat(seatLeft?.seat)"
  />
</template>

<script setup lang="ts">
import { computed, defineComponent, type PropType } from "vue"
import { useGameStore } from "@/stores/game"
const game = useGameStore()

const mySeat = computed(()=> game.mySeatIdx)
const seatByIndex = (idx:number) => game.seats.find(s=>s.seat===idx) ?? null
const seatMe    = computed(()=> game.seats.find(s=>s.joueurId===game.joueurId) ?? null)
const seatRight = computed(()=> seatByIndex(((mySeat.value ?? 0) + 1) % 4))
const seatOpp   = computed(()=> seatByIndex(((mySeat.value ?? 0) + 2) % 4))
const seatLeft  = computed(()=> seatByIndex(((mySeat.value ?? 0) + 3) % 4))

function isTurn(jid?:number|null){ return !!jid && jid === game.currentTurnPlayerId }
function teamOfSeat(seat?:number|null){ if(seat==null) return 1; return seat%2===0?1:2 }

type SeatPlayer = { seat:number; joueurId:number; username:string } | null

const SeatCard = defineComponent({
  name: "SeatCard",
  props: {
    style:  { type: Object as PropType<Record<string, any>>, default: () => ({}) },
    player: { type: Object as PropType<SeatPlayer>, default: null },
    turn:   { type: Boolean, default: false },
    team:   { type: Number, default: 1 },
    me:     { type: Boolean, default: false },
  },
  setup(props){
    const initials = computed(()=>{
      const n = props.player?.username || (props.me ? 'Moi' : '—')
      const t = n.trim()
      if (!t) return '🙂'
      const parts = t.split(/\s+/)
      return (parts[0]?.[0]||'').toUpperCase() + (parts[1]?.[0]||'').toUpperCase()
    })
    const hasBelote = computed(()=>{
      const jid = props.player?.joueurId
      return jid ? game.beloteByPlayer.get(jid) : undefined
    })
    return { initials, hasBelote }
  },
  template: `
    <div
  class="absolute w-[200px] h-[120px] rounded-xl flex flex-col items-center justify-center"
  :style="style"
  :class="[ team===1?'ring-2 ring-blue-500':'ring-2 ring-amber-500', me ? 'outline outline-2 outline-white/40' : '' ]"
  style="backdrop-filter: blur(2px); background: rgba(0,0,0,.12);"
>
  <div class="flex items-center gap-2">
    <!-- avatar rond (initiales si pas d’image) -->
    <div class="w-9 h-9 rounded-full bg-white text-emerald-900 grid place-items-center font-bold shadow">
      {{ (player?.username || '??').substring(0,1).toUpperCase() }}
    </div>
    <div class="text-white font-semibold drop-shadow">
      {{ player?.username || (me ? 'Moi' : '—') }}
    </div>
    <span v-if="turn" class="ml-2 px-2 py-0.5 rounded-full bg-white text-emerald-900 text-xs font-bold">à lui</span>
  </div>
  <div v-if="hasBelote" class="mt-1 px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-900 text-xs font-semibold">
    🔔 Belote
  </div>
</div>
  `
})
</script>

<style scoped>
.seat {
  position: absolute;
  transform: translate(-50%, -50%);
  min-width: 200px;
  max-width: 240px;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.22);
  padding: 8px 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.seat.on-turn {
  box-shadow: 0 0 0 3px #34d399 inset, 0 8px 24px rgba(0, 0, 0, 0.35);
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.avatar {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-weight: 900;
  color: #052e2b;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25);
}
.name {
  font-weight: 700;
}
.turn-pill {
  margin-left: 6px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #fff;
  color: #064e3b;
  font-weight: 800;
}
.belote {
  margin-top: 2px;
  font-size: 12px;
  background: #fde68a;
  color: #4d3800;
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}
@media (max-width: 640px) {
  .seat {
    min-width: 170px;
  }
  .avatar {
    width: 38px;
    height: 38px;
    font-size: 14px;
  }
}
</style>
