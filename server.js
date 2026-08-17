const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const fs      = require('fs');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const START_TIME = new Date();
app.get('/api/version', (_, res) => res.json({ startedAt: START_TIME.toISOString() }));
app.get('/api/words',   (_, res) => res.json(WORD_BANK));

// ── Word Bank ─────────────────────────────────────────────────────────────────
const WORDS_PATH = path.join(__dirname, 'words.json');
const WORD_BANK  = require('./words.json');   // mutable array — push() persists in memory

// ── Admin API ─────────────────────────────────────────────────────────────────
const ADMIN_PASS = process.env.ADMIN_PASS || 'wordupAdmin';

function adminAuth(req, res, next) {
  if (req.headers['x-admin-pass'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /api/admin/auth  — verify password
app.post('/api/admin/auth', (req, res) => {
  const ok = (req.body?.pass || '') === ADMIN_PASS;
  res.json({ ok });
});

// GET /api/admin/meta  — master lists for dropdowns
app.get('/api/admin/meta', adminAuth, (req, res) => {
  const categories = [...new Set(WORD_BANK.map(w => w.category))].sort();
  const seriesMap  = {};
  const countryMap = {};
  WORD_BANK.forEach(w => {
    if (w.series)  seriesMap[w.series]   = w.seriesThai  || '';
    if (w.country) countryMap[w.country] = w.countryThai || '';
  });
  res.json({ categories, seriesMap, countryMap });
});

// POST /api/admin/check  — duplicate check
app.post('/api/admin/check', adminAuth, (req, res) => {
  const word  = (req.body?.word || '').trim();
  if (!word) return res.status(400).json({ error: 'word required' });
  const found = WORD_BANK.find(w => w.word.toLowerCase() === word.toLowerCase());
  res.json({ exists: !!found, entry: found || null });
});

// POST /api/admin/words  — add new word
app.post('/api/admin/words', adminAuth, (req, res) => {
  const w = req.body;
  if (!w?.word || !w?.thai || !w?.category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (WORD_BANK.some(x => x.word.toLowerCase() === w.word.toLowerCase().trim())) {
    return res.status(409).json({ error: 'Word already exists' });
  }
  const entry = {
    word:      w.word.trim(),
    thai:      w.thai.trim(),
    category:  w.category,
    categories: w.categories?.length ? w.categories : [w.category],
    level:     w.level || 'medium',
    hint:      w.hint  || '',
    hintThai:  w.hintThai || '',
    emoji:     w.emoji || '❓',
    pos:       w.pos   || 'noun',
    ...(w.series      ? { series:      w.series,      seriesThai:  w.seriesThai  || '' } : {}),
    ...(w.country     ? { country:     w.country,     countryThai: w.countryThai || '' } : {}),
  };
  WORD_BANK.push(entry);
  fs.writeFileSync(WORDS_PATH, JSON.stringify(WORD_BANK, null, 2), 'utf-8');
  res.json({ ok: true, total: WORD_BANK.length });
});

function pickWord(filterCategories = [], filterLevels = []) {
  let pool = WORD_BANK;
  if (filterCategories.length > 0) pool = pool.filter(w => filterCategories.includes(w.category));
  if (filterLevels.length > 0)     pool = pool.filter(w => filterLevels.includes(w.level));
  if (pool.length === 0) pool = WORD_BANK;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Room State ────────────────────────────────────────────────────────────────
const rooms = {};

function createRoom(hostId, hostName, gameType = 'insider', roomName = '') {
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  const base = {
    code, gameType, hostId,
    roomName: roomName.trim() || `${hostName}'s Room`,
    players: [{ id: hostId, name: hostName, isHost: true }],
    state: 'lobby',
    roles: {}, timer: null, timeLeft: 0,
    revealsDone: [], votes: {}, scores: {}, password: '',
  };

  if (gameType === 'spyfall') {
    rooms[code] = {
      ...base,
      locationCount: 20,
      playTime: 300,
      locations: [], realLocation: null, spyId: null,
      accusedId: null, spyGuess: null, outcome: null,
    };
  } else if (gameType === 'headband') {
    rooms[code] = {
      ...base,
      hbCategory: 'all',
      hbLevel:    'all',
      hbWord:     null,
      hbScore:    0,
      hbSkipped:  0,
      hbHistory:  [],
    };
  } else if (gameType === 'mind') {
    rooms[code] = {
      ...base,
      mindLevel:        1,
      mindMaxLevel:     8,  // overridden on mind_start by player count
      mindMaxLives:     3,  // overridden on mind_start by player count
      mindLives:        3,
      mindStars:        0,
      mindReward:       null,
      mindStarDiscards: [],
      mindPile:         [],
      mindLastCard:     0,
      mindMistakeCards: [],
      mindGameOver:     false,
      mindWon:          false,
    };
  } else if (gameType === 'ito') {
    rooms[code] = {
      ...base,
      itoLevel:        1,
      itoMaxHearts:    3,
      itoHearts:       3,
      itoTopic:        null,
      itoRevealedCards: [],
      itoTotalCards:   0,
      itoMistakes:     0,
      itoGameOver:     false,
    };
  } else {
    // insider (default)
    rooms[code] = {
      ...base,
      filterCategories: [], filterLevels: [],
      playTime: 180, discussTime: 60,
      chosenMasterId: null,
      word: null, wordCategory: null, wordLevel: null, hint: null,
      voteTimer: null, voteTimeLeft: 0,
      showExamples: true, exampleCount: 15,
    };
  }
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
      roomName:    r.roomName || '',
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

gameModules.insider  = require('./games/insider')(io, rooms, { getRoom, pickWord, broadcastRoomList });
gameModules.spyfall  = require('./games/spyfall')(io, rooms, { getRoom, broadcastRoomList });
gameModules.ito      = require('./games/ito')(io, rooms, { getRoom });
gameModules.mind     = require('./games/mind')(io, rooms, { getRoom });
// headband is client-side only — no server module needed

// ── Socket Events ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Send current lobby list immediately on connect
  const initList = Object.values(rooms)
    .filter(r => r.state === 'lobby')
    .map(r => ({
      code:        r.code,
      gameType:    r.gameType || 'insider',
      roomName:    r.roomName || '',
      host:        r.players.find(p => p.id === r.hostId)?.name || '?',
      count:       r.players.length,
      hasPassword: !!r.password,
    }));
  socket.emit('rooms_list', initList);

  socket.on('list_rooms', () => broadcastRoomList());

  socket.on('create_room', ({ name, gameType, roomName }) => {
    const code = createRoom(socket.id, name, gameType || 'insider', roomName || '');
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
    if (room.votes) {
      // Update voter key
      if (room.votes[oldId] !== undefined) {
        room.votes[socket.id] = room.votes[oldId];
        delete room.votes[oldId];
      }
      // Update vote targets (other players voted FOR this player)
      for (const [voter, target] of Object.entries(room.votes)) {
        if (target === oldId) room.votes[voter] = socket.id;
      }
    }
    if (room.hostId === oldId) room.hostId = socket.id;
    // Spyfall-specific ID fields
    if (room.spyId    === oldId) room.spyId    = socket.id;
    if (room.accusedId === oldId) room.accusedId = socket.id;

    socket.join(room.code);
    broadcastRoom(room);
  });

  function closeRoomIfAlone(room) {
    if (room.players.length <= 1) {
      if (room.timer) clearInterval(room.timer);
      // Tell the last person left (if any) to go home
      if (room.players.length === 1) {
        const lastSocket = io.sockets.sockets.get(room.players[0].id);
        if (lastSocket) lastSocket.emit('room_closed');
      }
      delete rooms[room.code];
      broadcastRoomList();
      return true;
    }
    return false;
  }

  socket.on('leave_room', () => {
    const room = getRoom(socket.id);
    if (!room) return;
    const leavingName = room.players.find(p => p.id === socket.id)?.name || '?';
    io.to(room.code).emit('player_left', { name: leavingName });
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(room.code);
    if (room.players.length === 0) { delete rooms[room.code]; broadcastRoomList(); return; }
    if (closeRoomIfAlone(room)) return;
    if (room.hostId === socket.id) {
      const next = room.players[0];
      room.hostId = next.id; next.isHost = true;
    }
    broadcastRoom(room);
    broadcastRoomList();
  });

  socket.on('kick_player', ({ playerId }) => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id) return;
    const kicked = room.players.find(p => p.id === playerId);
    if (!kicked || kicked.isHost) return;
    room.players = room.players.filter(p => p.id !== playerId);
    const ks = io.sockets.sockets.get(playerId);
    if (ks) ks.emit('kicked');
    if (closeRoomIfAlone(room)) return;
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
      console.log(`\n🎮 DigiPlay running at http://localhost:${port}`);
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
