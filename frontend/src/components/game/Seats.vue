<template>
  <!-- Chaque siège autour de la table -->
  <SeatCard :style="{ left:'50%', top:'5%'   }" :player="seatOpp"   :turn="isTurn(seatOpp?.joueurId)"   :team="teamOfSeat(seatOpp?.seat)" />
  <SeatCard :style="{ left:'88%', top:'50%'  }" :player="seatRight" :turn="isTurn(seatRight?.joueurId)" :team="teamOfSeat(seatRight?.seat)" />
  <SeatCard :style="{ left:'50%', top:'95%'  }" :player="seatMe"    :turn="isTurn(seatMe?.joueurId)"    :team="teamOfSeat(seatMe?.seat)" me />
  <SeatCard :style="{ left:'12%', top:'50%'  }" :player="seatLeft"  :turn="isTurn(seatLeft?.joueurId)"  :team="teamOfSeat(seatLeft?.seat)" />
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
  setup(props) {
    const game = useGameStore()
    const hasBelote = computed(() => {
      const jid = props.player?.joueurId
      return jid ? game.beloteByPlayer.get(jid) : undefined
    })
    return { hasBelote }
  },
  template: `
    <div class="absolute w-[200px] h-[120px] rounded-xl flex flex-col items-center justify-center"
         :style="style"
         :class="[ team===1?'ring-2 ring-blue-500':'ring-2 ring-amber-500', me ? 'outline outline-2 outline-white/40' : '' ]">
      <div class="text-white font-semibold">
        {{ player?.username || (me ? 'Moi' : '—') }}
        <span v-if="turn" class="ml-2 px-2 py-0.5 rounded-full bg-white text-emerald-900 text-xs font-bold">à lui</span>
      </div>
      <div v-if="hasBelote" class="mt-1 px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-900 text-xs font-semibold">
        🔔 Belote
      </div>
    </div>
  `
})
</script>
