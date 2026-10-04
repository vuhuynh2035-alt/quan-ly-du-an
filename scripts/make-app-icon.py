"""Crop outer dark pad from SAREE icon and emit PWA icon sizes."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "icon-input.jpg"
OUT = ROOT / "public"


def is_gold(r: int, g: int, b: int) -> bool:
    """Metallic gold / bronze on the letter and frame."""
    return r >= 90 and g >= 45 and r > b + 20 and r >= g - 5


def is_pad(r: int, g: int, b: int) -> bool:
    """Outer dark canvas around the squircle (not the icon interior)."""
    return max(r, g, b) <= 42 and abs(r - g) <= 12 and abs(g - b) <= 16 and r <= 45


def rgb_at(px, x: int, y: int) -> tuple[int, int, int]:
    p = px[x, y]
    return int(p[0]), int(p[1]), int(p[2])


def gold_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    px = im.load()
    w, h = im.size
    # Horizontal extent from a mid band (avoids bottom specular spill).
    xs: list[int] = []
    for y in range(h // 3, (2 * h) // 3):
        for x in range(w):
            if is_gold(*rgb_at(px, x, y)):
                xs.append(x)
    if not xs:
        raise SystemExit("No gold pixels found")
    left, right = min(xs), max(xs)

    # Vertical extent: use side columns (avoid center bottom glow under the icon).
    ys: list[int] = []
    for x in list(range(left + 20, left + 80)) + list(range(right - 80, right - 20)):
        for y in range(h):
            if is_gold(*rgb_at(px, x, y)):
                ys.append(y)
    # Also include top/bottom arc via center-x gold, but cap bottom near side extent.
    side_top, side_bot = min(ys), max(ys)
    cy_xs = (left + right) // 2
    center_ys = [y for y in range(h) if is_gold(*rgb_at(px, cy_xs, y))]
    top = min(side_top, min(center_ys) if center_ys else side_top)
    # Bottom: prefer side measurement; allow a little of the center rim.
    bottom = max(side_bot, min(max(center_ys) if center_ys else side_bot, side_bot + 40))

    # Small pad so the gold bevel is not clipped.
    pad = 4
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(w - 1, right + pad)
    bottom = min(h - 1, bottom + pad)
    return left, top, right + 1, bottom + 1


def square_box(box: tuple[int, int, int, int], w: int, h: int) -> tuple[int, int, int, int]:
    l, t, r, b = box
    bw, bh = r - l, b - t
    side = max(bw, bh)
    cx = (l + r) / 2
    cy = (t + b) / 2
    nl = int(round(cx - side / 2))
    nt = int(round(cy - side / 2))
    nr = nl + side
    nb = nt + side
    if nl < 0:
        nr -= nl
        nl = 0
    if nt < 0:
        nb -= nt
        nt = 0
    if nr > w:
        nl -= nr - w
        nr = w
    if nb > h:
        nt -= nb - h
        nb = h
    nl, nt = max(0, nl), max(0, nt)
    return nl, nt, nr, nb


def make_transparent_corners(im: Image.Image) -> Image.Image:
    """Flood-fill outer pad from corners only — keep dark interior."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    seen: set[tuple[int, int]] = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= w or y >= h:
            continue
        seen.add((x, y))
        r, g, b, _a = px[x, y]
        if not is_pad(r, g, b):
            continue
        px[x, y] = (0, 0, 0, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def fit_on_canvas(im: Image.Image, size: int, margin_ratio: float = 0.0) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    margin = max(0, int(size * margin_ratio))
    target = size - 2 * margin
    fitted = im.copy()
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def make_maskable(im: Image.Image, size: int, content_ratio: float = 0.82) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (6, 13, 31, 255))
    target = int(size * content_ratio)
    fitted = im.copy()
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def main() -> None:
    raw = Image.open(SRC).convert("RGBA")
    box = square_box(gold_bbox(raw), *raw.size)
    cropped = raw.crop(box)
    icon = make_transparent_corners(cropped)
    print(f"source={raw.size} crop={box} icon={icon.size}")

    OUT.mkdir(parents=True, exist_ok=True)
    icon.save(OUT / "icon-source.png", "PNG", optimize=True)

    fit_on_canvas(icon, 192).save(OUT / "icon-192.png", "PNG", optimize=True)
    fit_on_canvas(icon, 512).save(OUT / "icon-512.png", "PNG", optimize=True)

    apple = fit_on_canvas(icon, 180)
    apple_bg = Image.new("RGBA", (180, 180), (6, 13, 31, 255))
    apple_bg.paste(apple, (0, 0), apple)
    apple_bg.save(OUT / "apple-touch-icon.png", "PNG", optimize=True)

    make_maskable(icon, 512).save(OUT / "icon-512-maskable.png", "PNG", optimize=True)

    for name in (
        "icon-source.png",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
        "icon-512-maskable.png",
    ):
        p = OUT / name
        with Image.open(p) as im:
            print(f"{name}: {im.size} {im.mode} {p.stat().st_size} bytes")


if __name__ == "__main__":
    main()
