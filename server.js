const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// ========== UPGRADES PADRÃO (com novos: crítico, multi-tiro, minas, regen, roubo de vida) ==========
const DEFAULT_UPGRADES = {
  range:       { lvl:1, baseCost:0.01,    val: 155 },
  damage:      { lvl:1, baseCost:0.02,    val: 1.6 },
  targets:     { lvl:0, baseCost:0.02,    val: 1 },
  attackSpeed: { lvl:0, baseCost:0.015,   val: 0 },
  defPercent:  { lvl:0, baseCost:0.03,    val: 0 },
  maxHp:       { lvl:0, baseCost:0.002,   val: 0 },
  coinGain:    { lvl:0, baseCost:0.05,    val: 0 },
  critFactor:  { lvl:0, baseCost:0.05,    val: 0 },  // ⚔️ Fator Crítico (multiplicador de dano crítico)
  multiShot:   { lvl:0, baseCost:0.00002, val: 0 },  // ⚔️ Chance de Múltiplos Disparos (%)
  mines:       { lvl:0, baseCost:0.2,     val: 0 },  // ⚔️ Minas Terrestres (qtd ativas)
  regen:       { lvl:0, baseCost:0.1,     val: 0 },  // 🛡️ Regeneração de Vida (hp/s)
  lifeSteal:   { lvl:0, baseCost:0.0007,  val: 0 },  // 🛡️ Roubo de Vida (%)
  thorns:      { lvl:0, baseCost:0.007,   val: 0 },  // 🌵 Espinhos (dano/s em inimigos próximos)
  orbs:        { lvl:0, baseCost:10,      val: 0 },  // 🔮 Orbes (qtd ativa, máx 4)
  orbSpeed:    { lvl:0, baseCost:5,       val: 0 },  // 💨 Velocidade do Orbe
  lightning:   { lvl:0, baseCost:7,       val: 0 },  // ⚡ Relâmpago em Cadeia
  missile:     { lvl:0, baseCost:7,       val: 0 },  // 🚀 Míssil (5 alvos + área)
  bomb:        { lvl:0, baseCost:14,      val: 0 },  // ☢️ Super Bomba (explosão gigante)
  vortex:      { lvl:0, baseCost:5,       val: 0 }   // 🌀 Vórtice (puxa + lentidão)
};
function ensureUpgrades(upg) {
  const out = {};
  for (const k of Object.keys(DEFAULT_UPGRADES)) {
    out[k] = (upg && upg[k]) ? { ...DEFAULT_UPGRADES[k], ...upg[k] } : { ...DEFAULT_UPGRADES[k] };
  }
  return out;
}
let db = { users: {}, banned: [] };
if (fs.existsSync(DB_PATH)) {
  try { 
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!db.users) db.users = {};
    if (!db.banned) db.banned = [];
    // 🔄 Migração: garante os novos upgrades para TODOS os usuários existentes
    if (!db.eventHistory) db.eventHistory = [];
    if (!db.alliances) db.alliances = {};
    if (!db.worldItems) db.worldItems = [];
    if (!db.pendingInvites) db.pendingInvites = {};
    for (const u of Object.keys(db.users)) {
      db.users[u].data.upgrades = ensureUpgrades(db.users[u].data.upgrades);
      if (!db.users[u].data.claimedMilestones) db.users[u].data.claimedMilestones = [];
      if (db.users[u].data.playerClass === undefined) db.users[u].data.playerClass = null;
      if (!db.users[u].data.alliance) db.users[u].data.alliance = null;
      if (db.users[u].data.allianceKills === undefined) db.users[u].data.allianceKills = 0;
      if (!db.users[u].data.inventory) db.users[u].data.inventory = [];
    }
  }
  catch(e) { db = { users: {}, banned: [] }; }
}

const GM_ACCOUNT = '[GM]TWM';
const GM_PASSWORD = 'Intelcore9@#';

if (!db.users[GM_ACCOUNT]) {
  db.users[GM_ACCOUNT] = {
    password: GM_PASSWORD,
    data: {
      username: GM_ACCOUNT, coins: 1000.00, wave: 1, waveTimer: 60,
      hp: 500, maxHp: 500, baseX: 20000, baseY: 20000,
      bestWave: 1, enemiesKilled: 0, friends: [], isGM: true, claimedMilestones: [], playerClass: null, alliance: null, allianceKills: 0, inventory: [],
      upgrades: {
        range: { lvl:1, baseCost:0.01, val: 155 },
        damage: { lvl:1, baseCost:0.02, val: 1.6 },
        targets: { lvl:0, baseCost:0.02, val: 1 },
        attackSpeed: { lvl:0, baseCost:0.015, val: 0 },
        defPercent: { lvl:0, baseCost:0.03, val: 0 },
        maxHp: { lvl:0, baseCost:0.002, val: 0 },
        coinGain: { lvl:0, baseCost:0.05, val: 0 },
        critFactor: { lvl:0, baseCost:0.05, val: 0 },
        multiShot: { lvl:0, baseCost:0.00002, val: 0 },
        mines: { lvl:0, baseCost:0.2, val: 0 },
        regen: { lvl:0, baseCost:0.1, val: 0 },
        lifeSteal: { lvl:0, baseCost:0.0007, val: 0 }
      }
    }
  };
  console.log('👑 Conta GM criada!');
}

function saveDB() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
saveDB();

app.use(express.json());
// 🌐 CORS: permite frontend em outra hospedagem (ex: Hostinger) chamar este backend (Render)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    // Evita cache do HTML para os jogadores sempre receberem a versão mais nova (ícones etc.)
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

const MAP_WIDTH = 40000;
const MAP_HEIGHT = 40000;
const MIN_DISTANCE_BETWEEN_PLAYERS = 20000;

const groups = {};
const userToGroup = {};
const friendRequests = {};
const clients = {};

// ========== ⚔️ SISTEMA DE PVP (Jogador vs Jogador) ==========
const pvpQueues = { '0.5': [], '1': [] }; // aposta -> [{username, bet}]
const pvpMatches = {};                    // matchId -> { id, p1, p2, bet, orig }
const userToPvpMatch = {};                 // username -> matchId
let pvpMatchIdCounter = 1;
function pvpArenaPos() { return { x: Math.round(MAP_WIDTH / 2), y: Math.round(MAP_HEIGHT / 2) }; }
function refundPvpBet(username, bet) {
  const u = db.users[username];
  if (u) { u.data.coins = Number(((u.data.coins || 0) + bet).toFixed(6)); saveDB(); sendTo(username, { type: 'coins_sync', coins: u.data.coins }); }
}
function endPvpMatch(loserUsername, reason) {
  const mid = userToPvpMatch[loserUsername];
  if (!mid || !pvpMatches[mid]) return;
  const m = pvpMatches[mid];
  const winner = (m.p1 === loserUsername) ? m.p2 : m.p1;
  const total = m.bet * 2;
  const tax = total * 0.05;              // 5% do valor total da aposta
  const payout = Number((total - tax).toFixed(6));
  const wu = db.users[winner];
  if (wu) {
    wu.data.coins = Number(((wu.data.coins || 0) + payout).toFixed(6));
    wu.data.pvpWins = (wu.data.pvpWins || 0) + 1;
    if (wu.data.hp != null && wu.data.maxHp != null) wu.data.hp = wu.data.maxHp;
    saveDB();
    sendTo(winner, { type: 'coins_sync', coins: wu.data.coins });
  }
  const lu = db.users[loserUsername];
  if (lu && lu.data.maxHp != null) { lu.data.hp = lu.data.maxHp; saveDB(); }
  sendTo(winner, { type: 'pvp_end', youWin: true, opponent: loserUsername, payout: payout, returnPos: m.orig[winner] });
  sendTo(loserUsername, { type: 'pvp_end', youWin: false, opponent: winner, payout: 0, returnPos: m.orig[loserUsername] });
  broadcast({ type: 'notice', text: `⚔️ PVP: ${winner} venceu ${loserUsername} e ganhou R$${payout.toFixed(4)}!` });
  delete userToPvpMatch[m.p1]; delete userToPvpMatch[m.p2]; delete pvpMatches[mid];
}
function leavePvpCleanup(username) {
  let refunded = 0;
  Object.keys(pvpQueues).forEach(b => {
    pvpQueues[b] = pvpQueues[b].filter(q => { if (q.username === username) { refunded = q.bet; return false; } return true; });
  });
  if (refunded > 0) refundPvpBet(username, refunded);
  if (userToPvpMatch[username]) endPvpMatch(username, 'disconnect'); // desconectou = perde por WO
}

