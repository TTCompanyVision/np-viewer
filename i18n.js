// i18n.js — английский интерфейс. Страница пишется по-русски; в английском режиме каждый текст и подсказка,
// попавшие в документ, проходят через словарь (целая строка → части через « · », «: », « — » → шаблоны).
// Имена файлов и объектов (.tn, #fname, .rn) не переводятся.

export const LANGS = { ru: 'Русский', en: 'English' };

export function pickLang() {
  try { const s = localStorage.getItem('mv.lang'); if (s in LANGS) return s; } catch (e) {}
  return /^(ru|be|kk|ky|tg|uz)\b/i.test(navigator.language || '') ? 'ru' : 'en';
}
export function setLang(l) { try { localStorage.setItem('mv.lang', l); } catch (e) {} }

const EN = {
  // панель и пустой экран
  'Alt+W — развернуть': 'Alt+W — maximize', 'Shift + перетаскивание — повернуть свет': 'Shift + drag — rotate light',
  'UV-шахматка': 'UV checker', 'Z вверх': 'Z up', '[ и ] — шаг 5°, мм — для кадра 36×24': '[ and ] — 5° step; mm — for a 36×24 frame',
  'Авто': 'Auto', 'Витрина': 'Turntable', 'Воспроизведение': 'Play', 'Выключить сечение': 'Turn off section',
  'Два окна': 'Two viewports', 'Двусторонне': 'Double-sided', 'Дерево': 'Tree', 'Единицы файла': 'File units',
  'Инструменты': 'Tools', 'Кадр': 'Frame', 'Каркас': 'Wireframe', 'Команда или имя объекта…': 'Command or object name…',
  'Материалы': 'Materials', 'Материалы из файла': 'File materials', 'Модель не загружена': 'No model loaded',
  'Можно папку целиком — текстуры подхватятся. Или открой файл кнопкой.': 'Drop a whole folder and textures are picked up. Or use the button.',
  'Недавние': 'Recent', 'Недавние, команды, справка': 'Recent, commands, help', 'Нормали': 'Normals', 'Объекты': 'Objects',
  'Один цвет': 'Single color', 'Одно окно': 'One viewport', 'Окна': 'Viewports', 'Оставить другую сторону': 'Keep the other side',
  'Открыть файл': 'Open file', 'Отображение': 'Display', 'Отпусти, чтобы открыть': 'Release to open',
  'Перетащи модель в окно': 'Drop a 3D model here', 'Плоско': 'Flat', 'По мешам': 'By mesh', 'По слотам': 'By slot',
  'По ссылке': 'From link', 'Поиск по имени': 'Search by name', 'Показать панель': 'Show panel', 'Прогулка': 'Walk',
  'Разнесение деталей': 'Explode', 'Рентген': 'X-ray', 'Ровный': 'Even', 'Рулетка': 'Measure', 'Свет и сцена': 'Light & scene',
  'Сводка': 'Summary', 'Серая глина': 'Clay', 'Сетка пола': 'Floor grid', 'Сечение': 'Section', 'Скелет': 'Skeleton',
  'Скрыть панель': 'Hide panel', 'Снимок': 'Snapshot', 'Сравнить': 'Compare', 'Студия': 'Studio', 'Толщина каркаса': 'Wire width',
  'Только каркас': 'Wireframe only', 'Три окна': 'Three viewports', 'Угол обзора': 'Field of view', 'Улица': 'Outdoor',
  'Цвет каркаса': 'Wire color', 'Цвет по слотам': 'Color by slot', 'Четыре окна: сверху, спереди, слева, перспектива': 'Four viewports: top, front, left, perspective',
  'Экспозиция': 'Exposure', 'Экспорт': 'Export', 'выбор': 'select', 'выполнить': 'run', 'закрыть': 'close',
  'перетащи файл в окно': 'drop a file here', 'дм': 'dm', 'дюймы': 'inches', 'м': 'm', 'мм': 'mm', 'см': 'cm', 'футы': 'feet',
  'ГБ': 'GB', 'МБ': 'MB', 'КБ': 'KB',
  // команды, меню, справка
  '(линии)': '(lines)', '(без имени)': '(unnamed)', '(без материала)': '(no material)',
  'FBX по умолчанию': 'FBX default', 'Shift + ЛКМ': 'Shift + LMB', 'Xform-узлы': 'Xform nodes',
  'Анимации': 'Animations', 'Анимация': 'Animation', 'Вернуть все окна': 'Restore all viewports', 'Вершины (рендер)': 'Vertices (render)',
  'Вид': 'View', 'Вид в окне': 'Viewport view', 'Вид с грани, ребра, угла': 'View from a face, edge or corner',
  'Вращать вокруг точки': 'Orbit around point', 'Вращение на витрине': 'Turntable', 'Все команды': 'All commands',
  'Выбрать': 'Select', 'Выделение': 'Selection', 'Выключенные слои': 'Disabled layers', 'Выход из инструмента': 'Exit tool',
  'Габарит X·Y·Z': 'Size X·Y·Z', 'Габарит, м': 'Size, m', 'Горячие клавиши': 'Keyboard shortcuts', 'Единицы': 'Units',
  'Загрузка': 'Loading', 'Зум': 'Zoom', 'Изолировать': 'Isolate', 'Изолировать выделенное': 'Isolate selection', 'Интерфейс': 'Interface',
  'Кадрировать': 'Frame', 'Кадры': 'Frames', 'Каркас поверх': 'Wireframe overlay', 'Колесо': 'Wheel', 'Кости': 'Bones',
  'Кривые': 'Curves', 'ЛКМ': 'LMB', 'ПКМ': 'RMB', 'СКМ': 'MMB', 'Линии': 'Lines', 'Материал': 'Material', 'Материалы / слои': 'Materials / layers',
  'Меш': 'Mesh', 'Меш со скином': 'Skinned mesh', 'Меши': 'Meshes', 'Модели и текстуры': 'Models and textures', 'Навигация': 'Navigation',
  'Не показано': 'Not shown', 'Ничего не нашлось': 'Nothing found', 'Ноды': 'Nodes', 'Освещение': 'Lighting',
  'Открыть по ссылке…': 'Open from link…', 'Открыть файл…': 'Open file…', 'Отрезки': 'Segments', 'Отрезки линий': 'Line segments',
  'Очистить замеры': 'Clear measurements', 'Панель настроек': 'Settings panel', 'Перспектива': 'Perspective',
  'Плоское затенение': 'Flat shading', 'Повернуть свет': 'Rotate light', 'Показать': 'Show', 'Показать всё': 'Show all',
  'Пробел': 'Space', 'Прогулка — с клавиатуры: WASD, Q / E': 'Walk needs a keyboard: WASD, Q / E',
  'Развернуть окно': 'Maximize viewport', 'Развернуть окно / вернуть': 'Maximize / restore viewport', 'Режимы': 'Modes',
  'С прозрачным фоном': 'Transparent background', 'СВЕРХУ': 'TOP', 'СЗАДИ': 'BACK', 'СЛЕВА': 'LEFT', 'СНИЗУ': 'BOTTOM',
  'СПЕРЕДИ': 'FRONT', 'СПРАВА': 'RIGHT', 'Сверху': 'Top', 'Снизу': 'Bottom', 'Сдвиг': 'Pan', 'Сзади': 'Back',
  'Скопировать ссылку на модель': 'Copy link to model', 'Скрыть': 'Hide', 'Скрыть выделенное': 'Hide selection', 'Слева': 'Left',
  'Слой': 'Layer', 'Сначала открой модель': 'Open a model first', 'Снимок окна': 'Viewport snapshot',
  'Снимок окна (PNG)': 'Viewport snapshot (PNG)', 'Снимок с прозрачным фоном (PNG)': 'Snapshot with transparent background (PNG)',
  'Снимок сохранён в загрузки': 'Snapshot saved to Downloads', 'Снять': 'Clear', 'Снять выделение': 'Deselect',
  'Спереди': 'Front', 'Справа': 'Right', 'Ссылка на модель:': 'Link to model:',
  'Ссылка на файл модели (прямая; GitHub и Dropbox тоже подойдут):': 'Link to a model file (direct; GitHub and Dropbox links work too):',
  'Ссылка скопирована': 'Link copied', 'Тела ACIS': 'ACIS solids', 'Точки': 'Points', 'Треугольники': 'Triangles',
  'Убрать из списка': 'Remove from list', 'Удалить последний замер': 'Delete last measurement', 'Уже угол обзора': 'Narrower field of view',
  'Установить как приложение': 'Install as app', 'Файл': 'File', 'Формат не поддержан': 'Format not supported',
  'Четыре окна': 'Four viewports', 'Шире угол обзора': 'Wider field of view', 'Экспорт видимого': 'Export visible',
  'Эта справка': 'This help', 'Это не похоже на ссылку': 'That doesn’t look like a link',
  'Файл не скачался: сайт недоступен или не разрешает загрузку с чужих страниц (CORS). Скачай файл и перетащи его в окно.':
    'The file didn’t download: the site is unreachable or doesn’t allow loading from other pages (CORS). Download the file and drop it here.',
  'Alembic не открывается со страницы, запущенной двойным кликом: открой страницу через веб-сервер':
    'Alembic can’t be opened from a page started by double-click: open the page through a web server',
  'glTF 2.0: материалы, текстуры, анимация · м': 'glTF 2.0: materials, textures, animation · m',
  'двоичный 7.4: материалы, текстуры, без анимации': 'binary 7.4: materials, textures, no animation',
  'для печати · мм, Z вверх': 'for 3D printing · mm, Z up', 'только геометрия · м': 'geometry only · m',
  'из файла': 'from file', 'из чертежа': 'from drawing', 'материал': 'material', 'нет доступа к файлу': 'no access to the file',
  'сервер не поддерживает сохранение': 'the server does not support saving', 'открой файл заново': 'open the file again',
  'по размеру — проверь': 'guessed from size — check', 'по стандарту GLTF': 'glTF standard', 'подпись слева сверху': 'label at top left',
  'поток не запустился': 'worker didn’t start', 'принято для 3MF': 'assumed for 3MF', 'принято для STL': 'assumed for STL',
  'скрыты, включаются в списке': 'hidden, enable them in the list', 'тела ACIS (показаны)': 'ACIS solids (shown)',
  'файла больше нет на месте': 'the file is no longer there', 'щелчок': 'click', 'щелчок по кубу': 'click the cube',
  'этот формат разбирается в фоновом потоке, а браузер его не запустил': 'this format is parsed in a background worker, but the browser didn’t start it',
  'CAD, переведён в мм': 'CAD, converted to mm', 'IFC, переведён в метры': 'IFC, converted to metres',
  'OpenCascade не прочитал файл': 'OpenCascade couldn’t read the file', 'USD: единицы не указаны, по стандарту — см': 'USD: units not set, cm by standard',
  'Элементы IFC': 'IFC elements', 'без цвета': 'no color', 'в 3MF не нашлось сеток': 'no meshes found in 3MF',
  'в 3MF нет файла модели': '3MF has no model file', 'из файла 3MF': 'from 3MF file', 'неожиданная структура архива': 'unexpected archive structure',
  'файл Alembic не дописан (Ogawa не «заморожен»)': 'the Alembic file is incomplete (Ogawa not “frozen”)',
  'это не Alembic/Ogawa (старый HDF5-формат не поддерживается)': 'not Alembic/Ogawa (the old HDF5 format isn’t supported)',
  // составные части
  'Набор': 'Set', 'Группа': 'Group', 'Вернуть': 'Restore', 'Очистить': 'Clear', 'Закрыть рулетку': 'Close measure', 'Выйти': 'Exit',
  'Колесо мыши меняет скорость': 'Mouse wheel changes speed', '? — клавиши': '? — keys', 'клавиши': 'keys',
  'Щелчок — точка · вершины притягивают': 'Click — point · snaps to vertices',
  'WASD — идти · Q / E — вниз / вверх · Shift — быстрее · мышь — взгляд': 'WASD — walk · Q / E — down / up · Shift — faster · mouse — look',
  'разбор в фоне…': 'parsing in background…', 'сборка сцены…': 'building scene…', 'выбрано': 'selected', 'объектов': 'objects',
  'Копии блока': 'Block copies', 'Окно': 'Viewport', 'Сохранено': 'Saved', 'Снимок не сохранён': 'Snapshot not saved',
  'Не найдено текстур': 'Textures not found', 'Не открылось': 'Couldn’t open', 'Не удалось открыть': 'Couldn’t open',
  'Не удалось прочитать перетащенное': 'Couldn’t read the dropped items', 'Не удалось разобрать файл': 'Couldn’t parse the file',
  'Не удалось скачать': 'Download failed', 'Ошибка загрузки': 'Load error', 'Экспорт не удался': 'Export failed',
  'в загрузках': 'in Downloads', 'Чтение': 'Reading', 'Разбор': 'Parsing', 'Конвертация': 'Converting',
  '… большие чертежи — до минуты': '… large drawings take up to a minute', 'скин': 'skinned', 'чтение': 'reading',
  'Вышла новая версия': 'A new version is available', 'Обновить': 'Reload', 'Установлено как приложение': 'Installed as an app',
  'Язык': 'Language', 'Язык интерфейса': 'Interface language', 'Интерфейс: русский': 'Интерфейс: русский',
  // сравнение
  'Сравнение': 'Compare', 'Сравнить с другой версией…': 'Compare with another version…', 'Выйти из сравнения': 'Exit compare',
  'Отклонение': 'Deviation', 'Наложение': 'Overlay', 'Только A': 'Only A', 'Только B': 'Only B', 'А и Б': 'A and B',
  'макс.': 'max', 'средн.': 'mean', 'совпадает': 'matches', 'допуск': 'tolerance', 'Отклонение B от A': 'Deviation of B from A',
  'Открой второй файл — он ляжет поверх для сравнения': 'Open a second file — it will be overlaid for comparison',
  'Сравнение: выбери вторую версию модели': 'Compare: choose the second version of the model',
  'Центры': 'Centers', 'Сдвинуть B так, чтобы центры габаритов совпали': 'Move B so the bounding-box centers match',
  'Сравнивать нечего: нет сеток': 'Nothing to compare: no meshes', 'Отклонение не посчиталось': 'Deviation failed', 'ошибка потока': 'worker error',
};

