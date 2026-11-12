// =====================================================================
//  Bazoo Game — personaggi 3D in stile cartoon (originali)
//  Testa grande, corpo tozzo, faccia espressiva, vestiti con i colori
//  della squadra. Ogni parte rigida viene "cotta" in un'unica geometria
//  con i colori sui vertici, così ogni personaggio costa pochi disegni.
// =====================================================================
(function () {
'use strict';
const THREE = window.THREE, SIM = window.BazooSim;
const BGU = THREE.BufferGeometryUtils;

// ---------- materiale cartoon (3 toni) ----------
const gradTex = (() => {
  const d = new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
const BASE_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradTex });
const GLOW = {
  fire: new THREE.MeshBasicMaterial({ color: 0xff8a1f }),
  fireCore: new THREE.MeshBasicMaterial({ color: 0xffe08a }),
  ice: new THREE.MeshBasicMaterial({ color: 0xa8ecff }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa630, transparent: true, opacity: 0.9 }),
  spark: new THREE.MeshBasicMaterial({ color: 0xfff1a0 }),
  orb: new THREE.MeshBasicMaterial({ color: 0x6fd4ff }),
  lens: new THREE.MeshBasicMaterial({ color: 0x9fe0ff })
};

for (const k in GLOW) GLOW[k].color.convertSRGBToLinear();
const TEAM_COL = { me: 0x2f7fe0, op: 0xe0413a };
const TEAM_DARK = { me: 0x1d4f99, op: 0x962a25 };
const SKIN = [0xf6c9a0, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdcb8];
const C = { steel: 0xc3cbd4, steelD: 0x8c96a1, gold: 0xf2c341, wood: 0x8a5a33, woodD: 0x5e3b1e, white: 0xf4f1ea, black: 0x1c1c1c,
  mouth: 0x5a1a1a, teeth: 0xffffff, eyeW: 0xffffff, pupil: 0x141414, brow: 0x2a1a10, leather: 0x6b4423, gray: 0x6e737a };

// ---------- aspetto di ogni carta (personaggi originali) ----------
// 'T' = colore della squadra, 'TD' = colore squadra scuro
const LOOKS = {
  bazoo:     { skin: 0, hair: ['short', 0x3b2a1a], hat: ['knight', C.steel], top: [C.steel, 'armor'], pants: 0x4a3b2a, boots: 0x3a2a1a, cape: 'T', brow: 'cool', mouth: 'smile', weapon: 'lance', mount: 'horse', horse: 0x9a6232 },
  ale:       { skin: 4, hair: ['short', 0x8a5a2b], hat: ['capback', 'T'], top: [C.white], pants: 0x3b5b8a, boots: C.white, brow: 'happy', mouth: 'grin', weapon: 'javelin' },
  bebe:      { skin: 1, hair: ['none'], hat: ['pilot', 0x6b4a2a], top: ['T'], pants: 0x555555, boots: 0x333333, brow: 'angry', mouth: 'grin', weapon: 'slingshot', jetpack: true },
  coto:      { skin: 0, hair: ['long', 0x2b1d12], hat: ['musketeer', 'T'], top: [0xf2e2b6], pants: 0x2b2b40, boots: 0x2a1d12, cape: 'T', beard: ['goatee', 0x2b1d12], brow: 'cool', mouth: 'smile', weapon: 'rapier', trim: C.gold },
  cheo:      { skin: 2, hair: ['short', 0x3b2a1a], hat: ['cap', 0xff7a1a], top: [0x5b6b3a, 'vest'], pants: 0x6b5a3a, boots: 0x3a2a1a, beard: ['full', 0x3b2a1a], brow: 'angry', mouth: 'flat', weapon: 'shotgun' },
  canne:     { skin: 3, hair: ['short', 0x141414], hat: ['cowboy', 0x8a5a2b], top: ['T'], pants: 0x3b5b8a, boots: 0x5a3a1a, scarf: 0xffd25a, brow: 'happy', mouth: 'grin', weapon: 'mallet', mount: 'pig' },
  frankie:   { skin: 0, hair: ['none'], hat: ['beanie', 'T'], top: ['T', 'plaid'], pants: 0x2f3f5f, boots: 0x3a2a1a, beard: ['full', 0x1e140c], brow: 'angry', mouth: 'flat', weapon: 'fists' },
  mara:      { skin: 4, hair: ['braid', 0xc9772b], hat: ['hood', 'T'], top: [0x3f7a3a], pants: 0x5a4a3a, boots: 0x5a3a1a, brow: 'cool', mouth: 'smile', weapon: 'longbow' },
  jack:      { skin: 0, hair: ['short', 0x777777], hat: ['wizard', 'T'], top: ['T', 'robe'], pants: 0x2b2b40, boots: 0x2a2a2a, brow: 'angry', mouth: 'grin', weapon: 'fireball' },
  corvo:     { skin: 1, hair: ['none'], hat: ['legion', C.steel], top: ['T', 'armor2'], pants: 0x5a4a3a, boots: 0x5a3a1a, brow: 'angry', mouth: 'flat', weapon: 'spear', shield: true },
  meme:      { skin: 2, hair: ['none'], hat: ['ninja', 0x222222], top: [0x262626], pants: 0x262626, boots: 0x111111, brow: 'angry', mouth: 'none', weapon: 'dagger' },
  paoluccio: { skin: 4, hair: ['none'], hat: ['parka', 'T'], top: ['T', 'parka'], pants: 0x3a3a5a, boots: C.white, brow: 'cool', mouth: 'smile', weapon: 'iceorb' },
  biondo:    { skin: 4, hair: ['short', 0xf2d16b], hat: ['hardhat', 0xffcc00], top: [0xff8a1a, 'vest'], pants: 0x3b5b8a, boots: 0x5a3a1a, brow: 'happy', mouth: 'grin', weapon: 'bomb' },
  lucab:     { machine: true },
  pesco:     { skin: 2, hair: ['none'], hat: ['luchador', 'T'], top: ['skin'], pants: 'T', boots: C.white, belt: C.gold, brow: 'angry', mouth: 'grin', weapon: 'twoswords' },
  blisco:    { skin: 0, hair: ['short', 0xc9772b], hat: ['robin', 0x3f7a3a], top: [0x3f7a3a], pants: 0x6b5a3a, boots: 0x5a3a1a, brow: 'cool', mouth: 'smile', weapon: 'bow' },
  kiuppi:    { skin: 1, hair: ['none'], hat: ['kabuto', 0x2a2a2a], top: [0x2a2a2a, 'armor'], pants: 0x2a2a2a, boots: 0x1a1a1a, cape: 'T', brow: 'angry', mouth: 'flat', weapon: 'club', shield: true, mount: 'horse', horse: 0x262626 },
  cimmi:     { skin: 0, hair: ['none'], hat: ['naval', 'T'], top: [C.white, 'stripes'], pants: 0x2b2b40, boots: 0x1a1a1a, beard: ['mustache', 0x8a8a8a], brow: 'happy', mouth: 'grin', weapon: 'cannon' },
  // tiratori delle torri
  guard:     { skin: 1, hair: ['short', 0x2b1d12], hat: ['police', 'T'], top: ['T'], pants: 0x2b2b40, boots: 0x1a1a1a, brow: 'angry', mouth: 'flat', weapon: 'pistol' },
  king:      { skin: 0, hair: ['short', 0x5a3a1a], hat: ['crown', C.gold], shades: true, top: [C.white], pants: 0x2b2b40, boots: 0x1a1a1a, cape: 'T', brow: 'cool', mouth: 'smile', weapon: 'pistol' }
};

// ---------- utilità di costruzione ----------
let TEAM = 'me';
function col(c) {
  if (c === 'T') return TEAM_COL[TEAM];
  if (c === 'TD') return TEAM_DARK[TEAM];
  return c;
}
function P(geo, color, parent, p, r, s) {
  const m = new THREE.Mesh(geo, BASE_MAT);
  m.userData.color = col(color);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s) m.scale.set(s[0], s[1], s[2]);
  parent.add(m);
  return m;
}
function K(geo, mat, parent, p, r, s, name) {   // parte che resta separata (luminosa / animata)
  const m = new THREE.Mesh(geo, mat); m.userData.keep = true;
  if (p) m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s) m.scale.set(s[0], s[1], s[2]);
  if (name) m.name = name;
  parent.add(m); return m;
}
const sph = (r, w = 14, h = 10, tl = Math.PI, ps = 0, pl = Math.PI * 2) => new THREE.SphereGeometry(r, w, h, ps, pl, 0, tl);
const cyl = (rt, rb, h, s = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cone = (r, h, s = 12) => new THREE.ConeGeometry(r, h, s);
const tor = (r, t, arc = Math.PI * 2, rs = 6, ts = 16) => new THREE.TorusGeometry(r, t, rs, ts, arc);
function anim(g, name) { g.userData.anim = true; g.name = name; return g; }

// unisce in un'unica mesh tutte le parti "fisse" di un gruppo (senza entrare nei sottogruppi animati)
function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const geos = [], dead = [];
  const visit = (o) => {
    for (const ch of o.children.slice()) {
      if (ch.userData.anim) continue;
      if (ch.isMesh && !ch.userData.keep) {
        let g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
        if (g.attributes.uv) g.deleteAttribute('uv');
        if (g.attributes.uv2) g.deleteAttribute('uv2');
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld));
        const c = new THREE.Color(ch.userData.color).convertSRGBToLinear(), n = g.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
        geos.push(g); dead.push(ch);
      }
      visit(ch);
    }
  };
  visit(group);
  for (const d of dead) d.parent.remove(d);
  if (geos.length) {
    const merged = BGU.mergeBufferGeometries(geos, false);
    const m = new THREE.Mesh(merged, BASE_MAT); m.castShadow = true; m.receiveShadow = false;
    group.add(m);
  }
}
function bakeAll(root) {
  const groups = [root];
  root.traverse(o => { if (o !== root && o.userData.anim) groups.push(o); });
  for (const g of groups) bake(g);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
}

