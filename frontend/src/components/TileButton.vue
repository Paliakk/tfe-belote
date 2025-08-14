<script setup lang="ts">
const props = defineProps<{
  label: string
  icon?: string  // emoji ou SVG inline
  color?: string // ex: 'from-indigo-500 to-purple-500'
}>();
</script>

<template>
  <button
    class="group relative w-full overflow-hidden rounded-xl2 border border-white/10 bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
  >
    <!-- bande colorée -->
    <div :class="['absolute inset-y-0 left-0 w-2', color ?? 'bg-gradient-to-b from-indigo-500 to-purple-500']"></div>

    <div class="pl-4 flex items-center gap-3">
      <div class="text-2xl select-none">
        <slot name="icon">{{ icon }}</slot>
      </div>
      <div class="text-xl font-semibold tracking-wide">{{ label }}</div>
    </div>

    <div class="absolute bottom-2 right-3 opacity-70 text-sm group-hover:opacity-90 transition">
      ➜
    </div>
  </button>
</template>
