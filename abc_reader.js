// abc_reader.js — минимальный читатель Alembic (Ogawa) для вьюера: иерархия, Xform, PolyMesh/SubD,
// Curves (как ломаные), FaceSet и shop_materialpath (как слоты материалов), анимация трансформов и точек.
// Файл читается кусками по требованию (fetch с Range или File.slice), целиком в память не грузится.
// Старый формат Alembic на HDF5 не поддерживается — только Ogawa (всё, что пишут Houdini/Max/Maya последние годы).
//
// Формат восстановлен по исходникам Alembic (AbcCoreOgawa): ReadUtil.cpp, OrData/CprData, WriteUtil.cpp.
import * as THREE from 'three';

const BLOCK = 1 << 20;              // кэш чтения блоками по 1 МБ: структура Ogawa разбросана по всему файлу
const CACHE_BLOCKS = 256;           // не больше 256 МБ в кэше

// ---------- источники байтов ----------

export function sourceFromFile(file) {
  return makeSource(file.size, async (off, len) => file.slice(off, off + len).arrayBuffer());
}

export function sourceFromUrl(url, size) {
  return makeSource(size, async (off, len) => {
    const r = await fetch(url, { headers: { Range: `bytes=${off}-${off + len - 1}` } });
    if (!r.ok) throw new Error(`чтение ${url}: HTTP ${r.status}`);
    return r.arrayBuffer();
  });
}

function makeSource(size, readRaw) {
  const blocks = new Map();
  async function block(i) {
    let p = blocks.get(i);
    if (p) { blocks.delete(i); blocks.set(i, p); return p; }     // LRU: свежий — в конец
    p = readRaw(i * BLOCK, Math.min(BLOCK, size - i * BLOCK)).then(b => new Uint8Array(b));
    blocks.set(i, p);
    if (blocks.size > CACHE_BLOCKS) blocks.delete(blocks.keys().next().value);
    return p;
  }
  return {
    size,
    // мелкие чтения — через кэш
    async bytes(off, len) {
      if (len <= 0) return new Uint8Array(0);
      if (len > BLOCK) return new Uint8Array(await readRaw(off, len));
      const b0 = Math.floor(off / BLOCK), b1 = Math.floor((off + len - 1) / BLOCK);
      if (b0 === b1) { const b = await block(b0); return b.subarray(off - b0 * BLOCK, off - b0 * BLOCK + len); }
      const out = new Uint8Array(len);
      let pos = 0;
      for (let i = b0; i <= b1; i++) {
        const b = await block(i);
        const s = i === b0 ? off - b0 * BLOCK : 0;
        const e = i === b1 ? off + len - b1 * BLOCK : b.length;
        out.set(b.subarray(s, e), pos); pos += e - s;
      }
      return out;
    },
    // крупные массивы — напрямую, в свой выровненный буфер
    async fresh(off, len) { return len > 0 ? readRaw(off, len) : new ArrayBuffer(0); },
  };
}

// ---------- Ogawa ----------

const u64 = (b, o) => { const d = new DataView(b.buffer, b.byteOffset + o, 8); return d.getUint32(0, true) + d.getUint32(4, true) * 4294967296; };
const u32 = (b, o) => new DataView(b.buffer, b.byteOffset + o, 4).getUint32(0, true);
const u16 = (b, o) => new DataView(b.buffer, b.byteOffset + o, 2).getUint16(0, true);
const utf8 = new TextDecoder('utf-8');

class Ogawa {
  constructor(src) { this.src = src; this.groups = new Map(); }
  async group(off) {
    if (!off) return [];
    if (this.groups.has(off)) return this.groups.get(off);
    const n = u64(await this.src.bytes(off, 8), 0);
    const kids = [];
    if (n) {
      const b = await this.src.bytes(off + 8, n * 8);
      const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
      for (let i = 0; i < n; i++) {
        const lo = d.getUint32(i * 8, true), hi = d.getUint32(i * 8 + 4, true);
        kids.push({ data: (hi & 0x80000000) !== 0, off: (hi & 0x7fffffff) * 4294967296 + lo });
      }
    }
    this.groups.set(off, kids);
    return kids;
  }
  async dataSize(off) { return off ? u64(await this.src.bytes(off, 8), 0) : 0; }
  async data(off) { const n = await this.dataSize(off); return n ? this.src.bytes(off + 8, n) : new Uint8Array(0); }
}

