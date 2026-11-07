// model_worker.js — разбор моделей в фоновом потоке, чтобы окно не замирало на тяжёлых файлах.
//
// Окно присылает { id, ext, name, buffer, files: {имя: blob-URL}, texBase }, поток разбирает файл загрузчиком
// three.js и возвращает «упаковку»: дерево объектов, геометрию (массивы передаются без копирования),
// материалы, анимации и источники текстур. Картинки здесь не декодируются (в потоке нет document):
// записывается, откуда их грузить, а встроенные в файл — передаются байтами. Окно собирает сцену
// заново (unpackScene в index.html). Не вышло — буфер возвращается, и окно разбирает файл само.
//
// Поддержаны: FBX, GLB/GLTF, OBJ (материалы MTL окно накладывает само), STL, PLY, 3DS.
// DAE и 3MF разбираются в окне: их загрузчикам нужен DOMParser, которого в потоке нет.

// адрес three.js присылает окно (в веб-сборке папка с отпечатком версии — старый кэш не мешает)
let THREE = null, L = '', BASE = '', ready = null;
function init(base) {
  return ready || (ready = (async () => {
    BASE = base;
    THREE = await import(base + 'build/three.module.js');
    // загрузчик USD взят из three.js 0.187 и зовёт методы очереди картинок, которых в r160 нет — пустые заглушки
    for (const m of ['setPriority', 'setCache']) if (!THREE.Loader.prototype[m]) THREE.Loader.prototype[m] = function () { return this; };
    L = base + 'examples/jsm/';
    // TextureLoader (FBX, 3DS, GLTF в Safari) идёт через ImageLoader — картинку не грузим, только запоминаем адрес
    THREE.ImageLoader.prototype.load = function (url, onLoad) {
      if (this.path !== undefined && !/^(blob:|data:)/.test(url)) url = this.path + url;
      url = this.manager.resolveURL(url);
      const img = stubImage(url, '');
      if (onLoad) onLoad(img);
      return img;
    };
  })());
}

self.window = self;                         // FBXLoader пишет window.URL.createObjectURL

// ------------------------------------------------------------------ текстуры: только адрес, без декодирования
const pending = [];                          // чтение встроенных картинок (blob:) — дождаться перед отправкой
function stubImage(url, kind) {
  const img = { __src: url, __kind: kind, width: 1, height: 1 };
  if (/^blob:/.test(url)) {                  // встроенная в файл: забрать байты сейчас, пока адрес жив
    pending.push(fetch(url).then(r => r.arrayBuffer()).then(b => { img.__bytes = b; }).catch(() => {}));
  }
  return img;
}
class StubLoader {
  constructor(kind) { this.kind = kind; this.path = ''; }
  setPath(p) { this.path = p || ''; return this; }
  setCrossOrigin() { return this; }
  setWithCredentials() { return this; }
  setRequestHeader() { return this; }
  load(url, onLoad) {
    const full = /^(blob:|data:|https?:|\/)/.test(url) ? url : this.path + url;
    const t = new THREE.Texture();
    t.image = stubImage(full, this.kind);
    if (onLoad) onLoad(t);
    return t;
  }
  loadAsync(url) { return Promise.resolve(this.load(url)); }
}

function makeManager(files, texBase) {
  const m = new THREE.LoadingManager();
  m.addHandler(/\.tga$/i, new StubLoader('tga'));
  // файлы рядом с моделью (.bin у GLTF): брошенные вместе с ней или по адресу texBase (его задаёт приложение-хост)
  m.setURLModifier(url => {
    if (/^(blob|data):/.test(url)) return url;
    let base = url.split(/[\\/]/).pop().split('?')[0];
    try { base = decodeURIComponent(base); } catch (e) {}
    return files[base.toLowerCase()] || (texBase ? texBase + encodeURIComponent(base) : url);
  });
  return m;
}