// шаблоны: [регулярка, замена]
const RULES = [
  [/^Экспорт в (\S+)$/, 'Export to $1'],
  [/^Раскладка: (\d) окн[оа]$/, (_, n) => `Layout: ${n} viewport${n === '1' ? '' : 's'}`],
  [/^Нужен файл (.+)$/, 'Needs a file: $1'],
  [/^По ссылке нужен файл (.+)$/, 'The link must point to a file: $1'],
  [/^Не удалось разобрать (\S+)$/, 'Couldn’t parse $1'],
  [/^показано (.+)$/, 'shown $1'],
  [/^…ещё (.+)$/, '…$1 more'],
  [/^сервер ответил (\d+)$/, 'server returned $1'],
  [/^([\d.e+-]+) м в единице$/, '$1 m per unit'],
  [/^(\d+) объектов$/, '$1 objects'],
];
// числа с единицами: «0.2 с», «12 мм», «1.5 МБ», «12 отр.»
const UNITS = { 'с': 's', 'мм': 'mm', 'см': 'cm', 'дм': 'dm', 'м': 'm', 'км': 'km', 'ГБ': 'GB', 'МБ': 'MB', 'КБ': 'KB', 'отр.': 'seg.' };
const UNIT_RE = /(\d[kM]?)\s(с|мм|см|дм|км|м|ГБ|МБ|КБ|отр\.)(?=$|[^А-Яа-яЁё])/g;
const CYR = /[А-Яа-яЁё]/;
const SPLIT = /( · | — |: |, | \(|\)|\/)/;

