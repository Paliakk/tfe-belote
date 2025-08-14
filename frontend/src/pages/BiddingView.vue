<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from "vue";
import { useRoute } from "vue-router";
import { useBiddingStore } from "@/stores/useBiddingStore";
import { getCurrentPlayerId } from "@/lib/player";
import BiddingControls from "@/components/BiddingControls.vue";

const route = useRoute();
const store = useBiddingStore();

const partieId = Number(route.params.partieId);
const poll = ref<number | null>(null);

const myId = getCurrentPlayerId();

// helpers affichage
const activeId = computed(() => store.active?.id ?? null);
const mancheNo = computed(() => store.active?.numero ?? 1);
const state = computed(() => store.state);
const joueurActuelId = computed(() => state.value?.joueurActuelId ?? null);

// mapping couleurId → symbole (placeholder simple)
function suitSymbol(couleurId?: number | null) {
  switch (couleurId) {
    case 1:
      return "♠";
    case 2:
      return "♥";
    case 3:
      return "♦";
    case 4:
      return "♣";
    default:
      return "•";
  }
}

async function load() {
  if (!Number.isFinite(partieId)) return;
  const active = await store.fetchActive(partieId);
  if (active?.id) await store.fetchState(active.id);
}

function startPolling() {
  stopPolling();
  poll.value = window.setInterval(async () => {
    if (store.active?.id) {
      await store.fetchState(store.active.id);
    } else {
      await load();
    }
  }, 1500);
}
function stopPolling() {
  if (poll.value) {
    clearInterval(poll.value);
    poll.value = null;
  }
}

onMounted(async () => {
  await load();
  startPolling();
});
onBeforeUnmount(() => stopPolling());
</script>