// ------------------------------------------------------------------ разбор
function deindex(obj) {
  const done = new Map();
  obj.traverse(o => {
    if (!o.isMesh || !o.geometry.index) return;
    if (!done.has(o.geometry)) done.set(o.geometry, o.geometry.toNonIndexed());
    o.geometry = done.get(o.geometry);
  });
}
const grey = () => new THREE.MeshStandardMaterial({ name: 'материал', color: 0xb4b4b4, roughness: 0.6, metalness: 0.05 });

async function parse(ext, buffer, name, files, texBase) {
  const manager = makeManager(files, texBase);
  const base = name.replace(/\.[^.]+$/, '');
  let obj, animations = [], extra = {};
  if (ext === '.fbx') {
    const { FBXLoader } = await import(L + 'loaders/FBXLoader.mv.js');
    obj = new FBXLoader(manager).parse(buffer, '');
    animations = obj.animations || [];
  } else if (ext === '.glb' || ext === '.gltf') {
    const { GLTFLoader } = await import(L + 'loaders/GLTFLoader.js');
    const { DRACOLoader } = await import(L + 'loaders/DRACOLoader.js');
    const { MeshoptDecoder } = await import(L + 'libs/meshopt_decoder.module.js');
    const loader = new GLTFLoader(manager);
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath(L + 'libs/draco/gltf/');
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      const gltf = await new Promise((ok, bad) => loader.parse(buffer, '', ok, bad));
      obj = gltf.scene; animations = gltf.animations || [];
    } finally { draco.dispose(); }
  } else if (ext === '.obj') {
    const { OBJLoader } = await import(L + 'loaders/OBJLoader.js');
    obj = new OBJLoader(manager).parse(new TextDecoder().decode(buffer));
  } else if (ext === '.stl') {                // единиц нет, по обычаю — мм; оси как в CAD (Z вверх)
    const { STLLoader } = await import(L + 'loaders/STLLoader.js');
    const g = new STLLoader().parse(buffer);
    const m = grey();
    if (g.hasColors) { m.vertexColors = true; m.color.set(0xffffff); if (g.alpha < 1) { m.transparent = true; m.opacity = g.alpha; } }
    obj = new THREE.Group(); obj.add(Object.assign(new THREE.Mesh(g, m), { name: base }));
    extra = { units: { mpu: 0.001, how: 'принято для STL' }, zup: true };
  } else if (ext === '.ply') {                // сетка или облако точек (скан)
    const { PLYLoader } = await import(L + 'loaders/PLYLoader.js');
    const g = new PLYLoader().parse(buffer);
    const colors = !!g.attributes.color;
    obj = new THREE.Group();
    if (g.index && g.index.count) {
      const m = grey();
      if (colors) { m.vertexColors = true; m.color.set(0xffffff); }
      obj.add(Object.assign(new THREE.Mesh(g, m), { name: base }));
    } else {
      const pm = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: colors, color: colors ? 0xffffff : 0xc8c8c8 });
      obj.add(Object.assign(new THREE.Points(g, pm), { name: base }));
      extra.rows = [['Точки', Math.round(g.attributes.position.count).toLocaleString('ru-RU')]];
    }
  } else if (ext === '.3ds') {                 // формат 3ds Max: Z вверх, свой масштаб файл применяет сам
    const { TDSLoader } = await import(L + 'loaders/TDSLoader.js');
    obj = new TDSLoader(manager).parse(buffer, '');
    extra = { zup: true };
  } else if (ext === '.3mf') {                     // 3D-печать: Z вверх, единицы из файла
    const r = await parse3mf(buffer, name);
    obj = r.obj;
    extra = { units: r.units, zup: true };
  } else if (['.usd', '.usda', '.usdc', '.usdz'].includes(ext)) {   // USD: загрузчик из three.js 0.187 — метры и Y вверх уже в группе
    const { USDLoader } = await import(L + 'loaders/USDLoader.js');
    obj = await new Promise((ok, bad) => { try { new USDLoader(manager).parse(buffer, '', ok, bad); } catch (e) { bad(e); } });
    animations = obj.animations || [];
    if (obj.userData.metersPerUnit === undefined) {   // не записан — по стандарту USD это сантиметры
      obj.scale.multiplyScalar(0.01);
      extra = { units: { mpu: 1, how: 'USD: единицы не указаны, по стандарту — см' }, zup: false };
    } else extra = { units: { mpu: 1, how: `USD: ${obj.userData.metersPerUnit} м в единице` }, zup: false };
  } else if (STEP_EXT.has(ext)) {                // CAD: OpenCascade отдаёт миллиметры, оси CAD (Z вверх)
    obj = await parseOcct(ext, buffer, name);
    extra = { units: { mpu: 0.001, how: 'CAD, переведён в мм' }, zup: true };
  } else if (ext === '.ifc') {                     // web-ifc отдаёт метры и уже Y вверх
    const r = await parseIfc(buffer, name);
    obj = r.root;
    extra = { units: { mpu: 1, how: 'IFC, переведён в метры' }, zup: false, rows: [['Элементы IFC', r.elements.toLocaleString('ru-RU')]] };
  } else throw new Error('формат не для фонового разбора: ' + ext);
  deindex(obj);                              // каркас рисуется по gl_VertexID % 3
  obj.traverse(o => { if (o.isMesh && !o.geometry.attributes.normal) o.geometry.computeVertexNormals(); });
  await Promise.all(pending.splice(0));
  return { obj, animations, extra };
}


