// src/stores/lobby.ts
import { defineStore } from "pinia";
import { connectSocket, getSocket, on, emit } from "@/services/socket";
import { api } from "@/services/api";

type Friend = {
  id: number;
  username: string;
  online?: boolean;
  inLobbyId?: number | null;
  inLobbyName?: string | null;
};

function saveLastLobbyId(id?: number | null) {
  if (id && Number.isFinite(id)) localStorage.setItem("lastLobbyId", String(id));
}
function clearLastLobbyId(id?: number | null) {
  const cur = localStorage.getItem("lastLobbyId");
  if (!id || (cur && cur === String(id))) localStorage.removeItem("lastLobbyId");
}
function gotoGame(partieId: number) {
  if (!partieId) return;
  location.assign(`/game/${partieId}`);
}

export const useLobbyStore = defineStore("lobby", {
  state: () => ({
    lobbyId: null as number | null,
    lobbyName: "" as string,
    hostId: null as number | null,
    membres: [] as { id: number; username: string }[],
    friends: [] as Friend[],
    onlineSet: new Set<number>(),
    isHost: false as boolean,
    _handlersAttached: false,
    notifications: [] as {
      id: number;
      text: string;
      read: boolean;
      at: string;
      type?: string;
      data?: any;
    }[],

  }),
  getters: {
    friendsComputed(state): Friend[] {
      return state.friends.map(f => ({ ...f, online: state.onlineSet.has(f.id) }));
    },
    unreadNotificationsCount(state): number {
      return state.notifications.filter(n => !n.read).length;
    },
    isHost(state) {
      const sessionId = Number(sessionStorage.getItem('joueur_id')) || 0 // ou via un store session propre si dispo
      return state.hostId != null && state.hostId === sessionId
    },
  },
  actions: {
    async connect() {
      await connectSocket();
      this._attachWsHandlersOnce();
    },



    async sendFriendRequest(toUsername: string) {
      const username = (toUsername || "").trim();
      if (!username) throw new Error("Username requis");
      await api("/friends/requests", {
        method: "POST",
        json: { toUsername: username },   // ← ton backend attend { toUsername }
      });
      await this.fetchFriends();          // refresh la liste
      return true;
    },

    onAny(cb: (event: string, payload: any) => void) {
      const s = getSocket();
      s?.onAny((e, p) => cb(String(e), p));
    },

    async fetchFriends() {
      try {
        const list = await api<Friend[]>("/friends");
        this.friends = Array.isArray(list)
          ? list.map(f => ({
            ...f,
            inLobbyId: f.inLobbyId ?? null,
            inLobbyName: f.inLobbyName ?? null,
          }))
          : [];
      } catch {
        this.friends = [];
      }
    },

    async restoreLastLobbyAttach() {
      const s = getSocket();
      if (!s?.connected) return;
      const raw = localStorage.getItem("lastLobbyId");
      const last = raw ? Number(raw) : NaN;
      emit("lobby:attach", Number.isFinite(last) && last > 0 ? { lobbyId: last } : undefined);
    },
    
    _attachWsHandlersOnce() {
      if (this._handlersAttached) return;
      this._handlersAttached = true;

      // === Presence
      on("presence:snapshot", ({ online }) => {
        this.onlineSet = new Set(Array.isArray(online) ? online : []);
        this._touchFriends();
      });
      on("presence:changed", ({ userId, online }) => {
        if (online) this.onlineSet.add(userId); else this.onlineSet.delete(userId);
        this._touchFriends();
      });
      on("presence:lobbyChanged", ({ userId, inLobbyId, inLobbyName }) => {
        const i = this.friends.findIndex(f => f.id === userId);
        if (i !== -1) {
          this.friends[i] = {
            ...this.friends[i],
            inLobbyId: Number.isFinite(+inLobbyId) ? Number(inLobbyId) : null,
            inLobbyName: inLobbyName ?? null,
          };
          this._touchFriends();
        }
      });

      // === Friends
      on("friends:list", () => this.fetchFriends());
      on("friends:changed", () => this.fetchFriends());
      on("friend:accepted", () => this.fetchFriends());
      on('friend:accepted', () => this.fetchNotifications());
      on('friend:rejected', () => this.fetchNotifications());
      on("friend:removed", () => this.fetchFriends());
      on('friend:request', (_payload: any) => {
        // Une nouvelle demande vient d’arriver → recharge la liste
        this.fetchNotifications();
      });

      // === Lobby
      on("lobby:joined", ({ lobbyId }) => {
        this.lobbyId = lobbyId ?? null;
        if (this.lobbyId) saveLastLobbyId(this.lobbyId);
      });
      on("lobby:state", ({ lobbyId, lobbyName, membres, hostId }) => {
        this.lobbyId = lobbyId ?? null;
        this.lobbyName = lobbyName ?? "";
        this.hostId = hostId ?? null;
        this.membres = Array.isArray(membres) ? membres : [];
        if (this.lobbyId) saveLastLobbyId(this.lobbyId);
      });
      on("lobby:closed", ({ lobbyId }) => {
        clearLastLobbyId(lobbyId);
        if (this.lobbyId === lobbyId) {
          this.lobbyId = null; this.lobbyName = ""; this.membres = [];
        }
        this.friends = this.friends.map(f =>
          f.inLobbyId === lobbyId ? { ...f, inLobbyId: null, inLobbyName: null } : f
        );
      });
      on("lobby:gameStarted", ({ partieId }) => gotoGame(Number(partieId)));
      on("partie:started",   ({ partieId }) => gotoGame(Number(partieId)));

      // petit kick de sync au (re)boot
      const s = getSocket();
      if (s?.connected) {
        emit("friends:list");
        emit("presence:snapshot");
      }
    },

    _touchFriends() { this.friends = this.friends.slice(); },

    // === API UI
    async joinFriendLobby(friend: Friend) {
      const s = getSocket();
      if (!s?.connected) throw new Error("Socket non connecté");
      if (!friend?.inLobbyId) throw new Error("Cet ami n'est pas dans un lobby");
      return new Promise<void>((resolve, reject) => {
        emit("lobby:joinRoom", { lobbyId: friend.inLobbyId }, (res: any) => {
          if (res?.ok === false) return reject(new Error(res?.error || "joinRoom failed"));
          resolve();
        });
      });
    },

    async createLobby(name: string) {
      const s = getSocket();
      if (!s?.connected) throw new Error("Socket non connecté");
      return new Promise<void>((resolve, reject) => {
        emit("lobby:create", { nom: name }, (res: any) => {
          if (res?.lobbyId) {
            this.lobbyId = res.lobbyId;
            saveLastLobbyId(this.lobbyId);
            resolve();
          } else reject(new Error(res?.error || "Création échouée"));
        });
      });
    },

    async joinLobbyByName(name: string) {
      const s = getSocket();
      if (!s?.connected) throw new Error("Socket non connecté");
      emit("lobby:joinByName", { nom: name }); // 'lobby:state' confirmera et persistera
    },

    async leaveLobby() {
      const s = getSocket();
      if (!s?.connected || !this.lobbyId) return;
      const id = this.lobbyId;
      emit("lobby:leaveRoom", { lobbyId: id }, () => {
        clearLastLobbyId(id);
        this.lobbyId = null; this.lobbyName = ""; this.membres = [];
      });
    },

    async startGame() {
      const s = getSocket();
      if (!s || !s.connected) throw new Error("Socket non connecté");

      const id = Number(this.lobbyId);
      // ✅ Ack + fallback navigation
      return new Promise<void>((resolve, reject) => {
        emit("lobby:startGame",
          Number.isFinite(id) && id > 0
            ? { lobbyId: id, scoreMax: 301 }
            : { scoreMax: 301 },                         // backend reconstitue le lobby
          (res: any) => {
            if (res?.error) return reject(new Error(res.message || res.error));
            // si le serveur renvoie la partie dans l’ack, on route immédiatement
            const pid = res?.partie?.id || res?.partieId;
            if (pid) gotoGame(Number(pid));
            resolve();
          }
        );
      });
    },
    async fetchNotifications() {
      try {
        const rows = await api('/notifications');
        // adapte au shape renvoyé par ton backend
        this.notifications = (rows ?? []).map((r: any) => ({
          id: r.id,
          type: r.type,
          text: r.message ?? r.text,
          read: !!r.read,
          at: r.createdAt ?? r.at ?? new Date().toISOString(),
          createdAt: r.createdAt,
          data: r.data ?? null,
        }));
      } catch (e) {
        this.notifications = [];
      }
    },

    // Marquer lue
    async markNotificationRead(id: number) {
      try {
        await api(`/notifications/${id}/read`, { method: 'POST' });
        const n = this.notifications.find(n => n.id === id);
        if (n) n.read = true;
      } catch { }
    },

    // Tout marquer lu
    async markAllNotificationsRead() {
      try {
        await api('/notifications/read-all', { method: 'POST' });
        this.notifications.forEach(n => n.read = true);
      } catch { }
    },
  },
});
