<template>
  <svg :width="size" :height="size" viewBox="0 0 100 100" :class="cls" aria-hidden="true">
    <template v-if="id===1"><path d="M50 20 C45 5 20 10 20 35 C20 50 40 60 50 75 C60 60 80 50 80 35 C80 10 55 5 50 20Z" fill="currentColor"/></template>
    <template v-else-if="id===2"><path d="M50 10 L85 50 L50 90 L15 50 Z" fill="currentColor"/></template>
    <template v-else-if="id===3">
      <path d="M50 18 C45 8 28 8 24 22 C22 30 27 38 34 40 C25 40 16 48 18 58 C21 72 40 71 46 62 C45 72 43 82 35 86 L65 86 C57 82 55 72 54 62 C60 71 79 72 82 58 C84 48 75 40 66 40 C73 38 78 30 76 22 C72 8 55 8 50 18Z" fill="currentColor"/>
    </template>
    <template v-else-if="id===4">
      <path d="M50 10 C28 10 17 37 35 48 C27 48 18 55 18 64 C18 76 31 84 44 78 C38 86 34 92 30 94 L70 94 C66 92 62 86 56 78 C69 84 82 76 82 64 C82 55 73 48 65 48 C83 37 72 10 50 10Z" fill="currentColor"/>
    </template>
  </svg>
</template>

<script setup lang="ts">
const props = defineProps<{ id:1|2|3|4; size?: number; cls?: string }>()
const size = props.size ?? 24
const cls = props.cls ?? ''
</script>

<style scoped>
/* rien, on hérite de currentColor */
</style>
