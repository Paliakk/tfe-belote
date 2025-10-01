<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watchEffect } from 'vue'

const props = defineProps<{
  baseW?: number   // largeur de référence en px
  baseH?: number   // hauteur de référence en px
  padding?: number // marge intérieure anti-bords (px)
}>()

const baseW = props.baseW ?? 1200
const baseH = props.baseH ?? 840
const padding = props.padding ?? 12

const viewportRef = ref<HTMLElement | null>(null)
const scale = ref(1)

function recompute() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const sw = vw - padding * 2
  const sh = vh - padding * 2
  scale.value = Math.max(0.5, Math.min(2, Math.min(sw / baseW, sh / baseH)))
  if (viewportRef.value) {
    viewportRef.value.style.setProperty('--scale', String(scale.value))
    viewportRef.value.style.setProperty('--base-w', baseW + 'px')
    viewportRef.value.style.setProperty('--base-h', baseH + 'px')
  }
}
const onResize = () => recompute()

onMounted(() => {
  recompute()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <div class="fitstage">
    <div ref="viewportRef" class="fitstage__viewport">
      <div class="fitstage__inner">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.fitstage{
  position:fixed; inset:0;        /* occupe 100% de l’écran */
  display:grid; place-items:center;
  overflow:hidden;                /* 🚫 pas de scroll */
  padding:12px;
}
.fitstage__viewport{
  /* variables alimentées par le script */
  --scale: 1;
  --base-w: 1200px;
  --base-h: 840px;
  width: calc(var(--base-w) * var(--scale));
  height: calc(var(--base-h) * var(--scale));
  transform: translateZ(0);
}
.fitstage__inner{
  width: var(--base-w);
  height: var(--base-h);
  transform-origin: top left;
  transform: scale(var(--scale));
  /* Pour que les panneaux existants se placent “au pixel” */
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
