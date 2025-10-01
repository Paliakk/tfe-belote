<template>
  <main class="min-h-dvh bg-slate-950 text-slate-100 p-4 sm:p-6">
    <div class="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      <!-- Header -->
      <header class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <div
            class="grid place-items-center w-10 h-10 rounded-full bg-white/10 border border-white/15"
          >
            <span class="font-semibold">{{ initials }}</span>
          </div>
          <div>
            <div class="font-medium">{{ displayName }}</div>
            <div class="text-sm text-slate-400">{{ sessionEmail || "—" }}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="px-3 py-2 rounded-lg font-semibold border border-white/15 bg-transparent text-slate-100 hover:bg-white/5"
            @click="$router.push('/')"
          >
            Accueil
          </button>
          <button
            class="px-3 py-2 rounded-lg font-semibold bg-slate-200 text-slate-900 hover:bg-slate-300"
            @click="signOut"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <!-- Actions -->
      <section
        class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 sm:p-4 space-y-4"
      >
        <!-- Rejoindre / Créer -->
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">Rejoindre ou créer</h2>
          <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              v-model="name"
              placeholder="Nom du lobby"
              class="px-3 py-2 rounded-lg border border-white/15 bg-white/5 outline-none placeholder:text-slate-400"
            />
            <button
              class="px-3 py-2 rounded-lg font-semibold bg-slate-200 text-slate-900 hover:bg-slate-300"
              @click="createLobbyInline"
            >
              Créer
            </button>
            <button
              class="px-3 py-2 rounded-lg font-semibold bg-slate-300 text-slate-900 hover:bg-slate-400"
              @click="joinByNameInline"
            >
              Rejoindre
            </button>
          </div>
        </div>

        <!-- Actions lobby + Notifications + Connexion -->
        <div class="grid gap-3 md:grid-cols-2">
          <div class="flex flex-wrap items-center gap-2">
            <button
              class="px-3 py-2 rounded-lg font-semibold border border-white/15 bg-transparent text-slate-100 hover:bg-white/5 disabled:opacity-50"
              :disabled="!lobbyId"
              @click="leaveLobby"
            >
              Quitter lobby
            </button>

            <button
              class="px-3 py-2 rounded-lg font-semibold bg-slate-200 text-slate-900 hover:bg-slate-300 disabled:opacity-50"
              :disabled="!canStart"
              @click="startGame"
            >
              ▶️ Lancer la partie
            </button>

            <div class="text-xs text-slate-400">
              hostId={{ lobby.hostId }} · me={{ session.joueurId }} · isHost={{
                isHost
              }}
              · membres={{ membres.length }}
            </div>

            <button
              class="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-200 text-slate-900 font-bold hover:bg-slate-300"
              @click="openStatsForMe"
            >
              📈 Mes stats
            </button>

            <div class="relative">
              <button
                class="px-3 py-2 rounded-lg font-semibold bg-slate-200 text-slate-900 hover:bg-slate-300"
                @click="toggleNotifications"
              >
                🔔 Notifications
                <span
                  v-show="unreadCount > 0"
                  class="absolute -top-2 -right-2 grid place-items-center w-5 h-5 rounded-full text-[11px] font-bold bg-rose-500 text-white"
                >
                  {{ unreadCount }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <small class="block text-slate-400">
          Ces actions utilisent le token Auth0 récupéré via <code>getToken()</code>.
        </small>
      </section>

      <!-- Grid principale -->
      <div class="grid grid-cols-1 lg:grid-cols-[1.2fr_.8fr] gap-4 sm:gap-6">
        <!-- Membres -->
        <section
          class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 sm:p-4"
        >
          <div class="flex items-baseline gap-2 mb-2">
            <h2 class="text-lg font-semibold">Membres du lobby</h2>
            <small class="text-slate-400" v-if="lobbyName">({{ lobbyName }})</small>
          </div>

          <ul>
            <li
              v-for="m in membres"
              :key="m.id"
              class="flex items-center justify-between py-2 border-b border-white/10 last:border-b-0"
            >
              <span>{{ m.username }}</span>
              <span
                class="inline-flex items-center px-2 py-1 text-sm font-semibold rounded-full bg-sky-500/90 text-white"
                >en ligne</span
              >
            </li>
            <li v-if="!membres.length" class="py-6 text-slate-400 text-sm">
              En attente de joueurs… Partagez votre lien d’invitation.
            </li>
          </ul>
        </section>

        <!-- Colonne droite -->
        <div class="space-y-4">
          <!-- Récents -->
          <section
            class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 sm:p-4"
          >
            <h2 class="text-lg font-semibold mb-2">Récents</h2>
            <ul class="divide-y divide-white/10">
              <li
                v-for="r in recents"
                :key="r.id"
                class="py-2 flex items-center justify-between"
              >
                <div class="text-slate-200">{{ r.name }}</div>
                <div class="flex gap-2">
                  <button
                    class="px-2.5 py-1.5 rounded-md font-semibold bg-slate-200 text-slate-900 hover:bg-slate-300"
                    @click="joinRecent(r)"
                  >
                    Rejoindre
                  </button>
                  <button
                    class="px-2.5 py-1.5 rounded-md font-semibold border border-white/15 bg-transparent text-slate-100 hover:bg-white/5"
                    @click="forgetRecent(r.id)"
                  >
                    Oublier
                  </button>
                </div>
              </li>
              <li v-if="!recents.length" class="py-2 text-slate-400 text-sm">
                Aucun historique
              </li>
            </ul>
          </section>

          <!-- Amis -->
          <aside
            class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 sm:p-4"
          >
            <h2 class="text-lg font-semibold mb-2">Amis</h2>
            <div class="flex gap-2 items-center mb-3">
              <input
                v-model="friendQuery"
                placeholder="Ajouter par username…"
                class="flex-1 px-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white outline-none placeholder:text-slate-400"
              />
              <button
                class="px-2.5 py-1.5 rounded-md font-semibold bg-slate-200 text-slate-900 hover:bg-slate-300"
                @click="addFriend"
              >
                Ajouter
              </button>
              <button
                class="px-2.5 py-1.5 rounded-md font-semibold border border-white/15 bg-transparent text-slate-100 hover:bg-white/5"
                title="Rafraîchir"
                @click="refreshFriends"
              >
                ↻
              </button>
            </div>

            <ul>
              <li
                v-for="f in friends"
                :key="f.id ?? f.username"
                class="flex items-center justify-between gap-2 py-2 border-b border-white/10 last:border-b-0"
              >
                <div class="flex items-center gap-2">
                  <span
                    :class="[
                      'inline-block w-2.5 h-2.5 rounded-full',
                      f.online ? 'bg-emerald-400' : 'bg-slate-400',
                    ]"
                  ></span>
                  <span>{{ f.username }}</span>
                  <span
                    v-if="f.inLobbyName"
                    class="px-2 py-0.5 rounded-full text-xs bg-white/10 border border-white/15"
                  >
                    Dans « {{ f.inLobbyName }} »
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    v-if="f.inLobbyId && f.inLobbyId !== lobbyId"
                    class="px-2.5 py-1.5 rounded-md font-semibold bg-slate-200 text-slate-900 hover:bg-slate-300"
                    @click="joinFriend(f)"
                  >
                    Rejoindre
                  </button>
                  <button
                    class="px-2.5 py-1.5 rounded-md font-semibold border border-white/15 bg-transparent text-slate-100 hover:bg-white/5"
                    @click="removeFriend(f.id)"
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </li>
              <li v-if="!friends.length" class="py-2 text-slate-400 text-sm">
                Aucun ami — ajoutez un username.
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </div>

    <!-- Notifications -->
    <NotificationsPanel
      :open="notifOpen"
      :items="notifications"
      @close="notifOpen = false"
      @markAll="markAllRead"
      @accepted="onNotifAccepted"
      @declined="onNotifDeclined"
    />

    <!-- Stats modal -->
    <StatsModal :open="statsOpen" :joueur-id="statsJoueurId" @close="statsOpen = false" />
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import NotificationsPanel from "@/components/NotificationsPanel.vue";
import StatsModal from "@/components/StatsModal.vue";
import { useSessionStore } from "@/stores/session";
import { useLobbyStore } from "@/stores/lobby";
import { api } from "@/services/api";
import { getToken } from "@/services/auth";
import { connectSocket } from "@/services/socket";

