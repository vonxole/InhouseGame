// games/spyfall.js — Spyfall server module
// States: lobby → preview → reveal → playing → voting → suspense → verdict → result

const LOCATIONS = require('../locations.json');

module.exports = function createSpyfallGame(io, rooms, { getRoom, broadcastRoomList }) {

  // ── Room init helper ─────────────────────────────────────────────────────────
  function initSpyfallRoom(room) {
    room.locationCount = room.locationCount || 20;
    room.playTime      = room.playTime      || 300;
    room.locations     = room.locations     || [];
    room.realLocation  = room.realLocation  || null;
    room.roles         = room.roles         || {};
    room.spyId         = room.spyId         || null;
    room.revealsDone   = room.revealsDone   || [];
    room.votes         = room.votes         || {};
    room.scores        = room.scores        || {};
    room.accusedId     = room.accusedId     || null;
    room.spyGuess      = room.spyGuess      || null;
    room.outcome       = room.outcome       || null;
    room.timer         = room.timer         || null;
    room.timeLeft      = room.timeLeft      || 0;
  }

  // ── Role assignment ──────────────────────────────────────────────────────────
  function assignRoles(room) {
    const players = room.players;
    const spyIndex = Math.floor(Math.random() * players.length);
    room.spyId = players[spyIndex].id;

    const shuffledRoles = [...room.realLocation.roles].sort(() => Math.random() - 0.5);
    room.roles = {};
    let ri = 0;
    players.forEach(p => {
      if (p.id === room.spyId) {
        room.roles[p.id] = 'spy';
      } else {
        room.roles[p.id] = shuffledRoles[ri % shuffledRoles.length];
        ri++;
      }
    });
  }

  // ── Score update ─────────────────────────────────────────────────────────────
  function updateScores(room, outcome) {
    room.players.forEach(p => {
      if (!room.scores[p.id]) room.scores[p.id] = 0;
    });
    if (outcome === 'spy_caught' || outcome === 'spy_wrong_guess') {
      // Players win: each non-spy gets +1
      room.players.forEach(p => {
        if (p.id !== room.spyId) room.scores[p.id]++;
      });
    } else if (outcome === 'spy_escaped') {
      // Spy escapes: +4
      room.scores[room.spyId] = (room.scores[room.spyId] || 0) + 4;
    } else if (outcome === 'spy_guessed') {
      // Spy guesses location correctly: +2
      room.scores[room.spyId] = (room.scores[room.spyId] || 0) + 2;
    }
  }

  // ── Broadcast (role-specific) ─────────────────────────────────────────────────
  function broadcastRoom(room) {
    if (!room || room.gameType !== 'spyfall') return;
    initSpyfallRoom(room);

    const isEndState = room.state === 'verdict' || room.state === 'result';

    // Build common scores array sorted by score desc
    const scoresArr = Object.entries(room.scores || {}).map(([id, score]) => ({
      name:  room.players.find(p => p.id === id)?.name || '?',
      score,
    })).sort((a, b) => b.score - a.score);

    // Vote tally
    const voteCounts = {};
    Object.values(room.votes || {}).forEach(id => {
      voteCounts[id] = (voteCounts[id] || 0) + 1;
    });
    const maxVotes = Object.values(voteCounts).length ? Math.max(...Object.values(voteCounts)) : 0;
    const voteTally = room.players.map(p => ({
      id:    p.id,
      name:  p.name,
      votes: voteCounts[p.id] || 0,
    })).sort((a, b) => b.votes - a.votes);

    room.players.forEach(p => {
      const socket = io.sockets.sockets.get(p.id);
      if (!socket) return;

      const isSpy  = p.id === room.spyId;
      const myId   = p.id;
      const amHost = p.id === room.hostId;

      const base = {
        code:          room.code,
        gameType:      'spyfall',
        state:         room.state,
        players:       room.players.map(pl => ({ id: pl.id, name: pl.name, isHost: pl.isHost, disconnected: !!pl.disconnected })),
        hostId:        room.hostId,
        amHost,
        locations:     room.locations,
        locationCount: room.locationCount,
        playTime:      room.playTime,
        timeLeft:      room.timeLeft,
        totalTime:     room.playTime,
        votes:         room.votes,
        myVote:        room.votes[myId] || null,
        voteCount:     Object.keys(room.votes || {}).length,
        totalVoters:   room.players.length,
        voteTally,
        scores:        scoresArr,
        accusedId:     room.accusedId,
        accusedName:   room.players.find(pl => pl.id === room.accusedId)?.name || null,
        spyGuess:      room.spyGuess,
        outcome:       room.outcome,
        revealsDone:   room.revealsDone || [],
        readyCount:    (room.revealsDone || []).length,
        iAmReady:      (room.revealsDone || []).includes(myId),
        password:           amHost ? room.password : undefined,
        startingPlayerName: room.startingPlayerName || null,
        iAmStarter:         myId === room.startingPlayerId,
      };

      // Role-specific fields
      if (room.state === 'lobby' || room.state === 'preview') {
        socket.emit('room_update', { ...base, myRole: null });
        return;
      }

      const spyName = isEndState
        ? room.players.find(pl => pl.id === room.spyId)?.name
        : null;
      const accusedIsSpy = isEndState ? room.accusedId === room.spyId : null;

      if (isSpy) {
        socket.emit('room_update', {
          ...base,
          myRole:         'spy',
          iAmSpy:         true,
          realLocation:   isEndState ? room.realLocation : null,
          spyName,
          accusedIsSpy,
          roles:          isEndState ? room.roles : {},
          spyId:          isEndState ? room.spyId : null,
        });
      } else {
        socket.emit('room_update', {
          ...base,
          myRole:         room.roles[p.id] || 'common',
          iAmSpy:         false,
          myLocation:     room.realLocation,
          realLocation:   isEndState ? room.realLocation : null,
          spyName,
          accusedIsSpy,
          roles:          isEndState ? room.roles : {},
          spyId:          isEndState ? room.spyId : null,
        });
      }
    });
  }

  // ── Timer ────────────────────────────────────────────────────────────────────
  function startTimer(room) {
    if (room.timer) clearInterval(room.timer);
    room.timeLeft = room.playTime || 300;
    // Pick a random connected player to start asking (prefer non-spy, any if spy only)
    const connected = room.players.filter(p => !p.disconnected);
    const nonSpy = connected.filter(p => p.id !== room.spyId);
    const pool = nonSpy.length > 0 ? nonSpy : connected;
    const starter = pool[Math.floor(Math.random() * pool.length)];
    room.startingPlayerId   = starter?.id   || null;
    room.startingPlayerName = starter?.name || null;
    room.timer = setInterval(() => {
      room.timeLeft--;
      io.to(room.code).emit('sf_tick', room.timeLeft);
      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        room.timer = null;
        room.state = 'voting';
        room.votes = {};
        broadcastRoom(room);
      }
    }, 1000);
  }

  // ── Register socket handlers ──────────────────────────────────────────────────
  function registerHandlers(socket) {

    // Host starts game → pick locations, assign roles, show preview
    socket.on('sf_start', () => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.gameType !== 'spyfall') return;
      if (room.players.length < 3) return socket.emit('error', 'Need at least 3 players');

      initSpyfallRoom(room);

      // Pick N locations
      const count = room.locationCount || 20;
      const shuffled = [...LOCATIONS].sort(() => Math.random() - 0.5);
      room.locations = shuffled.slice(0, count);

      // Pick 1 as real location
      room.realLocation = room.locations[Math.floor(Math.random() * room.locations.length)];

      assignRoles(room);

      room.state       = 'preview';
      room.revealsDone = [];
      room.votes       = {};
      room.accusedId   = null;
      room.spyGuess    = null;
      room.outcome     = null;

      broadcastRoom(room);
    });

    // Host cancels back to lobby (from preview or reveal)
    socket.on('sf_back_to_lobby', () => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.gameType !== 'spyfall') return;
      if (!['preview', 'reveal'].includes(room.state)) return;
      if (room.timer) { clearInterval(room.timer); room.timer = null; }
      room.state        = 'lobby';
      room.roles        = {};
      room.spyId        = null;
      room.realLocation = null;
      room.locations    = [];
      room.revealsDone  = [];
      room.votes        = {};
      room.accusedId    = null;
      room.spyGuess     = null;
      room.outcome      = null;
      broadcastRoom(room);
      broadcastRoomList();
    });

    // Host sends everyone to reveal
    socket.on('sf_preview_done', () => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.gameType !== 'spyfall') return;
      if (room.state !== 'preview') return;
      room.state       = 'reveal';
      room.revealsDone = [];
      broadcastRoom(room);
    });

    // Player taps Ready on reveal screen
    socket.on('sf_ready', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'spyfall' || room.state !== 'reveal') return;
      if (!room.revealsDone.includes(socket.id)) room.revealsDone.push(socket.id);
      const connected = room.players.filter(p => !p.disconnected).length;
      if (room.revealsDone.length >= connected) {
        room.state = 'playing';
        startTimer(room);
      }
      broadcastRoom(room);
    });

    socket.on('sf_unready', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'spyfall' || room.state !== 'reveal') return;
      room.revealsDone = room.revealsDone.filter(id => id !== socket.id);
      broadcastRoom(room);
    });

    // Host force-starts playing even if not all players are ready (someone disconnected)
    socket.on('sf_force_start', () => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.gameType !== 'spyfall') return;
      if (room.state !== 'reveal') return;
      room.state = 'playing';
      startTimer(room);
      broadcastRoom(room);
    });

    // Host force-tallies votes even if not all players voted (someone disconnected)
    socket.on('sf_force_tally', () => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.gameType !== 'spyfall') return;
      if (room.state !== 'voting') return;
      const voteCounts = {};
      Object.values(room.votes).forEach(id => {
        voteCounts[id] = (voteCounts[id] || 0) + 1;
      });
      if (Object.keys(voteCounts).length === 0) return; // nobody voted yet
      const maxV   = Math.max(...Object.values(voteCounts));
      const topIds = Object.keys(voteCounts).filter(id => voteCounts[id] === maxV);
      room.accusedId = topIds[Math.floor(Math.random() * topIds.length)];
      room.state = 'suspense';
      broadcastRoom(room);
    });

    // Spy guesses location during playing phase (interrupts game)
    socket.on('sf_spy_guess', ({ locationName }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'spyfall') return;
      if (socket.id !== room.spyId) return;
      if (room.state !== 'playing') return;
      if (room.timer) { clearInterval(room.timer); room.timer = null; }

      room.spyGuess = locationName;
      const correct = locationName === room.realLocation.name;
      room.outcome  = correct ? 'spy_guessed' : 'spy_wrong_guess';
      updateScores(room, room.outcome);
      room.state = 'verdict';
      broadcastRoom(room);
    });

    // Player casts vote during voting phase
    socket.on('sf_cast_vote', ({ targetId }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'spyfall' || room.state !== 'voting') return;

      room.votes[socket.id] = targetId;

      // Check if all connected players voted
      const connectedVoters = room.players.filter(p => !p.disconnected).length;
      if (Object.keys(room.votes).length >= connectedVoters) {
        // Tally votes
        const voteCounts = {};
        Object.values(room.votes).forEach(id => {
          voteCounts[id] = (voteCounts[id] || 0) + 1;
        });
        const maxV = Math.max(...Object.values(voteCounts));
        const topIds = Object.keys(voteCounts).filter(id => voteCounts[id] === maxV);
        // Random tiebreak
        room.accusedId = topIds[Math.floor(Math.random() * topIds.length)];
        room.state = 'suspense';
      }
      broadcastRoom(room);
    });

    // Host reveals who was accused (show suspense result)
    socket.on('sf_reveal_accused', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'spyfall' || room.hostId !== socket.id) return;
      if (room.state !== 'suspense') return;

      const accusedIsSpy = room.accusedId === room.spyId;
      if (!accusedIsSpy) {
        // Wrong person → spy escapes
        room.outcome = 'spy_escaped';
        updateScores(room, 'spy_escaped');
        room.state = 'verdict';
      } else {
        // Spy caught → give spy a final guess
        room.outcome = 'spy_caught_pending';
        room.state = 'verdict';
      }
      broadcastRoom(room);
    });

    // Spy makes final guess after being caught (in verdict screen)
    socket.on('sf_final_guess', ({ locationName }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'spyfall') return;
      if (socket.id !== room.spyId) return;
      if (room.state !== 'verdict' || room.outcome !== 'spy_caught_pending') return;

      room.spyGuess = locationName;
      const correct = locationName === room.realLocation.name;
      room.outcome  = correct ? 'spy_guessed' : 'spy_caught';
      updateScores(room, room.outcome);
      broadcastRoom(room);
    });

    // Host confirms and goes to result
    socket.on('sf_confirm_result', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'spyfall' || room.hostId !== socket.id) return;
      if (room.state !== 'verdict') return;
      room.state = 'result';
      broadcastRoom(room);
    });

    // Host plays again → back to lobby
    socket.on('sf_play_again', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'spyfall' || room.hostId !== socket.id) return;
      if (room.timer) { clearInterval(room.timer); room.timer = null; }
      room.state        = 'lobby';
      room.locations    = [];
      room.realLocation = null;
      room.roles        = {};
      room.spyId        = null;
      room.revealsDone  = [];
      room.votes        = {};
      room.accusedId    = null;
      room.spyGuess     = null;
      room.outcome      = null;
      room.timeLeft     = 0;
      broadcastRoomList();
      broadcastRoom(room);
    });

    // Host sets location count
    socket.on('sf_set_location_count', ({ count }) => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.gameType !== 'spyfall' || room.state !== 'lobby') return;
      room.locationCount = Math.max(10, Math.min(50, parseInt(count) || 20));
    });

    // Host sets play time
    socket.on('sf_set_play_time', ({ seconds }) => {
      const room = getRoom(socket.id);
      if (!room || room.hostId !== socket.id || room.gameType !== 'spyfall' || room.state !== 'lobby') return;
      room.playTime = Math.max(60, Math.min(600, parseInt(seconds) || 300));
    });
  }

  return { broadcastRoom, registerHandlers };
};
