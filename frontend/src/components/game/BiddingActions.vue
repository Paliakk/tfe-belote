<script setup lang="ts">
import { computed } from 'vue'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '@/stores/game'
import { getGameSocket } from '@/services/game.socket'

const game = useGameStore()
const {
  mancheId,
  lastBidding,
  biddingOpen,
  isMyBiddingTurn,
  canPass,
  canTake,
  canChoose,
  seats,       
  joueurId, 
} = storeToRefs(game)

const showPicker = ref(false)
const waitingName = computed(() => {
  const id = lastBidding.value?.joueurActuelId
  if (!id) return '—'
  if (joueurId.value && id === joueurId.value) return 'vous'
  const name = seats.value.find(s => s.joueurId === id)?.username
  return name ?? `J${id}` // fallback si pas trouvé
})

function pass() {
  const s = getGameSocket()
  if (s && mancheId.value) s.emit('bidding:place', { mancheId: mancheId.value, type: 'pass' })
}
function take() {
  const s = getGameSocket()
  if (s && mancheId.value) s.emit('bidding:place', { mancheId: mancheId.value, type: 'take_card' })
}
function openPicker() {
  // guard: only during round 2 and my turn
  if (!canChoose.value) return
  showPicker.value = true
}
function closePicker() { showPicker.value = false }

function chooseColor(couleurAtoutId: 1|2|3|4) {
  const s = getGameSocket()
  if (!s || !mancheId.value) return
  s.emit('bidding:place', {
    mancheId: mancheId.value,
    type: 'choose_color',
    couleurAtoutId,
  })
  showPicker.value = false
}

// for rendering small cards
const suits = [
  { id: 1 as const, sym: '♥', cls: 'text-red-600' },
  { id: 2 as const, sym: '♦', cls: 'text-red-600' },
  { id: 3 as const, sym: '♣', cls: 'text-gray-900' },
  { id: 4 as const, sym: '♠', cls: 'text-gray-900' },
]
</script>

<template>
  <!-- Bandeau d’info -->
  <div v-if="biddingOpen" class="mb-2 text-sm">
    <span v-if="isMyBiddingTurn" class="px-2 py-1 rounded bg-yellow-200 text-yellow-900">
      🟡 C’est à vous de parler
    </span>
    <span v-else class="px-2 py-1 rounded bg-gray-200 text-gray-800">
      ⏳ En attente de {{ waitingName }}
    </span>
  </div>

  <!-- Actions d’enchères : masquées si ce n’est pas mon tour -->
  <div v-if="biddingOpen && isMyBiddingTurn" class="flex flex-wrap gap-2 relative">
    <button class="bid-btn" :disabled="!canPass" @click="pass">🙅 Pass</button>

    <!-- Tour 1: prendre -->
    <button
      v-if="lastBidding?.tourActuel === 1"
      class="bid-btn"
      :disabled="!canTake"
      @click="take"
    >
      🃏 Prendre
    </button>

    <!-- Tour 2: choisir couleur (ouvre le picker) -->
    <button
      v-if="lastBidding?.tourActuel === 2"
      class="bid-btn"
      :disabled="!canChoose"
      @click="openPicker"
    >
      🎨 Choisir couleur…
    </button>

    <!-- Picker popover -->
    <div
      v-if="showPicker"
      class="picker-backdrop"
      @click.self="closePicker"
    >
      <div class="picker-panel">
        <div class="flex items-center justify-between mb-2">
          <div class="font-semibold text-emerald-900">Choisir la couleur</div>
          <button class="close-btn" @click="closePicker">✕</button>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="s in suits"
            :key="s.id"
            class="suit-card"
            :class="s.cls"
            @click="chooseColor(s.id)"
            title="Choisir cette couleur"
          >
            <span class="text-3xl leading-none">{{ s.sym }}</span>
          </button>
        </div>
        <div class="mt-2 text-xs text-emerald-900/70">
          (1=♥, 2=♦, 3=♣, 4=♠)
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bid-btn{
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  font-weight: 600;
  background: rgba(255,255,255,.92);
  color: #064e3b; /* emerald-900 */
  box-shadow: 0 8px 24px rgba(0,0,0,.15);
  transition: transform .06s ease, background .15s ease;
}
.bid-btn:hover { background: #fff; }
.bid-btn:active { transform: scale(.98); }
.bid-btn[disabled]{ opacity:.5; cursor:not-allowed; }

/* popover backdrop */
.picker-backdrop{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

/* popover panel */
.picker-panel{
  width: 320px;
  background: #ffffffee;
  backdrop-filter: blur(4px);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,.35);
  padding: 12px;
  color: #064e3b;
}

/* close button */
.close-btn{
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #f1f5f9; /* slate-100 */
  color: #0f172a;      /* slate-900 */
  font-weight: 700;
  line-height: 1;
}
.close-btn:hover{ background:#fff }

/* suit “cards” */
.suit-card{
  display:flex;
  align-items:center;
  justify-content:center;
  height:72px;
  border-radius:12px;
  background:#fff;
  box-shadow: 0 8px 24px rgba(0,0,0,.12);
  transition: transform .06s ease, box-shadow .15s ease;
}
.suit-card:hover{
  transform: translateY(-1px);
  box-shadow: 0 12px 32px rgba(0,0,0,.18);
}
</style>
