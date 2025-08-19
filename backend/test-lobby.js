import { io } from 'socket.io-client';
const API = 'http://localhost:3000';
const TOKEN = process.env.TOKEN_USER1; // export TOKEN_USER1="ey..."

const lobbyId = 4;

const s1 = io(API, { transports: ['websocket'], query: { token: TOKEN } });

s1.on('connect', () => {
  console.log('✅ WS connecté', s1.id);
  s1.emit('lobby:joinRoom', { lobbyId });
});

s1.on('lobby:joinedRoom', (p) => console.log('joinedRoom', p));
s1.on('lobby:memberJoined', (p) => console.log('memberJoined', p));
s1.on('lobby:memberLeft', (p) => console.log('memberLeft', p));
s1.on('lobby:gameStarted', (p) => console.log('gameStarted', p));
s1.on('lobby:chatMessage', (p) => console.log('chatMessage', p));