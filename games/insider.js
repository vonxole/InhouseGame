// games/insider.js — Server-side Insider game logic
// Called as: require('./games/insider')(io, rooms, { getRoom, pickWord, broadcastRoomList })

module.exports = function createInsiderGame(io, rooms, { getRoom, pickWord, broadcastRoomList }) {

  const validCategories = ['General', 'Places', 'Objects', 'Characters'];
  const validLevels     = ['easy', 'medium', 'hard'];

  // ── Role assignment ───────────────────────────────────────────────────────────
  function assignRoles(room) {
    const ids = room.players.map(p => p.id);

    // ── Pick Insider with anti-repeat weighting ──────────────────────────────
    // insiderHistory: array of player IDs, most recent last
    if (!room.insiderHistory) room.insiderHistory = [];

    // Remove IDs no longer in room
    room.insiderHistory = room.insiderHistory.filter(id => ids.includes(id));

    // Weight: 1 for everyone, halved for each position from the end of history
    // e.g. last insider gets weight 0.125, one before gets 0.25, etc.
    const weights = ids.map(id => {
      const pos = room.insiderHistory.lastIndexOf(id);
      if (pos === -1) return 1;                          // never been insider
      const recency = room.insiderHistory.length - pos;  // 1 = most recent
      return Math.pow(0.5, recency);                     // 0.5, 0.25, 0.125…
    });

    const totalWeight = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * totalWeight;
    let insiderId = ids[ids.length - 1];
    for (let i = 0; i < ids.length; i++) {
      r -= weights[i];
      if (r <= 0) { insiderId = ids[i]; break; }
    }

    // Record this round
    room.insiderHistory.push(insiderId);
    if (room.insiderHistory.length > ids.length * 2) room.insiderHistory.shift();

    // ── Pick Master ──────────────────────────────────────────────────────────
    const nonInsider = ids.filter(id => id !== insiderId);
    const masterId = (room.chosenMasterId && nonInsider.includes(room.chosenMasterId))
      ? room.chosenMasterId
      : nonInsider[Math.floor(Math.random() * nonInsider.length)];

    const roles = {};
    roles[masterId]  = 'master';
    roles[insiderId] = 'insider';
    ids.filter(id => id !== masterId && id !== insiderId)
       .forEach(id => { roles[id] = 'common'; });
    room.roles = roles;
  }

  // ── Per-player broadcast ──────────────────────────────────────────────────────
  function broadcastRoom(room) {
    const insiderId = Object.entries(room.roles).find(([, r]) => r === 'insider')?.[0] || null;
    const base = {
      code:             room.code,
      gameType:         room.gameType,
      state:            room.state,
      players:          room.players,
      wordCategory:     room.wordCategory,
      wordLevel:        room.wordLevel,
      wordThai:         room.wordThai,
      hint:             room.hint,
      filterCategories: room.filterCategories,
      filterLevels:     room.filterLevels,
      chosenMasterId:   room.chosenMasterId,
      playTime:         room.playTime,
      discussTime:      room.discussTime,
      readyCount:       room.revealsDone ? room.revealsDone.length : 0,
      timeLeft:         room.timeLeft,
      totalTime:        room.playTime,
      masterPlayerId:   Object.entries(room.roles).find(([, r]) => r === 'master')?.[0] || null,
      voteCount:        Object.keys(room.votes || {}).length,
      totalVoters:      room.players.filter(p => room.roles[p.id] !== 'master').length,
      voteTimeLeft:     room.voteTimeLeft,
      // suspense / verdict / result
      accusedName:   (['suspense','verdict','result'].includes(room.state)) ? room.accusedName   : null,
      accusedId:     (['suspense','verdict','result'].includes(room.state)) ? room.accusedId     : null,
      voteTally:     (['suspense','verdict','result'].includes(room.state)) ? room.voteTally     : null,
      accusedRole:   (['verdict','result'].includes(room.state))            ? room.accusedRole   : null,
      insiderCaught: (['verdict','result'].includes(room.state))            ? room.insiderCaught : null,
      isTie:         (['verdict','result'].includes(room.state))            ? !!room.isTie       : false,
      insiderId:     (['verdict','result'].includes(room.state)) ? (room.insiderId || insiderId) : null,
      insiderName:   (['verdict','result'].includes(room.state))
        ? (room.players.find(p => p.id === (room.insiderId || insiderId))?.name || null) : null,
      word:        room.state === 'result' ? room.word       : null,
      winnerTeam:  room.state === 'result' ? room.winnerTeam : null,
      scores:      Object.values(room.scores).sort((a, b) => b.score - a.score),
      showExamples: room.showExamples,
      exampleCount: room.exampleCount,
    };

    room.players.forEach(p => {
      const role       = room.roles[p.id] || null;
      const myWord     = (role === 'master' || role === 'insider') ? room.word     : null;
      const myHint     = (role === 'master' || role === 'insider') ? room.hint     : null;
      const myHintThai    = (role === 'master' || role === 'insider') ? room.hintThai    : null;
      const myThai        = (role === 'master' || role === 'insider') ? room.wordThai    : null;
      const myCountry     = (role === 'master' || role === 'insider') ? room.country     : null;
      const myCountryThai = (role === 'master' || role === 'insider') ? room.countryThai : null;
      const iAmReady   = room.revealsDone ? room.revealsDone.includes(p.id) : false;
      const amHost     = p.isHost === true;
      const isMaster   = role === 'master';
      const masterId   = Object.entries(room.roles).find(([, r]) => r === 'master')?.[0];
      const masterIsReady = masterId ? (room.revealsDone || []).includes(masterId) : false;
      const myVote     = (room.votes || {})[p.id] || null;
      const totalVoters = room.players.filter(q => room.roles[q.id] !== 'master').length;
      const allVoted   = Object.keys(room.votes || {}).length >= totalVoters;
      const timerExpired = room.voteTimeLeft <= 0;
      const canReveal  = isMaster && (timerExpired || allVoted);
      const iAmAccused = p.id === room.accusedId;
      const canOpenRole = room.state === 'suspense' && (isMaster || iAmAccused);
      const canConfirm  = room.state === 'verdict'  && isMaster;

      const s = io.sockets.sockets.get(p.id);
      if (s) s.emit('room_update', {
        ...base,
        role, myWord, myHint, myHintThai, myThai, myCountry, myCountryThai,
        iAmReady, amHost, isMaster, masterIsReady,
        myVote, canReveal, iAmAccused, canOpenRole, canConfirm,
      });
    });
    broadcastRoomList();
  }

  // ── Timers ────────────────────────────────────────────────────────────────────
  function startTimer(room) {
    room.timeLeft = room.playTime;
    if (room.timer) clearInterval(room.timer);
    room.timer = setInterval(() => {
      room.timeLeft -= 1;
      io.to(room.code).emit('tick', room.timeLeft);
      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        room.timer = null;
        broadcastRoom(room);
      }
    }, 1000);
  }

  function endGame(room) {
    if (room.timer) { clearInterval(room.timer); room.timer = null; }
    room.state        = 'voting';
    room.votes        = {};
    room.voteTimeLeft = room.discussTime;
    broadcastRoom(room);
    if (room.voteTimer) clearInterval(room.voteTimer);
    room.voteTimer = setInterval(() => {
      room.voteTimeLeft -= 1;
      if (room.voteTimeLeft <= 0) {
        clearInterval(room.voteTimer);
        room.voteTimer = null;
      }
      broadcastRoom(room);
    }, 1000);
  }

  // ── Scoring ───────────────────────────────────────────────────────────────────
  function updateScores(room) {
    room.players.forEach(p => {
      if (!room.scores[p.id]) room.scores[p.id] = { name: p.name, score: 0 };
      else room.scores[p.id].name = p.name;
    });
    const insiderId = Object.entries(room.roles).find(([, r]) => r === 'insider')?.[0];
    if (room.winnerTeam === 'common') {
      room.players.forEach(p => {
        const role = room.roles[p.id];
        if (role === 'master' || role === 'common') room.scores[p.id].score += 1;
      });
    } else if (room.winnerTeam === 'insider') {
      if (insiderId && room.scores[insiderId]) room.scores[insiderId].score += 2;
    }
  }

  // ── Socket handlers ───────────────────────────────────────────────────────────
  function registerHandlers(socket) {

    socket.on('set_show_examples', ({ value }) => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
      room.showExamples = !!value;
      broadcastRoom(room);
    });

    socket.on('set_example_count', ({ count }) => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
      room.exampleCount = Math.max(5, Math.min(30, parseInt(count) || 6));
      broadcastRoom(room);
    });

    socket.on('set_master', ({ playerId }) => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
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
      const arr   = type === 'category' ? room.filterCategories : room.filterLevels;
      const valid = type === 'category' ? validCategories : validLevels;
      if (!valid.includes(value)) return;
      const idx = arr.indexOf(value);
      if (idx === -1) arr.push(value); else arr.splice(idx, 1);
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (room.players.length < 4) return socket.emit('error', 'Need at least 4 players');
      const picked = pickWord(room.filterCategories, room.filterLevels);
      room.word         = picked.word;
      room.wordThai     = picked.thai;
      room.wordCategory = picked.category;
      room.wordLevel    = picked.level;
      room.hint         = picked.hint;
      room.hintThai     = picked.hintThai    || null;
      room.country      = picked.country     || null;
      room.countryThai  = picked.countryThai || null;
      room.state        = 'reveal';
      room.revealsDone  = [];
      assignRoles(room);
      console.log('\n--- Roles ---');
      room.players.forEach(p => console.log(`  ${p.name} (${p.id.slice(0, 6)}): ${room.roles[p.id]}`));
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
      room.word = w.word; room.hint = w.hint; room.hintThai = w.hintThai || null;
      room.wordThai = w.thai; room.wordCategory = w.category; room.wordLevel = w.level;
      room.country = w.country || null; room.countryThai = w.countryThai || null;
      room.revealsDone = [];
      broadcastRoom(room);
    });

    socket.on('insider_unknown', () => {
      const room = getRoom(socket.id);
      if (!room || room.state !== 'reveal') return;
      if (room.roles[socket.id] !== 'insider') return;
      const w = pickWord(room.filterCategories, room.filterLevels);
      room.word = w.word; room.hint = w.hint; room.hintThai = w.hintThai || null;
      room.wordThai = w.thai; room.wordCategory = w.category; room.wordLevel = w.level;
      room.country = w.country || null; room.countryThai = w.countryThai || null;
      room.revealsDone = [];
      broadcastRoom(room);
    });

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
      if (room.roles[socket.id] === 'master') return;
      if (!room.players.find(p => p.id === targetId)) return;
      room.votes[socket.id] = targetId;
      const totalVoters = room.players.filter(p => room.roles[p.id] !== 'master').length;
      const allVoted = Object.keys(room.votes).length >= totalVoters;
      if (allVoted) { clearInterval(room.voteTimer); room.voteTimer = null; room.voteTimeLeft = 0; }
      broadcastRoom(room);
    });

    socket.on('reveal_insider', () => {
      const room = getRoom(socket.id);
      if (!room || room.roles[socket.id] !== 'master') return;
      if (room.state !== 'voting') return;
      const totalVoters = room.players.filter(p => room.roles[p.id] !== 'master').length;
      const allVoted    = Object.keys(room.votes || {}).length >= totalVoters;
      const timerDone   = room.voteTimeLeft <= 0;
      if (!timerDone && !allVoted) return;
      if (room.voteTimer) { clearInterval(room.voteTimer); room.voteTimer = null; }

      const tally = {};
      room.players.forEach(p => { tally[p.id] = 0; });
      Object.values(room.votes).forEach(targetId => {
        if (tally[targetId] !== undefined) tally[targetId]++;
      });
      const maxVotes   = Math.max(...Object.values(tally));
      const topIds     = Object.keys(tally).filter(id => tally[id] === maxVotes);
      const insiderId  = Object.entries(room.roles).find(([, r]) => r === 'insider')?.[0];
      const namedTally = room.players
        .map(p => ({ name: p.name, votes: tally[p.id] || 0 }))
        .sort((a, b) => b.votes - a.votes);

      room.voteTally  = namedTally;
      room.insiderId  = insiderId;

      if (topIds.length > 1) {
        // Tie — Insider escapes immediately, skip suspense
        room.accusedId     = null;
        room.accusedName   = null;
        room.accusedRole   = null;
        room.insiderCaught = false;
        room.isTie         = true;
        room.state         = 'verdict';
      } else {
        room.accusedId   = topIds[0];
        room.accusedName = room.players.find(p => p.id === topIds[0])?.name || null;
        room.isTie       = false;
        room.state       = 'suspense';
      }
      broadcastRoom(room);
    });

    socket.on('open_role', () => {
      const room = getRoom(socket.id);
      if (!room || room.state !== 'suspense') return;
      // Safety: if no accused (shouldn't happen but guard anyway), treat as tie
      if (!room.accusedId) {
        room.isTie = true; room.insiderCaught = false; room.state = 'verdict';
        broadcastRoom(room); return;
      }
      const isMaster  = room.roles[socket.id] === 'master';
      const isAccused = socket.id === room.accusedId;
      if (!isMaster && !isAccused) return;
      room.insiderCaught = room.accusedId === room.insiderId;
      room.accusedRole   = room.roles[room.accusedId] || null;
      room.state         = 'verdict';
      broadcastRoom(room);
    });

    socket.on('trigger_reveal_now', () => {
      const room = getRoom(socket.id);
      if (!room || room.state !== 'verdict') return;
      const role = room.roles[socket.id];
      if (role !== 'insider' && role !== 'master') return;
      room.players.forEach(p => {
        io.sockets.sockets.get(p.id)?.emit('show_insider_reveal');
      });
    });

    socket.on('confirm_result', () => {
      const room = getRoom(socket.id);
      if (!room || room.state !== 'verdict') return;
      room.winnerTeam = room.insiderCaught ? 'common' : 'insider';
      updateScores(room);
      room.state = 'result';
      broadcastRoom(room);
    });

    socket.on('play_again', () => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      room.state        = 'lobby';
      room.roles        = {};
      room.word         = null;
      room.revealsDone  = [];
      room.votes        = {};
      room.voteTimeLeft = 0;
      room.accusedId    = null;
      room.accusedName  = null;
      room.accusedRole  = null;
      room.insiderId    = null;
      room.insiderCaught = null;
      if (room.timer)     { clearInterval(room.timer);     room.timer     = null; }
      if (room.voteTimer) { clearInterval(room.voteTimer); room.voteTimer = null; }
      broadcastRoom(room);
    });

  }

  return { broadcastRoom, registerHandlers };
};