function getSafePosition() {
  let attempts = 0;
  while (attempts < 100) {
    const x = 2000 + Math.random() * (MAP_WIDTH - 4000);
    const y = 2000 + Math.random() * (MAP_HEIGHT - 4000);
    let safe = true;
    for (const user of Object.keys(db.users)) {
      const other = db.users[user].data;
      if (Math.hypot(x - other.baseX, y - other.baseY) < MIN_DISTANCE_BETWEEN_PLAYERS) {
        safe = false; break;
      }
    }
    if (safe) return { x, y };
    attempts++;
  }
  return { x: 2000 + Math.random() * (MAP_WIDTH - 4000), y: 2000 + Math.random() * (MAP_HEIGHT - 4000) };
}

function getSafePositionFarFrom(farX, farY, minDist = MIN_DISTANCE_BETWEEN_PLAYERS * 2) {
  let attempts = 0;
  while (attempts < 150) {
    const x = 2000 + Math.random() * (MAP_WIDTH - 4000);
    const y = 2000 + Math.random() * (MAP_HEIGHT - 4000);
    const distFromTarget = Math.hypot(x - farX, y - farY);
    if (distFromTarget < minDist) { attempts++; continue; }
    let safe = true;
    for (const user of Object.keys(db.users)) {
      const other = db.users[user].data;
      if (Math.hypot(x - other.baseX, y - other.baseY) < MIN_DISTANCE_BETWEEN_PLAYERS) {
        safe = false; break;
      }
    }
    if (safe) return { x, y };
    attempts++;
  }
  return getSafePosition();
}

function newPlayerData(username) {
  const pos = getSafePosition();
  return {
    username, coins: 10.00, wave: 1, waveTimer: 60, hp: 100, maxHp: 100,
    baseX: pos.x, baseY: pos.y, bestWave: 1, enemiesKilled: 0,
    friends: [], isGM: false, claimedMilestones: [], playerClass: null, alliance: null, allianceKills: 0, inventory: [],
    upgrades: {
      range: { lvl:0, baseCost:0.01, val: 120 },
      damage: { lvl:0, baseCost:0.02, val: 1.0 },
      targets: { lvl:0, baseCost:0.02, val: 1 },
      attackSpeed: { lvl:0, baseCost:0.015, val: 0 },
      defPercent: { lvl:0, baseCost:0.03, val: 0 },
      maxHp: { lvl:0, baseCost:0.002, val: 0 },
      coinGain: { lvl:0, baseCost:0.05, val: 0 },
      critFactor: { lvl:0, baseCost:0.05, val: 0 },
      multiShot: { lvl:0, baseCost:0.00002, val: 0 },
      mines: { lvl:0, baseCost:0.2, val: 0 },
      regen: { lvl:0, baseCost:0.1, val: 0 },
      lifeSteal: { lvl:0, baseCost:0.0007, val: 0 }
    }
  };
}

function sendTo(username, data) {
  const ws = clients[username];
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(data) {
  Object.keys(clients).forEach(u => sendTo(u, data));
}

function createGroup(user1, user2) {
  const groupId = `group_${Date.now()}`;
  const centerX = 2000 + Math.random() * (MAP_WIDTH - 4000);
  const centerY = 2000 + Math.random() * (MAP_HEIGHT - 4000);
  const offset = 250;
  
  db.users[user1].data.baseX = centerX - offset;
  db.users[user1].data.baseY = centerY;
  db.users[user1].data.wave = 1;
  db.users[user1].data.waveTimer = 60;
  db.users[user1].data.hp = db.users[user1].data.maxHp;
  
  db.users[user2].data.baseX = centerX + offset;
  db.users[user2].data.baseY = centerY;
  db.users[user2].data.wave = 1;
  db.users[user2].data.waveTimer = 60;
  db.users[user2].data.hp = db.users[user2].data.maxHp;
  
  groups[groupId] = { id: groupId, members: [user1, user2], enemies: [], wave: 1, waveTimer: 60 };
  userToGroup[user1] = groupId;
  userToGroup[user2] = groupId;
  saveDB();
  
  [user1, user2].forEach(u => {
    const partner = u === user1 ? user2 : user1;
    sendTo(u, {
      type: 'group_formed',
      partner: partner,
      yourBase: { x: db.users[u].data.baseX, y: db.users[u].data.baseY },
      partnerBase: { x: db.users[partner].data.baseX, y: db.users[partner].data.baseY }
    });
  });
}

function leaveGroup(username) {
  const groupId = userToGroup[username];
  if (!groupId) return;
  const group = groups[groupId];
  if (!group) return;
  const partner = group.members.find(m => m !== username);
  
  delete userToGroup[username];
  group.members = group.members.filter(m => m !== username);
  
  if (group.members.length === 0) {
    delete groups[groupId];
  } else {
    if (partner && db.users[partner]) {
      const newPos = getSafePositionFarFrom(db.users[username].data.baseX, db.users[username].data.baseY);
      db.users[partner].data.baseX = newPos.x;
      db.users[partner].data.baseY = newPos.y;
      db.users[partner].data.wave = 1;
      db.users[partner].data.waveTimer = 60;
      db.users[partner].data.hp = db.users[partner].data.maxHp;
      sendTo(partner, { type: 'group_left', who: username, newBase: newPos });
    }
    delete userToGroup[partner];
    delete groups[groupId];
  }
  
  if (db.users[username]) {
    const farX = partner ? db.users[partner].data.baseX : 0;
    const farY = partner ? db.users[partner].data.baseY : 0;
    const newPos = getSafePositionFarFrom(farX, farY);
    db.users[username].data.baseX = newPos.x;
    db.users[username].data.baseY = newPos.y;
    db.users[username].data.wave = 1;
    db.users[username].data.waveTimer = 60;
    db.users[username].data.hp = db.users[username].data.maxHp;
    sendTo(username, { type: 'group_left_self', newBase: newPos });
  }
  
  saveDB();
}

// ========== AUTENTICAÇÃO ==========
app.post('/auth', (req, res) => {
  const { username, password, register } = req.body;
  if (!username || !password) return res.json({ success: false, error: 'Preencha tudo' });
  if (register) {
    if (db.users[username]) return res.json({ success: false, error: 'Usuário já existe' });
    if (username.includes('[GM]')) return res.json({ success: false, error: 'Tag [GM] reservada!' });
    if (db.banned.includes(username)) return res.json({ success: false, error: 'Você está banido!' });
    db.users[username] = { password, data: newPlayerData(username) };
    saveDB();
    return res.json({ success: true });
  } else {
    if (db.banned.includes(username)) return res.json({ success: false, error: '🚫 VOCÊ ESTÁ BANIDO!' });
    const user = db.users[username];
    if (!user || user.password !== password) return res.json({ success: false, error: 'Credenciais inválidas' });
    // 🔄 Garante upgrades novos no login
    user.data.upgrades = ensureUpgrades(user.data.upgrades);
    saveDB();
    return res.json({ success: true, data: user.data });
  }
});

// ========== GM ==========
app.post('/gm/givecoins', (req, res) => {
  const { from, target, amount } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  if (!db.users[target]) return res.json({ success: false, error: 'Jogador não encontrado!' });
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: 'Valor inválido!' });
  db.users[target].data.coins += amt;
  saveDB();
  sendTo(target, { type: 'coins_sync', coins: db.users[target].data.coins });
  sendTo(target, { type: 'notice', text: `👑 GM enviou R$${amt.toFixed(2)}!` });
  return res.json({ success: true, message: `Enviado R$${amt.toFixed(2)} para ${target}!` });
});

