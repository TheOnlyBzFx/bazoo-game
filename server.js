// =====================================================================
//  Arena Piazza Leonardo — server di gioco (Node.js + WebSocket)
//  - serve la pagina del gioco (cartella public/)
//  - gestisce le partite 1v1: codice partita, fasi, orologio ed elisir
//  Il server è l'arbitro: decide il tempo e calcola l'elisir di tutti e due.
// =====================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// Regole (ispirate a Clash Royale). Vengono mandate anche al client.
const CFG = {
  W: 18, H: 32,
  ELIXIR_START: 5,
  ELIXIR_MAX: 10,
  ELIXIR_MS: 2800,          // 1 elisir ogni 2,8 s (x1)
  REG_MS: 180000,           // 3:00
  X2_AT: 120000,            // ultimo minuto: x2
  OT_MS: 120000,            // supplementare 2:00
  OT_X3_AT: 60000,          // ultimo minuto di supplementare: x3
  COUNTDOWN_MS: 3000,
  KING_HP: 4824,
  PRINCESS_HP: 3052
};
const TICK_MS = 100;                 // 10 aggiornamenti al secondo
const ROOM_IDLE_MS = 10 * 60 * 1000; // stanza vuota/inattiva: eliminata dopo 10 min
const ROLES = ['host', 'guest'];

// ---------------------------------------------------------------------
//  File statici
// ---------------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Non trovato'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------
//  Partite
// ---------------------------------------------------------------------
const rooms = new Map(); // code -> room

function newCode() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (;;) {
    let s = ''; for (let i = 0; i < 5; i++) s += A[crypto.randomInt(A.length)];
    if (!rooms.has(s)) return s;
  }
}
const newToken = () => crypto.randomBytes(12).toString('hex');
const cleanNick = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Giocatore';

// "millisecondi equivalenti x1" prodotti da 0 a clk (lineare a tratti)
function elixirProd(c) {
  c = Math.max(0, c);
  const a = CFG.X2_AT, b = CFG.REG_MS + CFG.OT_X3_AT;
  if (c <= a) return c;
  if (c <= b) return a + 2 * (c - a);
  return a + 2 * (b - a) + 3 * (c - b);
}

function makeRoom() {
  const room = { code: newCode(), slots: [null, null], phase: 'wait', start: null, crowns: [0, 0], rematch: [false, false], lastActive: Date.now() };
  rooms.set(room.code, room);
  return room;
}
function clockOf(room) { return room.start === null ? 0 : Date.now() - room.start; }

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function sendRoomInfo(room) {
  const players = room.slots.map((p, i) => p ? { role: ROLES[i], nick: p.nick, online: !!p.ws } : null);
  room.slots.forEach((p, i) => p && send(p.ws, { t: 'room', code: room.code, ph: room.phase, role: ROLES[i], players }));
}
function sendState(room) {
  const clk = clockOf(room);
  room.slots.forEach((p, i) => {
    if (!p) return;
    const op = room.slots[1 - i];
    send(p.ws, { t: 'st', ph: room.phase, clk, ex: Math.round(p.ex * 1000) / 1000, cr: room.crowns, opOn: !!(op && op.ws) });
  });
}

function resetMatch(room) {
  room.crowns = [0, 0];
  room.rematch = [false, false];
  room.slots.forEach(p => { if (p) { p.ex = CFG.ELIXIR_START; p.lastClk = 0; } });
}
function startCountdown(room) {
  resetMatch(room);
  room.phase = 'count';
  room.start = Date.now() + CFG.COUNTDOWN_MS;
  sendRoomInfo(room); sendState(room);
}
function endMatch(room, reason) {
  room.phase = 'end';
  room.slots.forEach((p, i) => p && send(p.ws, { t: 'end', cr: room.crowns, reason: reason || 'tempo' }));
  sendState(room);
}
function bothOnline(room) { return room.slots.every(p => p && p.ws); }

function tickRoom(room) {
  if (room.phase === 'wait' && bothOnline(room)) return startCountdown(room);
  if (room.phase === 'count') {
    if (!bothOnline(room)) { room.phase = 'wait'; room.start = null; sendRoomInfo(room); return; }
    if (clockOf(room) >= 0) { room.phase = 'battle'; sendRoomInfo(room); }
  }
  if (room.phase === 'battle') {
    const clk = clockOf(room);
    for (const p of room.slots) {
      if (!p) continue;
      p.ex = Math.min(CFG.ELIXIR_MAX, p.ex + (elixirProd(clk) - elixirProd(p.lastClk)) / CFG.ELIXIR_MS);
      p.lastClk = clk;
    }
    const tie = room.crowns[0] === room.crowns[1];
    if ((clk >= CFG.REG_MS && !tie) || clk >= CFG.REG_MS + CFG.OT_MS) return endMatch(room, 'tempo');
  }
  if (room.phase === 'count' || room.phase === 'battle') sendState(room);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anyOnline = room.slots.some(p => p && p.ws);
    if (anyOnline) room.lastActive = now;
    else if (now - room.lastActive > ROOM_IDLE_MS) { rooms.delete(room.code); continue; }
    tickRoom(room);
  }
}, TICK_MS);

