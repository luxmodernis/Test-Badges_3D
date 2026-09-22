import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import polygonClipping from 'polygon-clipping';
import FRONT_SVG from '../Badge-S1-Expert-2.svg';
import BACK_SVG from '../Badge-S1-Expert-2-back.svg';

/* ============ Réglages ============ */
const DOME = 38;          // bombé vers l'avant au centre (unités SVG, écusson ≈ 430 de large)
const PAINT = 0.10;       // épaisseur de la première couche de peinture au dos (les suivantes s'empilent)
const BACK_PLATE = { z0: -6.2, depth: 5, bevel: 0.8 };   // plaque arrière qui porte la peinture
const BACK_CAP_Z = BACK_PLATE.z0 - BACK_PLATE.bevel;     // face arrière de la plaque (z = -7)

/* Face avant, chemins dans l'ordre du SVG (tout ce qui est vert -> métal) :
   0 écusson plein -> contour épais (percé par le panneau, chemin 1)   1 panneau -> fond
   2 marque rouge S#1                                                   3 mot EXPERT      */
const LAYERS = {
  0: { name: 'contour', z: 0, depth: 16, bevel: 4.0, mat: 'metal', edge: 5, round: 3.0, seg: 16 },
  1: { name: 'fond',    z: 0, depth: 3,  bevel: 1.2, mat: 'metal', edge: 6, round: 3.0, seg: 10 },
  2: { name: 'marque',  z: 4, depth: 4,  bevel: 1.0, mat: 'red',   edge: 4, round: 0.8, seg: 10 },
  3: { name: 'EXPERT',  z: 4, depth: 11, bevel: 2.0, mat: 'metal', edge: 4, round: 1.6, seg: 20 },
};

/* ============ Rendu ============ */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

/* Environnement de studio pour le chrome : un chrome ne montre que ce qu'il reflète.
   Grandes boîtes à lumière aux bords doux + bandes verticales + dégradé de fond sombre,
   de face comme de dos (le badge tourne). */
