// ════════════════════════════════════════════════════════════════
// Game Systems — Global State, Battle Pass, Quest Progression
// ════════════════════════════════════════════════════════════════

const GameState = {
  account: null,
  party: null,
  battlepassTiers: [],
  shopItems: [],
  settings: {
    quality: 'medium',
    fov: 90,
    sensitivity: 8,
    invertY: false,
    shadows: true,
    masterVolume: 80,
    voiceEnabled: true,
    pushToTalk: false
  }
};

// ─── Audio System ─────────────────────────────────────────────────────────────
const Audio = (() => {
  const ctx = typeof AudioContext !== 'undefined' ? new AudioContext() : null;
  const sounds = {};
  let masterGain;

  function init() {
    if (!ctx) return;
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(ctx.destination);
    preGenSounds();
  }

  function preGenSounds() {
    if (!ctx) return;
    // Generate procedural sound buffers
    sounds.shoot = genShoot();
    sounds.hit = genHit();
    sounds.death = genDeath();
    sounds.pickup = genPickup();
    sounds.reload = genClick();
  }

  function genShoot() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }
    return buf;
  }

  function genHit() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02)) * 0.5;
    }
    return buf;
  }

  function genDeath() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const freq = 200 * Math.exp(-i / (ctx.sampleRate * 0.3));
      data[i] = Math.sin(2 * Math.PI * freq * i / ctx.sampleRate) * Math.exp(-i / (ctx.sampleRate * 0.2));
    }
    return buf;
  }

  function genPickup() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const freq = 600 + 400 * (i / data.length);
      data[i] = Math.sin(2 * Math.PI * freq * i / ctx.sampleRate) * Math.exp(-i / (ctx.sampleRate * 0.1)) * 0.3;
    }
    return buf;
  }

  function genClick() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.01)) * 0.4;
    }
    return buf;
  }

  function play(name, volume = 1, pitch = 1) {
    if (!ctx || !sounds[name]) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = sounds[name];
    src.playbackRate.value = pitch;
    const gain = ctx.createGain();
    gain.gain.value = volume * (GameState.settings.masterVolume / 100);
    src.connect(gain);
    gain.connect(masterGain);
    src.start();
  }

  function setMasterVolume(v) {
    GameState.settings.masterVolume = v;
    if (masterGain) masterGain.gain.value = v / 100;
  }

  return { init, play, setMasterVolume };
})();

// ─── Minimap System ───────────────────────────────────────────────────────────
const Minimap = (() => {
  let canvas, ctx;
  const MAP_SIZE = 120;
  const MINIMAP_SIZE = 160;

  function init() {
    canvas = document.getElementById('minimap-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'minimap-canvas';
      canvas.width = MINIMAP_SIZE;
      canvas.height = MINIMAP_SIZE;
      canvas.style.cssText = 'position:fixed;bottom:130px;right:20px;width:160px;height:160px;border:2px solid rgba(255,255,255,0.3);border-radius:50%;background:rgba(0,0,0,0.5);z-index:100;display:none';
      document.getElementById('hud')?.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
  }

  function showInGame(show) {
    if (canvas) canvas.style.display = show ? 'block' : 'none';
  }

  function render(localPos, remotePlayers) {
    if (!ctx || !canvas || canvas.style.display === 'none') return;
    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Background
    ctx.fillStyle = 'rgba(10, 20, 30, 0.8)';
    ctx.beginPath();
    ctx.arc(MINIMAP_SIZE/2, MINIMAP_SIZE/2, MINIMAP_SIZE/2, 0, Math.PI*2);
    ctx.fill();

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      const x = (i / 4) * MINIMAP_SIZE;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MINIMAP_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(MINIMAP_SIZE, x); ctx.stroke();
    }

    function worldToMap(wx, wz) {
      return {
        x: ((wx + MAP_SIZE) / (MAP_SIZE * 2)) * MINIMAP_SIZE,
        y: ((wz + MAP_SIZE) / (MAP_SIZE * 2)) * MINIMAP_SIZE
      };
    }

    // Remote players
    Object.values(remotePlayers).forEach(rp => {
      if (!rp.object || !rp.isAlive) return;
      const p = worldToMap(rp.object.position.x, rp.object.position.z);
      ctx.fillStyle = rp.team === 'red' ? '#FF4444' : rp.team === 'blue' ? '#4444FF' : '#FF8800';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
      ctx.fill();
    });

    // Local player (white dot with direction)
    const lp = worldToMap(localPos.x, localPos.z);
    ctx.fillStyle = '#00FF88';
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 4, 0, Math.PI*2);
    ctx.fill();

    // Minimap border
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(MINIMAP_SIZE/2, MINIMAP_SIZE/2, MINIMAP_SIZE/2 - 1, 0, Math.PI*2);
    ctx.stroke();
  }

  return { init, showInGame, render };
})();

// ─── Announcement Ticker ──────────────────────────────────────────────────────
const Ticker = (() => {
  let items = ['Welcome to ZapZone!', 'Season 1 Battle Pass is LIVE!', 'New map: Neon City now available!'];
  let idx = 0;

  function init() {
    const el = document.createElement('div');
    el.id = 'news-ticker';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(0,0,255,0.7);color:#fff;text-align:center;padding:3px;font-size:12px;z-index:10000;pointer-events:none;';
    document.body.appendChild(el);
    update(el);
    setInterval(() => update(el), 5000);
  }

  function update(el) {
    el.textContent = '⚡ ' + items[idx % items.length];
    idx++;
  }

  function addItem(msg) { items.push(msg); }

  return { init, addItem };
})();
