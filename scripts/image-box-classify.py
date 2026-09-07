#!/usr/bin/env python3
"""
Classifies one downloaded product photo as bottle-only, boxed, or unsure —
called once per image by scripts/image-box-check.ts.

WHY THIS SHAPE. The machine this was built and validated on has Pillow
(stdlib-adjacent, already installed) but neither numpy nor scipy, and
nothing in package.json does image decoding (no sharp, no jimp). Rather than
add a dependency for a low-stakes, one-off visual check, this is plain
Pillow pixel access — slow compared to a vectorised approach, but the
images are downscaled first (see MAX_SIDE) specifically so that cost stays
small per image, and this runs at a "small run" cadence, not per page view.

THE METHOD, actually validated rather than assumed. Every one of these shops'
photos sits on a plain near-white ground (measured across every image this
was tuned and checked against, 2026-09-06). Thresholding that background
away leaves a foreground silhouette: a bottle alone is materially taller
than it is wide once its bounding box is measured this way, while a bottle
photographed beside its retail box is not, because the box adds width
without adding height. That single ratio — bounding-box width over height —
was measured against 46 hand-labelled photos (see docs/IMAGE-PIPELINE.md and
the commit that added this file for the exact numbers) and is what this
script actually classifies on. Two thresholds, not one, because the classes
overlap in the middle: below BOTTLE_ASPECT is confidently bottle-only, at or
above BOXED_ASPECT is confidently boxed, and the band between is `unsure` —
deliberately not forced either way, because pickImage only ever demotes a
confirmed `boxed` call, so an ambiguous photo is safest left alone.

KNOWN FAILURE MODE, recorded rather than hidden: a bottle with a bright
specular highlight running clean through its middle can split into two
foreground blobs with a background-coloured gap between them, which briefly
looks box-shaped. This is why the classifier does not also use a "two
separate blobs" rule as its primary signal — that rule was tried, tuned
against the same 46 photos, and dropped: it did not improve on plain aspect
ratio and it was that failure mode's whole cause. It is exactly one false
positive (of 46) in the validated sample; see the confusion matrix in
docs/IMAGE-PIPELINE.md.
"""
import json
import sys

from PIL import Image

MAX_SIDE = 400
BG_MIN = 238
OCC_THRESH = 0.02
BOXED_ASPECT = 0.87
BOTTLE_ASPECT = 0.70


def classify(path: str) -> dict:
    try:
        im = Image.open(path)
    except Exception as exc:  # noqa: BLE001 - reported to the caller, not raised
        return {"verdict": "unsure", "score": 0.0, "reason": f"unreadable: {exc}"}

    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    elif im.mode != "RGB":
        im = im.convert("RGB")

    w0, h0 = im.size
    scale = MAX_SIDE / max(w0, h0)
    if scale < 1:
        im = im.resize((max(1, int(w0 * scale)), max(1, int(h0 * scale))))
    w, h = im.size
    px = im.load()

    def is_bg(r: int, g: int, b: int) -> bool:
        return r >= BG_MIN and g >= BG_MIN and b >= BG_MIN

    col_fg = [0] * w
    row_has = [False] * h
    for x in range(w):
        c = 0
        for y in range(h):
            r, g, b = px[x, y]
            if not is_bg(r, g, b):
                c += 1
                row_has[y] = True
        col_fg[x] = c

    total_fg = sum(col_fg)
    if total_fg == 0:
        return {"verdict": "unsure", "score": 0.0, "reason": "no-foreground"}

    occupied = [c / h > OCC_THRESH for c in col_fg]
    if not any(occupied):
        return {"verdict": "unsure", "score": 0.0, "reason": "no-occupied-columns"}

    first = next(x for x in range(w) if occupied[x])
    last = next(x for x in reversed(range(w)) if occupied[x])
    span_w = last - first + 1

    rows = [y for y in range(h) if row_has[y]]
    bbox_h = (max(rows) - min(rows) + 1) if rows else h

    aspect = span_w / max(1, bbox_h)

    if aspect >= BOXED_ASPECT:
        score = min(1.0, 0.75 + (aspect - BOXED_ASPECT) * 0.5)
        return {"verdict": "boxed", "score": round(score, 3), "reason": f"aspect={aspect:.3f}"}
    if aspect < BOTTLE_ASPECT:
        score = min(1.0, 0.75 + (BOTTLE_ASPECT - aspect) * 0.5)
        return {"verdict": "bottle-only", "score": round(score, 3), "reason": f"aspect={aspect:.3f}"}
    return {"verdict": "unsure", "score": 0.5, "reason": f"aspect={aspect:.3f}"}


if __name__ == "__main__":
    print(json.dumps(classify(sys.argv[1])))
