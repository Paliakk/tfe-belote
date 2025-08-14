<script setup lang="ts">
import { ref } from "vue";
import { useLobbyStore } from "../stores/useLobbyStore";
import { useRouter } from "vue-router";
import { getCurrentPlayerId, setCurrentPlayerId } from "../lib/player";

const store = useLobbyStore();
const router = useRouter();

const lobbyId = ref<number | null>(null);
const joueurId = ref(getCurrentPlayerId());
const password = ref("");

async function submit() {
  if (!lobbyId.value) return;
  await store.joinLobby({
    lobbyId: lobbyId.value,
    joueurId: joueurId.value,
    password: password.value || undefined,
  });
  setCurrentPlayerId(joueurId.value);
  router.push({ name: "lobby", params: { lobbyId: lobbyId.value } });
}
</script>

<template>
  <div class="card">
    <h2>Rejoindre un lobby</h2>
    <div class="mb-3">
      <label class="block text-sm mb-1">Lobby ID</label><input v-model.number="lobbyId" type="number"  class="w-full rounded-lg border border-white/10 bg-[#101426] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
    </div>
    <div class="mb-3">
      <label class="block text-sm mb-1">Joueur ID</label><input v-model.number="joueurId" type="number" class="w-full rounded-lg border border-white/10 bg-[#101426] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
    </div>
    <div class="mb-3">
      <label class="block text-sm mb-1">Password</label><input v-model="password" type="password" class="w-full rounded-lg border border-white/10 bg-[#101426] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
    </div>
    <button type="button" @click="submit" class="rounded-lg bg-accent px-4 py-2 font-semibold text-black hover:brightness-95 disabled:opacity-50">Rejoindre</button>

    <p v-if="store.error" style="color: #b00">{{ store.error }}</p>
  </div>
</template>