// ---------- testa ----------
function buildHead(L, Ht, headG, R) {
  const hc = R * 0.82;
  const skin = SKIN[L.skin || 0];
  const skinD = new THREE.Color(skin).multiplyScalar(0.9).getHex();
  const hat = L.hat ? L.hat[0] : null, hatC = L.hat ? L.hat[1] : null;
  const headCol = hat === 'ninja' ? col(hatC) : hat === 'luchador' ? col(hatC) : skin;
  P(sph(R, 18, 14), headCol, headG, [0, hc, 0]);
  // orecchie
  if (hat !== 'parka' && hat !== 'hood') for (const s of [-1, 1]) P(sph(R * 0.22, 8, 6), headCol === skin ? skin : headCol, headG, [s * R * 0.97, hc, 0], null, [0.6, 1, 1]);
  // faccia
  const fz = R * 0.9, u = Ht;
  if (hat === 'ninja') P(box(R * 1.35, R * 0.42, R * 0.3), skin, headG, [0, hc + 0.02 * u, R * 0.78]);
  if (hat === 'luchador') for (const s of [-1, 1]) P(sph(1, 10, 8), C.white, headG, [s * 0.075 * u, hc + 0.03 * u, fz - 0.01], null, [0.07 * u, 0.075 * u, 0.03 * u]);
  for (const s of [-1, 1]) {
    P(sph(1, 10, 8), C.eyeW, headG, [s * 0.07 * u, hc + 0.03 * u, fz], null, [0.045 * u, 0.055 * u, 0.025 * u]);
    P(sph(0.022 * u, 8, 6), C.pupil, headG, [s * 0.066 * u, hc + 0.026 * u, fz + 0.02 * u]);
    const ang = { angry: 0.38, happy: -0.22, cool: 0.06 }[L.brow || 'cool'];
    P(box(0.08 * u, 0.02 * u, 0.02 * u), hat === 'ninja' ? C.black : (L.hair && L.hair[1] && L.hair[0] !== 'none' ? L.hair[1] : C.brow), headG,
      [s * 0.072 * u, hc + 0.098 * u, fz + 0.01 * u], [0, 0, -s * ang]);
  }
  if (L.shades) { P(box(R * 1.2, 0.05 * u, 0.02 * u), C.black, headG, [0, hc + 0.035 * u, fz + 0.025 * u]); }
  if (hat !== 'ninja') P(sph(0.034 * u, 8, 6), skinD, headG, [0, hc - 0.01 * u, R * 0.98]);
  const my = hc - 0.075 * u;
  if (L.mouth === 'grin') { P(box(0.11 * u, 0.04 * u, 0.02 * u), C.mouth, headG, [0, my, fz - 0.005]); P(box(0.1 * u, 0.012 * u, 0.022 * u), C.teeth, headG, [0, my + 0.012 * u, fz - 0.003]); }
  else if (L.mouth === 'smile') P(tor(0.04 * u, 0.01 * u, Math.PI, 5, 10), C.mouth, headG, [0, my + 0.02 * u, fz - 0.01], [0, 0, Math.PI]);
  else if (L.mouth === 'flat') P(box(0.08 * u, 0.015 * u, 0.02 * u), C.mouth, headG, [0, my, fz - 0.005]);
  // barba
  if (L.beard) {
    const [bt, bc] = L.beard;
    if (bt === 'full') P(sph(1, 12, 10), bc, headG, [0, hc - R * 0.5, R * 0.5], null, [R * 0.78, R * 0.55, R * 0.48]);
    if (bt === 'goatee') P(cone(R * 0.16, R * 0.4, 8), bc, headG, [0, hc - R * 0.78, R * 0.75], [Math.PI, 0, 0]);
    if (bt === 'goatee' || bt === 'mustache') for (const s of [-1, 1]) P(sph(1, 8, 6), bc, headG, [s * 0.045 * u, hc - 0.045 * u, R * 0.95], [0, 0, s * 0.35], [0.06 * u, 0.022 * u, 0.025 * u]);
  }
  // capelli
  if (L.hair && L.hair[0] !== 'none' && hat !== 'ninja' && hat !== 'luchador') {
    const [ht, hcCol] = L.hair;
    P(sph(R * 1.05, 16, 10, Math.PI * 0.46), hcCol, headG, [0, hc + 0.01, -R * 0.06], [-0.3, 0, 0]);
    if (ht === 'long') P(sph(1, 12, 10), hcCol, headG, [0, hc - R * 0.35, -R * 0.45], null, [R * 0.92, R * 0.95, R * 0.55]);
    if (ht === 'braid') for (let i = 0; i < 4; i++) P(sph(R * (0.24 - i * 0.03), 8, 6), hcCol, headG, [0, hc - R * (0.3 + i * 0.38), -R * (0.85 + i * 0.06)]);
  }
  // cappelli
  const hcl = col(hatC);
  switch (hat) {
    case 'knight':
      P(sph(R * 1.09, 16, 10, Math.PI * 0.55), hcl, headG, [0, hc, -R * 0.03], [-0.15, 0, 0]);
      P(box(R * 1.6, 0.035 * u, 0.04 * u), C.steelD, headG, [0, hc + 0.13 * u, R * 0.95]);
      P(box(0.025 * u, 0.13 * u, 0.03 * u), C.steelD, headG, [0, hc + 0.04 * u, R * 1.03]);
      P(sph(1, 10, 8), col(L.cape || 'T'), headG, [0, hc + R * 1.08, -R * 0.15], [0.3, 0, 0], [0.045 * u, 0.07 * u, 0.2 * u]);
      break;
    case 'capback': case 'cap': case 'police': {
      P(sph(R * 1.06, 16, 10, Math.PI * 0.42), hcl, headG, [0, hc + 0.01, 0], [-0.12, 0, 0]);
      const back = hat === 'capback';
      P(cyl(R * 0.62, R * 0.62, 0.02 * u, 16), hat === 'police' ? C.black : hcl, headG, [0, hc + R * 0.42, (back ? -1 : 1) * R * 0.88], null, [1, 1, 1.3]);
      if (hat === 'police') { P(cyl(R * 1.08, R * 1.08, 0.05 * u, 16, true), C.black, headG, [0, hc + R * 0.4, 0]); P(sph(0.03 * u, 6, 4), C.gold, headG, [0, hc + R * 0.6, R * 1.0]); }
      break;
    }
    case 'pilot':
      P(sph(R * 1.07, 16, 10, Math.PI * 0.52), hcl, headG, [0, hc, -0.01], [-0.1, 0, 0]);
      for (const s of [-1, 1]) {
        P(tor(0.042 * u, 0.012 * u, Math.PI * 2, 6, 12), C.leather, headG, [s * 0.065 * u, hc + 0.12 * u, R * 0.9], [-0.25, 0, 0]);
        K(cyl(0.036 * u, 0.036 * u, 0.01 * u, 12), GLOW.lens, headG, [s * 0.065 * u, hc + 0.12 * u, R * 0.91], [Math.PI / 2 - 0.25, 0, 0]);
        P(sph(1, 8, 6), hcl, headG, [s * R * 0.95, hc - R * 0.2, 0], null, [R * 0.18, R * 0.35, R * 0.28]);
      }
      break;
    case 'musketeer':
      P(cyl(R * 1.85, R * 1.85, 0.022 * u, 20), hcl, headG, [0, hc + R * 0.6, 0], [0, 0, 0.18]);
      P(cyl(R * 0.82, R * 0.9, 0.15 * u, 16), hcl, headG, [0.02 * u, hc + R * 0.6 + 0.07 * u, 0], [0, 0, 0.18]);
      P(cyl(R * 0.91, R * 0.91, 0.035 * u, 16, true), L.trim || col('TD'), headG, [0.015 * u, hc + R * 0.6 + 0.02 * u, 0], [0, 0, 0.18]);
      P(sph(1, 10, 8), C.white, headG, [-R * 0.55, hc + R * 1.1, -R * 0.2], [0.5, 0.4, 0.9], [0.035 * u, 0.05 * u, 0.24 * u]);
      break;
    case 'cowboy':
      P(cyl(R * 1.75, R * 1.75, 0.022 * u, 20), hcl, headG, [0, hc + R * 0.55, 0]);
      P(cyl(R * 0.7, R * 0.85, 0.2 * u, 14), hcl, headG, [0, hc + R * 0.55 + 0.1 * u, 0]);
      P(cyl(R * 0.86, R * 0.86, 0.035 * u, 14, true), C.black, headG, [0, hc + R * 0.55 + 0.025 * u, 0]);
      break;
    case 'beanie':
      P(sph(R * 1.07, 16, 10, Math.PI * 0.5), hcl, headG, [0, hc + 0.01, 0], [-0.08, 0, 0]);
      P(cyl(R * 1.09, R * 1.09, 0.07 * u, 16, true), col('TD'), headG, [0, hc + R * 0.25, 0]);
      P(sph(0.06 * u, 8, 6), C.white, headG, [0, hc + R * 1.12, -0.02 * u]);
      break;
    case 'hood':
      P(sph(R * 1.2, 16, 12, Math.PI * 0.9, Math.PI, Math.PI), hcl, headG, [0, hc + 0.01, -0.01]);
      P(sph(R * 1.21, 16, 6, Math.PI * 0.32), hcl, headG, [0, hc, 0.01], [0.15, 0, 0]);
      P(cone(R * 0.3, R * 0.7, 10), hcl, headG, [0, hc + R * 0.85, -R * 0.95], [-1.9, 0, 0]);
      break;
    case 'wizard':
      P(cyl(R * 1.6, R * 1.6, 0.02 * u, 20), hcl, headG, [0, hc + R * 0.58, 0]);
      P(cone(R * 0.88, R * 2.6, 16), hcl, headG, [0, hc + R * 0.58 + R * 1.25, -R * 0.25], [-0.28, 0, 0]);
      for (const [x, y, z] of [[0.25, 1.1, 0.45], [-0.3, 1.6, 0.2], [0.1, 2.2, -0.05]]) P(sph(0.03 * u, 6, 4), 0xffe25a, headG, [x * R, hc + y * R, z * R]);
      break;
    case 'legion':
      P(sph(R * 1.09, 16, 10, Math.PI * 0.55), hcl, headG, [0, hc, -R * 0.03], [-0.12, 0, 0]);
      P(box(0.04 * u, 0.13 * u, R * 1.9), col('T'), headG, [0, hc + R * 1.05, -R * 0.05]);
      for (const s of [-1, 1]) P(box(0.03 * u, R * 0.6, R * 0.5), hcl, headG, [s * R * 1.0, hc - R * 0.3, R * 0.25]);
      break;
    case 'ninja':
      P(tor(R * 1.01, 0.025 * u, Math.PI * 2, 6, 18), col('T'), headG, [0, hc + 0.13 * u, 0], [Math.PI / 2, 0, 0]);
      for (const s of [-1, 1]) P(box(0.03 * u, 0.025 * u, 0.16 * u), col('T'), headG, [s * 0.04 * u, hc + 0.1 * u, -R * 1.1], [0.6, s * 0.4, 0]);
      break;
    case 'parka':
      P(sph(R * 1.25, 16, 12, Math.PI * 0.95, Math.PI, Math.PI), hcl, headG, [0, hc, -0.01]);
      P(tor(R * 0.98, R * 0.24, Math.PI * 2, 8, 20), C.white, headG, [0, hc, R * 0.3]);
      break;
    case 'hardhat':
      P(sph(R * 1.08, 16, 10, Math.PI * 0.46), hcl, headG, [0, hc + 0.01, 0], [-0.1, 0, 0]);
      P(cyl(R * 1.28, R * 1.28, 0.018 * u, 20), hcl, headG, [0, hc + R * 0.38, R * 0.08]);
      P(box(0.03 * u, 0.04 * u, R * 1.6), new THREE.Color(hcl).multiplyScalar(0.85).getHex(), headG, [0, hc + R * 1.05, 0]);
      break;
    case 'luchador':
      P(box(0.05 * u, 0.12 * u, R * 1.8), C.white, headG, [0, hc + R * 0.9, -R * 0.1]);
      break;
    case 'robin':
      P(cone(R * 0.95, R * 1.9, 14), hcl, headG, [0, hc + R * 0.7, -R * 0.5], [-1.25, 0, 0]);
      P(sph(1, 10, 8), col('T'), headG, [R * 0.5, hc + R * 0.95, -R * 0.4], [0.2, 0, -0.6], [0.03 * u, 0.04 * u, 0.2 * u]);
      break;
    case 'kabuto':
      P(sph(R * 1.1, 16, 10, Math.PI * 0.55), hcl, headG, [0, hc, -R * 0.02], [-0.12, 0, 0]);
      P(cyl(R * 1.15, R * 1.5, 0.1 * u, 18, true), hcl, headG, [0, hc - R * 0.05, -R * 0.1], [-0.15, 0, 0]);
      P(tor(R * 0.55, 0.025 * u, Math.PI, 5, 12), col('T'), headG, [0, hc + R * 0.85, R * 0.75], [0, 0, 0]);
      break;
    case 'naval':
      P(cyl(R * 1.2, R * 1.08, 0.12 * u, 18), C.white, headG, [0, hc + R * 0.72, 0]);
      P(cyl(R * 1.09, R * 1.09, 0.045 * u, 18, true), hcl, headG, [0, hc + R * 0.64, 0]);
      P(cyl(R * 0.6, R * 0.6, 0.02 * u, 14, false), C.black, headG, [0, hc + R * 0.55, R * 0.85], null, [1, 1, 1.2]);
      break;
    case 'crown':
      P(cyl(R * 0.8, R * 0.8, 0.12 * u, 16, true), C.gold, headG, [0, hc + R * 0.95, 0]);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; P(cone(0.035 * u, 0.09 * u, 6), C.gold, headG, [Math.sin(a) * R * 0.78, hc + R * 0.95 + 0.1 * u, Math.cos(a) * R * 0.78]); }
      P(sph(0.03 * u, 6, 4), 0xd8303a, headG, [0, hc + R * 0.95, R * 0.82]);
      break;
  }
  return hc + R;   // altezza della cima della testa rispetto al collo
}

