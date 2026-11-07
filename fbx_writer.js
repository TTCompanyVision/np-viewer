// fbx_writer.js — запись двоичного FBX 7.4 (статичные сетки: иерархия, нормали, UV, цвета вершин, материалы,
// встроенные текстуры). Без анимации и скинов. Не зависит от three.js: страница готовит простые данные.
//
// scene = {
//   up: 'y' | 'z',                    // ось «вверх» в координатах файла
//   cmPerUnit: number,                // сантиметров в единице координат (UnitScaleFactor)
//   nodes: [{ name, parent: -1 | индекс, t: [x,y,z], r: [x,y,z] (градусы, порядок FBX XYZ), s: [x,y,z],
//             geometry: -1 | индекс, materials: [индексы] }],
//   geometries: [{ name, points: Float64Array (x,y,z), tris: Int32Array (3 индекса точки на треугольник),
//                  normals?: Float64Array (по углам треугольников), uvs?: Float64Array (по углам),
//                  colors?: Float64Array (rgba по углам), matIds?: Int32Array (по треугольникам) }],
//   materials: [{ name, color: [r,g,b], opacity, emissive: [r,g,b], texture?: { name, file, bytes: Uint8Array } }],
// }
// Возвращает Promise<Uint8Array>.

const VERSION = 7400;
// Те же постоянные, что пишет Blender: FBX SDK и другие программы такие файлы открывают
const FILE_ID = [0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1];
const CREATION_TIME = '1970-01-01 10:00:00:000';
const FOOT_ID = [0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e];
const FOOT_MAGIC = [0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b];

const utf8 = new TextEncoder();

// ---------------------------------------------------------------- свойства
const C = v => ({ t: 'C', v: v ? 1 : 0 });
const I = v => ({ t: 'I', v });
const D = v => ({ t: 'D', v });
const L = v => ({ t: 'L', v: BigInt(v) });
const S = v => ({ t: 'S', v: utf8.encode(v) });
const R = bytes => ({ t: 'R', v: bytes });
// «Имя::Класс» в двоичном FBX записывается как «Имя\x00\x01Класс»
const NAME = (name, cls) => {
  const a = utf8.encode(name), b = utf8.encode(cls), out = new Uint8Array(a.length + 2 + b.length);
  out.set(a); out[a.length] = 0; out[a.length + 1] = 1; out.set(b, a.length + 2);
  return { t: 'S', v: out };
};

async function zlib(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('deflate');            // 'deflate' = поток zlib, как в FBX
  const res = new Response(new Blob([bytes]).stream().pipeThrough(cs));
  return new Uint8Array(await res.arrayBuffer());
}

// массив: d (double), i (int32), b (bool/байт); большие сжимаются
async function arr(type, data) {
  let raw;
  if (type === 'd') raw = new Uint8Array(Float64Array.from(data).buffer);
  else if (type === 'i') raw = new Uint8Array(Int32Array.from(data).buffer);
  else raw = Uint8Array.from(data);
  let enc = 0, bytes = raw;
  if (raw.length > 128) {
    const z = await zlib(raw);
    if (z && z.length < raw.length) { enc = 1; bytes = z; }
  }
  return { t: type, n: data.length, enc, v: bytes };
}

function propSize(p) {
  switch (p.t) {
    case 'C': return 2;
    case 'I': return 5;
    case 'D': case 'L': return 9;
    case 'S': case 'R': return 5 + p.v.length;
    default: return 13 + p.v.length;      // массив
  }
}

// ---------------------------------------------------------------- узлы
const N = (name, props = [], kids = []) => ({ name, props, kids });
const P70 = list => N('Properties70', [], list.map(p => N('P', p)));
// P-свойства: [имя, тип, подтип, флаги, ...значения]
const pInt = (n, v) => [S(n), S('int'), S('Integer'), S(''), I(v)];
const pEnum = (n, v) => [S(n), S('enum'), S(''), S(''), I(v)];
const pDouble = (n, v) => [S(n), S('double'), S('Number'), S(''), D(v)];
const pColor = (n, c) => [S(n), S('ColorRGB'), S('Color'), S(''), D(c[0]), D(c[1]), D(c[2])];
const pVec = (n, v, kind = n) => [S(n), S(kind), S(''), S('A'), D(v[0]), D(v[1]), D(v[2])];
const pStr = (n, v, sub = '') => [S(n), S('KString'), S(sub), S(''), S(v)];
const pTime = (n, v) => [S(n), S('KTime'), S('Time'), S(''), L(v)];

