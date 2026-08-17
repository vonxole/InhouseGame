// public/js/games/headband.js — Headband (คำบนหัว) standalone client-side game

let _hbWords        = [];       // full word bank fetched from server
let _hbPlayers      = [];       // [{ name }]
let _hbScores       = [];       // [{ name, seconds }]
let _hbCurrentIdx   = 0;
let _hbCategories   = [];    // empty = all
let _hbLevels       = [];    // empty = all
let _hbHistory      = new Set();
let _hbTimerInterval= null;
let _hbTimerStart   = null;
let _hbCurrentWord  = null;

// Speed Round state
let _hbMode         = 'classic'; // 'classic' | 'speed'
let _hbTimeLimit    = 60;
let _hbSpeedCorrect = [];
let _hbSpeedPassed  = [];
let _hbSpeedTimeLeft= 60;
let _hbSpeedInterval= null;
let _hbSwipeLocked  = false;
let _hbTouchStartY  = 0;
let _hbTouchStartX  = 0;

// ── Entry point (from home screen button) ────────────────────────────────────
async function hbGoSetup() {
  if (_hbWords.length === 0) {
    try {
      const res = await fetch('/api/words');
      _hbWords  = await res.json();
    } catch (e) {
      alert('โหลดคำไม่ได้ กรุณาลองใหม่'); return;
    }
  }
  _hbPlayers    = [];
  _hbScores     = [];
  _hbHistory    = new Set();
  _hbCategories = [];
  _hbLevels     = [];
  _hbMode       = 'classic';
  hbRenderPlayerList();
  hbSyncPills();
  hbSetMode('classic');
  hbSetTime(1);
  // Unmark float-bar for headband screens
  show('s-hb-setup');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';
}

// ── Player management ─────────────────────────────────────────────────────────
// _hbPlayers = [{ name, levels: [] }]  levels=[] means use global / all

function hbAddPlayer() {
  const inp  = document.getElementById('hb-player-input');
  const name = inp.value.trim();
  if (!name || _hbPlayers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    inp.value = ''; return;
  }
  _hbPlayers.push({ name, levels: [] });
  inp.value = '';
  hbRenderPlayerList();
}

function hbRemovePlayer(idx) {
  _hbPlayers.splice(idx, 1);
  hbRenderPlayerList();
}

function hbTogglePlayerLevel(idx, lvl) {
  const p   = _hbPlayers[idx];
  const pos = p.levels.indexOf(lvl);
  if (pos === -1) p.levels.push(lvl);
  else            p.levels.splice(pos, 1);
  hbRenderPlayerList();
}

