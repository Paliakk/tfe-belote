// ---- Auth0 bootstrap for the lobby (ensures we are logged in) ----
(async () => {
  const domain = 'dev-ic6hqtbqegunpxep.eu.auth0.com';
  const clientId = 'WcIzHufRw5OJnrCiXWPknSJHUwzWOL05';
  const audience = 'https://belote-api';
  const redirectUri = new URL('/backend/index.html', window.location.origin).href;

  const auth0Client = await auth0.createAuth0Client({
    domain, clientId,
    authorizationParams: { audience, redirect_uri: redirectUri, scope: 'openid profile email' },
    cacheLocation: 'localstorage',
    useRefreshTokens: true
  });
  window.isJoueurOnline = function (joueurId) {
    // Si notificationManager existe et a accès au realtimeService
    if (notificationManager && notificationManager.socket) {
      // Vous devrez peut-être exposer une méthode pour ça
      return false; // Temporaire - voir solution complète ci-dessous
    }
    return false;
  };

  // Not logged in? go to login
  if (!(await auth0Client.isAuthenticated())) {
    location.replace('/backend/index.html');
    return;
  }
  // Token for WS + show user
  try {
    const token = await auth0Client.getTokenSilently({ authorizationParams: { audience } });
    const idClaims = await auth0Client.getIdTokenClaims();
    const idToken = idClaims?.__raw;
    sessionStorage.setItem('auth_token', token);
    fetch('http://localhost:3000/auth/me', {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem('auth_token')}`,
        'X-ID-Token': sessionStorage.getItem('id_token') || ''
      }
    }).catch(() => { })
    if (idToken) sessionStorage.setItem('id_token', idToken)
    const at = sessionStorage.getItem('auth_token');
    console.log(JSON.parse(atob(at.split('.')[1])));
    console.log(JSON.parse(atob(idToken.split('.')[1])));
  } catch (e) {
    console.error('[auth0] token', e);
    location.replace('/backend/index.html');
    return;
  }

  try {
    const profile = await auth0Client.getUser();
    document.getElementById('user-email').textContent = profile?.email || profile?.name || '';
  } catch { }

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    auth0Client.logout({ logoutParams: { returnTo: new URL('/backend/index.html', location.origin).href } });
  });
  document.getElementById('btn-notifications')?.addEventListener('click', () => {
    if (!notificationManager) {
      console.warn('🔔 Notifications: socket non connecté ou manager pas prêt.');
      return;
    }
    notificationManager.togglePanel();
  })
})();

// ---- Fonctions globales pour les notifications ----

async function apiPost(url, data = {}) {
  try {
    const token = sessionStorage.getItem('auth_token');
    const response = await fetch(`http://localhost:3000${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error('API error:', error);
    throw error;
  }
}
async function removeFriend(friendId) {
  try {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch(`http://localhost:3000/friends/${friendId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      // MAJ optimiste (l’event serveur arrivera aussi)
      if (Array.isArray(friendsCache)) {
        friendsCache = friendsCache.filter(f => f.id !== Number(friendId));
        renderFriends(friendsCache);
      } else {
        loadFriends();
      }
    }
  } catch (e) {
    console.error('[friends] removeFriend error', e);
  }
}
async function acceptFriendRequest(requestId) {
  try {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch(`http://localhost:3000/friends/requests/${requestId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      notificationManager?.markLocalAsReadByRequestId(requestId); // badge instantané
      loadFriends();                                              // 👈 optimiste côté receveur
    }
  } catch (e) {
    console.error('acceptFriendRequest error', e);
  }
}

async function declineFriendRequest(requestId) {
  const token = sessionStorage.getItem('auth_token');
  const r = await fetch(`http://localhost:3000/friends/requests/${requestId}/decline`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  if (r.ok) {
    notificationManager?.markLocalAsReadByRequestId(requestId); // UI instant
  }
}

async function loadNotifications() {
  try {
    const token = sessionStorage.getItem('auth_token');
    const response = await fetch('http://localhost:3000/notifications', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const notifications = await response.json();
      renderNotifications(notifications);
    }
  } catch (error) {
    console.error('Erreur chargement notifications:', error);
  }
}

function renderNotifications(notifications) {
  console.log('🔍 RENDER CALLED with notifications:', notifications.length)
  const container = document.getElementById('notifications-container');
  if (!container) return;

  container.innerHTML = notifications.map(notif => `
    <div class="notification ${notif.read ? 'read' : 'unread'}" data-id="${notif.id}">
      <div class="notification-content">${notif.message}</div>
      <div class="notification-time">${new Date(notif.createdAt).toLocaleTimeString()}</div>
      
      ${!notif.read && notif.type === 'FRIEND_REQUEST' ? `
        <div style="margin-top: 8px;">
          <button class="btn btn-small" onclick="acceptFriendRequest(${notif.data.requestId})">
            ✅ Accepter
          </button>
          <button class="btn btn-small" onclick="declineFriendRequest(${notif.data.requestId})">
            ❌ Refuser
          </button>
          <button class="btn btn-small" onclick="notificationManager.markAsRead(${notif.id})">
            📌 Marquer lu
          </button>
        </div>
      ` : !notif.read ? `
        <div style="margin-top: 8px;">
          <button class="btn btn-small" onclick="notificationManager.markAsRead(${notif.id})">
            Marquer lu
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

// ---- Classe NotificationManager ----

class NotificationManager {
  constructor(socket) {
    this.socket = socket;
    this.unreadCount = 0;
    this.notifications = [];
    this.setupSocketListeners();
    this.loadManagerNotifications();
  }

  setupSocketListeners() {
    this.socket.on('notification:new', (notification) => {
      this.addNotification(notification);
      this.showToast(notification.message);
      this.updateBadge();
    });

    this.socket.on('friend:request', (request) => {
      this.showFriendRequestToast(request);
    });

  }
  renderManagerNotifications() {
    renderNotifications(this.notifications);
  }
  async loadManagerNotifications() {
    try {
      const token = sessionStorage.getItem('auth_token');
      const response = await fetch('http://localhost:3000/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        this.notifications = await response.json();
        renderNotifications(this.notifications); // ← Utilisez la fonction globale
        this.updateBadge();
      }
    } catch (error) {
      console.error('Erreur chargement notifications manager:', error);
    }
  }


  async markAsRead(notificationId) {
    try {
      const token = sessionStorage.getItem('auth_token');
      const response = await fetch(`http://localhost:3000/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const notif = this.notifications.find(n => n.id === notificationId);
        if (notif) notif.read = true;
        this.renderManagerNotifications();
        this.updateBadge();
      }
    } catch (error) {
      console.error('Erreur marquer comme lu:', error);
    }
  }
  markLocalAsReadByRequestId(requestId) {
    if (!this.notifications?.length) return;
    let changed = false;
    this.notifications = this.notifications.map(n => {
      const isThis = n?.type === 'FRIEND_REQUEST' && n?.data?.requestId === requestId;
      if (isThis && !n.read) { changed = true; return { ...n, read: true }; }
      return n;
    });
    if (changed) { renderNotifications(this.notifications); this.updateBadge(); }
  }

  async markAllAsRead() {
    try {
      const token = sessionStorage.getItem('auth_token');
      const response = await fetch('http://localhost:3000/notifications/read-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        this.notifications.forEach(notif => notif.read = true);
        this.renderManagerNotifications();
        this.updateBadge();
      }
    } catch (error) {
      console.error('Erreur tout marquer comme lu:', error);
    }
  }

  addNotification(notification) {
    this.notifications.unshift(notification);
    renderNotifications(this.notifications); // ← Utilisez la fonction globale
  }

  updateBadge() {
    this.unreadCount = this.notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notification-badge');
    if (badge) {
      badge.textContent = this.unreadCount > 0 ? this.unreadCount : '';
      badge.style.display = this.unreadCount > 0 ? 'block' : 'none';
    }
  }

  showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  showFriendRequestToast(request) {
    this.showToast(`Nouvelle demande d'ami de ${request.fromUsername}`);
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'À l\'instant';
    if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)} h`;

    return date.toLocaleDateString();
  }

  togglePanel() {
    const panel = document.getElementById('notifications-panel');
    const backdrop = document.getElementById('notifications-backdrop');
    if (!panel || !backdrop) return;

    const isHidden = getComputedStyle(panel).display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    backdrop.style.display = isHidden ? 'block' : 'none';

    if (isHidden) {
      // rafraîchir quand on ouvre
      this.loadManagerNotifications();

      // fermer en cliquant dehors
      backdrop.onclick = () => this.togglePanel();

      // fermer avec Échap
      this._escHandler = (e) => { if (e.key === 'Escape') this.togglePanel(); };
      document.addEventListener('keydown', this._escHandler);
    } else {
      backdrop.onclick = null;
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
    }
  }

}

function initNotifications(socket) {
  return new NotificationManager(socket);
}

// ---- WS lobby logic ----
let socket;
let currentLobbyId = null;
let notificationManager;
let friendsCache = [];
let onlineSet = new Set();

const q = (sel) => document.querySelector(sel);
const logEl = () => q('#log');
const listEl = () => q('#membres-list');
const elPending = () => document.querySelector('#pending-requests');

function renderPending(list = []) {
  const el = elPending();
  if (!el) return;
  el.innerHTML = '';
  if (!list.length) {
    el.innerHTML = '<li><em>Aucune demande</em></li>';
    return;
  }
  list.forEach(r => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.gap = '8px';
    li.style.alignItems = 'center';
    li.innerHTML = `
      <span><strong>${r.from.username}</strong> vous a envoyé une demande</span>
      <button data-id="${r.id}" class="btn btn-accept">Accepter</button>
    `;
    el.appendChild(li);
  });

  el.querySelectorAll('.btn-accept').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      try {
        await apiPost(`/friends/requests/${id}/accept`);
        await Promise.all([loadFriends(), loadPending()]);
      } catch (e) {
        console.error('[friends] accept error', e);
        alert('Erreur lors de l\'acceptation');
      }
    });
  });
}

function log(msg) {
  const s = (typeof msg === 'string') ? msg : JSON.stringify(msg);
  logEl().textContent += s + '\n';
  console.log(msg);
}

function clearLogs() { logEl().textContent = ''; }

function renderMembers(membres = []) {
  const el = listEl();
  if (!el) return;
  el.innerHTML = '';

  membres.forEach(m => {
    const li = document.createElement('li');
    li.className = 'member-row';
    li.innerHTML = `
      <span>${(m?.username ?? '').toString()}</span>
      <button class="btn btn-small btn-stats" data-id="${m?.id}">📈 Stats</button>
    `;
    el.appendChild(li);
  });

  // branche les handlers après rendu
  el.querySelectorAll('.btn-stats').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.getAttribute('data-id'));
      if (!Number.isFinite(id)) return;
      openStatsFor(id);
    });
  });
}

// ==== Friends UI helpers ====
const friendsEls = {
  list: () => document.getElementById('friends-list'),
  refreshBtn: () => document.getElementById('btn-friends-refresh'),
  addBtn: () => document.getElementById('btn-friends-add'),
  input: () => document.getElementById('friend-username'),
};

function renderFriends(friends) {
  try {
    const root = friendsEls.list && friendsEls.list();
    if (!root) return; // pas d'élément sur cette page

    // Normalisation des données
    const list = Array.isArray(friends) ? friends : Array.isArray(friendsCache) ? friendsCache : [];
    root.innerHTML = '';

    if (list.length === 0) {
      root.innerHTML = '<li style="opacity:.8">Aucun ami pour le moment.</li>';
      return;
    }
    // Rendu
    for (const f of list) {
      const online = !!(typeof onlineSet !== 'undefined' && onlineSet instanceof Set && onlineSet.has(f.id));
      const friendLobbyId = idOrNull(f?.inLobbyId);
      const effectiveLobbyId =
        idOrNull(typeof currentLobbyId !== 'undefined' ? currentLobbyId : null) ??
        idOrNull(localStorage.getItem('lastLobbyId'));
      const sameLobby = (effectiveLobbyId != null) && (friendLobbyId != null) && (effectiveLobbyId === friendLobbyId);
      const canJoin = online && (friendLobbyId != null) && !sameLobby;

      const li = document.createElement('li');
      li.className = 'friend';
      li.innerHTML = `
  <div style="display:flex;align-items:center;gap:8px">
    <span class="dot ${online ? 'ok' : ''}"></span>
    <strong>${escapeHtml(f.username)}</strong>
    ${friendLobbyId != null && f.inLobbyName ? `<span class="pill">Dans « ${escapeHtml(f.inLobbyName)} »</span>` : ''}
  </div>
  <div style="display:flex;gap:6px">
    ${canJoin ? `<button class="btn btn-join" data-lobby="${friendLobbyId}">Rejoindre</button>` : ''}
    <button class="btn btn-remove" data-id="${f.id}" title="Supprimer cet ami">🗑️</button>
  </div>
`;
      root.appendChild(li);
    }

    // (Re)brancher les boutons Rejoindre
    root.querySelectorAll('.btn-join').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = idOrNull(btn.getAttribute('data-lobby'));
        if (id == null) return;
        if (!socket?.connected) return log('⚠️ Non connecté au WS');
        btn.disabled = true;
        socket.emit('lobby:joinRoom', { lobbyId: id });
        log(`🔹 Emit lobby:joinRoom { lobbyId: ${id} }`);
      });
    });
    root.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const friendId = Number(btn.getAttribute('data-id'));
        if (!Number.isFinite(friendId)) return;
        if (!confirm('Supprimer cet ami ?')) return;

        try {
          btn.disabled = true;
          const token = sessionStorage.getItem('auth_token');
          const res = await fetch(`http://localhost:3000/friends/${friendId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (!res.ok || !data?.ok) throw new Error('Unfriend failed');

          // Retire localement l’ami et re-render
          friendsCache = friendsCache.filter(f => f.id !== friendId);
          renderFriends(friendsCache);
          log(`👥 Ami ${friendId} supprimé`);

        } catch (e) {
          console.error('[friends] remove', e);
          alert('Impossible de supprimer cet ami pour le moment.');
          btn.disabled = false;
        }
      });
    })

    const stamp = document.getElementById('friends-last-refresh');
    if (stamp) stamp.textContent = `MAJ: ${new Date().toLocaleTimeString()}`;

    // Logs de debug utiles (à retirer si tu veux)
    // console.debug('[friends] render', { effectiveLobbyId, count: list.length });

  } catch (e) {
    console.error('[renderFriends] error:', e);
    try {
      const root = friendsEls.list && friendsEls.list();
      if (root) root.innerHTML = '<li style="opacity:.8">Erreur d’affichage</li>';
    } catch { }
  }
}
function idOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