// ---------- armi (asse +z = in avanti, origine = impugnatura) ----------
function buildWeapon(kind, g, u, team) {
  const k = u / 1.1;
  switch (kind) {
    case 'lance':
      P(cyl(0.028 * k, 0.028 * k, 1.5 * k, 8), C.wood, g, [0, 0, 0.5 * k], [Math.PI / 2, 0, 0]);
      P(cone(0.11 * k, 0.2 * k, 12), C.steel, g, [0, 0, 0.12 * k], [Math.PI / 2, 0, 0]);
      P(cone(0.04 * k, 0.28 * k, 8), C.steel, g, [0, 0, 1.38 * k], [Math.PI / 2, 0, 0]);
      P(box(0.01 * k, 0.13 * k, 0.2 * k), col('T'), g, [0, 0.08 * k, 1.05 * k]);
      break;
    case 'javelin': case 'spear': {
      const Lh = kind === 'spear' ? 1.0 : 0.75;
      P(cyl(0.017 * k, 0.017 * k, Lh * k, 6), C.wood, g, [0, 0, (Lh / 2 - 0.2) * k], [Math.PI / 2, 0, 0]);
      P(cone(0.034 * k, 0.14 * k, 6), C.steel, g, [0, 0, (Lh - 0.13) * k], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'slingshot':
      P(cyl(0.016 * k, 0.016 * k, 0.12 * k, 6), C.wood, g, [0, -0.02 * k, 0.04 * k], [Math.PI / 2, 0, 0]);
      for (const s of [-1, 1]) P(cyl(0.012 * k, 0.012 * k, 0.1 * k, 6), C.wood, g, [s * 0.03 * k, 0.03 * k, 0.12 * k], [Math.PI / 2 - 0.5, 0, s * 0.5]);
      break;
    case 'rapier':
      P(box(0.014 * k, 0.014 * k, 0.62 * k), C.steel, g, [0, 0, 0.36 * k]);
      P(sph(0.055 * k, 10, 8, Math.PI / 2), C.gold, g, [0, 0, 0.05 * k], [Math.PI / 2, 0, 0]);
      break;
    case 'shotgun':
      for (const s of [-1, 1]) P(cyl(0.024 * k, 0.024 * k, 0.5 * k, 8), C.gray, g, [s * 0.025 * k, 0.01 * k, 0.32 * k], [Math.PI / 2, 0, 0]);
      P(box(0.06 * k, 0.08 * k, 0.26 * k), C.woodD, g, [0, -0.02 * k, -0.02 * k]);
      break;
    case 'mallet':
      P(cyl(0.02 * k, 0.02 * k, 0.55 * k, 8), C.wood, g, [0, 0, 0.24 * k], [Math.PI / 2, 0, 0]);
      P(cyl(0.1 * k, 0.1 * k, 0.24 * k, 12), C.woodD, g, [0, 0, 0.5 * k], [0, 0, Math.PI / 2]);
      for (const s of [-1, 1]) P(cyl(0.104 * k, 0.104 * k, 0.025 * k, 12), C.steelD, g, [s * 0.1 * k, 0, 0.5 * k], [0, 0, Math.PI / 2]);
      break;
    case 'dagger':
      P(box(0.03 * k, 0.012 * k, 0.2 * k), C.steel, g, [0, 0, 0.13 * k]);
      P(box(0.08 * k, 0.02 * k, 0.02 * k), C.gold, g, [0, 0, 0.03 * k]);
      break;
    case 'sword':
      P(box(0.05 * k, 0.014 * k, 0.42 * k), C.steel, g, [0, 0, 0.26 * k]);
      P(box(0.14 * k, 0.025 * k, 0.03 * k), C.gold, g, [0, 0, 0.04 * k]);
      break;
    case 'club':
      P(cyl(0.075 * k, 0.03 * k, 0.6 * k, 10), C.woodD, g, [0, 0, 0.3 * k], [-Math.PI / 2, 0, 0]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P(sph(0.02 * k, 6, 4), C.steel, g, [Math.cos(a) * 0.07 * k, Math.sin(a) * 0.07 * k, (0.42 + (i % 2) * 0.1) * k]); }
      break;
    case 'pistol': {
      P(box(0.04 * k, 0.05 * k, 0.22 * k), C.black, g, [0, 0.01 * k, 0.1 * k]);
      P(box(0.035 * k, 0.1 * k, 0.05 * k), C.woodD, g, [0, -0.05 * k, 0.0], [0.25, 0, 0]);
      const mz = new THREE.Object3D(); mz.name = 'muzzle'; mz.position.set(0, 0.01 * k, 0.24 * k); g.add(mz);
      break;
    }
    case 'bowsmall': case 'longbow': {
      const R = (kind === 'longbow' ? 0.36 : 0.26) * k;
      P(tor(R, 0.016 * k, Math.PI, 5, 16), C.wood, g, [0, 0, 0], [0, -Math.PI / 2, -Math.PI / 2]);
      P(cyl(0.004 * k, 0.004 * k, R * 2, 4), C.white, g, [0, 0, 0]);
      break;
    }
  }
}

// ---------- cavalcature ----------
function buildMount(L, inner, u) {
  const m = anim(new THREE.Group(), 'mount'); inner.add(m);
  const legs = [];
  if (L.mount === 'horse') {
    const hc = L.horse || 0x9a6232, mane = 0x2b1d12;
    P(sph(1, 16, 12), hc, m, [0, 0.62, 0], null, [0.24, 0.25, 0.5]);
    P(cyl(0.1, 0.13, 0.42, 10), hc, m, [0, 0.86, 0.42], [0.65, 0, 0]);
    P(sph(1, 12, 10), hc, m, [0, 1.06, 0.62], [0.5, 0, 0], [0.11, 0.12, 0.22]);
    P(sph(1, 8, 6), 0x2a1a10, m, [0, 1.0, 0.8], null, [0.09, 0.08, 0.06]);
    for (const s of [-1, 1]) {
      P(cone(0.035, 0.1, 6), hc, m, [s * 0.06, 1.2, 0.57]);
      P(sph(0.022, 6, 4), C.black, m, [s * 0.085, 1.1, 0.7]);
    }
    P(box(0.04, 0.22, 0.38), mane, m, [0, 1.0, 0.4], [0.7, 0, 0]);
    P(cyl(0.035, 0.07, 0.4, 8), mane, m, [0, 0.62, -0.55], [-0.6, 0, 0]);
    P(box(0.5, 0.06, 0.44), col('T'), m, [0, 0.86, -0.02]);
    P(box(0.52, 0.03, 0.46), C.gold, m, [0, 0.83, -0.02]);
    for (const [x, z] of [[-0.13, 0.32], [0.13, 0.32], [-0.13, -0.32], [0.13, -0.32]]) {
      const lg = anim(new THREE.Group(), 'mleg'); lg.position.set(x, 0.5, z); m.add(lg);
      P(cyl(0.055, 0.045, 0.42, 8), hc, lg, [0, -0.21, 0]);
      P(cyl(0.06, 0.06, 0.07, 8), 0x2a1a10, lg, [0, -0.45, 0]);
      legs.push(lg);
    }
    return { legs, saddle: 0.92 };
  }
  // maiale
  const pc = 0xf2a3a3, pd = 0xd98080;
  P(sph(1, 16, 12), pc, m, [0, 0.46, 0], null, [0.3, 0.27, 0.42]);
  P(sph(0.21, 14, 10), pc, m, [0, 0.55, 0.42]);
  P(cyl(0.085, 0.09, 0.08, 12), pd, m, [0, 0.52, 0.62], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    P(sph(0.018, 6, 4), 0x5a2a2a, m, [s * 0.03, 0.53, 0.665]);
    P(cone(0.06, 0.11, 6), pd, m, [s * 0.12, 0.74, 0.4], [0.3, 0, -s * 0.5]);
    P(sph(0.025, 6, 4), C.black, m, [s * 0.09, 0.62, 0.58]);
    P(cone(0.018, 0.09, 6), C.white, m, [s * 0.075, 0.45, 0.6], [-0.4, 0, 0]);
  }
  P(tor(0.05, 0.014, Math.PI * 1.5, 5, 10), pd, m, [0, 0.55, -0.42], [0, Math.PI / 2, 0]);
  P(box(0.46, 0.05, 0.36), col('T'), m, [0, 0.72, -0.02]);
  for (const [x, z] of [[-0.15, 0.22], [0.15, 0.22], [-0.15, -0.22], [0.15, -0.22]]) {
    const lg = anim(new THREE.Group(), 'mleg'); lg.position.set(x, 0.3, z); m.add(lg);
    P(cyl(0.06, 0.055, 0.26, 8), pc, lg, [0, -0.13, 0]);
    P(cyl(0.06, 0.06, 0.05, 8), 0x5a2a2a, lg, [0, -0.28, 0]);
    legs.push(lg);
  }
  return { legs, saddle: 0.76 };
}

// ---------- macchina (LucaB) ----------
function buildMachine(inner) {
  const g = inner;
  P(box(0.9, 0.3, 1.1), C.wood, g, [0, 0.42, 0]);
  for (let i = -2; i <= 2; i++) P(box(0.92, 0.02, 0.03), C.woodD, g, [0, 0.575, i * 0.2]);
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.38, 0.38]) {
    P(cyl(0.22, 0.22, 0.1, 16), C.woodD, g, [sx, 0.22, sz], [0, 0, Math.PI / 2]);
    P(cyl(0.06, 0.06, 0.12, 8), C.steelD, g, [sx, 0.22, sz], [0, 0, Math.PI / 2]);
  }
  P(cyl(0.16, 0.2, 0.18, 12), C.gray, g, [0, 0.66, 0]);
  P(cyl(0.07, 0.07, 0.75, 10), C.black, g, [0, 1.1, 0]);
  for (let i = 0; i < 6; i++) P(tor(0.13 - i * 0.008, 0.03, Math.PI * 2, 6, 16), 0xc77b30, g, [0, 0.8 + i * 0.1, 0], [Math.PI / 2, 0, 0]);
  const orb = K(sph(0.16, 16, 12), GLOW.orb.clone(), g, [0, 1.55, 0], null, null, 'orb');
  P(box(0.06, 0.4, 0.06), C.steelD, g, [0, 0.8, -0.45]);
  P(box(0.04, 0.04, 0.5), C.steelD, g, [0, 0.98, -0.25]);
  P(box(0.3, 0.06, 0.06), col('T'), g, [0, 0.6, 0.56]);
  return { orb };
}

