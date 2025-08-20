// game.js
(() => {
  console.log('[game] game.js chargé');

  const q = (sel) => document.querySelector(sel);
  const log = (...a) => { q('#log').textContent += a.map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 2)).join(' ') + '\n'; console.log(...a); };
  const getQuery = (name) => new URLSearchParams(location.search).get(name);

  // -- rendu cartes
  const suitFromCouleurId = (id) => {
    switch (id) {
      case 1: return { sym: '♥', cls: 'red' }; case 2: return { sym: '♦', cls: 'red' };
      case 3: return { sym: '♣', cls: 'black' }; case 4: return { sym: '♠', cls: 'black' };
      default: return { sym: '?', cls: 'black' };
    }
  };
  const shortRank = (v) => ({ 'Valet': 'J', 'Dame': 'Q', 'Roi': 'K' }[v] || v);
  const cardEl = (carte, mini = false) => {
    const { sym, cls } = suitFromCouleurId(carte.couleurId);
    const el = document.createElement('div');
    el.className = 'card ' + cls + (mini ? ' mini' : '');
    el.dataset.carteId = carte.id;
    el.innerHTML = `
      <div class="rank">${shortRank(carte.valeur)}</div>
      <div class="suit">${sym}</div>
    `;
    return el;
  };

  // -- token par onglet (PAS de localStorage)
  function getToken() {
    const urlToken = new URLSearchParams(location.search).get('token');
    if (urlToken) { sessionStorage.setItem('auth_token', urlToken); return urlToken; }
    return sessionStorage.getItem('auth_token') || null;
  }

  // -- état
  let socket;
  let token = null;
  let joueurId = null;
  let partieId = Number(getQuery('partieId')) || null;
  let mancheId = Number(getQuery('mancheId')) || null;
  let booted = false;

  const setPills = () => {
    q('#partie-pill').textContent = partieId ? `partieId=${partieId}` : '(pas de partie)';
    q('#manche-pill').textContent = mancheId ? `mancheId=${mancheId}` : '(pas de manche)';
  };
  setPills();

  // -- rendu
  function setBiddingButtons(state) {
    const meToPlay = state?.joueurActuelId === joueurId;
    q('#btn-pass').disabled = !meToPlay;
    q('#btn-take').disabled = !meToPlay || state?.tourActuel !== 1;
    q('#btn-choose').disabled = !meToPlay || state?.tourActuel !== 2;
  }
  function renderReturned(c) {
    const host = q('#returned'); host.innerHTML = '';
    if (!c) return;
    host.appendChild(cardEl(c, false));
    const cap = document.createElement('div'); cap.className = 'pill';
    cap.textContent = 'carte retournée'; cap.style.marginTop = '6px';
    host.appendChild(cap);
  }
  function renderMyHand(list = []) {
    const host = q('#my-hand'); host.innerHTML = '';
    list.forEach(c => host.appendChild(cardEl(c)));
  }
  function renderSeats(state) {
    const top = q('#seat-top'), right = q('#seat-right'), bottom = q('#seat-bottom'), left = q('#seat-left');
    top.innerHTML = right.innerHTML = bottom.innerHTML = left.innerHTML = '';

    const pillTurn = (id) => state?.joueurActuelId === id ? `<div class="pill">à lui</div>` : '';

    // Fallback simple si pas de seats
    if (!state?.seats || !Array.isArray(state.seats) || state.seats.length < 4) {
      bottom.innerHTML = `Moi ${pillTurn(joueurId)}`;
      top.innerHTML = `Partenaire`;
      left.innerHTML = `Adversaire A`;
      right.innerHTML = `Adversaire B`;
      return;
    }

    // seats: [{seat:0..3, joueurId, username}]
    const seats = state.seats.slice().sort((a, b) => a.seat - b.seat); // sécurité
    const me = seats.find(s => s.joueurId === joueurId);
    if (!me) {
      // si pour une raison X le joueur n'est pas trouvé, on fallback proprement
      bottom.innerHTML = `Moi ${pillTurn(joueurId)}`;
      top.innerHTML = `Partenaire`;
      left.innerHTML = `Adversaire A`;
      right.innerHTML = `Adversaire B`;
      return;
    }

    const mySeat = me.seat;
    const seatRight = (mySeat + 1) % 4;
    const seatOpp = (mySeat + 2) % 4; // partenaire en face
    const seatLeft = (mySeat + 3) % 4;

    const pRight = seats.find(s => s.seat === seatRight);
    const pOpp = seats.find(s => s.seat === seatOpp);
    const pLeft = seats.find(s => s.seat === seatLeft);

    bottom.innerHTML = `${me.username || 'Moi'} ${pillTurn(me.joueurId)}`;
    top.innerHTML = `${pOpp?.username || 'Partenaire'} ${pillTurn(pOpp?.joueurId)}`;
    left.innerHTML = `${pLeft?.username || 'Adversaire A'} ${pillTurn(pLeft?.joueurId)}`;
    right.innerHTML = `${pRight?.username || 'Adversaire B'} ${pillTurn(pRight?.joueurId)}`;
  }

  // -- connexion auto & join
  async function connectAndJoin() {
    if (booted) return; booted = true;

    if (!partieId) {
      log('❌ Pas de partieId dans l’URL'); return;
    }

    token = getToken();
    if (!token) {
      // fallback optionnel: prompt et stockage par onglet
      token = prompt('Token (stocké uniquement dans CET onglet):');
      if (!token) return;
      sessionStorage.setItem('auth_token', token);
    }

    socket = io('http://localhost:3000', { auth: { token } });

    socket.on('connect', () => {
      log('✅ WS connect', { id: socket.id });
      socket.emit('joinPartie', { partieId });
      log('➡️ joinPartie', { partieId });
    });
    socket.on('connect_error', (err) => log('❌ connect_error', err.message));
    socket.on('disconnect', (r) => log('⚠️ disconnect', r));

    socket.on('joinedPartie', (p) => {
      log('🎉 joinedPartie', p);
      joueurId = p.joueurId ?? joueurId;
      if (p.mancheId) mancheId = p.mancheId;
      setPills();
      if (mancheId) socket.emit('bidding:getState', { mancheId }); // synchro initiale
    });

    socket.on('bidding:state', (payload) => {
      log('📥 bidding:state', payload);
      if (!mancheId && payload?.mancheId) { mancheId = payload.mancheId; setPills(); }

      // Affiche la carte retournée si présente dans le payload
      if (payload.carteRetournee) {
        renderReturned(payload.carteRetournee);
      }

      setBiddingButtons(payload);
      renderSeats(payload);
    });

    socket.on('bidding:ended', (p) => {
      log('✅ Fin enchères', p);
      q('#btn-pass').disabled = q('#btn-take').disabled = q('#btn-choose').disabled = true;

      // 🔥 on vide l'affichage de la carte retournée
      q('#returned').innerHTML = '';
    })

    socket.on('hand:state', (payload) => {
      log('🃏 hand:state', payload);
      if (payload.mancheId) { mancheId = payload.mancheId; setPills(); }
      renderMyHand(payload.cartes || []);
    });

    socket.on('donne:relancee', (p) => {
      log('🔁 Donne relancée', p);
      mancheId = p.newMancheId; setPills();
    });
  }

  // -- actions UI
  const btnConnect = q('#btn-connect');
  if (btnConnect) btnConnect.style.display = 'none';
  if (btnConnect) btnConnect.addEventListener('click', connectAndJoin);

  q('#btn-get-state').addEventListener('click', () => {
    if (!socket || !mancheId) return;
    socket.emit('bidding:getState', { mancheId });
    log('➡️ bidding:getState', { mancheId });
  });
  q('#btn-pass').addEventListener('click', () => {
    if (!socket || !mancheId) return;
    socket.emit('bidding:place', { mancheId, type: 'pass' });
    log('➡️ bidding:place pass', { mancheId });
  });
  q('#btn-take').addEventListener('click', () => {
    if (!socket || !mancheId) return;
    socket.emit('bidding:place', { mancheId, type: 'take_card' });
    log('➡️ bidding:place take_card', { mancheId });
  });
  q('#btn-choose').addEventListener('click', () => {
    if (!socket || !mancheId) return;
    const couleurAtoutId = Number(prompt('Couleur atout id ? (1=♥,2=♦,3=♣,4=♠)')) || 1;
    socket.emit('bidding:place', { mancheId, type: 'choose_color', couleurAtoutId });
    log('➡️ bidding:place choose_color', { mancheId, couleurAtoutId });
  });

  // auto-join au chargement de la page
  window.addEventListener('DOMContentLoaded', connectAndJoin);
})();
