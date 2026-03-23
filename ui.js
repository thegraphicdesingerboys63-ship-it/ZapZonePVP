// ════════════════════════════════════════════════════════════════
// UI Manager — Menus, HUD, Overlays
// ════════════════════════════════════════════════════════════════

const UI = (() => {
  let activeOverlay = null;
  let matchTimerInterval = null;
  let mmTimerInterval = null;
  let mmStartTime = null;

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  function showAuth() { showScreen('auth-screen'); }

  function showMainMenu() {
    showScreen('main-menu');
    refreshMainMenu();
    fetchLeaderboard();
    setupBnav();
  }

  function showGame() {
    showScreen('game-screen');
    const isMobile = /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent);
    if (isMobile) document.getElementById('mobile-controls').style.display = 'flex';
    VoiceChat.init();
  }

  function showSettings() {
    const acc = GameState.account;
    if (!acc) return;
    document.getElementById('set-username').textContent = acc.username;
    document.getElementById('set-role').textContent = acc.role;
    document.getElementById('set-coins').textContent = acc.coins;
    document.getElementById('set-volts').textContent = acc.volts;
    showOverlay('settings-overlay');
  }

  function showBattlePass() {
    renderBattlePass();
    showOverlay('battlepass-screen');
  }

  function showShop() {
    renderShop();
    showOverlay('shop-screen');
  }

  function showLocker() {
    renderLocker();
    showOverlay('locker-screen');
  }

  function showParty() {
    UI.updatePartyUI(GameState.party);
    showOverlay('party-screen');
  }

  function showQuests() {
    renderQuests();
    showOverlay('quests-screen');
  }

  function showMain() {
    document.querySelectorAll('.screen.overlay-screen').forEach(s => {
      if (s.id !== 'settings-overlay') s.classList.remove('active');
    });
  }

  function showOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = '';
    el.classList.add('active');
    activeOverlay = id;
  }

  function closeOverlay() {
    if (!activeOverlay) return;
    const el = document.getElementById(activeOverlay);
    if (el) { el.classList.remove('active'); el.style.display = 'none'; }
    activeOverlay = null;
  }

  function refreshMainMenu() {
    const acc = GameState.account;
    if (!acc) return;
    document.getElementById('nav-username').textContent = acc.username;
    document.getElementById('nav-coins').textContent = acc.coins.toLocaleString();
    document.getElementById('nav-volts').textContent = acc.volts.toLocaleString();
    document.getElementById('card-username').textContent = acc.username;
    document.getElementById('stat-kills').textContent = acc.stats.kills;
    document.getElementById('stat-wins').textContent = acc.stats.wins;
    const kd = acc.stats.deaths > 0 ? (acc.stats.kills / acc.stats.deaths).toFixed(2) : acc.stats.kills;
    document.getElementById('stat-kd').textContent = kd;
    document.getElementById('card-bp-level').textContent = acc.battlepass.level;

    const roleEl = document.getElementById('nav-role');
    roleEl.textContent = acc.role === 'owner' ? 'OWNER' : acc.role === 'admin' ? 'ADMIN' : '';
    roleEl.style.display = (acc.role === 'owner' || acc.role === 'admin') ? 'inline' : 'none';

    // BP progress bar
    const bpPct = Math.min(100, (acc.battlepass.xp / (acc.battlepass.level * 500)) * 100);
    document.getElementById('card-bp-bar').style.width = bpPct + '%';

    // Daily quests mini
    renderDailyQuestsMini();
  }

  function renderDailyQuestsMini() {
    const acc = GameState.account;
    const list = document.getElementById('daily-quests-list');
    if (!list || !acc?.quests?.daily) return;
    list.innerHTML = acc.quests.daily.map(q => `
      <div class="quest-mini ${q.completed ? 'completed' : ''}">
        <div class="quest-mini-name">${q.name}</div>
        <div class="quest-mini-progress">
          <div class="quest-bar"><div class="quest-bar-fill" style="width:${Math.min(100, (q.progress/q.target)*100)}%"></div></div>
          <span>${q.progress}/${q.target}</span>
        </div>
        ${q.completed ? '<span class="quest-done">✓</span>' : ''}
      </div>
    `).join('');
  }

  // ─── Battle Pass ──────────────────────────────────────────────────────────
  function renderBattlePass() {
    const acc = GameState.account;
    const tiers = GameState.battlepassTiers;
    if (!tiers || !acc) return;

    const isPremium = acc.battlepass.premium;
    const currentLevel = acc.battlepass.level;
    const xp = acc.battlepass.xp;
    const nextXP = currentLevel * 500;

    document.getElementById('bp-current-level').textContent = currentLevel;
    document.getElementById('bp-xp-text').textContent = `${xp} / ${nextXP} XP`;
    document.getElementById('bp-xp-fill').style.width = Math.min(100, (xp / nextXP) * 100) + '%';

    const upgradeBtn = document.getElementById('bp-upgrade-btn');
    if (isPremium) { upgradeBtn.textContent = 'PREMIUM ✓'; upgradeBtn.disabled = true; upgradeBtn.classList.add('owned'); }

    const container = document.getElementById('bp-tiers');
    container.innerHTML = tiers.slice(0, 100).map(tier => {
      const unlocked = tier.tier <= currentLevel;
      const isCurrentTier = tier.tier === currentLevel;
      return `
      <div class="bp-tier ${unlocked ? 'unlocked' : ''} ${isCurrentTier ? 'current' : ''}">
        <div class="tier-number">${tier.tier}</div>
        <div class="tier-reward free ${unlocked ? 'unlocked' : ''} ${!tier.free ? 'empty' : ''}">
          ${tier.free ? `
            <div class="reward-icon">${getRewardIcon(tier.free)}</div>
            <div class="reward-name">${tier.free.name || ''}</div>
            <div class="reward-rarity rarity-${tier.free.rarity || 'common'}">${tier.free.rarity || ''}</div>
          ` : '<span class="no-reward">—</span>'}
        </div>
        <div class="tier-reward premium ${isPremium ? 'unlocked' : ''} ${unlocked && isPremium ? 'claimed' : ''}">
          ${tier.premium ? `
            ${!isPremium ? '<div class="premium-lock">🔒</div>' : ''}
            <div class="reward-icon">${getRewardIcon(tier.premium)}</div>
            <div class="reward-name">${tier.premium.name || ''}</div>
            <div class="reward-rarity rarity-${tier.premium.rarity || 'common'}">${tier.premium.rarity || ''}</div>
          ` : '<span class="no-reward">—</span>'}
        </div>
      </div>`;
    }).join('');
  }

  function getRewardIcon(reward) {
    if (!reward) return '';
    switch (reward.type) {
      case 'skin': return '👕';
      case 'coins': return '🪙';
      case 'spray': return '🎨';
      case 'emote': return '💃';
      case 'weapon_wrap': return '🎁';
      case 'glider': return '🪂';
      default: return '⭐';
    }
  }

  // ─── Shop ─────────────────────────────────────────────────────────────────
  function renderShop() {
    const acc = GameState.account;
    const grid = document.getElementById('shop-grid');
    const vbEl = document.getElementById('shop-volts-count');
    if (!grid || !acc) return;

    if (vbEl) vbEl.textContent = acc.volts.toLocaleString();

    const items = GameState.shopItems || [];
    grid.innerHTML = items.map(item => {
      const owned = acc.skins === '*' || (Array.isArray(acc.skins) && acc.skins.includes(item.id));
      return `
      <div class="shop-item rarity-${item.rarity}" onclick="buyItem('${item.id}')">
        <div class="shop-item-preview" style="background:${item.color}">
          <div class="shop-skin-silhouette">👤</div>
        </div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-rarity">${item.rarity.toUpperCase()}</div>
        <div class="shop-item-price ${owned ? 'owned' : ''}">
          ${owned ? '✓ OWNED' : `<span class="volt-icon">⚡</span> ${item.price}`}
        </div>
      </div>`;
    }).join('');
  }

  // ─── Locker ───────────────────────────────────────────────────────────────
  function renderLocker() {
    const acc = GameState.account;
    const grid = document.getElementById('locker-grid');
    if (!grid || !acc) return;

    const allSkins = [
      { id: 'default', name: 'Default', rarity: 'common', color: '#888888' },
      ...GameState.shopItems
    ];

    const ownedSkins = acc.skins === '*' ? allSkins : allSkins.filter(s => acc.skins.includes(s.id));

    document.getElementById('equipped-skin-name').textContent =
      (ownedSkins.find(s => s.id === acc.activeSkin) || { name: 'Default' }).name;

    grid.innerHTML = ownedSkins.map(skin => `
      <div class="locker-item ${acc.activeSkin === skin.id ? 'equipped' : ''}"
           onclick="equipSkin('${skin.id}', '${skin.name}')">
        <div class="locker-preview-mini" style="background:${skin.color || '#888'}">
          <span>👤</span>
        </div>
        <div class="locker-skin-label">${skin.name}</div>
        <div class="locker-rarity rarity-${skin.rarity || 'common'}">${skin.rarity || 'common'}</div>
        ${acc.activeSkin === skin.id ? '<div class="equipped-badge">EQUIPPED</div>' : ''}
      </div>
    `).join('');
  }

  // ─── Quests ───────────────────────────────────────────────────────────────
  function renderQuests() {
    const acc = GameState.account;
    if (!acc?.quests) return;

    function renderQuestList(quests, containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = quests.map(q => `
        <div class="quest-card ${q.completed ? 'completed' : ''}">
          <div class="quest-header">
            <span class="quest-name">${q.name}</span>
            <span class="quest-rewards">+${q.xp}XP | +${q.coins}🪙</span>
          </div>
          <div class="quest-desc">${q.desc}</div>
          <div class="quest-progress-wrap">
            <div class="quest-progress-bar">
              <div class="quest-progress-fill ${q.completed ? 'done' : ''}"
                   style="width:${Math.min(100, (q.progress/q.target)*100)}%"></div>
            </div>
            <span class="quest-progress-text">${q.progress}/${q.target}</span>
          </div>
          ${q.completed ? '<div class="quest-complete-badge">COMPLETED ✓</div>' : ''}
        </div>
      `).join('');
    }

    renderQuestList(acc.quests.daily, 'daily-quests-full');
    renderQuestList(acc.quests.weekly, 'weekly-quests-full');

    const completed = document.getElementById('completed-quests');
    const count = document.getElementById('completed-count');
    if (count) count.textContent = acc.quests.completed.length;
    if (completed) completed.innerHTML = acc.quests.completed.length === 0
      ? '<p class="empty-msg">No completed quests yet.</p>'
      : `<p class="completed-summary">${acc.quests.completed.length} quests completed this season!</p>`;

    // Reset timers
    updateQuestTimers(acc);
  }

  function updateQuestTimers(acc) {
    const dailyEl = document.getElementById('daily-reset-timer');
    const weeklyEl = document.getElementById('weekly-reset-timer');
    if (dailyEl && acc.questReset?.daily) {
      const ms = acc.questReset.daily - Date.now();
      dailyEl.textContent = ms > 0 ? `Resets in ${formatTime(ms / 1000)}` : 'Resets soon';
    }
    if (weeklyEl && acc.questReset?.weekly) {
      const ms = acc.questReset.weekly - Date.now();
      weeklyEl.textContent = ms > 0 ? `Resets in ${formatTime(ms / 1000)}` : 'Resets soon';
    }
  }

  // ─── Party UI ─────────────────────────────────────────────────────────────
  function updatePartyUI(party) {
    const noParty = document.getElementById('party-no-party');
    const active = document.getElementById('party-active');
    if (!noParty || !active) return;

    if (!party) {
      noParty.style.display = 'block';
      active.style.display = 'none';
      return;
    }

    noParty.style.display = 'none';
    active.style.display = 'block';
    document.getElementById('party-code').textContent = party.id;

    const membersList = document.getElementById('party-members-list');
    if (membersList) {
      membersList.innerHTML = party.members.map(m => `
        <div class="party-member ${m.username === party.leader ? 'leader' : ''}">
          <span class="party-member-avatar">👤</span>
          <span class="party-member-name">${m.username}</span>
          ${m.username === party.leader ? '<span class="leader-crown">👑</span>' : ''}
        </div>
      `).join('');
    }
  }

  function showPartyInvite(partyId, from) {
    const notif = document.createElement('div');
    notif.className = 'party-invite-notif';
    notif.innerHTML = `
      <strong>${from}</strong> invited you to their party!
      <button onclick="joinParty('${partyId}'); this.parentElement.remove()">Join</button>
      <button onclick="this.parentElement.remove()">Decline</button>
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 15000);
  }

  // ─── Match UI ────────────────────────────────────────────────────────────
  function showMatchTimer(startTime, duration) {
    if (matchTimerInterval) clearInterval(matchTimerInterval);
    const el = document.getElementById('match-timer');
    matchTimerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      if (el) el.textContent = formatTime(remaining / 1000);
      if (remaining <= 0) { clearInterval(matchTimerInterval); el.textContent = '0:00'; }
    }, 500);
  }

  function showMatchEnd(scores, winner, myUsername) {
    const screen = document.getElementById('match-end-screen');
    const title = document.getElementById('victory-title');
    const scoreEl = document.getElementById('end-scoreboard');
    if (!screen) return;

    const isWinner = winner === myUsername;
    title.textContent = isWinner ? '🏆 VICTORY!' : 'ELIMINATED';
    title.style.color = isWinner ? '#FFD700' : '#FF4444';

    if (scoreEl) {
      scoreEl.innerHTML = `
        <table class="end-score-table">
          <thead><tr><th>Rank</th><th>Player</th><th>Kills</th><th>Deaths</th><th>Damage</th></tr></thead>
          <tbody>${scores.map((s, i) => `
            <tr class="${s.username === myUsername ? 'my-row' : ''}">
              <td>${i + 1}</td>
              <td>${s.username || 'Unknown'}</td>
              <td>${s.kills || 0}</td>
              <td>${s.deaths || 0}</td>
              <td>${s.damage || 0}</td>
            </tr>
          `).join('')}</tbody>
        </table>`;
    }

    screen.style.display = 'flex';
  }

  function hideMatchmaking() {
    if (mmTimerInterval) { clearInterval(mmTimerInterval); mmTimerInterval = null; }
    const overlay = document.getElementById('matchmaking-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function showMatchmaking(mode) {
    const overlay = document.getElementById('matchmaking-overlay');
    const modeEl = document.getElementById('mm-mode');
    const timeEl = document.getElementById('mm-time');
    if (!overlay) return;
    overlay.style.display = 'flex';
    if (modeEl) modeEl.textContent = mode === 'team' ? 'Team Deathmatch' : 'Free For All';
    mmStartTime = Date.now();
    mmTimerInterval = setInterval(() => {
      const elapsed = (Date.now() - mmStartTime) / 1000;
      if (timeEl) timeEl.textContent = formatTime(elapsed);
    }, 500);
  }

  // ─── Notifications ────────────────────────────────────────────────────────
  function showNotification(message, type = 'info', duration = 3000) {
    const el = document.createElement('div');
    el.className = `notification notification-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 500); }, duration);
  }

  function showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function showDamageIndicator(direction, amount) {
    const el = document.createElement('div');
    el.className = 'damage-indicator';
    el.textContent = `-${amount}`;
    el.style.left = (30 + Math.random() * 40) + '%';
    el.style.top = (30 + Math.random() * 40) + '%';
    document.getElementById('hud').appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function showQuestPopup(type) {
    const el = document.getElementById('quest-popup');
    if (!el) return;
    const messages = {
      kill: 'Kill Progress +1',
      win: 'Match Win! Quest Progress!',
      damage: 'Damage Quest Progress!',
      headshot: 'Headshot Quest Progress!'
    };
    el.textContent = messages[type] || 'Quest Progress!';
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2000);
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────
  async function fetchLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      const list = document.getElementById('leaderboard-list');
      if (!list) return;
      list.innerHTML = data.slice(0, 20).map((p, i) => `
        <div class="leaderboard-row ${p.username === GameState.account?.username ? 'me' : ''}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${p.username}</span>
          <span class="lb-kills">${p.kills}K</span>
          <span class="lb-kdr">${p.kdr} KDR</span>
        </div>
      `).join('');
    } catch(e) { console.error('Leaderboard fetch failed', e); }
  }

  // ─── Tab switching ────────────────────────────────────────────────────────
  function setupBnav() {
    document.querySelectorAll('.bnav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return {
    showAuth, showMainMenu, showGame, showSettings,
    showBattlePass, showShop, showLocker, showParty, showQuests, showMain,
    showOverlay, closeOverlay,
    refreshMainMenu, renderBattlePass, renderShop, renderLocker, renderQuests,
    updatePartyUI, showPartyInvite,
    showMatchTimer, showMatchEnd, hideMatchmaking, showMatchmaking,
    showNotification, showError, showDamageIndicator, showQuestPopup,
    fetchLeaderboard
  };
})();