app.post('/gm/ban', (req, res) => {
  const { from, target } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  if (!db.users[target]) return res.json({ success: false, error: 'Jogador não encontrado!' });
  if (target === GM_ACCOUNT) return res.json({ success: false, error: 'Não pode banir o GM!' });
  if (db.banned.includes(target)) return res.json({ success: false, error: 'Já está banido!' });
  db.banned.push(target);
  saveDB();
  if (clients[target]) { sendTo(target, { type: 'banned' }); clients[target].close(); }
  broadcast({ type: 'notice', text: `🚫 ${target} foi BANIDO pelo GM!` });
  return res.json({ success: true, message: `${target} banido!` });
});

app.post('/gm/unban', (req, res) => {
  const { from, target } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  if (!db.banned.includes(target)) return res.json({ success: false, error: 'Não está banido!' });
  db.banned = db.banned.filter(u => u !== target);
  saveDB();
  return res.json({ success: true, message: `${target} desbanido!` });
});

// 🥾 KICK: expulsa jogador da sessão com aviso personalizado (NÃO bane)
app.post('/gm/kick', (req, res) => {
  const { from, target, reason } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  if (!db.users[target]) return res.json({ success: false, error: 'Jogador não encontrado!' });
  if (target === GM_ACCOUNT) return res.json({ success: false, error: 'Não pode kickar o GM!' });
  const ws = clients[target];
  if (!ws || ws.readyState !== WebSocket.OPEN) return res.json({ success: false, error: 'Jogador não está online!' });
  const motivo = String(reason || 'Expulso pelo GM.').substring(0, 200);
  sendTo(target, { type: 'kicked', reason: motivo });
  setTimeout(() => { if (clients[target]) clients[target].close(); }, 400);
  broadcast({ type: 'notice', text: `🥾 ${target} foi expulso pelo GM!` });
  return res.json({ success: true, message: `${target} expulso! Motivo: ${motivo}` });
});

// ========== RANKING ==========
// 📈 Sistema de Nível: 50 kills -> NV1, necessidade dobra a cada level up
function levelFromKills(kills) {
  let level = 1, needed = 50, k = kills || 0;
  while (k >= needed) { k -= needed; level++; needed *= 2; }
  return level;
}
app.get('/ranking', (req, res) => {
  const players = Object.values(db.users).map(u => ({
    username: u.data.username, bestWave: u.data.bestWave || 1,
    enemiesKilled: u.data.enemiesKilled || 0, pvpWins: u.data.pvpWins || 0,
    level: levelFromKills(u.data.enemiesKilled || 0), isGM: u.data.isGM || false
  }));
  const byWave = [...players].sort((a, b) => b.bestWave - a.bestWave).slice(0, 20);
  const byKills = [...players].sort((a, b) => b.enemiesKilled - a.enemiesKilled).slice(0, 20);
  const byPvp = [...players].sort((a, b) => b.pvpWins - a.pvpWins).slice(0, 20);
  const byLevel = [...players].sort((a, b) => b.level - a.level || b.enemiesKilled - a.enemiesKilled).slice(0, 20);
  res.json({ success: true, byWave, byKills, byPvp, byLevel });
});

// 🎁 Recompensa Diária: R$0,005 no dia 1, dobra a cada dia, ciclo de 30 dias.
// Se perder 1 dia (ou completar os 30), o ciclo recomeça do dia 1.
function todayStr() { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
app.get('/daily/status', (req, res) => {
  const user = db.users[req.query.username];
  if (!user) return res.json({ success: false, error: 'Usuário não encontrado!' });
  const d = user.data;
  const today = todayStr();
  const canClaim = d.lastDailyClaim !== today;
  let nextDay = 1;
  if (d.lastDailyClaim === yesterdayStr()) nextDay = Math.min(30, (d.dailyStreak || 0) + 1);
  else if (d.lastDailyClaim === today) nextDay = d.dailyStreak || 1;
  const amount = 0.30;
  res.json({ success: true, canClaim, currentDay: d.dailyStreak || 0, nextDay, nextAmount: amount });
});
app.post('/daily/claim', (req, res) => {
  const { username } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Usuário não encontrado!' });
  const d = user.data;
  const today = todayStr();
  if (d.lastDailyClaim === today) {
    return res.json({ success: false, error: `⏳ Você já coletou hoje! Volte amanhã. Sequência: dia ${d.dailyStreak || 1}/30` });
  }
  let day;
  if (d.lastDailyClaim === yesterdayStr()) day = (d.dailyStreak || 0) + 1;
  else day = 1; // perdeu um dia (ou primeira coleta): recomeça do dia 1
  const amount = 0.30;
  d.coins = (d.coins || 0) + amount;
  d.dailyStreak = day;
  d.lastDailyClaim = today;
  let bonusItem = null;
  if (day % 10 === 0) {
    const keys = Object.keys(DEFAULT_UPGRADES);
    bonusItem = keys[Math.floor(Math.random() * keys.length)];
    (d.inventory = d.inventory || []).push(bonusItem);
  }
  saveDB();
  return res.json({ success: true, message: `Dia ${day}: +R$${amount}` + (bonusItem ? ' + 🎁 Upgrade no inventário!' : ''), day, amount, amountStr: amount.toFixed(6), coins: d.coins, bonusItem });
});

// ========== 👑 VIP ==========
const VIP_UPGRADES = {
  slowShot:   { baseCost: 0.15,  name: 'Tiro Retardante (nível)' },
  slowChance: { baseCost: 0.10,  name: 'Chance de Tiro Retardante (%)' },
  lifeSteal:  { baseCost: 0.0007, name: 'Roubo de Vida (%)' },
  skipRound:  { baseCost: 5.00,  name: 'Pular Round (nível)' },
  skipChance: { baseCost: 1.00,  name: 'Chance de Pular Round (%)' }
};
function ensureVip(d) {
  if (!d.vipUpgrades) d.vipUpgrades = { slowShot:0, slowChance:0, lifeSteal:0, skipRound:0, skipChance:0 };
  if (d.vipUntil == null) d.vipUntil = 0;
}
app.get('/vip/status', (req, res) => {
  const user = db.users[req.query.username];
  if (!user) return res.json({ success: false, error: 'Não encontrado!' });
  ensureVip(user.data);
  res.json({ success: true, vipUntil: user.data.vipUntil || 0, isVip: (user.data.vipUntil||0) > Date.now(), vipUpgrades: user.data.vipUpgrades });
});
app.post('/vip/upgrade', (req, res) => {
  const { username, key } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Não encontrado!' });
  ensureVip(user.data);
  if ((user.data.vipUntil || 0) <= Date.now()) return res.json({ success: false, error: 'VIP inativo! Ative o VIP na Loja primeiro.' });
  const def = VIP_UPGRADES[key];
  if (!def) return res.json({ success: false, error: 'Upgrade inválido!' });
  const lvl = user.data.vipUpgrades[key] || 0;
  const cost = def.baseCost * Math.pow(1.5, lvl);
  if (user.data.coins < cost) return res.json({ success: false, error: 'Moedas insuficientes!' });
  user.data.coins -= cost;
  user.data.vipUpgrades[key] = lvl + 1;
  saveDB();
  return res.json({ success: true, message: `${def.name} → nível ${lvl+1}!`, vipUpgrades: user.data.vipUpgrades, coins: user.data.coins });
});
app.post('/gm/givevip', (req, res) => {
  const { from, target, days } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  const user = db.users[target];
  if (!user) return res.json({ success: false, error: 'Jogador não encontrado!' });
  ensureVip(user.data);
  const base = Math.max(Date.now(), user.data.vipUntil || 0);
  user.data.vipUntil = base + (parseInt(days) || 10) * 86400000;
  saveDB();
  return res.json({ success: true, message: `VIP de ${days} dias dado para ${target}!` });
});
app.post('/gm/givegm', (req, res) => {
  const { from, target } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  const user = db.users[target];
  if (!user) return res.json({ success: false, error: 'Jogador não encontrado!' });
  user.data.isGM = true;
  saveDB();
  return res.json({ success: true, message: `${target} agora é GM!` });
});
app.post('/gm/removegm', (req, res) => {
  const { from, target } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  if (target === from) return res.json({ success: false, error: 'Não pode remover a si mesmo!' });
  const user = db.users[target];
  if (!user) return res.json({ success: false, error: 'Jogador não encontrado!' });
  user.data.isGM = false;
  saveDB();
  return res.json({ success: true, message: `GM removido de ${target}!` });
});


app.post('/gm/speedevent', (req, res) => {
  const { from, multiplier, minutes } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  const mult = Math.max(1, Math.min(3, parseFloat(multiplier) || 1));
  const mins = Math.max(1, Math.min(120, parseInt(minutes) || 5));
  global.eventSpeedMult = mult;
  global.eventSpeedUntil = Date.now() + mins * 60000;
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify({ type:'speed_event', mult, until: global.eventSpeedUntil })); });
  return res.json({ success: true, message: `⚡ Evento: ${mult}x velocidade por ${mins} min!` });
});
app.get('/speed/status', (req, res) => {
  res.json({ success:true, mult: global.eventSpeedMult || 1, until: global.eventSpeedUntil || 0 });
});


