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
  Animals:          'hbsp-cat-animals',
  'Food & Drinks':  'hbsp-cat-food',
  Brands:           'hbsp-cat-brands',
  Characters:       'hbsp-cat-characters',
  Concepts:         'hbsp-cat-concepts',
  Countries:        'hbsp-cat-countries',
  'Gadgets & Tools':'hbsp-cat-gadgets',
  Landmarks:        'hbsp-cat-landmarks',
  Objects:          'hbsp-cat-objects',
  Occupations:      'hbsp-cat-occupations',
  'Office & School':'hbsp-cat-office',
  Places:           'hbsp-cat-places',
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
  if (_hbCategories.length > 0) pool = pool.filter(w => _hbCategories.includes(w.category));
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

// ── Unused (kept for socket dispatch compatibility) ───────────────────────────
function handleHeadbandRoomUpdate() {}