// ─── Global Menu Functions ────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`${tab}-form`).style.display = 'flex';
  document.querySelectorAll('.tab-btn')[tab === 'login' ? 0 : 1].classList.add('active');
}

function switchMenuTab(tab) {
  document.querySelectorAll('.menu-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.menu-tab-content').forEach(c => c.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
  if (tab === 'leaderboard') UI.fetchLeaderboard();
}

async function login() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!username || !password) { UI.showError('Enter username and password'); return; }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { UI.showError(data.error); return; }
    localStorage.setItem('zz_token', data.token);
    GameState.account = data.account;
    Network.socket.emit('authenticate', { token: data.token });
  } catch(e) { UI.showError('Connection error'); }
}

async function register() {
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const password2 = document.getElementById('reg-pass2').value;
  if (!username || !password) { UI.showError('Fill in all fields'); return; }
  if (password !== password2) { UI.showError('Passwords do not match'); return; }
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { UI.showError(data.error); return; }
    localStorage.setItem('zz_token', data.token);
    GameState.account = data.account;
    Network.socket.emit('authenticate', { token: data.token });
  } catch(e) { UI.showError('Connection error'); }
}

function logout() {
  localStorage.removeItem('zz_token');
  GameState.account = null;
  UI.showAuth();
}

function showMain() { UI.showMain(); }
function showBattlePass() { UI.showBattlePass(); }
function showShop() { UI.showShop(); }
function showLocker() { UI.showLocker(); }
function showParty() { UI.showParty(); }
function showQuests() { UI.showQuests(); }
function showSettings() { UI.showSettings(); }
function closeOverlay() { UI.closeOverlay(); }