// 📋 Missoes Diarias
const MISSION_DEFS = { m1:{target:5,reward:0.001,tipo:'upgrades'}, m2:{target:10,reward:0.09,tipo:'upgrades'}, m3:{target:4500,reward:0.10,tipo:'kills'}, m4:{target:18000,reward:0.10,tipo:'playtime'} };
function todayStrM() { return new Date().toISOString().slice(0,10); }
function ensureMissions(d) {
  if (!d.missions) d.missions = { claimed:{}, upgradesCount:0, playtimeSec:0, lastReset: todayStrM() };
  if (d.missions.lastReset !== todayStrM()) { d.missions.claimed = {}; d.missions.upgradesCount = 0; d.missions.playtimeSec = 0; d.missions.lastReset = todayStrM(); }
}
app.get('/missions/status', (req, res) => {
  const user = db.users[req.query.username];
  if (!user) return res.json({ success:false, error:'Não encontrado!' });
  ensureMissions(user.data);
  user.data.missions.playtimeSec = Math.max(user.data.missions.playtimeSec||0, parseInt(req.query.playtime)||0);
  saveDB();
  const totalUpgrades = Object.values(user.data.upgrades||{}).reduce((a,u)=>a+(u.lvl||0),0);
  const progress = { upgrades: Math.max(totalUpgrades, user.data.missions.upgradesCount||0), kills: user.data.enemiesKilled||0, playtime: user.data.missions.playtimeSec||0 };
  res.json({ success:true, progress, claimed: user.data.missions.claimed||{} });
});
app.post('/missions/claim', (req, res) => {
  const { username, missionId, playtime } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success:false, error:'Não encontrado!' });
  ensureMissions(user.data);
  const def = MISSION_DEFS[missionId];
  if (!def) return res.json({ success:false, error:'Missão inválida!' });
  if (user.data.missions.claimed[missionId]) return res.json({ success:false, error:'Já resgatada hoje!' });
  user.data.missions.playtimeSec = Math.max(user.data.missions.playtimeSec||0, parseInt(playtime)||0);
  const totalUpgrades = Object.values(user.data.upgrades||{}).reduce((a,u)=>a+(u.lvl||0),0);
  const progress = { upgrades: Math.max(totalUpgrades, user.data.missions.upgradesCount||0), kills: user.data.enemiesKilled||0, playtime: user.data.missions.playtimeSec||0 };
  if ((progress[def.tipo]||0) < def.target) return res.json({ success:false, error:'Progresso insuficiente!' });
  user.data.missions.claimed[missionId] = true;
  user.data.coins = (user.data.coins||0) + def.reward;
  saveDB();
  return res.json({ success:true, reward: def.reward, coins: user.data.coins });
});

app.post('/gm/invasion', (req, res) => {
  const { from } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success:false, error:'Apenas GM!' });
  wss.clients.forEach(c=>{ if(c.readyState===1) c.send(JSON.stringify({ type:'invasion', count:30, duration:10 })); });
  return res.json({ success:true, message:'⚠️ INVASÃO iniciada para todos!' });
});
setInterval(()=>{ wss.clients.forEach(c=>{ if(c.readyState===1) c.send(JSON.stringify({ type:'invasion', count:30, duration:10 })); }); }, 5*60*60*1000);

