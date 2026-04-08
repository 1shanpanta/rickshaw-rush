import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

const rooms = {};
const PLAYER_COLORS = [0x22a55b, 0xcc3388, 0x3388cc, 0xccaa22];
const MAX_PLAYERS = 4;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateCode() : code;
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', ({ name }) => {
    const code = generateCode();
    rooms[code] = {
      host: socket.id,
      players: [{ id: socket.id, name: name || 'Player 1', color: PLAYER_COLORS[0] }],
      started: false,
      startTime: 0,
    };
    socket.join(code);
    socket.roomCode = code;
    socket.playerName = name;
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
    };
    room.players.push(player);
    socket.join(code.toUpperCase());
    socket.roomCode = code.toUpperCase();
    socket.playerName = name;

    io.to(socket.roomCode).emit('room-update', { players: room.players });
    console.log(`${name} joined room ${code}`);
  });

  socket.on('start-game', () => {
    const room = rooms[socket.roomCode];
    if (!room || socket.id !== room.host) return;
    room.started = true;
    room.startTime = Date.now();
    io.to(socket.roomCode).emit('game-start', {
      players: room.players,
      startTime: room.startTime,
    });
    console.log(`Room ${socket.roomCode} started`);
  });

  // Real-time state relay (throttled by client)
  socket.on('state', (data) => {
    if (!socket.roomCode) return;
    socket.to(socket.roomCode).volatile.emit('state', {
      id: socket.id,
      ...data,
    });
  });

  // Score updates
  socket.on('score-update', (data) => {
    if (!socket.roomCode) return;
    socket.to(socket.roomCode).emit('score-update', {
      id: socket.id,
      ...data,
    });
  });

  // Balloon fire event
  socket.on('balloon', (data) => {
    if (!socket.roomCode) return;
    socket.to(socket.roomCode).emit('balloon', {
      id: socket.id,
      ...data,
    });
  });

  // Game over (host sends final scores)
  socket.on('game-over', (data) => {
    if (!socket.roomCode) return;
    io.to(socket.roomCode).emit('game-over', data);
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    if (!socket.roomCode) return;
    const room = rooms[socket.roomCode];
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
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
