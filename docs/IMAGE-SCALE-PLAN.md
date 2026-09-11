# Plan: even the perfume bottles' size within the tile

## 1. What and why

Retailer photos frame the bottle at wildly different scales — some fill the
frame edge to edge, some sit tiny in a sea of white — so the product grid looks
ragged even though every tile is the same square. This plan makes each
bottle-only photo's bottle appear a **consistent fraction of the tile height**
by precomputing, at build time, a per-photo CSS `transform: scale()/translate()`
from the silhouette bounding box the box-classifier already measures but throws
away, and emitting it as an inline style on the existing `<img>`. Nothing is
downloaded, cropped, or altered — the transform repositions and zooms *our own
tile's view* of the hot-linked photo, exactly as `object-fit: contain` already
does, so the hard no-alteration constraint (§7) is respected.

---

## 2. The measured variance

**How this was measured.** Every displayed `image` URL in
`demo/catalogue.generated.ts` was joined back to a cached file: the displayed
URL is post-`upgradeImageResolution`, while `.image-box-cache/` and
`data/image-box-verdicts.json` are keyed on the *stored* pre-upgrade URL, so
each verdict key was pushed through the same `upgradeImageResolution` to build
an upgraded→stored map, then the displayed URL looked up in it. The silhouette
bounding box was then measured with Pillow using the **exact thresholding
`scripts/image-box-classify.py` uses** (`BG_MIN=238`, `MAX_SIDE=400` downscale,
`OCC_THRESH=0.02` per-column span for width, any-foreground-pixel rows for
height). The measurement script is reproducible; re-run it to check these
numbers.

**What is displayed** (12,611 products carry a photo):

