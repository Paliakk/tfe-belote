<!-- src/components/stats/RecentResults.vue -->
<template>
  <div class="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-base font-semibold">Parties récentes</h3>
      <span v-if="loading" class="text-slate-400 text-sm">Chargement…</span>
    </div>

    <div v-if="error" class="text-rose-400 text-sm">{{ error }}</div>

    <div v-else-if="items.length === 0" class="text-slate-400 text-sm">
      Aucune partie récente.
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="r in items"
        :key="r.partieId + ':' + r.createdAt"
        class="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <span :class="r.won ? 'text-emerald-400' : 'text-rose-400'">
            {{ r.won ? 'Victoire' : 'Défaite' }}
          </span>
          <span class="text-slate-400 text-sm">
            · {{ new Date(r.createdAt).toLocaleString() }}
          </span>
          <span class="text-slate-400 text-sm"
                v-if="Number.isFinite(r.myScore) && Number.isFinite(r.oppScore)">
            · {{ r.myScore }}–{{ r.oppScore }}
          </span>
          <span class="text-slate-400 text-xs rounded-full border border-white/10 px-2 py-0.5"
                v-if="r.statut === 'abandonnee'">
            abandon
          </span>
        </div>
        <div class="text-slate-400 text-sm">
          <template v-if="r.partieId">#{{ r.partieId }}</template>
          <template v-if="r.lobbyId"> · Lobby {{ r.lobbyId }}</template>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getToken } from '@/services/auth'

type RecentItem = {
  partieId: number
  createdAt: string
  statut: string
  lobbyId?: number | null
  myScore: number
  oppScore: number
  won: boolean
}

const props = defineProps<{
  joueurId?: number | null
  limit?: number
}>()

const items = ref<RecentItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  items.value = []
  error.value = null
  if (!props.joueurId) return
  loading.value = true
  try {
    const base = import.meta.env.VITE_API_BASE || 'http://localhost:3000'
    const url = new URL(`/players/${props.joueurId}/recent`, base)
    if (props.limit) url.searchParams.set('limit', String(props.limit))
    const headers: Record<string, string> = {}
    const tok = await getToken().catch(() => null)
    if (tok) headers.Authorization = 'Bearer ' + tok
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    items.value = Array.isArray(data) ? data : []
  } catch (e: any) {
    error.value = e?.message || 'Erreur de chargement'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => [props.joueurId, props.limit], load)
</script>