function nodeSize(n) {
  let size = 13 + utf8.encode(n.name).length;
  for (const p of n.props) size += propSize(p);
  for (const k of n.kids) size += nodeSize(k);
  if (n.kids.length || !n.props.length) size += 13;    // пустой узел-ограничитель
  return n._size = size;
}

function writeNode(view, bytes, o, n) {
  const start = o, nameB = utf8.encode(n.name);
  let propLen = 0;
  for (const p of n.props) propLen += propSize(p);
  view.setUint32(o, start + n._size, true);
  view.setUint32(o + 4, n.props.length, true);
  view.setUint32(o + 8, propLen, true);
  view.setUint8(o + 12, nameB.length);
  bytes.set(nameB, o + 13);
  o += 13 + nameB.length;
  for (const p of n.props) {
    view.setUint8(o++, p.t.charCodeAt(0));
    switch (p.t) {
      case 'C': view.setUint8(o, p.v); o += 1; break;
      case 'I': view.setInt32(o, p.v, true); o += 4; break;
      case 'D': view.setFloat64(o, p.v, true); o += 8; break;
      case 'L': view.setBigInt64(o, p.v, true); o += 8; break;
      case 'S': case 'R': view.setUint32(o, p.v.length, true); bytes.set(p.v, o + 4); o += 4 + p.v.length; break;
      default:
        view.setUint32(o, p.n, true); view.setUint32(o + 4, p.enc, true); view.setUint32(o + 8, p.v.length, true);
        bytes.set(p.v, o + 12); o += 12 + p.v.length;
    }
  }
  for (const k of n.kids) o = writeNode(view, bytes, o, k);
  if (n.kids.length || !n.props.length) o += 13;      // нули уже в буфере
  return o;
}

