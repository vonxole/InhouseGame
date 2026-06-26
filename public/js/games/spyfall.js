// public/js/games/spyfall.js — Spyfall game frontend
// Defines handleSpyfallRoomUpdate(room) called by app.js room_update handler

// ── State ─────────────────────────────────────────────────────────────────────
let _sfPrevState  = null;
let _sfTimerTotal = 300;
let _sfLocations  = [];

// ── Entry point ───────────────────────────────────────────────────────────────
function handleSpyfallRoomUpdate(room) {
  _sfLocations  = room.locations || [];
  _sfTimerTotal = room.playTime  || 300;

  // Sticky footer: only in lobby
  document.getElementById('l-sticky-footer').style.display =
    room.state === 'lobby' ? 'block' : 'none';

  if (room.state === 'lobby')    sfRenderLobby(room);
  else if (room.state === 'preview')  sfRenderPreview(room);
  else if (room.state === 'reveal')   sfRenderReveal(room);
  else if (room.state === 'playing')  sfRenderPlaying(room);
  else if (room.state === 'voting')   sfRenderVoting(room);
  else if (room.state === 'suspense') sfRenderSuspense(room);
  else if (room.state === 'verdict')  sfRenderVerdict(room);
  else if (room.state === 'result')   sfRenderResult(room);
}

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on('sf_tick', t => sfUpdateTimer(t));

