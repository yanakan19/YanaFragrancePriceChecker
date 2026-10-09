# PR 5 review: Notino UK back on, the Save for PriceSniffs bookmark, importer fixes

Checked 2026-10-08, read only. Nothing was merged, closed, commented on or
pushed to the PR. The live branch was `264fb583`, PR head `dff4ab94`
(`claude/wonderful-brahmagupta-8edg4h`, draft, no checks, no comments, GitHub
says `mergeable_state: dirty`).

## Recommendation

**Merge after named fixes.** Do not merge the branch as it stands. The code
is sound and stays inside the hard lines, but the branch is stale against the
live branch, has seven conflicts, switches Notino on in a way that its own
comment describes wrongly, and carries one data fault. The fixes are small
(section 6). Everything in the PR is worth having except the generated files,
which must be rebuilt rather than merged.

## 1. What the PR does

Eight commits (three of them merges of the live branch) on top of live commit
`11ef7822`; 19 files, 5 of them rebuilt generated files.

1. Importer fixes in `src/catalogue/notinoSavedPage.ts`, found on three real
   Notino pages the owner saved on 2026-10-07:
   - a size listed twice (discount code price, then shelf price) is read once,
     at the shelf price (Armani 100 ml: 76.90, not 65.36);
   - a size of several takes its own barcode from its own photo address
     (`cdn.notinoimg.com/.../<EAN>_01-o/`), never the product's `gtin13`;
   - the strength from the page's `category` goes in the title, so the
     fragrance gate stops dropping every Notino bottle.
2. A "Save for PriceSniffs" bookmark: `docs/save-page-bookmarklet.js`,
   `scripts/catalogue-bookmarklet.ts`, `npm run catalogue:bookmarklet`,
   `tests/saveBookmarklet.test.ts`, and a rewrite of OWNER-STEPS section 9.
3. `notino-uk` switched to `enabled: true` with `imageBasis:
   'hotlink-unlicensed'` (D24), registry tests updated, one changelog line
   under a new 7 Oct entry.
4. `data/catalogue/notino-uk.json` with 9 new listings from the saved pages,
   plus rebuilt `demo/*.generated.ts`, `data/price-history-checkpoint.json`,
   and three new slugs and one alias (appended).

## 2. File by file against the live branch

| File | Against live |
|---|---|
| `src/catalogue/notinoSavedPage.ts` | Modifies the live importer (does not duplicate it). Merges clean. The three fixes are additive and tested. No contradiction. |
| `tests/notinoSavedPage.test.ts` | Extends live's test file. Clean. |
| `src/catalogue/notinoImport.ts`, `scripts/import-notino-pages.ts`, `fixtures/notino-saved/`, `src/types/retailer.ts` (`owner-import`) | Not touched. The PR dropped its own duplicate importer and keeps live's. No overlap. |
| `package.json` | Adds `catalogue:bookmarklet` next to the existing `notino:import`. Clean. |
| `docs/save-page-bookmarklet.js`, `scripts/catalogue-bookmarklet.ts`, `tests/saveBookmarklet.test.ts` | New. Nothing like them on live. |
| `docs/OWNER-STEPS.md` | Edits section 9 (the live section 9 is the same Notino section the overnight agent wrote). Merges clean but see section 4: it now says Notino is on, while steps 1 and 2 still tell the owner to use a private window and not log in, and the new step 3 says the bookmark is safe "even when you are logged in". Live also has a line (about 639) saying PR 5 is left open for the owner. |
| `src/config/retailers.ts` | Conflict in the header count only (live 80 shops, 55 enabled; PR says 74 and 43). The notino-uk hunks merge clean, but they replace live's "Switched off by the owner on 2026-10-04" with `enabled: true`. Live's own comment at the same entry says `adapter: 'owner-import'` exists "so that switching the shop back on never starts a crawl" and its 2026-10-08 diagnosis ends "Recommendation: stays off". The PR's new comment says "the crawl still reads it as PriceSniffsBot and stops at the refusal (D23)". That is wrong: the harvest and the probe skip `owner-import` altogether (`scripts/catalogue-harvest.ts:434`, `scripts/catalogue-probe.ts:105`). |
| `tests/registry.test.ts`, `tests/switchedOffShops.ts` | Remove notino-uk from the switched-off lists and add an "is on" test. Merge clean and pass. |
| `demo/changelog.ts` | Conflict. The PR adds a `v3.103.0`, `7 Oct 2026` entry, but live already has that version and date (the footer entry) and a `v3.104.0` for 8 Oct. Would break the one entry per day rule. |
| `demo/catalogue.generated.ts`, `deals.generated.ts`, `dormant.generated.ts`, `priceHistory.generated.ts`, `data/price-history-checkpoint.json` | Conflicts. Generated; CLAUDE.md says take either side and rebuild. |
| `data/id-aliases.json`, `data/product-slugs.json` | Append only additions (1 alias, 3 slugs). Merge clean, no existing entry changed. |
| `data/catalogue/notino-uk.json` | Merges clean, but see the data fault in section 5. |

