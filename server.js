// =====================================================================
//  Bazoo Game — server di gioco (Node.js + WebSocket)
//  - serve la pagina del gioco (cartella public/)
//  - gestisce le partite 1v1: codice partita, fasi, mazzi
//  - fa girare la battaglia (public/sim.js): è l'arbitro, i client
//    mandano solo "gioco questa carta qui" e ricevono lo stato.
// =====================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const SIM = require('./public/sim.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const CFG = SIM.CFG;

const TICK_MS = 50;                  // 20 passi di simulazione al secondo
const SEND_EVERY = 2;                // stato ai client 10 volte al secondo
const ROOM_IDLE_MS = 10 * 60 * 1000; // stanza inattiva: eliminata dopo 10 min
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

function makeRoom() {
  const room = { code: newCode(), slots: [null, null], phase: 'wait', start: null, sim: null, ticks: 0,
    crowns: [0, 0], rematch: [false, false], lastActive: Date.now(), result: null };
  rooms.set(room.code, room);
  return room;
}

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function sendRoomInfo(room) {
  const players = room.slots.map((p, i) => p ? { role: ROLES[i], nick: p.nick, online: !!p.ws } : null);
  room.slots.forEach((p, i) => p && send(p.ws, { t: 'room', code: room.code, ph: room.phase, role: ROLES[i], players }));
}
function clockOf(room) {
  if (room.phase === 'battle' || room.phase === 'end') return room.sim ? Math.round(room.sim.t * 1000) : 0;
  if (room.phase === 'count' && room.start) return Date.now() - room.start;
  return 0;
}
function sendState(room, events) {
  const clk = clockOf(room);
  room.slots.forEach((p, i) => {
    if (!p || !p.ws) return;
    const op = room.slots[1 - i];
    const msg = { t: 'st', ph: room.phase, clk, opOn: !!(op && op.ws) };
    if (room.sim) Object.assign(msg, room.sim.snapshot(i));
    if (events && events.length) msg.ev = events;
    send(p.ws, msg);
  });
}

function startCountdown(room) {
  room.rematch = [false, false];
  room.result = null;
  room.sim = new SIM.Sim({ decks: [room.slots[0].deck, room.slots[1].deck] });
  room.crowns = [0, 0];
  room.phase = 'count';
  room.start = Date.now() + CFG.COUNTDOWN_MS;
  room.ticks = 0;
  sendRoomInfo(room); sendState(room);
}
function endMatch(room, winner, reason) {
  room.phase = 'end';
  if (room.sim) room.crowns = room.sim.crowns.slice();
  room.result = { cr: room.crowns.slice(), winner, reason };
  sendState(room, room.sim ? room.sim.flushEvents() : []);
  room.slots.forEach(p => p && send(p.ws, { t: 'end', cr: room.crowns, winner, reason }));
}
function bothOnline(room) { return room.slots.every(p => p && p.ws); }