// ---------------------------------------------------------------------
//  WebSocket
// ---------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.ctx = null; // { room, slot }
  send(ws, { t: 'hello', cfg: CFG });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const ctx = ws.ctx;

    switch (m.t) {
      case 'ping': return send(ws, { t: 'pong', c: m.c });

      case 'create': {
        detach(ws);
        const room = makeRoom();
        attach(ws, room, 0, cleanNick(m.nick), newToken());
        return;
      }
      case 'join': {
        const code = String(m.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const room = rooms.get(code);
        if (!room) return send(ws, { t: 'error', code: 'notfound', msg: 'Partita non trovata. Controlla il codice o creane una nuova.' });
        detach(ws);
        // rientro con lo stesso posto (ricarica pagina / connessione persa)
        const back = room.slots.findIndex(p => p && m.token && p.token === m.token);
        if (back >= 0) { attach(ws, room, back, cleanNick(m.nick) || room.slots[back].nick, m.token); return; }
        const free = room.slots.findIndex(p => p === null);
        if (free < 0) return send(ws, { t: 'error', code: 'full', msg: 'Questa partita è già piena.' });
        attach(ws, room, free, cleanNick(m.nick), newToken());
        return;
      }
      case 'emote': {
        if (!ctx) return;
        const i = m.i | 0; if (i < 0 || i > 20) return;
        const now = Date.now(); const p = ctx.room.slots[ctx.slot];
        if (p.lastEmote && now - p.lastEmote < 800) return; // anti-spam
        p.lastEmote = now;
        ctx.room.slots.forEach(q => q && send(q.ws, { t: 'emote', role: ROLES[ctx.slot], i }));
        return;
      }
      case 'rematch': {
        if (!ctx || ctx.room.phase !== 'end') return;
        ctx.room.rematch[ctx.slot] = true;
        if (ctx.room.rematch[0] && ctx.room.rematch[1] && bothOnline(ctx.room)) startCountdown(ctx.room);
        else ctx.room.slots.forEach(q => q && send(q.ws, { t: 'rematch', who: ROLES[ctx.slot] }));
        return;
      }
      case 'leave': {
        if (!ctx) return;
        const room = ctx.room, slot = ctx.slot;
        ws.ctx = null;
        // abbandono durante la battaglia = vittoria dell'altro
        if (room.phase === 'battle' || room.phase === 'count') {
          room.crowns[1 - slot] = 3;
          room.slots[slot] = null;
          endMatch(room, 'abbandono');
        } else {
          room.slots[slot] = null;
          if (room.phase === 'end') room.phase = 'wait';
        }
        if (room.slots.every(p => p === null)) rooms.delete(room.code); else sendRoomInfo(room);
        return;
      }
    }
  });

  ws.on('close', () => detach(ws));
});

function attach(ws, room, slot, nick, token) {
  const prev = room.slots[slot];
  if (prev && prev.ws && prev.ws !== ws) { prev.ws.ctx = null; send(prev.ws, { t: 'error', code: 'replaced', msg: 'Sei entrato da un\'altra finestra.' }); }
  const p = prev || { ex: CFG.ELIXIR_START, lastClk: 0 };
  p.nick = nick; p.token = token; p.ws = ws;
  room.slots[slot] = p;
  ws.ctx = { room, slot };
  room.lastActive = Date.now();
  send(ws, { t: 'joined', code: room.code, role: ROLES[slot], token });
  sendRoomInfo(room);
  if (room.phase === 'count' || room.phase === 'battle') sendState(room);
  if (room.phase === 'end') send(ws, { t: 'end', cr: room.crowns, reason: 'tempo' });
}
// connessione persa: il posto resta riservato (si può rientrare con il token)
function detach(ws) {
  const ctx = ws.ctx; if (!ctx) return;
  ws.ctx = null;
  const p = ctx.room.slots[ctx.slot];
  if (p && p.ws === ws) p.ws = null;
  sendRoomInfo(ctx.room);
}

// keepalive: chiude le connessioni morte
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  }
}, 15000);

server.listen(PORT, () => console.log(`Arena Piazza Leonardo in ascolto su http://localhost:${PORT}`));
