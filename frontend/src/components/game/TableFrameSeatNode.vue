<template>
  <div class="seat-node" :style="style" :class="{ 'on-turn': turn }">
    <div class="circle" :class="teamClass">{{ initials }}</div>
    <div class="meta">
      <div class="name">
        {{ player?.username || (me?'Moi':'—') }}
        <span v-if="turn" class="pill">à lui</span>
      </div>
      <div v-if="hasBelote" class="belote">🔔 Belote</div>
      <div class="hand">
        <div class="mini" v-for="i in remaining" :key="i" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { useGameStore } from '@/stores/game'

type SeatPlayer = { seat:number; joueurId:number; username:string } | null

const props = defineProps({
  style:  { type: Object as PropType<Record<string, any>>, default: () => ({}) },
  player: { type: Object as PropType<SeatPlayer>, default: null },
  turn:   { type: Boolean, default: false },
  me:     { type: Boolean, default: false },
})

const game = useGameStore()
const teamClass = computed(()=> {
  const seat = props.player?.seat
  const team = seat==null ? 1 : (seat%2===0?1:2)
  return team===1 ? 'team1' : 'team2'
})
const initials = computed(()=>{
  const n = props.player?.username || (props.me?'Moi':'?')
  const p = n.split(/\s+/).filter(Boolean)
  return ((p[0]?.[0]||'')+(p[1]?.[0]||'')).toUpperCase() || '🙂'
})
const hasBelote = computed(()=>{
  const jid = props.player?.joueurId
  return jid ? game.beloteByPlayer.get(jid) : undefined
})
const remaining = computed(()=>{
  const jid = props.player?.joueurId
  return jid ? (game.remainingByPlayer[jid] ?? 8) : 8
})
</script>

<style scoped>
.seat-node{
  position:absolute; transform: translate(-50%,-50%);
  display:flex; gap:10px; align-items:center;
  background: rgba(0,0,0,.18);
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.20);
  padding: 6px 10px;
  color:#fff;
  box-shadow: 0 10px 30px rgba(0,0,0,.25);
}
.seat-node.on-turn{ box-shadow: 0 0 0 3px #34d399 inset, 0 16px 40px rgba(0,0,0,.35); }

.circle{
  width:54px; height:54px; border-radius:999px; display:grid; place-items:center;
  font-weight:800; color:#0b1f17;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.35);
}
.team1{ background: #93c5fd; } /* bleu clair */
.team2{ background: #fcd34d; } /* ambre clair */

.meta{ display:flex; flex-direction:column; gap:3px; }
.name{ font-weight:700; }
.pill{
  margin-left:6px; font-size:11px; padding:2px 6px; border-radius:999px;
  background:#fff; color:#064e3b; font-weight:800;
}
.belote{
  font-size:12px; background:#fde68a; color:#4d3800;
  display:inline-block; padding: 1px 6px; border-radius: 8px; font-weight:600;
}
.hand{ display:flex; gap:3px; flex-wrap:wrap; max-width:200px; }
.mini{ width:10px; height:14px; border-radius:2px; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.45); }
</style>