// ------------------------------------------------------------------ STEP / IGES / BREP — OpenCascade (occt-import-js, LGPL)
const STEP_EXT = new Set(['.step', '.stp', '.iges', '.igs', '.brep']);
let occtP = null;
function occt() {
  return occtP || (occtP = (async () => {
    const lib = new URL('../occt/', BASE).href;
    const src = await (await fetch(lib + 'occt-import-js.js')).text();     // обычный скрипт (не модуль) — запускаем как функцию
    const factory = new Function(src + '\nreturn occtimportjs;')();
    return factory({ locateFile: f => lib + f });
  })());
}
async function parseOcct(ext, buffer, name) {
  const lib = await occt();
  const params = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 };
  const bytes = new Uint8Array(buffer);
  const res = ext === '.brep' ? lib.ReadBrepFile(bytes, params)
    : ext === '.iges' || ext === '.igs' ? lib.ReadIgesFile(bytes, params) : lib.ReadStepFile(bytes, params);
  if (!res || !res.success) throw new Error('OpenCascade не прочитал файл');
  const mats = new Map();
  const mat = c => {
    const key = c ? c.map(v => v.toFixed(3)).join(',') : '-';
    if (!mats.has(key)) {
      const col = c ? new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace) : new THREE.Color(0xb4b4b4);
      mats.set(key, new THREE.MeshStandardMaterial({ name: c ? '#' + col.getHexString(THREE.SRGBColorSpace) : 'без цвета', color: col, roughness: 0.55, metalness: 0.05 }));
    }
    return mats.get(key);
  };
  const meshes = res.meshes.map(m => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
    if (m.attributes.normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
    g.setIndex(Array.from(m.index.array));
    const list = [];
    const faces = m.brep_faces || [];
    if (faces.some(f => f.color)) {                // цвета граней тела — группы материалов
      for (const f of faces) {
        const mm = mat(f.color || m.color);
        let i = list.indexOf(mm);
        if (i < 0) { i = list.length; list.push(mm); }
        const last = g.groups[g.groups.length - 1];
        if (last && last.materialIndex === i && last.start + last.count === f.first * 3) last.count += (f.last - f.first + 1) * 3;
        else g.addGroup(f.first * 3, (f.last - f.first + 1) * 3, i);
      }
    }
    return { g, material: list.length > 1 ? list : list[0] || mat(m.color), name: m.name };
  });
  const build = node => {
    const grp = new THREE.Group();
    grp.name = node.name || '';
    for (const i of node.meshes || []) {
      const e = meshes[i];
      grp.add(Object.assign(new THREE.Mesh(e.g, e.material), { name: e.name || grp.name }));
    }
    for (const c of node.children || []) grp.add(build(c));
    return grp;
  };
  const root = build(res.root || { meshes: meshes.map((_, i) => i) });
  if (!root.name) root.name = name;
  return root;
}

