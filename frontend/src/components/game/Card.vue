<template>
  <div class="relative bg-white rounded-lg shadow w-[70px] h-[100px] grid place-items-center"
       :class="[colorClass, mini ? 'scale-90 opacity-95' : '']">
    <div class="absolute left-1.5 top-1 text-sm font-semibold">{{ short }}</div>
    <div class="text-2xl">{{ suit }}</div>
  </div>
</template>

<script setup lang="ts">
import type { Carte } from '@/stores/game'
import { computed } from 'vue'
const props = defineProps<{ card: Carte, mini?: boolean }>()
const suit = computed(() => ({1:'♥',2:'♦',3:'♣',4:'♠'} as any)[props.card.couleurId] || '?')
const colorClass = computed(() => (props.card.couleurId===1||props.card.couleurId===2)?'text-red-600':'text-slate-900')
const short = computed(() => ({ 'Valet':'J','Dame':'Q','Roi':'K' } as any)[props.card.valeur] || props.card.valeur)
</script>
