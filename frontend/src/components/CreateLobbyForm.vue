<script setup lang="ts">
import { ref } from "vue";
import { useLobbyStore } from "../stores/useLobbyStore";
import { useRouter } from "vue-router";
import { getCurrentPlayerId, setCurrentPlayerId } from "../lib/player";

const store = useLobbyStore();
const router = useRouter();

const nom = ref("Salon de test");
const password = ref("");
const createurId = ref(getCurrentPlayerId());

async function submit() {
  await store.createLobby({
    nom: nom.value,
    password: password.value || undefined,
  });
  setCurrentPlayerId(createurId.value);
  if (store.currentLobby)
    router.push({ name: "lobby", params: { lobbyId: store.currentLobby.id } });
}
</script>

<template>
  <div class="card">
    <h2>Créer un lobby</h2>
    <div class="mb-3"><label class="block text-sm mb-1">Nom</label><input v-model="nom" class="w-full rounded-lg border border-white/10 bg-[#101426] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" /></div>
    <div class="mb-3">
      <label>Password</label class="block text-sm mb-1"><input v-model="password" type="password" class="w-full rounded-lg border border-white/10 bg-[#101426] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
    </div>
    <div class="mb-3">
      <label>Créateur (id)</label class="block text-sm mb-1"><input v-model.number="createurId" type="number" class="w-full rounded-lg border border-white/10 bg-[#101426] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
    </div>
    <div class="mb-3"><button @click="submit" class="rounded-lg bg-accent px-4 py-2 font-semibold text-black hover:brightness-95 disabled:opacity-50">Créer</button></div>
    <p v-if="store.error" style="color: #b00">{{ store.error }}</p>
  </div>
</template>