Not touched by the PR: `docs/NOTINO-PLAN.md` (still says `enabled: false`),
`docs/SHOP-PROBES-2026-10-08.md`, `docs/DECISIONS.md`.

## 3. Trial merge

`git merge --no-commit --no-ff` of the PR head into a scratch branch off
`264fb583`, in a separate worktree. Aborted and discarded afterwards; the
scratch branches and the worktree are gone.

Conflicts: **yes, 7 files**: `src/config/retailers.ts` (header count only),
`demo/changelog.ts`, and five generated files (`demo/catalogue.generated.ts`,
`demo/deals.generated.ts`, `demo/dormant.generated.ts`,
`demo/priceHistory.generated.ts`, `data/price-history-checkpoint.json`).

Tests on the trial merge, with the conflicts resolved the CLAUDE.md way
(generated files and changelog taken from live, header count set to 56
enabled, `npm run demo` and `npm run catalogue:demo` run): the 42 test files
that mention the registry, `notino-uk` or the switched-off list, run with
`--pool=forks --poolOptions.forks.singleFork` in batches, gave 42 of 42
files and 2,489 of 2,489 tests passing. That includes `registry`,
`notinoSavedPage`, `saveBookmarklet`, `imageBasisDecision`, `workflowRules`,
`botIdentity` and `sitemapShops`. Two things showed up on the way:

- With the header left unresolved the registry test fails (`56 of them`
  expected). A real follow-up fix, not a flaw in the PR's logic.
- `sitemapShops` fails until `npm run demo` has run (the usual rule), and
  reports "1 enabled but carrying no listing, left out" until the catalogue
  is rebuilt with the PR's `notino-uk.json`.

After the rebuild, 9 Notino listings reach the site (the Armani and Montale
sizes and two Armaf, all read 2026-10-07).

The full suite was not run. The PR's own list of 8 failures was not
re-checked.

## 4. Hard lines