// ---------------------------------------------------------------- сцена
export async function writeFBX(scene) {
  let nextId = 2000000;
  const id = () => nextId++;
  const objects = [], links = [];
  const now = new Date();

  // материалы и текстуры
  const matIds = [];
  for (const m of scene.materials) {
    const mid = id(); matIds.push(mid);
    const c = m.color || [0.8, 0.8, 0.8], op = m.opacity ?? 1, em = m.emissive || [0, 0, 0];
    objects.push(N('Material', [L(mid), NAME(m.name || 'Material', 'Material'), S('')], [
      N('Version', [I(102)]), N('ShadingModel', [S('phong')]), N('MultiLayer', [I(0)]),
      P70([[S('ShadingModel'), S('KString'), S(''), S(''), S('phong')],
           pColor('DiffuseColor', c), pDouble('DiffuseFactor', 1),
           pColor('EmissiveColor', em), pDouble('EmissiveFactor', 1),
           pColor('AmbientColor', [0, 0, 0]),
           pColor('SpecularColor', [0.2, 0.2, 0.2]), pDouble('SpecularFactor', 1), pDouble('Shininess', 20),
           pColor('TransparentColor', [1, 1, 1]), pDouble('TransparencyFactor', 1 - op), pDouble('Opacity', op),
           pColor('Emissive', em), pColor('Ambient', [0, 0, 0]), pColor('Diffuse', c),
           pColor('Specular', [0.2, 0.2, 0.2]), pDouble('ShininessExponent', 20), pDouble('Reflectivity', 0)]),
    ]));
    if (m.texture && m.texture.bytes) {
      const tid = id(), vid = id(), t = m.texture;
      objects.push(N('Video', [L(vid), NAME(t.name, 'Video'), S('Clip')], [
        N('Type', [S('Clip')]),
        P70([[S('Path'), S('KString'), S('XRefUrl'), S(''), S(t.file)]]),
        N('UseMipMap', [I(0)]), N('Filename', [S(t.file)]), N('RelativeFilename', [S(t.file)]),
        N('Content', [R(t.bytes)]),
      ]));
      objects.push(N('Texture', [L(tid), NAME(t.name, 'Texture'), S('')], [
        N('Type', [S('TextureVideoClip')]), N('Version', [I(202)]), N('TextureName', [NAME(t.name, 'Texture')]),
        P70([pStr('UVSet', 'UVMap'), [S('UseMaterial'), S('bool'), S(''), S(''), I(1)]]),
        N('Media', [NAME(t.name, 'Video')]), N('FileName', [S(t.file)]), N('RelativeFilename', [S(t.file)]),
        N('ModelUVTranslation', [D(0), D(0)]), N('ModelUVScaling', [D(1), D(1)]),
        N('Texture_Alpha_Source', [S('None')]), N('Cropping', [I(0), I(0), I(0), I(0)]),
      ]));
      links.push(N('C', [S('OO'), L(vid), L(tid)]));
      links.push(N('C', [S('OP'), L(tid), L(mid), S('DiffuseColor')]));
    }
  }

  // сетки
  const geoIds = [];
  for (const g of scene.geometries) {
    const gid = id(); geoIds.push(gid);
    const nt = g.tris.length / 3;
    const pvi = new Int32Array(g.tris.length);
    for (let i = 0; i < g.tris.length; i += 3) { pvi[i] = g.tris[i]; pvi[i + 1] = g.tris[i + 1]; pvi[i + 2] = ~g.tris[i + 2]; }
    const kids = [
      N('Properties70'),
      N('Vertices', [await arr('d', g.points)]),
      N('PolygonVertexIndex', [await arr('i', pvi)]),
      N('GeometryVersion', [I(124)]),
    ];
    const layer = [N('Version', [I(100)])];
    const le = (type) => layer.push(N('LayerElement', [], [N('Type', [S(type)]), N('TypedIndex', [I(0)])]));
    if (g.normals) {
      kids.push(N('LayerElementNormal', [I(0)], [
        N('Version', [I(102)]), N('Name', [S('')]),
        N('MappingInformationType', [S('ByPolygonVertex')]), N('ReferenceInformationType', [S('Direct')]),
        N('Normals', [await arr('d', g.normals)]),
      ]));
      le('LayerElementNormal');
    }
    if (g.colors) {
      const idx = new Int32Array(g.colors.length / 4).map((_, i) => i);
      kids.push(N('LayerElementColor', [I(0)], [
        N('Version', [I(101)]), N('Name', [S('Col')]),
        N('MappingInformationType', [S('ByPolygonVertex')]), N('ReferenceInformationType', [S('IndexToDirect')]),
        N('Colors', [await arr('d', g.colors)]), N('ColorIndex', [await arr('i', idx)]),
      ]));
      le('LayerElementColor');
    }
    if (g.uvs) {
      const idx = new Int32Array(g.uvs.length / 2).map((_, i) => i);
      kids.push(N('LayerElementUV', [I(0)], [
        N('Version', [I(101)]), N('Name', [S('UVMap')]),
        N('MappingInformationType', [S('ByPolygonVertex')]), N('ReferenceInformationType', [S('IndexToDirect')]),
        N('UV', [await arr('d', g.uvs)]), N('UVIndex', [await arr('i', idx)]),
      ]));
      le('LayerElementUV');
    }
    const ids = g.matIds && g.matIds.length === nt && g.matIds.some(v => v !== g.matIds[0]) ? g.matIds : null;
    kids.push(N('LayerElementMaterial', [I(0)], [
      N('Version', [I(101)]), N('Name', [S('')]),
      N('MappingInformationType', [S(ids ? 'ByPolygon' : 'AllSame')]), N('ReferenceInformationType', [S('IndexToDirect')]),
      N('Materials', [await arr('i', ids || [g.matIds ? g.matIds[0] || 0 : 0])]),
    ]));
    le('LayerElementMaterial');
    kids.push(N('Layer', [I(0)], layer));
    objects.push(N('Geometry', [L(gid), NAME(g.name || 'Mesh', 'Geometry'), S('Mesh')], kids));
  }

  // узлы
  const nodeIds = scene.nodes.map(() => id());
  scene.nodes.forEach((n, i) => {
    const mesh = n.geometry >= 0;
    objects.push(N('Model', [L(nodeIds[i]), NAME(n.name || 'Node', 'Model'), S(mesh ? 'Mesh' : 'Null')], [
      N('Version', [I(232)]),
      P70([pEnum('InheritType', 1), pInt('DefaultAttributeIndex', 0),
           pVec('Lcl Translation', n.t), pVec('Lcl Rotation', n.r), pVec('Lcl Scaling', n.s)]),
      N('Shading', [{ t: 'C', v: 84 }]), N('Culling', [S('CullingOff')]),
    ]));
    links.push(N('C', [S('OO'), L(nodeIds[i]), L(n.parent >= 0 ? nodeIds[n.parent] : 0)]));
    if (mesh) {
      links.push(N('C', [S('OO'), L(geoIds[n.geometry]), L(nodeIds[i])]));
      for (const mi of n.materials) links.push(N('C', [S('OO'), L(matIds[mi]), L(nodeIds[i])]));
    }
  });

  const count = type => objects.filter(o => o.name === type).length;
  const defs = ['Model', 'Geometry', 'Material', 'Texture', 'Video'].filter(count)
    .map(t => N('ObjectType', [S(t)], [N('Count', [I(count(t))])]));

  const zup = scene.up === 'z';
  const top = [
    N('FBXHeaderExtension', [], [
      N('FBXHeaderVersion', [I(1003)]), N('FBXVersion', [I(VERSION)]), N('EncryptionType', [I(0)]),
      N('CreationTimeStamp', [], [N('Version', [I(1000)]), N('Year', [I(now.getFullYear())]), N('Month', [I(now.getMonth() + 1)]),
        N('Day', [I(now.getDate())]), N('Hour', [I(now.getHours())]), N('Minute', [I(now.getMinutes())]),
        N('Second', [I(now.getSeconds())]), N('Millisecond', [I(now.getMilliseconds())])]),
      N('Creator', [S('NP Viewer')]),
    ]),
    N('FileId', [R(Uint8Array.from(FILE_ID))]),
    N('CreationTime', [S(CREATION_TIME)]),
    N('Creator', [S('NP Viewer')]),
    N('GlobalSettings', [], [N('Version', [I(1000)]), P70([
      pInt('UpAxis', zup ? 2 : 1), pInt('UpAxisSign', 1),
      pInt('FrontAxis', zup ? 1 : 2), pInt('FrontAxisSign', zup ? -1 : 1),
      pInt('CoordAxis', 0), pInt('CoordAxisSign', 1),
      pInt('OriginalUpAxis', zup ? 2 : 1), pInt('OriginalUpAxisSign', 1),
      pDouble('UnitScaleFactor', scene.cmPerUnit), pDouble('OriginalUnitScaleFactor', scene.cmPerUnit),
      pColor('AmbientColor', [0, 0, 0]), pStr('DefaultCamera', 'Producer Perspective'),
      pEnum('TimeMode', 11), pEnum('TimeProtocol', 2), pEnum('SnapOnFrameMode', 0),
      pTime('TimeSpanStart', 0), pTime('TimeSpanStop', 46186158000), pDouble('CustomFrameRate', -1),
      pInt('CurrentTimeMarker', -1),
    ])]),
    N('Documents', [], [N('Count', [I(1)]), N('Document', [L(id()), S(''), S('Scene')], [
      P70([[S('SourceObject'), S('object'), S(''), S('')], pStr('ActiveAnimStackName', '')]),
      N('RootNode', [L(0)]),
    ])]),
    N('References'),
    N('Definitions', [], [N('Version', [I(100)]), N('Count', [I(1 + objects.length)]),
      N('ObjectType', [S('GlobalSettings')], [N('Count', [I(1)])]), ...defs]),
    N('Objects', [], objects),
    N('Connections', [], links),
  ];

  // размер: заголовок 27 + узлы + ограничитель 13 + хвост (id, выравнивание, версия, 120 нулей, метка)
  let size = 27;
  for (const n of top) size += nodeSize(n);
  size += 13;
  const footStart = size;
  size += 16;
  const pad = (16 - (size % 16)) % 16 || 16;
  size += pad + 4 + 4 + 120 + 16;

  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  bytes.set(utf8.encode('Kaydara FBX Binary  '), 0);   // + \0, 0x1A, 0x00
  bytes[21] = 0x1a; bytes[22] = 0;
  view.setUint32(23, VERSION, true);
  let o = 27;
  for (const n of top) o = writeNode(view, bytes, o, n);
  o += 13;
  if (o !== footStart) throw new Error(`FBX: размер разошёлся (${o} ≠ ${footStart})`);
  bytes.set(FOOT_ID, o); o += 16 + pad + 4;
  view.setUint32(o, VERSION, true); o += 4 + 120;
  bytes.set(FOOT_MAGIC, o);
  return bytes;
}