function studioEnvironment() {
  const env = new THREE.Scene();
  const canvasTex = (w, h, draw) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  // fond : dégradé vertical (plafond gris sombre -> horizon -> sol très sombre)
  const sky = canvasTex(4, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#6b707a'); g.addColorStop(0.5, '#494c55'); g.addColorStop(0.62, '#3a3c42'); g.addColorStop(1, '#26282d');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16),
    new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, toneMapped: false })));

  // boîte à lumière : rectangle lumineux aux bords adoucis ; `grad` = dégradé interne (0 = uniforme)
  const softbox = (w, h, pos, power, tint = '#ffffff', grad = 0) => {
    const tex = canvasTex(256, 256, (c, W, H) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      c.filter = 'blur(46px)';
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#fff'); g.addColorStop(1, `rgb(${255 * (1 - grad)},${255 * (1 - grad)},${255 * (1 - grad)})`);
      c.fillStyle = g; c.fillRect(56, 56, W - 112, H - 112);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(tint).multiplyScalar(power), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  // grand panneau réfléchi par les faces : bandes diagonales douces claires/sombres.
  // Le bombé les déforme et la rotation les fait glisser : c'est ce qui donne l'aspect « miroir ».
  const bands = (w, h, pos, power) => {
    const tex = canvasTex(256, 256, (c, W, H) => {
      const g = c.createLinearGradient(0, 0, W, H * 0.55);
      [[0, '#4a4a4a'], [0.18, '#565656'], [0.30, '#8a8a8a'], [0.40, '#c8c8c8'], [0.62, '#d8d8d8'],
       [0.75, '#7c7c7c'], [0.87, '#4a4a4a'], [1, '#6e6e6e']].forEach(([o, col]) => g.addColorStop(o, col));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.filter = 'blur(18px)'; c.drawImage(c.canvas, 0, 0);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(power, power, power), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(...pos); m.lookAt(pos[0], pos[1], 0); env.add(m);
  };
  softbox(26, 16, [0, 14, 4], 4.0);                       // plafond
  softbox(5, 26, [-14, 1, 5], 7.0, '#fff4e6');            // bande verticale gauche (chaude)
  softbox(4, 26, [14, 0, 4], 5.0, '#e4eeff');             // bande verticale droite (froide)
  softbox(44, 30, [3, 0, 18], 1.9, '#ffffff', 0.6);       // grand panneau de face, en dégradé
  bands(46, 34, [-3, 0, -18], 2.3);                        // idem côté dos
  softbox(5, 26, [-13, 1, -6], 6.0, '#fff4e6');           // bandes côté dos
  softbox(4, 26, [13, 0, -5], 4.5, '#e4eeff');
  return env;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studioEnvironment(), 0.09).texture;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0.9, -0.5, 9);

const key = new THREE.DirectionalLight(0xffffff, 0.55); key.position.set(-3, 4, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0); fill.position.set(4, -2, 3); scene.add(fill);   // éteinte : son reflet spéculaire direct produisait un point blanc net à certains angles
const back = new THREE.DirectionalLight(0xffffff, 0.35); back.position.set(3, 3, -6); scene.add(back);

const materials = {
  metal: new THREE.MeshPhysicalMaterial({
    color: 0xededed, metalness: 1.0, roughness: 0.12,
    clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.0,
  }),
  // peinture du dos (émail satiné), couleurs du SVG
  white: new THREE.MeshPhysicalMaterial({ color: 0xf4f4f4, metalness: 0, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
  logoGreen: new THREE.MeshPhysicalMaterial({ color: 0x008d5c, metalness: 0, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
  logoRed: new THREE.MeshPhysicalMaterial({ color: 0xed1b2f, metalness: 0, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
  red: new THREE.MeshPhysicalMaterial({
    color: 0xc80f1f, metalness: 0.0, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15,
  }),
};

/* ============ Géométrie : subdivision conforme + bombé ============ */
// Subdivise les arêtes trop longues. Une arête coupée l'est pour TOUS ses triangles (pas de T-jonction,
// donc pas de fissures après déformation). Finesse adaptative : `fine` pour les arêtes appartenant à un
// biseau ou une tranche (là où l'interpolation des normales se voit), `coarse` pour le reste : les grandes
// faces planes ont des normales exactes et n'ont pas besoin de sommets.
function refine(pos, idx, fine, coarse = 26) {
  const len = (a, b) => Math.hypot(pos[3*a]-pos[3*b], pos[3*a+1]-pos[3*b+1], pos[3*a+2]-pos[3*b+2]);
  const key = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
  let flat = [];                                                   // 1 = triangle plat (normale ≈ ±Z)
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i+1], c = idx[i+2];
    const ux = pos[3*b]-pos[3*a], uy = pos[3*b+1]-pos[3*a+1], uz = pos[3*b+2]-pos[3*a+2];
    const vx = pos[3*c]-pos[3*a], vy = pos[3*c+1]-pos[3*a+1], vz = pos[3*c+2]-pos[3*a+2];
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx, l = Math.hypot(nx, ny, nz);
    flat.push(l > 1e-12 && Math.abs(nz / l) >= 0.999 ? 1 : 0);
  }
  for (let pass = 0; pass < 16; pass++) {
    const fineEdges = new Set();
    for (let t = 0; t < flat.length; t++) if (!flat[t]) {
      const a = idx[3*t], b = idx[3*t+1], c = idx[3*t+2];
      fineEdges.add(key(a, b)); fineEdges.add(key(b, c)); fineEdges.add(key(c, a));
    }
    const lim = (a, b) => fineEdges.has(key(a, b)) ? fine : coarse;
    const mid = new Map(); let any = false; const out = [], of = [];
    const mp = (a, b) => {
      const k = key(a, b);
      let m = mid.get(k);
      if (m === undefined) {
        pos.push((pos[3*a]+pos[3*b])/2, (pos[3*a+1]+pos[3*b+1])/2, (pos[3*a+2]+pos[3*b+2])/2);
        m = pos.length / 3 - 1; mid.set(k, m);
      }
      return m;
    };
    for (let t = 0; t < flat.length; t++) {
      let a = idx[3*t], b = idx[3*t+1], c = idx[3*t+2];
      const f = flat[t];
      const s0 = len(a, b) > lim(a, b), s1 = len(b, c) > lim(b, c), s2 = len(c, a) > lim(c, a);
      const n = s0 + s1 + s2;
      if (!n) { out.push(a, b, c); of.push(f); continue; }
      any = true;
      if (n === 3) {
        const ab = mp(a, b), bc = mp(b, c), ca = mp(c, a);
        out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); of.push(f, f, f, f);
      } else if (n === 1) {
        if (s1) [a, b, c] = [b, c, a]; else if (s2) [a, b, c] = [c, a, b];   // arête coupée = (a,b)
        const m = mp(a, b);
        out.push(a, m, c, m, b, c); of.push(f, f);
      } else {
        if (!s0) [a, b, c] = [b, c, a]; else if (!s1) [a, b, c] = [c, a, b];  // arêtes coupées = (a,b) et (b,c)
        const ab = mp(a, b), bc = mp(b, c);
        out.push(ab, b, bc, a, ab, bc, a, bc, c); of.push(f, f, f);
      }
    }
    idx = out; flat = of;
    if (!any) break;
  }
  return idx;
}

// Normales lissées avec arêtes vives, pondérées par l'ANGLE au sommet (et non par l'aire) :
// le résultat ne dépend pas de la façon dont les grandes faces ont été triangulées.
function creasedNormals(pos, idx, crease) {
  const nT = idx.length / 3, cosC = Math.cos(crease);
  const fn = new Float32Array(nT * 3), ang = new Float32Array(nT * 3), exact = new Uint8Array(nT);
  const cnt = new Uint32Array(pos.length / 3 + 1);
  const ang3 = (ax, ay, az, bx, by, bz) => {
    const l = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz);
    return l > 0 ? Math.acos(Math.min(1, Math.max(-1, (ax*bx + ay*by + az*bz) / l))) : 0;
  };
  for (let t = 0; t < nT; t++) {
    const a = idx[3*t], b = idx[3*t+1], c = idx[3*t+2];
    const ux = pos[3*b]-pos[3*a], uy = pos[3*b+1]-pos[3*a+1], uz = pos[3*b+2]-pos[3*a+2];
    const vx = pos[3*c]-pos[3*a], vy = pos[3*c+1]-pos[3*a+1], vz = pos[3*c+2]-pos[3*a+2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const l = Math.hypot(nx, ny, nz);
    if (l > 1e-12) { fn[3*t] = nx/l; fn[3*t+1] = ny/l; fn[3*t+2] = nz/l;
      exact[t] = Math.abs(nz/l) > 0.9999 || Math.abs(nz/l) < 1e-4 ? 1 : 0;   // face plane ou paroi verticale
      const A = ang3(ux, uy, uz, vx, vy, vz);
      const B = ang3(-ux, -uy, -uz, pos[3*c]-pos[3*b], pos[3*c+1]-pos[3*b+1], pos[3*c+2]-pos[3*b+2]);
      ang[3*t] = A; ang[3*t+1] = B; ang[3*t+2] = Math.PI - A - B;
    }
    cnt[a + 1]++; cnt[b + 1]++; cnt[c + 1]++;
  }
  for (let i = 1; i < cnt.length; i++) cnt[i] += cnt[i - 1];             // CSR : coins incidents à chaque sommet
  const fill = cnt.slice(), corners = new Uint32Array(idx.length);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) corners[fill[idx[3*t+k]]++] = 3*t + k;
  const P = new Float32Array(idx.length * 3), N = new Float32Array(idx.length * 3);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const v = idx[3*t+k], o = 3 * (3*t + k);
    P[o] = pos[3*v]; P[o+1] = pos[3*v+1]; P[o+2] = pos[3*v+2];
    // Au raccord d'un congé avec une face plane (face avant/arrière ou paroi verticale), la vraie normale du
    // congé est celle de cette face : on l'impose (sinon 5° d'inclinaison se propagent en traînées).
    let sx = 0, sy = 0, sz = 0, ex = 0, ey = 0, ez = 0;
    for (let j = cnt[v]; j < cnt[v+1]; j++) {
      const cu = corners[j], u = (cu / 3) | 0, w = ang[cu];
      if (w <= 0) continue;
      const d = fn[3*t]*fn[3*u] + fn[3*t+1]*fn[3*u+1] + fn[3*t+2]*fn[3*u+2];
      const degenerate = fn[3*t] === 0 && fn[3*t+1] === 0 && fn[3*t+2] === 0;
      if (d >= cosC || degenerate) {
        sx += fn[3*u]*w; sy += fn[3*u+1]*w; sz += fn[3*u+2]*w;
        if (exact[u]) { ex += fn[3*u]*w; ey += fn[3*u+1]*w; ez += fn[3*u+2]*w; }
      }
    }
    if (ex || ey || ez) { sx = ex; sy = ey; sz = ez; }
    const l = Math.hypot(sx, sy, sz) || 1;
    N[o] = sx/l; N[o+1] = sy/l; N[o+2] = sz/l;
  }
  return { P, N };
}

let DOME_C = null;        // centre / demi-étendues de l'écusson, posé après lecture du SVG
function finish(geo, edge, coarse) {
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-3);
  const pos = Array.from(merged.attributes.position.array);
  const idx = refine(pos, Array.from(merged.index.array), edge, coarse);
  const { P, N } = creasedNormals(pos, idx, 0.55);   // normales de la forme PLATE

  // Bombé : z += f(x,y). Positions déplacées, normales transformées de façon exacte
  // (n' ∝ (nx - f_x·nz, ny - f_y·nz, nz)) : l'éclairage ne dépend pas de la triangulation.
  for (let k = 0; k < P.length; k += 3) {
    const u = (P[k] - DOME_C.x) / DOME_C.hx, v = (P[k+1] - DOME_C.y) / DOME_C.hy;
    const q = Math.max(0, 1 - (u*u + v*v) / 2), on = q > 0 ? 1 : 0;
    const fx = -DOME * u / DOME_C.hx * on, fy = -DOME * v / DOME_C.hy * on;
    P[k+2] += DOME * q;
    const nx = N[k] - fx * N[k+2], ny = N[k+1] - fy * N[k+2], nz = N[k+2], l = Math.hypot(nx, ny, nz) || 1;
    N[k] = nx / l; N[k+1] = ny / l; N[k+2] = nz / l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}

function addMesh(group, geo, name, mat, edge, coarse) {
  const m = new THREE.Mesh(finish(geo, edge, coarse), materials[mat]); m.name = name; group.add(m);
}

/* ============ Coins arrondis dans le plan ============ */
// Remplace chaque coin vif d'un contour par un petit arc (les courbes déjà lisses ne sont pas touchées),
// pour que les arêtes verticales des lettres et de l'écusson soient arrondies comme leurs bords.
function dedupe(pts) {
  const out = [];
  pts.forEach(p => { const l = out[out.length - 1]; if (!l || l.distanceTo(p) > 1e-4) out.push(p); });
  if (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < 1e-4) out.pop();
  return out;
}
function roundedPoints(pts, r, minTurn = 0.5) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const cur = pts[i], a = pts[(i + n - 1) % n].clone().sub(cur), b = pts[(i + 1) % n].clone().sub(cur);
    const la = a.length(), lb = b.length();
    if (!la || !lb) { out.push(cur); continue; }
    a.divideScalar(la); b.divideScalar(lb);
    const turn = Math.PI - Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));   // angle de virage au coin
    if (turn < minTurn) { out.push(cur); continue; }
    const d = Math.min(r, la * 0.45, lb * 0.45);
    const p1 = cur.clone().addScaledVector(a, d), p2 = cur.clone().addScaledVector(b, d);
    for (let k = 0; k <= 8; k++) {                                              // arc quadratique p1 -> p2 (contrôle = coin)
      const t = k / 8, u = 1 - t;
      out.push(new THREE.Vector2(u*u*p1.x + 2*u*t*cur.x + t*t*p2.x, u*u*p1.y + 2*u*t*cur.y + t*t*p2.y));
    }
  }
  return out;
}
function roundShape(shape, r) {
  if (!r) return shape;
  const s = new THREE.Shape(roundedPoints(dedupe(shape.getPoints(12)), r));
  shape.holes.forEach(h => s.holes.push(new THREE.Path(roundedPoints(dedupe(h.getPoints(12)), r))));
  return s;
}

