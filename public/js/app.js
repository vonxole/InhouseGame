// app.js — Shared frontend: socket, globals, home, room list, modal tabs, question guide
// Loaded before games/insider.js so handleInsiderRoomUpdate is available by first room_update

const socket = io();

let myName  = '';
let myRole  = null;
let myWord  = null;
let myThai  = null;
let isHost  = false;
let timerTotal       = 180;
let verdictInterval  = null;
let suspenseInterval = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function levelChip(lvl) {
  if (!lvl || lvl === 'All') return '';
  return `<span class="chip chip-${lvl}">${lvl.charAt(0).toUpperCase() + lvl.slice(1)}</span>`;
}

function syncPills(groupId, selected) {
  const arr = Array.isArray(selected) ? selected.map(s => s.toLowerCase()) : [];
  document.querySelectorAll(`#${groupId} .pill`).forEach(btn => {
    const v = btn.textContent.trim().toLowerCase();
    btn.classList.toggle('active', arr.includes(v));
  });
}

// ── Session persistence ───────────────────────────────────────────────────────
function saveSession(code, name) {
  sessionStorage.setItem('insider_session', JSON.stringify({ code, name }));
}
function clearSession() {
  sessionStorage.removeItem('insider_session');
}

// ── Connect / rejoin ──────────────────────────────────────────────────────────
socket.on('connect', () => {
  const raw = sessionStorage.getItem('insider_session');
  if (!raw) return;
  try {
    const { code, name } = JSON.parse(raw);
    if (code && name) { myName = name; socket.emit('rejoin_room', { code, name }); }
  } catch (e) { clearSession(); }
});

socket.on('rejoin_failed', () => {
  clearSession();
  show('s-home');
  toast('Session ended — please rejoin');
});

// ── Home ──────────────────────────────────────────────────────────────────────
function showPickGame() {
  myName = document.getElementById('inp-name').value.trim();
  if (!myName) return toast('Enter your name first');
  show('s-pick-game');
}

function doCreate(gameType) {
  socket.emit('create_room', { name: myName, gameType: gameType || 'insider' });
}

function doJoin() {
  myName = document.getElementById('inp-name').value.trim();
  const code = document.getElementById('inp-code').value.trim().toUpperCase();
  if (!myName) return toast('Enter your name first');
  if (!code)   return toast('Enter a room code');
  socket.emit('join_room', { code, name: myName });
}

document.getElementById('inp-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') doJoin();
});

socket.on('room_created', () => { });

