<template>
  <div class="absolute inset-0 flex items-center justify-center gap-4 pointer-events-none">
    <!-- Returned card (only during bidding) -->
    <ReturnedCard />

    <!-- Current trick -->
    <Trick />
  </div>
</template>

<script setup lang="ts">
import ReturnedCard from "@/components/game/ReturnedCard.vue"
import Trick from "@/components/game/Trick.vue"
</script>
