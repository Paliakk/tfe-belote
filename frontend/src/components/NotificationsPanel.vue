<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'

type PanelItem = {
  id: number
  text: string
  read: boolean
  at: string
  // champs optionnels (utiles pour les demandes d'amis)
  type?: string                     // ex. 'FRIEND_REQUEST'
  data?: { requestId?: number; fromId?: number; fromUsername?: string } | null
}

const props = defineProps<{
  open: boolean
  items: PanelItem[]
}>()

const emit = defineEmits<{
  (e:'close'): void
  (e:'markAll'): void
  (e:'accepted', payload: { id:number; requestId:number }): void
  (e:'declined', payload: { id:number; requestId:number }): void
}>()

function doAccept(n: PanelItem) {
  const requestId = n.data?.requestId
  if (!requestId) return
  emit('accepted', { id: n.id, requestId })
}
function doDecline(n: PanelItem) {
  const requestId = n.data?.requestId
  if (!requestId) return
  emit('declined', { id: n.id, requestId })
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-black/40">
    <div class="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4">
      <header class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Notifications</h3>
        <div class="flex gap-2">
          <button class="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15" @click="$emit('markAll')">
            Tout marquer lu
          </button>
          <button class="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15" @click="$emit('close')">
            Fermer
          </button>
        </div>
      </header>

      <ul class="divide-y divide-white/10">
        <li v-for="n in items" :key="n.id" class="py-3 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm text-slate-300" :class="!n.read ? 'font-semibold' : ''">
              {{ n.text }}
            </div>
            <div class="text-xs text-slate-400 mt-0.5">{{ n.at }}</div>
          </div>

          <!-- Actions spécifiques : Demande d'ami -->
          <div v-if="n.type === 'FRIEND_REQUEST' || n.type === 'friend_request'" class="shrink-0 flex gap-2">
            <button
              class="px-2.5 py-1.5 rounded-md font-semibold bg-emerald-400 text-slate-900 hover:bg-emerald-300"
              @click="doAccept(n)"
            >
              Accepter
            </button>
            <button
              class="px-2.5 py-1.5 rounded-md font-semibold bg-rose-500 text-white hover:bg-rose-400"
              @click="doDecline(n)"
            >
              Refuser
            </button>
          </div>
        </li>

        <li v-if="!items?.length" class="py-8 text-center text-slate-400 text-sm">
          Aucune notification
        </li>
      </ul>
    </div>
  </div>
</template>
