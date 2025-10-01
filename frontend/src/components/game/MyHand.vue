<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="c in game.myHand"
      :key="c.id"
      class="relative"
      :disabled="!isPlayable(c)"
      @click="onPlay(c.id)"
    >
      <Card :card="c" />
      <div
        v-if="!isPlayable(c)"
        class="absolute inset-0 opacity-60 grayscale pointer-events-none"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { useGameStore, type Carte } from '@/stores/game'
import { playCard } from '@/services/game.socket'
import Card from './Card.vue'

const game = useGameStore()

function isPlayable(c: Carte) {
  return game.isPlayingPhase && game.isMyTurn && game.playableIds.has(c.id)
}

function onPlay(cardId: number) {
  if (!isPlayable({ id: cardId, valeur: '', couleurId: 0 } as Carte)) return
  playCard(cardId)
}
</script>