// ---------- costruttore principale ----------
// opzioni: Ht (altezza in piedi), wf (larghezza), restR/restL (posa braccia)
function buildCharacter(key, team, o) {
  TEAM = team;
  const L = LOOKS[key];
  const root = new THREE.Group();
  const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const inner = anim(new THREE.Group(), 'inner'); inner.scale.setScalar(o.scale || 1); body.add(inner);
  const out = { root, parts: { body }, meta: {} };
  if (L.machine) {
    buildMachine(inner);
    out.meta = { top: 1.75 * (o.scale || 1), muzzleY: 1.55 * (o.scale || 1), machine: true };
    bakeAll(inner);
    return out;
  }
  const u = o.Ht, wf = o.wf || 1, sq = Math.sqrt(wf);
  const legL = 0.22 * u, torsoH = 0.3 * u, R = 0.2 * u;
  const hipY = legL, neckY = hipY + torsoH;
  let saddle = 0;
  if (L.mount) { const mt = buildMount(L, inner, u); saddle = mt.saddle; }
  const rider = new THREE.Group(); rider.name = 'rider'; inner.add(rider);
  if (L.mount) rider.position.set(0, saddle - hipY + 0.02, -0.05);
  rider.userData.anim = true;
  const top = col(L.top[0] === 'skin' ? SKIN[L.skin] : L.top[0]), style = L.top[1];
  const pants = col(L.pants), boots = col(L.boots);
  // gambe
  for (const s of [-1, 1]) {
    const lg = anim(new THREE.Group(), s < 0 ? 'legL' : 'legR'); lg.position.set(s * 0.075 * u * wf, hipY, 0); rider.add(lg);
    const lr = 0.052 * u * sq;
    P(cyl(lr, lr * 0.9, legL * 0.85, 10), pants, lg, [0, -legL * 0.42, 0]);
    P(sph(1, 10, 8), boots, lg, [0, -legL + 0.035 * u, lr * 0.5], null, [lr * 1.35, 0.048 * u, lr * 1.9]);
    if (L.mount) { lg.rotation.x = -1.35; lg.rotation.z = s * 0.45; }
  }
  // busto
  const tcy = hipY + torsoH * 0.5, rx = 0.16 * u * wf, rz = 0.13 * u * wf;
  P(sph(1, 16, 12), pants, rider, [0, hipY + 0.02 * u, 0], null, [rx * 0.88, 0.075 * u, rz * 0.9]);
  if (style === 'robe') P(cyl(rx * 0.95, rx * 1.35, legL * 0.95, 14), top, rider, [0, hipY - legL * 0.38, 0]);
  P(sph(1, 16, 12), top, rider, [0, tcy, 0], null, [rx, torsoH * 0.6, rz]);
  if (style === 'armor') {
    P(box(rx * 1.05, torsoH * 0.85, 0.02 * u), col('T'), rider, [0, tcy - 0.02 * u, rz * 0.93]);
    P(box(0.03 * u, torsoH * 0.6, 0.022 * u), C.gold, rider, [0, tcy, rz * 0.95]);
  }
  if (style === 'armor2') P(sph(1, 14, 10, Math.PI * 0.55), C.steel, rider, [0, tcy - 0.02 * u, 0], null, [rx * 1.04, torsoH * 0.62, rz * 1.04]);
  if (style === 'vest') P(box(0.05 * u, torsoH * 0.95, 0.02 * u), 0xeae2cc, rider, [0, tcy, rz * 0.96]);
  if (style === 'plaid') for (const dy of [-0.06, 0.05]) P(tor(rx * 0.95, 0.018 * u, Math.PI * 2, 5, 18), col('TD'), rider, [0, tcy + dy * u, 0], [Math.PI / 2, 0, 0], [1, rz / rx, 1]);
  if (style === 'stripes') for (const dy of [-0.07, 0.0, 0.07]) P(tor(rx * 0.97, 0.016 * u, Math.PI * 2, 5, 18), col('T'), rider, [0, tcy + dy * u, 0], [Math.PI / 2, 0, 0], [1, rz / rx, 1]);
  if (style === 'parka') P(tor(rx * 0.9, 0.045 * u, Math.PI * 2, 6, 18), C.white, rider, [0, hipY + 0.04 * u, 0], [Math.PI / 2, 0, 0], [1, rz / rx, 1]);
  P(tor(rx * 0.86, 0.022 * u, Math.PI * 2, 5, 18), col(L.belt || 0x4a2f1a), rider, [0, hipY + 0.06 * u, 0], [Math.PI / 2, 0, 0], [1, rz / rx, 1]);
  if (!L.belt) P(box(0.05 * u, 0.04 * u, 0.02 * u), C.gold, rider, [0, hipY + 0.06 * u, rz * 0.86]);
  if (L.scarf) P(tor(0.07 * u, 0.03 * u, Math.PI * 2, 6, 14), L.scarf, rider, [0, neckY - 0.01 * u, 0], [Math.PI / 2, 0, 0]);
  if (L.cape) {
    P(box(rx * 1.7, torsoH * 1.25, 0.02 * u), col(L.cape), rider, [0, tcy - 0.03 * u, -rz * 1.0], [0.12, 0, 0]);
    P(tor(0.08 * u, 0.02 * u, Math.PI * 2, 5, 12), L.trim || col('TD'), rider, [0, neckY - 0.01 * u, 0], [Math.PI / 2, 0, 0]);
  }
  if (L.jetpack) {
    P(box(0.17 * u, 0.2 * u, 0.1 * u), C.gray, rider, [0, tcy + 0.02 * u, -rz - 0.05 * u]);
    for (const s of [-1, 1]) {
      P(cyl(0.035 * u, 0.045 * u, 0.16 * u, 10), C.steelD, rider, [s * 0.06 * u, tcy - 0.06 * u, -rz - 0.07 * u]);
      K(cone(0.04 * u, 0.16 * u, 8), GLOW.flame, rider, [s * 0.06 * u, tcy - 0.2 * u, -rz - 0.07 * u], [Math.PI, 0, 0], null, 'flame');
    }
  }
  if (L.weapon === 'bomb') {
    const by = neckY + R * 2 + 0.12 * u;
    P(cyl(0.13 * u, 0.13 * u, 0.24 * u, 14), C.wood, rider, [0, by, 0], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) P(tor(0.132 * u, 0.012 * u, Math.PI * 2, 5, 16), C.steelD, rider, [s * 0.08 * u, by, 0], [0, Math.PI / 2, 0]);
    P(cyl(0.008 * u, 0.008 * u, 0.1 * u, 5), C.black, rider, [0.13 * u, by + 0.05 * u, 0], [0, 0, -0.5]);
    K(sph(0.025 * u, 6, 4), GLOW.spark, rider, [0.16 * u, by + 0.1 * u, 0], null, null, 'spark');
  }
  if (L.weapon === 'cannon') {
    const cy = neckY + 0.06 * u;
    P(cyl(0.12 * u, 0.15 * u, 0.8 * u, 14), C.gray, rider, [rx * 0.9, cy, 0.12 * u], [Math.PI / 2, 0, 0]);
    P(tor(0.12 * u, 0.025 * u, Math.PI * 2, 6, 14), C.black, rider, [rx * 0.9, cy, 0.52 * u]);
    P(sph(0.1 * u, 10, 8), C.gray, rider, [rx * 0.9, cy, -0.3 * u]);
  }
  // braccia
  const armL = 0.25 * u, ar = 0.045 * u * sq, hr = 0.058 * u * sq * (L.weapon === 'fists' ? 1.6 : 1);
  const sleeve = (style === 'armor' || style === 'armor2') ? C.steel : top;
  const hand = L.weapon === 'fists' ? 0x5a3a1a : (style === 'armor' ? C.steelD : SKIN[L.skin]);
  for (const s of [-1, 1]) {
    const ag = anim(new THREE.Group(), s < 0 ? 'armL' : 'armR');
    ag.position.set(s * (rx + 0.03 * u), neckY - 0.05 * u, 0); rider.add(ag);
    P(sph(ar * 1.35, 10, 8), sleeve, ag, [0, 0, 0]);
    P(cyl(ar, ar * 0.9, armL, 10), style === 'skin' ? SKIN[L.skin] : sleeve, ag, [0, -armL / 2, 0]);
    P(sph(hr, 10, 8), hand, ag, [0, -armL, 0]);
    const hg = new THREE.Group(); hg.position.set(0, -armL, 0); ag.add(hg);
    const w = L.weapon;
    if (s > 0) {
      const wg = new THREE.Group(); hg.add(wg);
      const along = ['lance', 'javelin', 'spear', 'shotgun', 'pistol', 'slingshot'].includes(w);
      wg.rotation.x = along ? Math.PI / 2 + (w === 'lance' ? 0.15 : 0) : 0;
      if (w === 'twoswords') buildWeapon('sword', wg, u);
      else if (w === 'fireball') { K(sph(0.1 * u, 12, 10), GLOW.fire, wg, [0, 0, 0.05 * u]); K(sph(0.055 * u, 8, 6), GLOW.fireCore, wg, [0, 0.02 * u, 0.09 * u]); }
      else if (w === 'iceorb') { K(sph(0.095 * u, 12, 10), GLOW.ice, wg, [0, 0, 0.05 * u]); }
      else if (w !== 'bow' && w !== 'longbow' && w !== 'bomb' && w !== 'cannon' && w !== 'fists') buildWeapon(w, wg, u);
    } else {
      const wg = new THREE.Group(); hg.add(wg);
      if (w === 'twoswords') buildWeapon('sword', wg, u);
      if (w === 'bow' || w === 'longbow') { wg.rotation.x = Math.PI / 2; buildWeapon(w === 'bow' ? 'bowsmall' : 'longbow', wg, u); }
      if (L.shield) {
        P(cyl(0.2 * u, 0.2 * u, 0.035 * u, 18), col('T'), wg, [0, 0.03 * u, 0.06 * u], [Math.PI / 2, 0, 0]);
        P(tor(0.2 * u, 0.018 * u, Math.PI * 2, 5, 18), C.steel, wg, [0, 0.03 * u, 0.08 * u]);
        P(sph(0.05 * u, 8, 6), C.gold, wg, [0, 0.03 * u, 0.09 * u]);
      }
    }
  }
  // testa
  const hg = anim(new THREE.Group(), 'head'); hg.position.set(0, neckY - 0.02 * u, 0); rider.add(hg);
  const headTop = buildHead(L, u, hg, R);
  // pose delle braccia
  const w = L.weapon;
  let restR = { x: -0.45, z: 0.2 }, restL = { x: -0.2, z: -0.2 };
  if (['lance', 'shotgun', 'spear', 'javelin', 'pistol', 'slingshot'].includes(w)) restR = { x: -1.35, z: 0.1 };
  if (w === 'bow' || w === 'longbow') { restR = { x: -1.3, z: 0.4 }; restL = { x: -1.45, z: -0.05 }; }
  if (w === 'bomb') { restR = { x: -2.9, z: 0.3 }; restL = { x: -2.9, z: -0.3 }; }
  if (w === 'cannon') restR = { x: -2.5, z: 0.15 };
  if (w === 'fireball' || w === 'iceorb') restR = { x: -1.05, z: 0.3 };
  if (w === 'twoswords') restL = { x: -0.45, z: -0.2 };
  if (L.shield) restL = { x: -0.9, z: -0.25 };
  if (w === 'fists') { restR = { x: -0.3, z: 0.35 }; restL = { x: -0.3, z: -0.35 }; }
  // posa iniziale (anche per i ritratti delle carte)
  const aR = rider.getObjectByName('armR'), aL = rider.getObjectByName('armL');
  aR.rotation.set(restR.x, 0, restR.z); aL.rotation.set(restL.x, 0, restL.z);
  bakeAll(inner);
  const riderY = L.mount ? rider.position.y : 0;
  out.meta = {
    top: (riderY + neckY - 0.02 * u + headTop + (w === 'bomb' ? 0.3 * u : 0) + (L.hat && ['wizard', 'robin'].includes(L.hat[0]) ? 0.25 * u : 0)) * (o.scale || 1),
    muzzleY: (riderY + neckY - 0.05 * u) * (o.scale || 1),
    restR, restL, mounted: !!L.mount, flying: !!L.jetpack
  };
  return out;
}