const router = useRouter();
const session = useSessionStore();
const lobby = useLobbyStore();
const isHost = computed(() => lobby.hostId != null && lobby.hostId === session.joueurId);
const canStart = computed(() => (membres.value?.length ?? 0) === 4 && isHost.value);

// ---- Header / session
const displayName = computed(() => session.username || "Utilisateur");
const initials = computed(() =>
  displayName.value
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
);
const sessionEmail = computed(() => session.email || session.username || "");

// ---- Toolbar inputs
const name = ref("");

// ---- UI state
const notifOpen = ref(false);
const statsOpen = ref(false);
const statsJoueurId = ref<number | null>(null);
const friendQuery = ref("");

// ---- Lobby derived
const membres = computed(() => lobby.membres ?? []);
const lobbyName = computed(() => lobby.lobbyName ?? "");
const lobbyId = computed(() => lobby.lobbyId ?? null);

// ---- Friends depuis le store (source de vérité)
const friends = computed(() => lobby.friendsComputed);

// Invite link
const inviteLink = computed(() =>
  lobbyId.value ? `${location.origin}/game/${lobbyId.value}` : `${location.origin}/lobby`
);

// ---- Notifications (placeholder)
const notifications = computed(() => lobby.notifications);
const unreadCount = computed(() => lobby.unreadNotificationsCount);

// ---- Connexion status
const wsUp = ref(false);
const ping = ref<number | null>(null);
const awaitedToken = ref<string | null>(null);
const tokenShort = computed(
  () => (awaitedToken.value ? awaitedToken.value.slice(0, 10) : "—") + "…"
);