// ------------------------------------------------------------------ IFC — web-ifc (MPL-2.0)
// Геометрия собирается по классам IFC (стены, перекрытия, окна…) и цветам: одна сетка на «класс + цвет» —
// здания из десятков тысяч элементов рисуются быстро, а в панели классы видны слоями.
const IFC_HIDDEN = new Set(['IFCSPACE', 'IFCOPENINGELEMENT']);
let ifcP = null;
function ifcApi() {
  return ifcP || (ifcP = (async () => {
    const lib = new URL('../web-ifc/', BASE).href;
    const { IfcAPI } = await import(lib + 'web-ifc-api.js');
    const api = new IfcAPI();
    api.SetWasmPath(lib, true);
    await api.Init();
    return api;
  })());
}
async function parseIfc(buffer, name) {
  const api = await ifcApi();
  const id = api.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true });
  const buckets = new Map(), typeName = new Map();
  const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  let elements = 0;
  try {
    api.StreamAllMeshes(id, mesh => {
      elements++;
      const code = api.GetLineType(id, mesh.expressID);
      if (!typeName.has(code)) { let n = ''; try { n = api.GetNameFromTypeCode(code); } catch (e) {} typeName.set(code, n || 'IFC#' + code); }
      const type = typeName.get(code);
      const pgs = mesh.geometries;
      for (let i = 0; i < pgs.size(); i++) {
        const pg = pgs.get(i);
        const geom = api.GetGeometry(id, pg.geometryExpressID);
        const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());   // x y z nx ny nz
        const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        m4.fromArray(pg.flatTransformation); nm.getNormalMatrix(m4);
        const c = pg.color, key = type + '|' + [c.x, c.y, c.z, c.w].map(x => x.toFixed(3)).join(',');
        let b = buckets.get(key);
        if (!b) { b = { type, c: { x: c.x, y: c.y, z: c.z, w: c.w }, pos: [], nor: [] }; buckets.set(key, b); }
        const P = new Float32Array(idx.length * 3), N = new Float32Array(idx.length * 3);
        for (let k = 0; k < idx.length; k++) {
          const j = idx[k] * 6;
          v.set(verts[j], verts[j + 1], verts[j + 2]).applyMatrix4(m4); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
          v.set(verts[j + 3], verts[j + 4], verts[j + 5]).applyMatrix3(nm).normalize(); N[k * 3] = v.x; N[k * 3 + 1] = v.y; N[k * 3 + 2] = v.z;
        }
        b.pos.push(P); b.nor.push(N);
        geom.delete();
      }
    });
  } finally { api.CloseModel(id); }
  const cat = list => { const out = new Float32Array(list.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of list) { out.set(x, o); o += x.length; } return out; };
  const root = new THREE.Group();
  root.name = name;
  for (const b of buckets.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cat(b.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(cat(b.nor), 3));
    const see = b.c.w < 0.999;
    const m = new THREE.MeshStandardMaterial({ name: b.type, color: new THREE.Color().setRGB(b.c.x, b.c.y, b.c.z, THREE.SRGBColorSpace),
                                               roughness: 0.75, metalness: 0, transparent: see, opacity: b.c.w, depthWrite: !see });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = b.type; mesh.userData.layerName = b.type; mesh.visible = !IFC_HIDDEN.has(b.type.toUpperCase());     // web-ifc отдаёт «IfcSpace»
    root.add(mesh);
  }
  return { root, elements };
}


