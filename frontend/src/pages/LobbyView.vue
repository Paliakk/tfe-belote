<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLobbyStore } from "@/stores/useLobbyStore";
import { useBiddingStore } from "@/stores/useBiddingStore";
import { getCurrentPlayerId, setCurrentPlayerId } from "@/lib/player";

const route = useRoute();
const router = useRouter();
const lobbyStore = useLobbyStore();
const biddingStore = useBiddingStore();

const lobbyId = Number(route.params.lobbyId);
const createurId = computed(() => lobbyStore.currentLobby?.createur?.id ?? null);
const isCreator = computed(
  () => createurId.value != null && getCurrentPlayerId() === createurId.value
);

const myPlayerId = computed({
  get: () => getCurrentPlayerId(),
  set: (v: number) => setCurrentPlayerId(v),
});

onMounted(async () => {
  if (!Number.isFinite(lobbyId)) return;
  await lobbyStore.getLobby(lobbyId);
  await lobbyStore.fetchMembers(lobbyId);
});

const membersCount = computed(() => lobbyStore.currentLobby?.membres?.length ?? 0);
const statut = computed(() => lobbyStore.currentLobby?.statut ?? "en_attente");
const canStart = computed(() => {
  const nb = membersCount.value;
  return nb === 4 && statut.value === "en_attente" && isCreator.value;
});

async function onStart() {
  if (!createurId.value) return;
  await lobbyStore.startGame(lobbyId, {
    joueurId: createurId.value,
    scoreMax: 301,
  });

  const partieId = lobbyStore.currentLobby?.partie?.id;
  if (!partieId) return;

  await biddingStore.fetchActive(partieId);
  router.push({ name: "bidding", params: { partieId } });
}

async function onRefresh() {
  await lobbyStore.getLobby(lobbyId);
  await lobbyStore.fetchMembers(lobbyId);
}

async function onLeave() {
  const joueurId = getCurrentPlayerId();
  await lobbyStore.leaveLobby(lobbyId, joueurId);
  router.push({ name: "home" });
}
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-6">
    <!-- Header -->
    <div class="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight">
          Lobby #{{ lobbyStore.currentLobby?.id }}
        </h1>
        <p class="text-mute">
          Statut:
          <span
            :class="[
              'font-semibold',
              statut === 'en_attente' ? 'text-emerald-300' : 'text-amber-300',
            ]"
            >{{ statut }}</span
          >
          <span v-if="lobbyStore.currentLobby?.partie" class="ml-2 opacity-90">
            • Partie&nbsp;#{{ lobbyStore.currentLobby?.partie?.id }} ({{
              lobbyStore.currentLobby?.partie?.statut
            }})
          </span>
        </p>
      </div>

      <!-- Sélecteur joueur (compact sur mobile) -->
      <div class="flex items-center gap-2">
        <label class="text-sm text-mute">Mon joueurId</label>
        <input
          v-model.number="myPlayerId"
          type="number"
          class="w-24 rounded-lg border border-white/10 bg-[#101426] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
    </div>

    <!-- Grid principale -->
    <section class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Carte Membres -->
      <article
        class="lg:col-span-2 rounded-xl border border-white/10 bg-card p-4 md:p-5 shadow-soft"
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-xl font-semibold">Membres ({{ membersCount }})</h2>
          <span class="text-xs px-2 py-1 rounded bg-white/10"> Capacité: 4 </span>
        </div>

        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <li
            v-for="m in lobbyStore.currentLobby?.membres ?? []"
            :key="m.id"
            class="flex items-center gap-3 rounded-lg border border-white/10 bg-[#101426] p-3"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-bold"
            >
              {{ m.username?.[0]?.toUpperCase() ?? "#" }}
            </div>
            <div class="leading-tight">
              <div class="font-semibold">#{{ m.id }} — {{ m.username }}</div>
              <div class="text-xs text-mute">Joueur</div>
            </div>
          </li>
        </ul>

        <!-- Message vide (rare) -->
        <div
          v-if="(lobbyStore.currentLobby?.membres?.length ?? 0) === 0"
          class="text-mute"
        >
          Aucun membre dans ce lobby pour l’instant.
        </div>
      </article>

      <!-- Carte Actions -->
      <aside
        class="rounded-xl border border-white/10 bg-card p-4 md:p-5 shadow-soft h-fit"
      >
        <h3 class="mb-3 text-lg font-semibold">Actions</h3>

        <button
          class="mb-3 w-full rounded-lg bg-accent px-4 py-2 font-semibold text-black hover:brightness-95 disabled:opacity-50"
          :disabled="!canStart"
          @click="onStart"
          title="Seul le créateur peut lancer"
        >
          Lancer la partie
        </button>
        <button
          class="mt-2 w-full rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          @click="onRefresh"
        >
          Rafraîchir
        </button>

        <p class="mt-3 text-xs text-mute">
          La page ne se met plus à jour automatiquement. Utilise le bouton “Rafraîchir” si
          besoin.
        </p>

        <button
          class="w-full rounded-lg border border-white/15 px-4 py-2 font-medium hover:bg-white/5"
          @click="onLeave"
        >
          Quitter le lobby
        </button>

        <div class="mt-4 text-xs text-mute">
          Astuce : ouvre un autre onglet et rejoins avec un autre <em>joueurId</em> pour
          tester à plusieurs.
        </div>
      </aside>
    </section>

    <!-- Erreurs -->
    <p
      v-if="lobbyStore.error"
      class="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm"
    >
      {{ lobbyStore.error }}
    </p>
  </main>
</template>