// ========== WEBSOCKET ==========
wss.on('connection', (ws) => {
  let username = null;
  
  ws.on('message', (msgStr) => {
    try {
      const msg = JSON.parse(msgStr);
      
      if (msg.type === 'join') {
        username = msg.username;
        if (db.banned.includes(username)) { ws.send(JSON.stringify({ type: 'banned' })); ws.close(); return; }
        if (!db.users[username]) { ws.send(JSON.stringify({ type: 'notice', text: 'Conta não encontrada!' })); return; }
        
        clients[username] = ws;
        const self = db.users[username].data;
        const others = {};
        
        Object.keys(clients).forEach(u => {
          if (u !== username && db.users[u]) {
            const d = db.users[u].data;
            others[u] = {
              username: d.username, baseX: d.baseX, baseY: d.baseY,
              wave: d.wave, hp: d.hp, maxHp: d.maxHp, upgrades: d.upgrades,
              isGM: d.isGM || false, bestWave: d.bestWave || 1, enemiesKilled: d.enemiesKilled || 0
            };
          }
        });
        
        ws.send(JSON.stringify({ type: 'init', self, others, friends: self.friends || [], mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT }));
        
        Object.keys(clients).forEach(u => {
          if (u !== username) {
            sendTo(u, {
              type: 'player_join', username,
              baseX: self.baseX, baseY: self.baseY, wave: self.wave, hp: self.hp, maxHp: self.maxHp,
              upgrades: self.upgrades, isGM: self.isGM || false, bestWave: self.bestWave || 1, enemiesKilled: self.enemiesKilled || 0
            });
          }
        });
      }
      
      if (msg.type === 'private_msg' && username) { const target = [...wss.clients].find(c => c.username === msg.to); if (target && target.readyState === 1) target.send(JSON.stringify({ type:'private_msg', from: username, text: String(msg.text||'').substring(0,200) })); return; }
      if (msg.type === 'chat' && username) {
        const text = String(msg.text || '').trim().substring(0, 150);
        if (!text) return;
        const isGM = db.users[username]?.data.isGM || false;
        broadcast({ type: 'chat', from: username, text: text, isGM: isGM });
      }

      // ========== ⚔️ PVP: entrar na fila / cancelar / sincronizar inimigos ==========
      if (msg.type === 'pvp_join' && username) {
        const bet = parseFloat(msg.bet);
        if (bet !== 0.5 && bet !== 1) { sendTo(username, { type: 'pvp_error', error: 'Aposta inválida!' }); return; }
        const u = db.users[username]; if (!u) return;
        if (userToPvpMatch[username]) return;
        Object.keys(pvpQueues).forEach(b => { pvpQueues[b] = pvpQueues[b].filter(q => q.username !== username); });
        if ((u.data.coins || 0) < bet) { sendTo(username, { type: 'pvp_error', error: 'Dinheiro insuficiente para esta aposta!' }); return; }
        u.data.coins = Number(((u.data.coins || 0) - bet).toFixed(6)); saveDB();
        sendTo(username, { type: 'coins_sync', coins: u.data.coins });
        const betKey = String(bet);
        const q = pvpQueues[betKey];
        const other = q.shift();
        if (other && db.users[other.username] && clients[other.username] && other.username !== username) {
          const mid = 'pvp' + (pvpMatchIdCounter++);
          const arena = pvpArenaPos();
          const ou = db.users[other.username];
          const orig = {};
          orig[username] = { x: u.data.baseX, y: u.data.baseY };
          orig[other.username] = { x: ou.data.baseX, y: ou.data.baseY };
          u.data.hp = u.data.maxHp || 100; ou.data.hp = ou.data.maxHp || 100; saveDB();
          pvpMatches[mid] = { id: mid, p1: username, p2: other.username, bet: bet, orig: orig };
          userToPvpMatch[username] = mid; userToPvpMatch[other.username] = mid;
          sendTo(username, { type: 'pvp_start', matchId: mid, opponent: other.username, bet: bet, yourPos: { x: arena.x - 180, y: arena.y }, opponentPos: { x: arena.x + 180, y: arena.y } });
          sendTo(other.username, { type: 'pvp_start', matchId: mid, opponent: username, bet: bet, yourPos: { x: arena.x + 180, y: arena.y }, opponentPos: { x: arena.x - 180, y: arena.y } });
        } else {
          if (other) q.push(other);
          q.push({ username, bet: bet });
          sendTo(username, { type: 'pvp_waiting', bet: bet });
        }
        return;
      }
      if (msg.type === 'pvp_cancel' && username) {
        let refunded = 0;
        Object.keys(pvpQueues).forEach(b => {
          pvpQueues[b] = pvpQueues[b].filter(q => { if (q.username === username) { refunded = q.bet; return false; } return true; });
        });
        if (refunded > 0) refundPvpBet(username, refunded);
        sendTo(username, { type: 'pvp_cancelled' });
        return;
      }
      if (msg.type === 'pvp_enemies' && username) {
        const mid = userToPvpMatch[username];
        if (mid && pvpMatches[mid]) {
          const m = pvpMatches[mid];
          const opp = (m.p1 === username) ? m.p2 : m.p1;
          sendTo(opp, { type: 'pvp_enemies_sync', from: username, enemies: Array.isArray(msg.enemies) ? msg.enemies.slice(0, 80) : [] });
        }
        return;
      }
      if (msg.type === 'pvp_death' && username) {
        if (userToPvpMatch[username]) endPvpMatch(username, 'death');
        return;
      }
      
      // 💰 SISTEMA DE MOEDAS INDIVIDUAL NO GRUPO
      if (msg.type === 'group_kill_reward' && username) {
        const groupId = userToGroup[username];
        if (!groupId || !groups[groupId]) return;
        
        const reward = parseFloat(msg.reward) || 0;
        if (reward <= 0) return;
        
        // ✅ Ambos ganham a mesma recompensa, mas cada um mantém seu próprio dinheiro
        groups[groupId].members.forEach(m => {
          if (db.users[m]) {
            db.users[m].data.coins += reward;
            sendTo(m, { type: 'coins_sync', coins: db.users[m].data.coins });
          }
        });
        saveDB();
      }
      
      if (msg.type === 'update' && username && db.users[username]) {
        const d = db.users[username].data;
        // ✅ NÃO sincroniza mais moedas do parceiro — cada um tem seu dinheiro
        d.coins = msg.state.coins;
        d.hp = msg.state.hp;
        d.maxHp = msg.state.maxHp;
        d.upgrades = ensureUpgrades(msg.state.upgrades);
        d.baseX = msg.state.baseX;
        d.baseY = msg.state.baseY;
        if (msg.state.enemiesKilled !== undefined) {
          // 🛡️ Aliança: contabiliza novas kills para a aliança
          if (d.alliance) {
            const newKills = msg.state.enemiesKilled - (d.enemiesKilled || 0);
            if (newKills > 0) d.allianceKills = (d.allianceKills || 0) + newKills;
          }
          d.enemiesKilled = msg.state.enemiesKilled;
        }
        if (msg.state.bestWave !== undefined && msg.state.bestWave > (d.bestWave || 0)) d.bestWave = msg.state.bestWave;
        saveDB();
        
        // ✅ REMOVIDO: sobrescrever moedas do parceiro
        
        Object.keys(clients).forEach(u => {
          if (u !== username) {
            sendTo(u, {
              type: 'state_update', username,
              state: { coins: d.coins, hp: d.hp, maxHp: d.maxHp, upgrades: d.upgrades,
                baseX: d.baseX, baseY: d.baseY, bestWave: d.bestWave, enemiesKilled: d.enemiesKilled }
            });
          }
        });
        
        if (d.hp <= 0 && userToPvpMatch[username]) { endPvpMatch(username, 'death'); return; }
        if (d.hp <= 0 && userToGroup[username] && groups[userToGroup[username]]) {
          const groupId = userToGroup[username];
          groups[groupId].members.forEach(m => {
            if (db.users[m]) {
              db.users[m].data.hp = db.users[m].data.maxHp; // respawn SEM resetar a onda
            }
          });
          groups[groupId].enemies = [];
          groups[groupId].wave = 1; groups[groupId].waveTimer = 60; groups[groupId].resetAt = Date.now();
          saveDB();
          groups[groupId].members.forEach(m => sendTo(m, { type: 'group_death_reset' }));
        }
      }
      
      if (msg.type === 'friend_request' && username) {
        const to = msg.to;
        if (!db.users[to] || to === username) return;
        if (!friendRequests[to]) friendRequests[to] = [];
        if (!friendRequests[to].find(r => r.from === username)) {
          friendRequests[to].push({ from: username, timestamp: Date.now() });
          sendTo(to, { type: 'friend_request_incoming', from: username });
          sendTo(username, { type: 'notice', text: `Solicitação enviada para ${to}!` });
        }
      }
      
      if (msg.type === 'friend_accept' && username) {
        const from = msg.from;
        if (!friendRequests[username]) return;
        const idx = friendRequests[username].findIndex(r => r.from === from);
        if (idx === -1) return;
        friendRequests[username].splice(idx, 1);
        if (!db.users[username].data.friends) db.users[username].data.friends = [];
        if (!db.users[from].data.friends) db.users[from].data.friends = [];
        if (!db.users[username].data.friends.includes(from)) db.users[username].data.friends.push(from);
        if (!db.users[from].data.friends.includes(username)) db.users[from].data.friends.push(username);
        saveDB();
        sendTo(username, { type: 'friends_update', friends: db.users[username].data.friends });
        sendTo(from, { type: 'friends_update', friends: db.users[from].data.friends });
      }
      
      if (msg.type === 'friend_remove' && username) {
        const target = msg.target;
        const myFriends = db.users[username].data.friends || [];
        const targetFriends = db.users[target]?.data.friends || [];
        db.users[username].data.friends = myFriends.filter(f => f !== target);
        if (db.users[target]) {
          db.users[target].data.friends = targetFriends.filter(f => f !== username);
          sendTo(target, { type: 'friends_update', friends: db.users[target].data.friends });
        }
        saveDB();
        sendTo(username, { type: 'friends_update', friends: db.users[username].data.friends });
      }
      
      if (msg.type === 'group_invite' && username) {
        const to = msg.to;
        if (userToGroup[username]) { sendTo(username, { type: 'notice', text: 'Você já está em grupo!' }); return; }
        if (userToGroup[to]) { sendTo(username, { type: 'notice', text: `${to} já está em grupo!` }); return; }
        if (!clients[to]) { sendTo(username, { type: 'notice', text: `${to} não está online!` }); return; }
        sendTo(to, { type: 'group_invite_incoming', from: username });
        sendTo(username, { type: 'notice', text: `Convite enviado para ${to}!` });
      }
      
      if (msg.type === 'group_accept' && username) {
        const from = msg.from;
        if (userToGroup[username] || userToGroup[from]) return;
        if (!clients[from]) return;
        createGroup(from, username);
      }
      
      if (msg.type === 'group_leave' && username) {
        leaveGroup(username);
      }
      
      if (msg.type === 'group_enemies_sync' && username) {
        const groupId = userToGroup[username];
        if (!groupId || !groups[groupId]) return;
        groups[groupId].enemies = msg.enemies;
        if (!groups[groupId].resetAt || Date.now() - groups[groupId].resetAt > 3000) {
          groups[groupId].wave = msg.wave;
          groups[groupId].waveTimer = msg.waveTimer;
        }
        const partner = groups[groupId].members.find(m => m !== username);
        if (partner) sendTo(partner, { type: 'group_enemies_sync', enemies: msg.enemies, wave: groups[groupId].wave, waveTimer: groups[groupId].waveTimer });
      }
      
    } catch (e) { console.log('Erro:', e); }
  });
  
  ws.on('close', () => {
    if (username) {
      delete clients[username];
      leaveGroup(username);
      leavePvpCleanup(username);
      Object.keys(clients).forEach(u => sendTo(u, { type: 'player_leave', username }));
    }
  });
});