/* ============ Face avant ============ */
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // aléa déterministe
const front = new SVGLoader().parse(FRONT_SVG);
const badge = new THREE.Group(); badge.name = 'BadgeExpert';

const outline = SVGLoader.createShapes(front.paths[0])[0];
{
  const pts = outline.getPoints(12), box = new THREE.Box2().setFromPoints(pts);
  const c = box.getCenter(new THREE.Vector2()), s = box.getSize(new THREE.Vector2());
  DOME_C = { x: c.x, y: c.y, hx: s.x / 2, hy: s.y / 2 };
}
const innerShape = SVGLoader.createShapes(front.paths[1])[0];

front.paths.forEach((path, i) => {
  const L = LAYERS[i]; if (!L) return;
  SVGLoader.createShapes(path).forEach(shape => {
    if (i === 0) shape.holes.push(new THREE.Path(innerShape.getPoints(12)));      // trou = panneau
    const vary = 1 + (rnd() - 0.5) * (i >= 2 ? 0.3 : 0.1);                        // rayon d'arrondi légèrement varié
    const g = new THREE.ExtrudeGeometry(roundShape(shape, L.round), {
      depth: L.depth, curveSegments: 12,
      bevelEnabled: true, bevelSize: L.bevel * vary, bevelThickness: L.bevel * vary * 0.85, bevelSegments: L.seg,
    });
    g.translate(0, 0, L.z);
    addMesh(badge, g, L.name, L.mat, L.edge);
  });
});

