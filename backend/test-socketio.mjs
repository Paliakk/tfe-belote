import axios from "axios";
import { io } from "socket.io-client";

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const MANCHE_ID = Number(process.env.MANCHE_ID || "0");   // ← ex: 4
const PARTIE_ID = process.env.PARTIE_ID                   // ← optionnel, si tu l’as
  ? Number(process.env.PARTIE_ID)
  : undefined;
const TOKEN = process.env.TOKEN;                          // ← token DU JOUEUR ACTUEL

if (!TOKEN || !MANCHE_ID) {
  console.error("❌ Il faut définir MANCHE_ID et TOKEN (du joueur courant). Optionnel: PARTIE_ID.");
  process.exit(1);
}

const http = axios.create({
  baseURL: API_BASE,
  headers: { Authorization: `Bearer ${TOKEN}` },
});

(async () => {
  try {
    console.log("🔎 Récupère les cartes jouables pour la manche", MANCHE_ID);
    // Ton endpoint existant: /play/:mancheId/playable
    const { data: playable } = await http.get(`/play/${MANCHE_ID}/playable`);
    // Exemple de réponse attendue:
    // { mancheId, joueurId, playableIds: [27,25,26], trickSize, atoutId }
    console.log("✅ Réponse playable:", playable);

    if (!Array.isArray(playable.playableIds) || playable.playableIds.length === 0) {
      throw new Error("Aucune carte jouable retournée (vérifie que c’est bien le tour de ce joueur).");
    }
    const carteId = playable.playableIds[0];
    console.log("🃏 Carte choisie:", carteId);

    console.log("🔌 Connexion Socket.IO…");
    const socket = io(API_BASE, {
      transports: ["websocket"],
      query: { token: TOKEN }, // ton WsJwtGuard lit query.token
    });

    socket.on("connect", async () => {
      console.log("✅ WS connecté", socket.id);

      // Si tu as PARTIE_ID → rejoins la room, sinon on joue quand même (tu verras au moins l’ACK/exception)
      if (PARTIE_ID) {
        console.log("➡️  joinPartie", PARTIE_ID);
        socket.emit("joinPartie", { partieId: PARTIE_ID });
        await new Promise((r) => setTimeout(r, 200));
      }

      console.log("➡️  jouerCarte", { mancheId: MANCHE_ID, carteId });
      socket.emit("jouerCarte", { mancheId: MANCHE_ID, carteId });

      // on écoute tout pour debug
      socket.onAny((event, payload) => {
        console.log("📨 event:", event, JSON.stringify(payload));
      });
      socket.on("exception", (e) => {
        console.log("❌ exception:", e);
      });

    });

    socket.on("connect_error", (e) => console.log("⚠️ connect_error:", e.message));
    socket.on("disconnect", (r) => console.log("❌ WS déconnecté:", r));
  } catch (err) {
    console.error("❌ Erreur de préparation:", err?.response?.data || err.message);
    process.exit(1);
  }
})();
