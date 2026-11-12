// =====================================================================
//  Bazoo Game — motore di battaglia
//  Lo stesso file gira sul server (Node.js, arbitro delle partite online)
//  e nel browser (allenamento contro il bot).
//  Coordinate in caselle: x 0..18 (sinistra→destra), y 0..32.
//  La squadra 0 (host) ha il re in basso (y=3), la squadra 1 in alto (y=29).
// =====================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BazooSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const CFG = {
  W: 18, H: 32,
  RIVER_Y0: 15, RIVER_Y1: 17,
  BRIDGES: [{ x0: 2, x1: 5, cx: 3.5 }, { x0: 13, x1: 16, cx: 14.5 }],
  ELIXIR_START: 5, ELIXIR_MAX: 10, ELIXIR_MS: 2800,
  REG_MS: 180000, X2_AT: 120000, OT_MS: 120000, OT_X3_AT: 60000,
  COUNTDOWN_MS: 3000,
  KING_HP: 4824, PRINCESS_HP: 3052,
  TICK: 0.05,          // passo di simulazione (20 al secondo)
  SIGHT: 5.5,          // raggio di vista delle truppe (caselle)
  POCKET_Y: 22         // dopo aver abbattuto una torretta si può schierare fino a qui
};

// velocità in caselle al secondo (come Clash Royale: 45/60/90/120 caselle al minuto)
const SPEED = { lenta: 0.75, media: 1.0, rapida: 1.5, molto_rapida: 2.0 };
const SPEED_LABEL = { lenta: 'Lenta', media: 'Media', rapida: 'Rapida', molto_rapida: 'Molto rapida' };
// portata della mischia
const MELEE = { corta: 0.8, media: 1.2, lunga: 1.6 };
// taglia: raggio di ingombro (caselle), massa (chi spinge chi), altezza dell'omino
const SIZE = {
  S: { r: 0.3, m: 1, h: 0.8 },
  M: { r: 0.45, m: 3, h: 1.0 },
  L: { r: 0.6, m: 6, h: 1.05 },
  XL: { r: 0.75, m: 18, h: 1.55 }
};
// velocità dei proiettili (caselle al secondo)
const PROJ_SPEED = { arrow: 14, spear: 12, ball: 11, fireball: 9, iceball: 9, firearrows: 10, cannonball: 10, bullet: 26 };

// Torri: valori di riferimento
const TOWER_STATS = {
  princess: { hp: 3052, dmg: 109, hit: 0.8, range: 7.5, r: 1.5 },
  king: { hp: 4824, dmg: 109, hit: 1.0, range: 7.0, r: 2.0 }
};
const TOWERS = [
  { id: 'hK', team: 0, kind: 'king', x: 9, y: 3 },
  { id: 'hL', team: 0, kind: 'princess', x: 3.5, y: 6.5 },
  { id: 'hR', team: 0, kind: 'princess', x: 14.5, y: 6.5 },
  { id: 'gK', team: 1, kind: 'king', x: 9, y: 29 },
  { id: 'gL', team: 1, kind: 'princess', x: 14.5, y: 25.5 },
  { id: 'gR', team: 1, kind: 'princess', x: 3.5, y: 25.5 }
];