/* ============ Dos : texte et logos peints ============ */
const backSvg = new SVGLoader().parse(BACK_SVG);
const W = 431.46;                                        // largeur de l'écusson : miroir en X (le dos se lit de derrière)
const PAINT_MAT = { '#ededed': 'white', 'white': 'white', '#ffffff': 'white',
                    '#008d5c': 'logoGreen', '#ed1b2f': 'logoRed' };

const ringOf = (sub) => {
  const out = [];
  sub.getPoints(12).forEach(p => {
    const q = [W - p.x, p.y], l = out[out.length - 1];
    if (!l || Math.hypot(l[0]-q[0], l[1]-q[1]) > 1e-4) out.push(q);
  });
  return out;
};
// forme d'un chemin = OU exclusif de ses contours (règle pair-impair : trous des lettres, etc.)
const regionOf = (path) => path.subPaths.map(ringOf).filter(r => r.length > 2)
  .reduce((acc, r) => acc ? polygonClipping.xor(acc, [[r]]) : [[r]], null);
const shapeOf = (ring, holes = []) => {
  const s = new THREE.Shape(ring.map(p => new THREE.Vector2(p[0], p[1])));
  holes.forEach(h => s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1])))));
  return s;
};

// plaque arrière : écusson plein
const plateGeo = new THREE.ExtrudeGeometry(roundShape(SVGLoader.createShapes(backSvg.paths[0])[0], 3.0), {
  depth: BACK_PLATE.depth, curveSegments: 12,
  bevelEnabled: true, bevelSize: BACK_PLATE.bevel, bevelThickness: BACK_PLATE.bevel, bevelSegments: 8,
  bevelOffset: -(BACK_PLATE.bevel + 0.5),   // paroi rentrée de 0,5 sous le contour : pas d'intersection avec son arrondi
});
plateGeo.translate(0, 0, BACK_PLATE.z0);
addMesh(badge, plateGeo, 'plaque-dos', 'metal', 6, 8);   // faces fines : la peinture repose dessus

