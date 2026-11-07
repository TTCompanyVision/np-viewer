"""Собирает сайт NP Viewer в папку site/ — её можно положить на любой статический хостинг (GitHub Pages, Netlify…).

    python build.py              # site/
    python build.py --zip        # + np-viewer-site.zip (Netlify Drop)

Нужен только Python 3.9+, без пакетов. Форматы: FBX, GLB/GLTF, OBJ (+MTL и текстуры), DAE, 3DS, STL, 3MF, PLY, ABC,
STEP/IGES, IFC, 3DM, USD/USDA/USDC/USDZ.

Всё, что страница грузит сама (three.js и загрузчики, фоновый поток разбора model_worker.js, библиотеки
форматов), лежит рядом с ней в site/vendor/: страница не зависит от CDN. Веб-версия — PWA: манифест,
иконки и офлайн-кэш (sw.js), её можно установить как приложение и открывать файлы из Проводника.

site/index.html — страница; рядом потоки, библиотеки, манифест, иконки и sw.js.
"""
import hashlib
import json
import os
import re
import shutil

import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts"))
import prepare_vendor  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "site")
CDN = "https://cdn.jsdelivr.net/npm/three@0.187.0/"
FILES = {"abc_reader.js": "abc_reader.js", "model_worker.js": "model_worker.js", "fbx_writer.js": "fbx_writer.js",
         "i18n.js": "i18n.js"}
# библиотеки рядом с three.js: STEP/IGES (occt), IFC (web-ifc), 3DM (rhino3dm) — грузятся только при первом таком файле
LIBS = ["three", "occt", "web-ifc", "rhino3dm"]

# PWA: манифест, иконки (make_icons.py), офлайн-кэш (sw.js)
WEB_EXT = [".fbx", ".glb", ".gltf", ".dae", ".3ds", ".abc", ".obj", ".stl", ".3mf", ".ply",
           ".step", ".stp", ".iges", ".igs", ".ifc", ".3dm", ".usd", ".usda", ".usdc", ".usdz"]
ICONS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "icon.svg"]
PWA_HEAD = ('<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#0E0F11">\n'
            '<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="icon-192.png">')


def vendor_tag():
    """Отпечаток содержимого библиотек: изменился файл — новая папка, старый кэш браузера не подсунет старое."""
    h = hashlib.sha1()
    for lib in LIBS:
        root = os.path.join(HERE, "vendor", lib)
        for r, _, fs in sorted(os.walk(root)):
            for f in sorted(fs):
                p = os.path.join(r, f)
                h.update(os.path.relpath(p, os.path.dirname(root)).encode())
                with open(p, "rb") as fh:
                    h.update(fh.read())
    return "v-" + h.hexdigest()[:10]


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)



def write_pwa(tag, html):
    for name in ICONS:
        copy(os.path.join(HERE, "assets", name), os.path.join(OUT, name))
    manifest = {
        "name": "NP Viewer", "short_name": "NP Viewer", "id": "./",
        "description": "Open almost any 3D file right in the browser — FBX, glTF, OBJ, STEP, IFC, 3DM, USD and more. Files never leave your computer.",
        "start_url": "./", "scope": "./", "display": "standalone", "background_color": "#0E0F11", "theme_color": "#0E0F11",
        "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
                  {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
        # установленное приложение появляется в «Открыть с помощью» для этих расширений (Chrome, Edge)
        "file_handlers": [{"action": "./", "accept": {"application/octet-stream": WEB_EXT}}],
        "launch_handler": {"client_mode": "focus-existing"},
    }
    with open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    # оболочка для офлайна: страница, потоки, иконки и вся three.js; библиотеки STEP/IFC/3DM — по первому требованию
    three = os.path.join(OUT, "vendor", tag, "three")
    shell = ["./", "index.html", "manifest.webmanifest"] + list(FILES) + ICONS
    shell += sorted(os.path.relpath(os.path.join(r, f), OUT).replace("\\", "/") for r, _, fs in os.walk(three) for f in fs)
    modules = b"".join(open(os.path.join(HERE, src), "rb").read() for src in FILES.values())
    version = tag + "-" + hashlib.sha1(html.encode("utf-8") + modules).hexdigest()[:8]
    sw = open(os.path.join(HERE, "sw.js"), encoding="utf-8").read()
    assert "'__VERSION__'" in sw and "__SHELL__" in sw, "в sw.js нет мест для версии и списка файлов"
    sw = sw.replace("'__VERSION__'", json.dumps(version)).replace("__SHELL__", json.dumps(shell, ensure_ascii=False))
    with open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(sw)
    print(f"PWA: манифест, {len(ICONS)} иконки, офлайн-оболочка {len(shell)} файлов, версия {version}")


def main():
    # three.js без «голых» импортов (для фонового потока), заглушка EXR в 3DMLoader, исправленный FBXLoader.mv.js
    prepare_vendor.rewrite_imports()
    prepare_vendor.stub_3dm_exr()
    prepare_vendor.mark_usd_units()
    prepare_vendor.patch_collada()
    prepare_vendor.write_fbx_patched()

    # очищаем содержимое, а не саму папку: её может держать запущенный локальный сервер
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):
        p = os.path.join(OUT, name)
        shutil.rmtree(p, ignore_errors=True) if os.path.isdir(p) else os.remove(p)   # занятая пустая папка не мешает

    for dst, src in FILES.items():
        copy(os.path.join(HERE, src), os.path.join(OUT, dst))
    tag = vendor_tag()
    for lib in LIBS:
        shutil.copytree(os.path.join(HERE, "vendor", lib), os.path.join(OUT, "vendor", tag, lib))
    local = f"./vendor/{tag}/three/"    # относительный адрес: import map принимает только "./", "../" или "/"

    html = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    assert VIEWPORT in html, "в странице нет meta viewport — после неё вставляется манифест"
    assert html.count(CDN) >= 3, "адрес three.js в странице поменялся — поправь CDN в build.py"
    html = html.replace(CDN, local)
    html = html.replace(VIEWPORT, VIEWPORT + '\n' + PWA_HEAD, 1)
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

    write_pwa(tag, html)

    # Netlify: библиотеки лежат в папке с отпечатком версии — пусть браузер держит их неделю;
    # sw.js — всегда свежий, иначе обновления сайта не дойдут до установленных копий
    with open(os.path.join(OUT, "_headers"), "w", encoding="utf-8", newline="\n") as f:
        f.write("/vendor/*\n  Cache-Control: public, max-age=604800\n"
                "/sw.js\n  Cache-Control: no-cache\n"
                "/manifest.webmanifest\n  Content-Type: application/manifest+json\n")

    files = [os.path.relpath(os.path.join(r, f), OUT).replace("\\", "/")
             for r, _, fs in os.walk(OUT) for f in fs]
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in files)
    print(f"site/: {len(files)} файлов, {total / 2**20:.1f} МБ, библиотеки в vendor/{tag}/")
    return files


def make_zip(files, path):
    """Архив для Netlify Drop и любого хостинга: index.html в корне."""
    import zipfile
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(files):
            z.write(os.path.join(OUT, f), f)
    print(f"{os.path.basename(path)}: {os.path.getsize(path) / 2**20:.1f} МБ")


if __name__ == "__main__":
    import sys
    built = main()
    if "--zip" in sys.argv:
        make_zip(built, os.path.join(HERE, "np-viewer-site.zip"))
