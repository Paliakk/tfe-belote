// src/stores/recent.ts
import { defineStore } from 'pinia'

export type ResultItem = { ts: number; won: boolean; partieId?: number; lobbyId?: number }
const KEY = 'belote:last5'

export const useRecentStore = defineStore('recent', {
  state: () => ({ lastResults: [] as ResultItem[] }),
  actions: {
    _load() {
      try { const raw = localStorage.getItem(KEY); if (raw) this.lastResults = JSON.parse(raw) || [] } catch {}
    },
    _save() { try { localStorage.setItem(KEY, JSON.stringify(this.lastResults.slice(0, 5))) } catch {} },
    recordResult(item: ResultItem) {
      if (!this.lastResults.length) this._load()
      this.lastResults.unshift(item)
      if (this.lastResults.length > 5) this.lastResults.length = 5
      this._save()
    },
    clear() { this.lastResults = []; try { localStorage.removeItem(KEY) } catch {} }
  }
})