function openMatchmake(mode) {
  UI.showMatchmaking(mode);
  Network.findMatch(mode);
}

function cancelMatchmaking() {
  UI.hideMatchmaking();
  // TODO: emit cancel to server
}

function applySettings() {
  const q = document.getElementById('set-quality')?.value || 'medium';
  const fov = parseInt(document.getElementById('set-fov')?.value || 90);
  const sens = parseInt(document.getElementById('set-sens')?.value || 8);
  const invertY = document.getElementById('set-invert-y')?.checked || false;
  const shadows = document.getElementById('set-shadows')?.checked || true;

  document.getElementById('fov-val').textContent = fov;
  document.getElementById('sens-val').textContent = sens;
  Engine.setQuality(q);
  PlayerController.setFOV(fov);
  PlayerController.setSensitivity(sens);
  PlayerController.setInvertY(invertY);
}

function showScoreboard(show) {
  const el = document.getElementById('scoreboard');
  if (!el) return;
  el.style.display = show ? 'block' : 'none';
  if (show) {
    const tbody = document.getElementById('score-tbody');
    const remote = PlayerController.remotePlayers;
    const rows = [
      { username: GameState.account?.username, kills: PlayerController.localPlayer.kills, deaths: PlayerController.localPlayer.localPlayer?.deaths || 0, damage: 0 },
      ...Object.values(remote).map(p => ({ username: p.username, kills: 0, deaths: 0, damage: 0 }))
    ];
    if (tbody) tbody.innerHTML = rows.map(r => `
      <tr><td>${r.username}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.damage}</td></tr>
    `).join('');
  }
}