// ------------------------------------------------------------------ 3MF — свой разбор (слайсеры: Bambu, Creality, Prusa)
// Современные 3MF кладут детали в отдельные 3D/Objects/*.model и ссылаются на них из 3D/3dmodel.model
// (расширение production, p:path). Загрузчик three r160 это не умеет — разбираем сами, регулярками (быстро и без DOMParser).
const TMF_UNITS = { micron: 1e-6, millimeter: 1e-3, centimeter: 1e-2, inch: 0.0254, foot: 0.3048, meter: 1 };
const attr = (tag, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
function tmfMatrix(t) {          // 3MF: 12 чисел, строки-векторы (точка × M)
  const m = new THREE.Matrix4();
  if (!t) return m;
  const v = t.trim().split(/\s+/).map(Number);
  return m.set(v[0], v[3], v[6], v[9], v[1], v[4], v[7], v[10], v[2], v[5], v[8], v[11], 0, 0, 0, 1);
}
function tmfParseModel(xml) {
  const objects = new Map();
  const reObj = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
  let mo;
  while ((mo = reObj.exec(xml))) {
    const head = mo[1], body = mo[2], id = attr(head, 'id');
    const rec = { name: attr(head, 'name') || '', mesh: null, comps: [] };
    const vStart = body.indexOf('<vertices');
    if (vStart >= 0) {
      const pos = [], idx = [];
      const reV = /<vertex\b([^>]*)\/>/g, reT = /<triangle\b([^>]*)\/>/g;
      reV.lastIndex = vStart;
      let mv;
      while ((mv = reV.exec(body))) pos.push(+attr(mv[1], 'x'), +attr(mv[1], 'y'), +attr(mv[1], 'z'));
      while ((mv = reT.exec(body))) idx.push(+attr(mv[1], 'v1'), +attr(mv[1], 'v2'), +attr(mv[1], 'v3'));
      rec.mesh = { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
    }
    const reC = /<component\b([^>]*)\/>/g;
    let mc;
    while ((mc = reC.exec(body))) rec.comps.push({ id: attr(mc[1], 'objectid'), path: attr(mc[1], 'p:path'), transform: attr(mc[1], 'transform') });
    objects.set(id, rec);
  }
  const items = [];
  const reI = /<item\b([^>]*)\/>/g;
  let mi;
  while ((mi = reI.exec(xml))) items.push({ id: attr(mi[1], 'objectid'), path: attr(mi[1], 'p:path'), transform: attr(mi[1], 'transform') });
  return { objects, items, unit: (/<model\b[^>]*\bunit="([^"]*)"/.exec(xml) || [])[1] || 'millimeter' };
}
async function parse3mf(buffer, name) {
  const { unzipSync } = await import(L + 'libs/fflate.module.js');
  const zip = unzipSync(new Uint8Array(buffer));
  const dec = new TextDecoder();
  const norm = p => (p || '').replace(/^\//, '');
  const rootPath = Object.keys(zip).find(k => /^3d\/3dmodel\.model$/i.test(k)) || Object.keys(zip).find(k => k.toLowerCase().endsWith('.model'));
  if (!rootPath) throw new Error('в 3MF нет файла модели');
  const files = new Map();
  const model = p => { p = norm(p) || rootPath; if (!files.has(p)) files.set(p, zip[p] ? tmfParseModel(dec.decode(zip[p])) : { objects: new Map(), items: [] }); return files.get(p); };
  const root = model(rootPath);
  const mat = new THREE.MeshStandardMaterial({ name: 'материал', color: 0xb4b4b4, roughness: 0.6, metalness: 0.05 });
  const geos = new Map();
  let tris = 0;
  const build = (path, id, depth) => {
    const rec = model(path).objects.get(id);
    const g = new THREE.Group();
    if (!rec || depth > 16) return g;
    g.name = rec.name;
    if (rec.mesh && rec.mesh.idx.length) {
      const key = (norm(path) || rootPath) + '#' + id;
      if (!geos.has(key)) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(rec.mesh.pos, 3));
        geo.setIndex(new THREE.BufferAttribute(rec.mesh.idx, 1));
        geos.set(key, geo);
      }
      tris += rec.mesh.idx.length / 3;
      g.add(Object.assign(new THREE.Mesh(geos.get(key), mat), { name: rec.name || 'деталь ' + id }));
    }
    for (const c of rec.comps) {
      const child = build(c.path || path, c.id, depth + 1);
      child.applyMatrix4(tmfMatrix(c.transform));
      g.add(child);
    }
    return g;
  };
  const top = new THREE.Group();
  top.name = name;
  for (const it of root.items) {
    const o = build(it.path || rootPath, it.id, 0);
    o.applyMatrix4(tmfMatrix(it.transform));
    top.add(o);
  }
  if (!tris) throw new Error('в 3MF не нашлось сеток');
  const mpu = TMF_UNITS[root.unit] || 1e-3;
  return { obj: top, units: { mpu, how: 'из файла 3MF' } };
}

// ------------------------------------------------------------------ упаковка
const COLOR_KEYS = ['color', 'emissive', 'specular', 'sheenColor', 'attenuationColor', 'specularColor'];
const NUM_KEYS = ['opacity', 'transparent', 'side', 'vertexColors', 'roughness', 'metalness', 'shininess', 'emissiveIntensity', 'flatShading',
  'alphaTest', 'depthWrite', 'depthTest', 'reflectivity', 'refractionRatio', 'ior', 'transmission', 'thickness', 'clearcoat', 'clearcoatRoughness',
  'sheen', 'sheenRoughness', 'aoMapIntensity', 'bumpScale', 'displacementScale', 'displacementBias', 'envMapIntensity', 'lightMapIntensity',
  'specularIntensity', 'blending', 'premultipliedAlpha', 'toneMapped', 'size', 'sizeAttenuation', 'linewidth', 'iridescence', 'anisotropy',
  'attenuationDistance', 'dispersion', 'combine', 'alphaHash', 'visible'];
const MAP_KEYS = ['map', 'normalMap', 'bumpMap', 'emissiveMap', 'specularMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'lightMap',
  'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'transmissionMap', 'thicknessMap', 'sheenColorMap',
  'sheenRoughnessMap', 'specularIntensityMap', 'specularColorMap', 'iridescenceMap', 'anisotropyMap'];
const TRACK_TYPES = { number: 'NumberKeyframeTrack', vector: 'VectorKeyframeTrack', quaternion: 'QuaternionKeyframeTrack',
                      bool: 'BooleanKeyframeTrack', string: 'StringKeyframeTrack', color: 'ColorKeyframeTrack' };

function pack(root, animations) {
  const transfer = new Set();
  const own = arr => {                       // свой буфер у массива: вид в общий буфер GLB передавать нельзя
    const a = arr.byteOffset === 0 && arr.byteLength === arr.buffer.byteLength ? arr : arr.slice();
    transfer.add(a.buffer);
    return a;
  };
  const attr = a => {
    if (a.isInterleavedBufferAttribute) {    // переплетённый (GLTF) → обычный массив
      const out = new a.array.constructor(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
      return { array: own(out), itemSize: a.itemSize, normalized: a.normalized };
    }
    return { array: own(a.array), itemSize: a.itemSize, normalized: a.normalized };
  };
  const geos = new Map(), mats = new Map(), texs = new Map(), srcs = new Map();
  const G = [], M = [], T = [], S = [], O = [];
  const geoId = g => {
    if (geos.has(g)) return geos.get(g);
    const rec = { attrs: {}, morph: {}, morphRel: g.morphTargetsRelative, groups: g.groups.map(x => ({ ...x })), name: g.name };
    for (const [k, a] of Object.entries(g.attributes)) rec.attrs[k] = attr(a);
    for (const [k, list] of Object.entries(g.morphAttributes || {})) rec.morph[k] = list.map(a => ({ ...attr(a), name: a.name }));
    if (g.index) rec.index = attr(g.index);
    geos.set(g, G.length); G.push(rec);
    return G.length - 1;
  };
  const srcId = img => {
    if (!img) return -1;
    if (srcs.has(img)) return srcs.get(img);
    let rec;
    if (img.__src !== undefined) rec = img.__bytes ? { bytes: img.__bytes, kind: img.__kind, url: img.__src } : { url: img.__src, kind: img.__kind };
    else if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) { rec = { bitmap: img }; transfer.add(img); }
    else if (img.data && img.width) rec = { data: own(img.data), width: img.width, height: img.height };    // DataTexture
    else rec = null;
    if (rec && rec.bytes) transfer.add(rec.bytes);
    srcs.set(img, S.length); S.push(rec);
    return S.length - 1;
  };
  const texId = t => {
    if (!t) return -1;
    if (texs.has(t)) return texs.get(t);
    const rec = { src: srcId(t.image), name: t.name, wrapS: t.wrapS, wrapT: t.wrapT, magFilter: t.magFilter, minFilter: t.minFilter,
                  flipY: t.flipY, colorSpace: t.colorSpace, channel: t.channel, format: t.format, type: t.type,
                  repeat: t.repeat.toArray(), offset: t.offset.toArray(), center: t.center.toArray(), rotation: t.rotation };
    texs.set(t, T.length); T.push(rec);
    return T.length - 1;
  };
  const matId = m => {
    if (mats.has(m)) return mats.get(m);
    const rec = { type: m.type, name: m.name, colors: {}, nums: {}, maps: {} };
    for (const k of COLOR_KEYS) if (m[k] && m[k].isColor) rec.colors[k] = m[k].toArray();
    for (const k of NUM_KEYS) if (m[k] !== undefined && typeof m[k] !== 'object') rec.nums[k] = m[k];
    for (const k of MAP_KEYS) if (m[k] && m[k].isTexture) rec.maps[k] = texId(m[k]);
    if (m.normalScale) rec.normalScale = m.normalScale.toArray();
    mats.set(m, M.length); M.push(rec);
    return M.length - 1;
  };
  const index = new Map();
  root.traverse(o => { index.set(o, O.length); O.push(null); });
  root.traverse(o => {
    const rec = { type: o.type, name: o.name, uuid: o.uuid, parent: o === root ? -1 : index.get(o.parent),
                  p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray(), visible: o.visible,
                  renderOrder: o.renderOrder };
    if (o.matrixAutoUpdate === false) rec.matrix = o.matrix.toArray();
    if (o.geometry) rec.geo = geoId(o.geometry);
    if (o.material) rec.mat = Array.isArray(o.material) ? o.material.map(matId) : matId(o.material);
    if (o.morphTargetInfluences) { rec.morphInf = [...o.morphTargetInfluences]; rec.morphDict = { ...o.morphTargetDictionary }; }
    if (o.isInstancedMesh) { rec.count = o.count; rec.instance = attr(o.instanceMatrix); }
    if (o.isSkinnedMesh && o.skeleton) {
      rec.skin = { bones: o.skeleton.bones.map(b => index.has(b) ? index.get(b) : -1),
                   inv: o.skeleton.boneInverses.map(m => m.toArray()), bindMatrix: o.bindMatrix.toArray(), bindMode: o.bindMode };
    }
    if (o.isBone) rec.bone = true;
    if (o.userData.layerName) rec.layer = o.userData.layerName;     // IFC: класс как слой
    O[index.get(o)] = rec;
  });
  const A = animations.map(c => ({
    name: c.name, duration: c.duration, blendMode: c.blendMode,
    tracks: c.tracks.map(t => ({ name: t.name, type: TRACK_TYPES[t.ValueTypeName] || 'NumberKeyframeTrack',
                                  times: own(t.times instanceof Float32Array ? t.times : new Float32Array(t.times)),
                                  values: ArrayBuffer.isView(t.values) ? own(t.values) : t.values, interp: t.getInterpolation() })),
  }));
  return { packed: { objects: O, geometries: G, materials: M, textures: T, sources: S, animations: A }, transfer: [...transfer] };
}

// ------------------------------------------------------------------ сообщения
self.onmessage = async e => {
  const { id, ext, name, buffer, files, texBase, base } = e.data;
  try {
    await init(base);
    self.postMessage({ id, progress: 'разбор' });
    const { obj, animations, extra } = await parse(ext, buffer, name, files || {}, texBase);
    self.postMessage({ id, progress: 'передача' });
    const { packed, transfer } = pack(obj, animations);
    self.postMessage({ id, ok: true, packed, extra }, transfer);
  } catch (err) {
    // буфер возвращаем — окно разберёт файл само; если он уже ушёл в загрузчик, окно перечитает его
    let back = null;
    try { if (buffer && buffer.byteLength) back = buffer; } catch (x) {}
    self.postMessage({ id, ok: false, error: String(err && err.message || err), buffer: back }, back ? [back] : []);
  }
};
