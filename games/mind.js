// games/mind.js — The Mind server module
module.exports = function mindModule(io, rooms, helpers) {
  const { getRoom } = helpers;

  // ── Card dealing ──────────────────────────────────────────────────────────────
  function dealCards(room) {
    const active     = room.players.filter(p => !p.disconnected);
    const totalCards = active.length * room.mindLevel;

    const pool = Array.from({ length: 100 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const numbers = pool.slice(0, totalCards);

    let idx = 0;
    for (const p of active) {
      p.mindCards = numbers.slice(idx, idx + room.mindLevel).sort((a, b) => a - b);
      idx += room.mindLevel;
    }
    for (const p of room.players.filter(p => p.disconnected)) {
      p.mindCards = [];
    }
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────────
  function broadcastRoom(room) {
    const base = {
      code:          room.code,
      state:         room.state,
      gameType:      'mind',
      roomName:      room.roomName,
      hostId:        room.hostId,
      players:       room.players.map(p => ({
        id: p.id, name: p.name, isHost: p.isHost,
        disconnected: p.disconnected,
        cardCount: p.mindCards?.length || 0,
      })),
      lives:         room.mindLives,
      maxLives:      room.mindMaxLives,
      level:         room.mindLevel,
      maxLevel:      room.mindMaxLevel,
      lastCard:      room.mindLastCard,
      pileTop:       room.mindPile.slice(-5),   // last 5 for display
      mistakeCards:  room.mindMistakeCards || [],
      gameOver:      room.mindGameOver  || false,
      won:           room.mindWon       || false,
    };

    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (!sock) continue;
      sock.emit('room_update', {
        ...base,
        myCards: p.mindCards || [],
        isHost:  p.id === room.hostId,
      });
    }
  }

  // ── Check win/level clear ─────────────────────────────────────────────────────
  function checkAfterPlay(room) {
    const totalLeft = room.players.reduce((s, p) => s + (p.mindCards?.length || 0), 0);
    if (totalLeft === 0) {
      if (room.mindLevel >= room.mindMaxLevel) {
        room.mindWon  = true;
        room.state    = 'result';
      } else {
        room.state = 'level_clear';
      }
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────
  function registerHandlers(socket) {

    socket.on('mind_set_lives', ({ lives }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'mind' || room.hostId !== socket.id) return;
      const l = parseInt(lives);
      if (isNaN(l) || l < 1 || l > 10) return;
      room.mindMaxLives = l;
      room.mindLives    = l;
      broadcastRoom(room);
    });

    socket.on('mind_set_max_level', ({ maxLevel }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'mind' || room.hostId !== socket.id) return;
      const ml = parseInt(maxLevel);
      if (isNaN(ml) || ml < 1 || ml > 12) return;
      room.mindMaxLevel = ml;
      broadcastRoom(room);
    });

    socket.on('mind_start', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'mind' || room.hostId !== socket.id) return;
      if (room.state !== 'lobby') return;
      if (room.players.filter(p => !p.disconnected).length < 2) return;

      room.mindLevel        = 1;
      room.mindLives        = room.mindMaxLives;
      room.mindPile         = [];
      room.mindLastCard     = 0;
      room.mindMistakeCards = [];
      room.mindGameOver     = false;
      room.mindWon          = false;
      dealCards(room);
      room.state = 'playing';
      broadcastRoom(room);
    });

    socket.on('mind_play_card', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'mind' || room.state !== 'playing') return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player || !player.mindCards?.length) return;

      const card = player.mindCards[0]; // always lowest (sorted)

      if (card > room.mindLastCard) {
        // ✅ Valid play
        player.mindCards.shift();
        room.mindPile.push({ number: card, playerName: player.name });
        room.mindLastCard = card;
        checkAfterPlay(room);
      } else {
        // ❌ Mistake — reveal all cards lower than this card across all players
        const revealed = [];
        for (const p of room.players) {
          const lower = (p.mindCards || []).filter(c => c < card);
          lower.forEach(c => revealed.push({ number: c, playerName: p.name }));
          p.mindCards = (p.mindCards || []).filter(c => c >= card);
        }
        // Play the mistake card (goes to pile marked as mistake)
        player.mindCards = player.mindCards.filter(c => c !== card);
        room.mindPile.push({ number: card, playerName: player.name, mistake: true });
        room.mindLastCard     = card;
        room.mindMistakeCards = revealed.sort((a, b) => a.number - b.number);
        room.mindLives--;

        if (room.mindLives <= 0) {
          room.mindGameOver = true;
          room.state        = 'result';
        } else {
          room.state = 'mistake';
          // Auto-resume playing after 3.5s
          const code = room.code;
          setTimeout(() => {
            const r = rooms[code];
            if (!r || r.state !== 'mistake') return;
            r.mindMistakeCards = [];
            checkAfterPlay(r);
            if (r.state === 'mistake') r.state = 'playing'; // still going
            broadcastRoom(r);
          }, 3500);
        }
      }
      broadcastRoom(room);
    });

    socket.on('mind_next_level', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'mind' || room.hostId !== socket.id) return;
      if (room.state !== 'level_clear') return;

      room.mindLevel++;
      room.mindPile         = [];
      room.mindLastCard     = 0;
      room.mindMistakeCards = [];
      dealCards(room);
      room.state = 'playing';
      broadcastRoom(room);
    });

    socket.on('mind_back_lobby', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'mind' || room.hostId !== socket.id) return;
      room.state            = 'lobby';
      room.mindPile         = [];
      room.mindLastCard     = 0;
      room.mindMistakeCards = [];
      room.mindGameOver     = false;
      room.mindWon          = false;
      for (const p of room.players) p.mindCards = [];
      broadcastRoom(room);
    });
  }

  return { broadcastRoom, registerHandlers };
};