async function loadFriends() {
  try {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch('http://localhost:3000/friends', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    renderFriends(data);
  } catch (e) {
    console.error('[friends] loadFriends', e);
    renderFriends([]);
  }
}
// Utilitaires
function openStatsFor(id) {
  // Avant : window.open('/stats.html?id=...', '_blank')
  if (window.StatsModal && id) {
    window.StatsModal.open(Number(id));
  } else {
    alert('StatsModal indisponible.');
  }
}

// 1) Qui suis-je ? (joueurId)
async function fetchWhoAmI() {
  const headers = {};
  const t = sessionStorage.getItem('auth_token');
  const idt = sessionStorage.getItem('id_token') || '';
  if (t) headers.Authorization = 'Bearer ' + t;
  if (idt) headers['X-ID-Token'] = idt; // même header que tu utilises au boot
  const res = await fetch('http://localhost:3000/auth/me', { headers });
  if (!res.ok) throw new Error('whoami failed');
  return res.json(); // { id, username }
}

// Bouton "Mes stats"
document.getElementById('btn-my-stats')?.addEventListener('click', async () => {
  try {
    // essaie en priorité un ID déjà mémorisé
    let meId = Number(sessionStorage.getItem('me_id') || '0');
    if (!meId) {
      const me = await fetchWhoAmI();
      meId = Number(me?.id || 0);
      if (meId) sessionStorage.setItem('me_id', String(meId));
    }
    if (!meId) return alert('Impossible de déterminer votre identifiant joueur.');
    openStatsFor(meId);
  } catch (e) {
    console.error(e);
    alert('Erreur pour récupérer votre identifiant joueur.');
  }
});

// Boutons UI
friendsEls.refreshBtn()?.addEventListener('click', () => {
  requestFriends();
})
friendsEls.addBtn()?.addEventListener('click', async () => {
  const username = friendsEls.input()?.value?.trim();
  if (!username) return;
  try {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch('http://localhost:3000/friends/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ toUsername: username }),
    });
    const data = await res.json();
    log(`👥 Demande: ${JSON.stringify(data)}`);
    await loadFriends();
  } catch (e) {
    console.error('[friends] sendRequest', e);
  }
});
let friendsTimer = null;