function tickRoom(room) {
  if (room.phase === 'wait' && bothOnline(room)) return startCountdown(room);
  if (room.phase === 'count') {
    if (!bothOnline(room)) { room.phase = 'wait'; room.start = null; room.sim = null; sendRoomInfo(room); return; }
    if (Date.now() >= room.start) { room.phase = 'battle'; sendRoomInfo(room); }
    else if (++room.ticks % SEND_EVERY === 0) sendState(room);
    return;
  }
  if (room.phase === 'battle') {
    // passi fissi agganciati al tempo reale (recupera se il server rallenta)
    const target = Math.floor((Date.now() - room.start) / TICK_MS);
    let steps = 0;
    while (room.sim.t * 1000 / TICK_MS < target && steps < 10 && !room.sim.ended) { room.sim.step(TICK_MS / 1000); steps++; }
    if (room.sim.ended) return endMatch(room, room.sim.ended.winner, room.sim.ended.reason);
    if (++room.ticks % SEND_EVERY === 0) sendState(room, room.sim.flushEvents());
  }
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anyOnline = room.slots.some(p => p && p.ws);
    if (anyOnline) room.lastActive = now;
    else if (now - room.lastActive > ROOM_IDLE_MS) { rooms.delete(room.code); continue; }
    try { tickRoom(room); } catch (e) { console.error('Errore nella stanza', room.code, e); }
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
        attach(ws, room, 0, cleanNick(m.nick), newToken(), m.deck);
        return;
      }
      case 'join': {
        const code = String(m.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const room = rooms.get(code);
        if (!room) return send(ws, { t: 'error', code: 'notfound', msg: 'Partita non trovata. Controlla il codice o creane una nuova.' });
        detach(ws);
        const back = room.slots.findIndex(p => p && m.token && p.token === m.token);
        if (back >= 0) { attach(ws, room, back, cleanNick(m.nick) || room.slots[back].nick, m.token, m.deck); return; }
        const free = room.slots.findIndex(p => p === null);
        if (free < 0) return send(ws, { t: 'error', code: 'full', msg: 'Questa partita è già piena.' });
        attach(ws, room, free, cleanNick(m.nick), newToken(), m.deck);
        return;
      }
      case 'deck': {
        if (!ctx) return;
        const p = ctx.room.slots[ctx.slot];
        p.deck = SIM.validDeck(m.deck);
        return;
      }
      case 'play': {
        if (!ctx || ctx.room.phase !== 'battle' || !ctx.room.sim) return;
        const r = ctx.room.sim.play(ctx.slot, m.i, m.x, m.y, m.card);
        if (!r.ok) send(ws, { t: 'nope', err: r.err, i: m.i });
        return;
      }
      case 'ability': {
        if (!ctx || ctx.room.phase !== 'battle' || !ctx.room.sim) return;
        const r = ctx.room.sim.ability(ctx.slot);
        if (!r.ok) send(ws, { t: 'nope', err: r.err });
        return;
      }
      case 'emote': {
        if (!ctx) return;
        const i = m.i | 0; if (i < 0 || i > 20) return;
        const now = Date.now(); const p = ctx.room.slots[ctx.slot];
        if (p.lastEmote && now - p.lastEmote < 800) return;
        p.lastEmote = now;
        ctx.room.slots.forEach(q => q && send(q.ws, { t: 'emote', role: ROLES[ctx.slot], i }));
        return;
      }
      case 'rematch': {
        if (!ctx || ctx.room.phase !== 'end') return;
        if (Array.isArray(m.deck)) ctx.room.slots[ctx.slot].deck = SIM.validDeck(m.deck);
        ctx.room.rematch[ctx.slot] = true;
        if (ctx.room.rematch[0] && ctx.room.rematch[1] && bothOnline(ctx.room)) startCountdown(ctx.room);
        else ctx.room.slots.forEach(q => q && send(q.ws, { t: 'rematch', who: ROLES[ctx.slot] }));
        return;
      }
      case 'leave': {
        if (!ctx) return;
        const room = ctx.room, slot = ctx.slot;
        ws.ctx = null;
        if (room.phase === 'battle' || room.phase === 'count') {
          if (room.sim) room.sim.crowns[1 - slot] = 3;
          room.crowns[1 - slot] = 3;
          room.slots[slot] = null;
          endMatch(room, 1 - slot, 'abbandono');
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

function attach(ws, room, slot, nick, token, deck) {
  const prev = room.slots[slot];
  if (prev && prev.ws && prev.ws !== ws) { prev.ws.ctx = null; send(prev.ws, { t: 'error', code: 'replaced', msg: 'Sei entrato da un\'altra finestra.' }); }
  const p = prev || {};
  p.nick = nick; p.token = token; p.ws = ws;
  if (deck || !p.deck) p.deck = SIM.validDeck(deck);
  room.slots[slot] = p;
  ws.ctx = { room, slot };
  room.lastActive = Date.now();
  send(ws, { t: 'joined', code: room.code, role: ROLES[slot], token });
  sendRoomInfo(room);
  if (room.phase === 'count' || room.phase === 'battle') sendState(room);
  if (room.phase === 'end' && room.result) send(ws, { t: 'end', ...room.result });
}
// connessione persa: il posto resta riservato (si può rientrare con il token)
function detach(ws) {
  const ctx = ws.ctx; if (!ctx) return;
  ws.ctx = null;
  const p = ctx.room.slots[ctx.slot];
  if (p && p.ws === ws) p.ws = null;
  sendRoomInfo(ctx.room);
}

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  }
}, 15000);

server.listen(PORT, () => console.log(`Bazoo Game in ascolto su http://localhost:${PORT}`));
