import axios from "axios";
import { io } from "socket.io-client";

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const TOKENS = {
  alice: process.env.TOKEN_ALICE,
  bob: process.env.TOKEN_BOB,
  chloe: process.env.TOKEN_CHLOE,
  david: process.env.TOKEN_DAVID,
};
const SCORE_MAX = Number(process.env.SCORE_MAX || "301");

function httpFor(token) {
  return axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForEventOnce(sockets, event, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timers = [];
    const handlers = [];

    const cleanup = () => {
      timers.forEach(clearTimeout);
      Object.values(sockets).forEach((s, idx) => {
        s.off(event, handlers[idx]);
      });
    };

    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for '${event}'`));
    }, timeoutMs);
    timers.push(t);

    Object.values(sockets).forEach((s) => {
      const h = (payload) => {
        try {
          if (!predicate || predicate(payload)) {
            cleanup();
            resolve(payload);
          }
        } catch (e) { }
      };
      handlers.push(h);
      s.once(event, h);
    });
  });
}

function connectSocket(name, token, { lobbyId }) {
  const s = io(API_BASE, {
    transports: ["websocket"],
    query: { token },
  });

  s.on("connect", () => {
    console.log(`✅ [${name}] WS connecté ${s.id}`);
    if (lobbyId) {
      s.emit("lobby:joinRoom", { lobbyId }, (ack) =>
        console.log(`ACK lobby:joinRoom [${name}]`, ack || "(no-ack)")
      );
    }
  });

  s.on("disconnect", (r) => console.log(`❌ [${name}] disconnect:`, r));
  s.on("connect_error", (e) =>
    console.log(`⚠️ [${name}] connect_error:`, e?.message || e)
  );

  s.onAny((event, payload) => {
    if (
      event.startsWith("lobby:") ||
      event === "joinedPartie" ||
      event.startsWith("bidding:") ||
      event === "carteJouee" ||
      event === "pliTermine" ||
      event === "mancheTerminee" ||
      event === "scoreMisAJour" ||
      event === "nouvelleManche" ||
      event === "finDePartie"
    ) {
      console.log(`📨 [${name}] ${event}:`, JSON.stringify(payload));
    }
  });

  return s;
}

async function main() {
  for (const [who, t] of Object.entries(TOKENS)) {
    if (!t) {
      console.error(`❌ TOKEN manquant pour ${who}. Renseigne TOKEN_${who.toUpperCase()}.`);
      process.exit(1);
    }
  }

  const http = {
    alice: httpFor(TOKENS.alice),
    bob: httpFor(TOKENS.bob),
    chloe: httpFor(TOKENS.chloe),
    david: httpFor(TOKENS.david),
  };

  console.log("🧪 1) Alice crée un lobby…");
  const { data: lobby } = await http.alice.post("/lobby", { nom: "Test WS", password: null });
  const lobbyId = lobby.id;
  console.log("✅ Lobby créé:", lobby);

  console.log("🧪 2) Rejoindre le lobby…");
  await http.bob.post("/lobby/join", { lobbyId });
  await http.chloe.post("/lobby/join", { lobbyId });
  await http.david.post("/lobby/join", { lobbyId });
  console.log("✅ Bob, Chloé, David ont rejoint.");

  const sockets = {
    alice: connectSocket("Alice", TOKENS.alice, { lobbyId }),
    bob: connectSocket("Bob", TOKENS.bob, { lobbyId }),
    chloe: connectSocket("Chloé", TOKENS.chloe, { lobbyId }),
    david: connectSocket("David", TOKENS.david, { lobbyId }),
  };

  await sleep(400);

  console.log("🧪 3) Start game…");
  await http.alice.post(`/lobby/${lobbyId}/start`, { scoreMax: SCORE_MAX });
  const lobbyDetail = (await http.alice.get(`/lobby/${lobbyId}`)).data;
  const partieId = lobbyDetail?.partie?.id;
  if (!partieId) {
    console.error("❌ Impossible de déduire partieId.");
    process.exit(1);
  }
  console.log("✅ Partie démarrée. partieId:", partieId);

  for (const [name, s] of Object.entries(sockets)) {
    s.emit("joinPartie", { partieId }, (ack) =>
      console.log(`ACK joinPartie [${name}]`, ack || "(no-ack)")
    );
  }

  await sleep(300);

  const players = [
    { name: "Alice", http: http.alice, socket: sockets.alice },
    { name: "Bob", http: http.bob, socket: sockets.bob },
    { name: "Chloé", http: http.chloe, socket: sockets.chloe },
    { name: "David", http: http.david, socket: sockets.david },
  ];

  async function getPlayable(httpClient, who) {
    try {
      const { data } = await httpClient.get(`/play/${mancheId}/playable`);
      if (Array.isArray(data.playableIds) && data.playableIds.length > 0) {
        console.log(`   ✅ ${who} peut jouer:`, data.playableIds);
        return data.playableIds[0];
      } else {
        console.log(`   ℹ️ ${who} n'a pas de playableIds`);
        return null;
      }
    } catch (e) {
      console.log(`   ⚠️ ${who} playable →`, e?.response?.data || e.message);
      return null;
    }
  }

  async function playOneCardTryAll() {
    for (const p of players) {
      const cid = await getPlayable(p.http, p.name);
      if (cid) {
        console.log(`➡️  ${p.name} émet jouerCarte { mancheId: ${mancheId}, carteId: ${cid} }`);
        p.socket.emit("jouerCarte", { mancheId, carteId: cid }, (ack) =>
          console.log(`ACK jouerCarte [${p.name}]`, ack || "(no-ack)")
        );
        return true;
      }
    }
    return false;
  }

  async function playOneTrickAndWait(plisValid) {
    console.log("🧪 6) Pli complet — on joue jusqu'à 'pliTermine'…");
    const waitPli = waitForEventOnce(
      sockets,
      "pliTermine",
      (p) => p?.mancheId === mancheId,
      8000
    );

    for (let i = 0; i < 8; i++) {
      const ok = await playOneCardTryAll();
      if (!ok) await sleep(200);
      await sleep(150);
      const race = await Promise.race([
        waitPli.then(() => "PLI_OK"),
        sleep(100).then(() => "CONT"),
      ]);
      if (race === "PLI_OK") break;
    }

    const pli = await waitPli;
    if (pli?.pliNumero && !plisValid.has(pli.pliNumero)) {
      plisValid.add(pli.pliNumero);
    }
    console.log(`🎯 ✅ Pli #${pli.pliNumero} terminé — ${plisValid.size}/8 enregistrés`);
    return pli;
  }

  async function playCompleteManche() {
    console.log(`🔁 Manche ${mancheId} en cours...`);
    const plisValid = new Set();

    // Prépare les promesses d'écoute AVANT le dernier pli
    const mancheTermineeP = waitForEventOnce(sockets, "mancheTerminee", (p) => p?.mancheId === mancheId, 30000);
    const scoreMisAJourP = waitForEventOnce(sockets, "scoreMisAJour", (p) => p?.partieId === partieId, 30000);
    const nouvelleMancheP = waitForEventOnce(sockets, "nouvelleManche", (p) => p?.partieId === partieId, 30000);

    // On joue les 8 plis
    for (const [name, s] of Object.entries(sockets)) {
      s.emit("bidding:joinManche", { mancheId });
    }

    while (plisValid.size < 8) {
      await playOneTrickAndWait(plisValid);
      await sleep(300);
    }

    // Une fois les plis terminés, on attend les événements qu’on avait déjà préparés
    let mancheTermineePayload = null;
    let scorePayload = null;
    let nouvelleManchePayload = null;

    try {
      [mancheTermineePayload, scorePayload, nouvelleManchePayload] = await Promise.all([
        mancheTermineeP,
        scoreMisAJourP,
        nouvelleMancheP,
      ]);

      console.log("🏁 Manche terminée:", JSON.stringify(mancheTermineePayload));
      console.log("📊 Score mis à jour:", JSON.stringify(scorePayload));
      console.log("🆕 Nouvelle manche:", JSON.stringify(nouvelleManchePayload));

      if (scorePayload.team1 >= SCORE_MAX || scorePayload.team2 >= SCORE_MAX) {
        const fin = await waitForEventOnce(
          sockets,
          "finDePartie",
          (p) => p?.partieId === partieId,
          8000
        );
        console.log("🎉 finDePartie:", JSON.stringify(fin));
        return false;
      }

      mancheId = nouvelleManchePayload.nouvelleMancheId;
      return true;

    } catch (e) {
      console.log("⚠️ Timeout lors de la réception des événements de fin de manche", e);
      return false;
    }
  }

  console.log("🧪 4) Manche active…");
  const { data: active } = await http.alice.get(`/bidding/active/${partieId}`);
  let mancheId = active.id || active.mancheId || active;
  console.log("✅ Manche active:", mancheId);

  console.log("🧪 5) Enchères (WS)…");
  for (const [name, s] of Object.entries(sockets)) {
    s.emit("bidding:joinManche", { mancheId });
  }
  await sleep(200);
  sockets.bob.emit("bidding:place", { mancheId, type: "pass" });
  await sleep(200);
  sockets.chloe.emit("bidding:place", { mancheId, type: "pass" });
  await sleep(200);
  sockets.david.emit("bidding:place", { mancheId, type: "take_card" });
  await sleep(500);

  while (await playCompleteManche()) {
    await sleep(1000);
  }

  console.log("⏳ Fin du scénario. Fermeture des sockets...");
  for (const s of Object.values(sockets)) s.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("💥 Orchestrator failure:", e?.response?.data || e);
  process.exit(1);
});