function requestFriends() {
  if (socket?.connected) {
    socket.emit('friends:list'); // le serveur renverra 'friends:list' avec la data
  }
}
function cleanupFriendsLobby(lobbyId) {
  if (!lobbyId || !Array.isArray(friendsCache) || friendsCache.length === 0) return;
  let changed = false;
  friendsCache = friendsCache.map(f => {
    if (f.inLobbyId === lobbyId) {
      changed = true;
      return { ...f, inLobbyId: null, inLobbyName: null };
    }
    return f;
  });
  if (changed) renderFriends(friendsCache);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // onglet caché → on stoppe le polling
    stopFriendsAutoRefresh();
  } else {
    // onglet re-visible → on relance si connecté et on force un refresh immédiat
    if (socket?.connected) {
      requestFriends();
      startFriendsAutoRefresh(10000);
    }
  }
})

function attachSocketHandlers() {
  notificationManager = initNotifications(socket);
  socket.on('connect', async () => {
    log('✅ Connecté au serveur WS');
    socket.emit('presence:hello');
    socket.emit('presence:snapshot')
    socket.on('presence:snapshot', ({ online }) => {
      onlineSet = new Set(Array.isArray(online) ? online : []);
      renderFriends(friendsCache);
    })
    loadNotifications();
    socket.emit('friends:list'); // si tu en as besoin pour initialiser la carte
    loadFriends()
    socket.emit('friends:list');
    // 1) attach sur le lobby mémorisé si dispo...
    const last = parseInt(localStorage.getItem('lastLobbyId') || '', 10);
    if (!Number.isNaN(last)) {
      socket.emit('lobby:attach', { lobbyId: last });
      log(`↩️ attach lobby-${last} après refresh`);
    } else {
      // ...sinon, auto-détection côté serveur
      socket.emit('lobby:attach');
      log('↩️ attach (auto) après refresh');
    }




    // Render si on a déjà la liste (sinon ce sera rendu à la réception de 'friends:list')
    if (friendsCache.length) renderFriends(friendsCache);

    // notifications etc.
    loadNotifications();
  });

  socket.on('connect_error', err => log('❌ Erreur connexion : ' + err.message));
  socket.on('disconnect', r => {
    log('⚠️ disconnect ' + r);
    stopFriendsAutoRefresh();
  })
  socket.on('friend:accepted', () => {
    loadFriends(); // les deux côtés rechargent leur liste
  });
  socket.on('friend:removed', ({ userId }) => {
    // MAJ optimiste du cache + UI
    if (Array.isArray(friendsCache)) {
      const before = friendsCache.length;
      friendsCache = friendsCache.filter(f => f.id !== Number(userId));
      if (friendsCache.length !== before) {
        renderFriends(friendsCache);
        return;
      }
    }
    // fallback si pas de cache ou désync
    loadFriends();
  })
  socket.on('notification:read', ({ requestId }) => {
    notificationManager?.markLocalAsReadByRequestId(requestId);
  });

  socket.on('lobby:joined', ({ lobbyId }) => {
    currentLobbyId = lobbyId;
    if (lobbyId != null) localStorage.setItem('lastLobbyId', String(lobbyId));
    log(`🎉 Lobby rejoint avec ID: ${currentLobbyId}`);
    renderFriends(friendsCache)
  })

  socket.on('lobby:state', ({ lobbyId, lobbyName, membres }) => {
    log(`📦 State lobby ${lobbyId} — ${membres.length} membre(s)`);
    currentLobbyId = lobbyId;
    localStorage.setItem('lastLobbyId', String(lobbyId));

    // 👇 affiche le nom si présent
    const nameEl = document.getElementById('lobby-name');
    if (nameEl) nameEl.textContent = lobbyName ? `— « ${lobbyName} »` : '';

    renderMembers(membres)
    renderFriends(friendsCache);
  })
  socket.on('friends:changed', (p) => {
    console.log('[ws] friends:changed', p);
    // recharge la liste de façon fiable
    loadFriends();
  })
  socket.on('lobby:update', ({ lobbyId, type, joueur }) => {
    log(`📢 ${type === 'join' ? '➕' : '➖'} ${joueur} (${type}) dans lobby ${lobbyId}`);
  });

  socket.on('lobby:closed', (payload) => {
    const lobbyId = payload?.lobbyId ?? null;

    // 🧹 Nettoyage des badges "Dans « … »" dans la liste d'amis
    cleanupFriendsLobby(lobbyId);

    // 🧽 État local du client
    if (!lobbyId || String(lobbyId) === localStorage.getItem('lastLobbyId')) {
      localStorage.removeItem('lastLobbyId');
    }
    currentLobbyId = null;

    // 🏷️ Effacer le nom du lobby affiché dans la carte "Membres du lobby"
    const nameEl = document.getElementById('lobby-name');
    if (nameEl) nameEl.textContent = '';

    // 👥 Vider la liste des membres
    renderMembers([]);
    renderFriends(friendsCache)

    log(`🚪 Lobby ${lobbyId ?? '-'} fermé/supprimé`);
  })

  const goToGame = ({ partieId, mancheId }) => {
    const url = new URL('/backend/game.html', window.location.origin);
    url.searchParams.set('partieId', String(partieId));
    if (mancheId) url.searchParams.set('mancheId', String(mancheId));
    const t = sessionStorage.getItem('auth_token');
    const id = sessionStorage.getItem('id_token')
    if (t) url.searchParams.set('token', t);
    if (id) url.searchParams.set('id_token', id)
    window.location.assign(url.toString());
  };
  socket.on('friends:list', (list) => {
    friendsCache = (Array.isArray(list) ? list : []).map(f => ({
      ...f,
      inLobbyId: idOrNull(f.inLobbyId),
      inLobbyName: f.inLobbyName ?? null,
    }));
    renderFriends(friendsCache);
  })
  socket.on('presence:changed', ({ userId, online }) => {
    if (online) onlineSet.add(userId);
    else onlineSet.delete(userId);

    // Re-render instantané si on a déjà une liste
    if (friendsCache.length) renderFriends(friendsCache);
  })
  socket.on('presence:lobbyChanged', ({ userId, inLobbyId, inLobbyName }) => {
    const idx = friendsCache.findIndex(f => f.id === userId);
    if (idx !== -1) {
      friendsCache[idx].inLobbyId = idOrNull(inLobbyId);
      friendsCache[idx].inLobbyName = inLobbyName ?? null;
      renderFriends(friendsCache);
    }
  });

  socket.on('lobby:gameStarted', ({ partieId }) => goToGame({ partieId }));
  socket.on('partie:started', ({ partieId, mancheId }) => goToGame({ partieId, mancheId }));
}

