<template>
  <!-- 4 emplacements de cartes -->
  <SlotCard pos="n" :card="cardAt(2)" />
  <SlotCard pos="e" :card="cardAt(1)" />
  <SlotCard pos="s" :card="cardAt(0)" />
  <SlotCard pos="w" :card="cardAt(3)" />
</template>

<script setup lang="ts">
import { computed, defineComponent, type PropType } from "vue"
import { useGameStore } from "@/stores/game"

const game = useGameStore()

function relSlotOf(jid:number) {
  const me = game.mySeatIdx ?? 0
  const him = game.seats.find(s=>s.joueurId===jid)?.seat
  if (him==null) return 'n'
  const d = (him - me + 4) % 4
  return ['s','e','n','w'][d] as 's'|'e'|'n'|'w'
}

const sorted = computed(()=> game.trick.slice().sort((a,b)=>a.ordre-b.ordre))
function cardAt(whichFromMe:number){
  const slot = ['s','e','n','w'][whichFromMe]
  const pc = sorted.value.find(pc => relSlotOf(pc.joueurId) === slot)
  return pc?.carte ?? null
}

const SlotCard = defineComponent({
  name: "SlotCard",
  props: {
    pos:  { type: String, required: true },
    card: { type: Object as PropType<{ id:number; valeur:string; couleurId:number } | null>, default: null },
  },
  computed: {
    styleMap(): Record<string, any> {
      return {
        n: { left:'50%', top:'28%' },
        e: { left:'76%', top:'50%' },
        s: { left:'50%', top:'78%' },
        w: { left:'24%', top:'50%' },
      }
    },
    suitClass(): string {
      const id = this.card?.couleurId
      return (id===1||id===2) ? 'text-red-600' : 'text-black'
    },
    suitChar(): string {
      const id = this.card!.couleurId
      return ({1:'♥',2:'♦',3:'♣',4:'♠'} as any)[id] ?? '?'
    }
  },
  template: `
    <div class="absolute -translate-x-1/2 -translate-y-1/2" :style="styleMap[pos]">
      <div v-if="card" class="w-[70px] h-[100px] rounded-md bg-white grid place-items-center text-2xl shadow relative">
        <div class="absolute text-sm font-semibold left-1.5 top-1 text-black/80">
          {{ card?.valeur }}
        </div>
        <div :class="suitClass">{{ suitChar }}</div>
      </div>
    </div>
  `
})
</script>