function parseMeta(s) {
  const m = {};
  for (const part of s.split(';')) { const i = part.indexOf('='); if (i > 0) m[part.slice(0, i)] = part.slice(i + 1); }
  return m;
}

function parseIndexedMeta(b) {
  const out = [{}];
  for (let p = 0; p < b.length;) { const n = b[p++]; out.push(parseMeta(utf8.decode(b.subarray(p, p + n)))); p += n; }
  return out;
}

const ACYCLIC = 1e300;     // AcyclicTimePerCycle = DBL_MAX / 32
function parseTimeSamplings(b) {
  const out = [];
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let p = 0; p < b.length;) {
    const maxSample = d.getUint32(p, true); p += 4;
    const tpc = d.getFloat64(p, true); p += 8;
    const n = d.getUint32(p, true); p += 4;
    const times = [];
    for (let i = 0; i < n; i++) { times.push(d.getFloat64(p, true)); p += 8; }
    out.push({ maxSample, tpc, times, acyclic: tpc > ACYCLIC });
  }
  if (!out.length) out.push({ maxSample: 1, tpc: 1, times: [0], acyclic: false });
  return out;
}

function sampleTime(ts, i) {
  if (ts.acyclic) return ts.times[Math.min(i, ts.times.length - 1)];
  const n = ts.times.length;
  return ts.times[i % n] + Math.floor(i / n) * ts.tpc;
}

function sampleAt(ts, count, t) {      // последний сэмпл, чьё время <= t (+ полкадра погрешности)
  if (count <= 1) return 0;
  let lo = 0, hi = count - 1;
  const eps = ts.acyclic ? 1e-9 : ts.tpc / (2 * ts.times.length);
  if (t <= sampleTime(ts, 0) + eps) return 0;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (sampleTime(ts, mid) <= t + eps) lo = mid; else hi = mid - 1; }
  return lo;
}

function parseObjectHeaders(b, metas) {
  const out = [];
  const end = b.length - 32;       // последние 32 байта — хэши
  for (let p = 0; p < end;) {
    const n = u32(b, p); p += 4;
    const name = utf8.decode(b.subarray(p, p + n)); p += n;
    const mi = b[p++];
    let meta;
    if (mi === 0xff) { const m = u32(b, p); p += 4; meta = parseMeta(utf8.decode(b.subarray(p, p + m))); p += m; }
    else meta = metas[mi] || {};
    out.push({ name, meta });
  }
  return out;
}

function parsePropertyHeaders(b, metas) {
  const out = [];
  for (let p = 0; p < b.length;) {
    const info = u32(b, p); p += 4;
    const hint = (info >> 2) & 3;
    const rd = () => { let v; if (hint === 0) { v = b[p]; p += 1; } else if (hint === 1) { v = u16(b, p); p += 2; } else { v = u32(b, p); p += 4; } return v; };
    const ptype = info & 3;
    const h = { type: ptype === 0 ? 'compound' : ptype === 1 ? 'scalar' : 'array' };
    if (ptype !== 0) {
      h.pod = (info >> 4) & 0xf;
      h.extent = (info >> 12) & 0xff;
      h.n = rd();
      if (info & 0x200) { h.first = rd(); h.last = rd(); }
      else if (info & 0x800) { h.first = 0; h.last = 0; }
      else { h.first = 1; h.last = h.n - 1; }
      h.ts = info & 0x100 ? rd() : 0;
    }
    const nn = rd();
    h.name = utf8.decode(b.subarray(p, p + nn)); p += nn;
    const mi = (info >> 20) & 0xff;
    if (mi === 0xff) { const m = rd(); h.meta = parseMeta(utf8.decode(b.subarray(p, p + m))); p += m; }
    else h.meta = metas[mi] || {};
    out.push(h);
  }
  return out;
}

