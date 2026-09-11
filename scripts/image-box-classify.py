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

── 2026-09-09: the method needs a background to threshold away, and one shop
   does not give it one ─────────────────────────────────────────────────────
The paragraph above says the method rests on "a plain near-white ground"
around the product. That is a real precondition, and it was being assumed
rather than checked. perfume-click's photos (bgstatic.net) are cropped tight
to the product with no ground left at all: the foreground silhouette IS the
whole file. Measured on 30 of its photos drawn evenly across the 10,402
distinct URLs in data/catalogue/perfume-click.json, the bounding-box aspect
this script computes came out equal to the file's own width/height on 30 of
30 (identical to three decimal places on 26, within 0.011 on the other four).
On such a crop the ratio carries no information about what is IN the frame —
it only restates the file's shape.

That mattered in one direction and not the other, which is why the fix below
is asymmetric rather than a blanket `unsure`:

  - a NARROW zero-margin crop was being called `bottle-only`, and that call is
    simply wrong: a retail carton photographed alone is every bit as tall and
    narrow as a bottle. All 12 photos in the live catalogue where such a call
    would have displaced a full-sized boxed photo were downloaded and viewed
    (Lattafa Al Nashama, John Varvatos Artisan, Mustang GT, Acqua di Parma
    Lily of the Valley, Courrèges Seconde Peau, Floris Chypress, Tabac Man,
    Montale Boise Fruite, Montale Rose & Spices, Hugo Boss, Escada
    Especially, Atelier Oud): 0 of 12 showed a bottle alone. Every one was
    either the carton by itself or the carton standing beside the bottle. Al
    Nashama is the reported case — an 81x130 shot of the box, scored 0.788
    `bottle-only` purely because 81/130 < 0.70.
  - a WIDE zero-margin crop called `boxed` was checked the same way and holds
    up: 15 of the same 30 scored `boxed`, all 15 were viewed, and all 15 do
    show the box beside the product. Something wider than it is tall cannot
    be a lone upright bottle, cropped or not, so this half of the rule
    survives the missing background.

So a zero-margin crop can still be called `boxed`, but never `bottle-only`;
it degrades to `unsure`, which pickImage already treats as "not evidence".

TWO THINGS TO BE PRECISE ABOUT, because the obvious summary of the above is
wrong in both directions.

First, `margin_free` below is stricter than the diagnostic measurement. The
"aspect equals the file's own shape" finding held on 30 of 30; the flag, which
additionally requires the OCC_THRESH-occupied column span to reach both edges,
fires on rather fewer — 8 of the 9 photos in that sample that had been called
`bottle-only`, and 10 of the 12 live displacement cases. The two it misses are
near-white products whose own edges threshold away as background. They are not
left unguarded: at 77x130 and 91x130 both are far under the long-edge floor in
src/catalogue/pickImage.ts, so they still cannot displace anything.

Second, this is NOT a perfume-click-only condition, and must not be turned
into a per-retailer rule. Sampling the 15,707 photos in .image-box-cache at up
to 40 per host found flush crops elsewhere too: glorious-beauty 3 of 40,
oud-arabian 1 of 40, Zara 1 of 8 — against 0 of 40 for each of cdn.shopify.com,
beautybase, justmylook, manchester-ouds, thgimages and the-fragrance-counter.
A flush crop defeats this method whoever served it, so the test is on the
photo. perfume-click is simply the one shop that crops this way as a matter of
course.
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

    # The file's own size, before the downscale below. Reported on every
    # verdict so pickImage can ask "is this photo big enough to be worth
    # swapping to" of the photo itself rather than of the shop that served it
    # — see MIN_SWAPPABLE_LONG_EDGE in src/catalogue/pickImage.ts. Free here:
    # the image is already open and decoded.
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
        return {"verdict": "unsure", "score": 0.0, "reason": "no-foreground", "width": w0, "height": h0}

    occupied = [c / h > OCC_THRESH for c in col_fg]
    if not any(occupied):
        return {"verdict": "unsure", "score": 0.0, "reason": "no-occupied-columns", "width": w0, "height": h0}

    first = next(x for x in range(w) if occupied[x])
    last = next(x for x in reversed(range(w)) if occupied[x])
    span_w = last - first + 1

    rows = [y for y in range(h) if row_has[y]]
    top = min(rows) if rows else 0
    bbox_h = (max(rows) - top + 1) if rows else h

    aspect = span_w / max(1, bbox_h)

    # No background was left around the product, so the silhouette this
    # measured is the crop, not the object — see the 2026-09-09 note in the
    # module docstring for the 30-photo measurement behind this.
    margin_free = span_w >= w and bbox_h >= h

    # The silhouette's own bounding box, as fractions of THIS (downscaled)
    # frame's own width/height — scale-invariant, since MAX_SIDE shrinks both
    # dimensions by the same factor, so these fractions describe the original
    # full-size file's composition exactly and survive upgradeImageResolution()
    # unchanged (same photo, more pixels; see pickImage.ts's own note on why
    # fractions rather than pixels are stored). Computed here, once, for every
    # branch below rather than only the one this classifier ends up calling
    # bottle-only: docs/IMAGE-SCALE-PLAN.md §5 persists it on boxed and unsure
    # entries too, even though only a `bottle-only` verdict is ever scaled —
    # the box costs nothing extra to report once first/last/rows are already
    # in hand, and a future reader is never left wondering why one verdict
    # carries it and another does not.
    box = {
        "sxf": round(first / w, 3),
        "syf": round(top / h, 3),
        "swf": round(span_w / w, 3),
        "shf": round(bbox_h / h, 3),
    }

    if aspect >= BOXED_ASPECT:
        score = min(1.0, 0.75 + (aspect - BOXED_ASPECT) * 0.5)
        return {
            "verdict": "boxed",
            "score": round(score, 3),
            "reason": f"aspect={aspect:.3f}",
            "width": w0,
            "height": h0,
            **box,
        }
    if aspect < BOTTLE_ASPECT and not margin_free:
        score = min(1.0, 0.75 + (BOTTLE_ASPECT - aspect) * 0.5)
        return {
            "verdict": "bottle-only",
            "score": round(score, 3),
            "reason": f"aspect={aspect:.3f}",
            "width": w0,
            "height": h0,
            **box,
        }
    reason = f"aspect={aspect:.3f}" + ("; margin-free crop" if margin_free else "")
    return {"verdict": "unsure", "score": 0.5, "reason": reason, "width": w0, "height": h0, **box}


if __name__ == "__main__":
    print(json.dumps(classify(sys.argv[1])))
