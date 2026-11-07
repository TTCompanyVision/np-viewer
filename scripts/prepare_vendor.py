"""Готовит локальную копию three.js (vendor/three) к работе в фоновом потоке (Web Worker).

    python scripts/prepare_vendor.py     (build.py вызывает сам)

1. В примерах (examples/jsm) импорт `from 'three'` заменяется относительным путём до build/three.module.js.
   В воркерах карта импортов (import map) не действует, а путь резолвится в тот же адрес, что и `three`
   из карты импортов страницы, — значит, модуль three.js в окне остаётся один.
2. В 3DMLoader импорт EXRLoader заменяется заглушкой.
3. Пишется FBXLoader.mv.js — FBXLoader с исправлениями из блока #fbx-patch страницы index.html.

Повторный запуск ничего не портит.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # корень репозитория
THREE = os.path.join(HERE, "vendor", "three")
JSM = os.path.join(THREE, "examples", "jsm")


def relative_three(path):
    rel = os.path.relpath(os.path.join(THREE, "build", "three.module.js"), os.path.dirname(path)).replace("\\", "/")
    return rel if rel.startswith(".") else "./" + rel


def rewrite_imports():
    changed = 0
    for root, _, files in os.walk(JSM):
        for name in files:
            if not name.endswith(".js"):
                continue
            path = os.path.join(root, name)
            src = open(path, encoding="utf-8").read()
            new = re.sub(r"""from\s+(['"])three\1""", f"from '{relative_three(path)}'", src)
            if new != src:
                with open(path, "w", encoding="utf-8", newline="\n") as f:
                    f.write(new)
                changed += 1
    return changed


def stub_3dm_exr():
    """3DMLoader тянет EXRLoader только ради HDR-окружения из файла Rhino — нам оно не нужно, файл не качаем."""
    path = os.path.join(JSM, "loaders", "3DMLoader.js")
    if not os.path.isfile(path):
        return
    src = open(path, encoding="utf-8").read()
    old = "import { EXRLoader } from '../loaders/EXRLoader.js';"
    stub = ("class EXRLoader { setPriority() { return this; } setCache() { return this; } load() { return null; } }"
            "   // заглушка: HDR-окружение 3DM не загружаем")
    src = src.replace("class EXRLoader { load() { return null; } }   // заглушка: HDR-окружение 3DM не загружаем", stub)
    if old in src or stub in src:
        src = src.replace(old, stub)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(src)


def mark_usd_units():
    """USDComposer (three.js 0.187) масштабирует сцену, только если metersPerUnit записан в файле. Помечаем в группе,
    был ли он: если нет — по стандарту USD действуют сантиметры (0.01), это применяет model_worker.js."""
    path = os.path.join(JSM, "loaders", "usd", "USDComposer.js")
    if not os.path.isfile(path):
        return
    src = open(path, encoding="utf-8").read()
    old = "\t\tconst metersPerUnit = rootFields.metersPerUnit;\n"
    mark = "group.userData.metersPerUnit = metersPerUnit;"
    if old in src and mark not in src:
        src = src.replace(old, old + "\t\t" + mark + "   // NP Viewer: записан ли в файле\n")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(src)


def patch_collada():
    """ColladaParser (three 0.187): в <polygons> каждый <p> — отдельный многоугольник, а парсер берёт только последний
    и падает, если <p> нет. Собираем все <p>, vcount — по их длинам."""
    path = os.path.join(JSM, "loaders", "collada", "ColladaParser.js")
    if not os.path.isfile(path):
        return
    src = open(path, encoding="utf-8").read()
    old_p = ("\t\t\t\tcase 'p':\n"
             "\t\t\t\t\tprimitive.p = parseInts( child.textContent );\n"
             "\t\t\t\t\tbreak;\n")
    new_p = ("\t\t\t\tcase 'p':   // NP Viewer: в <polygons> каждый <p> — отдельный многоугольник\n"
             "\t\t\t\t\tif ( primitive.type === 'polygons' ) ( primitive.pList = primitive.pList || [] ).push( parseInts( child.textContent ) );\n"
             "\t\t\t\t\telse primitive.p = parseInts( child.textContent );\n"
             "\t\t\t\t\tbreak;\n")
    old_v = ("\t\tif ( primitive.type === 'polygons' ) {\n\n"
             "\t\t\tprimitive.vcount = [ primitive.p.length / primitive.stride ];\n\n"
             "\t\t}\n")
    new_v = ("\t\tif ( primitive.type === 'polygons' ) {   // NP Viewer: все <p>; многоугольники с дырами (<ph>) пропускаются, как в r160\n\n"
             "\t\t\tconst list = primitive.pList || [];\n"
             "\t\t\tprimitive.count = list.length;\n"
             "\t\t\tprimitive.vcount = list.map( a => a.length / primitive.stride );\n"
             "\t\t\tprimitive.p = [];\n"
             "\t\t\tfor ( const a of list ) for ( let i = 0; i < a.length; i ++ ) primitive.p.push( a[ i ] );\n"
             "\t\t\tdelete primitive.pList;\n\n"
             "\t\t}\n")
    if "NP Viewer: все <p>" in src:
        return
    assert src.count(old_p) == 1 and src.count(old_v) == 1, "ColladaParser.js: не найдено место правки <polygons>"
    src = src.replace(old_p, new_p).replace(old_v, new_v)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)


def write_fbx_patched():
    html = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    patch = json.loads(re.search(r'<script type="application/json" id="fbx-patch">(.*?)</script>', html, re.S).group(1))
    loaders = os.path.join(JSM, "loaders")
    src = open(os.path.join(loaders, "FBXLoader.js"), encoding="utf-8").read()
    for old, new in patch:
        assert src.count(old) == 1, f"в FBXLoader.js не найдено место правки: {old[:60]}"
        src = src.replace(old, new)
    with open(os.path.join(loaders, "FBXLoader.mv.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(src)


if __name__ == "__main__":
    n = rewrite_imports()
    stub_3dm_exr()
    mark_usd_units()
    patch_collada()
    write_fbx_patched()
    print(f"vendor/three: импорт 'three' переписан в {n} файлах, FBXLoader.mv.js готов")
