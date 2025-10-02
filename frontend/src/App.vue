<template>
  <div>
    <RouterView />
    <!-- Modal outlet; rendered on top when route includes ?modal=stats etc. -->
    <RouterView name="modal" />
    <Toasts />
  </div>
</template>

<script setup lang="ts">
import Toasts from "@/components/ui/Toasts.vue"
</script>