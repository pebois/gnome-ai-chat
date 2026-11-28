#!/usr/bin/env python3
"""Frame raw @2x GTK4 window captures (1600x1200) onto 1700x1300 RGBA with
anti-aliased 24px rounded corners, Libadwaita 1pt border/highlight, and a
GNOME/Mutter-style multi-layer window drop shadow."""

import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

TARGET_W = 1600
TARGET_H = 1200
PAD = 50
RADIUS = 24


def build_gnome_shadow(w: int, h: int, pad: int, radius: int, is_light: bool) -> Image.Image:
    cw, ch = w + pad * 2, h + pad * 2

    # 1. Wide ambient GNOME shadow (centered, soft)
    ambient = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(ambient).rounded_rectangle(
        [pad, pad + 2, pad + w - 1, pad + h + 1],
        radius=radius,
        fill=60 if is_light else 85,
    )
    ambient = ambient.filter(ImageFilter.GaussianBlur(radius=16))

    # 2. Key downward drop shadow (Mutter / GNOME Shell style)
    key = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(key).rounded_rectangle(
        [pad + 2, pad + 8, pad + w - 3, pad + h + 7],
        radius=radius,
        fill=95 if is_light else 135,
    )
    key = key.filter(ImageFilter.GaussianBlur(radius=12))

    # 3. Tight contact shadow right under the window rim
    contact = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(contact).rounded_rectangle(
        [pad - 1, pad, pad + w, pad + h + 2],
        radius=radius + 1,
        fill=55 if is_light else 80,
    )
    contact = contact.filter(ImageFilter.GaussianBlur(radius=3))

    # 4. Crisp 1pt (2px @2x) Libadwaita outer border
    border = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(border).rounded_rectangle(
        [pad - 2, pad - 2, pad + w + 1, pad + h + 1],
        radius=radius + 2,
        fill=42 if is_light else 75,
    )

    merged_a = ImageChops.add(ImageChops.add(ambient, key), contact)
    merged_a = ImageChops.lighter(merged_a, border)

    shadow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    shadow.putalpha(merged_a)
    return shadow


def build_inner_highlight(w: int, h: int, radius: int) -> Image.Image:
    """Subtle 1pt (2px @2x) Libadwaita inner top/edge highlight for dark windows."""
    scale = 4
    hi = Image.new("RGBA", (w * scale, h * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(hi)
    draw.rounded_rectangle(
        [0, 0, w * scale - 1, h * scale - 1],
        radius=radius * scale,
        outline=(255, 255, 255, 24),
        width=2 * scale,
    )
    return hi.resize((w, h), Image.Resampling.LANCZOS)


def frame_image(
    src: Path,
    dst: Path,
    shadow: Image.Image,
    mask: Image.Image,
    inner_highlight: Image.Image | None,
) -> None:
    im = Image.open(src).convert("RGBA")
    if im.size != (TARGET_W, TARGET_H):
        im = im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)

    if inner_highlight is not None:
        im = Image.alpha_composite(im, inner_highlight)

    canvas = shadow.copy()
    rounded = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
    rounded.paste(im, (0, 0), mask)
    canvas.paste(rounded, (PAD, PAD), mask)
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, "PNG", optimize=True)


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: frame.py <raw_dir> <out_dir>", file=sys.stderr)
        sys.exit(1)

    raw_dir = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])

    scale = 4
    mask_hi = Image.new("L", (TARGET_W * scale, TARGET_H * scale), 0)
    ImageDraw.Draw(mask_hi).rounded_rectangle(
        [0, 0, TARGET_W * scale - 1, TARGET_H * scale - 1],
        radius=RADIUS * scale,
        fill=255,
    )
    mask = mask_hi.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)

    dark_shadow = build_gnome_shadow(TARGET_W, TARGET_H, PAD, RADIUS, is_light=False)
    light_shadow = build_gnome_shadow(TARGET_W, TARGET_H, PAD, RADIUS, is_light=True)
    dark_highlight = build_inner_highlight(TARGET_W, TARGET_H, RADIUS)

    count = 0
    for src in sorted(raw_dir.rglob("*.png")):
        rel = src.relative_to(raw_dir)
        is_light = "light" in rel.parts
        dst = out_dir / rel
        frame_image(
            src,
            dst,
            light_shadow if is_light else dark_shadow,
            mask,
            None if is_light else dark_highlight,
        )
        count += 1
        print(f"Framed {rel} -> {dst}")

    print(f"Done: framed {count} @2x screenshots.")


if __name__ == "__main__":
    main()