// peinture : une fine couche par chemin, dans l'ordre de dessin du SVG (les suivantes recouvrent les précédentes)
let layer = 0;
backSvg.paths.forEach((path, i) => {
  if (i === 0 || path.userData.node.nodeName !== 'path') return;     // 0 = écusson ; on ignore le <rect> du clipPath
  const mat = PAINT_MAT[(path.userData.style.fill || '').toLowerCase()];
  const region = mat && regionOf(path); if (!region) return;
  const d = PAINT + 0.05 * layer++;                                    // épaisseur croissante = ordre de recouvrement
  region.forEach(poly => {
    const g = new THREE.ExtrudeGeometry(shapeOf(poly[0], poly.slice(1)), { bevelEnabled: false, curveSegments: 1, depth: d });
    g.translate(0, 0, BACK_CAP_Z - d);                                 // posée sur la face arrière, vers l'extérieur
    addMesh(badge, g, 'peinture', mat, 6, 6);
  });
});

/* ============ Mise en scène ============ */
// SVG en Y vers le bas : on retourne Y (Three gère l'inversion des faces).
const holder = new THREE.Group(); holder.add(badge);
badge.scale.set(1, -1, 1);
const box = new THREE.Box3().setFromObject(holder);
const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
badge.position.set(-ctr.x, -ctr.y, -ctr.z);
holder.scale.setScalar(4.2 / Math.max(size.x, size.y));
holder.rotation.set(0.08, -0.25, 0);
scene.add(holder);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Rotation automatique très lente (un tour en ~2 min), en pause pendant la manipulation
const SPIN = 2 * Math.PI / 120;                                   // rad/s
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let targetY = -0.25, pausedUntil = 0;
const pause = (ms = 3000) => { pausedUntil = performance.now() + ms; };
renderer.domElement.addEventListener('pointerdown', () => pause(1e9));
addEventListener('pointerup', () => pause(0));       // reprend dès qu'on relâche, sans temps mort
addEventListener('wheel', () => pause(0), { passive: true });

