// src/services/game.socket.ts
import { io, Socket } from "socket.io-client"
import { getToken } from "@/services/auth"
import { useGameStore } from "@/stores/game"

let socket: Socket | null = null
let handlersAttached = false

export async function connectGameSocket(): Promise<Socket> {
  if (socket?.connected) return socket

  const [accessToken, idToken] = [
    await getToken().catch(() => undefined),
    sessionStorage.getItem("id_token") || undefined,
  ]

  socket = io(import.meta.env.VITE_API_WS ?? "http://localhost:3000", {
    transports: ["websocket"],
    autoConnect: true,
    reconnection: true,
    auth: { token: accessToken, id_token: idToken },
  })

  attachHandlersOnce(socket)

  if (!socket.connected) {
    await new Promise<void>((res, rej) => {
      socket!.once("connect", () => res())
      socket!.once("connect_error", e => rej(e))
    })
  }
  return socket
}

// 👇 Helper public : connexion + joinPartie en 1 appel
export async function connectAndJoin(partieId: number) {
  const s = await connectGameSocket()
  s.emit("joinPartie", { partieId })
}

// 👇 exposé pour les composants
export function getGameSocket(): Socket | null { return socket }

export function disconnectGameSocket() {
  try { socket?.disconnect() } catch { }
  socket = null
}

// --- petites utilités ---
function extractPlayableIds(payload: any): number[] {
  if (!payload) return []
  if (Array.isArray(payload.carteIds)) return payload.carteIds
  if (Array.isArray(payload.cardIds)) return payload.cardIds
  if (Array.isArray(payload.ids)) return payload.ids
  if (Array.isArray(payload.playable)) return payload.playable
  if (Array.isArray(payload.playables)) return payload.playables
  if (Array.isArray(payload.cartes)) return payload.cartes.map((c: any) => typeof c === 'number' ? c : c?.id).filter(Boolean)
  if (Array.isArray(payload.cards)) return payload.cards.map((c: any) => c?.id).filter(Boolean)
  return []
}

function requestPlayableIfMyTurn() {
  const s = socket
  const game = useGameStore()
  if (!s || !s.connected) return
  if (!game.isPlayingPhase) return
  if (!game.mancheId) return
  if (game.currentTurnPlayerId !== game.joueurId) return
  s.emit('play:getPlayable', { mancheId: game.mancheId })
}

// ✅ helpers “actions” appelables depuis les composants
export function placeBid(params: { type: 'pass' | 'take_card' | 'choose_color', couleurAtoutId?: number }) {
  const s = socket; const g = useGameStore()
  if (!s || !g.mancheId) return
  s.emit('bidding:place', { mancheId: g.mancheId, ...params })
}
export function playCard(carteId: number) {
  const s = socket; const g = useGameStore()
  if (!s || !g.mancheId) return
  s.emit('play:card', { mancheId: g.mancheId, carteId })
}

function attachHandlersOnce(s: Socket) {
  if (handlersAttached) return
  handlersAttached = true

  const game = useGameStore()

  // === Entrée table ===
  s.on("joinedPartie", (p: any) => {
    game.joueurId = p.joueurId ?? game.joueurId
    game.mancheId = p.mancheId ?? game.mancheId
    game.mancheNumero = p.numero ?? game.mancheNumero
    game.lobbyNom = p.lobbyNom ?? game.lobbyNom
    game.resetBelote()
    // 🔁 réhydratation immédiate
    if (game.mancheId) s.emit('ui:rehydrate', { mancheId: game.mancheId })
  })

  // === Enchères ===
  s.on("bidding:state", (st: any) => {
    game.lastBidding = st
    game.isPlayingPhase = !!st?.preneurId
    if (st?.atout?.id) game.setAtout(st.atout.id)
    if (Array.isArray(st?.seats)) game.setSeats(st.seats)
    if (st?.joueurActuelId != null) game.setTurn(st.joueurActuelId)
    // 👇 carte retournée visible tant qu'il n'y a PAS de preneur
    game.returnedCard = (!st?.preneurId && st?.carteRetournee) ? st.carteRetournee : null

    if (!game.isPlayingPhase) {
      game.setPlayable([])
    }
  })

  s.on("bidding:ended", (p: any) => {
    game.isPlayingPhase = true
    game.setAtout(p?.atoutId ?? null)
    game.returnedCard = null
    // la demande de playable sera déclenchée sur turn:state
  })

  // === Belote ===
  s.on("belote:declared", (p: { joueurId: number }) => game.markBelote(p.joueurId, "belote"))
  s.on("belote:rebelote", (p: { joueurId: number }) => game.markBelote(p.joueurId, "rebelote"))
  s.on("belote:reset", () => game.resetBelote())

  // === Tour / timer ===
  s.on("turn:state", (p: { mancheId: number; joueurActuelId: number; seats?: any[] }) => {
    if (game.mancheId && p.mancheId !== game.mancheId) return
    game.setTurn(p.joueurActuelId ?? null)
    if (Array.isArray(p?.seats)) game.setSeats(p.seats)

    if (!game.isPlayingPhase) game.setPlayable([])
    // 👇 si c'est mon tour en phase de JEU → demander les jouables
    requestPlayableIfMyTurn()
  })

  s.on("turn:deadline", (p: { deadlineTs: number }) => {
    // ensure it's a number
    const ts = typeof p?.deadlineTs === 'number' ? p.deadlineTs : Number(p?.deadlineTs)
    game.setDeadline(Number.isFinite(ts) ? ts : null)
  })
  s.on("turn:timeout", () => { /* toast UI coté composant si tu veux */ })
  s.on("manche:ended", () => game.setDeadline(null))
  s.on("donne:relancee", () => game.setDeadline(null))
  s.on("game:over", () => game.setDeadline(null))

  // === Main & jouables ===
  s.on("hand:state", (p: any) => {
    if (p.mancheId && game.mancheId !== p.mancheId) {
      game.mancheId = p.mancheId
      game.resetBelote()
    }
    if (p.mancheNumero != null) game.mancheNumero = p.mancheNumero
    game.setHand(p.cartes || [])
    // si c'est mon tour, on (re)demande au cas où
    requestPlayableIfMyTurn()
  })

  s.on("play:playable", (p: any) => {
    if (!game.isPlayingPhase) return
    game.setPlayable(extractPlayableIds(p))
  })

  // === Pli courant + dernier pli ===
  s.on("trick:state", (t: any) => { game.trick = Array.isArray(t?.cartes) ? t.cartes : [] })
  s.on("trick:closed", (p: any) => { game.lastTrick = Array.isArray(p?.cartes) ? p.cartes : [] })

  // === Scores ===
  s.on("score:live", (sco: { team1: number; team2: number }) => {
    game.scoreLive = { team1: sco?.team1 ?? 0, team2: sco?.team2 ?? 0 }
  })
  s.on("manche:ended", (end: any) => {
    if (end?.nextManche) {
      game.mancheId = end.nextManche.id
      game.mancheNumero = end.nextManche.numero
    }
    if (end?.cumule) game.totals = {
      team1: Number(end.cumule.team1 || 0),
      team2: Number(end.cumule.team2 || 0)
    }
  })

  // === Fin de partie ===
  s.on("game:over", () => {
    // Le composant de page s’occupera de router vers le lobby
  })
}