// ---- Recents (localStorage)
type Recent = { id: number; name: string };
const recents = ref<Recent[]>(JSON.parse(localStorage.getItem("recents") || "[]"));
function saveRecent(item: Recent) {
  const x = [item, ...recents.value.filter((i) => i.id !== item.id)].slice(0, 5);
  recents.value = x;
  localStorage.setItem("recents", JSON.stringify(x));
}
async function joinRecent(r: Recent) {
  await lobby.joinLobbyByName(r.name);
}
function forgetRecent(id: number) {
  recents.value = recents.value.filter((i) => i.id !== id);
  localStorage.setItem("recents", JSON.stringify(recents.value));
}

// ---- Actions

async function createLobbyInline() {
  if (!name.value) return;
  await lobby.createLobby(name.value);
  if (lobby.lobbyId)
    saveRecent({ id: lobby.lobbyId, name: lobby.lobbyName || name.value });
}
async function joinByNameInline() {
  if (!name.value) return;
  await lobby.joinLobbyByName(name.value);
  // On sauvegarde dès qu’on reçoit le state (voir onMounted→handler) pour le vrai nom
}

async function signOut() {
  await session.logout();
  router.replace("/");
}

async function leaveLobby() {
  await lobby.leaveLobby().catch((e) => alert(e?.message ?? e));
}
async function startGame() {
  await lobby.startGame().catch((e) => alert(e?.message ?? e));
}

function openStatsForMe() {
  statsJoueurId.value = session.joueurId ?? 0;
  statsOpen.value = true;
}

// Notifications
function toggleNotifications() {
  notifOpen.value = !notifOpen.value;
  if (notifOpen.value) lobby.fetchNotifications();
}
async function markAllRead() {
  await lobby.markAllNotificationsRead();
}

// ---- Amis (HTTP + WS)

async function addFriend() {
  if (!friendQuery.value) return;
  try {
    await lobby.sendFriendRequest(friendQuery.value);
    friendQuery.value = "";
    alert("✅ Demande envoyée.");
  } catch (e: any) {
    alert("❌ " + (e?.message || "Erreur inconnue"));
  }
}
async function removeFriend(friendId: number) {
  try {
    await api(`/friends/${friendId}`, { method: "DELETE" });
    await lobby.fetchFriends(); // 🔁 refresh via store
  } catch {}
}
function refreshFriends() {
  lobby.fetchFriends();
}
async function onNotifAccepted(p: { id: number; requestId: number }) {
  try {
    await api(`/friends/requests/${p.requestId}/accept`, { method: "POST" });
    // refresh listes utiles
    await lobby.fetchFriends();
  } catch (e: any) {
    alert(e?.message || "Erreur: impossible d’accepter la demande.");
  }
}

async function onNotifDeclined(p: { id: number; requestId: number }) {
  try {
    await api(`/friends/requests/${p.requestId}/decline`, { method: "POST" });
  } catch (e: any) {
    alert(e?.message || "Erreur: impossible de refuser la demande.");
  }
}

// Rejoindre le lobby d'un ami (passe l'objet, pas l'ID)
async function joinFriend(f: { id: number; inLobbyId?: number | null }) {
  try {
    await lobby.joinFriendLobby(f as any);
  } catch (e: any) {
    alert(e?.message || "Impossible de rejoindre le lobby de cet ami.");
  }
}

// ---- Lifecycle
onMounted(async () => {
  const ok = await session.ensureAuth();
  if (!ok) return session.login("/lobby");
  try {
    await session.loadProfile();
  } catch {}

  // connect via store (une seule source de vérité)
  await lobby.connect();
  await lobby.fetchNotifications();
  
  // socket & indicateurs
  const s = (await import("@/services/socket")).getSocket()!;
  s.on('lobby:gameStarted', ({ partieId }: any) => router.push(`/game/${partieId}`));
  s.on('partie:started',    ({ partieId }: any) => router.push(`/game/${partieId}`));
  wsUp.value = !!s?.connected;
  s.on("connect", () => {
    wsUp.value = true;
  });
  s.on("disconnect", () => {
    wsUp.value = false;
  });

  // ping + attach + friends
  await lobby.restoreLastLobbyAttach();
  await lobby.fetchFriends();

  // si le serveur push la liste, on garde un refresh fiable
  s.on("friends:list", () => lobby.fetchFriends());
  s.on("friends:changed", () => lobby.fetchFriends());
  s.on("friend:accepted", () => lobby.fetchFriends());
  s.on("friend:removed", () => lobby.fetchFriends());

  // persist des récents quand le vrai state arrive
  lobby.onAny?.((event, payload: any) => {
    if (event === "lobby:state" && payload?.lobbyId) {
      const lname = payload?.lobbyName || "";
      localStorage.setItem("lastLobbyId", String(payload.lobbyId));
      const id = Number(payload.lobbyId);
      if (Number.isFinite(id)) {
        const name = lname || `Lobby ${id}`;
        const x = [{ id, name }, ...recents.value.filter((i) => i.id !== id)].slice(0, 5);
        recents.value = x;
        localStorage.setItem("recents", JSON.stringify(x));
      }
    }
  });
});
</script>
