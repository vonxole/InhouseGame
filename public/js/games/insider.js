// public/js/games/insider.js — Insider game frontend
// Defines handleInsiderRoomUpdate(room) called by app.js room_update handler

// ── Entry point ───────────────────────────────────────────────────────────────
function handleInsiderRoomUpdate(room) {
  const comingFromReveal = _prevRoomState === 'reveal';
  if (room.state !== 'lobby') _prevRoomState = room.state;
  document.getElementById('l-sticky-footer').style.display = room.state === 'lobby' ? 'block' : 'none';
  if (room.state === 'lobby')   renderLobby(room);
  else if (room.state === 'reveal')  renderReveal(room);
  else if (room.state === 'playing') {
    if (comingFromReveal) {
      startCountdown(() => renderPlaying(room));
    } else {
      renderPlaying(room);
    }
  }
  else if (room.state === 'voting')  renderVoting(room);
  else if (room.state === 'suspense') renderSuspense(room);
  else if (room.state === 'verdict') renderVerdict(room);
  else if (room.state === 'result')  renderResult(room);

  if (room.state === 'reveal' && typeof room.readyCount === 'number') {
    renderReadyDots(room.readyCount, room.players.length);
  }
}

// ── Countdown overlay ─────────────────────────────────────────────────────────
function startCountdown(onDone) {
  const overlay  = document.getElementById('countdown-overlay');
  const numEl    = document.getElementById('countdown-num');
  const labelEl  = document.getElementById('countdown-label');
  overlay.style.display = 'flex';
  let n = 5;
  function tick() {
    numEl.style.opacity   = '0';
    numEl.style.transform = 'scale(1.4)';
    setTimeout(() => {
      if (n > 0) {
        numEl.textContent   = n;
        labelEl.textContent = '';
        numEl.style.opacity   = '1';
        numEl.style.transform = 'scale(1)';
        n--;
        setTimeout(tick, 900);
      } else {
        numEl.textContent   = '🎮';
        labelEl.textContent = 'START!';
        numEl.style.opacity   = '1';
        numEl.style.transform = 'scale(1)';
        setTimeout(() => {
          overlay.style.display = 'none';
          onDone();
        }, 700);
      }
    }, 150);
  }
  tick();
}

// ── Auto-hide role card ───────────────────────────────────────────────────────
let _hideRoleTimer = null;
function _activeRoleOverlay() {
  // Return whichever role overlay is in an active screen
  if (document.getElementById('s-playing')?.style.display !== 'none')
    return document.getElementById('pl-hide-overlay');
  return document.getElementById('rv-hide-overlay');
}
function scheduleRoleHide(delayMs = 8000) {
  clearTimeout(_hideRoleTimer);
  _hideRoleTimer = setTimeout(() => {
    const overlay = _activeRoleOverlay();
    if (overlay) overlay.style.display = 'flex';
  }, delayMs);
}
function revealRoleTemporarily() {
  const overlay = _activeRoleOverlay();
  if (overlay) overlay.style.display = 'none';
  scheduleRoleHide(5000); // re-hide after 5s
}

// ── Insider reveal socket event ───────────────────────────────────────────────
socket.on('show_insider_reveal', () => {
  if (window._showInsiderReveal) window._showInsiderReveal();
});

