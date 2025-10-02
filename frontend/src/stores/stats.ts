// src/stores/stats.ts
import { defineStore } from 'pinia'

type StatsData = {
  totalParties: number
  winrate: number
  // ajoute d’autres champs si ton backend en renvoie
}

export const useStatsStore = defineStore('stats-api', {
  state: () => ({
    loading: false as boolean,
    error: '' as string | null,
    data: null as StatsData | null,
  }),
  actions: {
    async load(joueurId: number) {
      this.loading = true
      this.error = null
      try {
        // 👉 remplace par ton vrai fetch
        const res = await fetch(`/api/stats/joueurs/${joueurId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        this.data = {
          totalParties: Number(json?.totalParties ?? 0),
          winrate: Number(json?.winrate ?? 0),
        }
      } catch (e: any) {
        this.error = e?.message || 'Erreur inconnue'
        this.data = null
      } finally {
        this.loading = false
      }
    },
  },
})
