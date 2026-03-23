// ════════════════════════════════════════════════════════════════
// Network Manager — Socket.io Client
// ════════════════════════════════════════════════════════════════

const Network = (() => {
  let socket = null;
  let isConnected = false;
  let localId = null;
  let roomId = null;
  let matchTimerInterval = null;
  let matchStartTime = null;
  let matchDuration = 0;

  function connect() {
    socket = io({ transports: ['websocket'], reconnection: true, reconnectionAttempts: 5 });

    socket.on('connect', () => {
      isConnected = true;
      console.log('[Net] Connected:', socket.id);
      localId = socket.id;
      // Re-authenticate if we have a token
      const token = localStorage.getItem('zz_token');
      if (token) socket.emit('authenticate', { token });
    });

    socket.on('disconnect', () => {
      isConnected = false;
      console.log('[Net] Disconnected');
    });

    socket.on('authenticated', (data) => {
      GameState.account = data.account;
      GameState.battlepassTiers = data.battlepass.tiers;
      GameState.shopItems = data.shopItems;
      UI.showMainMenu();
    });

    socket.on('auth_error', (msg) => {
      localStorage.removeItem('zz_token');
      UI.showAuth();
      UI.showError(msg);
    });

    socket.on('banned', ({ reason }) => {
      UI.showAuth();
      UI.showError(`Your account has been banned: ${reason}`);
    });

    socket.on('kicked', ({ reason }) => {
      leaveGame();
      UI.showNotification('You were kicked: ' + reason, 'error');
    });

    // ─── Match Events ─────────────────────────────────────────────────────
    socket.on('joined_room', (data) => {
      roomId = data.roomId;
      console.log('[Net] Joined room:', roomId, 'as', data.player.username);
      Engine.buildMap(data.mapId);
      PlayerController.initLocal(Engine.camera, GameState.account.activeSkin || 'default');

      // Initialize local player position
      const spawn = data.player.position;
      PlayerController.localPlayer.object.position.set(spawn.x, spawn.y, spawn.z);

      // Add existing players
      Object.values(data.players).forEach(p => {
        if (p.id !== socket.id) {
          PlayerController.addRemotePlayer(p);
        }
      });

      PlayerController.localPlayer.id = socket.id;
      UI.showGame();
      UI.hideMatchmaking();
      Engine.start();

      if (data.status === 'playing') {
        UI.showMatchTimer(data.startTime, data.duration);
      }
    });

    socket.on('player_joined', ({ player }) => {
      if (player.id !== socket.id) {
        PlayerController.addRemotePlayer(player);
        addKillFeedEntry(`${player.username} joined the match`, '', '', '#88FFAA');
      }
    });

    socket.on('player_left', ({ playerId }) => {
      const rp = PlayerController.remotePlayers[playerId];
      if (rp) addKillFeedEntry(`${rp.username} left the match`, '', '', '#FFAA44');
      PlayerController.removeRemotePlayer(playerId);
    });

    socket.on('match_start', ({ startTime, duration }) => {
      matchStartTime = startTime;
      matchDuration = duration;
      UI.showMatchTimer(startTime, duration);
      UI.showNotification('MATCH STARTED!', 'success');
    });

    socket.on('match_end', ({ scores, winner }) => {
      UI.showMatchEnd(scores, winner, GameState.account.username);
      stopMatchTimer();
    });

    socket.on('match_rewards', ({ xpGained, coinsGained, account }) => {
      GameState.account = account;
      document.getElementById('match-rewards').innerHTML = `
        <div class="reward-line">+${xpGained} XP</div>
        <div class="reward-line">+${coinsGained} Coins</div>
      `;
    });

    // ─── Player Events ────────────────────────────────────────────────────
    socket.on('player_moved', ({ id, position, rotation, animation }) => {
      PlayerController.updateRemotePlayer(id, { position, rotation, animation });
    });

    socket.on('player_shot', ({ shooterId, weapon, origin, direction }) => {
      // Show visual bullet trail for remote shots
      const start = new THREE.Vector3(...origin);
      const dir = new THREE.Vector3(...direction);
      const end = start.clone().addScaledVector(dir, 300);
      Engine.spawnProjectileTrail(start, end, 0xFFFFAA);
    });

    socket.on('player_damaged', ({ targetId, damage, headshot, health, shooterId }) => {
      if (targetId === socket.id) {
        // We got hit
        PlayerController.setLocalHealth(health, PlayerController.localPlayer.maxHealth);
        flashDamage();
        const direction = new THREE.Vector3();
        if (PlayerController.remotePlayers[shooterId]) {
          direction.subVectors(
            PlayerController.remotePlayers[shooterId].object.position,
            PlayerController.localPlayer.object.position
          ).normalize();
        }
        UI.showDamageIndicator(direction, damage);
      } else {
        PlayerController.damageRemotePlayer(targetId, damage, headshot);
      }
    });

    socket.on('player_killed', ({ killerId, killerName, victimId, victimName, weapon, headshot }) => {
      PlayerController.killRemotePlayer(victimId);
      addKillFeedEntry(killerName, victimName, weapon, headshot ? '#FF4444' : '#FFFFFF');

      if (victimId === socket.id) {
        PlayerController.setLocalDead(killerName);
      }
      if (killerId === socket.id) {
        PlayerController.localPlayer.kills++;
        document.getElementById('match-kills-hud').textContent = PlayerController.localPlayer.kills + ' Kills';
        showKillNotification(victimName, headshot);
        UI.showQuestPopup('kill');
      }
    });

    socket.on('player_respawned', ({ playerId, position, health }) => {
      if (playerId === socket.id) {
        PlayerController.setLocalRespawn(position);
      } else {
        PlayerController.respawnRemotePlayer(playerId, position);
      }
    });

    socket.on('player_weapon_changed', ({ playerId, weapon }) => {
      PlayerController.updateRemotePlayer(playerId, { weapon });
    });

    socket.on('player_muted', ({ playerId, muted }) => {
      VoiceChat.setPlayerMuted(playerId, muted);
    });

    // ─── Chat Events ──────────────────────────────────────────────────────
    socket.on('chat_message', ({ from, message }) => {
      addGameChat(from, message, false);
    });

    socket.on('global_chat', ({ from, message, role }) => {
      const badge = role === 'owner' || role === 'supreme' ? '👑' : role === 'admin' ? '🛡' : '';
      addGameChat(`${badge}${from}`, message, true);
    });

    socket.on('announcement', ({ message, type }) => {
      UI.showNotification(message, type);
      const list = document.getElementById('announcements-list');
      if (list) {
        const el = document.createElement('div');
        el.className = `announcement announcement-${type}`;
        el.textContent = message;
        list.prepend(el);
      }
    });

    // ─── Party Events ─────────────────────────────────────────────────────
    socket.on('party_created', (party) => {
      GameState.party = party;
      UI.updatePartyUI(party);
    });

    socket.on('party_joined', (party) => {
      GameState.party = party;
      UI.updatePartyUI(party);
      UI.showNotification(`Joined party ${party.id}`, 'success');
    });

    socket.on('party_updated', (party) => {
      GameState.party = party;
      UI.updatePartyUI(party);
    });

    socket.on('party_left', () => {
      GameState.party = null;
      UI.updatePartyUI(null);
    });

    socket.on('party_error', (msg) => {
      UI.showNotification(msg, 'error');
    });

    socket.on('party_invite', ({ partyId, from }) => {
      UI.showPartyInvite(partyId, from);
    });

    socket.on('party_chat', ({ from, message }) => {
      const box = document.getElementById('party-chat-box');
      if (box) {
        const el = document.createElement('div');
        el.className = 'party-chat-msg';
        el.innerHTML = `<strong>${from}:</strong> ${escHtml(message)}`;
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
      }
    });

    // ─── Voice Signaling ──────────────────────────────────────────────────
    socket.on('voice_offer', ({ from, offer }) => VoiceChat.handleOffer(from, offer));
    socket.on('voice_answer', ({ from, answer }) => VoiceChat.handleAnswer(from, answer));
    socket.on('voice_ice', ({ from, candidate }) => VoiceChat.handleICE(from, candidate));
  }

  function stopMatchTimer() {
    if (matchTimerInterval) { clearInterval(matchTimerInterval); matchTimerInterval = null; }
  }

  // ─── Send Functions ───────────────────────────────────────────────────────
  function sendMove(data) { if (socket) socket.emit('player_move', data); }
  function sendShoot(data) { if (socket) socket.emit('player_shoot', data); }
  function sendHit(data) { if (socket) socket.emit('hit_player', data); }
  function sendWeaponChange(weapon) { if (socket) socket.emit('weapon_change', { weapon }); }
  function sendChat(message) { if (socket) socket.emit('chat_message', { message }); }
  function sendGlobalChat(message) { if (socket) socket.emit('global_chat', { message }); }
  function findMatch(mode) { if (socket) socket.emit('find_match', { mode }); }
  function createParty() { if (socket) socket.emit('create_party'); }
  function joinParty(partyId) { if (socket) socket.emit('join_party', { partyId }); }
  function leaveParty() { if (socket) socket.emit('leave_party'); }
  function inviteToParty(username) { if (socket) socket.emit('invite_to_party', { targetUsername: username }); }
  function partyChat(message) { if (socket) socket.emit('party_chat', { message }); }
  function partyQueue(mode) { if (socket) socket.emit('party_queue', { mode }); }
  function sendVoiceOffer(targetId, offer) { if (socket) socket.emit('voice_offer', { targetId, offer }); }
  function sendVoiceAnswer(targetId, answer) { if (socket) socket.emit('voice_answer', { targetId, answer }); }
  function sendVoiceICE(targetId, candidate) { if (socket) socket.emit('voice_ice', { targetId, candidate }); }
  function sendVoiceMute(muted) { if (socket) socket.emit('voice_mute', { muted }); }

  function leaveGame() {
    if (socket) socket.emit('leave_room');
    stopMatchTimer();
    Engine.stop();
    UI.showMainMenu();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ─── Kill Feed ────────────────────────────────────────────────────────────
  function addKillFeedEntry(killer, victim, weapon, color = '#FFFFFF') {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const entry = document.createElement('div');
    entry.className = 'kill-feed-entry';
    entry.style.color = color;
    entry.innerHTML = victim
      ? `<strong>${escHtml(killer)}</strong> ⚡ <strong>${escHtml(victim)}</strong>`
      : escHtml(killer);
    feed.prepend(entry);
    setTimeout(() => entry.remove(), 5000);
    // Max 6 entries
    while (feed.children.length > 6) feed.lastChild.remove();
  }

  function showKillNotification(victim, headshot) {
    const el = document.getElementById('kill-notification');
    if (!el) return;
    el.textContent = headshot ? `HEADSHOT! ${victim} eliminated` : `${victim} eliminated`;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function flashDamage() {
    const el = document.getElementById('damage-flash');
    if (!el) return;
    el.style.opacity = '0.5';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 300);
  }

  function addGameChat(from, message, isGlobal) {
    const box = document.getElementById('game-chat-messages');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `chat-msg ${isGlobal ? 'global' : ''}`;
    el.innerHTML = `<span class="chat-name">${escHtml(from)}</span>: ${escHtml(message)}`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    // Limit messages
    while (box.children.length > 30) box.firstChild.remove();
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    connect, leaveGame,
    sendMove, sendShoot, sendHit, sendWeaponChange,
    sendChat, sendGlobalChat,
    findMatch,
    createParty, joinParty, leaveParty, inviteToParty, partyChat, partyQueue,
    sendVoiceOffer, sendVoiceAnswer, sendVoiceICE, sendVoiceMute,
    addKillFeedEntry, showKillNotification, flashDamage, addGameChat,
    get socket() { return socket; },
    get localId() { return localId; },
    get roomId() { return roomId; }
  };
})();
