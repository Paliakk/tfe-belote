// src/stores/session.ts
import { defineStore } from 'pinia'
import { getToken, login, logout } from '@/services/auth'
import { api } from '@/services/api'

type Me = { id: number; username: string; email?: string }

export const useSessionStore = defineStore('session', {
  state: () => ({
    joueurId: null as number | null,
    username: '' as string,
    email: '' as string,
    isReady: false,
  }),
  actions: {
    async ensureAuth() {
      try {
        const t = await getToken()
        return !!t
      } catch { return false }
    },
    async loadProfile() {
      try {
        const me = await api<Me>('/auth/me') // ← backend: retourne { id, username, email? }
        this.joueurId = me.id ?? null
        this.username = me.username ?? ''
        this.email = me.email ?? ''
        this.isReady = true
      } catch (e) {
        this.isReady = true
        throw e
      }
    },
    login(redirectTo?: string) { return login(redirectTo) },
    logout() { return logout() },
  },
})
