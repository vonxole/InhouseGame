// games/headband.js — Headband (คำบนหัว) server module
module.exports = function headbandModule(io, rooms, helpers) {
  const { getRoom } = helpers;
  const WORD_BANK = require('../words.json');

  function pickWord(room) {
    let pool = WORD_BANK;
    if (room.hbCategory && room.hbCategory !== 'all')
      pool = pool.filter(w => w.category === room.hbCategory);
    if (room.hbLevel && room.hbLevel !== 'all')
      pool = pool.filter(w => w.level === room.hbLevel);
    if (pool.length === 0) pool = WORD_BANK;
    const used  = new Set(room.hbHistory || []);
    let   fresh = pool.filter(w => !used.has(w.word));
    if (fresh.length === 0) { room.hbHistory = []; fresh = pool; }
    const w = fresh[Math.floor(Math.random() * fresh.length)];
    room.hbHistory = [...(room.hbHistory || []), w.word];
    return w;
  }

  function broadcastRoom(room) {
    const guesserIdx = room.hbTurnIdx ?? 0;
    const guesser    = room.players[guesserIdx];
    const scores     = room.hbScores || [];

    const base = {
      code:         room.code,
      state:        room.state,
      gameType:     'headband',
      roomName:     room.roomName,
      hostId:       room.hostId,
      players:      room.players.map(p => ({
        id: p.id, name: p.name, isHost: p.isHost, disconnected: p.disconnected,
      })),
      category:     room.hbCategory  || 'all',
      level:        room.hbLevel     || 'all',
      guesserName:  guesser?.name    || '',
      guesserId:    guesser?.id      || '',
      timerStart:   room.hbTimerStart || null,
      elapsed:      room.hbElapsed   || 0,
      scores,
    };

    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (!sock) continue;
      const isGuesser = p.id === guesser?.id;
      sock.emit('room_update', {
        ...base,
        amHost:    p.id === room.hostId,
        isGuesser,
        // Word hidden from the guesser
        word: isGuesser ? null : (room.hbWord || null),
      });
    }
  }

  function registerHandlers(socket) {

    socket.on('hb_set_category', ({ category }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'headband' || room.hostId !== socket.id) return;
      room.hbCategory = category;
      broadcastRoom(room);
    });

    socket.on('hb_set_level', ({ level }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'headband' || room.hostId !== socket.id) return;
      room.hbLevel = level;
      broadcastRoom(room);
    });

    // Host starts the game — pick first guesser & word
    socket.on('hb_start', () => {
      const room   = getRoom(socket.id);
      if (!room || room.gameType !== 'headband' || room.hostId !== socket.id) return;
      if (room.state !== 'lobby' && room.state !== 'result') return;
      const active = room.players.filter(p => !p.disconnected);
      if (active.length < 2) return;

      room.hbTurnIdx    = 0;
      room.hbScores     = [];
      room.hbHistory    = [];
      room.hbTimerStart = null;
      room.hbElapsed    = 0;
      room.hbWord       = pickWord(room);
      room.state        = 'turn_start';
      broadcastRoom(room);
    });

    // Any non-guesser presses Start → begin timer
    socket.on('hb_begin_turn', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'headband' || room.state !== 'turn_start') return;
      const guesser = room.players[room.hbTurnIdx];
      if (socket.id === guesser?.id) return; // guesser can't start their own turn
      room.hbTimerStart = Date.now();
      room.state        = 'turn_playing';
      broadcastRoom(room);
    });

    // Any non-guesser presses Stop → record time
    socket.on('hb_stop_turn', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'headband' || room.state !== 'turn_playing') return;
      const guesser = room.players[room.hbTurnIdx];
      if (socket.id === guesser?.id) return;
      room.hbElapsed = Math.round((Date.now() - room.hbTimerStart) / 1000);
      room.hbScores.push({
        playerId:   guesser.id,
        playerName: guesser.name,
        seconds:    room.hbElapsed,
      });
      room.state = 'turn_done';
      broadcastRoom(room);
    });

    // Host advances to next guesser (or result if all done)
    socket.on('hb_next_turn', () => {
      const room   = getRoom(socket.id);
      if (!room || room.gameType !== 'headband' || room.hostId !== socket.id) return;
      if (room.state !== 'turn_done') return;

      const active = room.players.filter(p => !p.disconnected);
      room.hbTurnIdx++;

      if (room.hbTurnIdx >= active.length) {
        room.state = 'result';
        room.hbWord = null;
      } else {
        room.hbElapsed    = 0;
        room.hbTimerStart = null;
        room.hbWord       = pickWord(room);
        room.state        = 'turn_start';
      }
      broadcastRoom(room);
    });

    socket.on('hb_back_lobby', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'headband' || room.hostId !== socket.id) return;
      room.state        = 'lobby';
      room.hbWord       = null;
      room.hbScores     = [];
      room.hbHistory    = [];
      room.hbTurnIdx    = 0;
      room.hbTimerStart = null;
      room.hbElapsed    = 0;
      broadcastRoom(room);
    });
  }

  return { broadcastRoom, registerHandlers };
};