const POD = [  // [размер, конструктор]
  [1, Uint8Array], [1, Uint8Array], [1, Int8Array], [2, Uint16Array], [2, Int16Array], [4, Uint32Array], [4, Int32Array],
  [8, BigUint64Array], [8, BigInt64Array], [2, Uint16Array], [4, Float32Array], [8, Float64Array], [1, null], [4, null]];

function storedIndex(h, i) {
  if ((h.first === 0 && h.last === 0) || i < h.first) return 0;
  if (i >= h.last) return h.last - h.first + 1;
  return i - h.first + 1;
}

class Archive {
  constructor(src) { this.src = src; this.og = new Ogawa(src); this.compounds = new Map(); }

  async open() {
    const head = await this.src.bytes(0, 16);
    if (utf8.decode(head.subarray(0, 5)) !== 'Ogawa')
      throw new Error('это не Alembic/Ogawa (старый HDF5-формат не поддерживается)');
    if (head[5] !== 0xff) throw new Error('файл Alembic не дописан (Ogawa не «заморожен»)');
    const kids = await this.og.group(u64(head, 8));
    if (kids.length < 6) throw new Error('неожиданная структура архива');
    this.metas = parseIndexedMeta(await this.og.data(kids[5].off));
    this.ts = parseTimeSamplings(await this.og.data(kids[4].off));
    this.archiveMeta = parseMeta(utf8.decode(await this.og.data(kids[3].off)));
    this.top = kids[2].off;
  }

  async object(off, name, meta, path) {
    const kids = await this.og.group(off);
    const node = { name, meta, path, propsOff: 0, children: [] };
    if (kids.length && !kids[0].data) node.propsOff = kids[0].off;
    if (kids.length && kids[kids.length - 1].data) {
      const headers = parseObjectHeaders(await this.og.data(kids[kids.length - 1].off), this.metas);
      for (let i = 0; i < headers.length; i++) {
        const k = kids[i + 1];
        if (k && !k.data) node.children.push(await this.object(k.off, headers[i].name, headers[i].meta, path + '/' + headers[i].name));
      }
    }
    return node;
  }

  async compound(off) {          // Map имя -> заголовок свойства (с полем off)
    if (!off) return new Map();
    if (this.compounds.has(off)) return this.compounds.get(off);
    const kids = await this.og.group(off);
    const map = new Map();
    if (kids.length && kids[kids.length - 1].data) {
      const hs = parsePropertyHeaders(await this.og.data(kids[kids.length - 1].off), this.metas);
      hs.forEach((h, i) => { h.off = kids[i] ? kids[i].off : 0; map.set(h.name, h); });
    }
    this.compounds.set(off, map);
    return map;
  }

  async scalar(h, i) {
    const kids = await this.og.group(h.off);
    const k = kids[storedIndex(h, i)];
    if (!k) return null;
    const b = await this.og.data(k.off);
    if (b.length <= 16) return null;
    return typed(h.pod, b.slice(16).buffer);
  }

  async array(h, i) {
    const kids = await this.og.group(h.off);
    const k = kids[2 * storedIndex(h, i)];
    if (!k || !k.off) return typed(h.pod, new ArrayBuffer(0));
    const size = await this.og.dataSize(k.off);
    if (size <= 16) return typed(h.pod, new ArrayBuffer(0));
    return typed(h.pod, await this.src.fresh(k.off + 8 + 16, size - 16));
  }

  timeOf(h) { return this.ts[h.ts] || this.ts[0]; }
}

function typed(pod, buf) {
  if (pod === 12) return utf8.decode(new Uint8Array(buf)).split('\0').slice(0, -1);
  const [size, Ctor] = POD[pod] || [1, Uint8Array];
  return new Ctor(buf, 0, Math.floor(buf.byteLength / size));
}

// ---------- матрица Xform ----------