const LVL_COLORS = { easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444' };

function hbRenderPlayerList() {
  const list = document.getElementById('hb-player-list');
  list.innerHTML = _hbPlayers.map((p, i) => {
    const pills = ['easy','medium','hard'].map(l => {
      const active = p.levels.includes(l);
      const c      = LVL_COLORS[l];
      return `<button onclick="hbTogglePlayerLevel(${i},'${l}')" style="
        padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;cursor:pointer;
        border:1.5px solid ${active ? c : 'var(--border)'};
        background:${active ? c + '22' : 'transparent'};
        color:${active ? c : 'var(--muted)'};
      ">${l}</button>`;
    }).join('');
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;flex-wrap:wrap;">
      <div class="avatar" style="width:32px;height:32px;font-size:0.85rem;flex-shrink:0;">${p.name[0].toUpperCase()}</div>
      <div style="font-size:0.95rem;font-weight:600;flex:1;min-width:60px;">${p.name}</div>
      <div style="display:flex;gap:4px;">${pills}</div>
      <button onclick="hbRemovePlayer(${i})"
        style="background:transparent;border:none;color:var(--muted);font-size:1rem;cursor:pointer;flex-shrink:0;">✕</button>
    </div>`;
  }).join('');

  const startBtn = document.getElementById('hb-setup-start-btn');
  if (startBtn) {
    const ok = _hbPlayers.length === 0 || _hbPlayers.length >= 2;
    startBtn.disabled = !ok;
    startBtn.style.opacity = ok ? '1' : '.4';
  }
}

// ── Settings (multi-select) ───────────────────────────────────────────────────
const HB_CAT_IDS = {
  Animals:            'hbsp-cat-animals',
  'Artists & Celebs': 'hbsp-cat-artists',
  Brands:             'hbsp-cat-brands',
  Characters:         'hbsp-cat-characters',
  Concepts:           'hbsp-cat-concepts',
  Countries:          'hbsp-cat-countries',
  'Food & Drinks':    'hbsp-cat-food',
  'Gadgets & Tools':  'hbsp-cat-gadgets',
  Landmarks:          'hbsp-cat-landmarks',
  'Movies & Cartoons':'hbsp-cat-movies',
  Objects:            'hbsp-cat-objects',
  Occupations:        'hbsp-cat-occupations',
  'Office & School':  'hbsp-cat-office',
  Places:             'hbsp-cat-places',
};

function hbToggleCat(cat) {
  const idx = _hbCategories.indexOf(cat);
  if (idx === -1) _hbCategories.push(cat);
  else            _hbCategories.splice(idx, 1);
  hbSyncPills();
}

function hbToggleLvl(lvl) {
  const idx = _hbLevels.indexOf(lvl);
  if (idx === -1) _hbLevels.push(lvl);
  else            _hbLevels.splice(idx, 1);
  hbSyncPills();
}

function hbSyncPills() {
  Object.entries(HB_CAT_IDS).forEach(([cat, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', _hbCategories.includes(cat));
  });
  ['easy','medium','hard'].forEach(l => {
    const el = document.getElementById(`hbsp-lvl-${l}`);
    if (el) el.classList.toggle('active', _hbLevels.includes(l));
  });
}

// ── Word picking ──────────────────────────────────────────────────────────────
function hbPickWord(playerLevels) {
  // Use player-specific levels if set, else fall back to global levels
  const levels = (playerLevels && playerLevels.length > 0) ? playerLevels : _hbLevels;
  let pool = _hbWords;
  if (_hbCategories.length > 0) pool = pool.filter(w =>
    (w.categories || [w.category]).some(c => _hbCategories.includes(c)));
  if (levels.length        > 0) pool = pool.filter(w => levels.includes(w.level));
  if (pool.length === 0) pool = _hbWords;
  let fresh = pool.filter(w => !_hbHistory.has(w.word));
  if (fresh.length === 0) { _hbHistory.clear(); fresh = pool; }
  const w = fresh[Math.floor(Math.random() * fresh.length)];
  _hbHistory.add(w.word);
  return w;
}

// ── Game flow ─────────────────────────────────────────────────────────────────
function hbStartGame() {
  _hbCurrentIdx = 0;
  _hbScores     = [];
  _hbHistory    = new Set();
  hbShowTurn();
}

function hbShowTurn() {
  const noPlayers = _hbPlayers.length === 0;
  const player    = noPlayers ? null : _hbPlayers[_hbCurrentIdx];
  _hbCurrentWord  = hbPickWord(player ? player.levels : []);

  // Reset turn UI
  document.getElementById('hb-whose-turn').textContent = noPlayers ? '' : `${player.name} กำลังเล่น`;
  document.getElementById('hb-timer').textContent           = '0:00';
  document.getElementById('hb-pre-start').style.display    = 'flex';
  document.getElementById('hb-word-area').style.display    = 'none';
  document.getElementById('hb-btn-start').style.display    = 'block';
  document.getElementById('hb-btn-stop').style.display     = 'none';
  document.getElementById('hb-btn-change').style.display   = 'none';

  clearInterval(_hbTimerInterval);
  _hbTimerStart = null;

  show('s-hb-turn');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';
}

function hbBeginTurn() {
  const w = _hbCurrentWord;
  // Show word
  document.getElementById('hb-word-emoji').textContent = w.emoji || '';
  document.getElementById('hb-word-en').textContent    = w.word  || '';
  document.getElementById('hb-word-thai').textContent  = w.thai  || '';
  const ctEl = document.getElementById('hb-word-country');
  if (ctEl) {
    ctEl.style.display = w.country ? 'block' : 'none';
    if (w.country) document.getElementById('hb-word-country-text').textContent = `${w.country} · ${w.countryThai}`;
  }
  const srEl = document.getElementById('hb-word-series');
  if (srEl) {
    srEl.style.display = w.series ? 'block' : 'none';
    if (w.series) document.getElementById('hb-word-series-text').textContent = `${w.series} · ${w.seriesThai}`;
  }
  document.getElementById('hb-word-cat').textContent   = w.category || '';
  const lvlEl = document.getElementById('hb-word-level');
  if (lvlEl && w.level) {
    const c = { easy:'#22c55e', medium:'#f59e0b', hard:'#ef4444' }[w.level] || 'var(--muted)';
    lvlEl.textContent = w.level;
    lvlEl.style.color = lvlEl.style.borderColor = c;
  }
  document.getElementById('hb-pre-start').style.display    = 'none';
  document.getElementById('hb-word-area').style.display    = 'flex';
  document.getElementById('hb-btn-start').style.display    = 'none';
  document.getElementById('hb-btn-stop').style.display     = 'block';
  document.getElementById('hb-btn-change').style.display   = 'block';

  // Start timer
  _hbTimerStart = Date.now();
  clearInterval(_hbTimerInterval);
  _hbTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _hbTimerStart) / 1000);
    const el = document.getElementById('hb-timer');
    if (el) el.textContent = fmtTime(elapsed);
  }, 500);
}

function hbChangeWord() {
  const player   = _hbPlayers[_hbCurrentIdx] || null;
  _hbCurrentWord = hbPickWord(player ? player.levels : []);
  const w        = _hbCurrentWord;
  document.getElementById('hb-word-emoji').textContent = w.emoji || '';
  document.getElementById('hb-word-en').textContent   = w.word  || '';
  document.getElementById('hb-word-thai').textContent = w.thai  || '';
  const ctEl2 = document.getElementById('hb-word-country');
  if (ctEl2) {
    ctEl2.style.display = w.country ? 'block' : 'none';
    if (w.country) document.getElementById('hb-word-country-text').textContent = `${w.country} · ${w.countryThai}`;
  }
  const srEl2 = document.getElementById('hb-word-series');
  if (srEl2) {
    srEl2.style.display = w.series ? 'block' : 'none';
    if (w.series) document.getElementById('hb-word-series-text').textContent = `${w.series} · ${w.seriesThai}`;
  }
  document.getElementById('hb-word-cat').textContent  = w.category || '';
  const lvlEl = document.getElementById('hb-word-level');
  if (lvlEl && w.level) {
    const c = LVL_COLORS[w.level] || 'var(--muted)';
    lvlEl.textContent = w.level;
    lvlEl.style.color = lvlEl.style.borderColor = c;
  }
}

function hbStopTurn() {
  clearInterval(_hbTimerInterval);
  const elapsed   = _hbTimerStart ? Math.round((Date.now() - _hbTimerStart) / 1000) : 0;
  const noPlayers = _hbPlayers.length === 0;
  const label     = noPlayers ? (_hbCurrentWord?.word || '') : _hbPlayers[_hbCurrentIdx].name;
  _hbScores.push({ name: label, seconds: elapsed });

  document.getElementById('hb-done-name').textContent = label;
  document.getElementById('hb-done-time').textContent = fmtTime(elapsed);

  const nextBtn = document.getElementById('hb-next-btn');
  if (nextBtn) nextBtn.textContent = _hbPlayers.length === 0 ? 'คำถัดไป →' : 'คนถัดไป →';

  show('s-hb-turn-done');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';
}

function hbNextTurn() {
  if (_hbPlayers.length === 0) {
    hbShowTurn(); // no-player mode: just pick next word
    return;
  }
  _hbCurrentIdx++;
  if (_hbCurrentIdx >= _hbPlayers.length) {
    hbShowResult();
  } else {
    hbShowTurn();
  }
}

function hbShowResult() {
  const sorted  = [..._hbScores].sort((a, b) => a.seconds - b.seconds);
  const medals  = ['🥇','🥈','🥉'];
  document.getElementById('hb-leaderboard').innerHTML = sorted.map((s, i) =>
    `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i<sorted.length-1?'border-bottom:1px solid var(--border);':''}">
      <span style="font-size:1.5rem;width:32px;text-align:center;">${medals[i] || `${i+1}.`}</span>
      <div style="flex:1;font-weight:600;">${s.name}</div>
      <div style="font-size:1.2rem;font-weight:800;color:#ca8a04;">${fmtTime(s.seconds)}</div>
    </div>`
  ).join('');

  show('s-hb-result');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';
}

function hbEndGame() {
  clearInterval(_hbTimerInterval);
  hbShowResult();
}

function hbRestartGame() {
  _hbCurrentIdx = 0;
  _hbScores     = [];
  _hbHistory    = new Set();
  hbShowTurn();
}

// ── Mode / Time setup ─────────────────────────────────────────────────────────
function hbSetMode(mode) {
  _hbMode = mode;
  const isSpeed = mode === 'speed';
  const modeClassic = document.getElementById('hbsp-mode-classic');
  const modeSpeed   = document.getElementById('hbsp-mode-speed');
  const timeWrap    = document.getElementById('hbsp-time-wrap');
  if (modeClassic) {
    modeClassic.style.borderColor  = isSpeed ? 'var(--border)' : 'var(--accent)';
    modeClassic.style.background   = isSpeed ? 'transparent'   : 'rgba(202,138,4,.15)';
    modeClassic.style.color        = isSpeed ? 'var(--muted)'  : '#ca8a04';
  }
  if (modeSpeed) {
    modeSpeed.style.borderColor    = isSpeed ? '#22c55e'        : 'var(--border)';
    modeSpeed.style.background     = isSpeed ? 'rgba(34,197,94,.15)' : 'transparent';
    modeSpeed.style.color          = isSpeed ? '#22c55e'        : 'var(--muted)';
  }
  if (timeWrap) timeWrap.style.display = isSpeed ? 'flex' : 'none';
  if (isSpeed) hbSetTime(_hbTimeLimit / 60);
}

function hbSetTime(mins) {
  _hbTimeLimit = mins * 60;
  const el = document.getElementById('hbsp-time-display');
  if (el) el.textContent = mins;
}

function hbAdjustTime(delta) {
  const current = _hbTimeLimit / 60;
  const next    = Math.min(10, Math.max(1, current + delta));
  hbSetTime(next);
}

function hbStartGameMode() {
  if (_hbMode === 'speed') hbStartSpeedGame();
  else hbStartGame();
}

// ── Speed Round core ──────────────────────────────────────────────────────────
function hbStartSpeedGame() {
  _hbSpeedCorrect  = [];
  _hbSpeedPassed   = [];
  _hbHistory       = new Set();
  _hbSpeedTimeLeft = _hbTimeLimit;
  _hbSwipeLocked   = false;

  // Init display
  hbSpeedShowWord(hbPickWord([]));

  // Start countdown
  clearInterval(_hbSpeedInterval);
  hbSpeedUpdateTimer();
  _hbSpeedInterval = setInterval(() => {
    _hbSpeedTimeLeft--;
    hbSpeedUpdateTimer();
    if (_hbSpeedTimeLeft <= 0) hbSpeedEnd();
  }, 1000);

  show('s-hb-speed');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';

  // Attach swipe listeners
  const area = document.getElementById('hb-speed-word-area');
  if (area) {
    area.ontouchstart = hbTouchStart;
    area.ontouchend   = hbTouchEnd;
    area.onmousedown  = e => { _hbTouchStartY = e.clientY; };
    area.onmouseup    = e => { hbHandleSwipeDelta(_hbTouchStartY - e.clientY); };
  }
}

function hbSpeedShowWord(w) {
  _hbCurrentWord = w;
  _hbSwipeLocked = false;

  const inner = document.getElementById('hb-speed-word-inner');
  if (inner) { inner.style.transform = ''; inner.style.opacity = '1'; }

  document.getElementById('hb-speed-emoji').textContent = w.emoji || '';
  document.getElementById('hb-speed-word').textContent  = w.word  || '';
  document.getElementById('hb-speed-thai').textContent  = w.thai  || '';
  document.getElementById('hb-speed-cat').textContent   = w.category || '';

  const sr = document.getElementById('hb-speed-series');
  if (sr) {
    sr.style.display = w.series ? 'block' : 'none';
    if (w.series) document.getElementById('hb-speed-series-text').textContent = `${w.series} · ${w.seriesThai}`;
  }
  const ct = document.getElementById('hb-speed-country');
  if (ct) {
    ct.style.display = w.country ? 'block' : 'none';
    if (w.country) document.getElementById('hb-speed-country-text').textContent = `${w.country} · ${w.countryThai}`;
  }

  hbSpeedUpdateScore();
}

function hbSpeedUpdateTimer() {
  const t   = _hbSpeedTimeLeft;
  const el  = document.getElementById('hb-speed-timer');
  const bar = document.getElementById('hb-speed-bar');
  if (el) {
    el.textContent = fmtTime(t);
    const pct = t / _hbTimeLimit;
    const color = pct > .5 ? '#22c55e' : pct > .25 ? '#f59e0b' : '#ef4444';
    el.style.color = color;
    if (bar) { bar.style.width = (pct * 100) + '%'; bar.style.background = color; }
  }
}

function hbSpeedUpdateScore() {
  const el = document.getElementById('hb-speed-score');
  if (el) el.textContent = `✅ ${_hbSpeedCorrect.length}  ⏭️ ${_hbSpeedPassed.length}`;
}

// ── Swipe detection ───────────────────────────────────────────────────────────
function hbTouchStart(e) {
  _hbTouchStartY = e.touches[0].clientY;
  _hbTouchStartX = e.touches[0].clientX;
}

function hbTouchEnd(e) {
  const dy = _hbTouchStartY - e.changedTouches[0].clientY;
  const dx = Math.abs(_hbTouchStartX - e.changedTouches[0].clientX);
  if (dx > Math.abs(dy)) return; // horizontal swipe → ignore
  hbHandleSwipeDelta(dy);
}

function hbHandleSwipeDelta(dy) {
  if (_hbSwipeLocked || _hbSpeedTimeLeft <= 0) return;
  if (Math.abs(dy) < 60) return; // threshold
  _hbSwipeLocked = true;
  if (dy > 0) hbSpeedSwipe('correct');
  else        hbSpeedSwipe('pass');
}

function hbSpeedSwipe(result) {
  const w     = _hbCurrentWord;
  const inner = document.getElementById('hb-speed-word-inner');
  const flash = document.getElementById('hb-speed-flash');

  if (result === 'correct') {
    _hbSpeedCorrect.push(w);
    if (flash) { flash.style.background = '#22c55e'; flash.style.opacity = '.25'; }
    if (inner) inner.style.transform = 'translateY(-80px)';
  } else {
    _hbSpeedPassed.push(w);
    if (flash) { flash.style.background = '#ef4444'; flash.style.opacity = '.2'; }
    if (inner) inner.style.transform = 'translateY(80px)';
  }
  if (inner) inner.style.opacity = '0';

  setTimeout(() => {
    if (flash) flash.style.opacity = '0';
    if (_hbSpeedTimeLeft > 0) hbSpeedShowWord(hbPickWord([]));
  }, 220);
}

function hbSpeedEnd() {
  clearInterval(_hbSpeedInterval);
  _hbSpeedTimeLeft = 0;

  // Detach listeners
  const area = document.getElementById('hb-speed-word-area');
  if (area) { area.ontouchstart = null; area.ontouchend = null; area.onmousedown = null; area.onmouseup = null; }

  hbShowSpeedResult();
}

function hbShowSpeedResult() {
  const total   = _hbSpeedCorrect.length + _hbSpeedPassed.length;
  const summary = document.getElementById('hb-speed-summary');
  if (summary) summary.textContent = `ถูก ${_hbSpeedCorrect.length} / ${total} คำ ใน ${fmtTime(_hbTimeLimit)}`;

  const list = document.getElementById('hb-speed-list');
  if (list) {
    const rows = [
      ..._hbSpeedCorrect.map(w => `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:rgba(34,197,94,.1);border-radius:10px;border-left:3px solid #22c55e;">
          <span style="font-size:1.3rem;">${w.emoji || '📝'}</span>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:0.95rem;">${w.word}</div>
            <div style="font-size:0.78rem;color:var(--muted);">${w.thai}</div>
          </div>
          <span style="font-size:1rem;">✅</span>
        </div>`),
      ..._hbSpeedPassed.map(w => `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:rgba(239,68,68,.08);border-radius:10px;border-left:3px solid #ef4444;">
          <span style="font-size:1.3rem;">${w.emoji || '📝'}</span>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:0.95rem;">${w.word}</div>
            <div style="font-size:0.78rem;color:var(--muted);">${w.thai}</div>
          </div>
          <span style="font-size:1rem;">⏭️</span>
        </div>`),
    ];
    list.innerHTML = rows.join('');
  }

  show('s-hb-speed-result');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';
}

// ── Unused (kept for socket dispatch compatibility) ───────────────────────────
function handleHeadbandRoomUpdate() {}