// ── Lobby ─────────────────────────────────────────────────────────────────────
let _prevRoomState = null;
let _settingsOpen  = false;
function renderLobby(room) {
  // Collapse settings when transitioning TO lobby (e.g. after play again or first join)
  if (_prevRoomState !== 'lobby') {
    _settingsOpen = false;
    const body    = document.getElementById('l-settings-body');
    const chevron = document.getElementById('l-settings-chevron');
    if (body) body.style.display = 'none';
    if (chevron) {
      chevron.textContent      = 'Edit';
      chevron.style.background = 'rgba(124,58,237,0.18)';
      chevron.style.color      = 'var(--accent2)';
    }
  }
  _prevRoomState = 'lobby';
  show('s-lobby');

  // Hide Spyfall-specific lobby elements
  ['l-sf-settings-host', 'l-sf-settings-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Show Insider How to Play button
  const rulesBtnWrap  = document.getElementById('l-rules-btn');
  const rulesBtnInner = document.getElementById('l-rules-btn-inner');
  if (rulesBtnWrap)  rulesBtnWrap.style.display  = 'block';
  if (rulesBtnInner) rulesBtnInner.onclick = () => document.getElementById('htp-modal').style.display = 'flex';

  document.getElementById('l-code').textContent  = room.code;
  document.getElementById('l-count').textContent = `(${room.players.length})`;
  const chosen = room.chosenMasterId;
  document.getElementById('l-players').innerHTML = room.players.map(p => {
    const isMe      = p.name === myName;
    const isMasterP = p.id === chosen;
    const crownBtn  = isHost
      ? `<button onclick="setMaster('${p.id}')" title="${isMasterP ? 'Clear master' : 'Set as Master'}"
           style="padding:4px 8px;border-radius:99px;border:1.5px solid ${isMasterP ? 'var(--accent)' : 'var(--border)'};
                  background:${isMasterP ? 'rgba(124,58,237,0.2)' : 'transparent'};
                  color:${isMasterP ? 'var(--accent)' : 'var(--muted)'};font-size:0.85rem;cursor:pointer;">👑</button>`
      : (isMasterP ? `<span style="font-size:0.85rem;color:var(--accent);">👑</span>` : '');
    const kickBtn = isHost && !isMe && !p.isHost
      ? `<button onclick="kickPlayer('${p.id}')" style="padding:5px 10px;border-radius:99px;border:1.5px solid var(--red);background:transparent;color:var(--red);font-size:0.8rem;cursor:pointer;" title="Kick">✕</button>`
      : '';
    return `
    <div class="player-row">
      <div class="avatar">${p.name[0].toUpperCase()}</div>
      <div style="flex:1;">
        <div class="player-name">${p.name}</div>
        ${p.isHost ? '<div class="host-tag">Host</div>' : ''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;">${crownBtn}${kickBtn}</div>
    </div>`;
  }).join('');

  if (isHost) {
    document.getElementById('l-settings-host').style.display  = 'block';
    document.getElementById('l-examples-host').style.display  = 'block';
    document.getElementById('l-password-host').style.display  = 'block';
    document.getElementById('l-settings-view').style.display  = 'none';
    const btn  = document.getElementById('btn-start');
    const need = 4 - room.players.length;
    btn.style.display = 'block';
    btn.disabled      = need > 0;
    btn.textContent   = need > 0 ? `Need ${need} more player(s)` : 'Start Game 🎮';
    btn.onclick       = doStart;
    document.getElementById('l-footer-msg').textContent = '';
    syncPills('fg-lvl', room.filterLevels || []);
    syncSlider('sl-play',    'play-val',    room.playTime    || 180);
    syncSlider('sl-discuss', 'discuss-val', room.discussTime || 60);
    const showEx = room.showExamples !== false;
    document.getElementById('tog-examples').checked = showEx;
    document.getElementById('example-count-wrap').style.display = showEx ? 'block' : 'none';
    const cnt = room.exampleCount || 15;
    document.getElementById('sl-example-count').value        = cnt;
    document.getElementById('example-count-val').textContent = cnt;
    // Update summary line shown when accordion is collapsed
    const lvls    = room.filterLevels || [];
    const lvlText = lvls.length ? lvls.map(l => l[0].toUpperCase() + l.slice(1)).join(' · ') : 'All';
    const playMin = Math.round((room.playTime || 180) / 60);
    const discMin = Math.round((room.discussTime || 60) / 60);
    document.getElementById('l-settings-summary').textContent = `${lvlText} · ⏱ ${playMin}min · 💬 ${discMin}min`;
    const hasPw = !!room.password;
    document.getElementById('tog-password').checked = hasPw;
    document.getElementById('password-input-wrap').style.display = hasPw ? 'block' : 'none';
    if (hasPw) document.getElementById('inp-room-password').value = room.password;
  } else {
    document.getElementById('l-settings-host').style.display  = 'none';
    document.getElementById('l-examples-host').style.display  = 'none';
    document.getElementById('l-password-host').style.display  = 'none';
    document.getElementById('l-settings-view').style.display  = 'block';
    document.getElementById('btn-start').style.display        = 'none';
    document.getElementById('l-footer-msg').textContent       = 'Waiting for host to start…';
    const lvls     = room.filterLevels || [];
    const lvlChips = lvls.length
      ? lvls.map(l => levelChip(l)).join('')
      : `<span class="chip" style="background:var(--border);color:var(--muted);">All levels</span>`;
    const playLabel = fmtTime(room.playTime    || 180);
    const discLabel = fmtTime(room.discussTime || 60);
    const timerChips = `<span class="chip" style="background:var(--border);color:var(--muted);">⏱ ${playLabel}</span><span class="chip" style="background:var(--border);color:var(--muted);">💬 ${discLabel}</span>`;
    document.getElementById('l-setting-chips').innerHTML = lvlChips + timerChips;
  }

  const scores    = room.scores || [];
  const hasScores = scores.some(s => s.score > 0);
  document.getElementById('l-scoreboard').style.display = hasScores ? 'block' : 'none';
  if (hasScores) renderScoreboard(scores, 'l-score-list');
}

function kickPlayer(playerId) { socket.emit('kick_player', { playerId }); }
function setMaster(playerId)  { socket.emit('set_master',  { playerId }); }

function onTogglePassword(on) {
  const wrap = document.getElementById('password-input-wrap');
  wrap.style.display = on ? 'block' : 'none';
  if (!on) {
    document.getElementById('inp-room-password').value = '';
    socket.emit('set_password', { password: '' });
  } else {
    document.getElementById('inp-room-password').focus();
  }
}

function setFilter(type, val) {
  socket.emit('set_filter', { type, value: val });
}
function setTimer(type, seconds) {
  socket.emit('set_timer', { type, value: seconds });
}
function syncSlider(sliderId, valId, currentSecs) {
  const mins = Math.round(currentSecs / 60) || 1;
  const sl = document.getElementById(sliderId);
  if (sl) sl.value = Math.min(10, Math.max(1, mins));
  const vl = document.getElementById(valId);
  if (vl) vl.textContent = mins + ' min';
}
function onSliderInput(type, val) {
  const id = type === 'play' ? 'play-val' : 'discuss-val';
  const el = document.getElementById(id);
  if (el) el.textContent = val + ' min';
}

function toggleLobbySettings() {
  _settingsOpen = !_settingsOpen;
  const body    = document.getElementById('l-settings-body');
  const chevron = document.getElementById('l-settings-chevron');
  if (_settingsOpen) {
    body.style.display       = 'flex';
    body.style.flexDirection = 'column';
    chevron.textContent = 'Done';
    chevron.style.background = 'rgba(16,185,129,0.18)';
    chevron.style.color      = '#10b981';
  } else {
    body.style.display  = 'none';
    chevron.textContent = 'Edit';
    chevron.style.background = 'rgba(124,58,237,0.18)';
    chevron.style.color      = 'var(--accent2)';
  }
}

// ── Reveal ────────────────────────────────────────────────────────────────────
function renderReveal(room) {
  show('s-reveal');
  // Reset hide overlay and schedule auto-hide after 8s
  const hideOverlay = document.getElementById('rv-hide-overlay');
  if (hideOverlay) hideOverlay.style.display = 'none';
  scheduleRoleHide(8000);
  const defs = {
    master:  { icon: '👑', name: 'Master',  cls: 'role-master',
      desc: 'You know the word. Answer YES / NO / IDK to questions out loud. When someone guesses it, tap the button.' },
    insider: { icon: '🕵️', name: 'Insider', cls: 'role-insider',
      desc: 'You know the word secretly. Guide the team to guess it — without getting caught!' },
    common:  { icon: '🙋', name: 'Common',  cls: 'role-common',
      desc: "You don't know the word. Ask yes/no questions and try to figure it out — then find the Insider!" },
  };
  const d = defs[myRole];
  document.getElementById('rv-card').innerHTML =
    `<div class="role-card ${d.cls}"><div class="icon">${d.icon}</div><div class="name">${d.name}</div></div>`;

  const wordTextEl   = document.getElementById('rv-word-text');
  const insiderHintEl = document.getElementById('rv-insider-hint');

  if (myRole === 'master' || myRole === 'insider') {
    document.getElementById('rv-word-label').textContent = 'Secret Word';
    wordTextEl.textContent = room.myWord || '';
    wordTextEl.style.opacity = '1';
    const thaiPart    = room.myThai        ? `(${room.myThai})`                                          : '';
    const countryPart = myCountry          ? ` · ${myCountry}${myCountryThai ? ' · ' + myCountryThai : ''}` : '';
    document.getElementById('rv-word-thai').textContent = thaiPart + countryPart;
    document.getElementById('rv-cat').textContent = room.wordCategory || '';
    document.getElementById('rv-lvl').innerHTML   = myRole === 'master' ? levelChip(room.wordLevel) : '';
  } else {
    document.getElementById('rv-word-label').textContent = 'Secret Word';
    wordTextEl.textContent   = '???';
    wordTextEl.style.opacity = '0.2';
    document.getElementById('rv-word-thai').textContent = '';
    document.getElementById('rv-cat').textContent       = '';
    document.getElementById('rv-lvl').innerHTML         = '';
  }

  // Hint — plain text, same style for both master and insider
  document.getElementById('rv-hint').style.display = 'none'; // unused card
  if ((myRole === 'master' || myRole === 'insider') && room.myHint) {
    insiderHintEl.innerHTML =
      `<span style="color:var(--text);opacity:.7;">${room.myHint}</span>` +
      (room.myHintThai ? `<br><span style="opacity:.4;">${room.myHintThai}</span>` : '');
  } else {
    insiderHintEl.innerHTML = '';
  }

  document.getElementById('btn-reroll').style.display         = 'none';
  document.getElementById('btn-reroll-inline').style.display  = room.isMaster ? 'block' : 'none';
  document.getElementById('btn-insider-unknown').style.display = (myRole === 'insider' && !room.iAmReady) ? 'block' : 'none';

  const iAmReady  = room.iAmReady;
  const lockedOut = (myRole === 'insider' || myRole === 'common') && !room.masterIsReady;
  const btn = document.getElementById('btn-ready');
  if (iAmReady) {
    btn.textContent      = 'Cancel ✕';
    btn.style.background = 'transparent';
    btn.style.border     = '1.5px solid var(--muted)';
    btn.style.color      = 'var(--muted)';
    btn.disabled         = false;
    document.getElementById('rv-wait-msg').textContent = 'Waiting for others…';
  } else if (lockedOut) {
    btn.textContent      = '⏳ Waiting for Master…';
    btn.style.background = 'transparent';
    btn.style.border     = '1.5px solid var(--border)';
    btn.style.color      = 'var(--muted)';
    btn.disabled         = true;
    document.getElementById('rv-wait-msg').textContent = '';
  } else {
    btn.textContent      = 'Ready';
    btn.style.background = '';
    btn.style.border     = '';
    btn.style.color      = '';
    btn.disabled         = false;
    document.getElementById('rv-wait-msg').textContent = '';
  }
  renderReadyDots(room.revealsDone?.length || 0, room.players.length);

  const showEQ = myRole !== 'master' && room.showExamples;
  document.getElementById('rv-example-q').style.display = showEQ ? 'block' : 'none';
  if (showEQ) renderExampleQ('rv-eq-box', room.exampleCount || 15);
}

function renderReadyDots(done, total) {
  document.getElementById('rv-dots').innerHTML =
    Array.from({ length: total }, (_, i) =>
      `<div class="ready-dot${i < done ? ' done' : ''}"></div>`).join('');
}

function doReady() {
  const btn = document.getElementById('btn-ready');
  if (btn.textContent.startsWith('Cancel')) {
    socket.emit('reveal_unready');
  } else {
    socket.emit('reveal_done');
  }
}
function doReroll()         { socket.emit('reroll_word'); }
function doInsiderUnknown() { socket.emit('insider_unknown'); }

// ── Example Questions (Star Wars crawl) ───────────────────────────────────────
const _pick = arr => arr[Math.floor(Math.random() * arr.length)];

const EQ_GENERATORS = [
  () => _pick(['Is it a living thing?', 'Is it alive?', 'Does it grow?', 'Was it ever alive?']),
  () => _pick(['Is it a place?', 'Is it somewhere people go?', 'Can you visit it?']),
  () => `Is it made of ${_pick(['wood', 'metal', 'plastic', 'glass', 'fabric', 'paper', 'stone'])}?`,
  () => `Is it ${_pick(['bigger', 'smaller'])} than a ${_pick(['phone', 'car', 'book', 'chair', 'person', 'house'])}?`,
  () => _pick(['Is it used every day?', 'Do most people use it often?', 'Is it something you need daily?']),
  () => `Can you find it ${_pick(['at work', 'at home', 'in a store', 'outdoors', 'in a hospital', 'at school'])}?`,
  () => _pick(['Can one person carry it?', 'Can you hold it in one hand?', 'Is it easy to move?']),
  () => `Does it ${_pick(['make a sound', 'produce light', 'have a strong smell', 'have a colour', 'generate heat'])}?`,
  () => _pick(['Does it need electricity?', 'Does it run on a battery?', 'Does it need fuel to work?']),
  () => _pick(['Can you eat it?', 'Can you drink it?', 'Is it food or a drink?', 'Does it have a taste?']),
  () => _pick(['Is it related to technology?', 'Is it a kind of device?', 'Was it invented in the last 100 years?']),
  () => _pick(['Do you use it with your hands?', 'Can you wear it?', 'Does it touch your body?']),
  () => `Can you buy it ${_pick(['at a supermarket', 'online', 'at a pharmacy', 'at a department store'])}?`,
  () => _pick(['Can it move on its own?', 'Is it used for transport?', 'Does it travel fast?']),
  () => _pick(['Does it make you feel happy?', 'Can it change your mood?', 'Is it something people love?']),
  () => _pick(['Is it a type of person?', 'Is it related to a job?', 'Does someone use it at work?']),
  () => `Is it usually ${_pick(['indoors', 'outdoors', 'underground', 'in the water', 'in the sky'])}?`,
  () => _pick(['Is it used by children?', 'Is it for adults only?', 'Can anyone use it?', 'Is it for professionals?']),
  () => _pick(['Can you find it in every country?', 'Is it popular in Thailand?', 'Is it common in offices?']),
  () => `Can you ${_pick(['see', 'hear', 'touch', 'smell'])} it easily?`,
  () => _pick(['Is it an action, not a thing?', 'Is it something you do?', 'Is it a concept or idea?']),
  () => _pick(['Do most people own one?', 'Is it rare or expensive?', 'Can a child own it?']),
  () => _pick(['Does it exist in real life?', 'Is it a real thing, not fictional?', 'Can you actually see it in the real world?']),
  () => _pick(['Can you find it on a desk?', 'Is it used in an office?', 'Do students use it at school?', 'Is it stationery?']),
  () => _pick(['Can you write with it?', 'Does it need ink or lead?', 'Is it used for drawing or writing?']),
  () => _pick(['Does it have a screen?', 'Is it plugged into a computer?', 'Does it connect with a cable or wirelessly?']),
  () => _pick(['Is it made of paper?', 'Does it hold or organise paper?', 'Is it used for storing documents?']),
];

function onToggleExamples(on) {
  socket.emit('set_show_examples', { value: on });
  document.getElementById('example-count-wrap').style.display = on ? 'block' : 'none';
}

function renderExampleQ(boxId, count = 6) {
  const shuffled = EQ_GENERATORS.slice().sort(() => Math.random() - 0.5);
  const picked   = shuffled.slice(0, count).map(fn => fn());
  const items    = [...picked, ...picked].map(q => `<div class="eq-item">${q}</div>`).join('');
  document.getElementById(boxId).innerHTML =
    `<div class="eq-title">💬 Example Questions</div>` +
    `<div class="eq-crawl-wrap"><div class="eq-crawl">${items}</div></div>`;
}

// ── Playing ───────────────────────────────────────────────────────────────────
function renderPlaying(room) {
  show('s-playing');
  document.getElementById('pl-cat').textContent = myRole === 'master' ? '📂 ' + (room.wordCategory || '') : '';
  document.getElementById('pl-lvl').innerHTML   = myRole === 'master' ? levelChip(room.wordLevel) : '';

  const ANS = [
    { emoji:'✅', th:'ใช่',          color:'var(--green)', phrases:'Yes · That\'s right · Correct · Exactly · Absolutely' },
    { emoji:'❌', th:'ไม่ใช่',       color:'#ef4444',      phrases:'No · Not really · That\'s not it · Incorrect · Nope' },
    { emoji:'🟡', th:'ก้ำกึ่ง',      color:'var(--yellow)',phrases:'Kind of · Sort of · In a way · It depends · More or less' },
    { emoji:'☑️', th:'ส่วนใหญ่ใช่',  color:'var(--green)', phrases:'Mostly · Generally · For the most part · Usually yes' },
    { emoji:'🔹', th:'เป็นส่วนน้อย', color:'#3b82f6',      phrases:'A little · Slightly · Sometimes · Rarely · In some cases' },
    { emoji:'⬜', th:'ไม่ต้องสนใจ',  color:'var(--muted)', phrases:'Irrelevant · Doesn\'t apply · Skip that · N/A' },
  ];
  const answerGuide = `
    <hr style="border:none;border-top:1px solid var(--border);margin:12px 0 10px;">
    <div onclick="toggleAnswerGuide()" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;">
      <p class="muted" style="font-size:0.7rem;letter-spacing:.05em;margin:0;">💬 Answer Guide</p>
      <span id="ans-guide-chevron" class="muted" style="font-size:0.7rem;">▶</span>
    </div>
    <div id="ans-guide-body" style="display:none;margin-top:8px;display:none;flex-direction:column;gap:6px;">
      ${ANS.map(a => `
        <div style="display:flex;align-items:baseline;gap:7px;font-size:0.8rem;line-height:1.45;">
          <span style="font-size:0.9rem;flex-shrink:0;">${a.emoji}</span>
          <span style="font-weight:700;color:${a.color};flex-shrink:0;min-width:72px;">${a.th}</span>
          <span style="color:var(--muted);font-style:italic;">${a.phrases}</span>
        </div>`).join('')}
    </div>`;

  const countryLine = myCountry
    ? `<div style="font-size:0.78rem;color:var(--muted);opacity:.6;margin-top:1px;">${myCountry}${myCountryThai ? ' · ' + myCountryThai : ''}</div>`
    : '';
  const hintLine = room.myHint
    ? `<div style="margin-top:8px;font-size:0.8rem;color:var(--muted);font-style:italic;text-align:center;line-height:1.5;">${room.myHint}${room.myHintThai ? '<br><span style="opacity:.55;">' + room.myHintThai + '</span>' : ''}</div>`
    : '';

  const roleInfo = {
    master: `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="font-size:1.4rem;">👑</span>
        <span style="font-weight:700;">Master</span>
        <span class="muted" style="font-size:0.8rem;">— ตอบคำถาม Yes/No</span>
      </div>
      <div style="text-align:center;padding:8px 0;">
        <div class="muted" style="font-size:0.72rem;letter-spacing:.08em;margin-bottom:4px;">SECRET WORD</div>
        <div style="font-size:2rem;font-weight:800;color:var(--accent2);">${myWord}</div>
        ${myThai ? `<div style="font-size:0.9rem;color:var(--muted);margin-top:2px;">${myThai}</div>` : ''}
        ${countryLine}
      </div>
      ${hintLine}
      ${answerGuide}`,
    insider: `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:1.4rem;">🕵️</span>
        <div>
          <div style="font-weight:700;">Insider</div>
          <div style="font-size:0.88rem;margin-top:3px;">
            <span style="color:var(--accent2);font-weight:700;">${myWord}</span>
            ${myThai ? `<span class="muted"> — ${myThai}</span>` : ''}
          </div>
          ${countryLine}
        </div>
      </div>`,
    common: `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:1.4rem;">🙋</span>
        <div><div style="font-weight:700;">Common</div>
        <div class="muted" style="font-size:0.85rem;margin-top:2px;">ถามคำถาม Yes/No แล้วหา Insider</div></div>
      </div>`,
  };
  document.getElementById('pl-role-card').innerHTML = roleInfo[myRole] || '';
  document.getElementById('pl-master-btn').style.display   = 'none';
  document.getElementById('pl-timeup-btn').style.display   = myRole === 'master' ? 'flex' : 'none';
  document.getElementById('pl-answer-btns').style.display  = 'none'; // now embedded inside role card

  // Reset + schedule role hide
  const plOverlay = document.getElementById('pl-hide-overlay');
  if (plOverlay) plOverlay.style.display = 'none';
  scheduleRoleHide(10000);

  const plEQ = document.getElementById('pl-example-q');
  if (myRole !== 'master' && room.showExamples !== false) {
    plEQ.style.display = 'block';
    renderExampleQ('pl-eq-box', room.exampleCount || 15);
  } else {
    plEQ.style.display = 'none';
  }

  updateTimer(room.timeLeft ?? timerTotal);
}

socket.on('tick', t => updateTimer(t));

function updateTimer(t) {
  const el  = document.getElementById('pl-timer');
  const bar = document.getElementById('pl-bar');
  if (!el) return;
  el.textContent = fmtTime(t);
  el.className   = 'timer-big' + (t <= 30 ? ' crit' : t <= 60 ? ' warn' : '');
  const pct = (t / timerTotal) * 100;
  bar.style.width      = pct + '%';
  bar.style.background = t > 60 ? 'var(--green)' : t > 30 ? 'var(--yellow)' : 'var(--red)';
}

function doWordGuessed()    { socket.emit('word_guessed'); }
function doWordNotGuessed() { socket.emit('word_not_guessed'); }

function toggleAnswerGuide() {
  const body    = document.getElementById('ans-guide-body');
  const chevron = document.getElementById('ans-guide-chevron');
  if (!body) return;
  const open = body.style.display === 'flex';
  body.style.display    = open ? 'none' : 'flex';
  if (chevron) chevron.textContent = open ? '▶' : '▼';
}


// ── Voting ────────────────────────────────────────────────────────────────────
function renderVoting(room) {
  show('s-voting');
  document.getElementById('vt-cat').textContent = '';

  const totalVoters = room.totalVoters || room.players.length;
  const voted       = room.voteCount   || 0;
  document.getElementById('vt-vote-count').textContent   = `${voted}/${totalVoters} voted`;
  document.getElementById('vt-vote-fill').style.width    = totalVoters ? `${(voted / totalVoters) * 100}%` : '0%';

  const timerEl = document.getElementById('vt-timer');
  if (room.voteTimeLeft > 0) {
    timerEl.textContent = `⏱ ${room.voteTimeLeft}s`;
    timerEl.style.color = room.voteTimeLeft <= 10 ? 'var(--red)' : 'var(--yellow)';
  } else {
    timerEl.textContent = '✓ Time up — vote then find Insider!';
    timerEl.style.color = 'var(--muted)';
  }

  const myId    = room.players.find(p => p.name === myName)?.id;
  const iAmMaster = room.isMaster;
  document.getElementById('vt-players').innerHTML = room.players
    .filter(p => p.id !== room.masterPlayerId)
    .map(p => {
      const isMe   = p.id === myId;
      const voted  = room.myVote === p.id;
      const disabled = isMe || iAmMaster;
      const style  = voted
        ? 'background:rgba(124,58,237,0.25);border:1.5px solid var(--accent);color:var(--text);'
        : 'background:var(--card);border:1.5px solid var(--border);color:var(--muted);';
      return `<button onclick="doVote('${p.id}')" ${disabled ? 'disabled' : ''}
        style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;cursor:${disabled ? 'default' : 'pointer'};width:100%;text-align:left;${style}">
        <div class="avatar" style="width:36px;height:36px;font-size:1rem;">${p.name[0].toUpperCase()}</div>
        <span style="font-weight:600;font-size:0.95rem;">${p.name}${isMe ? ' (you)' : ''}</span>
        ${voted ? '<span style="margin-left:auto;color:var(--accent2);">✓ Your vote</span>' : ''}
      </button>`;
    }).join('');

  const canReveal = room.canReveal;
  document.getElementById('vt-host-btn').style.display = room.isMaster ? 'flex' : 'none';
  document.getElementById('vt-wait').style.display     = room.isMaster ? 'none' : 'block';
  if (room.isMaster) {
    const btn = document.getElementById('btn-reveal-insider');
    btn.disabled      = !canReveal;
    btn.style.opacity = canReveal ? '1' : '0.4';
    document.getElementById('vt-reveal-hint').textContent = canReveal
      ? 'Everyone voted — you can reveal now!'
      : 'Waiting for all votes or timer to end…';
  }
}
function doVote(targetId)     { socket.emit('cast_vote',     { targetId }); }
function doRevealInsider()    { socket.emit('reveal_insider'); }

// ── Suspense ──────────────────────────────────────────────────────────────────
function renderSuspense(room) {
  show('s-suspense');
  const name = room.accusedName || '???';
  document.getElementById('sp-accused-avatar').textContent = name[0].toUpperCase();
  document.getElementById('sp-accused-name').textContent   = name;
  const topEntry = (room.voteTally || []).find(e => e.name === name);
  document.getElementById('sp-accused-votes').textContent  = topEntry
    ? `${topEntry.votes} vote${topEntry.votes !== 1 ? 's' : ''}` : '';

  document.getElementById('sp-vote-tally').innerHTML = (room.voteTally || [])
    .filter(e => e.votes > 0)
    .map(e => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--card);border-radius:10px;margin-bottom:6px;">
        <span style="font-weight:600;">${e.name}</span>
        <span class="muted">${e.votes} vote${e.votes !== 1 ? 's' : ''}</span>
      </div>`).join('');

  const cdEl     = document.getElementById('sp-countdown');
  const openWrap = document.getElementById('sp-open-btn-wrap');
  const waitMsg  = document.getElementById('sp-wait-msg');

  function showSuspenseButtons() {
    cdEl.style.display = 'none';
    if (room.canOpenRole) {
      openWrap.style.display = 'flex';
      waitMsg.style.display  = 'none';
      document.getElementById('sp-open-hint').textContent = room.iAmAccused
        ? 'You got the most votes — reveal your role!'
        : 'As Master, you can reveal their role.';
    } else {
      openWrap.style.display = 'none';
      waitMsg.style.display  = 'block';
    }
  }

  showSuspenseButtons();
  if (!suspenseInterval) {
    cdEl.style.display = 'block';
    let t = 45;
    cdEl.textContent = `Auto-opening in ${t}s…`;
    suspenseInterval = setInterval(() => {
      t -= 1;
      if (t <= 0) {
        clearInterval(suspenseInterval); suspenseInterval = null;
        cdEl.style.display = 'none';
      } else {
        cdEl.textContent = `Auto-opening in ${t}s…`;
      }
    }, 1000);
  }
}
function doOpenRole() { socket.emit('open_role'); }

// ── Verdict ───────────────────────────────────────────────────────────────────
function renderVerdict(room) {
  show('s-verdict');
  if (verdictInterval) return;

  const caught      = room.insiderCaught;
  const accusedRole = room.accusedRole;
  const name        = room.accusedName || '???';
  const isTie       = room.isTie || !room.accusedName;

  const banner = document.getElementById('vd-banner');
  if (isTie) {
    banner.style.background = 'rgba(234,179,8,0.15)';
    banner.style.border     = '2px solid var(--yellow)';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">⚖️</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--yellow);">โหวตเสมอ!</div>
      <div style="margin-top:6px;font-size:1rem;color:var(--text);">ตกลงกันไม่ได้ — Insider หลุดรอด</div>`;
  } else if (caught) {
    banner.style.background = 'rgba(16,185,129,0.15)';
    banner.style.border     = '2px solid var(--green)';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">🎯</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--green);">Correct!</div>
      <div style="margin-top:6px;font-size:1rem;color:var(--text);">${name} is the Insider!</div>`;
  } else if (myRole === 'insider') {
    const taunts = [
      'They never had a chance 😏',
      'Too easy — was anyone even trying? 🤭',
      "Thanks for trusting me… too bad you shouldn't have 😈",
      'Even detectives fall for a good Insider 🕶️',
      'Fooled everyone — truly a gift 😇',
    ];
    const taunt = taunts[Math.floor(Math.random() * taunts.length)];
    banner.style.background = 'rgba(239,68,68,0.15)';
    banner.style.border     = '2px solid #ef4444';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">🏆</div>
      <div style="font-size:1.8rem;font-weight:800;color:#ef4444;">Insider</div>
      <div style="margin-top:10px;font-size:0.9rem;color:var(--muted);font-style:italic;">${taunt}</div>`;
  } else {
    banner.style.background = 'rgba(59,130,246,0.15)';
    banner.style.border     = '2px solid #3b82f6';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">❌</div>
      <div style="font-size:1.4rem;font-weight:700;color:#3b82f6;">Wrong!</div>
      <div style="margin-top:6px;font-size:1rem;color:var(--text);">${name} is not the Insider</div>`;
  }

  document.getElementById('vd-accused-role').innerHTML = '';

  const insiderRevealEl = document.getElementById('vd-insider-reveal');
  const revealNowBtn    = document.getElementById('vd-reveal-now-btn');
  const countdownEl     = document.getElementById('vd-countdown');
  insiderRevealEl.style.display = 'none';
  revealNowBtn.style.display    = 'none';

  function startCountdown(secs, onDone, labelFn) {
    let t = secs;
    countdownEl.textContent = labelFn(t);
    verdictInterval = setInterval(() => {
      t -= 1;
      countdownEl.textContent = labelFn(t);
      if (t <= 0) {
        clearInterval(verdictInterval); verdictInterval = null;
        onDone();
      }
    }, 1000);
  }

  function showInsiderReveal() {
    if (verdictInterval) { clearInterval(verdictInterval); verdictInterval = null; }
    revealNowBtn.style.display    = 'none';
    insiderRevealEl.style.display = 'block';
    insiderRevealEl.innerHTML = `
      <p style="font-size:0.8rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:10px;">The Real Insider</p>
      <div style="font-size:1.5rem;font-weight:700;">🕵️ ${room.insiderName || '???'}</div>`;
    if (isHost) document.getElementById('vd-summary-btn').style.display = 'block';
    startCountdown(45,
      () => socket.emit('confirm_result'),
      t  => `Going to summary in ${t}s…`
    );
  }

  window._showInsiderReveal = showInsiderReveal;

  if (caught) {
    if (isHost) document.getElementById('vd-summary-btn').style.display = 'block';
    startCountdown(45,
      () => socket.emit('confirm_result'),
      t  => `Going to summary in ${t}s…`
    );
  } else {
    const canRevealEarly = (myRole === 'insider' || myRole === 'master');
    if (canRevealEarly) revealNowBtn.style.display = 'block';
    startCountdown(45, showInsiderReveal, t => `Revealing Insider in ${t}s…`);
  }
}

function doRevealNow()    { socket.emit('trigger_reveal_now'); }
function doConfirmResult() { socket.emit('confirm_result'); }

async function doLeaveRoom() {
  const ok = await showConfirm('Leave this room?', 'Leave');
  if (!ok) return;
  socket.emit('leave_room');
  clearSession();
  myName = ''; myRole = null; myWord = null; myThai = null; myCountry = null; myCountryThai = null; isHost = false;
  clearTimeout(_hideRoleTimer);
  document.getElementById('l-sticky-footer').style.display = 'none';
  show('s-home');
}

// ── Result ────────────────────────────────────────────────────────────────────
function renderResult(room) {
  show('s-result');
  const caught      = room.winnerTeam === 'common';
  const noWinner    = room.winnerTeam === 'none';
  const insiderName = room.insiderName || '???';
  const b           = `<strong style="color:var(--accent2);">${insiderName}</strong>`;
  const noWinnerTaunts = [
    `No points for anyone — and ${b} was zero help 🙄`,
    `${b} was the Insider and still let everyone lose. Thanks! 👏`,
    `${b}'s one job was to help guess the word… apparently forgot 😶`,
    `Word not guessed. ${b}, what were you doing? 🤦`,
  ];
  const noWinnerTaunt = noWinnerTaunts[Math.floor(Math.random() * noWinnerTaunts.length)];

  document.getElementById('res-icon').textContent  = noWinner ? '⏰' : caught ? '🎉' : '🕵️';
  document.getElementById('res-title').textContent = noWinner ? 'No one wins!' : caught ? 'Insider Caught!' : 'Insider Wins!';
  document.getElementById('res-subtitle').innerHTML = noWinner
    ? noWinnerTaunt
    : caught
      ? 'Common players successfully identified the Insider'
      : 'The Insider escaped — better luck next time!';
  document.getElementById('res-word').textContent      = room.word      || '—';
  document.getElementById('res-word-thai').textContent = room.wordThai  || '';
  document.getElementById('res-insider').textContent   = room.insiderName || '—';
  document.getElementById('res-accused').textContent   = room.accusedName  || '(tie — no clear winner)';

  const maxVotes = Math.max(...(room.voteTally || []).map(t => t.votes));
  document.getElementById('res-tally').innerHTML = (room.voteTally || []).map(t => {
    const pct      = maxVotes > 0 ? (t.votes / maxVotes) * 100 : 0;
    const isTop    = t.votes === maxVotes && maxVotes > 0;
    const isInsider = t.name === room.insiderName;
    const barColor = isInsider ? 'var(--red)' : 'var(--accent)';
    return `<div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
        <span style="font-size:0.88rem;font-weight:${isTop ? 700 : 400};">${t.name}${isInsider ? ' 🕵️' : ''}</span>
        <span style="font-size:0.88rem;color:var(--muted);">${t.votes} vote${t.votes !== 1 ? 's' : ''}</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.5s;"></div>
      </div>
    </div>`;
  }).join('');

  if (room.scores && room.scores.length > 0) {
    document.getElementById('res-scoreboard-wrap').style.display = 'block';
    renderScoreboard(room.scores, 'res-score-list');
  }
  document.getElementById('res-host-btn').style.display = room.amHost ? 'block'  : 'none';
  document.getElementById('res-wait').style.display     = room.amHost ? 'none'   : 'block';
}

function renderScoreboard(scores, containerId) {
  const el = document.getElementById(containerId);
  if (!scores || scores.length === 0) { el.innerHTML = ''; return; }
  const maxScore = scores[0]?.score || 0;
  el.innerHTML = scores.map((s, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const pct   = maxScore > 0 ? (s.score / maxScore) * 100 : 0;
    return `<div style="display:flex;align-items:center;gap:10px;">
      <span style="width:28px;text-align:center;font-size:1rem;">${medal}</span>
      <div style="flex:1;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:0.88rem;font-weight:${i === 0 ? 700 : 400};">${s.name}</span>
          <span style="font-size:0.88rem;color:var(--accent2);font-weight:700;">${s.score} pt${s.score !== 1 ? 's' : ''}</span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:99px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:99px;"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Lobby actions ─────────────────────────────────────────────────────────────
function doStart()     { socket.emit('start_game'); }
function doPlayAgain() { socket.emit('play_again'); }
function doLeave()     { clearSession(); location.reload(); }
