<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
</script>

<template>
  <!-- On téléporte au <body> pour éviter tout z-index/stacking local -->
  <teleport to="body">
    <div class="toast-wrap">
      <transition-group name="toast" tag="div">
        <div
          v-for="t in ui.toasts"
          :key="t.id"
          class="toast"
          :class="t.type"
          @click="ui.removeToast(t.id)"
          role="status"
        >
          {{ t.text }}
        </div>
      </transition-group>
    </div>
  </teleport>
</template>

<style scoped>
.toast-wrap{
  position: fixed;
  inset: auto 16px 16px auto;   /* bas-droite */
  z-index: 9999;
  pointer-events: none;
}
.toast{
  min-width: 220px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #111827;          /* slate-900 */
  color: #fff;
  font-weight: 600;
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
  pointer-events: auto;          /* cliquable pour fermer */
}
.toast.success{ background:#065f46 }   /* emerald-800 */
.toast.warning{ background:#92400e }   /* amber-800 */
.toast.error  { background:#7f1d1d }   /* red-900   */

.toast-enter-from,
.toast-leave-to { opacity:0; transform: translateY(12px) scale(.98); }
.toast-enter-active,
.toast-leave-active{ transition: all .18s ease; }
</style>