// ========== 🎉 SISTEMA DE EVENTOS (GM) ==========
const EVENT_REWARDS = [2.00, 1.50, 1.00, 0.50, 0.25]; // 1º ao 5º lugar
let activeEvent = null;
let eventTimer = null;
// Restaura evento ativo se o servidor reiniciar no meio
if (db.activeEvent && db.activeEvent.endAt > Date.now()) {
  activeEvent = db.activeEvent;
  const remaining = activeEvent.endAt - Date.now();
  eventTimer = setTimeout(finalizeEvent, remaining);
  console.log(`🎉 Evento restaurado: ${activeEvent.type} | faltam ${Math.round(remaining/60000)}min`);
}
function startEvent(type, hours) {
  const snapshot = {};
  for (const u of Object.keys(db.users)) {
    snapshot[u] = { kills: db.users[u].data.enemiesKilled || 0, wave: db.users[u].data.bestWave || 1 };
  }
  activeEvent = { id: Date.now(), type, hours, startAt: Date.now(), endAt: Date.now() + hours*3600*1000, snapshot };
  db.activeEvent = activeEvent; saveDB();
  if (eventTimer) clearTimeout(eventTimer);
  eventTimer = setTimeout(finalizeEvent, hours*3600*1000);
  broadcast({ type: 'notice', text: `🎉 EVENTO DE ${type==='kills'?'KILLS':'ONDA'} INICIADO! Duração: ${hours}h. Top 5 ganham R$!` });
}
function getEventRanking() {
  if (!activeEvent) return [];
  const results = [];
  for (const u of Object.keys(db.users)) {
    const snap = activeEvent.snapshot[u] || { kills: 0, wave: 1 };
    const cur = db.users[u].data;
    const progress = activeEvent.type === 'kills'
      ? Math.max(0, (cur.enemiesKilled||0) - snap.kills)
      : Math.max(0, (cur.bestWave||1) - snap.wave);
    results.push({ username: u, progress, isGM: cur.isGM || false });
  }
  results.sort((a,b) => b.progress - a.progress);
  return results.slice(0, 10);
}
function finalizeEvent() {
  if (!activeEvent) return;
  const ev = activeEvent;
  const top5 = getEventRanking().slice(0,5);
  top5.forEach((r, i) => {
    const reward = EVENT_REWARDS[i] || 0;
    if (reward > 0 && db.users[r.username] && r.progress > 0) {
      db.users[r.username].data.coins += reward;
      sendTo(r.username, { type: 'coins_sync', coins: db.users[r.username].data.coins });
      sendTo(r.username, { type: 'notice', text: `🏆 ${i+1}º lugar no Evento de ${ev.type==='kills'?'Kills':'Onda'}! +R$${reward.toFixed(2)}` });
    }
  });
  const report = {
    id: ev.id, type: ev.type, hours: ev.hours, startAt: ev.startAt, endAt: Date.now(),
    winners: top5.map((r,i) => ({ username: r.username, place: i+1, progress: r.progress, reward: r.progress>0 ? (EVENT_REWARDS[i]||0) : 0 }))
  };
  if (!db.eventHistory) db.eventHistory = [];
  db.eventHistory.unshift(report);
  if (db.eventHistory.length > 50) db.eventHistory.length = 50;
  db.activeEvent = null; saveDB();
  broadcast({ type: 'notice', text: `🏁 Evento de ${ev.type==='kills'?'Kills':'Onda'} finalizado! Vencedor: ${top5[0] && top5[0].progress>0 ? top5[0].username : 'Ninguém'}` });
  activeEvent = null; eventTimer = null;
}
// 🎉 GM inicia evento
app.post('/gm/event/start', (req, res) => {
  const { from, type, hours } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  if (type !== 'kills' && type !== 'wave') return res.json({ success: false, error: 'Tipo inválido!' });
  const h = parseFloat(hours);
  if (isNaN(h) || h <= 0 || h > 168) return res.json({ success: false, error: 'Horas inválidas (0 a 168)!' });
  startEvent(type, h);
  return res.json({ success: true, message: `Evento de ${type==='kills'?'Kills':'Onda'} iniciado! ${h}h` });
});
// Status do evento (aberto)
app.get('/event/status', (req, res) => {
  res.json({ success: true,
    active: activeEvent ? { type: activeEvent.type, hours: activeEvent.hours, endAt: activeEvent.endAt, remainingMs: Math.max(0, activeEvent.endAt - Date.now()) } : null,
    ranking: getEventRanking() });
});
// Relatório de eventos (GM)
app.get('/gm/event/history', (req, res) => { res.json({ success: true, history: db.eventHistory || [] }); });

// ========== 🏅 CONQUISTAS (a cada 50 ondas, R$1,50, uma vez) ==========
const MILESTONE_REWARD = 1.50;
app.post('/achievements/claim', (req, res) => {
  const { username, milestone } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Usuário não encontrado!' });
  const ms = parseInt(milestone);
  if (isNaN(ms) || ms <= 0 || ms % 50 !== 0) return res.json({ success: false, error: 'Marco inválido (múltiplo de 50)!' });
  if ((user.data.bestWave || 1) < ms) return res.json({ success: false, error: `Chegue à onda ${ms}!` });
  if (!user.data.claimedMilestones) user.data.claimedMilestones = [];
  if (user.data.claimedMilestones.includes(ms)) return res.json({ success: false, error: 'Já resgatado!' });
  user.data.claimedMilestones.push(ms);
  user.data.coins += MILESTONE_REWARD;
  saveDB();
  sendTo(username, { type: 'coins_sync', coins: user.data.coins });
  return res.json({ success: true, message: `🏅 Conquista Onda ${ms}! +R$${MILESTONE_REWARD.toFixed(2)}`, coins: user.data.coins });
});
app.get('/achievements', (req, res) => {
  const user = db.users[req.query.username];
  if (!user) return res.json({ success: false, error: 'Não encontrado!' });
  res.json({ success: true, bestWave: user.data.bestWave || 1, claimedMilestones: user.data.claimedMilestones || [] });
});

