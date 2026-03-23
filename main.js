// ════════════════════════════════════════════════════════════════
// ZapZone Main Entry Point
// ════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', async () => {
  console.log('⚡ ZapZone initializing...');

  // Init engine (renderer only, not started yet)
  const canvas = document.getElementById('game-canvas');
  Engine.init(canvas);

  // Connect socket
  Network.connect();

  // Init mobile controls
  MobileControls.init();

  // Init audio
  Audio.init();

  // Init minimap
  Minimap.init();

  // Init ticker
  Ticker.init();

  // Register game loop callbacks
  Engine.onFrame((delta, elapsed) => {
    if (!document.getElementById('game-screen').classList.contains('active')) return;
    PlayerController.update(delta);
    Minimap.render(PlayerController.getLocalPosition(), PlayerController.remotePlayers);

    // Animate neon lights (flicker)
    Engine.scene.traverse(obj => {
      if (obj.isPointLight && obj.userData.isNeon) {
        obj.intensity = 1.2 + Math.sin(elapsed * 8 + obj.userData.neonPhase) * 0.3;
      }
    });
  });

  // Check for existing token
  const token = localStorage.getItem('zz_token');
  if (token) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        GameState.account = data.account;
        // Authenticate via socket too
        setTimeout(() => {
          if (Network.socket) Network.socket.emit('authenticate', { token });
        }, 500);
      } else {
        localStorage.removeItem('zz_token');
        UI.showAuth();
      }
    } catch(e) {
      UI.showAuth();
    }
  } else {
    UI.showAuth();
  }

  // Mouse button events for shooting
  const gameCanvas = document.getElementById('game-canvas');
  gameCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) PlayerController.startAutoFire();
  });
  gameCanvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) PlayerController.stopAutoFire();
  });

  // Slider labels
  document.getElementById('set-fov')?.addEventListener('input', (e) => {
    document.getElementById('fov-val').textContent = e.target.value;
  });
  document.getElementById('set-sens')?.addEventListener('input', (e) => {
    document.getElementById('sens-val').textContent = e.target.value;
  });
  document.getElementById('set-volume')?.addEventListener('input', (e) => {
    Audio.setMasterVolume(parseInt(e.target.value));
    e.target.nextElementSibling.textContent = e.target.value + '%';
  });

  // Prevent right-click context menu in game
  document.addEventListener('contextmenu', (e) => {
    if (document.getElementById('game-screen').classList.contains('active')) e.preventDefault();
  });

  // Prevent scroll in game
  document.addEventListener('wheel', (e) => {
    if (document.getElementById('game-screen').classList.contains('active')) {
      e.preventDefault();
      // Weapon scroll
      const weapons = ['assault_rifle', 'shotgun', 'sniper', 'smg', 'pistol', 'rocket_launcher'];
      const current = weapons.indexOf(PlayerController.localPlayer.weapon);
      const next = (current + (e.deltaY > 0 ? 1 : -1) + weapons.length) % weapons.length;
      PlayerController.selectWeapon(weapons[next]);
    }
  }, { passive: false });

  console.log('⚡ ZapZone ready!');
});
