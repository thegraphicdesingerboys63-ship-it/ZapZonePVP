const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const path        = require('path');
const { Pool }    = require('pg');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 10000, pingInterval: 3000
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const JWT_SECRET = process.env.JWT_SECRET || 'zapzone_super_secret_key_2024_xk9';

// ─── Neon / PostgreSQL ────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function query(text, params) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

// ─── Create Tables ────────────────────────────────────────────────────────────
async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id           TEXT PRIMARY KEY,
      username     TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role         TEXT DEFAULT 'player',
      is_supreme   BOOLEAN DEFAULT false,
      coins        INTEGER DEFAULT 500,
      volts        INTEGER DEFAULT 0,
      battlepass   JSONB DEFAULT '{"level":1,"xp":0,"season":1}',
      skins        JSONB DEFAULT '["default"]',
      active_skin  TEXT DEFAULT 'default',
      stats        JSONB DEFAULT '{"kills":0,"deaths":0,"wins":0,"losses":0,"playtime":0,"matches":0,"damage":0,"headshots":0}',
      quests       JSONB DEFAULT '{"daily":[],"weekly":[],"completed":[]}',
      quest_reset  JSONB DEFAULT '{"daily":0,"weekly":0}',
      is_banned    BOOLEAN DEFAULT false,
      ban_reason   TEXT,
      banned_by    TEXT,
      created_at   BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())*1000,
      last_login   BIGINT
    )
  `);
  // Migrate existing DB: drop wasteful columns, add missing ones (all safe if already done)
  for (const col of ['inventory','dmg_mult','max_hp','tier']) {
    await query(`ALTER TABLE accounts DROP COLUMN IF EXISTS ${col}`).catch(()=>{});
  }
  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS banned_by TEXT`).catch(()=>{});
  // bans table removed — ban info lives directly on accounts (is_banned, ban_reason, banned_by)
  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id        TEXT PRIMARY KEY,
      message   TEXT,
      type      TEXT DEFAULT 'info',
      author    TEXT,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())*1000
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS global_stats (
      key           TEXT PRIMARY KEY,
      total_players INTEGER DEFAULT 0,
      total_matches INTEGER DEFAULT 0,
      total_kills   INTEGER DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      requester TEXT NOT NULL,
      recipient TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())*1000
    )
  `);
  await query(`INSERT INTO global_stats(key) VALUES('global') ON CONFLICT DO NOTHING`);
  console.log('[DB] Tables ready');
  await seedSpecialAccounts();
}

// ─── Seed Special Accounts ────────────────────────────────────────────────────
async function seedSpecialAccounts() {
  const specials = [
    { id: 'owner_zapzone',   username: 'ZapZoneYT', password: 'ZapZone@Admin2024!',   role: 'owner', is_supreme: false },
    { id: 'supreme_amgprodz', username: 'AMGProdZ',  password: 'AMGProdZ@Supreme2024!', role: 'owner', is_supreme: true  }
  ];
  for (const s of specials) {
    const exists = await query('SELECT id FROM accounts WHERE username=$1', [s.username]);
    if (exists.rows.length === 0) {
      const hash = await bcrypt.hash(s.password, 10);
      await query(
        `INSERT INTO accounts(id,username,password_hash,role,is_supreme)
         VALUES($1,$2,$3,$4,$5)`,
        [s.id, s.username, hash, s.role, s.is_supreme]
      );
    }
  }
  console.log('[DB] Special accounts seeded');
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────
async function getAccount(username) {
  const r = await query('SELECT * FROM accounts WHERE username=$1', [username]);
  return r.rows[0] || null;
}

async function saveAccount(acc) {
  await query(
    `UPDATE accounts SET role=$1, coins=$2, volts=$3, battlepass=$4, skins=$5, active_skin=$6,
     stats=$7, quests=$8, quest_reset=$9, is_banned=$10, ban_reason=$11, banned_by=$12, last_login=$13
     WHERE username=$14`,
    [
      acc.role, acc.coins, acc.volts,
      JSON.stringify(acc.battlepass),
      JSON.stringify(acc.skins),
      acc.active_skin,
      JSON.stringify(acc.stats),
      JSON.stringify(slimQuests(acc.quests)), // only store id+progress+completed
      JSON.stringify(acc.quest_reset),
      acc.is_banned, acc.ban_reason, acc.banned_by||null, acc.last_login,
      acc.username
    ]
  );
}

// Quest storage helpers — only persist id+progress+completed, reconstruct full objects from pool at runtime
function slimQuests(quests) {
  const slim = q => ({ id:q.id, p:q.progress||0, c:!!q.completed });
  return {
    daily:     (quests.daily||[]).map(slim),
    weekly:    (quests.weekly||[]).map(slim),
    completed: quests.completed||[]
  };
}
function hydrateQuests(acc) {
  if (!acc?.quests) return acc;
  const expand = (slim, pool) => slim.map(s => {
    const def = pool.find(d => d.id === s.id);
    return def ? { ...def, progress:s.p||0, completed:!!s.c } : null;
  }).filter(Boolean);
  acc.quests.daily  = expand(acc.quests.daily||[], DAILY_QUEST_POOL);
  acc.quests.weekly = expand(acc.quests.weekly||[], WEEKLY_QUEST_POOL);
  return acc;
}

async function createAccount(username, passwordHash) {
  const id = uuidv4();
  const quests = JSON.stringify(slimQuests({ daily: generateDailyQuests(), weekly: generateWeeklyQuests(), completed: [] }));
  const reset  = JSON.stringify({ daily: getDailyReset(), weekly: getWeeklyReset() });
  await query(
    `INSERT INTO accounts(id,username,password_hash,quests,quest_reset) VALUES($1,$2,$3,$4,$5)`,
    [id, username, passwordHash, quests, reset]
  );
  await query(`UPDATE global_stats SET total_players=total_players+1 WHERE key='global'`);
  return getAccount(username);
}

function sanitizeAccount(acc) {
  const s = { ...acc };
  delete s.password_hash;
  return s; // is_supreme kept so the client knows its own privilege level
}
function adminSanitize(acc) {
  const s = { ...acc }; delete s.password_hash;
  return s;
}
function generateToken(acc) {
  return jwt.sign({ id: acc.id, username: acc.username, role: acc.role }, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}
async function isOwner(username) { const a = await getAccount(username); return a && a.role === 'owner'; }
async function isAdmin(username)  { const a = await getAccount(username); return a && (a.role === 'admin' || a.role === 'owner'); }
async function isSupreme(username){ const a = await getAccount(username); return a && a.is_supreme === true; }
async function isMod(username)    { const a = await getAccount(username); return a && (a.role === 'mod' || a.role === 'admin' || a.role === 'owner'); }

const shadowBanned = new Set(); // in-memory shadow-ban list (silent — player sees own messages, nobody else does)

// ─── Quest / Time Helpers ─────────────────────────────────────────────────────
const BATTLEPASS_SEASON = 1;
const BATTLEPASS_TIERS  = [];
for (let i = 1; i <= 100; i++) {
  BATTLEPASS_TIERS.push({
    tier: i, xpRequired: i * 500,
    free: [
      { tier:1,  type:'coins', amount:100,  name:'100 Coins' },
      { tier:5,  type:'skin',  id:'combat_grey',    name:'Combat Grey',    rarity:'common' },
      { tier:10, type:'coins', amount:200,  name:'200 Coins' },
      { tier:15, type:'skin',  id:'forest_warrior', name:'Forest Warrior', rarity:'uncommon' },
      { tier:20, type:'spray', id:'spray_zap',      name:'ZAP Spray' },
      { tier:25, type:'coins', amount:300,  name:'300 Coins' },
      { tier:30, type:'skin',  id:'shadow_reaper',  name:'Shadow Reaper',  rarity:'rare' },
      { tier:35, type:'emote', id:'emote_salute',   name:'Salute' },
      { tier:40, type:'coins', amount:500,  name:'500 Coins' },
      { tier:50, type:'skin',  id:'storm_breaker',  name:'Storm Breaker',  rarity:'epic' },
      { tier:60, type:'coins', amount:500,  name:'500 Coins' },
      { tier:70, type:'emote', id:'emote_victory',  name:'Victory Dance' },
      { tier:80, type:'coins', amount:750,  name:'750 Coins' },
      { tier:100,type:'skin',  id:'legend_zapper',  name:'Legend Zapper',  rarity:'legendary' }
    ].find(r => r.tier === i) || null,
    premium: [
      { tier:1,  type:'skin',        id:'neon_striker',     name:'Neon Striker',     rarity:'rare' },
      { tier:2,  type:'coins',       amount:200,            name:'200 Coins' },
      { tier:5,  type:'skin',        id:'viper_elite',      name:'Viper Elite',      rarity:'epic' },
      { tier:10, type:'skin',        id:'arctic_ghost',     name:'Arctic Ghost',     rarity:'epic' },
      { tier:20, type:'skin',        id:'cyber_samurai',    name:'Cyber Samurai',    rarity:'legendary' },
      { tier:35, type:'skin',        id:'golden_knight',    name:'Golden Knight',    rarity:'legendary' },
      { tier:50, type:'skin',        id:'void_walker',      name:'Void Walker',      rarity:'legendary' },
      { tier:75, type:'skin',        id:'diamond_operative',name:'Diamond Operative',rarity:'legendary' },
      { tier:100,type:'skin',        id:'omega_prime',      name:'OMEGA PRIME',      rarity:'mythic' }
    ].find(r => r.tier === i) || { tier: i, type: 'coins', amount: 50, name: '50 Coins' }
  });
}

const DAILY_QUEST_POOL = [
  { id:'dq1',  name:'Trigger Happy',  desc:'Get 5 kills',                          type:'kills',     target:5,   xp:500, coins:50 },
  { id:'dq2',  name:'Headhunter',     desc:'Get 3 headshots',                      type:'headshots', target:3,   xp:600, coins:75 },
  { id:'dq3',  name:'Survivor',       desc:'Survive 5 minutes in a match',         type:'survive',   target:300, xp:400, coins:40 },
  { id:'dq4',  name:'Match Winner',   desc:'Win 1 match',                          type:'wins',      target:1,   xp:800, coins:100 },
  { id:'dq5',  name:'Rifleman',       desc:'Get 5 AR kills',                       type:'ar_kills',  target:5,   xp:500, coins:60 },
  { id:'dq6',  name:'Shotgun King',   desc:'Get 3 shotgun kills',                  type:'shotgun_kills',target:3,xp:550, coins:65 },
  { id:'dq7',  name:'Sniper Elite',   desc:'Get 2 sniper kills',                   type:'sniper_kills',target:2, xp:650, coins:80 },
  { id:'dq8',  name:'Match Veteran',  desc:'Play 3 matches',                       type:'matches',   target:3,   xp:300, coins:30 },
  { id:'dq9',  name:'Damage Dealer',  desc:'Deal 500 damage',                      type:'damage',    target:500, xp:450, coins:55 },
  { id:'dq10', name:'No Mercy',       desc:'3-kill spree without dying',           type:'spree',     target:3,   xp:750, coins:90 }
];
const WEEKLY_QUEST_POOL = [
  { id:'wq1', name:'War Machine',    desc:'Get 50 kills this week',        type:'kills',     target:50,   xp:5000, coins:500 },
  { id:'wq2', name:'Champion',       desc:'Win 5 matches this week',       type:'wins',      target:5,    xp:6000, coins:700 },
  { id:'wq3', name:'Battle Hardened',desc:'Play 20 matches this week',     type:'matches',   target:20,   xp:4000, coins:400 },
  { id:'wq4', name:'Deadeye',        desc:'Get 20 headshots this week',    type:'headshots', target:20,   xp:5500, coins:600 },
  { id:'wq5', name:'Sharpshooter',   desc:'Deal 5000 damage this week',    type:'damage',    target:5000, xp:4500, coins:450 }
];

const SKIN_SHOP = [
  { id:'neon_blue',     name:'Neon Blue',     price:800,  rarity:'rare',      color:'#00BFFF', type:'skin' },
  { id:'flame_lord',    name:'Flame Lord',    price:1200, rarity:'epic',      color:'#FF4500', type:'skin' },
  { id:'toxic_green',   name:'Toxic Avenger', price:800,  rarity:'rare',      color:'#39FF14', type:'skin' },
  { id:'purple_phantom',name:'Purple Phantom',price:1000, rarity:'epic',      color:'#8A2BE2', type:'skin' },
  { id:'ghost_white',   name:'Ghost',         price:800,  rarity:'rare',      color:'#F0F0F0', type:'skin' },
  { id:'midnight_black',name:'Midnight',      price:800,  rarity:'rare',      color:'#1a1a2e', type:'skin' },
  { id:'golden_god',    name:'Golden God',    price:2000, rarity:'legendary', color:'#FFD700', type:'skin' },
  { id:'crimson_demon', name:'Crimson Demon', price:1500, rarity:'epic',      color:'#DC143C', type:'skin' },
  { id:'ocean_king',    name:'Ocean King',    price:1200, rarity:'epic',      color:'#006994', type:'skin' },
  { id:'diamond_skin',  name:'Diamond',       price:2500, rarity:'legendary', color:'#B9F2FF', type:'skin' },
  { id:'rose_gold',     name:'Rose Gold',     price:1500, rarity:'epic',      color:'#B76E79', type:'skin' },
  { id:'galaxy_skin',   name:'Galaxy',        price:3000, rarity:'mythic',    color:'#2D1B69', type:'skin' }
];

const WEAPONS = {
  assault_rifle:   { name:'Zap-AR',    damage:25,  headMult:2.0, fireRate:600, magSize:30, reloadTime:2.0, range:100, spread:0.03,  auto:true,  color:0x444444 },
  shotgun:         { name:'BlastShot', damage:80,  headMult:1.5, fireRate:80,  magSize:8,  reloadTime:2.5, range:30,  spread:0.15,  auto:false, color:0x8B4513 },
  sniper:          { name:'LongReach', damage:120, headMult:3.0, fireRate:40,  magSize:5,  reloadTime:3.0, range:500, spread:0.005, auto:false, color:0x2F4F4F },
  smg:             { name:'BuzzSaw',   damage:15,  headMult:1.8, fireRate:900, magSize:40, reloadTime:1.8, range:50,  spread:0.06,  auto:true,  color:0x333333 },
  pistol:          { name:'QuickDraw', damage:35,  headMult:2.2, fireRate:350, magSize:12, reloadTime:1.2, range:60,  spread:0.02,  auto:false, color:0x555555 },
  rocket_launcher: { name:'BoomStick', damage:200, headMult:1.0, fireRate:30,  magSize:1,  reloadTime:3.5, range:200, spread:0.01,  auto:false, splash:5, color:0x8B0000 }
};

function generateDailyQuests() {
  return [...DAILY_QUEST_POOL].sort(()=>Math.random()-0.5).slice(0,3).map(q=>({...q,progress:0,completed:false}));
}
function generateWeeklyQuests() {
  return [...WEEKLY_QUEST_POOL].sort(()=>Math.random()-0.5).slice(0,2).map(q=>({...q,progress:0,completed:false}));
}
function getDailyReset()  { const r=new Date(); r.setUTCHours(24,0,0,0); return r.getTime(); }
function getWeeklyReset() {
  const now=new Date(), d=now.getUTCDay(), days=(7-d+1)%7||7;
  const r=new Date(now); r.setUTCDate(now.getUTCDate()+days); r.setUTCHours(0,0,0,0); return r.getTime();
}

// ─── In-memory live state ─────────────────────────────────────────────────────
const rooms   = {};
const parties = {};

async function createRoom(mapId, mode, maxPlayers) {
  const roomId = uuidv4().slice(0,8).toUpperCase();
  rooms[roomId] = {
    id:roomId, mapId:mapId||'zapzone_arena', mode:mode||'deathmatch',
    status:'waiting', maxPlayers:maxPlayers||16,
    players:{}, scores:{}, chat:[], teamScores:{red:0,blue:0}, startTime:null
  };
  await query(`UPDATE global_stats SET total_matches=total_matches+1 WHERE key='global'`);
  return rooms[roomId];
}
async function findOrCreateRoom(mode) {
  for (const r of Object.values(rooms)) {
    if (r.status==='waiting' && r.mode===mode && Object.keys(r.players).length < r.maxPlayers) return r;
  }
  return createRoom(null, mode, 16);
}
function getSpawnPoint() {
  return { x:(Math.random()-0.5)*180, y:2, z:(Math.random()-0.5)*180 };
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username||!password) return res.status(400).json({ error:'Missing fields' });
    if (username.length<3||username.length>20) return res.status(400).json({ error:'Username must be 3-20 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error:'Letters, numbers, underscores only' });
    if (password.length<6) return res.status(400).json({ error:'Password must be at least 6 characters' });
    if (await getAccount(username)) return res.status(409).json({ error:'Username already taken' });
    const hash = await bcrypt.hash(password, 10);
    const acc  = await createAccount(username, hash);
    res.json({ success:true, token:generateToken(acc), account:sanitizeAccount(acc) });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username||!password) return res.status(400).json({ error:'Missing fields' });
    const acc = await getAccount(username);
    if (!acc) return res.status(401).json({ error:'Invalid credentials' });
    if (acc.is_banned) return res.status(403).json({ error:`Account banned: ${acc.ban_reason||'Violation of ToS'}` });
    if (!await bcrypt.compare(password, acc.password_hash)) return res.status(401).json({ error:'Invalid credentials' });
    acc.last_login = Date.now();
    await saveAccount(acc);
    res.json({ success:true, token:generateToken(acc), account:sanitizeAccount(acc) });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Invalid token' });
    const acc = await getAccount(decoded.username);
    if (!acc) return res.status(404).json({ error:'Account not found' });
    res.json({ account:sanitizeAccount(acc) });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Unauthorized' });
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error:'Missing fields' });
    if (newPassword.length < 6) return res.status(400).json({ error:'New password must be at least 6 characters' });
    const acc = await getAccount(decoded.username);
    if (!acc) return res.status(404).json({ error:'Account not found' });
    if (!await bcrypt.compare(currentPassword, acc.password_hash)) return res.status(401).json({ error:'Current password is incorrect' });
    const newHash = await bcrypt.hash(newPassword, 10);
    await query(`UPDATE accounts SET password_hash=$1 WHERE username=$2`, [newHash, acc.username]);
    res.json({ success:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

// ─── Friends Routes ───────────────────────────────────────────────────────────
app.post('/api/friends/request', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Unauthorized' });
    const { targetUsername } = req.body;
    if (!targetUsername) return res.status(400).json({ error:'Missing targetUsername' });
    if (targetUsername === decoded.username) return res.status(400).json({ error:'Cannot friend yourself' });
    const target = await getAccount(targetUsername);
    if (!target) return res.status(404).json({ error:'User not found' });
    // Check if already friends or request exists
    const existing = await query(
      `SELECT id FROM friendships WHERE (requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)`,
      [decoded.username, targetUsername]
    );
    if (existing.rows.length > 0) return res.status(409).json({ error:'Request already exists or already friends' });
    const id = uuidv4();
    await query(`INSERT INTO friendships(id,requester,recipient) VALUES($1,$2,$3)`, [id, decoded.username, targetUsername]);
    // Emit to target if online
    for (const [,sock] of io.sockets.sockets) {
      if (sock.username === targetUsername) {
        sock.emit('friend_request', { id, from: decoded.username });
        break;
      }
    }
    res.json({ success:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

app.post('/api/friends/accept', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Unauthorized' });
    const { requestId } = req.body;
    const r = await query(`SELECT * FROM friendships WHERE id=$1 AND recipient=$2 AND status='pending'`, [requestId, decoded.username]);
    if (!r.rows.length) return res.status(404).json({ error:'Request not found' });
    await query(`UPDATE friendships SET status='accepted' WHERE id=$1`, [requestId]);
    res.json({ success:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

app.post('/api/friends/decline', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Unauthorized' });
    const { requestId } = req.body;
    await query(`DELETE FROM friendships WHERE id=$1 AND recipient=$2`, [requestId, decoded.username]);
    res.json({ success:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

app.delete('/api/friends/:username', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Unauthorized' });
    const other = req.params.username;
    await query(
      `DELETE FROM friendships WHERE ((requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)) AND status='accepted'`,
      [decoded.username, other]
    );
    res.json({ success:true });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

app.get('/api/friends', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Unauthorized' });
    const me = decoded.username;
    const accepted = await query(
      `SELECT * FROM friendships WHERE (requester=$1 OR recipient=$1) AND status='accepted'`,
      [me]
    );
    const pending = await query(
      `SELECT * FROM friendships WHERE recipient=$1 AND status='pending'`,
      [me]
    );
    // Build set of online usernames
    const onlineSet = new Set();
    for (const [,sock] of io.sockets.sockets) { if (sock.username) onlineSet.add(sock.username); }
    const friends = accepted.rows.map(f => {
      const friendName = f.requester === me ? f.recipient : f.requester;
      return { username: friendName, online: onlineSet.has(friendName), friendshipId: f.id };
    });
    const pendingList = pending.rows.map(f => ({ id: f.id, from: f.requester }));
    res.json({ friends, pending: pendingList });
  } catch(e) { console.error(e); res.status(500).json({ error:'Server error' }); }
});

// ─── Game Routes ──────────────────────────────────────────────────────────────
app.get('/api/shop',       (req, res) => res.json({ items:SKIN_SHOP, featured:SKIN_SHOP.slice(0,4) }));
app.get('/api/battlepass', (req, res) => res.json({ tiers:BATTLEPASS_TIERS, season:BATTLEPASS_SEASON }));
app.get('/api/weapons',    (req, res) => res.json(WEAPONS));

app.get('/api/leaderboard', async (req, res) => {
  try {
    const r = await query(`SELECT username, stats FROM accounts ORDER BY (stats->>'kills')::int DESC LIMIT 50`);
    res.json(r.rows.map((a,i) => ({
      rank:i+1, username:a.username,
      kills:a.stats.kills, deaths:a.stats.deaths, wins:a.stats.wins,
      kdr: a.stats.deaths>0 ? (a.stats.kills/a.stats.deaths).toFixed(2) : a.stats.kills
    })));
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/shop/buy', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Unauthorized' });
    const acc  = await getAccount(decoded.username);
    const item = SKIN_SHOP.find(s => s.id === req.body.itemId);
    if (!item) return res.status(404).json({ error:'Item not found' });
    const skinsAll = acc.skins === '*' || acc.skins === '"*"' || (typeof acc.skins === 'string' && acc.skins.includes('*'));
    const owned = skinsAll || (Array.isArray(acc.skins) && acc.skins.includes(item.id));
    if (owned) return res.status(400).json({ error:'Already owned' });
    if (acc.volts < item.price) return res.status(400).json({ error:'Not enough Volts' });
    acc.volts -= item.price;
    if (!Array.isArray(acc.skins)) acc.skins = [];
    acc.skins.push(item.id);
    await saveAccount(acc);
    res.json({ success:true, account:sanitizeAccount(acc) });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/equip-skin', async (req, res) => {
  try {
    const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
    if (!decoded) return res.status(401).json({ error:'Unauthorized' });
    const acc = await getAccount(decoded.username);
    const { skinId } = req.body;
    const hasAll = acc.skins === '*' || acc.skins === '"*"' || (typeof acc.skins === 'string' && acc.skins.includes('*'));
    if (!hasAll && !acc.skins.includes(skinId)) return res.status(403).json({ error:'Skin not owned' });
    acc.active_skin = skinId;
    await saveAccount(acc);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

// ─── Admin Middleware ─────────────────────────────────────────────────────────
async function adminAuth(req, res, next) {
  const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
  if (!decoded||!await isAdmin(decoded.username)) return res.status(403).json({ error:'Admin access required' });
  req.admin = decoded; next();
}
async function ownerAuth(req, res, next) {
  const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
  if (!decoded||!await isOwner(decoded.username)) return res.status(403).json({ error:'Owner access required' });
  req.admin = decoded; next();
}
async function modAuth(req, res, next) {
  const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
  if (!decoded||!await isMod(decoded.username)) return res.status(403).json({ error:'Moderator access required' });
  req.admin = decoded; next();
}
async function supremeAuth(req, res, next) {
  const decoded = verifyToken(req.headers.authorization?.split(' ')[1]);
  if (!decoded||!await isSupreme(decoded.username)) return res.status(403).json({ error:'Unauthorized' });
  req.admin = decoded; next();
}

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const gs   = (await query(`SELECT * FROM global_stats WHERE key='global'`)).rows[0];
    const total= (await query(`SELECT COUNT(*) FROM accounts`)).rows[0].count;
    const anns = (await query(`SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10`)).rows;
    res.json({
      totalAccounts:parseInt(total), onlinePlayers:io.sockets.sockets.size,
      activeRooms: Object.values(rooms).filter(r=>r.status==='playing').length,
      waitingRooms:Object.values(rooms).filter(r=>r.status==='waiting').length,
      totalMatches:gs?.total_matches||0, totalKills:gs?.total_kills||0, announcements:anns
    });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.get('/api/admin/players', adminAuth, async (req, res) => {
  try {
    const { search='', role='', page=1, limit=50 } = req.query;
    let where='WHERE 1=1', params=[];
    if (search) { params.push(`%${search}%`); where+=` AND username ILIKE $${params.length}`; }
    if (role)   { params.push(role);           where+=` AND role=$${params.length}`; }
    const total   = (await query(`SELECT COUNT(*) FROM accounts ${where}`, params)).rows[0].count;
    params.push(parseInt(limit), (page-1)*parseInt(limit));
    const rawPlayers = (await query(`SELECT * FROM accounts ${where} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params)).rows;
    const requesterIsSupreme = await isSupreme(req.admin.username);
    const players = requesterIsSupreme ? rawPlayers : rawPlayers.filter(p => !p.is_supreme);
    res.json({ players:players.map(adminSanitize), total:parseInt(total), page:parseInt(page), pages:Math.ceil(total/limit) });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.get('/api/admin/player/:username', adminAuth, async (req, res) => {
  try {
    const acc = await getAccount(req.params.username);
    if (!acc) return res.status(404).json({ error:'Player not found' });
    res.json(adminSanitize(acc));
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/ban', ownerAuth, async (req, res) => {
  try {
    const { username, reason } = req.body;
    const acc = await getAccount(username);
    if (!acc) return res.status(404).json({ error:'Player not found' });
    if (await isSupreme(username)) return res.status(403).json({ error:'Cannot ban this account' });
    // Owners can't ban other owners unless supreme
    if (acc.role === 'owner' && !await isSupreme(req.admin.username)) return res.status(403).json({ error:'Insufficient permissions' });
    acc.is_banned = true; acc.ban_reason = reason||'Violation of Terms of Service'; acc.banned_by = req.admin.username;
    await saveAccount(acc);
    for (const [,sock] of io.sockets.sockets) {
      if (sock.username===username) { sock.emit('banned',{reason:acc.ban_reason}); sock.disconnect(); }
    }
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/unban', ownerAuth, async (req, res) => {
  try {
    const acc = await getAccount(req.body.username);
    if (!acc) return res.status(404).json({ error:'Player not found' });
    acc.is_banned=false; acc.ban_reason=null; acc.banned_by=null;
    await saveAccount(acc);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/set-role', ownerAuth, async (req, res) => {
  try {
    const { username, role } = req.body;
    if (!['player','mod','admin','owner'].includes(role)) return res.status(400).json({ error:'Invalid role' });
    if (await isSupreme(username)) return res.status(403).json({ error:'Cannot modify this account' });
    await query(`UPDATE accounts SET role=$1 WHERE username=$2`, [role, username]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/give-volts', ownerAuth, async (req, res) => {
  try {
    const { username, amount } = req.body;
    const r = await query(`UPDATE accounts SET volts=volts+$1 WHERE username=$2 RETURNING volts`, [parseInt(amount)||0, username]);
    if (!r.rows.length) return res.status(404).json({ error:'Player not found' });
    res.json({ success:true, newBalance:r.rows[0].volts });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/give-coins', ownerAuth, async (req, res) => {
  try {
    const { username, amount } = req.body;
    const r = await query(`UPDATE accounts SET coins=coins+$1 WHERE username=$2 RETURNING coins`, [parseInt(amount)||0, username]);
    if (!r.rows.length) return res.status(404).json({ error:'Player not found' });
    res.json({ success:true, newBalance:r.rows[0].coins });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/reset-stats', ownerAuth, async (req, res) => {
  try {
    await query(`UPDATE accounts SET stats='{"kills":0,"deaths":0,"wins":0,"losses":0,"playtime":0,"matches":0,"damage":0,"headshots":0}' WHERE username=$1`, [req.body.username]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.post('/api/admin/announce', adminAuth, async (req, res) => {
  try {
    const { message, type } = req.body;
    const id  = uuidv4();
    const ann = (await query(`INSERT INTO announcements(id,message,type,author) VALUES($1,$2,$3,$4) RETURNING *`,
      [id, message, type||'info', req.admin.username])).rows[0];
    // Keep only 20 most recent
    await query(`DELETE FROM announcements WHERE id NOT IN (SELECT id FROM announcements ORDER BY created_at DESC LIMIT 20)`);
    io.emit('announcement', ann);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.get('/api/admin/rooms', adminAuth, (req, res) => {
  res.json(Object.values(rooms).map(r => ({
    id:r.id, mapId:r.mapId, mode:r.mode, status:r.status,
    playerCount:Object.keys(r.players).length, maxPlayers:r.maxPlayers, startTime:r.startTime
  })));
});

app.post('/api/admin/kick-player', adminAuth, (req, res) => {
  const { username, reason } = req.body;
  for (const [,sock] of io.sockets.sockets) {
    if (sock.username===username) {
      sock.emit('kicked',{reason:reason||'Kicked by admin'}); sock.disconnect();
      return res.json({ success:true });
    }
  }
  res.status(404).json({ error:'Player not online' });
});

app.delete('/api/admin/room/:roomId', ownerAuth, (req, res) => {
  if (!rooms[req.params.roomId]) return res.status(404).json({ error:'Room not found' });
  io.to(req.params.roomId).emit('room_closed',{reason:'Closed by admin'});
  delete rooms[req.params.roomId];
  res.json({ success:true });
});

app.get('/api/admin/bans', adminAuth, async (req, res) => {
  try { res.json((await query(`SELECT username,ban_reason AS reason,banned_by,last_login AS banned_at FROM accounts WHERE is_banned=true ORDER BY last_login DESC`)).rows); }
  catch(e) { res.status(500).json({ error:'Server error' }); }
});

app.get('/api/admin/server-info', adminAuth, async (req, res) => {
  try {
    const gs = (await query(`SELECT * FROM global_stats WHERE key='global'`)).rows[0];
    res.json({ uptime:process.uptime(), memory:process.memoryUsage(), nodeVersion:process.version, platform:process.platform,
      totalPlayers:gs?.total_players||0, totalMatches:gs?.total_matches||0, totalKills:gs?.total_kills||0 });
  } catch(e) { res.status(500).json({ error:'Server error' }); }
});

// ─── Supreme-Only Routes ──────────────────────────────────────────────────────
// These endpoints are intentionally unlabeled in error responses to avoid enumeration.

app.get('/api/supreme/shadowbanned', supremeAuth, (req, res) => {
  res.json({ list: [...shadowBanned] });
});

app.post('/api/supreme/shadowban', supremeAuth, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const toggled = !shadowBanned.has(username);
  toggled ? shadowBanned.add(username) : shadowBanned.delete(username);
  res.json({ shadowbanned: toggled, username });
});

app.post('/api/supreme/impersonate', supremeAuth, async (req, res) => {
  try {
    const acc = await getAccount(req.body.username);
    if (!acc) return res.status(404).json({ error: 'Player not found' });
    if (acc.is_supreme) return res.status(403).json({ error: 'Unauthorized' });
    res.json({ token: generateToken(acc) });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/supreme/wipe', supremeAuth, async (req, res) => {
  try {
    const acc = await getAccount(req.body.username);
    if (!acc) return res.status(404).json({ error: 'Player not found' });
    if (acc.is_supreme) return res.status(403).json({ error: 'Unauthorized' });
    acc.coins=500; acc.volts=0;
    acc.battlepass={level:1,xp:0,season:1};
    acc.skins=['default']; acc.active_skin='default';
    acc.stats={kills:0,deaths:0,wins:0,losses:0,playtime:0,matches:0,damage:0,headshots:0};
    await saveAccount(acc);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/supreme/drain', supremeAuth, async (req, res) => {
  try {
    const { username, coins=0, volts=0 } = req.body;
    const acc = await getAccount(username);
    if (!acc) return res.status(404).json({ error: 'Player not found' });
    if (acc.is_supreme) return res.status(403).json({ error: 'Unauthorized' });
    if (parseInt(coins)>0) acc.coins = Math.max(0, acc.coins - parseInt(coins));
    if (parseInt(volts)>0) acc.volts = Math.max(0, acc.volts - parseInt(volts));
    await saveAccount(acc);
    res.json({ success:true, coins:acc.coins, volts:acc.volts });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/supreme/elevate', supremeAuth, async (req, res) => {
  try {
    const { username, role } = req.body;
    if (!['player','mod','admin','owner'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const acc = await getAccount(username);
    if (!acc) return res.status(404).json({ error: 'Player not found' });
    if (acc.is_supreme) return res.status(403).json({ error: 'Unauthorized' });
    await query(`UPDATE accounts SET role=$1 WHERE username=$2`, [role, username]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/supreme/ghost-announce', supremeAuth, async (req, res) => {
  try {
    const { message, type } = req.body;
    const id = uuidv4();
    const ann = (await query(`INSERT INTO announcements(id,message,type,author) VALUES($1,$2,$3,$4) RETURNING *`,
      [id, message, type||'info', 'SERVER'])).rows[0];
    await query(`DELETE FROM announcements WHERE id NOT IN (SELECT id FROM announcements ORDER BY created_at DESC LIMIT 20)`);
    io.emit('announcement', ann);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/supreme/force-kick', supremeAuth, (req, res) => {
  const { username, reason } = req.body;
  for (const [,sock] of io.sockets.sockets) {
    if (sock.username===username) {
      sock.emit('kicked',{ reason: reason||'Disconnected' });
      sock.disconnect();
      return res.json({ success:true });
    }
  }
  res.status(404).json({ error:'Player not online' });
});

app.post('/api/supreme/freeze', supremeAuth, (req, res) => {
  const { username, duration=60 } = req.body;
  for (const [,sock] of io.sockets.sockets) {
    if (sock.username===username) {
      sock.frozen = true;
      setTimeout(() => { if (sock) sock.frozen = false; }, Math.min(parseInt(duration),300)*1000);
      return res.json({ success:true, duration });
    }
  }
  res.status(404).json({ error:'Player not online' });
});

// ─── Socket.IO Game Logic ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  let currentRoom = null;
  let playerData  = null;

  socket.on('authenticate', async ({ token }) => {
    const decoded = verifyToken(token);
    if (!decoded) { socket.emit('auth_error','Invalid token'); return; }
    const acc = await getAccount(decoded.username);
    if (!acc) { socket.emit('auth_error','Account not found'); return; }
    if (acc.is_banned) { socket.emit('banned',{reason:acc.ban_reason}); socket.disconnect(); return; }
    socket.username = acc.username;
    hydrateQuests(acc); // expand slim quest storage into full objects for runtime use

    const now = Date.now(); let changed = false;
    if (now > acc.quest_reset?.daily)  { acc.quests.daily  = generateDailyQuests();  acc.quest_reset.daily  = getDailyReset();  changed=true; }
    if (now > acc.quest_reset?.weekly) { acc.quests.weekly = generateWeeklyQuests(); acc.quest_reset.weekly = getWeeklyReset(); changed=true; }
    if (changed || true) { acc.last_login = now; await saveAccount(acc); }

    const anns = (await query(`SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10`)).rows;
    socket.emit('authenticated', { account:sanitizeAccount(acc), battlepass:{tiers:BATTLEPASS_TIERS,season:BATTLEPASS_SEASON}, shopItems:SKIN_SHOP, announcements:anns });
    console.log(`[Auth] ${acc.username} authenticated`);

    // Notify online friends that this user is now online
    try {
      const friendRows = (await query(
        `SELECT * FROM friendships WHERE (requester=$1 OR recipient=$1) AND status='accepted'`,
        [acc.username]
      )).rows;
      for (const f of friendRows) {
        const friendName = f.requester === acc.username ? f.recipient : f.requester;
        for (const [,sock] of io.sockets.sockets) {
          if (sock.username === friendName) {
            sock.emit('friend_online', { username: acc.username });
          }
        }
      }
    } catch(e) { console.warn('[Friends] online notify failed:', e.message); }
  });

  socket.on('find_match', async ({ mode }) => {
    if (!socket.username) return;
    const acc  = await getAccount(socket.username);
    const room = await findOrCreateRoom(mode||'deathmatch');
    joinRoom(socket, room, acc);
  });

  socket.on('join_room', async ({ roomId }) => {
    if (!socket.username) return;
    const acc  = await getAccount(socket.username);
    const room = rooms[roomId];
    if (!room) { socket.emit('error','Room not found'); return; }
    if (Object.keys(room.players).length >= room.maxPlayers) { socket.emit('error','Room full'); return; }
    joinRoom(socket, room, acc);
  });

  function joinRoom(socket, room, acc) {
    if (currentRoom) leaveRoom(socket);
    const spawn = getSpawnPoint();
    playerData = {
      id:socket.id, username:acc.username, skin:acc.active_skin||'default',
      position:spawn, rotation:{x:0,y:0,z:0},
      health:100, maxHealth:100, armor:0,
      weapon:'assault_rifle', ammo:{current:30,reserve:90},
      kills:0, deaths:0, team:assignTeam(room), isAlive:true,
      spawnTime:Date.now(), _dmg:1.0
    };
    room.players[socket.id] = playerData;
    room.scores[socket.id]  = { kills:0, deaths:0, assists:0, damage:0, headshots:0 };
    currentRoom = room;
    socket.join(room.id);
    socket.emit('joined_room',{ roomId:room.id, mapId:room.mapId, mode:room.mode, player:playerData, players:room.players });
    socket.to(room.id).emit('player_joined',{ player:playerData });
    if (room.status==='waiting' && Object.keys(room.players).length >= 2) startRoom(room);
  }

  function assignTeam(room) {
    const ps = Object.values(room.players);
    return ps.filter(p=>p.team==='red').length <= ps.filter(p=>p.team==='blue').length ? 'red' : 'blue';
  }

  function startRoom(room) {
    room.status='playing'; room.startTime=Date.now();
    io.to(room.id).emit('match_start',{ startTime:room.startTime, duration:600000 });
    setTimeout(() => endRoom(room), 600000);
  }

  async function endRoom(room) {
    if (!rooms[room.id]) return;
    room.status='ended';
    const scores = Object.entries(room.scores)
      .map(([sid,s]) => ({ username:room.players[sid]?.username, ...s }))
      .sort((a,b) => b.kills-a.kills);
    io.to(room.id).emit('match_end',{ scores, winner:scores[0]?.username });

    for (const [sid, player] of Object.entries(room.players)) {
      const acc = await getAccount(player.username); if (!acc) continue;
      const sc  = room.scores[sid]||{};
      const xp  = sc.kills*100 + sc.assists*30 + 200;
      const coins = sc.kills*10 + (scores[0]?.username===player.username?100:0);
      acc.stats.kills     += sc.kills||0;
      acc.stats.deaths    += sc.deaths||0;
      acc.stats.damage    += sc.damage||0;
      acc.stats.headshots += sc.headshots||0;
      acc.stats.matches++;
      if (scores[0]?.username===player.username) acc.stats.wins++; else acc.stats.losses++;
      acc.coins += coins;
      addBPXP(acc, xp);
      updateQuests(acc, sc, scores[0]?.username===player.username);
      await saveAccount(acc);
      await query(`UPDATE global_stats SET total_kills=total_kills+$1 WHERE key='global'`, [sc.kills||0]);
      io.sockets.sockets.get(sid)?.emit('match_rewards',{ xpGained:xp, coinsGained:coins, account:sanitizeAccount(acc) });
    }
    setTimeout(() => { delete rooms[room.id]; }, 30000);
  }

  function leaveRoom(socket) {
    if (!currentRoom) return;
    socket.leave(currentRoom.id);
    socket.to(currentRoom.id).emit('player_left',{playerId:socket.id});
    delete currentRoom.players[socket.id];
    delete currentRoom.scores[socket.id];
    if (Object.keys(currentRoom.players).length===0) delete rooms[currentRoom.id];
    currentRoom=null; playerData=null;
  }

  function addBPXP(acc, xp) {
    acc.battlepass.xp += xp;
    while (acc.battlepass.xp >= acc.battlepass.level*500 && acc.battlepass.level < 100) {
      acc.battlepass.xp -= acc.battlepass.level*500; acc.battlepass.level++;
    }
  }

  function updateQuests(acc, sc, won) {
    [...acc.quests.daily,...acc.quests.weekly].forEach(q => {
      if (q.completed) return;
      if (q.type==='kills')      q.progress=Math.min(q.target,q.progress+(sc.kills||0));
      if (q.type==='wins'&&won)  q.progress=Math.min(q.target,q.progress+1);
      if (q.type==='matches')    q.progress=Math.min(q.target,q.progress+1);
      if (q.type==='headshots')  q.progress=Math.min(q.target,q.progress+(sc.headshots||0));
      if (q.type==='damage')     q.progress=Math.min(q.target,q.progress+(sc.damage||0));
      if (q.progress>=q.target&&!q.completed) {
        q.completed=true; acc.quests.completed.push(q.id);
        acc.coins+=q.coins; addBPXP(acc,q.xp);
      }
    });
  }

  // ─── Game Events ──────────────────────────────────────────────────────────
  socket.on('player_move', (data) => {
    if (!currentRoom||!playerData||!playerData.isAlive) return;
    playerData.position=data.position; playerData.rotation=data.rotation;
    socket.to(currentRoom.id).emit('player_moved',{ id:socket.id, position:data.position, rotation:data.rotation, animation:data.animation });
  });

  socket.on('player_shoot', (data) => {
    if (!currentRoom||!playerData||!playerData.isAlive) return;
    socket.to(currentRoom.id).emit('player_shot',{ shooterId:socket.id, weapon:playerData.weapon, origin:data.origin, direction:data.direction });
  });

  socket.on('hit_player', (data) => {
    if (!currentRoom||!playerData||!playerData.isAlive) return;
    const target = currentRoom.players[data.targetId];
    if (!target||!target.isAlive) return;
    const wpn = WEAPONS[playerData.weapon];
    let dmg = Math.round((wpn?.damage||25) * (playerData._dmg||1) * (data.headshot?(wpn?.headMult||2):1));
    if (target.armor>0) { const abs=Math.min(target.armor,dmg*0.5); dmg-=abs; target.armor-=abs; }
    target.health = Math.max(0, target.health-dmg);
    if (currentRoom.scores[socket.id]) {
      currentRoom.scores[socket.id].damage += dmg;
      if (data.headshot) currentRoom.scores[socket.id].headshots = (currentRoom.scores[socket.id].headshots||0)+1;
    }
    io.to(currentRoom.id).emit('player_damaged',{ targetId:data.targetId, damage:dmg, headshot:data.headshot, health:target.health, shooterId:socket.id });
    if (target.health<=0) {
      target.isAlive=false; target.deaths++;
      if (currentRoom.scores[data.targetId]) currentRoom.scores[data.targetId].deaths++;
      playerData.kills++;
      if (currentRoom.scores[socket.id]) currentRoom.scores[socket.id].kills++;
      io.to(currentRoom.id).emit('player_killed',{ killerId:socket.id, killerName:playerData.username, victimId:data.targetId, victimName:target.username, weapon:playerData.weapon, headshot:data.headshot });
      if (io.sockets.sockets.get(data.targetId)) {
        setTimeout(() => {
          if (!currentRoom||!rooms[currentRoom.id]) return;
          const spawn=getSpawnPoint(); target.health=target.maxHealth; target.isAlive=true; target.position=spawn;
          io.to(currentRoom.id).emit('player_respawned',{ playerId:data.targetId, position:spawn, health:target.maxHealth });
        }, 5000);
      }
    }
  });

  socket.on('weapon_change', ({ weapon }) => {
    if (!currentRoom||!playerData||!WEAPONS[weapon]) return;
    playerData.weapon=weapon;
    socket.to(currentRoom.id).emit('player_weapon_changed',{ playerId:socket.id, weapon });
  });

  socket.on('chat_message', ({ message }) => {
    if (!currentRoom||!socket.username) return;
    if (socket.frozen) return; // frozen players can't communicate
    const msg={ from:socket.username, message:message.slice(0,200), at:Date.now() };
    if (shadowBanned.has(socket.username)) { socket.emit('chat_message', msg); return; } // silent: only echoed back to sender
    currentRoom.chat.push(msg);
    if (currentRoom.chat.length>50) currentRoom.chat.shift();
    io.to(currentRoom.id).emit('chat_message', msg);
  });

  socket.on('global_chat', async ({ message }) => {
    if (!socket.username||socket.frozen) return;
    const acc = await getAccount(socket.username);
    const msg = { from:socket.username, message:message.slice(0,200), role:acc?.role, at:Date.now() };
    if (shadowBanned.has(socket.username)) { socket.emit('global_chat', msg); return; } // silent echo only
    io.emit('global_chat', msg);
  });

  // ─── Party System ─────────────────────────────────────────────────────────
  socket.on('create_party', () => {
    if (!socket.username) return;
    const id = uuidv4().slice(0,6).toUpperCase();
    parties[id]={ id, leader:socket.username, members:[{ username:socket.username, socketId:socket.id }], maxSize:4, chat:[] };
    socket.partyId=id; socket.join(`party_${id}`);
    socket.emit('party_created', parties[id]);
  });

  socket.on('join_party', ({ partyId }) => {
    if (!socket.username) return;
    const p=parties[partyId];
    if (!p) { socket.emit('party_error','Party not found'); return; }
    if (p.members.length>=p.maxSize) { socket.emit('party_error','Party is full'); return; }
    if (p.members.find(m=>m.username===socket.username)) { socket.emit('party_error','Already in party'); return; }
    p.members.push({ username:socket.username, socketId:socket.id });
    socket.partyId=partyId; socket.join(`party_${partyId}`);
    io.to(`party_${partyId}`).emit('party_updated',p);
    socket.emit('party_joined',p);
  });

  socket.on('leave_party', () => {
    const p=parties[socket.partyId]; if (!p) return;
    p.members=p.members.filter(m=>m.username!==socket.username);
    socket.leave(`party_${socket.partyId}`);
    if (p.members.length===0) { delete parties[socket.partyId]; }
    else { if (p.leader===socket.username) p.leader=p.members[0].username; io.to(`party_${socket.partyId}`).emit('party_updated',p); }
    socket.partyId=null; socket.emit('party_left');
  });

  socket.on('invite_to_party', ({ targetUsername }) => {
    const p=parties[socket.partyId]; if (!p||p.leader!==socket.username) return;
    for (const [,sock] of io.sockets.sockets) {
      if (sock.username===targetUsername) { sock.emit('party_invite',{ partyId:socket.partyId, from:socket.username }); return; }
    }
    socket.emit('party_error','Player not online');
  });

  socket.on('party_chat', ({ message }) => {
    if (!socket.partyId) return;
    io.to(`party_${socket.partyId}`).emit('party_chat',{ from:socket.username, message:message.slice(0,200), at:Date.now() });
  });

  socket.on('party_queue', async ({ mode }) => {
    const p=parties[socket.partyId]; if (!p||p.leader!==socket.username) return;
    const room=await findOrCreateRoom(mode||'deathmatch');
    for (const m of p.members) {
      const sock=io.sockets.sockets.get(m.socketId);
      if (sock) { const acc=await getAccount(m.username); if(acc) joinRoom(sock,room,acc); }
    }
  });

  // ─── Voice Signaling ──────────────────────────────────────────────────────
  socket.on('voice_offer',  ({targetId,offer})     => io.sockets.sockets.get(targetId)?.emit('voice_offer', {from:socket.id,offer}));
  socket.on('voice_answer', ({targetId,answer})    => io.sockets.sockets.get(targetId)?.emit('voice_answer',{from:socket.id,answer}));
  socket.on('voice_ice',    ({targetId,candidate}) => io.sockets.sockets.get(targetId)?.emit('voice_ice',   {from:socket.id,candidate}));
  socket.on('voice_mute',   ({muted}) => { if(currentRoom) socket.to(currentRoom.id).emit('player_muted',{playerId:socket.id,muted}); });

  socket.on('disconnect', async () => {
    leaveRoom(socket);
    if (socket.partyId) {
      const p=parties[socket.partyId];
      if (p) { p.members=p.members.filter(m=>m.socketId!==socket.id); if(p.members.length===0) delete parties[socket.partyId]; else io.to(`party_${socket.partyId}`).emit('party_updated',p); }
    }
    // Notify online friends that this user is now offline
    if (socket.username) {
      try {
        const friendRows = (await query(
          `SELECT * FROM friendships WHERE (requester=$1 OR recipient=$1) AND status='accepted'`,
          [socket.username]
        )).rows;
        for (const f of friendRows) {
          const friendName = f.requester === socket.username ? f.recipient : f.requester;
          for (const [,sock] of io.sockets.sockets) {
            if (sock.username === friendName) {
              sock.emit('friend_offline', { username: socket.username });
            }
          }
        }
      } catch(e) { console.warn('[Friends] offline notify failed:', e.message); }
    }
    console.log(`[Socket] Disconnected: ${socket.id} (${socket.username||'guest'})`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════╗`);
    console.log(`║   ZapZone Server - Port ${PORT}   ║`);
    console.log(`╚════════════════════════════════╝`);
    console.log(`  Game:  http://localhost:${PORT}`);
    console.log(`  Admin: http://localhost:${PORT}/admin.html\n`);
  });
}).catch(err => { console.error('[DB] Init failed:', err.message); process.exit(1); });
