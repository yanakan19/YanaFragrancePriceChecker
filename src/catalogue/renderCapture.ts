/**
 * Saving a shop's rendered section pages to disk, verbatim, for a human to
 * read afterwards.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Notino UK renders a real 694,649-byte /fragrance/?page=1 page and
 * parseListings() gets zero listings out of it — a parser gap, not the bot
 * wall its own subsections show (those come back 403 at a few hundred bytes,
 * the shape src/catalogue/renderRefusal.ts already knows). Nobody can fix
 * that parser blind: the rendered HTML this pipeline sees is never kept
 * anywhere past the run that produced it, and the sandbox this project is
 * developed in cannot fetch a shop itself — the egress proxy refuses every
 * retailer domain outright. The only way to hand a real Notino page to
 * whoever fixes the parser next is for CI to save one, on purpose, once.
 *
 * ── What this deliberately is not ───────────────────────────────────────────
 * Not a new fetch route. scripts/catalogue-harvest.ts already renders every
 * configured section page for a shop that reaches the render tier (see that
 * file's own header for why three retrieval tiers exist); this only decides
 * what to do with a render that already happened, for one named shop, when
 * asked. Never wired to fire on a schedule, and never for more than one shop
 * at once — catalogue-daily.yml's `capture_render_shop` input and
 * catalogue-harvest.ts's own `--shop=`/`--capture-render-shop=` agreement
 * check are the two guards that keep it that way outside this module; this
 * module's own contract is the third, quieter one: it only ever writes under
 * `<baseDir>/<shopId>/`, never touching another shop's saved pages.
 *
 * ── The size bound ───────────────────────────────────────────────────────────
 * CAPTURE_MAX_BYTES truncates an oversized page rather than skip it, because
 * a truncated real page is still real bytes a parser can be checked against,
 * and a skipped one teaches nothing. Set above every rendered page size this
 * project has on record — John Lewis's ~1.06MB is the largest measured (see
 * that shop's own registry comment) — so an ordinary section page is never
 * actually cut, while a handful of sections for one shop still stays a
 * reasonable one-off commit rather than a repo-bloating one.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** One rendered page, already fetched — this module never fetches anything. */
export interface CapturePage {
  /** The registry's own catalogue-section id; becomes the saved file's name. */
  sectionId: string;
  /** The URL actually rendered, recorded in the saved file's own header. */
  url: string;
  /** The renderer's own painted HTML, exactly as returned — nothing stripped. */
  body: string;
}

export interface CapturedFile {
  path: string;
  bytes: number;
  truncated: boolean;
}

/** See this file's header for where this number comes from. */
export const CAPTURE_MAX_BYTES = 2_000_000;

/**
 * Writes one file per page to `<baseDir>/<shopId>/<sectionId>.html`, capped
 * at CAPTURE_MAX_BYTES and prefixed with an HTML comment naming the URL and
 * the capture time so the file is self-describing once it is out of this
 * run's own log. Returns what it wrote, purely for the caller to log —
 * nothing here decides whether a capture should happen, only what one looks
 * like on disk once a caller has already decided it should.
 */
export function capturePages(
  baseDir: string,
  shopId: string,
  pages: readonly CapturePage[],
  capturedAt: string,
): CapturedFile[] {
  const shopDir = join(baseDir, shopId);
  mkdirSync(shopDir, { recursive: true });
  return pages.map((page) => {
    const truncated = page.body.length > CAPTURE_MAX_BYTES;
    const body = truncated ? page.body.slice(0, CAPTURE_MAX_BYTES) : page.body;
    const header =
      `<!-- captured ${capturedAt} from ${page.url}` +
      `${truncated ? ` — truncated at ${CAPTURE_MAX_BYTES} of ${page.body.length} bytes` : ''} -->\n`;
    const path = join(shopDir, `${page.sectionId}.html`);
    writeFileSync(path, header + body, 'utf8');
    return { path, bytes: header.length + body.length, truncated };
  });
}