export const missed = new Set();     // непереведённое — для проверки словаря

function piece(s) {
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim();
  if (!core || !CYR.test(core)) return s;
  if (EN[core] != null) return lead + EN[core] + tail;
  for (const [re, rep] of RULES) if (re.test(core)) return lead + core.replace(re, rep) + tail;
  const u = core.replace(UNIT_RE, (_, d, unit) => d + ' ' + UNITS[unit]);
  if (u !== core && !CYR.test(u)) return lead + u + tail;
  return null;
}

export function tr(s) {
  if (!s || !CYR.test(s)) return s;
  const whole = piece(s);
  if (whole != null) return whole;
  const par = s.match(/^(.*?) \((.+)\)(\s*)$/s);              // «мм (по размеру — проверь)»: скобки переводятся целиком
  if (par) return tr(par[1]) + ' (' + tr(par[2]) + ')' + par[3];
  const parts = s.split(SPLIT);
  if (parts.length > 1) {
    const out = parts.map(p => SPLIT.test(p) ? p : (piece(p) ?? p.replace(UNIT_RE, (_, d, unit) => d + ' ' + UNITS[unit])));
    const joined = out.join('');
    if (CYR.test(joined)) missed.add(s);
    return joined;
  }
  const u = s.replace(UNIT_RE, (_, d, unit) => d + ' ' + UNITS[unit]);
  if (CYR.test(u)) missed.add(s);
  return u;
}

const ATTRS = ['data-tip', 'placeholder', 'title', 'aria-label'];
const SKIP = '.tn, #fname, .rn, [data-notr]';     // имена файлов и объектов

function fixText(n) {
  const p = n.parentElement;
  if (!p || p.closest(SKIP) || p.closest('script, style')) return;
  const v = n.nodeValue;
  if (!CYR.test(v)) return;
  const t = tr(v);
  if (t !== v) n.nodeValue = t;
}
function fixEl(e) {
  if (e.closest && e.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = e.getAttribute && e.getAttribute(a);
    if (v && CYR.test(v)) { const t = tr(v); if (t !== v) e.setAttribute(a, t); }
  }
}
function walk(root) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1) return;
  fixEl(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === 3 ? fixText(n) : fixEl(n);
}

export function startTranslation(lang) {
  if (lang === 'ru') return;
  document.documentElement.lang = lang;
  walk(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') fixText(m.target);
      else if (m.type === 'attributes') fixEl(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