// ---------- modelli pronti (uno per carta e per squadra), poi clonati ----------
const templates = {};
function sizeFor(c) {
  const Ht = { S: 0.95, M: 1.12, L: 1.12, XL: 1.6 }[c.size];
  // più vita = più robusto, più veloce = più snello
  const lh = Math.log(c.hp + (c.shield || 0));
  let wf = 0.85 + (lh - Math.log(60)) / (Math.log(4000) - Math.log(60)) * 0.75;
  wf *= { lenta: 1.08, media: 1, rapida: 0.94, molto_rapida: 0.88 }[c.speed] || 1;
  return { Ht, wf: Math.max(0.8, Math.min(1.6, wf)) };
}
function template(key, team, opts) {
  const k = key + '|' + team;
  if (!templates[k]) templates[k] = buildCharacter(key, team, opts);
  return templates[k];
}
// istanza pronta all'uso: ritorna le parti animabili e un materiale proprio (per il lampo quando viene colpita)
function instance(key, team, opts) {
  const t = template(key, team, opts);
  const root = t.root.clone(true);
  const mat = BASE_MAT.clone();
  root.traverse(o => { if (o.isMesh && o.material === BASE_MAT) o.material = mat; });
  const get = n => root.getObjectByName(n);
  const parts = { body: get('body'), legL: get('legL'), legR: get('legR'), armL: get('armL'), armR: get('armR'), head: get('head'), muzzle: get('muzzle') };
  const legs = []; root.traverse(o => { if (o.name === 'mleg') legs.push(o); });
  if (legs.length) parts.mount = { legs };
  const flames = []; root.traverse(o => { if (o.name === 'flame' || o.name === 'spark') flames.push(o); });
  parts.flames = flames;
  const orb = get('orb'); if (orb) { orb.material = orb.material.clone(); parts.orb = orb; }
  return { root, parts, mat, meta: t.meta };
}
function forCard(c, team, VIS) {
  const sz = sizeFor(c);
  return instance(c.id, team, { Ht: sz.Ht, wf: sz.wf, scale: VIS });
}

