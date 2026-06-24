const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const START_TIME = new Date();
app.get('/api/version', (_, res) => res.json({ startedAt: START_TIME.toISOString() }));

// ── Word Bank ─────────────────────────────────────────────────────────────────
// Loaded from words.json — edit that file to add/remove words
// category: 'General' | 'Places' | 'Objects' | 'Characters'
// level:    'easy' | 'medium' | 'hard'
const WORD_BANK = require('./words.json');

const CATEGORIES = ['All', 'General', 'Places', 'Objects', 'Characters'];
const LEVELS     = ['All', 'easy', 'medium', 'hard'];

// filterCategories: array of selected categories, [] = All
// filterLevels: array of selected levels, [] = All
function pickWord(filterCategories = [], filterLevels = []) {
  let pool = WORD_BANK;
  if (filterCategories.length > 0) pool = pool.filter(w => filterCategories.includes(w.category));
  if (filterLevels.length > 0)     pool = pool.filter(w => filterLevels.includes(w.level));
  if (pool.length === 0) pool = WORD_BANK;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Room State ────────────────────────────────────────────────────────────────
const rooms = {}; // roomCode → room

function createRoom(hostId, hostName) {
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  rooms[code] = {
    code,
    hostId,
    players: [{ id: hostId, name: hostName, isHost: true }],
    state: 'lobby',
    filterCategories: [],   // [] = All
    filterLevels: [],       // [] = All
    playTime: 180,          // seconds for playing phase
    discussTime: 60,        // seconds for voting/discuss phase
    chosenMasterId: null,   // null = random
    word: null,
    wordCategory: null,
    wordLevel: null,
    hint: null,
    roles: {},
    timer: null,
    timeLeft: 0,
    revealsDone: [],
    votes: {},
    voteTimer: null,
    voteTimeLeft: 0,
    scores: {},         // playerId → { name, score }
    password: '',       // '' = no password
    showExamples: true, // show example questions during reveal/playing
  };
  return code;
}

function getRoom(socketId) {
  return Object.values(rooms).find(r => r.players.some(p => p.id === socketId));
}

function assignRoles(room) {
  const ids = room.players.map(p => p.id);
  // use chosen master if valid, otherwise random
  const masterId = (room.chosenMasterId && ids.includes(room.chosenMasterId))
    ? room.chosenMasterId
    : ids[Math.floor(Math.random() * ids.length)];
  const rest = ids.filter(id => id !== masterId).sort(() => Math.random() - 0.5);
  const roles = {};
  roles[masterId]   = 'master';
  roles[rest[0]]    = 'insider';
  rest.slice(1).forEach(id => { roles[id] = 'common'; });
  room.roles = roles;
}

const TOTAL_TIME = 180;

function broadcastRoom(room) {
  const insiderId = Object.entries(room.roles).find(([, r]) => r === 'insider')?.[0] || null;
  const base = {
    code: room.code,
    state: room.state,
    players: room.players,
    wordCategory: room.wordCategory,
    wordLevel: room.wordLevel,
    wordThai: room.wordThai,
    hint: room.hint,
    filterCategories: room.filterCategories,
    filterLevels: room.filterLevels,
    chosenMasterId: room.chosenMasterId,
    playTime: room.playTime,
    discussTime: room.discussTime,
    readyCount: room.revealsDone ? room.revealsDone.length : 0,
    timeLeft: room.timeLeft,
    totalTime: room.playTime,
    masterPlayerId: Object.entries(room.roles).find(([, r]) => r === 'master')?.[0] || null,
    voteCount:    Object.keys(room.votes || {}).length,
    totalVoters:  room.players.filter(p => room.roles[p.id] !== 'master').length,
    voteTimeLeft: room.voteTimeLeft,
    // suspense / verdict / result screens
    accusedName:   (['suspense','verdict','result'].includes(room.state)) ? room.accusedName   : null,
    accusedId:     (['suspense','verdict','result'].includes(room.state)) ? room.accusedId     : null,
    voteTally:     (['suspense','verdict','result'].includes(room.state)) ? room.voteTally     : null,
    accusedRole:   (['verdict','result'].includes(room.state))            ? room.accusedRole   : null,
    insiderCaught: (['verdict','result'].includes(room.state))            ? room.insiderCaught : null,
    // insider revealed on verdict (wrong case) + result
    insiderId:   (['verdict','result'].includes(room.state)) ? (room.insiderId || insiderId) : null,
    insiderName: (['verdict','result'].includes(room.state)) ? (room.players.find(p => p.id === (room.insiderId || insiderId))?.name || null) : null,
    word:        room.state === 'result' ? room.word      : null,
    wordThai:    room.state === 'result' ? room.wordThai  : null,
    winnerTeam:  room.state === 'result' ? room.winnerTeam  : null,
    scores: Object.values(room.scores).sort((a, b) => b.score - a.score),
    showExamples: room.showExamples,
  };
  room.players.forEach(p => {
    const role   = room.roles[p.id] || null;
    const myWord = (role === 'master' || role === 'insider') ? room.word     : null;
    const myHint     = (role === 'master' || role === 'insider') ? room.hint     : null;
    const myHintThai = (role === 'master' || role === 'insider') ? room.hintThai : null;
    const myThai = (role === 'master' || role === 'insider') ? room.wordThai : null;
    const iAmReady      = room.revealsDone ? room.revealsDone.includes(p.id) : false;
    const amHost        = p.isHost === true;
    const isMaster      = role === 'master';
    const masterId      = Object.entries(room.roles).find(([, r]) => r === 'master')?.[0];
    const masterIsReady = masterId ? (room.revealsDone || []).includes(masterId) : false;
    const myVote        = (room.votes || {})[p.id] || null;
    const totalVoters   = room.players.filter(q => room.roles[q.id] !== 'master').length;
    const allVoted      = Object.keys(room.votes || {}).length >= totalVoters;
    const timerExpired  = room.voteTimeLeft <= 0;
    const canReveal     = isMaster && (timerExpired || allVoted);
    const iAmAccused    = p.id === room.accusedId;
    const canOpenRole   = room.state === 'suspense' && (isMaster || iAmAccused);
    const canConfirm    = room.state === 'verdict'  && isMaster;
    const s = io.sockets.sockets.get(p.id);
    if (s) s.emit('room_update', { ...base, role, myWord, myHint, myHintThai, myThai, iAmReady, amHost, isMaster, masterIsReady, myVote, canReveal, iAmAccused, canOpenRole, canConfirm });
  });
  broadcastRoomList();
}

function broadcastRoomList() {
  const list = Object.values(rooms)
    .filter(r => r.state === 'lobby')
    .map(r => ({
      code: r.code,
      host: r.players.find(p => p.id === r.hostId)?.name || '?',
      count: r.players.length,
      hasPassword: !!r.password,
    }));
  io.emit('rooms_list', list);
}

function startTimer(room) {
  room.timeLeft = room.playTime;
  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    io.to(room.code).emit('tick', room.timeLeft);
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      broadcastRoom(room); // stay in playing, master picks outcome
    }
  }, 1000);
}

