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
  hbRenderPlayerList();
  hbSyncPills();
  // Unmark float-bar for headband screens
  show('s-hb-setup');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';
}

// ── Player management ─────────────────────────────────────────────────────────
function hbAddPlayer() {
  const inp  = document.getElementById('hb-player-input');
  const name = inp.value.trim();
  if (!name || _hbPlayers.some(p => p.toLowerCase() === name.toLowerCase())) {
    inp.value = ''; return;
  }
  _hbPlayers.push(name);
  inp.value = '';
  hbRenderPlayerList();
}

function hbRemovePlayer(idx) {
  _hbPlayers.splice(idx, 1);
  hbRenderPlayerList();
}

function hbRenderPlayerList() {
  const list = document.getElementById('hb-player-list');
  list.innerHTML = _hbPlayers.map((name, i) =>
    `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;">
      <div class="avatar" style="width:32px;height:32px;font-size:0.85rem;">${name[0].toUpperCase()}</div>
      <div style="flex:1;font-size:0.95rem;font-weight:600;">${name}</div>
      <button onclick="hbRemovePlayer(${i})"
        style="background:transparent;border:none;color:var(--muted);font-size:1rem;cursor:pointer;">✕</button>
    </div>`
  ).join('');
  const startBtn = document.getElementById('hb-setup-start-btn');
  if (startBtn) {
    startBtn.disabled = _hbPlayers.length < 2;
    startBtn.style.opacity = _hbPlayers.length < 2 ? '.4' : '1';
  }
}

// ── Settings (multi-select) ───────────────────────────────────────────────────
const HB_CAT_IDS = {
  General:'hbsp-cat-general', Objects:'hbsp-cat-objects',
  Characters:'hbsp-cat-characters', Cities:'hbsp-cat-cities', Drinks:'hbsp-cat-drinks',
  Occupations:'hbsp-cat-occupations', 'Office & School':'hbsp-cat-office', Places:'hbsp-cat-places',
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
function hbPickWord() {
  let pool = _hbWords;
  if (_hbCategories.length > 0) pool = pool.filter(w => _hbCategories.includes(w.category));
  if (_hbLevels.length     > 0) pool = pool.filter(w => _hbLevels.includes(w.level));
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
  _hbCurrentWord = hbPickWord();
  const name     = _hbPlayers[_hbCurrentIdx];

  // Reset turn UI
  document.getElementById('hb-whose-turn').textContent     = `${name} กำลังเล่น`;
  document.getElementById('hb-timer').textContent           = '0:00';
  document.getElementById('hb-pre-start').style.display    = 'flex';
  document.getElementById('hb-word-area').style.display    = 'none';
  document.getElementById('hb-btn-start').style.display    = 'block';
  document.getElementById('hb-btn-stop').style.display     = 'none';

  clearInterval(_hbTimerInterval);
  _hbTimerStart = null;

  show('s-hb-turn');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';
}

function hbBeginTurn() {
  const w = _hbCurrentWord;
  // Show word
  document.getElementById('hb-word-en').textContent    = w.word  || '';
  document.getElementById('hb-word-thai').textContent  = w.thai  || '';
  document.getElementById('hb-word-cat').textContent   = w.category || '';
  const lvlEl = document.getElementById('hb-word-level');
  if (lvlEl && w.level) {
    const c = { easy:'#22c55e', medium:'#f59e0b', hard:'#ef4444' }[w.level] || 'var(--muted)';
    lvlEl.textContent = w.level;
    lvlEl.style.color = lvlEl.style.borderColor = c;
  }
  document.getElementById('hb-pre-start').style.display = 'none';
  document.getElementById('hb-word-area').style.display = 'flex';
  document.getElementById('hb-btn-start').style.display = 'none';
  document.getElementById('hb-btn-stop').style.display  = 'block';

  // Start timer
  _hbTimerStart = Date.now();
  clearInterval(_hbTimerInterval);
  _hbTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _hbTimerStart) / 1000);
    const el = document.getElementById('hb-timer');
    if (el) el.textContent = fmtTime(elapsed);
  }, 500);
}

function hbStopTurn() {
  clearInterval(_hbTimerInterval);
  const elapsed = _hbTimerStart ? Math.round((Date.now() - _hbTimerStart) / 1000) : 0;
  const name    = _hbPlayers[_hbCurrentIdx];
  _hbScores.push({ name, seconds: elapsed });

  document.getElementById('hb-done-name').textContent = name;
  document.getElementById('hb-done-time').textContent = fmtTime(elapsed);

  show('s-hb-turn-done');
  const bar = document.getElementById('float-bar');
  if (bar) bar.style.display = 'none';
}

function hbNextTurn() {
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

function hbRestartGame() {
  _hbCurrentIdx = 0;
  _hbScores     = [];
  _hbHistory    = new Set();
  hbShowTurn();
}

// ── Unused (kept for socket dispatch compatibility) ───────────────────────────
function handleHeadbandRoomUpdate() {}
