import { defineStore } from 'pinia'
import { api } from '@/services/api'

export const useStatsStore = defineStore('stats', {
  state: () => ({ loading: false, data: null as any, error: '' as string | null }),
  actions: {
    async load(joueurId: number) {
      this.loading = true; this.error = null
      try { this.data = await api(`/players/${joueurId}/stats`) }
      catch (e: any) { this.error = e.message }
      finally { this.loading = false }
    }
  }
})