const RAD = Math.PI / 180;
function xformMatrix(ops, vals, out) {
  out.identity();
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  let p = 0;
  for (const op of ops) {
    const type = op >> 4;
    if (type === 0) { m.makeScale(vals[p], vals[p + 1], vals[p + 2]); p += 3; }
    else if (type === 1) { m.makeTranslation(vals[p], vals[p + 1], vals[p + 2]); p += 3; }
    else if (type === 2) { v.set(vals[p], vals[p + 1], vals[p + 2]); if (v.lengthSq() > 0) v.normalize(); else v.set(1, 0, 0); m.makeRotationAxis(v, vals[p + 3] * RAD); p += 4; }
    else if (type === 3) { m.fromArray(Array.from(vals.slice(p, p + 16))); p += 16; }   // Imath (строки) = three (столбцы)
    else if (type === 4) { m.makeRotationX(vals[p] * RAD); p += 1; }
    else if (type === 5) { m.makeRotationY(vals[p] * RAD); p += 1; }
    else if (type === 6) { m.makeRotationZ(vals[p] * RAD); p += 1; }
    else continue;
    out.multiply(m);
  }
  return out;
}

// ---------- сборка сцены ----------

const DEFAULT_MAT = new THREE.MeshStandardMaterial({ name: '(без материала)', color: 0xb9bcc2 });
DEFAULT_MAT.userData.shared = true;

