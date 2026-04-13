import { io } from 'socket.io-client';

export class Network {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.players = [];
    this.stateBuffer = {};
    this.sendTimer = 0;
    this.SEND_RATE = 0.05; // 20 updates/sec
    this.serverTimeOffset = 0; // serverTime - clientTime

    // Callbacks (set by Game)
    this.onRoomCreated = null;
    this.onRoomUpdate = null;
    this.onJoinError = null;
    this.onGameStart = null;
    this.onPlayerState = null;
    this.onPlayerLeft = null;
    this.onScoreUpdate = null;
    this.onBalloon = null;
    this.onGameOver = null;
  }

  connect(serverUrl) {
    if (this.socket) return;

    const url = serverUrl || `http://${window.location.hostname}:3001`;
    this.socket = io(url, { transports: ['websocket', 'polling'] });

    this.socket.on('connect', () => {
      this.connected = true;
      this.playerId = this.socket.id;
      this.syncTime();
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
    });

    this.socket.on('room-created', (data) => {
      this.roomCode = data.code;
      this.isHost = true;
      this.players = data.players;
      this.onRoomCreated?.(data);
    });

    this.socket.on('room-update', (data) => {
      this.players = data.players;
      this.onRoomUpdate?.(data);
    });

    this.socket.on('join-error', (msg) => {
      this.onJoinError?.(msg);
    });

    this.socket.on('game-start', (data) => {
      this.players = data.players;
      this.onGameStart?.(data);
    });

    this.socket.on('state', (data) => {
      this.stateBuffer[data.id] = data;
    });

    this.socket.on('score-update', (data) => {
      this.onScoreUpdate?.(data);
    });

    this.socket.on('balloon', (data) => {
      this.onBalloon?.(data);
    });

    this.socket.on('player-left', (data) => {
      delete this.stateBuffer[data.id];
      this.onPlayerLeft?.(data);
    });

    this.socket.on('game-over', (data) => {
      this.onGameOver?.(data);
    });
  }

  createRoom(name) {
    if (!this.socket) return;
    this.socket.emit('create-room', { name });
  }

  joinRoom(code, name) {
    if (!this.socket) return;
    this.roomCode = code.toUpperCase();
    this.socket.emit('join-room', { code: this.roomCode, name });
  }

  startGame() {
    if (!this.socket || !this.isHost) return;
    this.socket.emit('start-game');
  }

  sendState(state, delta) {
    if (!this.socket || !this.connected) return;
    this.sendTimer += delta;
    if (this.sendTimer < this.SEND_RATE) return;
    this.sendTimer = 0;
    this.socket.emit('state', state);
  }

  sendScoreUpdate(data) {
    this.socket?.emit('score-update', data);
  }

  sendBalloon(data) {
    this.socket?.emit('balloon', data);
  }

  syncTime() {
    if (!this.socket || !this.connected) return;
    const clientTime = Date.now();
    this.socket.emit('time-sync', clientTime, (response) => {
      if (!response) return;
      const now = Date.now();
      const roundTrip = now - clientTime;
      this.serverTimeOffset = response.serverTime - clientTime - roundTrip / 2;
    });
  }

  getServerTime() {
    return Date.now() + this.serverTimeOffset;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.roomCode = null;
    this.isHost = false;
    this.players = [];
    this.stateBuffer = {};
  }
}