// ========== 🎭 SISTEMA DE CLASSES ==========
const CLASSES = {
  atirador:   { name: 'Atirador',   cooldownMs: 3*60*1000, buffMs: 300, desc: '+Ataque e Vel. de Ataque por 0.3s' },
  engenheiro: { name: 'Engenheiro', cooldownMs: 2*60*1000, buffMs: 500, desc: 'Cura 12% da vida total por 0.5s' },
  escudeiro:  { name: 'Escudeiro',  cooldownMs: 5*60*1000, buffMs: 900, desc: 'Defesa impenetrável por 0.9s' }
};
app.post('/class/choose', (req, res) => {
  const { username, cls } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Usuário não encontrado!' });
  if (user.data.playerClass) return res.json({ success: false, error: 'Classe já escolhida!' });
  if (!CLASSES[cls]) return res.json({ success: false, error: 'Classe inválida!' });
  user.data.playerClass = cls;
  saveDB();
  return res.json({ success: true, message: `Classe ${CLASSES[cls].name} escolhida!`, playerClass: cls });
});
app.post('/class/activate', (req, res) => {
  const { username } = req.body;
  const user = db.users[username];
  if (!user || !user.data.playerClass) return res.json({ success: false, error: 'Sem classe definida!' });
  const cls = CLASSES[user.data.playerClass];
  const now = Date.now();
  if (user.data.classCooldownUntil && now < user.data.classCooldownUntil) {
    return res.json({ success: false, error: 'Habilidade em recarga!', remainingMs: user.data.classCooldownUntil - now });
  }
  user.data.classCooldownUntil = now + cls.cooldownMs;
  saveDB();
  return res.json({ success: true, cls: user.data.playerClass, buffMs: cls.buffMs, cooldownMs: cls.cooldownMs });
});
// ========== 🛡️ SISTEMA DE ALIANÇAS ==========
app.post('/alliance/create', (req, res) => {
  const { username, name } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Usuário não encontrado!' });
  if (user.data.alliance) return res.json({ success: false, error: 'Você já está em uma aliança!' });
  const aname = String(name || '').trim().substring(0, 20);
  if (!aname) return res.json({ success: false, error: 'Nome inválido!' });
  if (db.alliances[aname]) return res.json({ success: false, error: 'Aliança já existe!' });
  db.alliances[aname] = { name: aname, leader: username, slots: 10, members: [username] };
  user.data.alliance = aname; user.data.allianceKills = 0;
  saveDB();
  return res.json({ success: true, message: `Aliança ${aname} criada!`, alliance: db.alliances[aname] });
});
app.post('/alliance/join', (req, res) => {
  const { username, name } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Usuário não encontrado!' });
  if (user.data.alliance) return res.json({ success: false, error: 'Você já está em uma aliança!' });
  const ally = db.alliances[name];
  if (!ally) return res.json({ success: false, error: 'Aliança não encontrada!' });
  if (ally.members.length >= ally.slots) return res.json({ success: false, error: 'Aliança cheia! Peça ao líder para aumentar os slots.' });
  ally.members.push(username);
  user.data.alliance = name; user.data.allianceKills = 0;
  saveDB();
  return res.json({ success: true, message: `Entrou na aliança ${name}!`, alliance: ally });
});
app.post('/alliance/leave', (req, res) => {
  const { username } = req.body;
  const user = db.users[username];
  if (!user || !user.data.alliance) return res.json({ success: false, error: 'Você não está em uma aliança!' });
  const aname = user.data.alliance;
  const ally = db.alliances[aname];
  if (ally) {
    ally.members = ally.members.filter(m => m !== username);
    if (!ally.members.length) delete db.alliances[aname];
  }
  user.data.alliance = null; user.data.allianceKills = 0;
  saveDB();
  return res.json({ success: true, message: 'Saiu da aliança.' });
});
app.post('/alliance/upgradeslots', (req, res) => {
  const { username } = req.body;
  const user = db.users[username];
  if (!user || !user.data.alliance) return res.json({ success: false, error: 'Você não está em uma aliança!' });
  const ally = db.alliances[user.data.alliance];
  if (!ally) return res.json({ success: false, error: 'Aliança não encontrada!' });
  if (ally.leader !== username) return res.json({ success: false, error: 'Apenas o líder pode aumentar os slots!' });
  const cost = 5.00;
  if (user.data.coins < cost) return res.json({ success: false, error: 'Moedas insuficientes! (R$5,00 por 10 slots)' });
  user.data.coins -= cost;
  ally.slots += 10;
  saveDB();
  sendTo(username, { type: 'coins_sync', coins: user.data.coins });
  return res.json({ success: true, message: `Slots aumentados para ${ally.slots}!`, slots: ally.slots, coins: user.data.coins });
});
app.get('/alliance/ranking', (req, res) => {
  const ranking = Object.values(db.alliances || {}).map(a => {
    const totalKills = a.members.reduce((sum, m) => sum + (db.users[m]?.data.allianceKills || 0), 0);
    return { name: a.name, members: a.members.length, slots: a.slots, totalKills };
  }).sort((a, b) => b.totalKills - a.totalKills).slice(0, 20);
  res.json({ success: true, ranking });
});
app.get('/alliance/info', (req, res) => {
  const name = req.query.name;
  const ally = db.alliances?.[name];
  if (!ally) return res.json({ success: false, error: 'Aliança não encontrada!' });
  const members = ally.members.map(m => ({ username: m, allianceKills: db.users[m]?.data.allianceKills || 0, isLeader: m === ally.leader }));
  const totalKills = members.reduce((s, m) => s + m.allianceKills, 0);
  res.json({ success: true, alliance: { name: ally.name, leader: ally.leader, slots: ally.slots, members, totalKills } });
});
// ========== 👑 GM: REMOVER DINHEIRO ==========
app.post('/gm/takecoins', (req, res) => {
  const { from, target, amount } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  if (!db.users[target]) return res.json({ success: false, error: 'Jogador não encontrado!' });
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: 'Valor inválido!' });
  db.users[target].data.coins = Math.max(0, db.users[target].data.coins - amt);
  saveDB();
  sendTo(target, { type: 'coins_sync', coins: db.users[target].data.coins });
  sendTo(target, { type: 'notice', text: `👑 GM removeu R$${amt.toFixed(2)} da sua conta!` });
  return res.json({ success: true, message: `Removido R$${amt.toFixed(2)} de ${target}!` });
});
// ========== 📜 HISTÓRICO DE EVENTOS (aberto para todos os jogadores) ==========
app.get('/event/history', (req, res) => { res.json({ success: true, history: db.eventHistory || [] }); });

// ========== 🛡️ GUILDA: Líder expulsa e convida ==========
app.post('/alliance/kick', (req, res) => {
  const { from, target } = req.body;
  const user = db.users[from];
  if (!user || !user.data.alliance) return res.json({ success: false, error: 'Você não está em uma aliança!' });
  const ally = db.alliances[user.data.alliance];
  if (!ally) return res.json({ success: false, error: 'Aliança não encontrada!' });
  if (ally.leader !== from) return res.json({ success: false, error: 'Apenas o líder pode expulsar!' });
  if (!ally.members.includes(target)) return res.json({ success: false, error: 'Jogador não está na aliança!' });
  if (target === from) return res.json({ success: false, error: 'Não pode expulsar a si mesmo!' });
  ally.members = ally.members.filter(m => m !== target);
  if (db.users[target]) { db.users[target].data.alliance = null; db.users[target].data.allianceKills = 0; }
  saveDB();
  sendTo(target, { type: 'notice', text: `🚪 Você foi expulso da aliança ${ally.name}!` });
  return res.json({ success: true, message: `${target} expulso da aliança!` });
});
app.post('/alliance/invite', (req, res) => {
  const { from, target } = req.body;
  const user = db.users[from];
  if (!user || !user.data.alliance) return res.json({ success: false, error: 'Você não está em uma aliança!' });
  const ally = db.alliances[user.data.alliance];
  if (!ally) return res.json({ success: false, error: 'Aliança não encontrada!' });
  if (ally.leader !== from) return res.json({ success: false, error: 'Apenas o líder pode convidar!' });
  if (!db.users[target]) return res.json({ success: false, error: 'Jogador não encontrado!' });
  if (db.users[target].data.alliance) return res.json({ success: false, error: 'Jogador já está em uma aliança!' });
  db.pendingInvites[target] = ally.name;
  saveDB();
  sendTo(target, { type: 'notice', text: `🛡️ Convite da aliança ${ally.name}! Veja no menu Aliança.` });
  return res.json({ success: true, message: `Convite enviado para ${target}!` });
});
app.post('/alliance/acceptinvite', (req, res) => {
  const { username } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Usuário não encontrado!' });
  const allyName = db.pendingInvites[username];
  if (!allyName) return res.json({ success: false, error: 'Nenhum convite pendente!' });
  const ally = db.alliances[allyName];
  if (!ally) { delete db.pendingInvites[username]; return res.json({ success: false, error: 'Aliança não existe mais!' }); }
  if (ally.members.length >= ally.slots) return res.json({ success: false, error: 'Aliança cheia!' });
  ally.members.push(username);
  user.data.alliance = allyName; user.data.allianceKills = 0;
  delete db.pendingInvites[username];
  saveDB();
  return res.json({ success: true, message: `Entrou na aliança ${allyName}!`, alliance: ally });
});
app.get('/alliance/invites', (req, res) => { res.json({ success: true, invite: db.pendingInvites?.[req.query.username] || null }); });

