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
})();

// ---- WS lobby logic (moved from your old inline script) ----
let socket;
let currentLobbyId = null;

const q = (sel) => document.querySelector(sel);
const logEl = () => q('#log');
const listEl = () => q('#membres-list');

function log(msg) {
  const s = (typeof msg === 'string') ? msg : JSON.stringify(msg);
  logEl().textContent += s + '\n';
  console.log(msg);
}
function clearLogs() { logEl().textContent = ''; }

function renderMembers(membres = []) {
  const el = listEl();
  el.innerHTML = '';
  membres.forEach(m => {
    const li = document.createElement('li');
    li.textContent = `${m.username} (ID: ${m.id})`;
    el.appendChild(li);
  });
}

function attachSocketHandlers() {
  socket.on('connect', () => log('✅ Connecté au serveur WS'));
  socket.on('connect_error', err => log('❌ Erreur connexion : ' + err.message));
  socket.on('disconnect', r => log('⚠️ disconnect ' + r));

  socket.on('lobby:joined', ({ lobbyId }) => {
    currentLobbyId = lobbyId;
    log(`🎉 Lobby rejoint avec ID: ${currentLobbyId}`);
  });

  socket.on('lobby:state', ({ lobbyId, membres }) => {
    currentLobbyId = currentLobbyId ?? lobbyId;
    log(`📦 State lobby ${lobbyId} — ${membres.length} membre(s)`);
    renderMembers(membres);
  });

  socket.on('lobby:update', ({ lobbyId, type, joueur }) => {
    log(`📢 ${type === 'join' ? '➕' : '➖'} ${joueur} (${type}) dans lobby ${lobbyId}`);
  });

  socket.on('lobby:closed', ({ lobbyId }) => {
    log(`🚪 Lobby ${lobbyId} fermé/supprimé`);
    renderMembers([]);
    currentLobbyId = null;
  });

  // Redirections jeu (avec token par onglet)
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
  socket.on('lobby:gameStarted', ({ partieId }) => goToGame({ partieId }));
  socket.on('partie:started', ({ partieId, mancheId }) => goToGame({ partieId, mancheId }));
}

// ---- Button handlers (no inline attributes → CSP‑safe) ----
q('#btn-connect')?.addEventListener('click', () => {
  const accessToken = sessionStorage.getItem('auth_token');   // peut être null
  const idToken = sessionStorage.getItem('id_token');     // présent chez toi

  if (!accessToken && !idToken) {
    return log('❌ Aucun token. Connectez-vous via la page de login.');
  }

  // On passe ce qu’on a. Le guard côté serveur sait lire id_token seul.
  socket = io('http://localhost:3000', { auth: { token: accessToken, id_token: idToken } });
  attachSocketHandlers();
});

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
  if (!socket?.connected) return log('⚠️ Non connecté au WS');
  if (!currentLobbyId) return log('⚠️ Aucun lobby en cours.');
  socket.emit('lobby:leaveRoom', { lobbyId: currentLobbyId });
  log('🔹 Emit lobby:leaveRoom');
});

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