| | count | share of displayed |
|---|---:|---:|
| resolved to a verdict | 11,773 | 93.4% |
| &nbsp;&nbsp;• bottle-only | 5,758 | 45.7% |
| &nbsp;&nbsp;• boxed | 4,616 | 36.6% |
| &nbsp;&nbsp;• unsure | 1,399 | 11.1% |
| no verdict (fragrance-click feed + houses' own-storefront, deliberately unswept) | 838 | 6.6% |
| have a cached file to measure *today* | 8,604 | 68.2% |
| &nbsp;&nbsp;• bottle-only & cached | 4,713 | — |

So scaling is only ever a candidate for the **5,758 bottle-only** photos, and
only for those among them with a persisted silhouette box.

**The raggedness, quantified** (n = 1,200 displayed bottle-only photos,
measured from cache). The number that matters is the silhouette's height as a
fraction of the **square tile** (`object-fit: contain`; for the 90.5% of files
that are square this equals silhouette÷file-height, and portrait/landscape are
corrected for the letterbox):

| percentile | silhouette height ÷ tile height |
|---|---:|
| min | 0.29 |
| p5 | 0.573 |
| p25 | 0.708 |
| **median** | **0.785** |
| p75 | 0.958 |
| p95 | 0.998 |
| max | 1.00 |

**Spread p95−p5 = 0.425; standard deviation 0.141.** The bottle in the emptiest
photo is 29% of the tile's height; in the fullest, 100%. 320 of 1,200 (27%)
already fill ≥95% of the tile; 8 sit under 45%. The width story is starker still
— silhouette width ÷ file width runs median **0.395**, p5 **0.22**, min
**0.078**: the loneliest bottle is 8% of its frame's width. **This 0.425 spread
(and 0.141 stdev) is the raggedness the owner sees, and the number the plan is
judged on shrinking.**

File shapes: 1,086/1,200 square, 108 portrait, 6 landscape — so "treat the file
as square" is right for ~90%, and the two minorities are handled explicitly by
the letterbox correction in the transform math (§3).

---

## 3. The mechanism, and that it evens the grid out

### Why a transform, and not object-position or a crop

- **`object-position` alone cannot fix this.** It can only *reposition* the
  contained image, never change the silhouette's *size* — and size is the whole
  problem. Rejected.
- **A server-side crop is not proposed.** The photos are hot-linked and must not
  be copied, cropped, or altered (§7). It is also unnecessary: the transform
  below achieves evenness without touching a single byte of the file.
- **A CSS `transform: scale()/translate()` on the `<img>`** changes the
  silhouette's size and centres it, is clipped to the tile by the
  `overflow: hidden` the `.art` box **already has** (`demo/template.html`), and
  is composited on the GPU with no layout, no reflow, and no per-frame cost —
  hundreds of static transforms on screen is the cheapest case there is. Chosen.

**The browser cannot read the bbox.** These are cross-origin images; a canvas
read taints and throws, so the silhouette box **must be precomputed at build
time** and emitted as an inline style per product. That is exactly what §5
persists.

### The math

For a square file contained in a square tile, given the silhouette's height
fraction `fH`, its centre `(cx, cy)` as fractions of the file, and a target tile
fraction `T`:

```
k  = clamp(T / fH_tile, 0.5, 2.5)          # scale factor
origin = cx*100% cy*100%                    # zoom about the bottle's own centre
translate((0.5-cx)*100%, (0.5-cy)*100%)     # then slide that centre to tile centre
```

emitted as
`transform: translate(tx%, ty%) scale(k); transform-origin: cx% cy%;`.

`fH_tile = fH` for square/portrait files; `fH*(h0/w0)` for landscape.
`cx, cy` are mapped from file-space into the element box for non-square files
(content is letterboxed inside the square `<img>` element). Because the box is
stored as **fractions**, it applies unchanged to the upgraded higher-resolution
URL that is actually displayed (same composition, more pixels — confirmed in
`pickImage.ts`'s upgrade note), which is why fractions beat pixels here.

### It works — the after-distribution

Applying `T = 0.80` with the clamp to the same 1,200 photos:

| | before | after |
|---|---:|---:|
| p5 … p95 tile fraction | 0.573 … 0.998 | 0.800 … 0.800 |
| spread p95−p5 | **0.425** | **0.000** |
| stdev | **0.141** | **0.002** |

The spread collapses to nothing — every bottle lands at 0.80 of tile height.
Only **1 of 1,200** hits the clamp (a degenerate, near-white silhouette measured
at <32% — the fallback in §4 catches these). **84% need a meaningful transform;
16% are within `|k−1|≤0.08` and `|shift|≤3%` of identity and are emitted as
nothing** (fall back to no transform), trimming page weight for free.

### The target: T = 0.80

The measured **median** tile fraction is 0.785. Rounded to **0.80**: half the
bottles grow, half shrink, so the net visual change is *evenness, not zoom* — a
number from the distribution, not from taste. (Owner may prefer 0.85 for a
slightly larger bottle; see §8.)

### Theme / the white tile

The tile is white (`background:#fff`) and the feed photos are shot on near-white
grounds. Scaling **up** expands the photo's own near-white margin to fill more
of the white tile — seamless, no dark gap. Scaling **down** reveals more white
tile around the photo — still white, seamless. So scaling never introduces a
visible edge or band, and it does **not** touch the white-tile treatment in
`demo/photo.ts` at all: that keeps styling our own container; this only sets
where the contained image sits inside it.

### The five worked examples

Numbers below are measured; the transform is what a builder would emit. Re-run
the example script to verify.

| product | file | verdict | silhouette fH (tile) | k | transform |
|---|---|---|---:|---:|---|
| **Azzure Aoud** (French Avenue, manchesterouds) | 1920×1921 | bottle-only | 0.748 | **1.070** | `translate(0%,0%) scale(1.070); transform-origin:50.0% 50.0%` |
| **KAYALI** Dapper Daddy Saffron | 1000×1000 | bottle-only | 0.718 | **1.115** | `translate(-0.2%,0.3%) scale(1.115); transform-origin:50.2% 49.8%` |
| **Sauvage** (Dior, justmylook) | 1000×1000 | bottle-only | 0.978 | **0.818** | `translate(0.1%,0%) scale(0.818); transform-origin:49.9% 50.0%` |
| **Al Nashama** (Lattafa) | 1200×1200 | **boxed** | 0.835 | — | **none — excluded (§4)** |
| **Abraaj** Brackish (French Avenue) | 2048×2048 | **boxed** | 0.610 | — | **none — excluded (§4)** |

- **Azzure Aoud** grows 7% and stays centred — the demoted-to-bottle-only case
  from `pickImage.ts`, now evened.
- **KAYALI** grows 11%; a small centre nudge.
- **Sauvage** is the instructive one: it currently **fills** the frame (0.978)
  and is scaled **down** to 0.80, which is what makes the grid even rather than
  a wall of maximal bottles.
- **Al Nashama** and **Abraaj Brackish** are both `boxed` — see §4 for why they
  get no transform, and why forcing one would be actively wrong.

---

## 4. Boxed, unsure, and the unmeasured tail — the exact fallback

**Boxed photos must be excluded, not scaled.** A boxed shot's silhouette is
bottle **+** carton, so its height is the group's height and its width is wide.
Measured on 400 displayed boxed photos: silhouette height median **0.777**,
**width median 0.860** (vs bottle-only's 0.395), aspect w/h median ~1.05.
Scaling such a silhouette to a uniform *bottle* height 0.80 shrinks or blows up
the wrong object: proven on **Abraaj Brackish** (aspect 1.22) — forcing height
0.80 gives k=1.31 and a silhouette **width of 0.977 of the tile**, jamming the
box against both edges. So boxed photos (4,616 displayed) are left exactly as
they render today. **Unsure** photos (1,399 displayed) are excluded for the same
reason the classifier already treats them as "not evidence": a silhouette on the
box/bottle boundary is not a trustworthy thing to scale.

**The fallback is a correctness condition, exactly like the image-size floor and
the logo monogram before it.** A photo renders with **no transform — byte-for-
byte today's `object-fit: contain`** — whenever *any* of:

1. no verdict, or verdict ≠ `bottle-only` (boxed / unsure / unswept);
2. no persisted silhouette box (every entry pre-dating the backfill, any evicted
   cache file, all houses and fragrance-click);
3. the displayed URL did not resolve to a stored verdict key;
4. the box is degenerate (`fH_tile < 0.2`) or `k` would fall outside
   `[0.5, 2.5]` — a measurement not to be trusted;
5. the transform is within `|k−1|≤0.08` and `|shift|≤3%` of identity (emit
   nothing; the render is already even enough).

**A missing measurement is never guessed at and never renders a broken or
wrong-scale bottle** — it renders precisely as it does now. Today, with no boxes
persisted yet, *every* photo takes this path and nothing changes until a
backfill runs — the same dormant-until-swept property `width`/`height` shipped
with.

---

## 5. Data to persist, where, and its cost

**Persist the silhouette bounding box as four fractions** — `sxf, syf, swf, shf`
(box left/top/width/height ÷ file dimensions, 3 dp) — on each
`data/image-box-verdicts.json` entry, **optional**, mirroring how `width`/
`height` were added (2026-09-09): absent on every existing entry, absent-means-
old-behaviour, backfillable from the cache with no downloads. Fractions rather
than pixels so the box survives `upgradeImageResolution` unchanged (§3).

- **`scripts/image-box-classify.py`** already computes `first`, `last`,
  `span_w`, the row set and `bbox_h` — it just discards position. Emit the four
  fractions alongside the width/height it already returns. No new pixel work.
- **`scripts/image-box-check.ts`** stores them on `VerdictEntry` exactly like
  `width`/`height` — present only when the classifier returns them.
- **Backfill** for the 15,707 cached files by mirroring the existing
  `scripts/image-size-backfill.ts` / `scripts/image-size-read.py` pair
  (add-only, skip entries already carrying a box, sorted-key writer, no
  network). This is a proven, safe pattern already in the repo.

**Size cost, measured.** Adding four fraction fields to the 15,707 measurable
entries takes `data/image-box-verdicts.json` from **5.98 MB → 6.94 MB (+0.96 MB,
+16%)**. This file is build-time only and never shipped to the browser. The
per-photo transform string (~73 chars) emitted for the ~4,713 displayed
bottle-only photos (×0.84 meaningful) adds **~0.29 MB** to `demo/index.html`
(currently ~20.0 MB) — under 1.5%, negligible against the page budget, and
compressible.

---

## 6. Implementation checklist (small, ordered steps)

Each step is independently testable and leaves the site working (the fallback in
§4 means a half-finished rollout just shows un-transformed tiles).

1. **Emit the box from the classifier.** In `scripts/image-box-classify.py`, add
   `sxf, syf, swf, shf` (3 dp) to every returned dict that already has
   `width`/`height`. *Test:* run it on three cache files by hand; confirm the
   four fields appear and match a hand-check on one known bottle-only photo.
2. **Persist it.** Extend `VerdictEntry` and `classify()` in
   `scripts/image-box-check.ts` to carry the four fields through, optional.
   *Test:* `npx tsx scripts/image-box-check.ts --shop=beautybase --limit=5`;
   confirm the five new entries carry the box, existing entries are untouched,
   the diff is sorted and clean.
3. **Backfill from cache.** Add `scripts/silhouette-backfill.ts` mirroring
   `scripts/image-size-backfill.ts` (add-only, skip already-boxed, no network).
   *Test:* `--dry-run` reports ~15,707 to fill; a real run writes ~6.9 MB and
   fetches nothing.
4. **The pure transform function.** In a small new module (e.g.
   `src/catalogue/bottleScale.ts`), `bottleScaleStyle(box, fileW, fileH, verdict,
   target=0.80)` returns the inline-style string or `null` (null for every §4
   fallback case). *Test:* `tests/bottleScale.test.ts` asserts the five worked
   examples — Azzure Aoud k≈1.07, KAYALI k≈1.115, Sauvage k≈0.818, and
   **`null` for Al Nashama and Abraaj Brackish** (boxed).
5. **Thread it through the build.** In `scripts/build-demo-catalogue.ts`, compute
   the style from the picked image's stored-URL box + verdict and add
   `imageTransform?: string` to `CatalogueEntry`. *Test:* rebuild; grep
   `demo/catalogue.generated.ts` — ~4,700 entries carry `imageTransform`, no
   boxed/unsure product does, no-photo products are untouched.
6. **Apply it.** `productArt()` in `demo/photo.ts` takes an optional transform
   and emits it as `style="…"` on the `<img>`; absent ⇒ no `style` attribute,
   output byte-identical to today. *Test:* a `demo/photo.ts` unit/snapshot test
   proving the no-transform path is unchanged and the with-transform path emits
   the expected style.
7. **Visual before/after.** Using the Playwright harness in
   `scripts/a11y-audit.ts` (`startDemoServer` + `launchChromium`), screenshot the
   five products' tiles (Azzure Aoud, KAYALI Dapper Daddy, Dior Sauvage, Al
   Nashama, Abraaj Brackish) before and after, in **both** light and dark mode.
   Confirm the three bottle-only bottles read the same height, no clipping, no
   dark edge; the two boxed ones are unchanged.
8. **Guardrails.** `npm run a11y` shows no new violation (the tile layout box is
   unchanged, so none is expected); confirm `demo/index.html` size delta matches
   §5.

---

## 7. What must NOT be done

- **No server-side crop, download, re-encode, or watermark of a hot-linked
  photo.** The site references, never copies (`docs/IMAGE-PIPELINE.md`,
  `demo/photo.ts` header, `demo/legal.ts`: "We do not copy, host, crop, recolour
  or otherwise alter any of them"). A real crop is a **licensing decision for
  the owner**, not an engineering choice — and this plan does not need one, so
  it does not propose one.
- **No client-side pixel read of a cross-origin image.** Canvas reads taint and
  throw; the box is computed at build time from the cache and emitted as data.
- **No broken or wrong-scale render for an unmeasured photo.** Every fallback in
  §4 renders exactly today's `object-fit: contain`.
- **No change to the boxed-demotion logic in `pickImage.ts` or the image-size
  floor (`MIN_SWAPPABLE_LONG_EDGE`)** that shipped this week. This sits on top of
  them and reads their outputs; it never re-ranks or re-judges.
- **No scaling of boxed or unsure photos** (§4).

---

## 8. Open questions for the owner

1. **Is presentational scaling within the "we do not crop or alter" promise?**
   Our reading: yes — a CSS `transform` zooms/positions our tile's *view* of the
   photo, the same class of operation as the `object-fit: contain` already
   shipped, and never alters or crops the file. But the Terms wording is the
   owner's to confirm.
2. **Scale full-frame bottles down?** 27% of bottle-only photos already fill the
   frame (e.g. Sauvage). Evening downward gives a truly uniform grid; leaving
   them at full size means some tiles stay "big". Recommendation: even both ways.
3. **Target height 0.80, or 0.85?** 0.80 is the measured median (equal growth
   and shrinkage); 0.85 gives a slightly larger, more present bottle at the cost
   of scaling more photos up.