const VOTE_TIME = 60;

function updateScores(room) {
  // ensure all current players have a score entry
  room.players.forEach(p => {
    if (!room.scores[p.id]) room.scores[p.id] = { name: p.name, score: 0 };
    else room.scores[p.id].name = p.name; // keep name fresh
  });
  const insiderId = Object.entries(room.roles).find(([, r]) => r === 'insider')?.[0];
  if (room.winnerTeam === 'common') {
    // Insider caught → Master +1, each Common +1
    room.players.forEach(p => {
      const role = room.roles[p.id];
      if (role === 'master' || role === 'common') room.scores[p.id].score += 1;
    });
  } else if (room.winnerTeam === 'insider') {
    // Insider wins → Insider +2
    if (insiderId && room.scores[insiderId]) room.scores[insiderId].score += 2;
  }
  // winnerTeam === 'none' → word not guessed, no points for anyone
}

function endGame(room) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.state        = 'voting';
  room.votes        = {};
  room.voteTimeLeft = room.discussTime;
  broadcastRoom(room);
  // discuss countdown — when it hits 0, unlock master's Reveal button
  // voting stays open the whole time (players can still vote after timer)
  if (room.voteTimer) clearInterval(room.voteTimer);
  room.voteTimer = setInterval(() => {
    room.voteTimeLeft -= 1;
    if (room.voteTimeLeft <= 0) {
      clearInterval(room.voteTimer);
      room.voteTimer = null;
    }
    broadcastRoom(room); // broadcast either way (timer tick or expiry)
  }, 1000);
}

