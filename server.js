const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const START_TIME = new Date();
app.get('/api/version', (_, res) => res.json({ startedAt: START_TIME.toISOString() }));

// ── Word Bank ─────────────────────────────────────────────────────────────────
const WORD_BANK = require('./words.json');

function pickWord(filterCategories = [], filterLevels = []) {
  let pool = WORD_BANK;
  if (filterCategories.length > 0) pool = pool.filter(w => filterCategories.includes(w.category));
  if (filterLevels.length > 0)     pool = pool.filter(w => filterLevels.includes(w.level));
  if (pool.length === 0) pool = WORD_BANK;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Room State ────────────────────────────────────────────────────────────────
const rooms = {};

function createRoom(hostId, hostName, gameType = 'insider') {
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  rooms[code] = {
    code, gameType, hostId,
    players: [{ id: hostId, name: hostName, isHost: true }],
    state: 'lobby',
    filterCategories: [], filterLevels: [],
    playTime: 180, discussTime: 60,
    chosenMasterId: null,
    word: null, wordCategory: null, wordLevel: null, hint: null,
    roles: {}, timer: null, timeLeft: 0,
    revealsDone: [], votes: {}, voteTimer: null, voteTimeLeft: 0,
    scores: {}, password: '',
    showExamples: false, exampleCount: 15,
  };
  return code;
}

function getRoom(socketId) {
  return Object.values(rooms).find(r => r.players.some(p => p.id === socketId));
}

function broadcastRoomList() {
  const list = Object.values(rooms)
    .filter(r => r.state === 'lobby')
    .map(r => ({
      code:        r.code,
      gameType:    r.gameType || 'insider',
      host:        r.players.find(p => p.id === r.hostId)?.name || '?',
      count:       r.players.length,
      hasPassword: !!r.password,
    }));
  io.emit('rooms_list', list);
}

// ── Game Modules ──────────────────────────────────────────────────────────────
const gameModules = {};

function broadcastRoom(room) {
  const mod = gameModules[room.gameType];
  if (mod) mod.broadcastRoom(room);
}

gameModules.insider = require('./games/insider')(io, rooms, { getRoom, pickWord, broadcastRoomList });

// ── Socket Events ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Send current lobby list immediately on connect
  const initList = Object.values(rooms)
    .filter(r => r.state === 'lobby')
    .map(r => ({
      code:        r.code,
      gameType:    r.gameType || 'insider',
      host:        r.players.find(p => p.id === r.hostId)?.name || '?',
      count:       r.players.length,
      hasPassword: !!r.password,
    }));
  socket.emit('rooms_list', initList);

  socket.on('list_rooms', () => broadcastRoomList());

  socket.on('create_room', ({ name, gameType }) => {
    const code = createRoom(socket.id, name, gameType || 'insider');
    socket.join(code);
    socket.emit('room_created', { code });
    broadcastRoom(rooms[code]);
  });

  socket.on('join_room', ({ code, name, password }) => {
    const room = rooms[code.toUpperCase()];
    if (!room) return socket.emit('error', 'Room not found');
    if (room.state !== 'lobby') return socket.emit('error', 'Game already started');
    if (room.password && room.password !== (password || '')) return socket.emit('error', 'Wrong password');
    if (room.players.some(p => p.id === socket.id)) return;
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return socket.emit('error', `"${name}" already in use — try a different one`);
    room.players.push({ id: socket.id, name, isHost: false });
    socket.join(room.code);
    broadcastRoom(room);
  });

  socket.on('set_password', ({ password }) => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    room.password = (password || '').trim();
    broadcastRoomList();
  });

  socket.on('rejoin_room', ({ code, name }) => {
    const room = rooms[code?.toUpperCase()];
    if (!room) return socket.emit('rejoin_failed');
    const player = room.players.find(p => p.name === name);
    if (!player) return socket.emit('rejoin_failed');

    const oldId = player.id;
    player.id = socket.id;
    player.disconnected = false;

    if (room.roles && room.roles[oldId] !== undefined) {
      room.roles[socket.id] = room.roles[oldId];
      delete room.roles[oldId];
    }
    if (room.revealsDone) {
      const ri = room.revealsDone.indexOf(oldId);
      if (ri !== -1) room.revealsDone[ri] = socket.id;
    }
    if (room.scores && room.scores[oldId] !== undefined) {
      room.scores[socket.id] = room.scores[oldId];
      delete room.scores[oldId];
    }
    if (room.votes && room.votes[oldId] !== undefined) {
      room.votes[socket.id] = room.votes[oldId];
      delete room.votes[oldId];
    }
    if (room.hostId === oldId) room.hostId = socket.id;

    socket.join(room.code);
    broadcastRoom(room);
  });

  socket.on('leave_room', () => {
    const room = getRoom(socket.id);
    if (!room) return;
    const leavingName = room.players.find(p => p.id === socket.id)?.name || '?';
    io.to(room.code).emit('player_left', { name: leavingName });
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(room.code);
    if (room.players.length === 0) { delete rooms[room.code]; return; }
    if (room.hostId === socket.id) {
      const next = room.players[0];
      room.hostId = next.id; next.isHost = true;
    }
    broadcastRoom(room);
  });

  socket.on('kick_player', ({ playerId }) => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    const kicked = room.players.find(p => p.id === playerId);
    if (!kicked || kicked.isHost) return;
    room.players = room.players.filter(p => p.id !== playerId);
    const ks = io.sockets.sockets.get(playerId);
    if (ks) ks.emit('kicked');
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.disconnected = true;
      if (room.state === 'lobby') io.to(room.code).emit('player_left', { name: player.name });
    }
    if (room.players.every(p => p.disconnected)) {
      room._cleanupTimer = setTimeout(() => {
        if (room.players.every(p => p.disconnected)) {
          if (room.timer) clearInterval(room.timer);
          delete rooms[room.code];
        }
      }, 30 * 60 * 1000);
    }
    if (room.hostId === socket.id) {
      if (player) player.isHost = false;
      const next = room.players.find(p => p.id !== socket.id && !p.disconnected);
      if (next) { room.hostId = next.id; next.isHost = true; }
    }
    broadcastRoom(room);
  });

  // Register game-specific handlers for all loaded game modules
  Object.values(gameModules).forEach(mod => mod.registerHandlers(socket));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const BASE_PORT = parseInt(process.env.PORT || '3001');

function listen(port) {
  server.listen(port, '0.0.0.0')
    .once('listening', () => {
      console.log(`\n🎮 Inhouse Game Platform running at http://localhost:${port}`);
      console.log(`   Share your local IP with friends on the same WiFi\n`);
    })
    .once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying ${port + 1}…`);
        listen(port + 1);
      } else {
        throw err;
      }
    });
}

listen(BASE_PORT);
