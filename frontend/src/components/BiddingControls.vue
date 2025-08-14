<script setup lang="ts">
import { ref, computed } from "vue";
import { useBiddingStore } from "../stores/useBiddingStore";
import { CouleurId } from "@/lib/types";

const props = defineProps<{
  mancheId: number;
  joueurId: number;
  tourActuel: 1 | 2;
  couleurRetourneeId: number | null;
}>();

const store = useBiddingStore();
const couleurAtoutId = ref<number | null>(null);

const canTakeCard = computed(() => props.tourActuel === 1);
const canChooseColor = computed(() => props.tourActuel === 2);

function onPass(mancheId: number, joueurId: number) {
  store.bid(mancheId, { joueurId, type: "pass" });
}

function onTakeCard(mancheId: number, joueurId: number) {
  store.bid(mancheId, { joueurId, type: "take_card" });
}

function onChooseColor(mancheId: number, joueurId: number, couleur: number) {
  // couleur vient du <select> (number), pas besoin d'enum strict ici
  store.bid(mancheId, { joueurId, type: "choose_color", couleurAtoutId: couleur });
}
</script>

<template>
  <div class="flex w-full flex-wrap items-end justify-center gap-2">
    <button
      type="button"
      class="rounded-lg border border-white/15 px-3 py-2 hover:bg-white/5"
      @click="() => onPass(props.mancheId, props.joueurId)"
    >
      Passer
    </button>

    <button
      type="button"
      class="rounded-lg border border-white/15 px-3 py-2 hover:bg-white/5 disabled:opacity-40"
      :disabled="!canTakeCard"
      @click="() => onTakeCard(props.mancheId, props.joueurId)"
    >
      Prendre la carte
    </button>

    <div v-if="canChooseColor" class="flex items-center gap-2">
      <select
        v-model.number="couleurAtoutId"
        class="rounded-lg border border-white/15 bg-[#101426] px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
      >
        <option :value="null" disabled>Couleur atout…</option>
        <option :value="1">♠ Pique</option>
        <option :value="2">♥ Cœur</option>
        <option :value="3">♦ Carreau</option>
        <option :value="4">♣ Trèfle</option>
      </select>
      <button
        type="button"
        class="rounded-lg bg-accent px-3 py-2 font-semibold text-black hover:brightness-95 disabled:opacity-50"
        :disabled="couleurAtoutId === null"
        @click="() => onChooseColor(props.mancheId, props.joueurId, couleurAtoutId!)"
      >
        Choisir
      </button>
    </div>
  </div>
</template>