<template>
  <main class="min-h-[calc(100vh-4rem)] px-2 py-3 md:px-4">
    <!-- Bandeau infos -->
    <div
      class="mx-auto mb-3 flex max-w-6xl flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-card px-4 py-3 shadow-soft"
    >
      <div class="flex items-center gap-3">
        <div class="text-sm text-mute">Partie</div>
        <div class="rounded-lg bg-white/10 px-3 py-1 font-semibold">#{{ partieId }}</div>
        <div class="text-sm text-mute">Manche</div>
        <div class="rounded-lg bg-white/10 px-3 py-1 font-semibold">#{{ mancheNo }}</div>
        <div v-if="state?.atout" class="ml-2 rounded-lg bg-white/10 px-3 py-1">
          Atout :
          <span class="ml-1 font-semibold">{{ suitSymbol(state?.atout?.id) }}</span>
        </div>
        <div v-if="state?.carteRetournee" class="ml-2 rounded-lg bg-white/10 px-3 py-1">
          Carte retournée :
          <span class="ml-1 font-semibold">
            {{ state?.carteRetournee?.valeur }}
            {{ suitSymbol(state?.carteRetournee?.couleurId) }}
          </span>
        </div>
      </div>

      <div class="text-sm">
        <span class="text-mute">Au tour de</span>
        <span
          class="ml-2 rounded-md bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-300"
        >
          #{{ joueurActuelId ?? "…" }}
        </span>
      </div>
    </div>

    <!-- Tapis -->
    <!-- Tapis -->
    <section
      class="relative mx-auto aspect-[16/9] max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(1200px_600px_at_50%_50%,#1b2449_0%,#0f152b_60%)] shadow-soft"
    >
      <!-- ARÈNE centrée (repère unique pour placements) -->
      <div
        class="absolute left-1/2 top-1/2 w-[22rem] h-[22rem] md:w-[26rem] md:h-[26rem] -translate-x-1/2 -translate-y-1/2"
        id="arena"
      >
        <!-- CARRÉ CENTRAL -->
        <div
          class="absolute left-1/2 top-1/2 w-64 h-64 md:w-80 md:h-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm"
        />

        <!-- Carte retournée au centre du carré -->
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            class="flex h-28 w-20 items-center justify-center rounded-xl border border-white/20 bg-white/90 text-2xl text-black shadow"
          >
            <span v-if="state?.carteRetournee">{{ state?.carteRetournee?.valeur }}</span>
          </div>
          <div class="mt-1 text-center text-2xl opacity-80">
            {{ suitSymbol(state?.carteRetournee?.couleurId) }}
          </div>
        </div>

        <!-- SIÈGES autour du carré (par côté) -->
        <!-- TOP (au‑dessus du carré) -->
        <div class="absolute left-1/2 -translate-x-1/2 -top-8">
          <div class="seat">
            <div class="avatar">T</div>
            <div class="name">Joueur #?</div>
            <div v-if="state?.historique?.[0]?.type === 'pass'" class="bubble">PASSÉ</div>
          </div>
        </div>

        <!-- RIGHT (à droite du carré) -->
        <div class="absolute top-1/2 -translate-y-1/2 -right-6">
          <div class="seat seat--right">
            <div class="avatar">R</div>
            <div class="name">Joueur #?</div>
            <div v-if="state?.historique?.[1]?.type === 'pass'" class="bubble">PASSÉ</div>
          </div>
        </div>

        <!-- LEFT (à gauche du carré) -->
        <div class="absolute top-1/2 -translate-y-1/2 -left-6">
          <div class="seat seat--left">
            <div class="avatar">L</div>
            <div class="name">Joueur #?</div>
            <div v-if="state?.historique?.[2]?.type === 'pass'" class="bubble">PASSÉ</div>
          </div>
        </div>

        <!-- BOTTOM (sous le carré) -->
        <div class="absolute left-1/2 -translate-x-1/2 -bottom-8">
          <div class="seat seat--me border-emerald-400/40 bg-emerald-400/5">
            <div class="avatar">Me</div>
            <div class="name">Joueur #{{ myId }}</div>
          </div>
        </div>
      </div>

      <!-- Contrôles (sous l’arène) -->
      <div
        v-if="activeId && state"
        class="absolute left-1/2 bottom-3 -translate-x-1/2 flex w-[min(92vw,640px)] flex-wrap items-center justify-center gap-2 rounded-xl border border-white/10 bg-card/80 px-3 py-3 backdrop-blur"
      >
        <BiddingControls
          :manche-id="activeId!"
          :joueur-id="myId"
          :tour-actuel="state.tourActuel"
          :couleur-retournee-id="state.carteRetournee?.couleurId ?? null"
        />
      </div>
    </section>

    <!-- Historique -->
    <section
      class="mx-auto mt-4 max-w-6xl rounded-xl border border-white/10 bg-card p-4 shadow-soft"
    >
      <h3 class="mb-2 text-lg font-semibold">Historique des annonces</h3>
      <div v-if="state?.historique?.length" class="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div
          v-for="(h, idx) in state!.historique"
          :key="idx"
          class="flex items-center justify-between rounded-lg border border-white/10 bg-[#101426] px-3 py-2"
        >
          <div class="text-sm opacity-80">
            #{{ h.joueur.id }} — {{ h.joueur.username }}
          </div>
          <div class="text-sm font-semibold">
            <span v-if="h.type === 'pass'">PASSÉ</span>
            <span v-else-if="h.type === 'take_card'">PREND LA CARTE</span>
            <span v-else-if="h.type === 'choose_color'"
              >ATOUT {{ h.couleurAtoutId && suitSymbol(h.couleurAtoutId) }}</span
            >
          </div>
          <div class="text-xs text-mute">{{ new Date(h.at).toLocaleTimeString() }}</div>
        </div>
      </div>
      <div v-else class="text-mute">En attente de la première annonce…</div>

      <p
        v-if="store.error"
        class="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm"
      >
        {{ store.error }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.seat {
  @apply relative flex w-44 flex-col items-center gap-1 rounded-xl border border-white/15 bg-white/5 p-3 text-center shadow;
}
.seat--right .bubble { @apply left-auto right-full translate-x-2; }
.seat--left  .bubble { @apply left-full translate-x-2; }
.seat--me    { @apply ring-1 ring-emerald-400/30; }

.avatar { @apply flex h-12 w-12 items-center justify-center rounded-full bg-white/10 font-bold; }
.name   { @apply text-sm opacity-90; }
.bubble { @apply absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-sky-400/20 px-2 py-0.5 text-xs font-bold text-sky-200 shadow; }

@media (max-width: 640px) {
  .seat { @apply w-36 p-2; }
  .avatar { @apply h-10 w-10; }
}
</style>
