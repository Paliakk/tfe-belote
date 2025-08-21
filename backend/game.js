// game.js
(() => {
  console.log('[game] game.js chargé');

  // ---------- helpers ----------
  let totalTeam1 = 0, totalTeam2 = 0;

  function renderTotals(t1, t2) {
    totalTeam1 = Number(t1) || 0;
    totalTeam2 = Number(t2) || 0;
    const T1 = q('#total1'), T2 = q('#total2');
    if (T1) T1.textContent = String(totalTeam1);
    if (T2) T2.textContent = String(totalTeam2);
  }

  function renderAtout() {
    const el = q('#atout-pill'); if (!el) return;
    if (!currentAtoutId) {
      el.textContent = 'Atout: —';
      el.style.background = '#fff';
      el.style.color = '#333';
      return;
    }
    const { sym, cls } = suitFromCouleurId(currentAtoutId);
    el.textContent = `Atout: ${sym}`;
    el.style.background = '#fff';
    el.style.color = cls === 'red' ? '#c02020' : '#222';
  }
  const q = (sel) => document.querySelector(sel);
  const log = (...a) => {
    try {
      q('#log').textContent += a
        .map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 2))
        .join(' ') + '\n';
    } catch { }
    console.log(...a);
  };
  const getQuery = (name) => new URLSearchParams(location.search).get(name);

  // rendu cartes
  const suitFromCouleurId = (id) => {
    switch (id) {
      case 1: return { sym: '♥', cls: 'red' };
      case 2: return { sym: '♦', cls: 'red' };
      case 3: return { sym: '♣', cls: 'black' };
      case 4: return { sym: '♠', cls: 'black' };
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

  // Annonces Belote par joueur
  const beloteByPlayer = new Map(); // joueurId -> 'belote' | 'rebelote'

  // token par onglet (URL ?token=... -> sessionStorage)
  function getToken() {
    const urlToken = new URLSearchParams(location.search).get('token');
    if (urlToken) { sessionStorage.setItem('auth_token', urlToken); return urlToken; }
    return sessionStorage.getItem('auth_token') || null;
  }

  // ---------- état ----------
  let socket;
  let token = null;
  let joueurId = null;
  let partieId = Number(getQuery('partieId')) || null;
  let mancheId = Number(getQuery('mancheId')) || null;
  let booted = false;
  let lastSeats = null;       // [{seat, joueurId, username}]
  let mySeatIdx = null;       // 0..3 dans lastSeats

  // enchères / tour
  let lastBiddingState = null;
  let currentTurnPlayerId = null;

  // jeu
  let playableIds = new Set();   // cartes jouables pour "moi"
  let myHand = [];               // [{id,valeur,couleurId}...]
  let currentAtoutId = null

  const setPills = () => {
    const p = q('#partie-pill'), m = q('#manche-pill');
    if (p) p.textContent = partieId ? `partieId=${partieId}` : '(pas de partie)';
    if (m) m.textContent = mancheId ? `mancheId=${mancheId}` : '(pas de manche)';
    renderAtout()
  };
  setPills();

  function isMyTurn() { return currentTurnPlayerId === joueurId; }

  // ---------- rendu ----------
  function setBiddingButtons(state) {
    const meToPlay = state?.joueurActuelId === joueurId;
    const btnPass = q('#btn-pass'), btnTake = q('#btn-take'), btnChoose = q('#btn-choose');
    if (!btnPass || !btnTake || !btnChoose) return;
    btnPass.disabled = !meToPlay;
    btnTake.disabled = !meToPlay || state?.tourActuel !== 1;
    btnChoose.disabled = !meToPlay || state?.tourActuel !== 2;
  }

  function renderReturned(c) {
    const host = q('#returned'); if (!host) return;
    host.innerHTML = '';
    if (!c) return;
    host.appendChild(cardEl(c, false));
    const cap = document.createElement('div'); cap.className = 'pill';
    cap.textContent = 'carte retournée'; cap.style.marginTop = '6px';
    host.appendChild(cap);
  }

  function attachCardHandlers(el, c) {
    if (!isMyTurn()) return;
    if (!playableIds.has(c.id)) return;

    el.classList.add('hoverable');
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      socket.emit('play:card', { mancheId, carteId: c.id });
      log('➡️ play:card', { mancheId, carteId: c.id });
    });
  }

  function renderMyHand(list = []) {
    myHand = list.slice();
    const host = q('#my-hand'); if (!host) return;
    host.innerHTML = '';

    const myTurn = isMyTurn();
    host.classList.toggle('my-turn', myTurn); // optionnel pour du style global

    list.forEach(c => {
      const el = cardEl(c);
      const canPlay = myTurn && playableIds.has(c.id);
      if (canPlay) {
        el.classList.add('hoverable');
        attachCardHandlers(el, c)
      } else {
        el.classList.add('disabled')
      }
      host.appendChild(el);
    });
  }

  // -- rendu dernier pli (mini cartes)
  function renderLastTrick(payload) {
    // payload attendu: { cartes: [{ ordre, joueurId, carte:{ id, valeur, couleurId } }], gagnantId? }
    const host = q('#last-trick'); if (!host) return;
    host.innerHTML = '';
    const cards = Array.isArray(payload?.cartes) ? payload.cartes.slice().sort((a, b) => a.ordre - b.ordre) : [];
    cards.forEach(pc => host.appendChild(cardEl(pc.carte, true)));
  }

  // -- rendu score live
  function renderScore(s) {
    // s attendu: { mancheId, team1, team2 }
    const s1 = q('#score1'), s2 = q('#score2');
    if (s1) s1.textContent = String(s?.team1 ?? 0);
    if (s2) s2.textContent = String(s?.team2 ?? 0);
  }

  // -- demander le score au besoin
  function requestLiveScore() {
    if (socket?.connected && mancheId) socket.emit('score:getLive', { mancheId });
  }

  // seats: on accepte state.seats [{seat, joueurId, username}] OU state.joueurs [{joueurId, username, seat?}]
  function renderSeats(state) {
    const top = q('#seat-top'), right = q('#seat-right'), bottom = q('#seat-bottom'), left = q('#seat-left');
    if (!top || !right || !bottom || !left) return;

    top.innerHTML = right.innerHTML = bottom.innerHTML = left.innerHTML = '';

    const pillTurn = (id) => state?.joueurActuelId === id ? `<div class="pill">à lui</div>` : '';
    const pillBelote = (id) => {
      if (!id) return '';
      const ev = beloteByPlayer.get(id);
      if (!ev) return '';
      const label = ev === 'belote' ? 'Belote' : 'Belote';
      return `<div class="pill" style="margin-top:6px;background:#ffeaa7;color:#4d3800;">🔔 ${label}</div>`;
    };

    // fabrique un tableau "seats" à partir des infos dispo
    let seats = Array.isArray(state?.seats) ? state.seats.slice() : null;
    if (!seats && Array.isArray(state?.joueurs)) {
      seats = state.joueurs.map((j, idx) => ({
        seat: j.seat ?? idx,
        joueurId: j.joueurId ?? j.id ?? j.userId,
        username: j.username ?? j.pseudo ?? `J${idx + 1}`,
      }));
    }
    if (!seats && Array.isArray(lastSeats)) {
      seats = lastSeats.slice();
    }

    // Fallback très simple si on n'a toujours pas de seats
    if (!seats || seats.length < 4) {
      bottom.innerHTML = `Moi ${pillTurn(joueurId)} ${pillBelote(joueurId)}`;
      top.innerHTML = `Partenaire`;
      left.innerHTML = `Adversaire A`;
      right.innerHTML = `Adversaire B`;
      return;
    }

    seats.sort((a, b) => a.seat - b.seat);
    lastSeats = seats;

    const me = seats.find(s => s.joueurId === joueurId);
    mySeatIdx = me ? me.seat : null;

    // Si on ne connaît pas "me", on affiche quand même quelque chose de cohérent
    if (!me) {
      bottom.innerHTML = `Moi ${pillTurn(joueurId)} ${pillBelote(joueurId)}`;
      const p0 = seats[0], p1 = seats[1], p2 = seats[2]; // arbitraire
      top.innerHTML = `${p2?.username || 'Partenaire'} ${pillTurn(p2?.joueurId)} ${pillBelote(p2?.joueurId)}`;
      left.innerHTML = `${p0?.username || 'Adversaire A'} ${pillTurn(p0?.joueurId)} ${pillBelote(p0?.joueurId)}`;
      right.innerHTML = `${p1?.username || 'Adversaire B'} ${pillTurn(p1?.joueurId)} ${pillBelote(p1?.joueurId)}`;
      return;
    }

    const mySeat = me.seat;
    const seatRight = (mySeat + 1) % 4;
    const seatOpp = (mySeat + 2) % 4; // partenaire en face
    const seatLeft = (mySeat + 3) % 4;

    const pRight = seats.find(s => s.seat === seatRight);
    const pOpp = seats.find(s => s.seat === seatOpp);
    const pLeft = seats.find(s => s.seat === seatLeft);

    bottom.innerHTML = `${me.username || 'Moi'} ${pillTurn(me.joueurId)} ${pillBelote(me.joueurId)}`;
    top.innerHTML = `${pOpp?.username || 'Partenaire'} ${pillTurn(pOpp?.joueurId)} ${pillBelote(pOpp?.joueurId)}`;
    left.innerHTML = `${pLeft?.username || 'Adversaire A'} ${pillTurn(pLeft?.joueurId)} ${pillBelote(pLeft?.joueurId)}`;
    right.innerHTML = `${pRight?.username || 'Adversaire B'} ${pillTurn(pRight?.joueurId)} ${pillBelote(pRight?.joueurId)}`;
  }

  // ---------- playable helpers ----------
  function extractPlayableIds(payload) {
    if (!payload) return [];
    // formats “classiques”
    if (Array.isArray(payload.carteIds)) return payload.carteIds;
    if (Array.isArray(payload.cardIds)) return payload.cardIds;
    if (Array.isArray(payload.ids)) return payload.ids;

    // autres noms fréquents
    if (Array.isArray(payload.playable)) return payload.playable;
    if (Array.isArray(payload.playables)) return payload.playables;

    // objets de cartes
    if (Array.isArray(payload.cartes)) {
      if (payload.cartes.length && typeof payload.cartes[0] === 'number') return payload.cartes;
      return payload.cartes.map(c => c?.id).filter(Boolean);
    }
    if (Array.isArray(payload.cards)) return payload.cards.map(c => c?.id).filter(Boolean);

    // rien trouvé
    return [];
  }
  function posForJoueur(joueurId) {
    if (!lastSeats || mySeatIdx == null) return 'top';
    const s = lastSeats.find(x => x.joueurId === joueurId);
    if (!s) return 'top';
    const delta = (s.seat - mySeatIdx + 4) % 4; // <- mySeatIdx (fix)
    return ['bottom', 'right', 'top', 'left'][delta];
  }

  function requestPlayableIfMyTurn() {
    if (isMyTurn() && mancheId && socket?.connected) {
      log('➡️ play:getPlayable (my turn)', { mancheId });
      socket.emit('play:getPlayable', { mancheId });
    }
  }

  function retryPlayableIfMissing(delayMs = 500) {
    if (!isMyTurn()) return;
    setTimeout(() => {
      if (!isMyTurn()) return;
      if (playableIds.size > 0) return;
      log('⏳ Toujours pas de play:playable, on relance…');
      requestPlayableIfMyTurn();
    }, delayMs);
  }

  // ---------- connexion & auto-join ----------
  async function connectAndJoin() {
    if (booted) return; booted = true;

    if (!partieId) { log('❌ Pas de partieId dans l’URL'); return; }

    token = getToken();
    if (!token) {
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
      // nouvelle manche potentielle → reset annonces
      beloteByPlayer.clear();
      setPills();
      requestLiveScore();
      if (mancheId) socket.emit('bidding:getState', { mancheId }); // synchro initiale
    });

    // === Enchères ===
    socket.on('bidding:state', (payload) => {
      lastBiddingState = payload;
      // si on reçoit une nouvelle manche par cet event → reset annonces
      if (payload?.mancheId && payload.mancheId !== mancheId) {
        mancheId = payload.mancheId;
        beloteByPlayer.clear();
        setPills();
      }
      if (payload?.joueurActuelId) currentTurnPlayerId = payload.joueurActuelId;
      if (payload?.carteRetournee) renderReturned(payload.carteRetournee);

      setBiddingButtons(payload);
      renderSeats({ ...payload, joueurActuelId: currentTurnPlayerId });

      currentTurnPlayerId = null
      playableIds = new Set()
      renderMyHand(myHand)
    });

    socket.on('bidding:ended', (p) => {
      log('✅ Fin enchères', p);

      currentAtoutId = p?.atoutId ?? null;
      renderAtout()

      const btnPass = q('#btn-pass'), btnTake = q('#btn-take'), btnChoose = q('#btn-choose');
      if (btnPass) btnPass.disabled = true;
      if (btnTake) btnTake.disabled = true;
      if (btnChoose) btnChoose.disabled = true;

      // on retire la carte retournée
      const returned = q('#returned');
      if (returned) returned.innerHTML = '';
      requestLiveScore();
      // on attend turn:state ; si ça n’arrive pas tout de suite, on relance la demande de playable
      retryPlayableIfMissing(700);
    });

    // === Annonces Belote ===
    socket.on('belote:declared', (p) => {
      beloteByPlayer.set(p.joueurId, 'belote');
      log('🟡 Belote !', p);
      renderSeats({ ...lastBiddingState, joueurActuelId: currentTurnPlayerId });
    });
    socket.on('belote:rebelote', (p) => {
      beloteByPlayer.set(p.joueurId, 'rebelote');
      log('🟡 Rebelote !', p);
      renderSeats({ ...lastBiddingState, joueurActuelId: currentTurnPlayerId });
    });
    socket.on('belote:reset', (p) => {
      beloteByPlayer.clear();
      renderSeats({ ...lastBiddingState, joueurActuelId: currentTurnPlayerId });
    })

    // === Tour de jeu ===
    socket.on('turn:state', (p) => {
      if (p?.mancheId && mancheId !== p.mancheId) return;
      currentTurnPlayerId = p.joueurActuelId;

      renderSeats({ ...lastBiddingState, joueurActuelId: currentTurnPlayerId });

      if (isMyTurn()) {
        socket.emit('play:getPlayable', { mancheId });
      } else {
        playableIds = new Set();     // <- griser tout de suite
        renderMyHand(myHand);
      }
    });

    // === Cartes jouables (moi) ===
    socket.on('play:playable', (p) => {
      const ids = Array.isArray(p?.carteIds) ? p.carteIds
        : Array.isArray(p?.cards) ? p.cards.map(c => c.id)
          : Array.isArray(p?.cartes) ? p.cartes.map(c => c.id)
            : [];
      playableIds = new Set(ids);
      log('📥 play:playable', { ids: [...playableIds] });
      renderMyHand(myHand);
    });

    // === Ma main ===
    socket.on('hand:state', (payload) => {
      if (payload.mancheId && payload.mancheId !== mancheId) {
        mancheId = payload.mancheId;
        // nouvelle manche → reset annonces
        beloteByPlayer.clear();
        setPills();
      }
      myHand = payload.cartes || [];
      renderMyHand(myHand);

      requestPlayableIfMyTurn();
      retryPlayableIfMissing(500);
    });

    // === Pli courant (tapis) ===
    socket.on('trick:state', (p) => { renderTrick(p); });
    // pli fermé → pousser dans #last-trick et vider le tapis
    socket.on('trick:closed', (p) => {
      const last = q('#last-trick'); if (last) {
        last.innerHTML = '';
        (p.cartes || []).forEach(pc => last.appendChild(cardEl(pc.carte, true)));
      }
      clearTrick();
    });
    // Pli fermé -> afficher le dernier pli
    socket.on('trick:closed', (p) => {
      renderLastTrick(p);
    });

    // Score live (reçu après chaque pli, et à la demande)
    socket.on('score:live', (s) => {
      renderScore(s);
    });

    // === Nouvelle donne ===
    socket.on('donne:relancee', (p) => {
      log('🔁 Donne relancée', p);
      mancheId = p.newMancheId;
      beloteByPlayer.clear(); // reset annonces pour la nouvelle manche
      setPills();
      currentAtoutId = null;
      renderAtout()
      // les mains/état suivront via hand:state + bidding:state
    });
    socket.on('manche:ended', (end) => {
      log('🏁 manche:ended', end);

      // Met à jour le total cumulé renvoyé par UC12
      if (end?.cumule) {
        renderTotals(end.cumule.team1, end.cumule.team2);
      }

      // Si game over, on attend 'game:over' (voir plus bas)
      if (end?.gameOver) {
        // rien de spécial ici, le handler 'game:over' fera l’affichage
        return;
      }

      // Sinon, UC12 a aussi créé la prochaine manche via end.nextManche
      // Le gateway doit ensuite émettre 'donne:relancee' + hands + bidding:state (cf. patch PlayGateway)
      // Ton front les écoute déjà (joined/new hands/bidding etc.)
    });
    socket.on('game:over', (p) => {
      log('🏆 game:over', p);
      const who = p?.winnerTeamNumero ? `Équipe ${p.winnerTeamNumero}` : '—';
      const msg = `Partie terminée. Vainqueur: ${who}  (T1=${p?.totals?.team1 ?? '?'}, T2=${p?.totals?.team2 ?? '?'})`;
      alert(msg);
    })
  }

  // ---------- actions UI (debug enchères) ----------
  const btnConnect = q('#btn-connect');
  if (btnConnect) btnConnect.style.display = 'none';
  if (btnConnect) btnConnect.addEventListener('click', connectAndJoin);

  const btnGet = q('#btn-get-state');
  if (btnGet) btnGet.addEventListener('click', () => {
    if (!socket || !mancheId) return;
    socket.emit('bidding:getState', { mancheId });
    log('➡️ bidding:getState', { mancheId });
  });

  const btnPass = q('#btn-pass');
  if (btnPass) btnPass.addEventListener('click', () => {
    if (!socket || !mancheId) return;
    socket.emit('bidding:place', { mancheId, type: 'pass' });
    log('➡️ bidding:place pass', { mancheId });
  });

  const btnTake = q('#btn-take');
  if (btnTake) btnTake.addEventListener('click', () => {
    if (!socket || !mancheId) return;
    socket.emit('bidding:place', { mancheId, type: 'take_card' });
    log('➡️ bidding:place take_card', { mancheId });
  });

  const btnChoose = q('#btn-choose');
  if (btnChoose) btnChoose.addEventListener('click', () => {
    if (!socket || !mancheId) return;
    const couleurAtoutId = Number(prompt('Couleur atout id ? (1=♥,2=♦,3=♣,4=♠)')) || 1;
    socket.emit('bidding:place', { mancheId, type: 'choose_color', couleurAtoutId });
    log('➡️ bidding:place choose_color', { mancheId, couleurAtoutId });
  });

  function getSeatsArr() {
    return Array.isArray(lastBiddingState?.seats) ? lastBiddingState.seats : null;
  }
  function getMySeatIndex() {
    const seats = getSeatsArr(); if (!seats) return null;
    return seats.find(s => s.joueurId === joueurId)?.seat ?? null;
  }
  function getSeatIndexOf(jid) {
    const seats = getSeatsArr(); if (!seats) return null;
    return seats.find(s => s.joueurId === jid)?.seat ?? null;
  }
  // renvoie 's' (moi), 'e', 'n', 'w' pour placer la carte sur le tapis
  function relativeSlotOfPlayer(jid) {
    const seats = getSeatsArr(); if (!seats) return 'n';
    const me = getMySeatIndex(); const him = getSeatIndexOf(jid);
    if (me == null || him == null) return 'n';
    const diff = (him - me + 4) % 4;
    return ['s', 'e', 'n', 'w'][diff]; // 0=moi(s),1=à droite(e),2=en face(n),3=à gauche(w)
  }

  function clearTrick() {
    // vide les 4 slots s'ils existent
    ['n', 'e', 's', 'w'].forEach(dir => {
      const el = q('#trick-' + dir);
      if (el) el.innerHTML = '';
    });
    // vide aussi le fallback plat #trick
    const flat = q('#trick');
    if (flat) flat.innerHTML = '';
  }

  function renderTrick(trick) {
    clearTrick();
    if (!trick || !Array.isArray(trick.cartes)) return;

    // mode "grid" (4 slots) dispo ?
    const hasGrid = !!(q('#trick-n') || q('#trick-e') || q('#trick-s') || q('#trick-w'));
    const cards = trick.cartes.slice().sort((a, b) => a.ordre - b.ordre);

    if (hasGrid) {
      // place chaque carte devant le joueur qui l'a posée
      cards.forEach(pc => {
        const slot = q('#trick-' + relativeSlotOfPlayer(pc.joueurId));
        (slot || q('#trick')).appendChild(cardEl(pc.carte, true));
      });
    } else {
      // fallback: une ligne centrale #trick
      const host = q('#trick');
      cards.forEach(pc => host.appendChild(cardEl(pc.carte, true)));
    }
  }

  // auto-join au chargement
  window.addEventListener('DOMContentLoaded', connectAndJoin);
})();
