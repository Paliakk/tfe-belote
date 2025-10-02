import { defineStore } from 'pinia'

export type Toast = {
  id: number
  text: string
  type?: 'info' | 'success' | 'warning' | 'error'
  ttl?: number // ms
}
export type RoundRow = {
  numero: number
  team1: number
  team2: number
  bonus?: string[] | string | null
}

type EndModalState = {
  visible: boolean
  secondsLeft: number
  timerId: number | null
  payload?: any,
  frozen: boolean
}
export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [] as Toast[],
    endModal: { visible: false, secondsLeft: 10, timerId: null, payload: null, frozen: false } as EndModalState,
  }),
  actions: {
    _clearEndTimer() {
      if (this.endModal.timerId) { clearInterval(this.endModal.timerId); this.endModal.timerId = null }
    },
    pushToast(t: Omit<Toast, 'id'> & { id?: number }) {
      const id = t.id ?? Date.now()
      const ttl = t.ttl ?? 3500
      this.toasts.push({ id, text: t.text, type: t.type ?? 'info', ttl })
      window.setTimeout(() => this.removeToast(id), ttl)
    },
    removeToast(id: number) {
      this.toasts = this.toasts.filter(x => x.id !== id)
    },
    clearToasts() { this.toasts = [] },
    openEndModal(seconds = 10, payload?: any) {
      if (this.endModal.timerId) { clearInterval(this.endModal.timerId); this.endModal.timerId = null }
      this._clearEndTimer()
      this.endModal.visible = true
      this.endModal.secondsLeft = seconds
      this.endModal.payload = payload ?? null
      this.endModal.frozen = true
      this.endModal.timerId = window.setInterval(() => {
         if (this.endModal.secondsLeft <= 1) {
           this.gotoLobbyNow()
           return
         }
         this.endModal.secondsLeft--
       }, 1000)
     },
    closeEndModal() {
      if (this.endModal.frozen) return
      this._clearEndTimer()
      this.endModal.visible = false
      this.endModal.secondsLeft = 10
      this.endModal.payload = null
      this.endModal.frozen = false
    },
    gotoLobbyNow(payload?: any) {
      const p = payload ?? this.endModal.payload
      // Arrête le timer tout de suite pour éviter double-triggers
      this._clearEndTimer()
      this.endModal.visible = false

      const url = (() => {
        try {
          const u = new URL('/lobby', location.origin)
          if (p?.lobbyId) u.searchParams.set('lobbyId', String(p.lobbyId))
          return u.pathname + u.search
        } catch { return '/lobby' }
      })()

      // 1) replace() (évite certains blocages d’historique)
      try { window.location.replace(url) } catch {}
      // 2) fallback très robuste (pour Firefox strict/cas edge)
      setTimeout(() => {
        try { (window as any).location = url } catch {}
      }, 50)
    },
  },
})