// ── Socket Events ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Send current lobby list immediately on connect
  const initList = Object.values(rooms)
    .filter(r => r.state === 'lobby')
    .map(r => ({ code: r.code, host: r.players.find(p => p.id === r.hostId)?.name || '?', count: r.players.length }));
  socket.emit('rooms_list', initList);

  socket.on('list_rooms', () => {
    const list = Object.values(rooms)
      .filter(r => r.state === 'lobby')
      .map(r => ({ code: r.code, host: r.players.find(p => p.id === r.hostId)?.name || '?', count: r.players.length }));
    socket.emit('rooms_list', list);
  });

  socket.on('create_room', ({ name }) => {
    const code = createRoom(socket.id, name);
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

  socket.on('set_show_examples', ({ value }) => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    room.showExamples = !!value;
    broadcastRoom(room);
  });

  socket.on('set_master', ({ playerId }) => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    // toggle: clicking same player clears selection (random)
    room.chosenMasterId = room.chosenMasterId === playerId ? null : playerId;
    broadcastRoom(room);
  });

  socket.on('set_timer', ({ type, value }) => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    const v = parseInt(value, 10);
    if (isNaN(v) || v < 10) return;
    if (type === 'play')    room.playTime    = v;
    if (type === 'discuss') room.discussTime = v;
    broadcastRoom(room);
  });

  socket.on('set_filter', ({ type, value }) => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id) return;
    const arr = type === 'category' ? room.filterCategories : room.filterLevels;
    const valid = type === 'category' ? CATEGORIES.filter(c => c !== 'All') : LEVELS.filter(l => l !== 'All');
    if (!valid.includes(value)) return;
    const idx = arr.indexOf(value);
    if (idx === -1) arr.push(value); else arr.splice(idx, 1); // toggle
    broadcastRoom(room);
  });



  socket.on('start_game', () => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 3) return socket.emit('error', 'Need at least 3 players');
    const picked = pickWord(room.filterCategories, room.filterLevels);
    room.word = picked.word;
    room.wordThai = picked.thai;
    room.wordCategory = picked.category;
    room.wordLevel = picked.level;
    room.hint     = picked.hint;
    room.hintThai = picked.hintThai || null;
    room.state = 'reveal';
    room.revealsDone = [];
    assignRoles(room);
    // debug: print assigned roles to terminal
    console.log('\n--- Roles ---');
    room.players.forEach(p => console.log(`  ${p.name} (${p.id.slice(0,6)}): ${room.roles[p.id]}`));
    console.log('-------------\n');
    broadcastRoom(room);
  });

  socket.on('reveal_done', () => {
    const room = getRoom(socket.id);
    if (!room) return;
    if (!room.revealsDone.includes(socket.id)) room.revealsDone.push(socket.id);
    if (room.revealsDone.length >= room.players.length) {
      room.state = 'playing';
      broadcastRoom(room);
      startTimer(room);
    } else {
      broadcastRoom(room);
    }
  });

  socket.on('reveal_unready', () => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'reveal') return;
    const idx = room.revealsDone.indexOf(socket.id);
    if (idx !== -1) room.revealsDone.splice(idx, 1);
    broadcastRoom(room);
  });

  socket.on('reroll_word', () => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'reveal') return;
    if (room.roles[socket.id] !== 'master') return;
    const w = pickWord(room.filterCategories, room.filterLevels);
    room.word         = w.word;
    room.hint         = w.hint;
    room.hintThai     = w.hintThai || null;
    room.wordThai     = w.thai;
    room.wordCategory = w.category;
    room.wordLevel    = w.level;
    room.revealsDone  = [];
    broadcastRoom(room);
  });

  // Insider doesn't know the word → ask master to reroll
  socket.on('insider_unknown', () => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'reveal') return;
    if (room.roles[socket.id] !== 'insider') return;
    const w = pickWord(room.filterCategories, room.filterLevels);
    room.word         = w.word;
    room.hint         = w.hint;
    room.hintThai     = w.hintThai || null;
    room.wordThai     = w.thai;
    room.wordCategory = w.category;
    room.wordLevel    = w.level;
    room.revealsDone  = [];
    broadcastRoom(room);
  });

  // Master taps when word is guessed face-to-face → reveal Insider
  socket.on('word_guessed', () => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'playing') return;
    if (room.roles[socket.id] !== 'master') return;
    endGame(room);
  });

  socket.on('word_not_guessed', () => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'playing') return;
    if (room.roles[socket.id] !== 'master') return;
    room.insiderId  = Object.entries(room.roles).find(([, r]) => r === 'insider')?.[0];
    room.winnerTeam = 'none';
    updateScores(room);
    room.state = 'result';
    broadcastRoom(room);
  });

  socket.on('cast_vote', ({ targetId }) => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'voting') return;
    if (room.roles[socket.id] === 'master') return; // master doesn't vote
    if (!room.players.find(p => p.id === targetId)) return;
    room.votes[socket.id] = targetId;
    const totalVoters = room.players.filter(p => room.roles[p.id] !== 'master').length;
    const allVoted = Object.keys(room.votes).length >= totalVoters;
    if (allVoted) {
      clearInterval(room.voteTimer);
      room.voteTimer = null;
      room.voteTimeLeft = 0; // treat as expired so master can reveal
    }
    broadcastRoom(room);
  });

  socket.on('reveal_insider', () => {
    const room = getRoom(socket.id);
    if (!room || room.roles[socket.id] !== 'master') return;
    if (room.state !== 'voting') return;
    // can reveal only when timer expired or all non-master players voted
    const totalVoters = room.players.filter(p => room.roles[p.id] !== 'master').length;
    const allVoted    = Object.keys(room.votes || {}).length >= totalVoters;
    const timerDone   = room.voteTimeLeft <= 0;
    if (!timerDone && !allVoted) return;
    if (room.voteTimer) { clearInterval(room.voteTimer); room.voteTimer = null; }

    // tally votes
    const tally = {}; // playerId → voteCount
    room.players.forEach(p => { tally[p.id] = 0; });
    Object.values(room.votes).forEach(targetId => {
      if (tally[targetId] !== undefined) tally[targetId]++;
    });
    // find accused (most votes); tie = no clear accused
    const maxVotes = Math.max(...Object.values(tally));
    const topIds   = Object.keys(tally).filter(id => tally[id] === maxVotes);
    const accusedId   = topIds.length === 1 ? topIds[0] : null; // null = tie
    const accusedName = accusedId ? (room.players.find(p => p.id === accusedId)?.name || null) : null;
    const insiderId   = Object.entries(room.roles).find(([, r]) => r === 'insider')?.[0];
    const insiderCaught = accusedId === insiderId;

    // build tally with names
    const namedTally = room.players.map(p => ({
      name:  p.name,
      votes: tally[p.id] || 0,
    })).sort((a, b) => b.votes - a.votes);

    // go to suspense — show accused but don't reveal role yet
    room.voteTally    = namedTally;
    room.accusedId    = accusedId;
    room.accusedName  = accusedName;
    room.insiderId    = insiderId;
    room.state        = 'suspense';
    broadcastRoom(room);
  });

  socket.on('open_role', () => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'suspense') return;
    const isMaster  = room.roles[socket.id] === 'master';
    const isAccused = socket.id === room.accusedId;
    if (!isMaster && !isAccused) return;

    const insiderCaught  = room.accusedId === room.insiderId;
    const accusedRole    = room.roles[room.accusedId] || null;
    room.insiderCaught   = insiderCaught;
    room.accusedRole     = accusedRole;
    room.state           = 'verdict';
    broadcastRoom(room);
  });

  socket.on('trigger_reveal_now', () => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'verdict') return;
    const role = room.roles[socket.id];
    if (role !== 'insider' && role !== 'master') return;
    // broadcast to all players in this room
    room.players.forEach(p => {
      io.sockets.sockets.get(p.id)?.emit('show_insider_reveal');
    });
  });

  socket.on('confirm_result', () => {
    const room = getRoom(socket.id);
    if (!room || room.state !== 'verdict') return;
    // auto-fired by client countdown — first one in wins, rest are no-ops
    room.winnerTeam = room.insiderCaught ? 'common' : 'insider';
    updateScores(room);
    room.state = 'result';
    broadcastRoom(room);
  });

  socket.on('play_again', () => {
    const room = getRoom(socket.id);
    if (!room || room.hostId !== socket.id) return;
    room.state = 'lobby';
    room.roles = {};
    room.word  = null;
    room.revealsDone  = [];
    room.votes        = {};
    room.voteTimeLeft = 0;
    room.accusedId    = null;
    room.accusedName  = null;
    room.accusedRole  = null;
    room.insiderId    = null;
    room.insiderCaught = null;
    // scores intentionally NOT reset — persist until room closes
    if (room.timer)     { clearInterval(room.timer);     room.timer     = null; }
    if (room.voteTimer) { clearInterval(room.voteTimer); room.voteTimer = null; }
    broadcastRoom(room);
  });

  socket.on('rejoin_room', ({ code, name }) => {
    const room = rooms[code?.toUpperCase()];
    if (!room) return socket.emit('rejoin_failed');
    const player = room.players.find(p => p.name === name);
    if (!player) return socket.emit('rejoin_failed');

    const oldId = player.id;
    player.id = socket.id;
    player.disconnected = false;

    // update roles
    if (room.roles && room.roles[oldId] !== undefined) {
      room.roles[socket.id] = room.roles[oldId];
      delete room.roles[oldId];
    }
    // update revealsDone
    if (room.revealsDone) {
      const ri = room.revealsDone.indexOf(oldId);
      if (ri !== -1) room.revealsDone[ri] = socket.id;
    }
    // update scores key
    if (room.scores && room.scores[oldId] !== undefined) {
      room.scores[socket.id] = room.scores[oldId];
      delete room.scores[oldId];
    }
    // update votes
    if (room.votes && room.votes[oldId] !== undefined) {
      room.votes[socket.id] = room.votes[oldId];
      delete room.votes[oldId];
    }
    // update hostId
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
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== 'lobby') return;
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
    // mark disconnected but keep player in list so they can rejoin
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.disconnected = true;
      if (room.state === 'lobby') io.to(room.code).emit('player_left', { name: player.name });
    }
    // if all disconnected, clean up after delay
    if (room.players.every(p => p.disconnected)) {
      room._cleanupTimer = setTimeout(() => {
        if (room.players.every(p => p.disconnected)) {
          if (room.timer) clearInterval(room.timer);
          delete rooms[room.code];
        }
      }, 30 * 60 * 1000); // 30 min
    }
    if (room.hostId === socket.id) {
      if (player) player.isHost = false;   // ← fix: clear old host flag
      const next = room.players.find(p => p.id !== socket.id && !p.disconnected);
      if (next) { room.hostId = next.id; next.isHost = true; }
    }
    broadcastRoom(room);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const BASE_PORT = parseInt(process.env.PORT || '3001');

function listen(port) {
  server.listen(port, '0.0.0.0')
    .once('listening', () => {
      console.log(`\n🎮 Inhouse Insider running at http://localhost:${port}`);
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