// ---------- ritratti per le carte ----------
let pr = null;
const portraits = {};
function portrait(c) {
  if (portraits[c.id] !== undefined) return portraits[c.id];
  try {
    if (!pr) {
      pr = { r: new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }), scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(26, 150 / 180, 0.1, 50) };
      pr.r.setSize(150, 180); pr.r.setPixelRatio(1); pr.r.outputEncoding = THREE.sRGBEncoding; pr.r.setClearColor(0x000000, 0);
      pr.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.85));
      const d = new THREE.DirectionalLight(0xffffff, 0.75); d.position.set(2, 4, 5); pr.scene.add(d);
    }
    const ins = forCard(c, 'me', 1);
    const g = ins.root;
    g.rotation.y = -0.5;
    if (ins.meta.flying) g.position.y = 0;
    pr.scene.add(g);
    const b = new THREE.Box3().setFromObject(g), sz = new THREE.Vector3(), ce = new THREE.Vector3();
    b.getSize(sz); b.getCenter(ce);
    const h = Math.max(sz.y, sz.x * 1.15, sz.z * 0.9);
    const dist = h / (2 * Math.tan(THREE.MathUtils.degToRad(13))) * 1.02;
    pr.cam.position.set(ce.x, ce.y + h * 0.12, ce.z + dist);
    pr.cam.lookAt(ce.x, ce.y + h * 0.02, ce.z);
    pr.r.render(pr.scene, pr.cam);
    portraits[c.id] = pr.r.domElement.toDataURL('image/png');
    pr.scene.remove(g);
  } catch (e) { portraits[c.id] = null; }
  return portraits[c.id];
}

window.BazooChars = { LOOKS, forCard, instance, portrait, sizeFor, BASE_MAT, TEAM_COL };
})();