// ── Lobby ─────────────────────────────────────────────────────────────────────
function sfRenderLobby(room) {
  show('s-lobby');

  document.getElementById('l-code').textContent  = room.code;
  document.getElementById('l-count').textContent = `(${room.players.length})`;

  // Render player list
  document.getElementById('l-players').innerHTML = room.players.map(p => {
    const isMe   = p.name === myName;
    const kickBtn = isHost && !isMe && !p.isHost
      ? `<button onclick="sfKickPlayer('${p.id}')" style="padding:5px 10px;border-radius:99px;border:1.5px solid var(--red);background:transparent;color:var(--red);font-size:0.8rem;cursor:pointer;">✕</button>`
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

  // Show Spyfall How to Play button
  const rulesBtnWrap  = document.getElementById('l-rules-btn');
  const rulesBtnInner = document.getElementById('l-rules-btn-inner');
  if (rulesBtnWrap)  rulesBtnWrap.style.display  = 'block';
  if (rulesBtnInner) rulesBtnInner.onclick = () => document.getElementById('sf-htp-modal').style.display = 'flex';

  // Hide all game-specific elements first
  ['l-settings-host','l-examples-host','l-settings-view',
   'l-sf-settings-host','l-sf-settings-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Password host is always shown (shared)
  document.getElementById('l-password-host').style.display = 'none';

  const btn = document.getElementById('btn-start');

  if (isHost) {
    document.getElementById('l-sf-settings-host').style.display = 'block';
    document.getElementById('l-password-host').style.display    = 'block';

    // Sync sliders
    const locCount = room.locationCount || 20;
    const playMins = Math.round((room.playTime || 300) / 60);
    const slLoc  = document.getElementById('sl-sf-loc');
    const slTime = document.getElementById('sl-sf-time');
    if (slLoc)  { slLoc.value  = locCount; document.getElementById('sf-loc-val').textContent  = locCount; }
    if (slTime) { slTime.value = playMins; document.getElementById('sf-time-val').textContent = playMins + ' min'; }

    // Password state
    const hasPw = !!room.password;
    document.getElementById('tog-password').checked = hasPw;
    document.getElementById('password-input-wrap').style.display = hasPw ? 'block' : 'none';
    if (hasPw) document.getElementById('inp-room-password').value = room.password;

    // Start button — override onclick for Spyfall
    const need = 3 - room.players.length;
    btn.style.display = 'block';
    btn.disabled      = need > 0;
    btn.textContent   = need > 0 ? `Need ${need} more player(s)` : 'Start Game 🕵️';
    btn.onclick       = doSfStart;

    document.getElementById('l-footer-msg').textContent = '';
  } else {
    document.getElementById('l-sf-settings-view').style.display = 'block';

    const locCount = room.locationCount || 20;
    const playMins = Math.round((room.playTime || 300) / 60);
    document.getElementById('l-sf-setting-chips').innerHTML =
      `<span class="chip" style="background:var(--border);color:var(--muted);">📍 ${locCount} locations</span>` +
      `<span class="chip" style="background:var(--border);color:var(--muted);">⏱ ${playMins}min</span>`;

    btn.style.display = 'none';
    document.getElementById('l-footer-msg').textContent = 'Waiting for host to start…';
  }

  // Scoreboard
  const scores    = room.scores || [];
  const hasScores = scores.some(s => s.score > 0);
  document.getElementById('l-scoreboard').style.display = hasScores ? 'block' : 'none';
  if (hasScores) renderScoreboard(scores, 'l-score-list');

  _sfPrevState = 'lobby';
}

function sfKickPlayer(playerId) { socket.emit('kick_player', { playerId }); }
function doSfStart()            { socket.emit('sf_start'); }

// ── Preview ───────────────────────────────────────────────────────────────────
function sfRenderPreview(room) {
  show('s-sf-preview');
  const locs = room.locations || [];
  document.getElementById('sf-location-grid').innerHTML = locs.map(loc =>
    `<div style="background:var(--card);border:1.5px solid var(--border);border-radius:10px;padding:8px 10px;text-align:center;">
      <div style="font-size:0.88rem;font-weight:600;">${loc.name}</div>
      <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;">${loc.thai}</div>
    </div>`
  ).join('');

  document.getElementById('sf-preview-host-btn').style.display = isHost ? 'flex' : 'none';
  document.getElementById('sf-preview-wait').style.display     = isHost ? 'none' : 'block';
  _sfPrevState = 'preview';
}

function sfPreviewDone() { socket.emit('sf_preview_done'); }

// ── Reveal ────────────────────────────────────────────────────────────────────
function sfRenderReveal(room) {
  show('s-sf-reveal');
  const iAmSpy = room.myRole === 'spy';

  document.getElementById('sf-rv-location-card').style.display = iAmSpy ? 'none' : 'block';
  document.getElementById('sf-rv-spy-card').style.display      = iAmSpy ? 'block' : 'none';

  if (!iAmSpy && room.myLocation) {
    document.getElementById('sf-rv-location-name').textContent = room.myLocation.name;
    document.getElementById('sf-rv-location-thai').textContent = room.myLocation.thai || '';
    const role = room.myRole;
    const roleName = typeof role === 'object' ? role.name : (role || '');
    const roleThai = typeof role === 'object' ? role.thai : '';
    document.getElementById('sf-rv-role').innerHTML =
      roleName + (roleThai ? `<span style="display:block;font-size:0.82rem;font-weight:400;color:var(--muted);margin-top:2px;">${roleThai}</span>` : '');
  }

  if (iAmSpy) {
    const locs = room.locations || [];
    document.getElementById('sf-rv-spy-locations').innerHTML = locs.map(loc =>
      `<div style="font-size:0.78rem;background:rgba(255,255,255,.06);border-radius:6px;padding:4px 8px;">
        📍 ${loc.name}
      </div>`
    ).join('');
  }

  const iAmReady = room.iAmReady;
  const btn      = document.getElementById('sf-btn-ready');
  btn.textContent      = iAmReady ? 'Cancel ✕' : 'Ready ✓';
  btn.style.background = iAmReady ? 'transparent' : '';
  btn.style.border     = iAmReady ? '1.5px solid var(--muted)' : '';
  btn.style.color      = iAmReady ? 'var(--muted)' : '';

  document.getElementById('sf-rv-wait-msg').textContent =
    iAmReady ? 'Waiting for others…' : '';

  // Ready dots
  const readyCount = room.readyCount || 0;
  const total      = room.players.length;
  document.getElementById('sf-rv-dots').innerHTML =
    Array.from({ length: total }, (_, i) =>
      `<div class="ready-dot${i < readyCount ? ' done' : ''}"></div>`).join('');

  // Host controls: Force Start + Back to Lobby
  const forceBtn = document.getElementById('sf-rv-force-btn');
  const backBtn  = document.getElementById('sf-rv-back-btn');
  if (forceBtn) forceBtn.style.display = (isHost && readyCount < total && readyCount > 0) ? 'block' : 'none';
  if (backBtn)  backBtn.style.display  = isHost ? 'block' : 'none';

  _sfPrevState = 'reveal';
}

function sfReady() {
  const btn = document.getElementById('sf-btn-ready');
  if (btn.textContent.startsWith('Cancel')) {
    socket.emit('sf_unready');
  } else {
    socket.emit('sf_ready');
  }
}

// ── Playing ───────────────────────────────────────────────────────────────────
function sfRenderPlaying(room) {
  show('s-sf-playing');
  const iAmSpy = room.myRole === 'spy';

  document.getElementById('sf-pl-nonspy-card').style.display  = iAmSpy ? 'none' : 'block';
  document.getElementById('sf-pl-spy-card').style.display     = iAmSpy ? 'block' : 'none';
  document.getElementById('sf-spy-guess-btn').style.display   = iAmSpy ? 'block' : 'none';
  document.getElementById('sf-pl-nonspy-hint').style.display  = iAmSpy ? 'none' : 'block';

  if (!iAmSpy && room.myLocation) {
    document.getElementById('sf-pl-location-name').textContent = room.myLocation.name + ' · ' + (room.myLocation.thai || '');
    const role = room.myRole;
    const roleName = typeof role === 'object' ? role.name : (role || '');
    const roleThai = typeof role === 'object' ? role.thai : '';
    document.getElementById('sf-pl-role-name').textContent =
      '👤 ' + roleName + (roleThai ? ` (${roleThai})` : '');
  }

  if (iAmSpy) {
    const locs = room.locations || [];
    document.getElementById('sf-pl-spy-locations').innerHTML = locs.map(loc =>
      `<div style="font-size:0.78rem;background:rgba(255,255,255,.06);border-radius:6px;padding:4px 8px;">
        📍 ${loc.name}
      </div>`
    ).join('');
  }

  sfUpdateTimer(room.timeLeft ?? _sfTimerTotal);
  _sfPrevState = 'playing';
}

function sfUpdateTimer(t) {
  const el  = document.getElementById('sf-pl-timer');
  const bar = document.getElementById('sf-pl-bar');
  if (!el) return;
  el.textContent = fmtTime(t);
  el.className   = 'timer-big' + (t <= 30 ? ' crit' : t <= 60 ? ' warn' : '');
  const pct = (_sfTimerTotal > 0) ? (t / _sfTimerTotal) * 100 : 100;
  bar.style.width      = pct + '%';
  bar.style.background = t > 60 ? 'var(--green)' : t > 30 ? 'var(--yellow)' : 'var(--red)';
}

// Spy guess modal
function sfShowGuessModal() {
  const locs = _sfLocations;
  document.getElementById('sf-guess-grid').innerHTML = locs.map(loc =>
    `<button onclick="sfSubmitGuess('${loc.name.replace(/'/g,"\\'")}', this)"
      style="background:var(--card);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;text-align:left;cursor:pointer;color:var(--text);transition:border-color .15s;"
      onmouseover="this.style.borderColor='#ef4444'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:0.85rem;font-weight:600;">📍 ${loc.name}</div>
      <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;">${loc.thai}</div>
    </button>`
  ).join('');
  document.getElementById('sf-guess-modal').style.display = 'flex';
}

function sfCloseGuessModal() {
  document.getElementById('sf-guess-modal').style.display = 'none';
}

function sfSubmitGuess(locationName) {
  sfCloseGuessModal();
  socket.emit('sf_spy_guess', { locationName });
}

// ── Voting ────────────────────────────────────────────────────────────────────
function sfRenderVoting(room) {
  show('s-sf-voting');

  const total = room.totalVoters || room.players.length;
  const voted = room.voteCount   || 0;
  document.getElementById('sf-vt-vote-count').textContent  = `${voted}/${total} voted`;
  document.getElementById('sf-vt-vote-fill').style.width   = total ? `${(voted / total) * 100}%` : '0%';

  const myId     = room.players.find(p => p.name === myName)?.id;
  const canReveal = voted >= total;

  document.getElementById('sf-vt-players').innerHTML = room.players.map(p => {
    const isMe   = p.id === myId;
    const voted  = room.myVote === p.id;
    const style  = voted
      ? 'background:rgba(124,58,237,0.25);border:1.5px solid var(--accent);color:var(--text);'
      : 'background:var(--card);border:1.5px solid var(--border);color:var(--muted);';
    return `<button onclick="sfCastVote('${p.id}')" ${isMe ? 'disabled' : ''}
      style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;cursor:${isMe ? 'default' : 'pointer'};width:100%;text-align:left;${style}">
      <div class="avatar" style="width:36px;height:36px;font-size:1rem;">${p.name[0].toUpperCase()}</div>
      <span style="font-weight:600;font-size:0.95rem;">${p.name}${isMe ? ' (you)' : ''}</span>
      ${voted ? '<span style="margin-left:auto;color:var(--accent2);">✓</span>' : ''}
    </button>`;
  }).join('');

  document.getElementById('sf-vt-host-btn').style.display = isHost ? 'flex' : 'none';
  document.getElementById('sf-vt-wait').style.display     = isHost ? 'none' : 'block';

  if (isHost) {
    const btn = document.getElementById('sf-btn-reveal-accused');
    const hasAnyVote = voted > 0;
    btn.disabled      = !hasAnyVote;
    btn.style.opacity = hasAnyVote ? '1' : '0.4';
    btn.textContent   = canReveal ? 'Reveal Accused 👁' : `Force Tally (${voted}/${total}) 👁`;
    if (!canReveal && hasAnyVote) {
      btn.onclick = () => socket.emit('sf_force_tally');
    } else {
      btn.onclick = sfRevealAccused;
    }
    document.getElementById('sf-vt-reveal-hint').textContent = canReveal
      ? 'Everyone voted!' : 'Waiting for all votes…';
  }
  _sfPrevState = 'voting';
}

function sfCastVote(targetId) { socket.emit('sf_cast_vote', { targetId }); }
function sfRevealAccused()    { socket.emit('sf_reveal_accused'); }

// ── Suspense ──────────────────────────────────────────────────────────────────
function sfRenderSuspense(room) {
  show('s-sf-suspense');
  const name = room.accusedName || '???';
  document.getElementById('sf-sp-avatar').textContent = name[0].toUpperCase();
  document.getElementById('sf-sp-name').textContent   = name;

  const topEntry = (room.voteTally || []).find(e => e.name === name);
  document.getElementById('sf-sp-votes').textContent =
    topEntry ? `${topEntry.votes} vote${topEntry.votes !== 1 ? 's' : ''}` : '';

  document.getElementById('sf-sp-tally').innerHTML = (room.voteTally || [])
    .filter(e => e.votes > 0)
    .map(e => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--card);border-radius:10px;margin-bottom:6px;">
        <span style="font-weight:600;">${e.name}</span>
        <span class="muted">${e.votes} vote${e.votes !== 1 ? 's' : ''}</span>
      </div>`).join('');

  document.getElementById('sf-sp-host-btn').style.display = isHost ? 'flex' : 'none';
  document.getElementById('sf-sp-wait').style.display     = isHost ? 'none' : 'block';
  _sfPrevState = 'suspense';
}

// ── Verdict ───────────────────────────────────────────────────────────────────
function sfRenderVerdict(room) {
  show('s-sf-verdict');

  const outcome      = room.outcome;
  const accusedName  = room.accusedName || '???';
  const banner       = document.getElementById('sf-vd-banner');
  const guessWrap    = document.getElementById('sf-vd-spy-guess-wrap');
  const resultReveal = document.getElementById('sf-vd-result-reveal');
  const summaryBtn   = document.getElementById('sf-vd-summary-btn');
  const waitMsg      = document.getElementById('sf-vd-wait');

  guessWrap.style.display    = 'none';
  resultReveal.style.display = 'none';
  summaryBtn.style.display   = 'none';
  waitMsg.style.display      = 'none';

  // Banner content based on outcome
  if (outcome === 'spy_guessed') {
    banner.style.background = 'rgba(239,68,68,0.15)';
    banner.style.border     = '2px solid #ef4444';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">🕵️</div>
      <div style="font-size:1.4rem;font-weight:800;color:#ef4444;">Spy Wins!</div>
      <div style="margin-top:6px;color:var(--text);">Spy guessed the location correctly</div>
      <div style="margin-top:4px;font-size:0.85rem;color:var(--muted);">${room.spyGuess} ✓</div>`;
    sfShowResultReveal(room, resultReveal);
    summaryBtn.style.display = isHost ? 'block' : 'none';
    if (!isHost) { waitMsg.textContent = 'Waiting for host…'; waitMsg.style.display = 'block'; }

  } else if (outcome === 'spy_wrong_guess') {
    banner.style.background = 'rgba(16,185,129,0.15)';
    banner.style.border     = '2px solid var(--green)';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">🎉</div>
      <div style="font-size:1.4rem;font-weight:800;color:var(--green);">Players Win!</div>
      <div style="margin-top:6px;color:var(--text);">Spy guessed wrong: "${room.spyGuess}"</div>`;
    sfShowResultReveal(room, resultReveal);
    summaryBtn.style.display = isHost ? 'block' : 'none';
    if (!isHost) { waitMsg.textContent = 'Waiting for host…'; waitMsg.style.display = 'block'; }

  } else if (outcome === 'spy_caught_pending') {
    // Spy was caught — spy gets a final guess
    banner.style.background = 'rgba(245,158,11,0.15)';
    banner.style.border     = '2px solid #f59e0b';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">🎯</div>
      <div style="font-size:1.3rem;font-weight:800;color:#f59e0b;">${accusedName} is the Spy!</div>
      <div style="margin-top:6px;color:var(--muted);font-size:0.88rem;">Spy gets one last chance…</div>`;

    if (room.iAmSpy) {
      // Spy picks their final guess
      const locs = room.locations || [];
      document.getElementById('sf-vd-guess-grid').innerHTML = locs.map(loc =>
        `<button onclick="sfFinalGuess('${loc.name.replace(/'/g,"\\'")}', this)"
          style="background:var(--card);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;text-align:left;cursor:pointer;color:var(--text);"
          onmouseover="this.style.borderColor='#ef4444'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="font-size:0.85rem;font-weight:600;">📍 ${loc.name}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;">${loc.thai}</div>
        </button>`
      ).join('');
      guessWrap.style.display = 'block';
    } else {
      waitMsg.textContent    = '🕵️ Spy is choosing their final location…';
      waitMsg.style.display  = 'block';
    }

  } else if (outcome === 'spy_caught') {
    banner.style.background = 'rgba(16,185,129,0.15)';
    banner.style.border     = '2px solid var(--green)';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">🎉</div>
      <div style="font-size:1.4rem;font-weight:800;color:var(--green);">Players Win!</div>
      <div style="margin-top:6px;color:var(--text);">${accusedName} caught and guessed wrong</div>`;
    sfShowResultReveal(room, resultReveal);
    summaryBtn.style.display = isHost ? 'block' : 'none';
    if (!isHost) { waitMsg.textContent = 'Waiting for host…'; waitMsg.style.display = 'block'; }

  } else if (outcome === 'spy_escaped') {
    banner.style.background = 'rgba(239,68,68,0.15)';
    banner.style.border     = '2px solid #ef4444';
    banner.innerHTML = `
      <div style="font-size:3rem;margin-bottom:8px;">🏃</div>
      <div style="font-size:1.4rem;font-weight:800;color:#ef4444;">Spy Escaped!</div>
      <div style="margin-top:6px;color:var(--text);">${accusedName} was innocent — spy got away</div>`;
    sfShowResultReveal(room, resultReveal);
    summaryBtn.style.display = isHost ? 'block' : 'none';
    if (!isHost) { waitMsg.textContent = 'Waiting for host…'; waitMsg.style.display = 'block'; }
  }

  _sfPrevState = 'verdict';
}

function sfShowResultReveal(room, el) {
  el.style.display = 'block';
  if (room.realLocation) {
    document.getElementById('sf-vd-real-location').textContent      = room.realLocation.name;
    document.getElementById('sf-vd-real-location-thai').textContent = room.realLocation.thai || '';
  }
  document.getElementById('sf-vd-spy-name').textContent = room.spyName || '???';
}

function sfFinalGuess(locationName) {
  socket.emit('sf_final_guess', { locationName });
}

function sfConfirmResult() { socket.emit('sf_confirm_result'); }

// ── Result ────────────────────────────────────────────────────────────────────
function sfRenderResult(room) {
  show('s-sf-result');

  const outcome    = room.outcome;
  const spyWon     = outcome === 'spy_guessed' || outcome === 'spy_escaped';
  const spyName    = room.spyName    || '???';
  const accusedName = room.accusedName || '???';

  let icon, title, subtitle;
  if (outcome === 'spy_guessed') {
    icon = '🕵️'; title = 'Spy Wins!';
    subtitle = `${spyName} guessed the location — spy gets +2 pts`;
  } else if (outcome === 'spy_wrong_guess') {
    icon = '🎉'; title = 'Players Win!';
    subtitle = `Spy guessed wrong — everyone else gets +1 pt`;
  } else if (outcome === 'spy_caught') {
    icon = '🎉'; title = 'Players Win!';
    subtitle = `${spyName} was caught and guessed wrong — everyone else gets +1 pt`;
  } else if (outcome === 'spy_escaped') {
    icon = '🏃'; title = 'Spy Escaped!';
    subtitle = `Wrong person accused — ${spyName} escapes with +4 pts`;
  } else {
    icon = '🎮'; title = 'Game Over'; subtitle = '';
  }

  document.getElementById('sf-res-icon').textContent     = icon;
  document.getElementById('sf-res-title').textContent    = title;
  document.getElementById('sf-res-subtitle').textContent = subtitle;

  const loc = room.realLocation || {};
  document.getElementById('sf-res-location').textContent      = loc.name || '—';
  document.getElementById('sf-res-location-thai').textContent = loc.thai || '';
  document.getElementById('sf-res-spy').textContent           = spyName;
  document.getElementById('sf-res-accused').textContent       = accusedName;

  // Roles revealed
  const myId = room.players.find(p => p.name === myName)?.id;
  document.getElementById('sf-res-roles').innerHTML = room.players.map(p => {
    const isSpy  = p.id === room.spyId || (p.name === spyName);
    const rawRole = room.roles?.[p.id];
    const roleName = isSpy ? 'SPY' : (typeof rawRole === 'object' ? rawRole.name : (rawRole || '?'));
    const roleThai = isSpy ? 'สายลับ' : (typeof rawRole === 'object' ? rawRole.thai : '');
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="avatar" style="width:30px;height:30px;font-size:0.85rem;">${p.name[0].toUpperCase()}</div>
        <span style="font-size:0.9rem;">${p.name}${p.id === myId ? ' (you)' : ''}</span>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.85rem;color:${isSpy ? '#ef4444' : 'var(--accent2)'};font-weight:600;">${isSpy ? '🕵️ ' : ''}${roleName}</div>
        ${roleThai ? `<div style="font-size:0.72rem;color:var(--muted);">${roleThai}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // Scoreboard
  const scores    = room.scores || [];
  const hasScores = scores.some(s => s.score > 0);
  document.getElementById('sf-res-scoreboard-wrap').style.display = hasScores ? 'block' : 'none';
  if (hasScores) renderScoreboard(scores, 'sf-res-score-list');

  document.getElementById('sf-res-host-btn').style.display = room.amHost ? 'block' : 'none';
  document.getElementById('sf-res-wait').style.display     = room.amHost ? 'none' : 'block';

  _sfPrevState = 'result';
}

function sfPlayAgain() { socket.emit('sf_play_again'); }
