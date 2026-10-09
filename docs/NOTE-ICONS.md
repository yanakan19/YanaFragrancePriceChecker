# Note icons

One small drawn picture for each family of scent notes. Built on 9 Oct 2026 as
the first step of `docs/NOTES-PAGE-PLAN.md` (section C). The Notes tab, the
note pages and the product pages use them (below); nothing of them is in the
home page's first load, and no JavaScript bundle includes them.

- `demo/note-icons/<slug>.svg`: 240 note icons.
- `demo/note-icons/groups/<id>.svg`: the 16 group icons of the plan (section B,
  still PROPOSED, so the names may change).
- `data/note-icons-manifest.json`: the list. Hand maintained. For each icon its
  file, display name, group and the note spellings it also serves (aliases).
  Also the merge decisions and a `coveredTop` figure.
- `tests/noteIcons.test.ts`: keeps all of the above honest.

The folder is published as it stands (the deploy uploads `demo/`), at
`/note-icons/<slug>.svg`, about 270 KB in all. Since 9 Oct 2026 the Notes tab
and the note pages use the icons: the build copies each to
`demo/note-icons/h/<slug>.<hash>.svg` (gitignored, scripts/noteData.ts), and the
page and the service worker's icon cache use those copies. Since the same day
each product page shows them too, small (18 to 20 px) on the left of every note
pill of its Top, Middle and Base rows, through the same hashed copies and a
small lookup file of its own (`data/noteIcons.<hash>.json`, built by
`buildNoteIconLookup` in scripts/noteData.ts; docs/NOTES-PAGE-PLAN.md section
F). A redrawn icon gets a new hashed name and reaches both pages with the next
build; a new icon or alias needs nothing else.

**Origin.** Own work. Drawn as original SVG source for PriceSniffs, starting
from the 12 sample icons the owner approved (Pineapple, Blackcurrant, Apple,
Bergamot, Juniper Berries, Birch, Patchouli, Jasmine, Musk, Oakmoss, Ambergris,
Vanilla). No photograph, trace, stock pack or other site's artwork was used,
and no agent opened Fragrantica or its images (D26).

## Style rules

- `viewBox="0 0 100 100"`, transparent background, drawn to read at 56 to 160
  px on a dark tile (`#1B1B1F`) and on a light tile.
- Flat colour shapes, two or three tones and a highlight. Rounded, simple,
  colourful. A thin outline only where a shape would vanish on a tile.
- **Light things** (jasmine, sugar, salt, milk) get a soft grey edge
  (`#BDB4A0` or `#CFC8B6`, 2 wide). **Dark things** (peppercorns, ebony, oud)
  get a lighter brown rim. No pure black. Pure white only as a see through
  highlight (it needs an `opacity`). The test checks both.
- No gradients, filters, masks, clip paths, patterns, text, fonts, images,
  scripts, links, `style` or `href`. Nothing may reference anything else.
- Each file under 2.5 KB, standalone: `xmlns`, one `viewBox`, and a
  `<title>` holding the display name exactly (the group icons carry the group
  name). No ids, so several can sit in one page without clashing.
- Recognisable and distinct. Where a note has no shape (musk, amber,
  aldehydes, incense, oud, leather), use its family treatment so they read as a
  family:
  - musks: soft layered orb (`musk`, `white-musk`, `ambrette`)
  - ambers: faceted stone or crystal (`amber`, `ambroxan`, `ambergris`)
  - resins: smooth drops and lumps (`resin`, `frankincense`, `myrrh`, `elemi`)
  - incense, smoke, palo santo: rising curl
  - leather and suede: the same hide shape, stitched or speckled
  - aroma molecules: rings and balls on a violet or teal ground (`molecule`,
    `hedione`, `coumarin`, `calone`, `iso-e-super`)
  - woods: log ends with rings, planks, or a leaf with the wood

## Add an icon

1. Pick the slug: the note's name in lower case, words joined by hyphens
   (`pink-pepper`). Draw `demo/note-icons/<slug>.svg` to the style rules. Copy
   a neighbour of the same family and change it.
2. Add an entry to the **end** of `icons` in the manifest:
   `{ "file": "<slug>.svg", "name": "Pink Pepper", "group": "spices", "aliases": [...] }`.
   `group` is one of the 16 ids in `groups`. `name` must equal the `<title>`.
3. Add as aliases the note spellings the icon should also serve (below).
4. Look at it on a dark tile and a light tile at 56 and 160 px.
5. `npx vitest run tests/noteIcons.test.ts --pool=forks --poolOptions.forks.singleFork`.
   Stage the files by name. The page needs no change: the build publishes the
   icon and both lookups pick it up.

**Redrawn 9 Oct 2026:** the 26 icons and the White Flowers group icon that read faintly at 20 px (list in `docs/NOTES-PAGE-PLAN.md` section F) now have heavier shapes and a darker edge (`#8A7F68` for white things, a lighter rim for dark ones, strokes 3 wide).

Shipped entries are append only: do not delete an entry, rename it, change its
group or drop an alias. You may redraw a file. You may add aliases. The test
compares with `HEAD`.

## Alias rules

- An alias is a note spelling that the icon also serves. It is a **picture
  choice, not a merge**: it does not make two notes one, and it changes no
  count, name or address. (Merging notes is the reviewed alias file
  `data/note-aliases.json`, built 9 Oct 2026; docs/NOTES-PAGE-PLAN.md section B.)
- **The two lists must agree** (`tests/noteAliases.test.ts` fails otherwise):
  a spelling the note aliases fold into a canonical note must be drawn with
  the canonical's icon, and if a folded spelling has an icon the canonical
  must have one too. When you add a note alias whose variant already has an
  icon, add the canonical as an alias of that icon (adding is allowed). Moving
  an existing alias between icons needs a line in `APPROVED_ALIAS_MOVES` in
  `tests/noteIcons.test.ts`.
- Matching uses the same key as the Notes tab (`noteMergeKey`: letters and
  digits only, case and accents folded). So "Oak Moss" and "Oakmoss", or
  "Ylang-Ylang" and "Ylang Ylang", are one spelling; list one.
- One spelling belongs to **one** icon. The test fails on a clash.
- Share an icon for: a misspelling or other name of the same material
  (Cardamon, Oudh, Litchi); an origin or grade (Calabrian Bergamot, Bulgarian
  Rose); a suffix (Absolute, Essence, Oil, Accord, Resinoid, Butter,
  Concrete); a plural.
- Give a note its own icon when it looks different (orris is a root, not the
  iris flower; neroli is a bud, not the orange blossom; a blood orange is red
  inside).
- Only list spellings that exist in the catalogue today, or are certain to.
  A name nobody uses is clutter.
- Prose that the parser read as a note ("setting the stage", "Parfum") gets no
  icon.

## Coverage

`coveredTop` is how far down the notes list, by number of products, every note
has an icon or an alias, counted from the catalogue when the manifest was
written. `status` is `complete` once `coveredTop` is at least 200. The test
works out the top 200 from the catalogue every run (a tie at the edge counts
in), so it does not depend on a number written here.

Not covered: the long tail, which a later phase draws from a group motif
(NOTES-PAGE-PLAN section C, point 2).
