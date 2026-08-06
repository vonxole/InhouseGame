// public/js/games/mind.js — The Mind frontend

function handleMindRoomUpdate(room) {
  const footer = document.getElementById('l-sticky-footer');
  if (footer) footer.style.display = room.state === 'lobby' ? 'block' : 'none';

  if      (room.state === 'lobby')       mindRenderLobby(room);
  else if (room.state === 'playing')     mindRenderPlaying(room);
  else if (room.state === 'mistake')     mindRenderMistake(room);
  else if (room.state === 'level_clear') mindRenderLevelClear(room);
  else if (room.state === 'result')      mindRenderResult(room);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mindHearts(lives, maxLives) {
  let h = '';
  for (let i = 0; i < maxLives; i++)
    h += `<span style="opacity:${i < lives ? 1 : 0.2}">${i < lives ? '❤️' : '🖤'}</span>`;
  return h;
}

function mindCard(n, dim = false) {
  return `<div style="
    width:56px;height:78px;border-radius:10px;
    background:${dim ? 'rgba(6,182,212,.08)' : 'linear-gradient(135deg,#06b6d4,#0891b2)'};
    border:${dim ? '1.5px solid rgba(6,182,212,.3)' : 'none'};
    color:${dim ? 'rgba(6,182,212,.4)' : '#fff'};
    display:flex;align-items:center;justify-content:center;
    font-size:1.4rem;font-weight:900;
    box-shadow:${dim ? 'none' : '0 3px 12px rgba(6,182,212,.35)'};
  ">${n}</div>`;
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function mindRenderLobby(room) {
  show('s-lobby');
  document.getElementById('l-code').textContent  = room.code;
  document.getElementById('l-count').textContent = `(${room.players.length})`;

  document.getElementById('l-players').innerHTML = room.players.map(p => {
    const isMe    = p.name === myName;
    const kickBtn = isHost && !isMe && !p.isHost
      ? `<button onclick="socket.emit('kick_player',{playerId:'${p.id}'})" style="padding:5px 10px;border-radius:99px;border:1.5px solid var(--red);background:transparent;color:var(--red);font-size:0.8rem;cursor:pointer;">✕</button>`
      : '';
    return `<div class="player-row">
      <div class="avatar">${p.name[0].toUpperCase()}</div>
      <div style="flex:1;"><div class="player-name">${p.name}</div>${p.isHost ? '<div class="host-tag">Host</div>' : ''}</div>
      ${kickBtn}
    </div>`;
  }).join('');

  [
    'l-settings-host','l-examples-host','l-settings-view',
    'l-sf-settings-host','l-sf-settings-view',
    'l-ito-settings-host','l-ito-settings-view',
    'l-mind-settings-host','l-mind-settings-view',
    'l-password-host',
  ].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

  const rulesBtnWrap = document.getElementById('l-rules-btn');
  if (rulesBtnWrap) rulesBtnWrap.style.display = 'none';

  if (isHost) {
    document.getElementById('l-mind-settings-host').style.display = 'block';
    document.getElementById('l-password-host').style.display      = 'block';

    const ml = room.maxLevel || 5;
    const lv = room.maxLives || 3;
    const slML = document.getElementById('sl-mind-maxlv');
    const slLV = document.getElementById('sl-mind-lives');
    if (slML) { slML.value = ml; document.getElementById('mind-maxlv-val').textContent = ml; }
    if (slLV) { slLV.value = lv; document.getElementById('mind-lives-val').textContent = lv; }
  } else {
    document.getElementById('l-mind-settings-view').style.display = 'block';
    const chips = document.getElementById('l-mind-setting-chips');
    if (chips) chips.innerHTML =
      `<span style="font-size:.75rem;background:rgba(6,182,212,.15);color:#06b6d4;border-radius:6px;padding:2px 8px;font-weight:600;">${room.maxLevel || 5} Levels</span>` +
      `<span style="font-size:.75rem;background:rgba(239,68,68,.15);color:#ef4444;border-radius:6px;padding:2px 8px;font-weight:600;">${room.maxLives || 3} ❤️</span>`;
  }

  const btn = document.getElementById('btn-start');
  if (btn) {
    const need = 2 - room.players.length;
    btn.style.display = isHost ? 'block' : 'none';
    btn.disabled      = need > 0;
    btn.textContent   = need > 0 ? `Need ${need} more player(s)` : '▶ เริ่มเกม';
    btn.onclick       = () => socket.emit('mind_start');
  }
}

// ── Playing ───────────────────────────────────────────────────────────────────
function mindRenderPlaying(room) {
  show('s-mind-playing');

  // Lives + level
  document.getElementById('mind-pl-lives').innerHTML = mindHearts(room.lives, room.maxLives);
  document.getElementById('mind-pl-level').textContent = `Level ${room.level} / ${room.maxLevel}`;

  // Last card
  const lastEl   = document.getElementById('mind-pl-last');
  const lastByEl = document.getElementById('mind-pl-last-by');
  const top      = room.pileTop?.slice(-1)[0];
  if (top) {
    lastEl.textContent   = top.number;
    lastEl.style.color   = top.mistake ? '#ef4444' : '#06b6d4';
    lastByEl.textContent = top.playerName;
  } else {
    lastEl.textContent   = '—';
    lastEl.style.color   = '#06b6d4';
    lastByEl.textContent = '';
  }

  // Other players
  const others = room.players.filter(p => p.name !== myName && !p.disconnected);
  document.getElementById('mind-pl-others').innerHTML = others.map(p =>
    `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="font-size:0.8rem;font-weight:600;">${p.name}</div>
      <div style="font-size:0.78rem;color:var(--muted);">🃏 ×${p.cardCount}</div>
    </div>`
  ).join('');

  // My cards
  const myCards = room.myCards || [];
  document.getElementById('mind-pl-my-cards').innerHTML =
    myCards.map((n, i) => mindCard(n, i > 0)).join('');

  const btn     = document.getElementById('mind-pl-btn');
  const noCards = document.getElementById('mind-pl-no-cards');
  if (myCards.length > 0) {
    btn.style.display     = 'block';
    noCards.style.display = 'none';
    btn.textContent = `วาง ${myCards[0]} 🃏`;
  } else {
    btn.style.display     = 'none';
    noCards.style.display = 'block';
  }
}

// ── Mistake ───────────────────────────────────────────────────────────────────
function mindRenderMistake(room) {
  show('s-mind-mistake');

  document.getElementById('mind-mk-lives').innerHTML = mindHearts(room.lives, room.maxLives);

  const revealed = room.mistakeCards || [];
  document.getElementById('mind-mk-cards').innerHTML = revealed.length
    ? revealed.map(c =>
        `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div style="
            width:52px;height:72px;border-radius:9px;
            background:rgba(239,68,68,.15);border:1.5px solid #ef4444;
            color:#ef4444;display:flex;align-items:center;justify-content:center;
            font-size:1.3rem;font-weight:900;
          ">${c.number}</div>
          <div style="font-size:0.65rem;color:var(--muted);text-align:center;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.playerName}</div>
        </div>`
      ).join('')
    : `<p class="muted" style="font-size:0.85rem;">ไม่มีไพ่ที่ตกหล่น</p>`;
}

// ── Level clear ───────────────────────────────────────────────────────────────
function mindRenderLevelClear(room) {
  show('s-mind-level-clear');

  document.getElementById('mind-lc-title').textContent =
    `Level ${room.level} ผ่านแล้ว! 🎉`;
  document.getElementById('mind-lc-lives').innerHTML = mindHearts(room.lives, room.maxLives);

  const hostBtn = document.getElementById('mind-lc-host-btn');
  const waitEl  = document.getElementById('mind-lc-wait');
  if (hostBtn) hostBtn.style.display = isHost ? 'block' : 'none';
  if (waitEl)  waitEl.style.display  = !isHost ? 'block' : 'none';

  const nextBtn = hostBtn?.querySelector('button');
  if (nextBtn) nextBtn.textContent = `Level ${room.level + 1} →`;
}

// ── Result ────────────────────────────────────────────────────────────────────
function mindRenderResult(room) {
  show('s-mind-result');

  document.getElementById('mind-res-icon').textContent    = room.won ? '🏆' : '💀';
  document.getElementById('mind-res-title').textContent   = room.won ? 'ชนะแล้ว!' : 'เกมจบ!';
  document.getElementById('mind-res-subtitle').textContent = room.won
    ? `ผ่านทุก ${room.maxLevel} Level! สุดยอด!`
    : `หมดชีวิตที่ Level ${room.level}`;

  document.getElementById('mind-res-lives').innerHTML = mindHearts(room.lives, room.maxLives);

  const hostBtns = document.getElementById('mind-res-host-btns');
  if (hostBtns) hostBtns.style.display = isHost ? 'flex' : 'none';
}