// ---------------------------------------------------------------------
//  CARTE  (statistiche prese dagli screenshot e portate tutte al livello 11,
//  lo stesso delle torri: +10% per ogni livello in più, -10% per ogni livello in meno.
//  lvScreenshot = livello della carta nello screenshot; "ispirata" = solo riferimento)
//  targets: 'ground' (solo terra) | 'airground' (aria e terra) | 'buildings' (solo edifici)
// ---------------------------------------------------------------------
const CARDS = [
  { id: 'bazoo', lvScreenshot: 12, name: 'Bazoo', ispirata: 'Principe', rarity: 'epic', cost: 5, count: 1,
    hp: 1915, dmg: 390, chargeDmg: 781, hitSpeed: 1.4, speed: 'media', range: MELEE.lunga, rangeLabel: 'Mischia: lunga',
    targets: 'ground', size: 'L', weapon: 'lance', mount: 'horse', charge: true },
  { id: 'ale', lvScreenshot: 9, name: 'Ale Torre', ispirata: 'Goblin lancieri', rarity: 'common', cost: 2, count: 3,
    hp: 133, dmg: 81, hitSpeed: 1.6, speed: 'molto_rapida', range: 5, targets: 'airground', size: 'S',
    weapon: 'spear', proj: 'spear' },
  { id: 'bebe', lvScreenshot: 12, name: 'Bebe', ispirata: 'Sgherri', rarity: 'common', cost: 3, count: 3,
    hp: 229, dmg: 107, hitSpeed: 1.2, speed: 'rapida', range: 2.5, targets: 'airground', size: 'S',
    flying: true, weapon: 'claws', proj: 'ball' },
  { id: 'coto', lvScreenshot: 12, name: 'Coto', ispirata: "Cavaliere d'oro", rarity: 'champion', cost: 4, count: 1,
    hp: 1795, dmg: 168, hitSpeed: 0.9, speed: 'media', range: MELEE.media, rangeLabel: 'Mischia: media',
    targets: 'ground', size: 'M', weapon: 'sword', champion: true,
    ability: { name: 'Scatto', cost: 1, cooldown: 13, dmg: 310, range: 5.5, maxTargets: 10 } },
  { id: 'cheo', lvScreenshot: 8, name: 'Cheo', ispirata: 'Cacciatore', rarity: 'epic', cost: 4, count: 1,
    hp: 888, dmg: 84, pellets: 10, hitSpeed: 2.2, speed: 'media', range: 4, projRange: 6.5,
    targets: 'airground', size: 'M', weapon: 'shotgun' },
  { id: 'canne', lvScreenshot: 12, name: 'Canne', ispirata: 'Domatore di cinghiali', rarity: 'rare', cost: 4, count: 1,
    hp: 1694, dmg: 316, hitSpeed: 1.6, speed: 'molto_rapida', range: MELEE.corta, rangeLabel: 'Mischia: corta',
    targets: 'buildings', size: 'L', weapon: 'hammer', mount: 'pig', jump: true },
  { id: 'frankie', lvScreenshot: 9, name: 'Frankie', ispirata: 'Gigante', rarity: 'rare', cost: 5, count: 1,
    hp: 3976, dmg: 253, hitSpeed: 1.5, speed: 'lenta', range: MELEE.media, rangeLabel: 'Mischia: media',
    targets: 'buildings', size: 'XL', weapon: 'fists' },
  { id: 'mara', lvScreenshot: 12, name: 'Mara', ispirata: 'Principessa', rarity: 'legendary', cost: 3, count: 1,
    hp: 260, dmg: 168, hitSpeed: 3, speed: 'media', range: 9, targets: 'airground', size: 'M',
    weapon: 'bow', proj: 'firearrows', splash: 2.0, deployTime: 1.2 },
  { id: 'jack', lvScreenshot: 10, name: 'Jack Espo', ispirata: 'Stregone', rarity: 'rare', cost: 5, count: 1,
    hp: 756, dmg: 305, hitSpeed: 1.4, speed: 'media', range: 5.5, targets: 'airground', size: 'M',
    weapon: 'fire', proj: 'fireball', splash: 1.5 },
  { id: 'corvo', lvScreenshot: 9, name: 'Corvo', ispirata: 'Guardie', rarity: 'epic', cost: 3, count: 3,
    hp: 81, shield: 257, dmg: 117, hitSpeed: 1.0, speed: 'rapida', range: MELEE.lunga, rangeLabel: 'Mischia: lunga',
    targets: 'ground', size: 'S', weapon: 'spearshield' },
  { id: 'meme', lvScreenshot: 9, name: 'Meme', ispirata: 'Goblin', rarity: 'common', cost: 2, count: 4,
    hp: 202, dmg: 125, hitSpeed: 1.1, speed: 'molto_rapida', range: MELEE.corta, rangeLabel: 'Mischia: corta',
    targets: 'ground', size: 'S', weapon: 'dagger' },
  { id: 'paoluccio', lvScreenshot: 10, name: 'Paoluccio', ispirata: 'Stregone di ghiaccio', rarity: 'legendary', cost: 3, count: 1,
    hp: 689, dmg: 89, spawnDmg: 84, hitSpeed: 1.7, speed: 'media', range: 5.5, targets: 'airground', size: 'M',
    weapon: 'ice', proj: 'iceball', splash: 1.5, slow: 2.5 },
  { id: 'biondo', lvScreenshot: 10, name: 'Biondo', ispirata: 'Spaccamuro', rarity: 'epic', cost: 2, count: 2,
    hp: 330, dmg: 301, hitSpeed: 1, speed: 'molto_rapida', range: MELEE.corta, rangeLabel: 'Mischia: corta',
    targets: 'buildings', size: 'S', weapon: 'barrel', kamikaze: true, splash: 1.5 },
  { id: 'lucab', lvScreenshot: 10, name: 'LucaB', ispirata: 'Scintilla', rarity: 'legendary', cost: 6, count: 1,
    hp: 1453, dmg: 1332, hitSpeed: 4, speed: 'lenta', range: 5, targets: 'ground', size: 'XL',
    weapon: 'coil', machine: true, splash: 1.8, chargeUp: true },
  { id: 'pesco', lvScreenshot: 10, name: 'Pesco', ispirata: 'Barbari scelti', rarity: 'common', cost: 6, count: 2,
    hp: 1342, dmg: 384, hitSpeed: 1.4, speed: 'rapida', range: MELEE.media, rangeLabel: 'Mischia: media',
    targets: 'ground', size: 'M', weapon: 'twoswords' },
  { id: 'blisco', lvScreenshot: 10, name: 'Blisco', ispirata: 'Arcieri', rarity: 'common', cost: 3, count: 2,
    hp: 305, dmg: 112, hitSpeed: 0.9, speed: 'media', range: 5, targets: 'airground', size: 'S',
    weapon: 'bow', proj: 'arrow' },
  { id: 'kiuppi', lvScreenshot: 10, name: 'Kiuppi', ispirata: 'Principe nero', rarity: 'epic', cost: 4, count: 1,
    hp: 1201, shield: 241, dmg: 266, chargeDmg: 532, hitSpeed: 1.4, speed: 'media', range: MELEE.media,
    rangeLabel: 'Mischia: media', targets: 'ground', size: 'L', weapon: 'mace', mount: 'horse', charge: true, splashMelee: 1.1 },
  { id: 'cimmi', lvScreenshot: 11, name: 'Cimmi', ispirata: 'Gigante Royale', rarity: 'common', cost: 6, count: 1,
    hp: 3164, dmg: 307, hitSpeed: 1.8, speed: 'lenta', range: 5, targets: 'buildings', size: 'XL',
    weapon: 'cannon', proj: 'cannonball' }
];
const CARD_INDEX = {};
CARDS.forEach((c, i) => { CARD_INDEX[c.id] = i; });
const TARGET_LABEL = { ground: 'Terra', airground: 'Aria e terra', buildings: 'Edifici' };

const DEFAULT_DECK = ['bazoo', 'blisco', 'meme', 'frankie', 'jack', 'bebe', 'canne', 'mara'];

