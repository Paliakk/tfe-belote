<template>
  <main class="min-h-dvh bg-slate-950 text-white no-vert-scroll pb-safe">
    <header class="max-w-screen-xl mx-auto px-3 py-3">
      <h1 class="text-xl sm:text-2xl font-bold">Belote</h1>
    </header>

    <!-- HUD BAR AU-DESSUS DE LA TABLE -->
    <section class="max-w-screen-xl mx-auto w-full px-3">
      <div class="hud-bar">
        <!-- gauche : scores -->
        <div class="hud-col">
          <div class="panel">
            <Scoreboard />
          </div>
          <div class="panel mt-2">
            <TotalScore />
          </div>
        </div>

        <!-- centre : lobby / manche / atout -->
        <div class="hud-col center">
          <div class="inline-flex flex-wrap items-center justify-center gap-2">
            <span class="badge-big">{{ lobbyLabel }}</span>
            <span class="badge-big">Manche {{ mancheLabel }}</span>
            <span class="badge-big">Atout : {{ atoutLabel }}</span>
          </div>
        </div>

        <!-- droite : dernier pli -->
        <div class="hud-col right">
          <div class="panel">
            <LastTrick />
          </div>
        </div>
      </div>
    </section>

    <!-- TABLE VERTE (avatars/noms à l'intérieur) -->
    <section class="w-full flex items-center justify-center px-2 pb-4">
      <div
        class="table-wrap relative"
        style="width: min(95vw, 1200px); aspect-ratio: 16/9"
      >
        <!-- couche 1 : nappe -->
        <div class="table-cloth absolute inset-0 rounded-[24px] shadow-2xl z-[1]" />
        <!-- couche 2 : avatars/noms sur les bords -->
        <div class="absolute inset-0 z-[2]">
          <Seats class="h-full w-full" />
        </div>
        <!-- couche 3 : centre (carte retournée + tapis) -->
        <div class="absolute inset-0 z-[3]">
          <GameTable class="h-full w-full" />
        </div>
      </div>
    </section>

    <!-- Main + enchères + quitter -->
    <section class="max-w-screen-xl mx-auto px-2 space-y-3">
      <div class="panel"><Hand /></div>
      <div class="panel"><BiddingActions /></div>

      <div class="sticky bottom-2 z-40 flex justify-center px-2 mt-4">
        <button
          class="px-3 py-2 rounded-lg font-semibold bg-rose-600 text-white hover:bg-rose-500 shadow-lg"
          @click="abandon"
        >
          Quitter la partie
        </button>
      </div>
    </section>

    <FloatingTurnHUD />
  </main>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useGameStore } from "@/stores/game";
import {
  connectGameSocket,
  getGameSocket,
  disconnectGameSocket,
} from "@/services/game.socket";
import { connectAndJoin } from "@/services/game.socket";

import Seats from "@/components/game/Seats.vue";
import Hand from "@/components/game/Hand.vue";
import LastTrick from "@/components/game/LastTrick.vue";
import Scoreboard from "@/components/game/Scoreboard.vue";
import TotalScore from "@/components/game/TotalScore.vue";
import GameTable from "@/components/game/GameTable.vue";
import BiddingActions from "@/components/game/BiddingActions.vue";
import FloatingTurnHUD from "@/components/game/FloatingTurnHUD.vue";

const route = useRoute();
const router = useRouter();
const game = useGameStore();

const lobbyLabel = computed(() => game.lobbyNom ?? "—");
const mancheLabel = computed(() => game.mancheNumero ?? "—");
const atoutLabel = computed(
  () => (({ 1: "♥", 2: "♦", 3: "♣", 4: "♠" } as any)[game.atoutId ?? 0] ?? "—")
);

onMounted(async () => {
  const partieId = Number(route.params.partieId || route.query.partieId);
  if (!partieId) {
    alert("partieId manquant");
    return router.replace("/lobby");
  }
  await connectAndJoin(partieId);
  game.partieId = partieId;

  const s = await connectGameSocket();
  s.emit("joinPartie", { partieId });
  s.once("joinedPartie", (p: any) => {
    if (p?.mancheId) s.emit("ui:rehydrate", { mancheId: p.mancheId });
  });
  s.on("game:over", (p: any) => {
    const url = new URL("/lobby", location.origin);
    if (p?.lobbyId) url.searchParams.set("lobbyId", String(p.lobbyId));
    router.replace(url.pathname + url.search);
  });
});
onBeforeUnmount(() => {
  disconnectGameSocket();
});

function abandon() {
  const s = getGameSocket();
  if (!s || !game.partieId) return;
  if (!confirm("Abandonner la partie ?")) return;
  s.emit("game:abandon", { partieId: game.partieId });
}
</script>
<style scoped>
/* bandeau HUD au-dessus de la table */
.hud-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 12px;
  margin: 4px 0 10px;
}
.hud-col.right {
  justify-self: end;
}
.hud-col.center {
  justify-self: center;
}

/* panneaux translucides */
.panel {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 10px;
  box-shadow: inset 0 6px 24px rgba(0, 0, 0, 0.18);
}

/* badges : nom / manche / atout */
.badge-big {
  display: inline-block;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: #fff;
  color: #064e3b;
  font-weight: 800;
  font-size: clamp(12px, 1.6vw, 18px);
}

/* table verte */
.table-cloth {
  background: radial-gradient(ellipse at 50% 35%, #14a35c 0%, #0a7b45 60%, #075c35 100%);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45), inset 0 0 0 8px #0d5533cc;
}

/* responsive : stack sur mobile étroit */
@media (max-width: 820px) {
  .hud-bar {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .hud-col.right,
  .hud-col.center {
    justify-self: stretch;
  }
}
.pb-safe {
  padding-bottom: max(18px, env(safe-area-inset-bottom));
}
.no-vert-scroll {
  overflow-y: clip;
}
</style>
