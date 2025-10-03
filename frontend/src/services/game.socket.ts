// src/services/game.socket.ts
import { io, Socket } from "socket.io-client"
import { getToken } from "@/services/auth"
import { useGameStore } from "@/stores/game"
import { useUiStore } from '@/stores/ui'
import { useStatsStore } from '@/stores/stats'
import { useRecentStore } from '@/stores/recent'

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

function requestPlayableIfMyTurn(s: Socket, game = useGameStore(), retryMs = 0) {
  if (!game.isPlayingPhase) return
  if (!game.mancheId || !game.joueurId) return
  if (game.currentTurnPlayerId !== game.joueurId) return

  s.emit("play:getPlayable", { mancheId: game.mancheId })

  // retry optionnel si pas de playable reçu
  if (retryMs > 0) {
    setTimeout(() => {
      if (!game.isPlayingPhase) return
      if (game.currentTurnPlayerId !== game.joueurId) return
      if (game.playableIds && game.playableIds.size > 0) return
      s.emit("play:getPlayable", { mancheId: game.mancheId })
    }, retryMs)
  }
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
  const nameOf = (jid: number) => game.seats.find(s => s.joueurId === jid)?.username || `J${jid}`
  const ui = useUiStore()

  s.on("connect", () => {/* noop */ })

  // === Entrée table ===
  s.on("joinedPartie", (p: any) => {
    game.joueurId = p.joueurId ?? game.joueurId
    game.mancheId = p.mancheId ?? game.mancheId
    game.mancheNumero = p.numero ?? game.mancheNumero
    game.lobbyNom = p.lobbyNom ?? game.lobbyNom
    game.resetBelote()
    ui.closeEndModal()
    // 🔁 réhydratation immédiate
    if (game.mancheId) s.emit('ui:rehydrate', { mancheId: game.mancheId })
  })

  // === Enchères ===
  s.on("bidding:state", (st: any) => {
    // reset le timer quand on (re)entre en enchères
    const game = useGameStore()
    if (!useUiStore().endModal.visible) useUiStore().closeEndModal()
    game.lastBidding = st
    game.isPlayingPhase = !!st?.preneurId
    if (st?.atout?.id) game.setAtout(st.atout.id)
    if (Array.isArray(st?.seats)) game.setSeats(st.seats)
    if (st?.joueurActuelId != null) game.setTurn(st.joueurActuelId)

    // 👇 clé : carte retournée visible tant qu'il n'y a pas de preneur
    game.returnedCard = (!st?.preneurId && st?.carteRetournee) ? st.carteRetournee : null

    if (!game.isPlayingPhase) game.setPlayable([])
    if (!game.isPlayingPhase && !game.returnedCard && game.mancheId) {
      setTimeout(() => {
        const g = useGameStore()
        if (!g.isPlayingPhase && !g.returnedCard && g.mancheId) {
          s.emit("ui:rehydrate", { mancheId: g.mancheId })
        }
      }, 150)
    }
  })

  s.on("bidding:ended", (p: any) => {
    if (!useUiStore().endModal.visible) useUiStore().closeEndModal()
    game.isPlayingPhase = true
    game.setAtout(p?.atoutId ?? null)
    game.returnedCard = null
    // la demande de playable sera déclenchée sur turn:state
  })
  // === Changement de manche (relance) ===
  s.on("manche:switched", (p: { oldMancheId: number; newMancheId: number; numero?: number }) => {
    const game = useGameStore()

    // Bascule d’ID/numéro de manche
    game.mancheId = p?.newMancheId ?? game.mancheId
    if (p?.numero != null) game.mancheNumero = p.numero

    // On revient explicitement en phase d’ENCHÈRES (pas de preneur)
    game.isPlayingPhase = false
    game.setAtout(null)
    game.returnedCard = null
    game.setPlayable([])
    game.setDeadline(null)
    game.resetBelote()

    // 👉 Demande un snapshot COMPLET de la NOUVELLE donne (doit renvoyer bidding:state + carteRetournee)
    if (game.mancheId) s.emit("ui:rehydrate", { mancheId: game.mancheId })
  })

  // === Belote ===
  s.on("belote:declared", (p: { joueurId: number }) => {
    const ui = useUiStore()                         // <-- crée ici
    game.markBelote(p.joueurId, "belote")
    ui.pushToast({ id: Date.now(), text: `🔔 Belote — ${nameOf(p.joueurId)}` })
  })

  s.on("belote:rebelote", (p: { joueurId: number }) => {
    const ui = useUiStore()                         // <-- et ici
    game.markBelote(p.joueurId, "rebelote")
    ui.pushToast({ id: Date.now() + 1, text: `🔔 Rebelote — ${nameOf(p.joueurId)}` })
  })
  s.on("belote:reset", () => game.resetBelote())

  // === Tour / timer ===
  s.on("turn:state", (p: { mancheId: number; joueurActuelId: number }) => {
    if (!useUiStore().endModal.visible) useUiStore().closeEndModal()
    if (game.mancheId && p.mancheId !== game.mancheId) return
    game.setTurn(p.joueurActuelId ?? null)

    if (!game.isPlayingPhase) {
      game.setPlayable([])
    } else {
      // 👉 à chaque nouveau tour : on demande si c’est à moi
      requestPlayableIfMyTurn(s, game, /*retry*/600)
    }
  })

  s.on("turn:deadline", (p: { deadlineTs: number; mancheId?: number; phase?: 'bidding' | 'play' }) => {
    const game = useGameStore()
    // si on nous envoie une deadline pour une autre manche, on ignore
    if (p?.mancheId && game.mancheId && p.mancheId !== game.mancheId) return

    const ts = typeof p?.deadlineTs === 'number' ? p.deadlineTs : Number(p?.deadlineTs)
    if (!Number.isFinite(ts)) return

    // garde la plus grande deadline (au cas où un reset tardif écraserait l'info)
    if (!game.deadlineTs || ts > game.deadlineTs) {
      game.setDeadline(ts)
    }
  })
  s.on("turn:timeout", () => { })
  s.on("manche:ended", () => game.setDeadline(null))
  s.on("donne:relancee", () => game.setDeadline(null))

  // === Main & jouables ===
  s.on("hand:state", (p: any) => {
    if (p.mancheId && game.mancheId !== p.mancheId) {
      game.mancheId = p.mancheId
      game.resetBelote()
    }
    if (p.mancheNumero != null) game.mancheNumero = p.mancheNumero
    game.setHand(p.cartes || [])

    // 👉 après réception de la main, redemande si c’est mon tour en phase de jeu
    requestPlayableIfMyTurn(s, game, /*retry*/500)
  })

  s.on("play:playable", (p: any) => {
    if (!game.isPlayingPhase) return
    game.setPlayable(extractPlayableIds(p))
  })

  // === Pli courant + dernier pli ===
  s.on("trick:state", (t: any) => {
  // Pli courant → on remplace uniquement le "trick" en cours
  const cards = Array.isArray(t?.cartes) ? t.cartes : []
  game.setTrick(cards)
})
  s.on("trick:closed", (p: any) => {
  // Chaque clôture de pli met à jour le "dernier pli"
  const cards = Array.isArray(p?.cartes) ? p.cartes : []
  game.setLastTrick(cards)
})

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
  s.on('game:over', (p: any) => {
    const recent = useRecentStore()
    console.log('[game:over] payload =', JSON.stringify(p, null, 2))
    // 1) sécurité : ne traiter que notre table si identifiant présent
    const sameTable = !p?.partieId || !game.partieId || Number(p.partieId) === Number(game.partieId)
    if (!sameTable) return

    // 2) Abandon => redirection immédiate
    const isAbandon =
      p?.reason === 'abandon' || p?.type === 'abandon' || p?.abandon === true || p?.wasAbandoned === true
    if (isAbandon) { ui.gotoLobbyNow(p); return }

    // 3) Fin normale => afficher modal + récap
    const payload = {
      winner: p?.winner ?? p?.vainqueur ?? null,
      finalScores: p?.finalScores ?? p?.scores ?? null,
      rounds: p?.rounds ?? p?.manches ?? null,
      lobbyId: p?.lobbyId,
      raw: p
    }
    try {
      const stats = useStatsStore()

      // équipe du joueur courant
      const mySeat = game.seats.find(s => s.joueurId === game.joueurId)?.seat
      const myTeam = mySeat == null ? 1 : (mySeat % 2 === 0 ? 1 : 2)

      // tente de déterminer l'équipe gagnante
      const winnerTeam =
        p?.winnerTeam ??
        p?.vainqueurTeam ??
        (typeof p?.winner === 'number' ? p.winner : undefined)

      let won: boolean | null = null

      if (winnerTeam === 1 || winnerTeam === 2) {
        won = (winnerTeam === myTeam)
      } else {
        // fallback: comparer les totaux si pas de champ winner* dans le payload
        const cum = p?.cumule ?? p?.total ?? p?.totals ?? p?.scoreFinal ?? null
        if (cum) {
          const t1 = Number(cum.team1 ?? cum.equipe1 ?? cum.t1 ?? 0)
          const t2 = Number(cum.team2 ?? cum.equipe2 ?? cum.t2 ?? 0)
          if (Number.isFinite(t1) && Number.isFinite(t2)) {
            const inferredWinner = t1 === t2 ? 0 : (t1 > t2 ? 1 : 2)
            if (inferredWinner) won = (inferredWinner === myTeam)
          }
        }
      }

      if (won !== null) {
        recent.recordResult({
          ts: Date.now(),
          won,
          partieId: game.partieId ?? undefined,
          lobbyId: p?.lobbyId ?? undefined,
        })
      }
    } catch { }
    if (!ui.endModal.visible) ui.openEndModal(10, p)

    // 4) Watchdog : si des events tardifs arrivent (turn/bidding), ne ferment pas le modal
    // (géré dans le store via .frozen)
  })
}