| Line | Verdict |
|---|---|
| PriceSniffsBot identity only | Not crossed. The PR adds no request code. The bookmark fetches nothing and runs in the owner's own browser. |
| Obey robots.txt | Not crossed. Notino's robots.txt allows the section, sitemap and product pages; the block is Cloudflare. No new crawl path. |
| No evasion of bot protection | Not crossed. Nothing spoofs, proxies or solves a challenge. The bookmark refuses a "Just a moment" page (it saves nothing and says so). The owner reading a page in their own browser is ordinary browsing, the "route 3, bridge only" in `docs/NOTINO-PLAN.md`. Notino's terms may limit copying; a one click bookmark makes more than "small and occasional" easy, so that warning must stay in the doc (it does). |
| No secrets or login data stored | Mostly held, with two gaps. The bookmark keeps only the page's JSON-LD blocks, the canonical address and the time, and the test proves the rest of the page (email, token) is left behind. But it copies **every** `application/ld+json` block verbatim, not just product ones, so anything a signed in page puts in a JSON-LD block (a Person or Organization block, say) would be saved. The importer discards non product data and the inbox is gitignored (`/data/notino-inbox/`), so nothing reaches git, but the claim "never your account details, even when you are logged in" is wider than what was tested. The committed `notino-uk.json` rows are product facts only (checked: no email, token, cookie or account fields). |
| Turning Notino back on while it still gets Cloudflare 403s | Does not start a crawl: the daily harvest and the probe skip `owner-import`. But `enabled: true` brings Notino into three other sweeps that take every enabled shop: `npm run price:verify` (weekly, Sunday 04:40 UTC; reads robots.txt, `/meta.json`, the home page and product pages), `npm run delivery:recheck` (monthly; fetches the delivery page, and Notino has stored listings) and the manual-only `npm run catalogue` crawl step. All use PriceSniffsBot and respect robots.txt and stop at a refusal, so this is not evasion, but each will hit the Cloudflare challenge and report a blocked shop. That is a handful of repeat requests a shop has already refused (D23: "a refusal is never worked around"). Cheap to avoid, see fix 3. |

D23 (Apify off) is untouched. D24 (photo basis) is followed: the added
`imageBasis` has the required comment and `tests/imageBasisDecision.test.ts`
passes.

Sensible or not: enabling is the owner's call and the PR cites an owner
request on 2026-10-07; the overnight diagnosis of 2026-10-08 (which did not
know of it) says "stays off". The practical gain is small: 9 products, and
each leaves the site 7 days after the day it was read (the 2026-10-07 rows go
on 14 Oct) unless the owner re-saves. The lasting routes are still the CJ
feed and asking Notino (`docs/outreach/notino-uk.md`, not sent).

## 5. A data fault in the PR's `notino-uk.json`

The PR's copy of `data/catalogue/notino-uk.json` has 104 listings. In 28 of
them (the older listings from the August and September crawl, such as the
Dior Solar sunscreen) the `lastSeenAt` field is gone; live's copy has it on
all 95. `isTooOldToShow` treats a date it cannot read as "not too old"
(`src/services/offerAge.ts`), so any such listing that passes the other gates
would show for ever at a price from September. In my rebuild none of the 28
reached the page (only the 9 fresh ones did), but this is luck of the other
filters, not a guard. Do not take that file as it is.

## 6. Fixes before merging

1. Do not merge the generated files. Merge, take live's side of the five
   generated files, and run `npm run rebuild`. Commit with the change only the
   generated files that changed because of `notino-uk.json` and the registry
   (`demo/*.generated.ts`, `data/price-history-checkpoint.json`, the appended
   slugs and alias), per CLAUDE.md.
2. `demo/changelog.ts`: drop the new `7 Oct` entry. Add "Notino UK prices are
   back" to today's entry (8 Oct, `v3.104.0`) under `New`. It is a visible
   change, 25 characters, no dash.
3. `src/config/retailers.ts`: set the header to 56 enabled; replace the new
   comment so it matches the code (the harvest and probe skip `owner-import`;
   its only source is saved pages). Add `owner-import` to the skip in
   `scripts/price-verify.ts`, `scripts/deliveryRecheck.ts` (`recheckTargets`)
   and `scripts/catalogue-run.ts`, so enabling the shop adds no Cloudflare
   requests. Add the test for it.
4. `data/catalogue/notino-uk.json`: take live's file and add only the 9 rows
   from the saved pages (or restore `lastSeenAt` on the 28). Consider making
   `isTooOldToShow` treat an unreadable date as too old; that is a wider
   change, so a separate PR.