// ---- Button handlers ----
q('#btn-connect')?.addEventListener('click', () => {
  const accessToken = sessionStorage.getItem('auth_token');
  const idToken = sessionStorage.getItem('id_token');
  if (!accessToken && !idToken) return log('❌ Aucun token. Connectez-vous.');

  // ⚠️ important: ne pas auto-connecter avant d'avoir attaché les handlers
  socket = io('http://localhost:3000', {
    auth: { token: accessToken, id_token: idToken },
    autoConnect: false,
  });

  attachSocketHandlers();   // <— d’abord on câble tous les .on(...)
  socket.connect();         // <— puis on lance la connexion
})

q('#btn-create')?.addEventListener('click', () => {
  if (!socket?.connected) return log('⚠️ Non connecté au WS');
  const nom = prompt('Nom du lobby à créer ?') || 'Lobby Test';
  socket.emit('lobby:create', { nom }, (res) => {
    if (res?.lobbyId) { currentLobbyId = res.lobbyId; log(`🎉 Lobby créé: ${currentLobbyId}`); }
  });
  log('🔹 Emit lobby:create');
});

q('#btn-join-name')?.addEventListener('click', () => {
  if (!socket?.connected) return log('⚠️ Non connecté au WS');
  const nom = prompt('Nom du lobby ?') || 'test';
  socket.emit('lobby:joinByName', { nom });
  log('🔹 Emit lobby:joinByName');
});