// ========== 🎒 INVENTÁRIO / ITENS NO MAPA ==========
const WORLD_ITEM_TYPES = ['range','damage','targets','attackSpeed','defPercent','maxHp','coinGain','critFactor','multiShot','mines','regen','lifeSteal'];
const ITEM_CATEGORY = { range:'ataque', damage:'ataque', targets:'ataque', attackSpeed:'ataque', critFactor:'ataque', multiShot:'ataque', defPercent:'defesa', maxHp:'defesa', regen:'defesa', lifeSteal:'defesa', mines:'defesa', thorns:'defesa', orbs:'defesa', orbSpeed:'defesa', coinGain:'util', lightning:'util', missile:'util', bomb:'util', vortex:'util' };
const TRADE_TAX = { ataque: 0.50, defesa: 0.40, util: 0.30 };
function spawnWorldItem() {
  if (db.worldItems.length >= 8) return;
  const type = WORLD_ITEM_TYPES[Math.floor(Math.random() * WORLD_ITEM_TYPES.length)];
  db.worldItems.push({ id: Date.now()+'_'+Math.random().toString(36).substr(2,5), type, x: 2000+Math.random()*(MAP_WIDTH-4000), y: 2000+Math.random()*(MAP_HEIGHT-4000), spawnedAt: Date.now() });
  saveDB();
  broadcast({ type: 'notice', text: `🎁 Um upgrade apareceu no mapa! Encontre e colete!` });
}
setInterval(spawnWorldItem, 4*3600*1000);
if (!db.worldItems) db.worldItems = [];
if (!db.pendingInvites) db.pendingInvites = {};
if (db.worldItems.length === 0) setTimeout(spawnWorldItem, 5000);
app.get('/worlditems', (req, res) => { res.json({ success: true, items: db.worldItems || [] }); });
app.post('/worlditems/collect', (req, res) => {
  const { username, itemId } = req.body;
  // Coleta por clique: valida se o clique enviado está perto o suficiente do item (anti-cheat).
  // Compatibilidade: aceita clickX/clickY (novo) ou x/y (antigo).
  const clickX = req.body.clickX ?? req.body.x;
  const clickY = req.body.clickY ?? req.body.y;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Usuário não encontrado!' });
  const idx = db.worldItems.findIndex(i => i.id === itemId);
  if (idx === -1) return res.json({ success: false, error: 'Item já coletado!' });
  const item = db.worldItems[idx];
  if (clickX == null || clickY == null || Math.hypot(clickX - item.x, clickY - item.y) > 150) {
    return res.json({ success: false, error: 'Clique muito longe do item! Clique em cima do presente 🎁' });
  }
  if (!user.data.inventorySlots) user.data.inventorySlots = 10;
  if ((user.data.inventory || []).length >= user.data.inventorySlots) { return res.json({ success: false, error: 'Inventário cheio (' + user.data.inventorySlots + ' slots)! Expanda no menu Inventário.' }); }
  db.worldItems.splice(idx, 1);
  user.data.inventory.push(item.type);
  saveDB();
  broadcast({ type: 'notice', text: `🎒 ${username} coletou um upgrade ${item.type}!` });
  return res.json({ success: true, message: `Coletado: ${item.type}!`, inventory: user.data.inventory });
});
app.post('/gm/worlditems/spawn', (req, res) => {
  const { from } = req.body;
  if (!db.users[from] || !db.users[from].data.isGM) return res.json({ success: false, error: 'Apenas GM!' });
  if (db.worldItems.length >= 20) return res.json({ success: false, error: 'Máximo de itens!' });
  const type = WORLD_ITEM_TYPES[Math.floor(Math.random()*WORLD_ITEM_TYPES.length)];
  db.worldItems.push({ id: 'gm_'+Date.now(), type, x: 2000+Math.random()*(MAP_WIDTH-4000), y: 2000+Math.random()*(MAP_HEIGHT-4000), spawnedAt: Date.now() });
  saveDB();
  broadcast({ type: 'notice', text: `🎁 GM spawnou um upgrade no mapa!` });
  return res.json({ success: true, message: `Item ${type} criado!` });
});
app.get('/inventory', (req, res) => {
  const user = db.users[req.query.username];
  if (!user) return res.json({ success: false, error: 'Não encontrado!' });
  if (!user.data.inventorySlots) user.data.inventorySlots = 10;
  res.json({ success: true, inventory: user.data.inventory || [], inventorySlots: user.data.inventorySlots });
});
app.post('/inventory/expand', (req, res) => {
  const { username } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Não encontrado!' });
  if (!user.data.inventorySlots) user.data.inventorySlots = 10;
  if ((user.data.coins || 0) < 1.00) return res.json({ success: false, error: 'Moedas insuficientes (R$1,00)!' });
  user.data.coins -= 1.00;
  user.data.inventorySlots += 10;
  saveDB();
  return res.json({ success: true, inventorySlots: user.data.inventorySlots, coins: user.data.coins });
});
// Recalcula o valor de um upgrade a partir do nível (mesma fórmula do cliente)
function recomputeUpgradeVal(key, upg) {
  switch (key) {
    case 'range': upg.val = 120 + upg.lvl * 35; break;
    case 'damage': upg.val = 1.0 + upg.lvl * 0.6; break;
    case 'targets': upg.val = 1 + upg.lvl; break;
    case 'attackSpeed': upg.val = upg.lvl * 15; break;
    case 'defPercent': upg.val = Math.min(90, upg.lvl * 3); break;
    case 'maxHp': upg.val = upg.lvl * 15; break;
    case 'coinGain': upg.val = upg.lvl * 10; break;
    case 'critFactor': upg.val = 1.5 + upg.lvl * 0.15; break;
    case 'multiShot': upg.val = Math.min(80, upg.lvl * 2); break;
    case 'mines': upg.val = upg.lvl; break;
    case 'regen': upg.val = upg.lvl * 0.8; break;
    case 'lifeSteal': upg.val = Math.min(50, upg.lvl * 0.5); break;
    case 'thorns': upg.val = upg.lvl * 8; break;
    case 'orbs': upg.val = Math.min(4, upg.lvl); break;
    case 'orbSpeed': upg.val = Math.min(2.0, 0.3 + upg.lvl * 0.425); break;
    case 'lightning': upg.val = upg.lvl; break;
    case 'missile': upg.val = upg.lvl; break;
    case 'bomb': upg.val = upg.lvl; break;
    case 'vortex': upg.val = upg.lvl; break;
  }
}
app.post('/inventory/use', (req, res) => {
  const { username, itemType } = req.body;
  const user = db.users[username];
  if (!user) return res.json({ success: false, error: 'Não encontrado!' });
  const inv = user.data.inventory || [];
  const idx = inv.indexOf(itemType);
  if (idx === -1) return res.json({ success: false, error: 'Item não está no inventário!' });
  if (!DEFAULT_UPGRADES[itemType]) return res.json({ success: false, error: 'Tipo inválido!' });
  inv.splice(idx, 1);
  const upg = user.data.upgrades[itemType];
  upg.lvl += 1;
  recomputeUpgradeVal(itemType, upg);
  if (itemType === 'maxHp') {
    user.data.maxHp = 100 + upg.val;
    user.data.hp = Math.min((user.data.hp || 0) + 15, user.data.maxHp);
  }
  saveDB();
  sendTo(username, { type: 'upgrades_sync', upgrades: user.data.upgrades, maxHp: user.data.maxHp, hp: user.data.hp });
  return res.json({ success: true, message: `Upgrade ${itemType} +1 aplicado!`, inventory: inv });
});
app.post('/inventory/trade', (req, res) => {
  const { from, target, itemType } = req.body;
  const uFrom = db.users[from], uTo = db.users[target];
  if (!uFrom || !uTo) return res.json({ success: false, error: 'Usuário não encontrado!' });
  const inv = uFrom.data.inventory || [];
  const idx = inv.indexOf(itemType);
  if (idx === -1) return res.json({ success: false, error: 'Item não está no inventário!' });
  const tax = TRADE_TAX[ITEM_CATEGORY[itemType] || 'util'];
  if (uFrom.data.coins < tax) return res.json({ success: false, error: `Taxa: R$${tax.toFixed(2)}` });
  uFrom.data.coins -= tax;
  inv.splice(idx, 1);
  if (!uTo.data.inventory) uTo.data.inventory = [];
  uTo.data.inventory.push(itemType);
  saveDB();
  sendTo(from, { type: 'coins_sync', coins: uFrom.data.coins });
  sendTo(target, { type: 'notice', text: `🎒 ${from} enviou um upgrade ${itemType} para você!` });
  return res.json({ success: true, message: `Enviado! Taxa: R$${tax.toFixed(2)}`, inventory: inv });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando | Mapa: ${MAP_WIDTH}x${MAP_HEIGHT} | Porta: ${PORT}`);
  console.log(`👑 GM: ${GM_ACCOUNT} / ${GM_PASSWORD}`);
  console.log(`💰 Sistema: Dinheiro individual + Ganhos iguais em grupo`);
});
