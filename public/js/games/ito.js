// public/js/games/ito.js — Ito game frontend

// ── Entry point ───────────────────────────────────────────────────────────────
function handleItoRoomUpdate(room) {
  // Sticky footer: lobby only
  const footer = document.getElementById('l-sticky-footer');
  if (footer) footer.style.display = room.state === 'lobby' ? 'block' : 'none';

  if      (room.state === 'lobby')   itoRenderLobby(room);
  else if (room.state === 'playing') itoRenderPlaying(room);
  else if (room.state === 'reveal')  itoRenderReveal(room);
  else if (room.state === 'result')  itoRenderResult(room);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function itoHeartBar(hearts, maxHearts) {
  let html = '';
  for (let i = 0; i < maxHearts; i++) {
    html += `<span style="opacity:${i < hearts ? 1 : 0.2}">${i < hearts ? '❤️' : '🖤'}</span>`;
  }
  return html;
}

function itoChip(label, color) {
  return `<span style="font-size:0.75rem;background:${color}22;color:${color};border-radius:6px;padding:2px 8px;font-weight:600;">${label}</span>`;
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function itoRenderLobby(room) {
  show('s-lobby');

  document.getElementById('l-code').textContent  = room.code;
  document.getElementById('l-count').textContent = `(${room.players.length})`;

  // Player list
  document.getElementById('l-players').innerHTML = room.players.map(p => {
    const isMe    = p.name === myName;
    const kickBtn = isHost && !isMe && !p.isHost
      ? `<button onclick="socket.emit('kick_player',{playerId:'${p.id}'})" style="padding:5px 10px;border-radius:99px;border:1.5px solid var(--red);background:transparent;color:var(--red);font-size:0.8rem;cursor:pointer;">✕</button>`
      : '';
    return `
      <div class="player-row">
        <div class="avatar">${p.name[0].toUpperCase()}</div>
        <div style="flex:1;">
          <div class="player-name">${p.name}</div>
          ${p.isHost ? '<div class="host-tag">Host</div>' : ''}
        </div>
        ${kickBtn}
      </div>`;
  }).join('');

  // Hide all game-specific settings panels
  [
    'l-settings-host','l-examples-host','l-settings-view',
    'l-sf-settings-host','l-sf-settings-view',
    'l-ito-settings-host','l-ito-settings-view',
    'l-password-host',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Rules button (hide for Ito)
  const rulesBtnWrap = document.getElementById('l-rules-btn');
  if (rulesBtnWrap) rulesBtnWrap.style.display = 'none';

  if (isHost) {
    document.getElementById('l-ito-settings-host').style.display = 'block';
    document.getElementById('l-password-host').style.display      = 'block';

    // Sync level buttons
    itoSetLevelUI(room.level || 1);

    // Sync hearts slider
    const h    = room.maxHearts || 3;
    const sl   = document.getElementById('sl-ito-hearts');
    const hval = document.getElementById('ito-hearts-val');
    if (sl)   sl.value          = h;
    if (hval) hval.textContent  = h;

  } else {
    document.getElementById('l-ito-settings-view').style.display = 'block';
    const chips = document.getElementById('l-ito-setting-chips');
    if (chips) chips.innerHTML = [
      itoChip(`Level ${room.level || 1}`, '#f97316'),
      itoChip(`${room.maxHearts || 3} ❤️`, '#ef4444'),
    ].join('');
  }

  // Start button
  const btn = document.getElementById('btn-start');
  if (btn) {
    btn.style.display = isHost ? 'block' : 'none';
    btn.textContent   = '▶ เริ่มเกม';
    btn.onclick       = () => socket.emit('ito_start');
  }
}

// Level UI helper (highlights active button)
function itoSetLevelUI(level) {
  [1, 2, 3].forEach(l => {
    const btn = document.getElementById(`ito-lvl-${l}`);
    if (!btn) return;
    btn.style.background = l === level ? 'var(--accent2)' : '';
    btn.style.color      = l === level ? '#fff' : '';
  });
}

// Called from onclick
function itoSetLevel(level) {
  socket.emit('ito_set_level', { level });
  itoSetLevelUI(level);
}

// ── Playing ───────────────────────────────────────────────────────────────────
function itoRenderPlaying(room) {
  show('s-ito-playing');

  // Hearts
  document.getElementById('ito-pl-hearts').innerHTML = itoHeartBar(room.hearts, room.maxHearts);

  // Topic
  const topic = room.topic || {};
  document.getElementById('ito-pl-topic-th').textContent = topic.th  || '';
  document.getElementById('ito-pl-topic-en').textContent = topic.en  || '';
  document.getElementById('ito-pl-scale').innerHTML =
    `<span style="color:#f97316;">${topic.scale || ''}</span>` +
    (topic.scaleEn ? `<br><span style="opacity:.6;">${topic.scaleEn}</span>` : '');

  // My cards
  const cards = room.myCards || [];
  document.getElementById('ito-pl-cards').innerHTML = cards.map(n => `
    <div style="
      width:80px;height:110px;border-radius:14px;
      background:linear-gradient(135deg,#f97316,#ea580c);
      color:#fff;display:flex;align-items:center;justify-content:center;
      font-size:2.6rem;font-weight:900;
      box-shadow:0 4px 20px rgba(249,115,22,.4);
    ">${n}</div>`).join('');

  // Host / non-host
  document.getElementById('ito-pl-host-btn').style.display = isHost  ? 'block' : 'none';
  document.getElementById('ito-pl-wait').style.display     = !isHost ? 'block' : 'none';
}

// ── Reveal ────────────────────────────────────────────────────────────────────
function itoRenderReveal(room) {
  show('s-ito-reveal');

  // Hearts
  document.getElementById('ito-rv-hearts').innerHTML = itoHeartBar(room.hearts, room.maxHearts);

  // Topic
  const topic = room.topic || {};
  document.getElementById('ito-rv-topic').textContent = `${topic.th || ''} / ${topic.en || ''}`;
  document.getElementById('ito-rv-scale').textContent = `${topic.scale || ''} · ${topic.scaleEn || ''}`;

  // Progress
  const revealed = room.revealedCards?.length || 0;
  document.getElementById('ito-rv-progress').textContent =
    `เปิดแล้ว ${revealed} / ${room.totalCards} ใบ`;

  // Build a map of revealed cards for quick lookup
  const revealMap = {};
  for (const c of (room.revealedCards || [])) {
    revealMap[`${c.playerId}-${c.cardIndex}`] = c;
  }

  // Card grid — group by player
  const cardCount = room.level || 1;
  const grid      = document.getElementById('ito-rv-grid');
  grid.innerHTML  = room.players.filter(p => !p.disconnected && p.cardCount > 0).map(p => {
    const cardsHtml = Array.from({ length: cardCount }).map((_, idx) => {
      const key      = `${p.id}-${idx}`;
      const revealed = revealMap[key];
      const order    = revealed ? revealed.order + 1 : null;
      const num      = revealed ? revealed.number   : null;
      const isWrong  = revealed && room.state === 'result' && /* check sequence */ false; // handled in result

      if (isHost && !revealed) {
        // Tappable face-down card
        return `
          <div onclick="socket.emit('ito_reveal_card',{playerId:'${p.id}',cardIndex:${idx}})"
            style="
              width:64px;height:88px;border-radius:10px;
              background:linear-gradient(135deg,#374151,#1f2937);
              border:2px solid var(--border);cursor:pointer;
              display:flex;align-items:center;justify-content:center;
              font-size:1.5rem;transition:transform .1s;
            "
            onmouseover="this.style.transform='scale(1.05)'"
            onmouseout="this.style.transform=''">
            ?
          </div>`;
      } else if (revealed) {
        return `
          <div style="
            width:64px;height:88px;border-radius:10px;
            background:linear-gradient(135deg,#f97316,#ea580c);
            color:#fff;display:flex;flex-direction:column;align-items:center;
            justify-content:center;gap:2px;position:relative;
          ">
            <div style="font-size:0.6rem;opacity:.7;">No.${order}</div>
            <div style="font-size:1.8rem;font-weight:900;line-height:1;">${num}</div>
          </div>`;
      } else {
        // Non-host, not yet revealed
        return `
          <div style="
            width:64px;height:88px;border-radius:10px;
            background:linear-gradient(135deg,#374151,#1f2937);
            border:2px solid var(--border);
            display:flex;align-items:center;justify-content:center;
            font-size:1.5rem;opacity:.5;
          ">?</div>`;
      }
    }).join('');

    return `
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:80px;text-align:right;">
          <div style="font-size:0.88rem;font-weight:600;">${p.name}</div>
          ${p.id === room.hostId ? '<div style="font-size:0.7rem;color:var(--muted);">Host</div>' : ''}
        </div>
        <div style="display:flex;gap:8px;">${cardsHtml}</div>
      </div>`;
  }).join('');

  // Host hint
  const hint = document.getElementById('ito-rv-host-hint');
  if (hint) hint.style.display = isHost ? 'block' : 'none';
}

// ── Result ────────────────────────────────────────────────────────────────────
function itoRenderResult(room) {
  show('s-ito-result');

  const mistakes = room.mistakes || 0;
  const won      = mistakes === 0;
  const gameOver = room.gameOver;

  document.getElementById('ito-res-icon').textContent    = gameOver ? '💀' : won ? '🎉' : '😬';
  document.getElementById('ito-res-title').textContent   = gameOver ? 'เกมจบ!' : won ? 'เยี่ยม!' : 'ลองใหม่!';
  document.getElementById('ito-res-subtitle').innerHTML  = gameOver
    ? 'หัวใจหมดแล้ว — เกมสิ้นสุด'
    : won
      ? `เรียงถูกต้องทุกใบ! ไม่เสียหัวใจ 🏆`
      : `เรียงผิด ${mistakes} ใบ — เสียหัวใจ ${mistakes} ดวง`;

  // Hearts
  document.getElementById('ito-res-hearts').innerHTML = itoHeartBar(room.hearts, room.maxHearts);

  // Sequence
  const seq = room.revealedCards || [];
  let maxSeen = 0;
  document.getElementById('ito-res-sequence').innerHTML = seq.map((c, i) => {
    const wrong = c.number < maxSeen;
    if (c.number > maxSeen) maxSeen = c.number;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <div style="
          width:48px;height:66px;border-radius:8px;
          background:${wrong ? 'rgba(239,68,68,.2)' : 'rgba(249,115,22,.15)'};
          border:1.5px solid ${wrong ? '#ef4444' : '#f97316'};
          color:${wrong ? '#ef4444' : '#f97316'};
          display:flex;align-items:center;justify-content:center;
          font-size:1.4rem;font-weight:800;
        ">${c.number}</div>
        <div style="font-size:0.65rem;color:var(--muted);text-align:center;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.playerName}</div>
      </div>`;
  }).join('');

  // Host buttons
  const hostBtns = document.getElementById('ito-res-host-btns');
  const nextBtn  = document.getElementById('ito-res-next-btn');
  if (hostBtns) hostBtns.style.display = isHost ? 'flex' : 'none';
  if (nextBtn)  nextBtn.style.display  = !gameOver ? 'block' : 'none';
}
