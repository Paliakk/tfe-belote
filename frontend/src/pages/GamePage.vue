<template>
  <main class="min-h-dvh bg-emerald-900 text-white p-4">
    <header class="flex items-center justify-between mb-3">
      <h1 class="text-2xl font-bold">Belote – Table</h1>
      <div class="flex items-center gap-2">
        <span
          class="px-2 py-1 rounded-full bg-white text-emerald-800 text-sm font-semibold"
        >
          {{ lobbyLabel }}
        </span>
        <span
          class="px-2 py-1 rounded-full bg-white text-emerald-800 text-sm font-semibold"
        >
          Manche {{ mancheLabel }}
        </span>
        <span
          class="px-2 py-1 rounded-full bg-white text-emerald-800 text-sm font-semibold"
        >
          Atout: {{ atoutLabel }}
        </span>
      </div>
    </header>

    <div class="flex flex-col items-center gap-4">
      <div
        class="rounded-3xl shadow-2xl relative"
        style="
          width: 840px;
          height: 540px;
          background: radial-gradient(
            ellipse at center,
            #0aa255 0%,
            #08693b 65%,
            #065a33 100%
          );
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35), inset 0 0 0 6px #0d5533cc;
        "
      >
        <!-- Sièges autour de la table -->
        <Seats class="h-full w-full" />

        <!-- Centre de table : carte retournée (pendant enchères) + tapis -->
        <GameTable class="h-full w-full" />
      </div>

      <LastTrick class="w-[840px]" />

      <div class="w-[840px]">
        <Scoreboard />
        <TotalScore class="mt-2" />
      </div>

      <div class="w-[840px]">
        <Hand />
      </div>
      <div class="w-[840px] mt-2">
        <BiddingActions />
      </div>

      <div class="flex gap-2 mt-2">
        <button
          class="px-3 py-2 rounded-lg font-semibold bg-rose-600 text-white hover:bg-rose-500"
          @click="abandon"
        >
          Quitter la partie
        </button>
      </div>
    </div>
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
import FloatingTurnHUD from '@/components/game/FloatingTurnHUD.vue'

const route = useRoute();
const router = useRouter();
const game = useGameStore();

const lobbyLabel = computed(() => game.lobbyNom ?? "—");
const mancheLabel = computed(() => game.mancheNumero ?? "—");
const atoutLabel = computed(
  () => (({ 1: "♥", 2: "♦", 3: "♣", 4: "♠" } as any)[game.atoutId ?? 0] ?? "—")
);

// Boutons d'enchères
const canBid = computed(
  () => !game.isPlayingPhase && game.currentTurnPlayerId === game.joueurId
);
const canPass = computed(() => canBid.value);
const canTake = computed(() => canBid.value && game.lastBidding?.tourActuel === 1);
const canChoose = computed(() => canBid.value && game.lastBidding?.tourActuel === 2);

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

function pass() {
  const s = getGameSocket();
  if (!s || !game.mancheId) return;
  s.emit("bidding:place", { mancheId: game.mancheId, type: "pass" });
}
function take() {
  const s = getGameSocket();
  if (!s || !game.mancheId) return;
  s.emit("bidding:place", { mancheId: game.mancheId, type: "take_card" });
}
function choose() {
  const s = getGameSocket();
  if (!s || !game.mancheId) return;
  const c = Number(prompt("Couleur atout ? 1=♥, 2=♦, 3=♣, 4=♠") || "0");
  if (![1, 2, 3, 4].includes(c)) return;
  s.emit("bidding:place", {
    mancheId: game.mancheId,
    type: "choose_color",
    couleurAtoutId: c,
  });
}
function abandon() {
  const s = getGameSocket();
  if (!s || !game.partieId) return;
  if (!confirm("Abandonner la partie ?")) return;
  s.emit("game:abandon", { partieId: game.partieId });
}
</script>
