// games/mind.js — The Mind server module
module.exports = function mindModule(io, rooms, helpers) {
  const { getRoom } = helpers;

  // ── Reward schedule (real rules) ──────────────────────────────────────────────
  // After completing a level, team receives a reward from the level card
  const LEVEL_REWARDS = { 2: 'star', 3: 'life', 5: 'star', 6: 'life', 8: 'star', 9: 'life' };

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
      stars:         room.mindStars,
      level:         room.mindLevel,
      maxLevel:      room.mindMaxLevel,
      lastCard:      room.mindLastCard,
      pileTop:       room.mindPile.slice(-5),
      mistakeCards:  room.mindMistakeCards || [],
      starDiscards:  room.mindStarDiscards || [],
      gameOver:      room.mindGameOver  || false,
      won:           room.mindWon       || false,
      reward:        room.mindReward    || null,  // 'life' | 'star' | null
    };

    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (!sock) continue;
      sock.emit('room_update', {
        ...base,
        myCards: p.mindCards || [],
        amHost:  p.id === room.hostId,
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
        // Apply level reward per real rules
        const reward = LEVEL_REWARDS[room.mindLevel] || null;
        if (reward === 'life' && room.mindLives < room.mindMaxLives) {
          room.mindLives++;
          room.mindReward = 'life';
        } else if (reward === 'star' && room.mindStars < 3) {
          room.mindStars++;
          room.mindReward = 'star';
        } else {
          room.mindReward = null;
        }
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
      const active = room.players.filter(p => !p.disconnected);
      if (active.length < 2) return;

      // Auto-set based on player count (real rules)
      const n = active.length;
      const autoLives  = n <= 2 ? 2 : n === 3 ? 3 : Math.min(n, 5);
      const autoLevels = n <= 2 ? 12 : n === 3 ? 10 : 8;
      room.mindMaxLives  = autoLives;
      room.mindMaxLevel  = autoLevels;

      room.mindLevel        = 1;
      room.mindLives        = room.mindMaxLives;
      room.mindStars        = 1;   // always start with 1 throwing star
      room.mindPile         = [];
      room.mindLastCard     = 0;
      room.mindMistakeCards = [];
      room.mindReward       = null;
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

      // Collect skipped cards from OTHER players lower than this card
      const skipped = [];
      for (const p of room.players) {
        if (p.id === socket.id) continue;
        const lower = (p.mindCards || []).filter(c => c < card);
        lower.forEach(c => skipped.push({ number: c, playerName: p.name }));
        p.mindCards = (p.mindCards || []).filter(c => c >= card);
      }

      const outOfOrder = card <= room.mindLastCard;
      const isMistake  = outOfOrder || skipped.length > 0;

      if (outOfOrder) {
        player.mindCards = player.mindCards.filter(c => c !== card);
      } else {
        player.mindCards.shift();
      }

      room.mindPile.push({ number: card, playerName: player.name, mistake: isMistake });
      room.mindLastCard     = card;
      room.mindMistakeCards = skipped.sort((a, b) => a.number - b.number);

      if (isMistake) {
        room.mindLives--;
        if (room.mindLives <= 0) {
          room.mindGameOver = true;
          room.state        = 'result';
        } else {
          // Stay on playing screen — show mistake inline, clear after 3s
          const code = room.code;
          setTimeout(() => {
            const r = rooms[code];
            if (!r || r.state !== 'playing') return;
            r.mindMistakeCards = [];
            checkAfterPlay(r);
            broadcastRoom(r);
          }, 3000);
        }
      } else {
        room.mindMistakeCards = [];
        checkAfterPlay(room);
      }

      broadcastRoom(room);
    });

    // Throw a star — host activates after group agrees verbally
    // Each active player discards their lowest card face-up (not on pile)
    socket.on('mind_throw_star', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'mind' || room.state !== 'playing') return;
      if (room.hostId !== socket.id) return;
      if (room.mindStars <= 0) return;

      room.mindStars--;

      // Capture what each player discards before removing
      const starDiscards = [];
      for (const p of room.players) {
        if (p.mindCards?.length > 0) {
          starDiscards.push({ number: p.mindCards[0], playerName: p.name });
          p.mindCards = p.mindCards.slice(1);
        }
      }
      room.mindStarDiscards = [...(room.mindStarDiscards || []), ...starDiscards].sort((a, b) => a.number - b.number);

      checkAfterPlay(room);
      broadcastRoom(room);
    });

    socket.on('mind_next_level', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'mind' || room.hostId !== socket.id) return;
      if (room.state !== 'level_clear') return;

      room.mindLevel++;
      room.mindReward       = null;
      room.mindPile         = [];
      room.mindLastCard     = 0;
      room.mindMistakeCards = [];
      room.mindStarDiscards = [];
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
      room.mindReward       = null;
      room.mindGameOver     = false;
      room.mindWon          = false;
      room.mindStars        = 0;
      for (const p of room.players) p.mindCards = [];
      broadcastRoom(room);
    });
  }

  return { broadcastRoom, registerHandlers };
};