export async function openAlembic(src, onProgress = () => {}) {
  const arc = new Archive(src);
  await arc.open();
  const top = await arc.object(arc.top, '', {}, '');
  const root = new THREE.Group();
  root.name = 'ABC';
  const updaters = [];          // async (t) => void для анимированных частей
  const stats = { xforms: 0, meshes: 0, curves: 0, skipped: {} };
  const matCache = new Map();
  let tMin = Infinity, tMax = -Infinity, fps = 0;
  const noteAnim = h => {
    if (!h || h.n <= 1) return false;
    const ts = arc.timeOf(h);
    tMin = Math.min(tMin, sampleTime(ts, 0)); tMax = Math.max(tMax, sampleTime(ts, h.n - 1));
    if (!ts.acyclic && ts.times.length === 1 && ts.tpc > 0) fps = Math.max(fps, 1 / ts.tpc);
    return true;
  };
  const material = name => {
    if (!matCache.has(name)) matCache.set(name, new THREE.MeshStandardMaterial({ name, color: 0xb9bcc2 }));
    return matCache.get(name);
  };
  let count = 0;

  async function geomOf(node) {
    const props = await arc.compound(node.propsOff);
    for (const key of ['.geom', '.xform']) if (props.has(key) && props.get(key).type === 'compound') return arc.compound(props.get(key).off);
    return new Map();
  }

  async function build(node, parent) {
    const schema = node.meta.schema || '';
    let obj = parent;
    if (++count % 50 === 0) onProgress(`объектов: ${count}`);
    if (schema.startsWith('AbcGeom_Xform')) {
      stats.xforms++;
      const g = new THREE.Group(); g.name = node.name; g.matrixAutoUpdate = false;
      const x = await geomOf(node);
      const opsH = x.get('.ops'), valsH = x.get('.vals');
      const ops = opsH ? await (opsH.type === 'array' ? arc.array(opsH, 0) : arc.scalar(opsH, 0)) : null;
      const readVals = i => valsH ? (valsH.type === 'array' ? arc.array(valsH, i) : arc.scalar(valsH, i)) : null;
      if (ops && ops.length) {
        xformMatrix(ops, (await readVals(0)) || [], g.matrix);
        if (noteAnim(valsH)) {
          let cur = 0;
          updaters.push(async t => {
            const i = sampleAt(arc.timeOf(valsH), valsH.n, t);
            if (storedIndex(valsH, i) === cur) return;
            cur = storedIndex(valsH, i);
            const v = await readVals(i);
            if (v) { xformMatrix(ops, v, g.matrix); g.matrixWorldNeedsUpdate = true; }
          });
        }
      }
      parent.add(g); obj = g;
    } else if (schema.startsWith('AbcGeom_PolyMesh') || schema.startsWith('AbcGeom_SubD')) {
      obj = await buildMesh(node, parent) || parent;
    } else if (schema.startsWith('AbcGeom_Curve')) {
      obj = await buildCurves(node, parent) || parent;
    } else if (schema && !schema.startsWith('AbcGeom_FaceSet')) {
      const k = schema.replace(/^AbcGeom_|_v\d+$/g, '');
      stats.skipped[k] = (stats.skipped[k] || 0) + 1;
    }
    for (const c of node.children) await build(c, obj);
  }

  async function faceGroups(node, geom, nFaces) {
    // слоты: FaceSet-дети (имя набора) или строковый shop_materialpath на гранях
    const sets = node.children.filter(c => (c.meta.schema || '').startsWith('AbcGeom_FaceSet'));
    let names = [], group = null;
    if (sets.length) {
      group = new Int32Array(nFaces).fill(-1);
      for (const s of sets) {
        const fh = (await geomOf(s)).get('.faces');
        if (!fh) continue;
        const faces = await arc.array(fh, 0);
        const gi = names.length; names.push(s.name);
        for (const f of faces) if (f < nFaces) group[f] = gi;
      }
    } else {
      const agp = geom.get('.arbGeomParams');
      const params = agp && agp.type === 'compound' ? await arc.compound(agp.off) : new Map();
      const ph = params.get('shop_materialpath') || params.get('material') || params.get('materialpath');
      if (ph) {
        let vals, idx = null;
        if (ph.type === 'compound') {
          const sub = await arc.compound(ph.off);
          vals = sub.has('.vals') ? await arc.array(sub.get('.vals'), 0) : null;
          idx = sub.has('.indices') ? await arc.array(sub.get('.indices'), 0) : null;
        } else if (ph.type === 'array') vals = await arc.array(ph, 0);
        if (vals && vals.length) {
          const lookup = new Map();
          group = new Int32Array(nFaces).fill(-1);
          for (let f = 0; f < nFaces; f++) {
            const s = idx ? vals[idx[f]] : vals[vals.length === 1 ? 0 : f];
            if (s === undefined || s === '') continue;     // пустой путь = без материала
            if (!lookup.has(s)) { lookup.set(s, names.length); names.push(s); }
            group[f] = lookup.get(s);
          }
        }
      }
    }
    return { names, group };
  }

  function triangulate(counts, indices, faceGroup, nGroups) {
    let ntri = 0;
    for (const c of counts) if (c > 2) ntri += c - 2;
    const corner = new Uint32Array(ntri * 3), triGroup = new Int32Array(ntri);
    let ii = 0, t = 0;
    for (let f = 0; f < counts.length; f++) {
      const c = counts[f];
      for (let k = 1; k < c - 1; k++) {        // Alembic обходит грани по часовой — разворачиваем
        corner[t * 3] = indices[ii]; corner[t * 3 + 1] = indices[ii + k + 1]; corner[t * 3 + 2] = indices[ii + k];
        triGroup[t] = faceGroup ? faceGroup[f] : -1; t++;
      }
      ii += c;
    }
    if (!faceGroup) return { corner, groups: null };
    // сортировка треугольников по слотам (без слота — в конец)
    const slot = g => (g < 0 ? nGroups : g);
    const start = new Uint32Array(nGroups + 2);
    for (let i = 0; i < ntri; i++) start[slot(triGroup[i]) + 1]++;
    for (let g = 0; g <= nGroups; g++) start[g + 1] += start[g];
    const sorted = new Uint32Array(ntri * 3), fill = start.slice();
    for (let i = 0; i < ntri; i++) {
      const d = fill[slot(triGroup[i])]++;
      sorted[d * 3] = corner[i * 3]; sorted[d * 3 + 1] = corner[i * 3 + 1]; sorted[d * 3 + 2] = corner[i * 3 + 2];
    }
    const groups = [];
    for (let g = 0; g <= nGroups; g++) if (start[g + 1] > start[g]) groups.push({ start: start[g] * 3, count: (start[g + 1] - start[g]) * 3, mat: g });
    return { corner: sorted, groups };
  }

  function expand(P, corner, out) {
    for (let c = 0, n = corner.length; c < n; c++) {
      const j = corner[c] * 3;
      out[c * 3] = P[j]; out[c * 3 + 1] = P[j + 1]; out[c * 3 + 2] = P[j + 2];
    }
  }

  async function buildMesh(node, parent) {
    const geom = await geomOf(node);
    const hP = geom.get('P'), hI = geom.get('.faceIndices'), hC = geom.get('.faceCounts');
    if (!hP || !hI || !hC) return null;
    stats.meshes++;
    const counts = await arc.array(hC, 0), indices = await arc.array(hI, 0);
    const { names, group } = await faceGroups(node, geom, counts.length);
    let tri = triangulate(counts, indices, group, names.length);
    const P = await arc.array(hP, 0);
    const pos = new Float32Array(tri.corner.length * 3);
    expand(P, tri.corner, pos);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    let mats = DEFAULT_MAT;
    if (tri.groups) {
      mats = names.map(material).concat([DEFAULT_MAT]);
      for (const gr of tri.groups) g.addGroup(gr.start, gr.count, gr.mat);
    }
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mats);
    mesh.name = node.name;
    parent.add(mesh);

    const animP = noteAnim(hP), animT = noteAnim(hC) || noteAnim(hI);
    if (animP || animT) {
      mesh.frustumCulled = false;
      let curP = 0, curT = 0;
      updaters.push(async t => {
        const iP = sampleAt(arc.timeOf(hP), hP.n, t);
        const iT = animT ? sampleAt(arc.timeOf(hC), hC.n, t) : 0;
        const sP = storedIndex(hP, iP), sT = animT ? storedIndex(hC, iT) * 65536 + storedIndex(hI, iT) : 0;
        if (sP === curP && sT === curT) return;
        const Pn = await arc.array(hP, iP);
        if (sT !== curT) {                     // топология меняется (жидкости, частицы-меши): слоты не держим
          const c2 = await arc.array(hC, iT), i2 = await arc.array(hI, iT);
          tri = triangulate(c2, i2, null, 0);
          g.clearGroups();
          mesh.material = DEFAULT_MAT; mesh.userData.origMaterial = DEFAULT_MAT;
        }
        curP = sP; curT = sT;
        let attr = g.getAttribute('position');
        if (attr.array.length !== tri.corner.length * 3) {
          attr = new THREE.BufferAttribute(new Float32Array(tri.corner.length * 3), 3);
          g.setAttribute('position', attr); g.deleteAttribute('normal');
        }
        expand(Pn, tri.corner, attr.array);
        attr.needsUpdate = true;
        g.computeVertexNormals();
        mesh.userData.tris = tri.corner.length / 3;
      });
    }
    return mesh;
  }

  async function buildCurves(node, parent) {
    const geom = await geomOf(node);
    const hP = geom.get('P'), hN = geom.get('nVertices');
    if (!hP || !hN) return null;
    stats.curves++;
    const nv = await arc.array(hN, 0);
    let segs = 0;
    for (const n of nv) if (n > 1) segs += n - 1;
    const idx = new Uint32Array(segs * 2);
    let p = 0, s = 0;
    for (const n of nv) { for (let k = 0; k < n - 1; k++) { idx[s++] = p + k; idx[s++] = p + k + 1; } p += n; }
    const P = await arc.array(hP, 0);
    const pos = new Float32Array(idx.length * 3);
    expand(P, idx, pos);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc9ced6 }));
    line.name = node.name;
    line.userData.segs = segs;
    parent.add(line);
    if (noteAnim(hP)) {
      line.frustumCulled = false;
      let cur = 0;
      updaters.push(async t => {
        const i = sampleAt(arc.timeOf(hP), hP.n, t);
        if (storedIndex(hP, i) === cur) return;
        cur = storedIndex(hP, i);
        const Pn = await arc.array(hP, i);
        if (Pn.length < p * 3) return;           // число точек изменилось — кадр пропускаем
        expand(Pn, idx, g.getAttribute('position').array);
        g.getAttribute('position').needsUpdate = true;
      });
    }
    return line;
  }

  for (const c of top.children) await build(c, root);

  // применить первый кадр анимации (трансформы с n>1 уже стоят на сэмпле 0)
  const anim = updaters.length && tMax > tMin ? { start: tMin, end: tMax, fps } : null;
  let target = anim ? anim.start : 0, applied = NaN, busy = false;
  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (applied !== target) {
        const t = target;
        for (const u of updaters) await u(t);
        applied = t;
      }
    } finally { busy = false; }
  }
  return {
    root, stats, anim,
    meta: arc.archiveMeta,
    seek(t) { target = t; pump(); },          // асинхронно; рендер показывает последний готовый кадр
    get busy() { return busy; },
  };
}
