<template>
  <div class="hand-wrap">
    <Card
      v-for="c in game.myHand"
      :key="c.id"
      :card="c"
      :hoverable="game.isPlayingPhase && game.isMyTurn && game.playableIds.has(c.id)"
      :disabled="!(game.isPlayingPhase && game.isMyTurn && game.playableIds.has(c.id))"
      @click="onPlay(c)"
    />
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { useGameStore } from "@/stores/game";
import { getGameSocket } from "@/services/game.socket";
import { playCard } from "@/services/game.socket";
import Card from "@/components/game/Card.vue";
const game = useGameStore();

function isPlayable(c: { id: number }) {
  return game.isPlayingPhase && game.isMyTurn && game.playableIds.has(c.id);
}
function onPlay(c: any) {
  if (!(game.isPlayingPhase && game.isMyTurn && game.playableIds.has(c.id))) return;
  const s = getGameSocket();
  if (s && game.mancheId) s.emit("play:card", { mancheId: game.mancheId, carteId: c.id });
}
watch(
  () => [game.isPlayingPhase, game.currentTurnPlayerId, game.joueurId, game.mancheId],
  () => {
    const s = getGameSocket();
    if (!s) return;
    if (
      game.isPlayingPhase &&
      game.joueurId &&
      game.currentTurnPlayerId === game.joueurId &&
      game.mancheId
    ) {
      s.emit("play:getPlayable", { mancheId: game.mancheId });
      // mini retry si besoin
      setTimeout(() => {
        if (
          game.isPlayingPhase &&
          game.currentTurnPlayerId === game.joueurId &&
          game.playableIds.size === 0
        ) {
          s.emit("play:getPlayable", { mancheId: game.mancheId });
        }
      }, 500);
    }
  },
  { immediate: true }
);
</script>
<style scoped>
.hand-wrap {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;

  /* mobile: scroll horizontal sans wrap */
  overflow-x: auto;
  padding-bottom: 8px;
  scroll-snap-type: x mandatory;
}
@media (min-width: 768px) {
  .hand-wrap {
    flex-wrap: wrap;
    overflow: visible;
  }
}
.hand-wrap > * {
  scroll-snap-align: start;
}
</style>