// ── Room list ─────────────────────────────────────────────────────────────────
socket.on('rooms_list', (list) => {
  const wrap = document.getElementById('room-list-wrap');
  const el   = document.getElementById('room-list');
  if (!wrap || !el) return;
  if (list.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  const gameLabel = { insider: '🕵️ Insider', spyfall: '🕵️ Spyfall' };
  el.innerHTML = list.map(r => `
    <div onclick="doJoinRoom('${r.code}', ${r.hasPassword})" style="
      display:flex;justify-content:space-between;align-items:center;
      padding:10px 14px;border-radius:12px;border:1.5px solid var(--border);
      cursor:pointer;background:var(--card);transition:border-color .15s;
    " onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div>
        <span style="font-size:0.75rem;background:rgba(124,58,237,.2);color:var(--accent2);border-radius:5px;padding:1px 7px;font-weight:600;margin-right:8px;">${gameLabel[r.gameType] || '🎮'}</span>
        <span class="muted" style="font-size:0.85rem;">by ${r.host}</span>
      </div>
      <span class="muted" style="font-size:0.82rem;">${r.hasPassword ? '🔒 ' : ''}👥 ${r.count}</span>
    </div>
  `).join('');
});

function doJoinRoom(code, hasPassword) {
  const name = document.getElementById('inp-name').value.trim();
  if (!name) {
    toast('Enter your name first ☝️');
    document.getElementById('inp-name').focus();
    return;
  }
  myName = name;
  if (hasPassword) {
    showPasswordModal(code, name);
  } else {
    socket.emit('join_room', { code, name, password: '' });
  }
}

// ── Room Update — route to game handler ───────────────────────────────────────
socket.on('room_update', (room) => {
  if (myName) saveSession(room.code, myName);

  myRole = room.role;
  myWord = room.myWord || null;
  myThai = room.myThai || null;
  if (room.state === 'reveal') console.log('[role received]', myName, '→', myRole, '| word:', myWord);
  isHost      = room.amHost === true;
  timerTotal  = room.totalTime || 180;

  if (room.state !== 'verdict' && verdictInterval) {
    clearInterval(verdictInterval); verdictInterval = null;
  }
  if (room.state !== 'suspense' && suspenseInterval) {
    clearInterval(suspenseInterval); suspenseInterval = null;
  }

  const gameType = room.gameType || 'insider';
  if (gameType === 'insider')  handleInsiderRoomUpdate(room);
  else if (gameType === 'spyfall') handleSpyfallRoomUpdate(room);
});

// ── Shared socket events ──────────────────────────────────────────────────────
socket.on('kicked', () => {
  clearSession();
  myName = '';
  document.getElementById('l-sticky-footer').style.display = 'none';
  show('s-home');
  toast('You have been removed from the room');
});

socket.on('player_left', ({ name }) => toast(`👋 ${name} left the room`));

socket.on('error', msg => toast('⚠️ ' + msg));

// ── Confirm modal ─────────────────────────────────────────────────────────────
let _confirmResolve = null;
function showConfirm(msg, okLabel = 'Confirm') {
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-ok').textContent  = okLabel;
  document.getElementById('confirm-modal').style.display = 'flex';
  return new Promise(res => { _confirmResolve = res; });
}
function resolveConfirm(val) {
  document.getElementById('confirm-modal').style.display = 'none';
  if (_confirmResolve) { _confirmResolve(val); _confirmResolve = null; }
}

// ── Password modal ────────────────────────────────────────────────────────────
let _pwModalCode = '', _pwModalName = '';
function showPasswordModal(code, name) {
  _pwModalCode = code; _pwModalName = name;
  document.getElementById('pw-input').value = '';
  document.getElementById('pw-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('pw-input').focus(), 50);
}
function closePwModal() {
  document.getElementById('pw-modal').style.display = 'none';
}
function submitPwModal() {
  const pw = document.getElementById('pw-input').value.trim();
  closePwModal();
  socket.emit('join_room', { code: _pwModalCode, name: _pwModalName, password: pw });
}
document.getElementById('pw-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitPwModal();
});

// ── Modal tab switchers ───────────────────────────────────────────────────────
function htpTab(n) {
  [1, 2].forEach(i => {
    document.getElementById('htp-content' + i).style.display = i === n ? 'block' : 'none';
    const btn = document.getElementById('htp-tab' + i + '-btn');
    btn.style.borderBottom = i === n ? '2px solid var(--accent)' : '2px solid transparent';
    btn.style.color        = i === n ? 'var(--text)' : 'var(--muted)';
    btn.style.fontWeight   = i === n ? '600' : '400';
  });
}

function elTab(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById('el-content' + i).style.display = i === n ? 'block' : 'none';
    const btn = document.getElementById('el-tab' + i + '-btn');
    btn.style.borderBottom = i === n ? '2px solid var(--accent)' : '2px solid transparent';
    btn.style.color        = i === n ? 'var(--text)' : 'var(--muted)';
    btn.style.fontWeight   = i === n ? '600' : '400';
  });
}

