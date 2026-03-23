// ════════════════════════════════════════════════════════════════
// ZapZone Admin Panel Logic
// ════════════════════════════════════════════════════════════════

let adminToken = null;
let adminAccount = null;
let currentPage = 'dashboard';
let playerPage = 1;
let liveInterval = null;

// ─── Login / Auth ─────────────────────────────────────────────────────────────
async function adminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('al-user').value.trim();
  const password = document.getElementById('al-pass').value;
  const errEl = document.getElementById('al-error');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    if (data.account.role !== 'admin' && data.account.role !== 'owner') {
      errEl.textContent = 'Admin or Owner access required';
      return;
    }
    adminToken = data.token;
    adminAccount = data.account;
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'flex';
    document.getElementById('admin-username-display').textContent = adminAccount.username;
    const roleEl = document.getElementById('admin-role-display');
    roleEl.textContent = adminAccount.role === 'owner' ? 'OWNER' : 'ADMIN';
    roleEl.className = `role-chip role-${adminAccount.role}`;
    showPage('dashboard');
    refreshDashboard();
  } catch(err) {
    errEl.textContent = 'Connection error';
  }
}

function adminLogout() {
  adminToken = null;
  adminAccount = null;
  stopLiveMonitor();
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('admin-login').style.display = 'flex';
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { 'Authorization': `Bearer ${adminToken}` } });
  if (res.status === 401 || res.status === 403) { adminLogout(); throw new Error('Unauthorized'); }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify(body)
  });
  return { ok: res.ok, data: await res.json() };
}

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
  return { ok: res.ok, data: await res.json() };
}