function togglePause() {
  const pm = document.getElementById('pause-menu');
  if (!pm) return;
  const showing = pm.style.display !== 'none';
  pm.style.display = showing ? 'none' : 'flex';
  if (showing) {
    document.getElementById('game-canvas').requestPointerLock();
  } else {
    document.exitPointerLock();
  }
}

function resumeGame() {
  document.getElementById('pause-menu').style.display = 'none';
  document.getElementById('game-canvas').requestPointerLock();
}

function leaveGame() { Network.leaveGame(); }

function openChat() {
  const row = document.getElementById('chat-input-row');
  const input = document.getElementById('game-chat-input');
  if (!row) return;
  row.style.display = 'flex';
  input.focus();
  document.exitPointerLock();
}

function closeChat() {
  document.getElementById('chat-input-row').style.display = 'none';
  document.getElementById('game-canvas').requestPointerLock();
}

function sendChat() {
  const input = document.getElementById('game-chat-input');
  const msg = input.value.trim();
  if (msg) { Network.sendChat(msg); input.value = ''; }
  closeChat();
}

function toggleWeaponWheel() {
  const ww = document.getElementById('weapon-wheel');
  if (ww) ww.style.display = ww.style.display === 'none' ? 'flex' : 'none';
}

function selectWeapon(w) {
  PlayerController.selectWeapon(w);
  document.getElementById('weapon-wheel').style.display = 'none';
}

