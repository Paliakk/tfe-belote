// backend/stats-modal.js
const API_BASE = window.API_BASE || 'http://localhost:3000';
(function(){
  const COULEURS = {
    1:{sym:'♥', cls:'c1', name:'Coeur'},
    2:{sym:'♦', cls:'c2', name:'Carreau'},
    3:{sym:'♣', cls:'c3', name:'Trèfle'},
    4:{sym:'♠', cls:'c4', name:'Pique'}
  };

  const $ = (sel) => document.querySelector(sel);
  const fmtPct = (x) => isFinite(x) ? (x*100).toFixed(0)+'%' : '—';
  const fmtNum = (x, d=1) => Number(x ?? 0).toFixed(d).replace('.', ',');
  const token = () => { try{ return sessionStorage.getItem('auth_token') || null; }catch{return null;} };

  async function fetchStats(joueurId, from, to){
    const base = location.origin; // ton API tourne sur le même host:3000 derrière le proxy de fichiers
    const url = new URL(`/players/${joueurId}/stats`, API_BASE);
    if(from) url.searchParams.set('from', from);
    if(to) url.searchParams.set('to', to);

    const headers = {};
    const t = token(); if(t) headers.Authorization = 'Bearer ' + t;

    const res = await fetch(url.toString(), { headers });
    if(!res.ok){
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  function renderAll(s){
    // KPIs
    const k = $('#stats-kpis');
    if (k) {
      k.innerHTML = `
        <div class="kpi">
          <h4>Parties jouées</h4>
          <div class="val">${s.games.played ?? 0}</div>
          <small class="muted">Gagnées: <b>${s.games.won ?? 0}</b> · Perdues: <b>${s.games.lost ?? 0}</b></small>
        </div>
        <div class="kpi">
          <h4>Taux de victoire</h4>
          <div class="val ${s.games.winRate>=0.5?'ok':(s.games.winRate>=0.35?'warn':'ko')}">${fmtPct(s.games.winRate)}</div>
          <small class="muted">Abandonnées comptées comme défaites</small>
        </div>
        <div class="kpi">
          <h4>Points / Manche</h4>
          <div class="val">${fmtNum(s.points.perMancheAvg)}</div>
          <small class="muted">/Partie: <b>${fmtNum(s.points.perPartieAvg)}</b></small>
        </div>
        <div class="kpi">
          <h4>AFK</h4>
          <div class="val">${s.discipline.timeouts ?? 0}</div>
          <small class="muted">Abandons: <b>${s.discipline.abandons ?? 0}</b></small>
        </div>
      `;
    }

    // Résumé
    $('#stats-range').textContent =
      (s.range?.from || s.range?.to)
        ? `${s.range.from?.slice(0,10) || '…'} → ${s.range.to?.slice(0,10) || '…'}`
        : 'Toutes les données';

    $('#stats-wins').textContent = `${s.games.won} / ${s.games.played}`;
    $('#stats-winRate').textContent = fmtPct(s.games.winRate);

    $('#stats-ptsManche').textContent = fmtNum(s.points.perMancheAvg);
    $('#stats-diffManche').textContent = fmtNum(s.points.diffPerMancheAvg);

    $('#stats-takes').textContent = `${s.preneur.attempted} → ${s.preneur.succeeded}`;
    $('#stats-takesRate').textContent = fmtPct(s.preneur.successRate);

    $('#stats-afk').textContent = s.discipline.timeouts;
    $('#stats-abandons').textContent = s.discipline.abandons;

    // Atouts favoris
    const wrap = $('#stats-atoutsWrap');
    if (wrap) {
      const fav = s.atouts.mostChosen;
      wrap.innerHTML = fav
        ? `<span class="pill"><b>${COULEURS[fav.couleurId]?.sym || '?'}</b> ${COULEURS[fav.couleurId]?.name || '?'} (${fav.count})</span>`
        : `<span class="muted">Aucune prise enregistrée</span>`;
    }

    // Tableau par couleur
    const tbody = $('#stats-tbl-color tbody');
    if (tbody) {
      tbody.innerHTML = '';
      (s.atouts.successByColor||[]).forEach(row=>{
        const c = COULEURS[row.couleurId]||{};
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="pill"><b>${c.sym||'?'}</b> ${c.name||'?'}</span></td>
          <td>${row.attempted}</td>
          <td>${row.succeeded}</td>
          <td><div class="bar"><i style="width:${Math.min(100, Math.round((row.successRate||0)*100))}%"></i></div></td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Plis & bonus
    $('#stats-plisTot').textContent = s.plis.total;
    $('#stats-plisAvg').textContent = fmtNum(s.plis.perMancheAvg);
    $('#stats-last8').textContent = fmtPct(s.plis.lastTrickWonPct);

    $('#stats-belote').textContent = s.bonus.beloteCount;
    $('#stats-capot').textContent = s.bonus.capotCount;
    $('#stats-dix').textContent   = s.bonus.dixDeDerCount;

    const max = Math.max(1, s.preneur.pointsAsPreneurAvg, s.preneur.pointsAsNonPreneurAvg);
    $('#stats-bar-taker').style.width = (s.preneur.pointsAsPreneurAvg / max * 100).toFixed(0) + '%';
    $('#stats-bar-nontaker').style.width = (s.preneur.pointsAsNonPreneurAvg / max * 100).toFixed(0) + '%';
  }

  async function loadAndRender(joueurId){
    const from = $('#stats-inp-from').value || undefined;
    const to   = $('#stats-inp-to').value   || undefined;
    const data = await fetchStats(joueurId, from, to);
    renderAll(data);
  }

  // API publique
  const api = {
    async open(joueurId){
      const backdrop = $('#stats-backdrop');
      const modal = $('#stats-modal');
      if (!backdrop || !modal) return;

      $('#stats-inp-id').value = Number(joueurId) || '';
      $('#stats-inp-from').value = '';
      $('#stats-inp-to').value = '';

      // handlers
      $('#stats-btn-load').onclick = async () => {
        const id = Number($('#stats-inp-id').value);
        if (!id) return alert('ID joueur manquant.');
        try { await loadAndRender(id); } catch(e){ alert('Erreur chargement stats: '+e.message); }
      };
      $('.stats-close').onclick = api.close;
      backdrop.onclick = api.close;
      document.addEventListener('keydown', escClose);

      // show
      backdrop.style.display = 'block';
      modal.style.display = 'flex';

      // 1er chargement
      try { await loadAndRender(Number(joueurId)); } catch(e){ alert('Erreur chargement stats: '+e.message); }
    },
    close(){
      const backdrop = $('#stats-backdrop');
      const modal = $('#stats-modal');
      if (backdrop) backdrop.style.display = 'none';
      if (modal) modal.style.display = 'none';
      document.removeEventListener('keydown', escClose);
    }
  };

  function escClose(e){
    if (e.key === 'Escape') api.close();
  }

  // expose
  window.StatsModal = api;
})();