function validDeck(d) {
  if (!Array.isArray(d)) return DEFAULT_DECK.slice();
  const ok = [];
  for (const id of d) if (CARD_INDEX[id] !== undefined && !ok.includes(id)) ok.push(id);
  return ok.length === 8 ? ok : DEFAULT_DECK.slice();
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function randomDeck() { return shuffle(CARDS.map(c => c.id)).slice(0, 8); }

// coordinate "locali": ogni squadra vede il proprio lato in basso (la trasformazione è la stessa all'andata e al ritorno)
function L(team, x, y) { return team === 0 ? [x, y] : [CFG.W - x, CFG.H - y]; }
const r2 = v => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// formazioni per carte con più truppe (coordinate locali)
const FORMATION = {
  1: [[0, 0]],
  2: [[-0.5, 0], [0.5, 0]],
  3: [[0, 0.45], [-0.55, -0.35], [0.55, -0.35]],
  4: [[-0.45, 0.45], [0.45, 0.45], [-0.45, -0.45], [0.45, -0.45]]
};

// Dove può schierare una squadra? (lx,ly) in coordinate locali; alive = vita sì/no delle 6 torri
function placeOk(team, lx, ly, alive) {
  if (lx < 0 || lx > CFG.W || ly < 0 || ly > CFG.H) return false;
  if (ly >= CFG.RIVER_Y0 && ly <= CFG.RIVER_Y1) return false;
  if (ly > CFG.RIVER_Y1) {
    // metà avversaria: solo nella "tasca" del lato dove la torretta nemica è caduta
    if (ly > CFG.POCKET_Y) return false;
    const left = lx < 9;
    const ti = TOWERS.findIndex(t => t.team !== team && t.kind === 'princess' && (L(team, t.x, t.y)[0] < 9) === left);
    if (ti < 0 || alive[ti]) return false;
  }
  for (let i = 0; i < TOWERS.length; i++) {
    const t = TOWERS[i];
    if (t.team !== team || !alive[i]) continue;
    const [tx, ty] = L(team, t.x, t.y);
    const h = t.kind === 'king' ? 2 : 1.5;
    if (Math.abs(lx - tx) < h && Math.abs(ly - ty) < h) return false;
  }
  return true;
}

function elixirMult(T) {
  if (T < CFG.X2_AT) return 1;
  if (T < CFG.REG_MS + CFG.OT_X3_AT) return 2;
  return 3;
}

// =====================================================================
//  SIMULAZIONE
// =====================================================================
class Sim {
  constructor(opts = {}) {
    this.t = 0;
    this.nextId = 1;
    this.units = [];
    this.projs = [];
    this.events = [];
    this.crowns = [0, 0];
    this.ended = null;
    this.towers = TOWERS.map((d, i) => {
      const s = TOWER_STATS[d.kind];
      return { isTower: true, i, id: d.id, team: d.team, kind: d.kind, x: d.x, y: d.y, r: s.r,
        hp: s.hp, maxHp: s.hp, alive: true, active: d.kind === 'princess', atk: 0, target: null, slowUntil: 0 };
    });
    const decks = opts.decks || [DEFAULT_DECK, DEFAULT_DECK];
    this.players = [0, 1].map(team => {
      const d = shuffle(validDeck(decks[team]).map(id => CARD_INDEX[id]));
      return { ex: CFG.ELIXIR_START, hand: d.slice(0, 4), queue: d.slice(4), abilityCd: 0 };
    });
  }

  ev(e) { this.events.push(e); }
  flushEvents() { const e = this.events; this.events = []; return e; }
  code(o) { return o.isTower ? -(o.i + 1) : o.id; }
  aliveArr() { return this.towers.map(t => t.alive); }

  // ---------- giocare una carta ----------
  play(team, slot, ax, ay, cardId) {
    if (this.ended) return { ok: false, err: 'finita' };
    const p = this.players[team];
    slot = slot | 0;
    if (slot < 0 || slot > 3) return { ok: false, err: 'carta' };
    const ci = p.hand[slot], c = CARDS[ci];
    if (cardId && c.id !== cardId) return { ok: false, err: 'carta' };
    if (p.ex < c.cost) return { ok: false, err: 'elisir' };
    if (c.champion && this.units.some(u => u.alive && u.team === team && u.c.champion)) return { ok: false, err: 'campione' };
    ax = Math.floor(+ax) + 0.5; ay = Math.floor(+ay) + 0.5;
    if (!isFinite(ax) || !isFinite(ay)) return { ok: false, err: 'posizione' };
    const [lx, ly] = L(team, ax, ay);
    if (!placeOk(team, lx, ly, this.aliveArr())) return { ok: false, err: 'posizione' };
    p.ex -= c.cost;
    p.hand[slot] = p.queue.shift();
    p.queue.push(ci);
    for (const [ox, oy] of (FORMATION[c.count] || FORMATION[1])) {
      const [x, y] = L(team, lx + ox, ly + oy);
      this.spawn(ci, team, x, y);
    }
    this.ev(['play', team, ci, r2(ax), r2(ay)]);
    return { ok: true };
  }

  spawn(ci, team, x, y) {
    const c = CARDS[ci], sz = SIZE[c.size];
    const u = {
      id: this.nextId++, ci, c, team, x, y, r: sz.r, m: sz.m,
      hp: c.hp, maxHp: c.hp, shield: c.shield || 0, maxShield: c.shield || 0,
      flying: !!c.flying, deploy: c.deployTime || 1, alive: true,
      target: null, locked: false, attacking: false, atk: 0, retarget: 0,
      chargeDist: 0, charging: false, slowUntil: 0, spark: 0
    };
    this.units.push(u);
    return u;
  }

  // ---------- abilità del campione (Coto) ----------
  ability(team) {
    const p = this.players[team];
    const u = this.units.find(v => v.alive && v.team === team && v.c.champion);
    if (!u || u.deploy > 0) return { ok: false, err: 'campione' };
    const ab = u.c.ability;
    if (p.abilityCd > 0) return { ok: false, err: 'ricarica' };
    if (p.ex < ab.cost) return { ok: false, err: 'elisir' };
    const hit = new Set();
    let cx = u.x, cy = u.y;
    const path = [r2(u.x), r2(u.y)];
    for (let k = 0; k < ab.maxTargets; k++) {
      let best = null, bd = ab.range;
      for (const v of this.units) {
        if (!v.alive || v.team === team || hit.has(v)) continue;
        const d = Math.hypot(v.x - cx, v.y - cy) - v.r;
        if (d < bd) { bd = d; best = v; }
      }
      if (!best) break;
      hit.add(best);
      cx = best.x; cy = best.y;
      path.push(r2(cx), r2(cy));
      this.damage(best, ab.dmg, team);
    }
    if (!hit.size) return { ok: false, err: 'nessuno' };
    p.ex -= ab.cost;
    p.abilityCd = ab.cooldown;
    u.x = cx; u.y = cy; u.target = null; u.locked = false; u.attacking = false;
    this.ev(['dash', u.id, path]);
    return { ok: true };
  }

  // ---------- passo di simulazione ----------
  step(dt) {
    if (this.ended) return;
    this.t += dt;
    const mult = elixirMult(this.t * 1000);
    for (const p of this.players) {
      p.ex = Math.min(CFG.ELIXIR_MAX, p.ex + dt * 1000 * mult / CFG.ELIXIR_MS);
      if (p.abilityCd > 0) p.abilityCd = Math.max(0, p.abilityCd - dt);
    }
    for (const u of this.units) if (u.alive) this.updateUnit(u, dt);
    this.resolveCollisions();
    for (const tw of this.towers) this.updateTower(tw, dt);
    this.updateProjectiles(dt);
    this.units = this.units.filter(u => u.alive);
    this.projs = this.projs.filter(p => p.alive);
    this.checkEnd();
  }

  canHit(u, v) {
    if (v.isTower) return true;
    if (u.c.targets === 'buildings') return false;
    if (v.flying && u.c.targets === 'ground') return false;
    return true;
  }
  inRange(u, t, margin = 0) { return dist(u, t) - u.r - t.r <= u.c.range + margin; }

  // torre verso cui marcia una truppa senza bersagli: quella della sua corsia, altrimenti la più vicina
  defaultTower(u) {
    const enemy = this.towers.filter(t => t.team !== u.team && t.alive);
    if (!enemy.length) return null;
    const left = u.x < 9;
    const lane = enemy.find(t => t.kind === 'princess' && (t.x < 9) === left);
    if (lane) return lane;
    let best = null, bd = Infinity;
    for (const t of enemy) { const d = dist(u, t); if (d < bd) { bd = d; best = t; } }
    return best;
  }

  acquire(u) {
    if (u.c.targets === 'buildings') return this.defaultTower(u);
    const sight = Math.max(CFG.SIGHT, u.c.range + 1);
    let best = null, bd = sight;
    for (const v of this.units) {
      if (!v.alive || v.team === u.team || !this.canHit(u, v)) continue;
      const d = dist(u, v) - v.r;
      if (d < bd) { bd = d; best = v; }
    }
    for (const t of this.towers) {
      if (!t.alive || t.team === u.team) continue;
      const d = dist(u, t) - t.r;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // punto intermedio: le truppe di terra attraversano il fiume solo sui ponti
  waypoint(u, tx, ty) {
    if (u.flying || u.c.jump) return [tx, ty];
    const R0 = CFG.RIVER_Y0, R1 = CFG.RIVER_Y1;
    const inBand = u.y > R0 - 0.02 && u.y < R1 + 0.02;
    const uSide = u.y < 16 ? 0 : 1, tSide = ty < 16 ? 0 : 1;
    if (!inBand && uSide === tSide) return [tx, ty];
    let b = CFG.BRIDGES[0], bc = Infinity;
    for (const br of CFG.BRIDGES) {
      const cost = Math.abs(u.x - br.cx) * 1.5 + Math.abs(tx - br.cx);
      if (cost < bc) { bc = cost; b = br; }
    }
    if (inBand) {
      const onB = CFG.BRIDGES.find(br => u.x >= br.x0 - 0.05 && u.x <= br.x1 + 0.05) || b;
      return [onB.cx, tSide === 1 ? R1 + 0.5 : R0 - 0.5];
    }
    const edgeY = uSide === 0 ? R0 - 0.35 : R1 + 0.35;
    if (Math.abs(u.x - b.cx) > 0.7 || Math.abs(u.y - edgeY) > 0.7) return [b.cx, edgeY];
    return [b.cx, uSide === 0 ? R1 + 0.5 : R0 - 0.5];
  }

  onDeployed(u) {
    const c = u.c;
    if (c.spawnDmg) {
      this.area(u.team, u.x, u.y, 3, c.spawnDmg, { air: true, slow: c.slow, towers: true });
      this.ev(['boom', 'ice', r2(u.x), r2(u.y), 3]);
    }
  }

  updateUnit(u, dt) {
    if (u.deploy > 0) { u.deploy -= dt; if (u.deploy <= 0) this.onDeployed(u); return; }
    const c = u.c;
    const slow = u.slowUntil > this.t ? 0.65 : 1;
    if (c.chargeUp) u.spark = Math.min(c.hitSpeed, u.spark + dt * slow);

    if (u.target && (!u.target.alive || !this.canHit(u, u.target))) { u.target = null; u.locked = false; u.attacking = false; }
    // finché non sta attaccando, controlla se c'è un bersaglio più vicino
    u.retarget -= dt;
    if (!u.locked && u.retarget <= 0) {
      u.retarget = 0.25;
      const nt = this.acquire(u);
      if (nt) u.target = nt;
    }
    const tgt = u.target;
    if (tgt && this.inRange(u, tgt, u.locked ? 0.4 : 0)) {
      u.locked = true;
      if (!u.attacking) { u.attacking = true; u.atk = c.hitSpeed * 0.4; }
      u.chargeDist = 0;
      if (c.kamikaze) { this.explode(u); return; }
      if (c.chargeUp) {
        if (u.spark >= c.hitSpeed) { this.attack(u, tgt); u.spark = 0; }
      } else {
        u.atk -= dt * slow;
        if (u.atk <= 0) { this.attack(u, tgt); u.atk += c.hitSpeed; }
      }
      return;
    }
    u.locked = false; u.attacking = false;
    let dest = tgt;
    if (!dest) dest = this.defaultTower(u);
    if (!dest) return;
    const [wx, wy] = this.waypoint(u, dest.x, dest.y);
    const sp = SPEED[c.speed] * slow * (u.charging ? 2 : 1);
    const vx = wx - u.x, vy = wy - u.y, l = Math.hypot(vx, vy);
    if (l > 0.001) {
      const s = Math.min(sp * dt, l);
      u.x += vx / l * s; u.y += vy / l * s;
      if (c.charge && !u.charging) {
        u.chargeDist += s;
        if (u.chargeDist >= 2.5) { u.charging = true; this.ev(['chg', u.id]); }
      }
    }
  }

  attack(u, t) {
    const c = u.c;
    if (c.pellets) return this.fireHunter(u, t);
    if (c.chargeUp) {
      this.ev(['zap', u.id, this.code(t), r2(t.x), r2(t.y), c.splash]);
      this.area(u.team, t.x, t.y, c.splash, c.dmg, { air: false, towers: true });
      return;
    }
    if (c.proj) {
      this.launch(c.proj, u.team, u, t, c.dmg, { splash: c.splash || 0, slow: c.slow || 0, air: c.targets !== 'ground' });
      return;
    }
    let dmg = c.dmg, charged = 0;
    if (u.charging) { dmg = c.chargeDmg; u.charging = false; u.chargeDist = 0; charged = 1; }
    this.ev(['atk', u.id, this.code(t), charged]);
    if (c.splashMelee) {
      this.area(u.team, t.x, t.y, c.splashMelee, dmg, { air: false, towers: false });
      if (t.isTower) this.damage(t, dmg, u.team);
    } else this.damage(t, dmg, u.team);
  }

  explode(u) {
    const c = u.c;
    this.area(u.team, u.x, u.y, c.splash, c.dmg, { air: false, towers: true });
    this.ev(['boom', 'barrel', r2(u.x), r2(u.y), c.splash]);
    u.alive = false;
    this.ev(['die', u.id, r2(u.x), r2(u.y), 1]);
  }

  // cacciatore: 10 pallini a ventaglio, ognuno colpisce il primo nemico sulla sua traiettoria
  fireHunter(u, t) {
    const c = u.c;
    const base = Math.atan2(t.y - u.y, t.x - u.x);
    const ends = [];
    const half = 0.22;
    for (let k = 0; k < c.pellets; k++) {
      const a = base + (k / (c.pellets - 1) - 0.5) * 2 * half;
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = null, bt = c.projRange;
      const check = (v) => {
        const fx = v.x - u.x, fy = v.y - u.y;
        const pr = fx * dx + fy * dy;
        if (pr < 0) return;
        const perp2 = fx * fx + fy * fy - pr * pr, rr = v.r * v.r;
        if (perp2 > rr) return;
        const th = pr - Math.sqrt(rr - perp2);
        if (th < bt) { bt = Math.max(0, th); best = v; }
      };
      for (const v of this.units) if (v.alive && v.team !== u.team) check(v);
      for (const tw of this.towers) if (tw.alive && tw.team !== u.team) check(tw);
      if (best) this.damage(best, c.dmg, u.team);
      ends.push(r2(u.x + dx * bt), r2(u.y + dy * bt));
    }
    this.ev(['pel', u.id, r2(u.x), r2(u.y), ends]);
  }

  launch(kind, team, from, target, dmg, o = {}) {
    const p = { kind, team, x: from.x, y: from.y, tgt: target, tx: target.x, ty: target.y,
      sp: PROJ_SPEED[kind] || 12, dmg, splash: o.splash || 0, slow: o.slow || 0, air: o.air !== false, alive: true };
    this.projs.push(p);
    this.ev(['pr', kind, this.code(from), this.code(target), r2(p.x), r2(p.y), r2(p.tx), r2(p.ty), p.sp]);
  }

  updateProjectiles(dt) {
    for (const p of this.projs) {
      if (!p.alive) continue;
      if (p.tgt && p.tgt.alive) { p.tx = p.tgt.x; p.ty = p.tgt.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y, l = Math.hypot(dx, dy), s = p.sp * dt;
      if (l <= s + 0.05) {
        if (p.splash > 0) {
          this.area(p.team, p.tx, p.ty, p.splash, p.dmg, { air: p.air, slow: p.slow, towers: true });
          this.ev(['hit', p.kind, r2(p.tx), r2(p.ty), p.splash]);
        } else if (p.tgt && p.tgt.alive) this.damage(p.tgt, p.dmg, p.team, p.slow);
        p.alive = false;
      } else { p.x += dx / l * s; p.y += dy / l * s; }
    }
  }

  area(team, x, y, radius, dmg, o = {}) {
    for (const v of this.units) {
      if (!v.alive || v.team === team) continue;
      if (v.flying && !o.air) continue;
      if (Math.hypot(v.x - x, v.y - y) <= radius + v.r) this.damage(v, dmg, team, o.slow);
    }
    if (o.towers !== false) {
      for (const tw of this.towers) {
        if (!tw.alive || tw.team === team) continue;
        if (Math.hypot(tw.x - x, tw.y - y) <= radius + tw.r) this.damage(tw, dmg, team, o.slow);
      }
    }
  }

  damage(t, dmg, byTeam, slow) {
    if (!t.alive) return;
    if (slow) t.slowUntil = Math.max(t.slowUntil || 0, this.t + slow);
    if (t.isTower) {
      t.hp -= dmg;
      if (t.kind === 'king' && !t.active) { t.active = true; this.ev(['kon', t.i]); }
      if (t.hp <= 0) {
        t.hp = 0; t.alive = false; t.target = null;
        this.ev(['tw', t.i]);
        if (t.kind === 'king') this.crowns[byTeam] = 3;
        else {
          this.crowns[byTeam] = Math.min(3, this.crowns[byTeam] + 1);
          const k = this.towers.find(x => x.team === t.team && x.kind === 'king');
          if (k.alive && !k.active) { k.active = true; this.ev(['kon', k.i]); }
        }
      }
      return;
    }
    if (t.shield > 0) {
      t.shield -= dmg;
      if (t.shield <= 0) { t.shield = 0; this.ev(['shb', t.id]); }
    } else t.hp -= dmg;
    if (t.hp <= 0) { t.hp = 0; t.alive = false; this.ev(['die', t.id, r2(t.x), r2(t.y), 0]); }
  }

  updateTower(tw, dt) {
    if (!tw.alive || !tw.active) return;
    const s = TOWER_STATS[tw.kind];
    const slow = tw.slowUntil > this.t ? 0.65 : 1;
    if (tw.target && (!tw.target.alive || dist(tw, tw.target) - tw.target.r > s.range)) tw.target = null;
    if (!tw.target) {
      let best = null, bd = s.range;
      for (const v of this.units) {
        if (!v.alive || v.team === tw.team) continue;
        const d = dist(tw, v) - v.r;
        if (d <= bd) { bd = d; best = v; }
      }
      tw.target = best;
    }
    if (tw.atk > 0) tw.atk -= dt * slow;
    if (tw.target && tw.atk <= 0) {
      this.launch('bullet', tw.team, tw, tw.target, s.dmg, {});
      tw.atk += s.hit;
    }
  }

  resolveCollisions() {
    const us = this.units.filter(u => u.alive);
    const R0 = CFG.RIVER_Y0, R1 = CFG.RIVER_Y1;
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < us.length; i++) {
        const a = us[i];
        for (let j = i + 1; j < us.length; j++) {
          const b = us[j];
          if (a.flying !== b.flying) continue;
          let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          const min = a.r + b.r;
          if (d >= min) continue;
          if (d < 1e-6) { dx = (Math.random() - 0.5) * 0.01; dy = 0.01; d = Math.hypot(dx, dy); }
          const ov = min - d, nx = dx / d, ny = dy / d;
          // chi sta attaccando è più "piantato" a terra
          const ma = a.m * (a.attacking ? 3 : 1), mb = b.m * (b.attacking ? 3 : 1);
          const wa = mb / (ma + mb), wb = ma / (ma + mb);
          a.x -= nx * ov * wa; a.y -= ny * ov * wa;
          b.x += nx * ov * wb; b.y += ny * ov * wb;
        }
      }
      for (const u of us) {
        if (!u.flying) {
          for (const tw of this.towers) {
            if (!tw.alive) continue;
            const tr = tw.r * 0.85 + u.r;
            let dx = u.x - tw.x, dy = u.y - tw.y, d = Math.hypot(dx, dy);
            if (d >= tr) continue;
            if (d < 1e-6) { dx = 0; dy = tw.team === 0 ? 1 : -1; d = 1; }
            u.x = tw.x + dx / d * tr; u.y = tw.y + dy / d * tr;
          }
          if (!u.c.jump && u.y > R0 && u.y < R1) {
            const br = CFG.BRIDGES.find(b => u.x >= b.x0 && u.x <= b.x1);
            if (!br) u.y = u.y < 16 ? R0 : R1;
            else u.x = Math.max(br.x0 + u.r * 0.6, Math.min(br.x1 - u.r * 0.6, u.x));
          }
        }
        u.x = Math.max(u.r, Math.min(CFG.W - u.r, u.x));
        u.y = Math.max(u.r, Math.min(CFG.H - u.r, u.y));
      }
    }
  }

  checkEnd() {
    if (this.ended) return;
    const T = this.t * 1000;
    const kings = this.towers.filter(t => t.kind === 'king');
    const deadK = kings.filter(k => !k.alive);
    if (deadK.length) {
      const winner = deadK.length === 2 ? -1 : kings.find(k => k.alive).team;
      return this.finish(winner, 're');
    }
    const [a, b] = this.crowns;
    if (T >= CFG.REG_MS && a !== b) return this.finish(a > b ? 0 : 1, T > CFG.REG_MS + 50 ? 'supplementare' : 'tempo');
    if (T >= CFG.REG_MS + CFG.OT_MS) {
      // spareggio: perde chi ha la torre più danneggiata
      const minHp = team => Math.min(...this.towers.filter(t => t.team === team).map(t => t.alive ? t.hp : 0));
      const ma = minHp(0), mb = minHp(1);
      return this.finish(ma === mb ? -1 : (ma > mb ? 0 : 1), 'spareggio');
    }
  }
  finish(winner, reason) { this.ended = { winner, reason }; this.ev(['end', winner, reason]); }

  // stato per un giocatore (la mano dell'avversario non viene mandata)
  snapshot(team) {
    const p = this.players[team];
    const champ = this.units.find(u => u.alive && u.team === team && u.c.champion);
    return {
      ex: Math.round(p.ex * 1000) / 1000,
      hand: p.hand.slice(),
      next: p.queue[0],
      champ: champ ? { id: champ.id, cd: Math.ceil(p.abilityCd * 10) / 10, deploying: champ.deploy > 0 } : null,
      cr: this.crowns.slice(),
      tw: this.towers.map(t => [Math.ceil(t.hp), t.active ? 1 : 0]),
      u: this.units.filter(u => u.alive).map(u => {
        let f = 0;
        if (u.deploy > 0) f |= 1;
        if (u.attacking) f |= 2;
        if (u.charging) f |= 4;
        if (u.slowUntil > this.t) f |= 8;
        return [u.id, u.ci, u.team, Math.round(u.x * 100), Math.round(u.y * 100), Math.ceil(u.hp), Math.ceil(u.shield), f,
          u.target && u.target.alive ? this.code(u.target) : 0, u.c.chargeUp ? Math.round(u.spark / u.c.hitSpeed * 100) : 0];
      })
    };
  }
}

// =====================================================================
//  COMPUTER (avversario per giocare da soli)
//  Ragiona nelle sue coordinate locali (il suo re è in basso, y=3).
//  - Difesa: valuta le minacce per corsia, sceglie la contro-carta
//    adatta (aria, sciami, carri armati…) e la piazza nel punto giusto.
//  - Attacco: spinte con carro armato + supporto, contro-spinte con le
//    truppe sopravvissute, punizioni quando l'avversario ha poco elisir.
//  - Non spreca elisir e usa l'abilità di Coto.
// =====================================================================
const BOT_LEVELS = {
  facile:    { react: [2.0, 3.2], idle: [1.6, 2.8], mistake: 0.4, ignore: 0.3, pushAt: 10, support: false, ability: false, punish: false },
  normale:   { react: [0.8, 1.4], idle: [0.8, 1.4], mistake: 0.12, ignore: 0.05, pushAt: 9,  support: true,  ability: true,  punish: true },
  difficile: { react: [0.3, 0.6], idle: [0.45, 0.9], mistake: 0,   ignore: 0,    pushAt: 10,  support: true,  ability: true,  punish: true }
};
const rnd = (a, b) => a + Math.random() * (b - a);
const cardDps = c => c.chargeUp ? c.dmg / c.hitSpeed : ((c.pellets ? c.dmg * c.pellets * 0.6 : c.dmg) / (c.hitSpeed || 1)) * c.count;
const isSplash = c => !!(c.splash || c.splashMelee || c.pellets) && !c.kamikaze;
const isBuilder = c => c.targets === 'buildings';
const isRanged = c => c.range >= 3.5;
const isAirDef = c => c.targets === 'airground';

// mazzo del computer: casuale ma sensato (almeno una carta per attaccare le torri, difesa aerea e danno ad area)
function botDeck() {
  for (let k = 0; k < 300; k++) {
    const d = randomDeck(), cs = d.map(id => CARDS[CARD_INDEX[id]]);
    const builders = cs.filter(isBuilder).length, air = cs.filter(isAirDef).length, splash = cs.filter(isSplash).length;
    const avg = cs.reduce((s, c) => s + c.cost, 0) / 8;
    if (builders >= 1 && builders <= 2 && air >= 3 && splash >= 1 && avg <= 4.3) return d;
  }
  return DEFAULT_DECK.slice();
}

class Bot {
  constructor(sim, team, level = 'normale') {
    this.sim = sim; this.team = team;
    this.lv = BOT_LEVELS[level] || BOT_LEVELS.normale;
    this.cd = rnd(2, 3.5);
    this.reacting = false; this.reactT = 0;
    this.stats = { defend: 0, push: 0, support: 0, punish: 0, leak: 0, ability: 0 };
  }
  loc(u) { return L(this.team, u.x, u.y); }
  me() { return this.sim.players[this.team]; }
  afford(filter) {
    const p = this.me();
    const champAlive = this.sim.units.some(u => u.alive && u.team === this.team && u.c.champion);
    return [0, 1, 2, 3].filter(i => {
      const c = CARDS[p.hand[i]];
      return c.cost <= p.ex && !(c.champion && champAlive) && (!filter || filter(c));
    });
  }
  // prova a giocare la carta vicino al punto (locale), cercando una casella valida
  playAt(slot, lx, ly) {
    lx = Math.max(0.5, Math.min(17.5, lx)); ly = Math.max(0.5, Math.min(14.5, ly));
    const offs = [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, -2], [2, -2], [-2, -2]];
    for (const [ox, oy] of offs) {
      const [ax, ay] = L(this.team, lx + ox, ly + oy);
      if (this.sim.play(this.team, slot, ax, ay).ok) return true;
    }
    return false;
  }
  // minacce per corsia: nemici nella mia metà o che stanno per attraversare
  assess() {
    const sim = this.sim, team = this.team;
    const lanes = [0, 1].map(() => ({ threat: 0, def: 0, units: [], air: 0, ground: 0, swarm: 0, tank: 0, builder: 0, cost: 0, lead: null }));
    for (const u of sim.units) {
      if (!u.alive) continue;
      const [lx, ly] = this.loc(u);
      const ln = lanes[lx < 9 ? 0 : 1];
      const val = u.c.cost / u.c.count * Math.max(0.2, u.hp / u.maxHp);
      if (u.team !== team) {
        if (ly > 18.5) continue;
        const w = ly < 15 ? 1.3 : 1;
        ln.threat += val * w; ln.cost += u.c.cost / u.c.count;
        ln.units.push(u);
        if (u.flying) ln.air += val; else ln.ground += val;
        if (u.c.count >= 3) ln.swarm += val;
        if (u.maxHp >= 1500) ln.tank += val;
        if (isBuilder(u.c)) ln.builder += val;
        if (!ln.lead || ly < ln.lead.ly) ln.lead = { u, lx, ly };
      } else if (ly < 17 && !isBuilder(u.c)) {
        ln.def += val;
      }
    }
    let best = null;
    for (const ln of lanes) {
      if (!ln.units.length) continue;
      ln.need = ln.threat - ln.def * 1.1;
      if (!best || ln.need > best.need) best = ln;
    }
    if (best) {
      let cx = 0, cy = 0;
      for (const u of best.units) { const [lx, ly] = this.loc(u); cx += lx; cy += ly; }
      best.cx = cx / best.units.length; best.cy = cy / best.units.length;
      best.airOnly = best.air > 0 && best.ground < 0.5;
    }
    return best;
  }
  scoreDefense(c, th) {
    let s = 0;
    if (th.air > 0 && !isAirDef(c)) s -= th.airOnly ? 100 : 3;
    if (isBuilder(c)) s -= 10;
    if (c.kamikaze) s -= 10;
    if (th.swarm > 0 && isSplash(c)) s += 4;
    if (th.swarm > 0 && c.count === 1 && !isSplash(c) && c.hitSpeed > 1.2) s -= 2;
    if (th.tank > 0 && cardDps(c) >= 250) s += 3;
    if (th.tank > 0 && c.count >= 3 && !c.flying) s += 2;
    if (th.builder > 0 && th.swarm === 0) s += c.count >= 2 ? 1.5 : 0;
    if (isRanged(c)) s += 1;
    s -= Math.max(0, c.cost - (th.cost + 0.5)) * 1.2;
    s += Math.random();
    return s;
  }
  defend(th) {
    const p = this.me();
    const opts = this.afford();
    if (!opts.length) return false;
    let slot;
    if (Math.random() < this.lv.mistake) slot = opts[Math.floor(Math.random() * opts.length)];
    else {
      let bs = -Infinity;
      for (const i of opts) { const sc = this.scoreDefense(CARDS[p.hand[i]], th); if (sc > bs) { bs = sc; slot = i; } }
      if (bs < -5) return false;
    }
    const c = CARDS[p.hand[slot]];
    const lead = th.lead;
    let px = lead.lx, py;
    if (th.swarm > 0 && isSplash(c)) { px = th.cx; py = th.cy - (isRanged(c) ? c.range * 0.75 : 1.5); }
    else if (isRanged(c)) py = Math.min(lead.ly - c.range * 0.7, 9);
    else if (c.flying) py = lead.ly - 1;
    else py = lead.ly - 2;
    // il carro armato nemico va "trascinato" verso il centro, lontano dalle torri
    if (th.builder > 0 && !isRanged(c) && lead.ly > 9) px = lead.lx < 9 ? Math.min(lead.lx + 2.5, 8) : Math.max(lead.lx - 2.5, 10);
    if (this.lv.mistake > 0.2) { px += rnd(-2, 2); py += rnd(-2, 2); }
    if (this.playAt(slot, px, Math.max(2, py))) { this.stats.defend++; return true; }
    return false;
  }
  laneToAttack() {
    const enemy = this.sim.towers.filter(t => t.team !== this.team && t.kind === 'princess');
    const byLane = [0, 1].map(lane => enemy.find(t => (L(this.team, t.x, t.y)[0] < 9) === (lane === 0)));
    const alive = byLane.map(t => t && t.alive);
    if (alive[0] && !alive[1]) return Math.random() < 0.7 ? 1 : 0;   // torre già caduta: punta al re da lì
    if (!alive[0] && alive[1]) return Math.random() < 0.7 ? 0 : 1;
    if (alive[0] && alive[1]) {
      const h0 = byLane[0].hp, h1 = byLane[1].hp;
      if (Math.abs(h0 - h1) > 300) return h0 < h1 ? (Math.random() < 0.75 ? 0 : 1) : (Math.random() < 0.75 ? 1 : 0);
    }
    return Math.random() < 0.5 ? 0 : 1;
  }
  myPush() {
    // la mia truppa più avanzata per corsia (truppe sopravvissute = contro-spinta)
    const res = [null, null];
    for (const u of this.sim.units) {
      if (!u.alive || u.team !== this.team || u.deploy > 0) continue;
      const [lx, ly] = this.loc(u);
      if (ly < 8) continue;
      const lane = lx < 9 ? 0 : 1;
      const val = u.c.cost / u.c.count * (u.hp / u.maxHp);
      if (!res[lane]) res[lane] = { value: 0, lead: null };
      res[lane].value += val;
      if (!res[lane].lead || ly > res[lane].lead.ly) res[lane].lead = { u, lx, ly };
    }
    return res;
  }
  attack() {
    const sim = this.sim, p = this.me();
    const mult = elixirMult(sim.t * 1000);
    const pushAt = this.lv.pushAt - (mult > 1 ? 2 : 0);
    const opEx = sim.players[1 - this.team].ex;
    const pushes = this.myPush();
    // 1) supporta una spinta già in corso (contro-spinta)
    if (this.lv.support) {
      const lane = pushes[0] && (!pushes[1] || pushes[0].value >= pushes[1].value) ? 0 : (pushes[1] ? 1 : -1);
      this.lastSupport = this.lastSupport || [-99, -99];
      if (lane >= 0 && pushes[lane].value >= 3 && pushes[lane].lead.ly >= 11 && sim.t - this.lastSupport[lane] > 5 && p.ex >= 5) {
        const lead = pushes[lane].lead;
        const opts = this.afford(c => !isBuilder(c) || lead.u.c.targets !== 'buildings');
        if (opts.length) {
          // dietro a un carro armato metti chi fa danno ad area o colpisce a distanza
          let slot = opts[0], bs = -Infinity;
          for (const i of opts) {
            const c = CARDS[p.hand[i]];
            let s = (isRanged(c) ? 2 : 0) + (isSplash(c) ? 2 : 0) + (lead.u.maxHp >= 1500 && !isBuilder(c) ? 1 : 0) - c.cost * 0.3 + Math.random();
            if (s > bs) { bs = s; slot = i; }
          }
          const c = CARDS[p.hand[slot]];
          if (p.ex - c.cost >= 2 || p.ex >= 9) {
            const y = lead.ly < 14.5 ? lead.ly - 2.5 : 14.5;
            if (this.playAt(slot, lead.lx, y)) { this.stats.support++; this.lastSupport[lane] = sim.t; return; }
          }
        }
      }
    }
    // 2) punisci quando l'avversario è a corto di elisir
    if (this.lv.punish && opEx < 3 && p.ex >= 4) {
      const opts = this.afford(c => isBuilder(c) && SPEED[c.speed] >= 1.5);
      if (opts.length) {
        const laneX = this.laneToAttack() === 0 ? 3.5 : 14.5;
        if (this.playAt(opts[0], laneX, 14.5)) { this.stats.punish++; return; }
      }
    }
    // 3) nuova spinta quando ho abbastanza elisir
    if (p.ex >= pushAt) {
      const laneX = this.laneToAttack() === 0 ? 3.5 : 14.5;
      const tanks = this.afford(c => isBuilder(c));
      let slot = -1, y = 11;
      if (tanks.length) {
        slot = tanks[0];
        const c = CARDS[p.hand[slot]];
        y = SPEED[c.speed] >= 1.5 || c.range > 3 ? 14.5 : 11;   // veloci o a distanza al ponte, lenti dalle retrovie
      } else {
        const opts = this.afford();
        if (opts.length) {
          // la carta più "robusta" da far avanzare
          slot = opts.reduce((a, b) => (CARDS[p.hand[b]].hp * CARDS[p.hand[b]].count > CARDS[p.hand[a]].hp * CARDS[p.hand[a]].count ? b : a));
          y = isRanged(CARDS[p.hand[slot]]) ? 9 : 12;
        }
      }
      if (slot >= 0 && this.playAt(slot, laneX + rnd(-0.5, 0.5), y)) { this.stats.push++; return; }
    }
    // 4) elisir pieno: non sprecarlo, gioca una carta economica dietro
    if (p.ex >= 9.6) {
      const opts = this.afford();
      if (opts.length) {
        const slot = opts.reduce((a, b) => CARDS[p.hand[b]].cost < CARDS[p.hand[a]].cost ? b : a);
        if (this.playAt(slot, Math.random() < 0.5 ? 6.5 : 11.5, 4.5)) this.stats.leak++;
      }
    }
  }
  useAbility() {
    if (!this.lv.ability) return;
    const sim = this.sim, p = this.me();
    const champ = sim.units.find(u => u.alive && u.team === this.team && u.c.champion && u.deploy <= 0);
    if (!champ || p.abilityCd > 0 || p.ex < 1) return;
    let n = 0, big = false;
    for (const v of sim.units) {
      if (!v.alive || v.team === this.team) continue;
      if (Math.hypot(v.x - champ.x, v.y - champ.y) - v.r <= champ.c.ability.range) { n++; if (v.hp > 600) big = true; }
    }
    if (n >= 2 || (n === 1 && big)) { if (sim.ability(this.team).ok) this.stats.ability++; }
  }
  think(dt) {
    if (this.sim.ended) return;
    this.cd -= dt;
    this.useAbility();
    const th = this.assess();
    const urgent = th && th.lead && th.lead.ly < 10;
    if (th && (th.need > 1.4 || (urgent && th.need > 0.3))) {
      if (!this.reacting) { this.reacting = true; this.reactT = rnd(...this.lv.react) + (Math.random() < this.lv.ignore ? 3 : 0); }
    } else this.reacting = false;
    if (this.reacting) {
      this.reactT -= dt;
      if (this.reactT <= 0) {
        this.reacting = false;
        const fresh = this.assess();
        if (fresh && fresh.need > 0.3 && this.defend(fresh)) { this.cd = Math.max(this.cd, 0.4); return; }
      }
      // mentre una minaccia è in arrivo non lancia attacchi (tranne a elisir pieno)
      if (this.me().ex < 9.6) return;
    }
    if (this.cd > 0) return;
    this.cd = rnd(...this.lv.idle);
    this.attack();
  }
}

return { CFG, CARDS, CARD_INDEX, TOWERS, TOWER_STATS, SIZE, SPEED, SPEED_LABEL, TARGET_LABEL, PROJ_SPEED,
  FORMATION, DEFAULT_DECK, Sim, Bot, BOT_LEVELS, L, placeOk, validDeck, randomDeck, botDeck, elixirMult };
});
