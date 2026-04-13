import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

const rooms = {};
const PLAYER_COLORS = [0x22a55b, 0xcc3388, 0x3388cc, 0xccaa22];
const MAX_PLAYERS = 4;
const GAME_DURATION = 150_000; // 150 seconds in ms
const ROOM_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_SCORE = 50_000;
const MIN_STATE_INTERVAL = 16; // ms, ~60fps cap

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateCode() : code;
}

function touchRoom(room) {
  room.lastActivity = Date.now();
}

function buildFinalResults(room) {
  return room.players.map(p => ({
    id: p.id,
    name: p.name,
    score: p.score || 0,
  })).sort((a, b) => b.score - a.score);
}

function endGame(code) {
  const room = rooms[code];
  if (!room || !room.started || room.ended) return;
  room.ended = true;
  if (room.endTimer) clearTimeout(room.endTimer);
  const results = buildFinalResults(room);
  io.to(code).emit('game-over', { results, winner: results[0] });
}

// Room inactivity cleanup — check every 60s
setInterval(() => {
  const now = Date.now();
  for (const code of Object.keys(rooms)) {
    const room = rooms[code];
    if (now - (room.lastActivity || 0) > ROOM_INACTIVITY_TIMEOUT) {
      if (room.endTimer) clearTimeout(room.endTimer);
      delete rooms[code];
      console.log(`Room ${code} deleted (inactive)`);
    }
  }
}, 60_000);

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', ({ name }) => {
    const code = generateCode();
    rooms[code] = {
      host: socket.id,
      players: [{ id: socket.id, name: name || 'Player 1', color: PLAYER_COLORS[0], score: 0 }],
      started: false,
      ended: false,
      startTime: 0,
      endTimer: null,
      lastActivity: Date.now(),
    };
    socket.join(code);
    socket.roomCode = code;
    socket.playerName = name;
    socket.lastStateTime = 0;
    socket.emit('room-created', { code, players: rooms[code].players });
    console.log(`Room ${code} created by ${name}`);
  });

  socket.on('join-room', ({ code, name }) => {
    const room = rooms[code?.toUpperCase()];
    if (!room) return socket.emit('join-error', 'Room not found');
    if (room.started) return socket.emit('join-error', 'Game already started');
    if (room.players.length >= MAX_PLAYERS) return socket.emit('join-error', 'Room is full');

    const player = {
      id: socket.id,
      name: name || `Player ${room.players.length + 1}`,
      color: PLAYER_COLORS[room.players.length],
      score: 0,
    };
    room.players.push(player);
    socket.join(code.toUpperCase());
    socket.roomCode = code.toUpperCase();
    socket.playerName = name;
    socket.lastStateTime = 0;
    touchRoom(room);

    io.to(socket.roomCode).emit('room-update', { players: room.players });
    console.log(`${name} joined room ${code}`);
  });

  socket.on('start-game', () => {
    const room = rooms[socket.roomCode];
    if (!room || socket.id !== room.host) return;
    room.started = true;
    room.startTime = Date.now();
    touchRoom(room);
    io.to(socket.roomCode).emit('game-start', {
      players: room.players,
      startTime: room.startTime,
    });
    // Auto-end game after duration
    const code = socket.roomCode;
    room.endTimer = setTimeout(() => endGame(code), GAME_DURATION);
    console.log(`Room ${socket.roomCode} started`);
  });

  // Time sync — clients can request server time to calibrate their clock
  socket.on('time-sync', (clientTime, callback) => {
    if (typeof callback === 'function') {
      callback({ serverTime: Date.now(), clientTime });
    }
  });

  // Real-time state relay with server-side rate limiting
  socket.on('state', (data) => {
    if (!socket.roomCode || !rooms[socket.roomCode]) return;
    const now = Date.now();
    if (now - (socket.lastStateTime || 0) < MIN_STATE_INTERVAL) return;
    socket.lastStateTime = now;
    touchRoom(rooms[socket.roomCode]);
    socket.to(socket.roomCode).emit('state', {
      id: socket.id,
      ...data,
    });
  });

  // Score updates — validated and tracked server-side
  socket.on('score-update', (data) => {
    if (!socket.roomCode || !rooms[socket.roomCode]) return;
    const room = rooms[socket.roomCode];
    if (room.ended) return;
    const score = data?.score;
    if (typeof score !== 'number' || !isFinite(score) || score < 0 || score > MAX_SCORE) return;
    touchRoom(room);
    // Store authoritative score
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.score = score;
    socket.to(socket.roomCode).emit('score-update', {
      id: socket.id,
      ...data,
    });
  });

  // Balloon fire event
  socket.on('balloon', (data) => {
    if (!socket.roomCode || !rooms[socket.roomCode]) return;
    touchRoom(rooms[socket.roomCode]);
    socket.to(socket.roomCode).emit('balloon', {
      id: socket.id,
      ...data,
    });
  });

  // Game over — server determines winner from tracked scores
  socket.on('game-over', () => {
    if (!socket.roomCode) return;
    endGame(socket.roomCode);
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    if (!socket.roomCode) return;
    const room = rooms[socket.roomCode];
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
      if (room.endTimer) clearTimeout(room.endTimer);
      delete rooms[socket.roomCode];
      console.log(`Room ${socket.roomCode} deleted (empty)`);
    } else {
      // If host left, assign new host
      if (room.host === socket.id) {
        room.host = room.players[0].id;
      }
      io.to(socket.roomCode).emit('room-update', { players: room.players });
      io.to(socket.roomCode).emit('player-left', { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3001;
http.listen(PORT, () => {
  console.log(`Rickshaw Rush server running on :${PORT}`);
});
