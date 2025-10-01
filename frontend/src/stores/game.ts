// src/stores/game.ts
import { defineStore } from "pinia"

export type Carte = { id: number; valeur: string; couleurId: number }
export type Seat = { seat: number; joueurId: number; username: string }
export type PlayedCard = { ordre: number; joueurId: number; carte: Carte }

export const useGameStore = defineStore("game", {
  state: () => ({
    // identité / navigation
    partieId: null as number | null,
    mancheId: null as number | null,
    mancheNumero: null as number | null,
    lobbyNom: null as string | null,
    joueurId: null as number | null,

    // état jeu
    isPlayingPhase: false,
    atoutId: null as number | null,
    currentTurnPlayerId: null as number | null,
    deadlineTs: null as number | null,
    // state
    returnedCard: null as null | { id: number; valeur: string; couleurId: number },
    lastBidding: null as null | {
      mancheId: number
      joueurActuelId: number | null
      tourActuel: 1 | 2
      preneurId?: number | null
      atout?: { id: number; nom?: string } | null
    },
    seats: [] as { seat: number; joueurId: number; username: string }[],

    // mains & jouables
    myHand: [] as Carte[],
    playableIds: new Set<number>(),

    // sièges / équipes
    beloteByPlayer: new Map<number, "belote" | "rebelote">(),

    // plis & score
    trick: [] as PlayedCard[],
    lastTrick: [] as PlayedCard[],
    scoreLive: { team1: 0, team2: 0 },
    totals: { team1: 0, team2: 0 },

  }),
  getters: {
    mySeatIdx(state) {
      if (!state.joueurId) return null
      return state.seats.find(s => s.joueurId === state.joueurId)?.seat ?? null
    },
    isMyTurn(state): boolean {
      return !!state.joueurId && state.currentTurnPlayerId === state.joueurId
    },
    isMyBiddingTurn(state): boolean {
      return !state.isPlayingPhase &&
        !!state.joueurId &&
        state.lastBidding?.joueurActuelId === state.joueurId
    },
    biddingOpen(state): boolean {
      return !state.isPlayingPhase && !state.lastBidding?.preneurId
    },
    itsMyTurn(state) { return !!state.currentTurnPlayerId && state.currentTurnPlayerId === state.joueurId },
    canPass(state): boolean {
      return !state.lastBidding?.preneurId &&
        !!state.joueurId &&
        state.lastBidding?.joueurActuelId === state.joueurId
    },

    canTake(state): boolean {
      return !state.lastBidding?.preneurId &&
        !!state.joueurId &&
        state.lastBidding?.joueurActuelId === state.joueurId &&
        state.lastBidding?.tourActuel === 1
    },

    canChoose(state): boolean {
      return !state.lastBidding?.preneurId &&
        !!state.joueurId &&
        state.lastBidding?.joueurActuelId === state.joueurId &&
        state.lastBidding?.tourActuel === 2
    },
  },
  actions: {
    setSeats(seats: Seat[] | null | undefined) {
      if (Array.isArray(seats) && seats.length === 4) {
        this.seats = seats.slice().sort((a, b) => a.seat - b.seat)
      }
    },
    setHand(cards: Carte[]) { this.myHand = Array.isArray(cards) ? cards : [] },
    setPlayable(ids: number[]) { this.playableIds = new Set(Array.isArray(ids) ? ids : []) },
    setDeadline(ts: number | null) { this.deadlineTs = ts },
    setTurn(joueurId: number | null) { this.currentTurnPlayerId = joueurId },
    setAtout(id: number | null) { this.atoutId = id },
    markBelote(jid: number, type: "belote" | "rebelote") { this.beloteByPlayer.set(jid, type) },
    resetBelote() { this.beloteByPlayer.clear() },
    async wireSocketEvents() {
      const { getGameSocket } = await import('@/services/game.socket')
      const socket = getGameSocket()
      if (!socket) return;

      // joinedPartie -> on demande la rehydratation complète
      socket.on('joinedPartie', (p: any) => {
        this.joueurId = p?.joueurId ?? this.joueurId
        this.mancheId = p?.mancheId ?? this.mancheId
        this.mancheNumero = p?.numero ?? this.mancheNumero
        this.lobbyNom = p?.lobbyNom ?? this.lobbyNom
        if (this.mancheId) socket.emit('ui:rehydrate', { mancheId: this.mancheId })
      })

      // --- ENCHÈRES ---
      socket.on('bidding:state', (p: any) => {
        // phase
        this.isPlayingPhase = !!p?.preneurId
        this.lastBidding = {
          mancheId: p.mancheId,
          joueurActuelId: p.joueurActuelId ?? null,
          tourActuel: p.tourActuel as 1 | 2,
          preneurId: p.preneurId ?? null,
          atout: p.atout ?? null,
        }
        this.currentTurnPlayerId = p.joueurActuelId ?? null

        // seats si fournis
        if (Array.isArray(p?.seats)) this.setSeats(p.seats)

        // atout + carte retournée (visible seulement tant que pas de preneur)
        this.atoutId = p?.atout?.id ?? null
        this.returnedCard = (!p?.preneurId && p?.carteRetournee) ? p.carteRetournee : null

        // en phase d'enchères, on grise la main
        if (!this.isPlayingPhase) this.setPlayable([])
      })

      socket.on('bidding:ended', (p: any) => {
        this.isPlayingPhase = true
        this.atoutId = p?.atoutId ?? null
        this.returnedCard = null
        // le serveur enverra ensuite turn:state + play:playable
      })

      // --- TOUR / JEU ---
      socket.on('turn:state', (p: any) => {
        if (p?.mancheId && this.mancheId && p.mancheId !== this.mancheId) return
        this.setTurn(p?.joueurActuelId ?? null)
        if (Array.isArray(p?.seats)) this.setSeats(p.seats)
        // si ce n'est pas mon tour → griser
        if (!this.isPlayingPhase || !this.isMyTurn) this.setPlayable([])
      })

      socket.on('play:playable', (p: any) => {
        if (!this.isPlayingPhase) return
        const ids = Array.isArray(p?.carteIds) ? p.carteIds
          : Array.isArray(p?.cards) ? p.cards.map((c: any) => c.id)
            : Array.isArray(p?.cartes) ? p.cartes.map((c: any) => c.id)
              : []
        this.setPlayable(ids)
      })

      socket.on('hand:state', (p: any) => {
        if (typeof p?.mancheId === 'number') this.mancheId = p.mancheId
        if (typeof p?.mancheNumero === 'number') this.mancheNumero = p.mancheNumero
        this.setHand(Array.isArray(p?.cartes) ? p.cartes : [])
      })

      // (optionnel) belote visuel
      socket.on('belote:declared', (p: any) => this.markBelote(p.joueurId, 'belote'))
      socket.on('belote:rebelote', (p: any) => this.markBelote(p.joueurId, 'rebelote'))
      socket.on('belote:reset', () => this.resetBelote())
    }
  }
})

