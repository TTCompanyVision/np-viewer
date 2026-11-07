"""Иконки приложения (PWA) из логотипа: квадрат, диагональ, рыжий срезанный угол на тёмном фоне.

    python scripts/make_icons.py   → assets/icon-192.png, icon-512.png, icon-maskable-512.png, icon.svg

Рисуется с запасом по разрешению (×4) и уменьшается — края гладкие. Нужен Pillow (в системном Python есть).
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "assets")
BG, ACC, LINE = (14, 15, 17, 255), (221, 100, 39, 255), (232, 232, 235, 255)


def draw(size, pad):
    """pad — доля поля вокруг знака (у maskable-иконки Android обрезает края кругом/скруглённым квадратом)."""
    k = 4
    S = size * k
    im = Image.new("RGBA", (S, S), BG)
    d = ImageDraw.Draw(im)
    a, b = S * pad, S * (1 - pad)                 # квадрат знака
    w = max(2, round(S * 0.035))                  # толщина линии
    m = (a + b) / 2
    d.polygon([(m - (b - a) * 0.03, a), (b, a), (b, m + (b - a) * 0.03)], fill=ACC)   # рыжий угол
    d.rectangle([a, a, b, b], outline=LINE, width=w)
    d.line([(a + w / 2, b - w / 2), (m + (b - a) * 0.04, m - (b - a) * 0.04)], fill=LINE, width=w)
    return im.resize((size, size), Image.LANCZOS)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<rect width="24" height="24" fill="#0E0F11"/>
<path d="M12 3.5h8.5V12z" fill="#DD6427"/>
<path d="M3.5 3.5h17v17h-17zM3.5 20.5 13 11" fill="none" stroke="#E8E8EB" stroke-width="1.4"/>
</svg>
"""

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    draw(192, 0.2).save(os.path.join(OUT, "icon-192.png"))
    draw(512, 0.2).save(os.path.join(OUT, "icon-512.png"))
    draw(512, 0.28).save(os.path.join(OUT, "icon-maskable-512.png"))
    with open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(SVG)
    print("web_assets: иконки готовы")
