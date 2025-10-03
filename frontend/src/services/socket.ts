// src/services/socket.ts
import { io, Socket } from "socket.io-client";
import { getToken } from "./auth";

let socket: Socket | null = null;
let handlersAttached = false;

function wsUrl() {
  const fromEnv = import.meta.env.VITE_API_WS as string | undefined
  if (fromEnv) return fromEnv
  // fallback: dérive du BASE
  const base = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000'
  return base.replace(/^http/i, 'ws')
}

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  // Récupère les tokens AVANT la construction (handshake auth)
  const accessToken = await getToken().catch(() => undefined);
  const idToken = sessionStorage.getItem("id_token") || undefined;

  if (!socket) {
    socket = io(wsUrl(), {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      auth: { token: accessToken, id_token: idToken },
    });

    socket.on("connect_error", (err) => {
      console.error("[WS] connect_error:", err?.message || err);
    });

    // (re)attache au lobby courant quand la connexion s’établit
    socket.on("connect", () => {
      tryAttachLastLobby();
      // annonce présence + snapshots initiaux
      socket!.emit("presence:hello");
      socket!.emit("presence:snapshot");
      socket!.emit("friends:list");
    });

    // Dispatch global (utile si on veut écouter même après rejoin)
    socket.onAny((event, payload) => {
      window.dispatchEvent(new CustomEvent("ws:any", { detail: { event, payload } }));
    });
  } else {
    // Mets à jour l’auth si on relance connectSocket()
    socket.auth = { token: accessToken, id_token: idToken };
  }

  if (!socket.connected) {
    await new Promise<void>((resolve, reject) => {
      socket!.once("connect", () => resolve());
      socket!.once("connect_error", (e) => reject(e));
      socket!.connect();
    });
  }

  // Handlers communs (une seule fois)
  if (!handlersAttached) handlersAttached = true;

  return socket!;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnect() {
  socket?.disconnect();
}

// Souscriptions safe
export function on(event: string, cb: (p: any) => void) {
  socket?.on(event, cb);
  // fallback si reconnect avec nouvelle instance/écouteurs
  const handler = (e: any) => {
    if (e?.detail?.event === event) cb(e.detail.payload);
  };
  window.addEventListener("ws:any", handler);
}

export function emit(event: string, payload?: any, ack?: (res: any) => void) {
  socket?.emit(event, payload, ack);
}

function tryAttachLastLobby() {
  if (!socket?.connected) return;
  const raw = localStorage.getItem("lastLobbyId");
  const last = raw ? Number(raw) : NaN;
  if (Number.isFinite(last) && last > 0) {
    socket.emit("lobby:attach", { lobbyId: last });
  } else {
    socket.emit("lobby:attach");
  }
}
