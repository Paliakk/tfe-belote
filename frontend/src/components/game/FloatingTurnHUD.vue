<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useGameStore } from "@/stores/game";
import TurnTimer from "@/components/game/TurnTimer.vue";

const game = useGameStore();
const { currentTurnPlayerId, joueurId, isPlayingPhase, lastBidding } = storeToRefs(game);

// HUD visible si on est en enchères (lastBidding présent) OU si un tour est défini
const show = computed(() => !!lastBidding.value || !!currentTurnPlayerId.value);
const isMyTurn = computed(
  () => !!joueurId.value && currentTurnPlayerId.value === joueurId.value
);
const label = computed(() => {
  if (!currentTurnPlayerId.value) return "Enchères en cours";
  return isMyTurn.value
    ? "À vous de jouer"
    : `Tour du joueur ${currentTurnPlayerId.value}`;
});
</script>

<template>
  <div class="fixed z-[60] bottom-4 right-4 pointer-events-none">
    <div

    >
      <TurnTimer :compact="true" />
    </div>
  </div>
</template>
