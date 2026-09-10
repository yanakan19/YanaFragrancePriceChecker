#!/usr/bin/env python3
"""
Measures a downloaded logo candidate against the two theme grounds this app
actually renders on — called once per raster file by scripts/logo-probe.ts.

WHY THIS SHAPE. Same trade-off scripts/image-box-classify.py already makes
and documents: this machine has Pillow and nothing else for image decoding,
the images here are small (logos, not product photography), and this runs at
a "probe once, read the report" cadence rather than per page view, so plain
pixel access is fine.

THE METHOD, matching docs/LOGOS-PLAN.md §2d exactly: every pixel whose alpha
is at least half is "ink". For each ink pixel, compute WCAG relative
luminance and the (L1+0.05)/(L2+0.05) contrast ratio against the two grounds
this site actually ships — #0A0A0B dark, #FCFCFD light, the same values
demo/template.html's :root blocks declare — and count the share that falls
under 3:1 against each. That is the same formula demo/contrast.ts implements
in TypeScript for the page itself; duplicated here in Python because this
runs with no browser and no bundler, on a file the page will never load.

CLASSIFYING ink from the two percentages, per the worked table in
docs/LOGOS-PLAN.md §2d: a mostly-transparent mark (>20% transparent) that
fails harder on the dark ground has dark ink and wants a light tile
(`'dark'`); one that fails harder on light has light ink and wants a dark
tile (`'light'`). A mark that is mostly opaque (<=20% transparent) carries
its own background already — al-haramain's competitors the-beauty-store-uk
and allbeauty in that table — and gets `'own'`: no tile, drawn as is. The
20% threshold is not tuned against a larger sample; it is exactly where the
plan's own eight measured logos split (17% and 0% transparent on the 'own'
side, 42% and up on the 'dark'/'light' side), and a probe result near that
line is exactly the kind of case §5's "confirm by eye" instruction exists
for — this script reports the two raw percentages either way, not just the
verdict, so a human can override it.
"""
import json
import sys

from PIL import Image

MAX_SIDE = 300
DARK = (0x0A, 0x0A, 0x0B)
LIGHT = (0xFC, 0xFC, 0xFD)
OWN_TRANSPARENT_CEILING = 20.0


def srgb_to_linear(c: int) -> float:
    s = c / 255
    return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4


def luminance(rgb) -> float:
    r, g, b = rgb
    return 0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)


L_DARK = luminance(DARK)
L_LIGHT = luminance(LIGHT)


def contrast(l1: float, l2: float) -> float:
    hi, lo = (l1, l2) if l1 > l2 else (l2, l1)
    return (hi + 0.05) / (lo + 0.05)


def measure(path: str) -> dict:
    try:
        im = Image.open(path)
        im.load()
    except Exception as exc:  # noqa: BLE001 - reported to the caller, not raised
        return {"error": f"unreadable: {type(exc).__name__}: {exc}"}

    w0, h0 = im.size
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    scale = MAX_SIDE / max(w0, h0) if max(w0, h0) > 0 else 1
    if scale < 1:
        im = im.resize((max(1, int(w0 * scale)), max(1, int(h0 * scale))))
    w, h = im.size
    px = im.load()

    total = w * h
    opaque = 0
    fail_dark = 0
    fail_light = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            opaque += 1
            lum = luminance((r, g, b))
            if contrast(lum, L_DARK) < 3:
                fail_dark += 1
            if contrast(lum, L_LIGHT) < 3:
                fail_light += 1

    if opaque == 0:
        return {
            "width": w0, "height": h0,
            "transparentPct": 100.0, "failDarkPct": 0.0, "failLightPct": 0.0,
            "ink": "own", "note": "fully transparent — nothing to measure, do not ship this candidate",
        }

    transparent_pct = round((total - opaque) / total * 100, 1)
    fail_dark_pct = round(fail_dark / opaque * 100, 1)
    fail_light_pct = round(fail_light / opaque * 100, 1)

    if transparent_pct <= OWN_TRANSPARENT_CEILING:
        ink = "own"
    elif fail_dark_pct > fail_light_pct:
        ink = "dark"
    else:
        ink = "light"

    return {
        "width": w0, "height": h0,
        "transparentPct": transparent_pct,
        "failDarkPct": fail_dark_pct,
        "failLightPct": fail_light_pct,
        "ink": ink,
    }


if __name__ == "__main__":
    print(json.dumps(measure(sys.argv[1])))
