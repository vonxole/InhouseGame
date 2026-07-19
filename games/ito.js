// games/ito.js — Ito game server module
module.exports = function itoModule(io, rooms, helpers) {
  const { getRoom } = helpers;

  // ── Topics ────────────────────────────────────────────────────────────────────
  const TOPICS = [
    { th: 'สัตว์',               en: 'Animals',          scale: 'เล็ก → ใหญ่',         scaleEn: 'Small → Big' },
    { th: 'ความเร็ว',            en: 'Speed',            scale: 'ช้า → เร็ว',          scaleEn: 'Slow → Fast' },
    { th: 'ความเผ็ด',            en: 'Spiciness',        scale: 'ไม่เผ็ด → เผ็ดมาก',   scaleEn: 'Mild → Fiery' },
    { th: 'เสียง',               en: 'Sound',            scale: 'เบา → ดัง',           scaleEn: 'Quiet → Loud' },
    { th: 'ราคา',                en: 'Price',            scale: 'ถูก → แพง',           scaleEn: 'Cheap → Expensive' },
    { th: 'ความอันตราย',         en: 'Danger',           scale: 'ปลอดภัย → อันตราย',   scaleEn: 'Safe → Deadly' },
    { th: 'ความน่ากลัว',         en: 'Scariness',        scale: 'น่ารัก → น่ากลัวมาก', scaleEn: 'Cute → Terrifying' },
    { th: 'แคลอรี่',             en: 'Calories',         scale: 'น้อย → สูงมาก',       scaleEn: 'Low cal → High cal' },
    { th: 'ความหวาน',            en: 'Sweetness',        scale: 'ไม่หวาน → หวานมาก',   scaleEn: 'Not sweet → Very sweet' },
    { th: 'ขนาดประเทศ',          en: 'Country Size',     scale: 'เล็ก → ใหญ่',         scaleEn: 'Small → Large' },
    { th: 'ความเหนื่อย (กีฬา)',  en: 'Sports Intensity', scale: 'ผ่อนคลาย → หนักมาก',  scaleEn: 'Easy → Extreme' },
    { th: 'ภัยพิบัติ',           en: 'Disasters',        scale: 'เล็กน้อย → รุนแรง',   scaleEn: 'Minor → Catastrophic' },
    { th: 'ความเค็ม',            en: 'Saltiness',        scale: 'จืด → เค็มมาก',       scaleEn: 'Bland → Very salty' },
    { th: 'ความเครียด',          en: 'Stress',           scale: 'ผ่อนคลาย → เครียดมาก', scaleEn: 'Relaxing → Stressful' },
    { th: 'ความยาก (เกม)',       en: 'Game Difficulty',  scale: 'ง่าย → ยากมาก',       scaleEn: 'Easy → Nightmare' },
    { th: 'ความสูง',             en: 'Height',           scale: 'เตี้ย → สูง',         scaleEn: 'Short → Tall' },
    { th: 'ปัญหาชีวิต',          en: 'Life Problems',    scale: 'เล็กน้อย → วิกฤต',    scaleEn: 'Minor → Crisis' },
    { th: 'แอลกอฮอล์',           en: 'Alcohol Strength', scale: 'ไม่มี → แรงมาก',      scaleEn: 'Alcohol-free → Very strong' },
    { th: 'กลิ่น',               en: 'Smell',            scale: 'หอม → เหม็นมาก',      scaleEn: 'Pleasant → Horrible' },
    { th: 'ความเร็ว (ยานพาหนะ)', en: 'Vehicles',         scale: 'ช้า → เร็วสุด',        scaleEn: 'Slow → Ultra fast' },
    { th: 'ความยาก (อาชีพ)',     en: 'Job Difficulty',   scale: 'ง่าย → ยากมาก',       scaleEn: 'Easy → Very tough' },
    { th: 'ความมืด',             en: 'Darkness',         scale: 'สว่าง → มืดสนิท',     scaleEn: 'Bright → Pitch black' },
    { th: 'สัตว์อันตราย',        en: 'Dangerous Animals', scale: 'ไม่อันตราย → ร้ายแรง', scaleEn: 'Harmless → Deadly' },
    { th: 'ความโรแมนติก',        en: 'Romantic Things',  scale: 'ธรรมดา → โรแมนติกมาก', scaleEn: 'Plain → Very romantic' },
    { th: 'ความฮา',              en: 'Funniness',        scale: 'ไม่ฮา → ฮามาก',       scaleEn: 'Not funny → Hilarious' },
    { th: 'ความนุ่มนวล',         en: 'Softness',         scale: 'แข็ง → นุ่มมาก',      scaleEn: 'Hard → Very soft' },
    { th: 'อุณหภูมิ',            en: 'Temperature',      scale: 'เย็น → ร้อนมาก',      scaleEn: 'Cold → Scorching' },
    { th: 'ความดัง (สัตว์)',      en: 'Animal Sounds',    scale: 'เงียบ → ดังมาก',      scaleEn: 'Silent → Very noisy' },
  ];

  function pickTopic() {
    return TOPICS[Math.floor(Math.random() * TOPICS.length)];
  }

  // ── Card dealing ──────────────────────────────────────────────────────────────
  function dealCards(room) {
    const activePlayers = room.players.filter(p => !p.disconnected);
    const totalCards    = activePlayers.length * room.itoLevel;

    // Fisher-Yates shuffle of 1..100
    const pool = Array.from({ length: 100 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const numbers = pool.slice(0, totalCards);

    let idx = 0;
    for (const p of activePlayers) {
      p.itoCards = numbers.slice(idx, idx + room.itoLevel).sort((a, b) => a - b);
      idx += room.itoLevel;
    }
    // Disconnected players get no cards
    for (const p of room.players.filter(p => p.disconnected)) {
      p.itoCards = [];
    }
  }

  // ── Broadcast ─────────────────────────────────────────────────────────────────
  function broadcastRoom(room) {
    const base = {
      code:     room.code,
      state:    room.state,
      gameType: 'ito',
      roomName: room.roomName,
      hostId:   room.hostId,
      players:  room.players.map(p => ({
        id:          p.id,
        name:        p.name,
        isHost:      p.isHost,
        disconnected: p.disconnected,
        cardCount:   p.itoCards?.length || 0,
      })),
      hearts:        room.itoHearts,
      maxHearts:     room.itoMaxHearts,
      level:         room.itoLevel,
      topic:         room.itoTopic || null,
      revealedCards: room.itoRevealedCards || [],
      totalCards:    room.itoTotalCards    || 0,
      mistakes:      room.itoMistakes      || 0,
      gameOver:      room.itoGameOver      || false,
      password:      room.password,
    };

    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (!sock) continue;
      sock.emit('room_update', {
        ...base,
        myCards: p.itoCards || [],
        isHost:  p.id === room.hostId,
      });
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────
  function registerHandlers(socket) {

    socket.on('ito_set_level', ({ level }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'ito' || room.hostId !== socket.id) return;
      if (![1, 2, 3].includes(level)) return;
      room.itoLevel = level;
      broadcastRoom(room);
    });

    socket.on('ito_set_hearts', ({ hearts }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'ito' || room.hostId !== socket.id) return;
      const h = parseInt(hearts);
      if (isNaN(h) || h < 1 || h > 10) return;
      room.itoMaxHearts = h;
      room.itoHearts    = h;
      broadcastRoom(room);
    });

    socket.on('ito_start', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'ito' || room.hostId !== socket.id) return;
      if (room.state !== 'lobby') return;
      const active = room.players.filter(p => !p.disconnected);
      if (active.length < 2) return;

      room.itoTopic        = pickTopic();
      dealCards(room);
      room.itoRevealedCards = [];
      room.itoTotalCards    = active.reduce((s, p) => s + (p.itoCards?.length || 0), 0);
      room.itoMistakes      = 0;
      room.itoGameOver      = false;
      room.state            = 'playing';
      broadcastRoom(room);
    });

    socket.on('ito_start_reveal', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'ito' || room.hostId !== socket.id) return;
      if (room.state !== 'playing') return;
      room.state = 'reveal';
      broadcastRoom(room);
    });

    socket.on('ito_reveal_card', ({ playerId, cardIndex }) => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'ito' || room.hostId !== socket.id) return;
      if (room.state !== 'reveal') return;

      const player = room.players.find(p => p.id === playerId);
      if (!player || !player.itoCards) return;

      // Skip if already revealed
      const already = room.itoRevealedCards.some(
        c => c.playerId === playerId && c.cardIndex === cardIndex
      );
      if (already) return;

      const number = player.itoCards[cardIndex];
      if (number === undefined) return;

      room.itoRevealedCards.push({
        playerId, playerName: player.name,
        cardIndex, number,
        order: room.itoRevealedCards.length,
      });

      // If all cards revealed → check & score
      if (room.itoRevealedCards.length === room.itoTotalCards) {
        const seq    = room.itoRevealedCards.map(c => c.number);
        let mistakes = 0, maxSeen = 0;
        for (const num of seq) {
          if (num < maxSeen) mistakes++;
          else maxSeen = num;
        }
        room.itoMistakes  = mistakes;
        room.itoHearts    = Math.max(0, room.itoHearts - mistakes);
        room.itoGameOver  = room.itoHearts <= 0;
        room.state        = 'result';
      }

      broadcastRoom(room);
    });

    socket.on('ito_next_round', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'ito' || room.hostId !== socket.id) return;
      if (room.state !== 'result' || room.itoGameOver) return;

      room.itoTopic         = pickTopic();
      dealCards(room);
      room.itoRevealedCards = [];
      room.itoTotalCards    = room.players
        .filter(p => !p.disconnected)
        .reduce((s, p) => s + (p.itoCards?.length || 0), 0);
      room.itoMistakes = 0;
      room.state       = 'playing';
      broadcastRoom(room);
    });

    socket.on('ito_back_lobby', () => {
      const room = getRoom(socket.id);
      if (!room || room.gameType !== 'ito' || room.hostId !== socket.id) return;
      room.state            = 'lobby';
      room.itoHearts        = room.itoMaxHearts;
      room.itoRevealedCards = [];
      room.itoMistakes      = 0;
      room.itoGameOver      = false;
      for (const p of room.players) p.itoCards = [];
      broadcastRoom(room);
    });
  }

  return { broadcastRoom, registerHandlers };
};
