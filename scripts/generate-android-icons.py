"""Tạo icon launcher + splash Android từ icon của dự án (public/icon-512-maskable.png).
Chạy: python scripts/generate-android-icons.py  (cần Pillow)"""
import os
from PIL import Image, ImageDraw

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
res = os.path.join(root, "android", "app", "src", "main", "res")
src = Image.open(os.path.join(root, "public", "icon-512-maskable.png")).convert("RGBA")
bg_rgb = src.getpixel((4, 4))[:3]
bg_hex = "#%02X%02X%02X" % bg_rgb

DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

def fit(img, px):
    return img.resize((px, px), Image.LANCZOS)

for d, k in DENS.items():
    out = os.path.join(res, "mipmap-" + d)
    os.makedirs(out, exist_ok=True)
    # Icon cũ (vuông bo góc nhẹ) + tròn
    legacy = round(48 * k)
    sq = fit(src, legacy)
    mask = Image.new("L", (legacy, legacy), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, legacy - 1, legacy - 1], radius=legacy * 0.18, fill=255)
    sq_out = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0)); sq_out.paste(sq, (0, 0), mask)
    sq_out.save(os.path.join(out, "ic_launcher.png"))
    cmask = Image.new("L", (legacy, legacy), 0)
    ImageDraw.Draw(cmask).ellipse([0, 0, legacy - 1, legacy - 1], fill=255)
    rd = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0)); rd.paste(sq, (0, 0), cmask)
    rd.save(os.path.join(out, "ic_launcher_round.png"))
    # Lớp foreground thích ứng 108dp; logo chiếm ~82% để nằm trong vùng an toàn
    fg_px = round(108 * k)
    canvas = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
    logo = fit(src, round(fg_px * 0.82))
    canvas.paste(logo, ((fg_px - logo.width) // 2, (fg_px - logo.height) // 2), logo)
    canvas.save(os.path.join(out, "ic_launcher_foreground.png"))

with open(os.path.join(res, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">%s</color>\n</resources>\n' % bg_hex)

# Splash: nền cùng màu, logo ở giữa
for dirpath, _, files in os.walk(res):
    if "splash.png" in files and os.path.basename(dirpath).startswith("drawable"):
        p = os.path.join(dirpath, "splash.png")
        w, h = Image.open(p).size
        img = Image.new("RGBA", (w, h), bg_rgb + (255,))
        s = round(min(w, h) * 0.32)
        logo = fit(src, s)
        img.paste(logo, ((w - s) // 2, (h - s) // 2), logo)
        img.convert("RGB").save(p)
print("done bg", bg_hex)