async function buyItem(itemId) {
  const token = localStorage.getItem('zz_token');
  try {
    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ itemId })
    });
    const data = await res.json();
    if (!res.ok) { UI.showNotification(data.error, 'error'); return; }
    GameState.account = data.account;
    UI.showNotification('Item purchased!', 'success');
    UI.renderShop();
    document.getElementById('nav-volts').textContent = GameState.account.volts;
  } catch(e) { UI.showNotification('Purchase failed', 'error'); }
}

async function equipSkin(skinId, skinName) {
  const token = localStorage.getItem('zz_token');
  try {
    const res = await fetch('/api/equip-skin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ skinId })
    });
    if (!res.ok) return;
    GameState.account.activeSkin = skinId;
    document.getElementById('equipped-skin-name').textContent = skinName;
    UI.showNotification(`Equipped ${skinName}`, 'success');
    UI.renderLocker();
  } catch(e) { UI.showNotification('Failed to equip', 'error'); }
}

async function upgradeBattlePass() {
  const token = localStorage.getItem('zz_token');
  try {
    const res = await fetch('/api/battlepass/upgrade', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) { UI.showNotification(data.error, 'error'); return; }
    GameState.account = data.account;
    UI.showNotification('Battle Pass Upgraded!', 'success');
    UI.renderBattlePass();
  } catch(e) { UI.showNotification('Upgrade failed', 'error'); }
}

function createParty() { Network.createParty(); }
function joinPartyByCode() {
  const code = document.getElementById('party-code-input').value.trim().toUpperCase();
  if (code) Network.joinParty(code);
}
function leaveParty() { Network.leaveParty(); }
function inviteToParty() {
  const u = document.getElementById('invite-username').value.trim();
  if (u) Network.inviteToParty(u);
}
function sendPartyChat() {
  const inp = document.getElementById('party-chat-input');
  if (inp.value.trim()) { Network.partyChat(inp.value.trim()); inp.value = ''; }
}
function partyQueue() { Network.partyQueue('deathmatch'); }
function copyPartyCode() {
  const code = document.getElementById('party-code')?.textContent;
  if (code) navigator.clipboard.writeText(code).then(() => UI.showNotification('Code copied!', 'success'));
}