5. Bookmark: keep only JSON-LD blocks whose `@type` is Product, ProductGroup,
   ItemList or CollectionPage (the importer reads nothing else), and add that
   case to `tests/saveBookmarklet.test.ts`. In OWNER-STEPS section 9 keep the
   private window advice (steps 1 and 2) beside the bookmark, and soften
   "even when you are logged in" to what the test shows.
6. Docs: update `docs/NOTINO-PLAN.md` ("Where things stand" still says
   `enabled: false`) and the "stays off" lines in the registry's Notino
   diagnosis comment, and record the owner's switch-on in `docs/DECISIONS.md`
   next to D23/D24. Update the OWNER-STEPS line that says PR 5 is open.
7. Confirm with the owner that Notino on, with 9 products that vanish on 14
   Oct unless re-saved, is still what they want; if not, take the PR without
   the `enabled: true` line and keep everything else.

If the fixes are too much to do on the PR branch, the alternative is to close
it and re-apply the importer fixes, the bookmark and the flag as a fresh
commit on the live branch. The code merges clean, so the PR branch is the
cheaper path.

## Fixed and merged 9 Oct 2026

The owner decided to fix and merge PR 5 (D31). The branch
`claude/wonderful-brahmagupta-8edg4h` (head `dff4ab94`) was merged into the
live line and the fixes below were made on top. The branch content is on the
live branch; the PR itself on GitHub is left for the owner to close.

1. **Merge.** Seven conflicts, as predicted. Generated files and the
   changelog: live's side taken, then rebuilt. Header count set to 63 enabled of
   87 (live had 62; Notino adds one). OWNER-STEPS section 9: live's section 10 kept,
   PR's steps 6 and 7 kept in place of live's "still switched off" line.
2. **Cloudflare requests (fix 3).** `enabled: true` kept, adapter kept as
   `owner-import`. New `crawlsShop()` in `src/config/retailers.ts`; the weekly
   `price:verify` sweep, the monthly `recheckTargets` and the `catalogue-run`
   crawl now skip an `owner-import` shop. (An explicit `price:verify --shop` still
   works, as it is the owner's own act.) The registry comment now says what the
   code does (the PR's "stops at the refusal" line was wrong). Tests in
   `tests/registry.test.ts` and `tests/deliveryRecheck.test.ts`.
3. **Bookmark (fix 5).** `docs/save-page-bookmarklet.js` now keeps only JSON-LD
   blocks whose `@type` is Product, ProductGroup, ItemList or CollectionPage
   (also inside `@graph` or a type list); unreadable blocks are dropped; a page with
   none saves nothing. Tests added (Person, Organization, bad JSON, graph, and the
   account only page). OWNER-STEPS section 9 keeps the private window advice
   and the "even when you are logged in" claim is gone.
4. **The 28 `lastSeenAt` values (fix 4).** Not lost. The store writes the date
   most listings share once as `seenAt` and restores it on read
   (`src/catalogue/store.ts`); the 28 older rows all carry 2026-09-09 and read back
   correctly. `data/catalogue/notino-uk.json` is live's 95 rows plus exactly the
   9 saved page rows, so it was kept as is. `tests/notinoSnapshot.test.ts` pins that
   every listing reads back with a date and that the old rows are hidden. Left for
   a separate change: making `isTooOldToShow` treat an unreadable date as too old.
5. **The 9 products (fix 7).** The owner has chosen Notino on. They were read on
   7 October and leave the site on 14 October unless the pages are saved again;
   OWNER-STEPS section 9 and `docs/NOTINO-PLAN.md` now say so.
6. **Docs and changelog (fixes 2 and 6).** The PR's duplicate 7 Oct changelog entry
   was dropped; one line, "Notino UK back with a few saved prices", is in today's
   entry (9 Oct, `v3.105.0`). D31 added to `docs/DECISIONS.md`; NOTINO-PLAN "Where
   things stand" and the registry's "stays off" comment updated; the OWNER-STEPS
   branch table no longer says to keep the branch.