// bouton Face / Dos : demi-tour depuis l'orientation courante
const btn = document.getElementById('flip');
const facingBack = () => Math.cos(holder.rotation.y + 0.25) < 0;
if (btn) btn.addEventListener('click', () => {
  targetY = holder.rotation.y + Math.PI;                          // demi-tour simple
  pause(0);                                                        // reprend dès la fin du clic, se fond dans le demi-tour
});

function resize() {
  const w = innerWidth || 1, h = innerHeight || 1;   // certains navigateurs rapportent 0×0 le temps d'une image
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const fitH = 4.2 * 1.35 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const len = Math.max(fitH, fitH / camera.aspect * 0.95);
  if (Number.isFinite(len) && len > 0) camera.position.setLength(len);   // sinon on garde la dernière position valide
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
let lastLabel = '';
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!reduceMotion && performance.now() > pausedUntil) targetY += SPIN * dt;
  holder.rotation.y += (targetY - holder.rotation.y) * (1 - Math.exp(-6 * dt));   // lissage indépendant du framerate
  if (btn) { const t = facingBack() ? 'Voir la face' : 'Voir le dos'; if (t !== lastLabel) btn.textContent = lastLabel = t; }
  controls.update(); renderer.render(scene, camera);
});

// Capture PNG (fond transparent) à une taille et une orientation données : __b.capture(largeur, hauteur, rotationY)
async function capture(w, h, rotY, rotX = 0.08) {
  pause(1e12);
  const saved = { rx: holder.rotation.x, ry: holder.rotation.y, tY: targetY, pos: camera.position.clone(), aspect: camera.aspect };
  targetY = rotY; holder.rotation.set(rotX, rotY, 0);
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const fitH = 4.2 * 1.28 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  camera.position.set(0.9, -0.5, 9).setLength(Math.max(fitH, fitH / camera.aspect));
  controls.target.set(0, 0, 0); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const blob = await new Promise(r => renderer.domElement.toBlob(r, 'image/png'));
  holder.rotation.set(saved.rx, saved.ry, 0); targetY = saved.tY; camera.position.copy(saved.pos);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); resize();
  pausedUntil = performance.now() + 3000;
  return blob;
}
window.__b = { capture, renderer, scene, camera, holder, controls, freeze: () => pause(1e12), setY: (y) => { targetY = y; } };