q('#btn-leave')?.addEventListener('click', () => {
  if (!socket?.connected || !currentLobbyId) return log('⚠️ Aucun lobby.');
  socket.emit('lobby:leaveRoom', { lobbyId: currentLobbyId }, () => {
    localStorage.removeItem('lastLobbyId');              // ⬅️ efface au leave
  });
})

q('#btn-chat')?.addEventListener('click', () => {
  if (!socket?.connected) return log('⚠️ Non connecté au WS');
  if (!currentLobbyId) return log('⚠️ Aucun lobby');
  const message = prompt('Message à envoyer :');
  if (!message) return;
  socket.emit('lobby:chat', { lobbyId: currentLobbyId, message });
  log('🔹 Emit lobby:chat');
});

q('#btn-start')?.addEventListener('click', () => {
  if (!socket?.connected) return log('⚠️ Non connecté au WS');
  const id = currentLobbyId ?? parseInt(prompt('ID du lobby ?'), 10);
  if (!id) return log('❌ Aucun lobbyId fourni.');
  const scoreMax = parseInt(prompt('Score max (ex: 301) ?', '301'), 10) || 301;
  socket.emit('lobby:startGame', { lobbyId: id, scoreMax });
  log(`🔹 Emit lobby:startGame { lobbyId: ${id}, scoreMax: ${scoreMax} }`);
});

q('#btn-clear')?.addEventListener('click', clearLogs);

// Auto-connect if a token already exists
if (sessionStorage.getItem('auth_token') || sessionStorage.getItem('id_token')) {
  try { q('#btn-connect')?.click(); } catch (e) { console.error(e); }
}