// ─── Page Navigation ──────────────────────────────────────────────────────────
function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  // Load page data
  switch (page) {
    case 'dashboard': refreshDashboard(); break;
    case 'players': loadPlayers(); break;
    case 'bans': loadBans(); break;
    case 'leaderboard': loadLeaderboard(); break;
    case 'rooms': loadRooms(); break;
    case 'announce': loadAnnouncements(); break;
    case 'settings': loadServerInfo(); break;
    case 'live': startLiveMonitor(); break;
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function refreshDashboard() {
  try {
    const [stats, serverInfo] = await Promise.all([
      apiGet('/api/admin/stats'),
      apiGet('/api/admin/server-info')
    ]);

    document.getElementById('stat-online').textContent = stats.onlinePlayers;
    document.getElementById('stat-total').textContent = stats.totalAccounts;
    document.getElementById('stat-matches').textContent = stats.activeRooms;
    document.getElementById('stat-kills').textContent = stats.totalKills.toLocaleString();
    document.getElementById('stat-waiting').textContent = stats.waitingRooms;
    document.getElementById('stat-total-matches').textContent = stats.totalMatches.toLocaleString();
    document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();

    // Announcements
    const annoEl = document.getElementById('dash-announcements');
    if (annoEl) {
      annoEl.innerHTML = (stats.announcements || []).slice(0, 5).map(a => `
        <div class="dash-item anno-${a.type}">
          <span class="dash-item-icon">${a.type === 'warning' ? '⚠' : a.type === 'danger' ? '🚨' : 'ℹ'}</span>
          <div>
            <div class="dash-item-title">${esc(a.message)}</div>
            <div class="dash-item-sub">by ${esc(a.author)} · ${timeAgo(a.at)}</div>
          </div>
        </div>
      `).join('') || '<div class="empty-dash">No announcements yet</div>';
    }

    // Server health
    const healthEl = document.getElementById('server-health');
    if (healthEl && serverInfo) {
      const uptime = formatUptime(serverInfo.uptime);
      const memMB = (serverInfo.memory.rss / 1024 / 1024).toFixed(1);
      const heapMB = (serverInfo.memory.heapUsed / 1024 / 1024).toFixed(1);
      const heapTotal = (serverInfo.memory.heapTotal / 1024 / 1024).toFixed(1);
      const heapPct = Math.round((serverInfo.memory.heapUsed / serverInfo.memory.heapTotal) * 100);
      healthEl.innerHTML = `
        <div class="health-row"><span>Uptime</span><strong>${uptime}</strong></div>
        <div class="health-row"><span>Node.js</span><strong>${serverInfo.nodeVersion}</strong></div>
        <div class="health-row"><span>Platform</span><strong>${serverInfo.platform}</strong></div>
        <div class="health-row"><span>RSS Memory</span><strong>${memMB} MB</strong></div>
        <div class="health-row"><span>Heap Used</span><strong>${heapMB} / ${heapTotal} MB</strong></div>
        <div class="mem-bar-wrap">
          <div class="mem-bar"><div class="mem-bar-fill ${heapPct > 80 ? 'danger' : heapPct > 60 ? 'warning' : ''}" style="width:${heapPct}%"></div></div>
          <span>${heapPct}%</span>
        </div>
      `;
    }
  } catch(e) { console.error('Dashboard refresh failed', e); }
}

// ─── Live Monitor ─────────────────────────────────────────────────────────────
function startLiveMonitor() {
  updateLive();
  if (liveInterval) clearInterval(liveInterval);
  liveInterval = setInterval(updateLive, 3000);
}

function stopLiveMonitor() {
  if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
}

async function updateLive() {
  if (currentPage !== 'live') return;
  try {
    const [stats, rooms] = await Promise.all([
      apiGet('/api/admin/stats'),
      apiGet('/api/admin/rooms')
    ]);
    document.getElementById('live-count').textContent = stats.onlinePlayers;

    // Rooms
    const roomsEl = document.getElementById('live-rooms-list');
    if (roomsEl) {
      roomsEl.innerHTML = rooms.map(r => `
        <div class="live-item">
          <div class="live-item-header">
            <span class="live-room-id">${r.id}</span>
            <span class="live-status status-${r.status}">${r.status}</span>
          </div>
          <div class="live-item-sub">${r.mode} · ${r.mapId} · ${r.playerCount}/${r.maxPlayers} players</div>
          ${r.status === 'playing' ? `<button class="btn-xs btn-danger-xs" onclick="closeRoom('${r.id}')">Close Room</button>` : ''}
        </div>
      `).join('') || '<div class="empty-dash">No active rooms</div>';
    }

    // Event log entry
    const log = document.getElementById('live-event-log');
    if (log) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span> — ${stats.onlinePlayers} online, ${rooms.filter(r=>r.status==='playing').length} active rooms`;
      log.prepend(entry);
      while (log.children.length > 50) log.lastChild.remove();
    }
  } catch(e) {}
}

// ─── Players ─────────────────────────────────────────────────────────────────
async function loadPlayers() {
  const search = document.getElementById('player-search')?.value || '';
  const role = document.getElementById('role-filter')?.value || '';
  try {
    const data = await apiGet(`/api/admin/players?search=${encodeURIComponent(search)}&role=${role}&page=${playerPage}&limit=20`);
    const tbody = document.getElementById('players-tbody');
    if (!tbody) return;
    tbody.innerHTML = data.players.map(p => `
      <tr class="${p.isBanned ? 'banned-row' : ''} ${p.role === 'owner' ? 'owner-row' : p.role === 'admin' ? 'admin-row' : ''}">
        <td class="player-name-cell">
          <span class="player-avatar">👤</span>
          <strong>${esc(p.username)}</strong>
          ${p.isBanned ? '<span class="badge-banned">BANNED</span>' : ''}
        </td>
        <td><span class="role-chip-sm role-${p.role}">${p.role.toUpperCase()}</span></td>
        <td>${(p.stats?.kills || 0).toLocaleString()}</td>
        <td>${(p.stats?.wins || 0).toLocaleString()}</td>
        <td>${(p.coins || 0).toLocaleString()}</td>
        <td>${(p.volts || 0).toLocaleString()}</td>
        <td>${p.battlepass?.level || 1}</td>
        <td><span class="status-dot ${p.isBanned ? 'banned' : 'active'}"></span> ${p.isBanned ? 'Banned' : 'Active'}</td>
        <td>${p.lastLogin ? new Date(p.lastLogin).toLocaleDateString() : 'Never'}</td>
        <td class="actions-cell">
          <button class="btn-xs" onclick="viewPlayer('${esc(p.username)}')">View</button>
          ${!p.isBanned && p.role !== 'owner' ? `<button class="btn-xs btn-danger-xs" onclick="quickBan('${esc(p.username)}')">Ban</button>` : ''}
          ${p.isBanned ? `<button class="btn-xs btn-success-xs" onclick="unbanPlayer('${esc(p.username)}')">Unban</button>` : ''}
          ${p.role !== 'owner' ? `<button class="btn-xs btn-warn-xs" onclick="kickPlayer('${esc(p.username)}')">Kick</button>` : ''}
        </td>
      </tr>
    `).join('');

    // Pagination
    const pgEl = document.getElementById('players-pagination');
    if (pgEl) {
      const pages = data.pages;
      pgEl.innerHTML = Array.from({ length: Math.min(pages, 10) }, (_, i) => `
        <button class="pg-btn ${i + 1 === playerPage ? 'active' : ''}" onclick="goPage(${i + 1})">${i + 1}</button>
      `).join('');
    }
  } catch(e) { console.error('Load players failed', e); }
}

function goPage(n) { playerPage = n; loadPlayers(); }

async function searchPlayers() { playerPage = 1; await loadPlayers(); }

async function viewPlayer(username) {
  try {
    const p = await apiGet(`/api/admin/player/${encodeURIComponent(username)}`);
    const modal = document.getElementById('player-modal');
    document.getElementById('modal-player-name').textContent = p.username;

    document.getElementById('modal-player-body').innerHTML = `
      <div class="player-detail-grid">
        <div class="detail-section">
          <h4>Account Info</h4>
          <div class="detail-row"><span>ID</span><strong>${p.id}</strong></div>
          <div class="detail-row"><span>Username</span><strong>${esc(p.username)}</strong></div>
          <div class="detail-row"><span>Role</span><span class="role-chip-sm role-${p.role}">${p.role}</span></div>
          <div class="detail-row"><span>Status</span><strong>${p.isBanned ? '🚫 Banned' : '✅ Active'}</strong></div>
          ${p.isBanned ? `<div class="detail-row ban-info"><span>Ban Reason</span><strong>${esc(p.banReason || 'N/A')}</strong></div>` : ''}
          <div class="detail-row"><span>Created</span><strong>${new Date(p.createdAt).toLocaleString()}</strong></div>
          <div class="detail-row"><span>Last Login</span><strong>${p.lastLogin ? new Date(p.lastLogin).toLocaleString() : 'Never'}</strong></div>
        </div>
        <div class="detail-section">
          <h4>Economy</h4>
          <div class="detail-row"><span>Coins</span><strong>${(p.coins || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>Volts</span><strong>${(p.volts || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>BP Level</span><strong>${p.battlepass?.level || 1}</strong></div>
          <div class="detail-row"><span>BP XP</span><strong>${(p.battlepass?.xp || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>BP Premium</span><strong>${p.battlepass?.premium ? '✅ Yes' : '❌ No'}</strong></div>
          <div class="detail-row"><span>Active Skin</span><strong>${p.activeSkin || 'default'}</strong></div>
          <div class="detail-row"><span>Skins Owned</span><strong>${p.skins === '*' ? 'ALL' : Array.isArray(p.skins) ? p.skins.length : 0}</strong></div>
        </div>
        <div class="detail-section">
          <h4>Game Stats</h4>
          <div class="detail-row"><span>Kills</span><strong>${(p.stats?.kills || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>Deaths</span><strong>${(p.stats?.deaths || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>K/D Ratio</span><strong>${p.stats?.deaths > 0 ? (p.stats.kills / p.stats.deaths).toFixed(2) : p.stats?.kills || 0}</strong></div>
          <div class="detail-row"><span>Wins</span><strong>${(p.stats?.wins || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>Losses</span><strong>${(p.stats?.losses || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>Matches</span><strong>${(p.stats?.matches || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>Win Rate</span><strong>${p.stats?.matches > 0 ? Math.round(p.stats.wins / p.stats.matches * 100) : 0}%</strong></div>
          <div class="detail-row"><span>Headshots</span><strong>${(p.stats?.headshots || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>Damage</span><strong>${(p.stats?.damage || 0).toLocaleString()}</strong></div>
          <div class="detail-row"><span>Quests Done</span><strong>${(p.quests?.completed?.length || 0)}</strong></div>
        </div>
      </div>
    `;

    document.getElementById('modal-player-actions').innerHTML = `
      <div class="modal-action-group">
        ${!p.isBanned && p.role !== 'owner' ? `
          <button class="btn-danger-sm" onclick="banPlayer('${esc(p.username)}')">🚫 Ban Player</button>
        ` : ''}
        ${p.isBanned ? `
          <button class="btn-success-sm" onclick="unbanPlayer('${esc(p.username)}'); closeModal()">✅ Unban</button>
        ` : ''}
        ${p.role !== 'owner' ? `
          <button class="btn-warn-sm" onclick="kickPlayer('${esc(p.username)}')">⚠ Kick</button>
          <button class="btn-sm-neutral" onclick="resetPlayerStats('${esc(p.username)}')">🔄 Reset Stats</button>
        ` : ''}
        <button class="btn-primary-sm" onclick="openGiveModal('${esc(p.username)}')">💰 Give Currency</button>
      </div>
    `;

    modal.style.display = 'flex';
  } catch(e) { console.error('View player failed', e); }
}

function closeModal() {
  document.getElementById('player-modal').style.display = 'none';
}

async function quickBan(username) {
  const reason = prompt(`Ban reason for ${username}:`, 'Violation of Terms of Service');
  if (!reason) return;
  await banPlayerWithReason(username, reason);
}

async function banPlayer(username) {
  const reason = prompt(`Ban reason for ${username}:`, 'Violation of Terms of Service');
  if (!reason) return;
  await banPlayerWithReason(username, reason);
  closeModal();
}

async function banPlayerWithReason(username, reason) {
  const { ok, data } = await apiPost('/api/admin/ban', { username, reason });
  if (ok) { showNotif(`${username} banned`, 'success'); loadPlayers(); }
  else showNotif(data.error, 'error');
}

async function unbanPlayer(username) {
  const { ok, data } = await apiPost('/api/admin/unban', { username });
  if (ok) { showNotif(`${username} unbanned`, 'success'); loadPlayers(); }
  else showNotif(data.error, 'error');
}

async function kickPlayer(username) {
  const reason = prompt('Kick reason:', 'Kicked by admin');
  if (!reason) return;
  const { ok, data } = await apiPost('/api/admin/kick-player', { username, reason });
  if (ok) showNotif(`${username} kicked`, 'success');
  else showNotif(data.error || 'Player not online', 'warning');
}

async function resetPlayerStats(username) {
  if (!confirm(`Reset stats for ${username}?`)) return;
  const { ok } = await apiPost('/api/admin/reset-stats', { username });
  if (ok) { showNotif('Stats reset', 'success'); viewPlayer(username); }
}

function openGiveModal(username) {
  const amount = prompt(`Give Volts to ${username}:`);
  if (amount && !isNaN(amount)) giveVoltsTo(username, parseInt(amount));
}

async function giveVoltsTo(username, amount) {
  const { ok, data } = await apiPost('/api/admin/give-volts', { username, amount });
  if (ok) showNotif(`Gave ${amount} Volts to ${username}`, 'success');
  else showNotif(data.error, 'error');
}

async function changeRoleFor(username, role) {
  const { ok, data } = await apiPost('/api/admin/set-role', { username, role });
  if (ok) { showNotif(`${username} is now ${role}`, 'success'); loadPlayers(); }
  else showNotif(data.error, 'error');
}

// ─── Bans ────────────────────────────────────────────────────────────────────
async function loadBans() {
  try {
    const bans = await apiGet('/api/admin/bans');
    const tbody = document.getElementById('bans-tbody');
    if (!tbody) return;
    tbody.innerHTML = bans.length === 0
      ? '<tr><td colspan="5" class="empty-cell">No active bans</td></tr>'
      : bans.map(b => `
      <tr>
        <td><strong>${esc(b.username)}</strong></td>
        <td>${esc(b.reason || 'No reason')}</td>
        <td>${esc(b.bannedBy || 'Unknown')}</td>
        <td>${b.at ? new Date(b.at).toLocaleString() : 'Unknown'}</td>
        <td><button class="btn-xs btn-success-xs" onclick="unbanPlayer('${esc(b.username)}'); loadBans()">Unban</button></td>
      </tr>
    `).join('');
  } catch(e) {}
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const data = await apiGet('/api/leaderboard');
    const tbody = document.getElementById('lb-tbody');
    if (!tbody) return;
    tbody.innerHTML = data.map((p, i) => `
      <tr>
        <td class="rank-cell">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
        <td><strong>${esc(p.username)}</strong></td>
        <td>${p.kills.toLocaleString()}</td>
        <td>${p.deaths.toLocaleString()}</td>
        <td>${p.kdr}</td>
        <td>${p.wins.toLocaleString()}</td>
      </tr>
    `).join('');
  } catch(e) {}
}

// ─── Rooms ───────────────────────────────────────────────────────────────────
async function loadRooms() {
  try {
    const rooms = await apiGet('/api/admin/rooms');
    const tbody = document.getElementById('rooms-tbody');
    if (!tbody) return;
    tbody.innerHTML = rooms.length === 0
      ? '<tr><td colspan="7" class="empty-cell">No rooms active</td></tr>'
      : rooms.map(r => `
      <tr>
        <td><code>${r.id}</code></td>
        <td>${r.mapId}</td>
        <td><span class="mode-badge mode-${r.mode}">${r.mode}</span></td>
        <td>${r.playerCount}/${r.maxPlayers}</td>
        <td><span class="status-badge status-${r.status}">${r.status}</span></td>
        <td>${r.startTime ? formatUptime((Date.now() - r.startTime) / 1000) : '—'}</td>
        <td><button class="btn-xs btn-danger-xs" onclick="closeRoom('${r.id}')">Close</button></td>
      </tr>
    `).join('');
  } catch(e) {}
}

async function closeRoom(roomId) {
  if (!confirm(`Close room ${roomId}?`)) return;
  const { ok } = await apiDelete(`/api/admin/room/${roomId}`);
  if (ok) { showNotif('Room closed', 'success'); loadRooms(); }
}

// ─── Economy ──────────────────────────────────────────────────────────────────
async function giveVolts() {
  const username = document.getElementById('eco-vb-user').value.trim();
  const amount = parseInt(document.getElementById('eco-vb-amount').value);
  if (!username || isNaN(amount)) { showEcoResult('eco-vb-result', 'Invalid input', 'error'); return; }
  const { ok, data } = await apiPost('/api/admin/give-volts', { username, amount });
  showEcoResult('eco-vb-result', ok ? `✓ Gave ${amount} Volts to ${username}. New balance: ${data.newBalance}` : data.error, ok ? 'success' : 'error');
}

async function giveCoins() {
  const username = document.getElementById('eco-coin-user').value.trim();
  const amount = parseInt(document.getElementById('eco-coin-amount').value);
  if (!username || isNaN(amount)) { showEcoResult('eco-coin-result', 'Invalid input', 'error'); return; }
  const { ok, data } = await apiPost('/api/admin/give-coins', { username, amount });
  showEcoResult('eco-coin-result', ok ? `✓ Gave ${amount} coins to ${username}. New balance: ${data.newBalance}` : data.error, ok ? 'success' : 'error');
}

async function resetStats() {
  const username = document.getElementById('eco-reset-user').value.trim();
  if (!username) return;
  if (!confirm(`Reset stats for ${username}? This cannot be undone.`)) return;
  const { ok, data } = await apiPost('/api/admin/reset-stats', { username });
  showEcoResult('eco-reset-result', ok ? `✓ Stats reset for ${username}` : data.error, ok ? 'success' : 'error');
}

async function changeRole() {
  const username = document.getElementById('eco-role-user').value.trim();
  const role = document.getElementById('eco-role-select').value;
  if (!username) return;
  const { ok, data } = await apiPost('/api/admin/set-role', { username, role });
  showEcoResult('eco-role-result', ok ? `✓ ${username} is now ${role}` : data.error, ok ? 'success' : 'error');
}

function showEcoResult(id, msg, type) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.className = `eco-result eco-result-${type}`; }
}

// ─── Announcements ────────────────────────────────────────────────────────────
async function sendAnnouncement() {
  const message = document.getElementById('announce-message').value.trim();
  const type = document.getElementById('announce-type').value;
  if (!message) { showNotif('Enter a message', 'warning'); return; }
  const { ok } = await apiPost('/api/admin/announce', { message, type });
  if (ok) {
    showNotif('Announcement sent!', 'success');
    document.getElementById('announce-message').value = '';
    document.getElementById('announce-result').textContent = '✓ Sent to all online players';
    loadAnnouncements();
  }
}

async function loadAnnouncements() {
  try {
    const stats = await apiGet('/api/admin/stats');
    const list = document.getElementById('announce-history-list');
    if (!list) return;
    list.innerHTML = (stats.announcements || []).map(a => `
      <div class="history-item anno-${a.type}">
        <div class="history-msg">${esc(a.message)}</div>
        <div class="history-meta">by ${esc(a.author)} · ${timeAgo(a.at)} · <span class="type-label">${a.type}</span></div>
      </div>
    `).join('') || '<div class="empty-dash">No announcements yet</div>';
  } catch(e) {}
}

// ─── Server Info ──────────────────────────────────────────────────────────────
async function loadServerInfo() {
  try {
    const info = await apiGet('/api/admin/server-info');
    const sysEl = document.getElementById('server-sys-info');
    const memEl = document.getElementById('server-mem-info');
    const gameEl = document.getElementById('server-game-info');

    if (sysEl) sysEl.innerHTML = `
      <div class="info-row"><span>Uptime</span><strong>${formatUptime(info.uptime)}</strong></div>
      <div class="info-row"><span>Node.js</span><strong>${info.nodeVersion}</strong></div>
      <div class="info-row"><span>Platform</span><strong>${info.platform}</strong></div>
    `;

    if (memEl) {
      const rss = (info.memory.rss / 1024 / 1024).toFixed(2);
      const heapUsed = (info.memory.heapUsed / 1024 / 1024).toFixed(2);
      const heapTotal = (info.memory.heapTotal / 1024 / 1024).toFixed(2);
      const ext = (info.memory.external / 1024 / 1024).toFixed(2);
      memEl.innerHTML = `
        <div class="info-row"><span>RSS</span><strong>${rss} MB</strong></div>
        <div class="info-row"><span>Heap Used</span><strong>${heapUsed} MB</strong></div>
        <div class="info-row"><span>Heap Total</span><strong>${heapTotal} MB</strong></div>
        <div class="info-row"><span>External</span><strong>${ext} MB</strong></div>
      `;
    }

    if (gameEl) gameEl.innerHTML = `
      <div class="info-row"><span>Total Players</span><strong>${info.totalPlayers.toLocaleString()}</strong></div>
      <div class="info-row"><span>Total Matches</span><strong>${info.totalMatches.toLocaleString()}</strong></div>
      <div class="info-row"><span>Total Kills</span><strong>${info.totalKills.toLocaleString()}</strong></div>
    `;
  } catch(e) { console.error('Server info failed', e); }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function showNotif(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `admin-notif admin-notif-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 400); }, 3000);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Auto-refresh dashboard every 30s
setInterval(() => { if (currentPage === 'dashboard') refreshDashboard(); }, 30000);
