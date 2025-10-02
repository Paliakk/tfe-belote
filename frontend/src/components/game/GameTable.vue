<template>
  <div
    class="absolute inset-0 z-[5] flex items-center justify-center gap-4 pointer-events-none"
  >
    <ReturnedCard />
    <Trick />
  </div>
</template>

<script setup lang="ts">
import ReturnedCard from "@/components/game/ReturnedCard.vue";
import Trick from "@/components/game/Trick.vue";
</script>