// ── Question Guide + Example Game (How to Play modal) ────────────────────────
(function () {
  function qRow(en, th) {
    return `<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px 12px;">
      <span style="font-size:0.9rem;">${en}</span><br>
      <span style="font-size:0.78rem;color:var(--muted);">${th}</span>
    </div>`;
  }

  const broad = [
    ['Is it alive?',            'มีชีวิตไหม'],
    ['Is it an animal?',        'เป็นสัตว์ไหม'],
    ['Is it a plant?',          'เป็นพืชไหม'],
    ['Is it a place?',          'เป็นสถานที่ไหม'],
    ['Is it an object?',        'เป็นวัตถุไหม'],
    ['Is it a person?',         'เป็นคนไหม'],
    ['Is it an idea or action?','เป็นความคิดหรือการกระทำไหม'],
  ];
  const narrow = [
    ['Can you find it at home?',    'เจอได้ที่บ้านไหม'],
    ['Can you find it at work?',    'เจอได้ในออฟฟิศไหม'],
    ['Can you find it outdoors?',   'เจอได้ข้างนอกไหม'],
    ['Can you find it in a store?', 'เจอได้ในร้านค้าไหม'],
    ['Is it common in Thailand?',   'พบได้ทั่วไปในไทยไหม'],
    ['Is it found worldwide?',      'มีทั่วโลกไหม'],
  ];
  const chars = [
    ['Is it bigger than a phone?',    'ใหญ่กว่ามือถือไหม'],
    ['Can you hold it in one hand?',  'ถือด้วยมือเดียวได้ไหม'],
    ['Is it made of metal?',          'ทำจากโลหะไหม'],
    ['Does it make a sound?',         'ส่งเสียงได้ไหม'],
    ['Does it need electricity?',     'ต้องใช้ไฟฟ้าไหม'],
    ['Does it have a colour?',        'มีสีไหม'],
    ['Does it move on its own?',      'เคลื่อนที่เองได้ไหม'],
  ];
  const close = [
    ['Is it a pet?',            'เลี้ยงเป็นสัตว์เลี้ยงได้ไหม'],
    ['Do most people own one?', 'คนส่วนใหญ่มีไหม'],
    ['Is it used every day?',   'ใช้ทุกวันไหม'],
    ['Is it related to a job?', 'เกี่ยวกับอาชีพไหม'],
    ['Is it something you wear?','สวมใส่ได้ไหม'],
    ['Is it for children?',     'สำหรับเด็กไหม'],
  ];
  document.getElementById('qg-broad').innerHTML  = broad.map(([e, t])  => qRow(e, t)).join('');
  document.getElementById('qg-narrow').innerHTML = narrow.map(([e, t]) => qRow(e, t)).join('');
  document.getElementById('qg-char').innerHTML   = chars.map(([e, t])  => qRow(e, t)).join('');
  document.getElementById('qg-close').innerHTML  = close.map(([e, t])  => qRow(e, t)).join('');

  // Example game
  const example = [
    { ok: true,  q: 'Is it place?',             a: 'No',                             th: 'เป็นสถานที่ไหม' },
    { ok: true,  q: 'Is it alive?',             a: 'Yes',                            th: 'มีชีวิตไหม' },
    { ok: true,  q: 'Is it an animal?',         a: 'Yes',                            th: 'เป็นสัตว์ไหม' },
    { ok: false, q: 'What kind of animal is it?',a: '❌ Not a yes/no question',       th: 'ถามชนิดสัตว์ไม่ได้' },
    { ok: true,  q: 'Can you find it at home?', a: 'Yes',                            th: 'เจอได้ที่บ้านไหม' },
    { ok: false, q: 'Is it popular in Thailand?',a: "🤷 I don't know / Mostly yes",  th: 'คำถามกว้าง ตอบไม่รู้ได้' },
    { ok: true,  q: 'Does it live outdoors too?',a: 'Yes',                           th: 'อยู่ข้างนอกได้ด้วยไหม' },
    { ok: true,  q: 'Does it have 4 legs?',     a: 'Yes',                            th: 'มี 4 ขาไหม' },
    { ok: false, q: 'Is it cute?',              a: "🤷 I don't know / Mostly yes",   th: 'น่ารักไหม ตอบยาก' },
    { ok: true,  q: 'Does it make a sound?',    a: 'Yes',                            th: 'ส่งเสียงได้ไหม' },
    { ok: true,  q: 'Is it a pet?',             a: 'Yes',                            th: 'เลี้ยงเป็นสัตว์เลี้ยงได้ไหม' },
    { ok: true,  q: 'Is it smaller than a cow?',a: 'Yes',                            th: 'เล็กกว่าวัวไหม' },
    { ok: true,  q: 'Is it a cat?',             a: 'No',                             th: 'เป็นแมวไหม' },
    { ok: true,  q: 'Does it bark?',            a: 'Yes',                            th: 'เห่าได้ไหม' },
    { ok: true,  q: 'Is it a dog?',             a: "🎉 That's it!",                  th: 'เป็นหมาไหม' },
  ];

  function exColor(a) {
    if (a === 'Yes') return '#10b981';
    if (a === 'No')  return '#ef4444';
    if (a.includes('it!') || a.includes('got') || a.includes('Got') || a.includes('Correct') || a.includes('Bingo')) return '#6ee7b7';
    if (a.includes('warm') || a.includes('Getting')) return '#f97316';
    if (a.includes('know') || a.includes('Mostly') || a.includes('depends') || a.includes('Sort')) return '#94a3b8';
    if (a.includes('Not a') || a.includes('yes/no')) return '#ef4444';
    return '#e2e8f0';
  }

  document.getElementById('htp-example').innerHTML = example.map(({ ok, q, a, th }) => {
    const col = exColor(a);
    const isSpecial = !ok || col !== '#e2e8f0';
    const bg     = !ok ? 'rgba(239,68,68,.06)' : isSpecial ? `${col}18` : 'rgba(255,255,255,.04)';
    const border = !ok ? 'rgba(239,68,68,.3)'  : isSpecial ? `${col}55` : 'transparent';
    return `<div style="display:flex;align-items:center;gap:10px;background:${bg};border-radius:8px;padding:8px 12px;border:1px solid ${border};">
      <span style="font-size:0.85rem;min-width:18px;">${ok ? '' : '⚠️'}</span>
      <div style="flex:1;">
        <span style="font-size:0.88rem;">${q}</span><br>
        <span style="font-size:0.72rem;color:var(--muted);">${th}</span>
      </div>
      <span style="font-weight:700;font-size:0.78rem;color:${col};white-space:nowrap;max-width:140px;text-align:right;">${a}</span>
    </div>`;
  }).join('');
})();

// ── Keep-alive + version label ────────────────────────────────────────────────
setInterval(() => fetch('/api/version').catch(() => {}), 10 * 60 * 1000);

fetch('/api/version').then(r => r.json()).then(({ startedAt }) => {
  const d   = new Date(startedAt);
  const pad = n => String(n).padStart(2, '0');
  const label = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const el = document.getElementById('version-label');
  if (el) el.textContent = label;
}).catch(() => {});
