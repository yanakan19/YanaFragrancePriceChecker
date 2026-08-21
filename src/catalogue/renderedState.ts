import type { RawListing } from './types.js';
import { parseJohnLewisListings } from './johnLewisNextData.js';

/**
 * The one place a rendered page is allowed a second reading.
 *
 * ── What this is, and what it deliberately is not ─────────────────────────
 * `parseListings` in jsonld.ts stays the parser. It is tried first, on every
 * route, for every shop, and where it finds schema.org Product nodes nothing
 * here runs at all — which, measured, covers every shop in this project's
 * registry except one. Superdrug is the case worth stating: it looked like it
 * would need exactly this, and does not. State probe run 32503824167, job
 * 96839386128, 2026-08-21T16:37Z, one rendered category page:
 *
 *     JSON-LD blocks: 1; parseListings(): 60 listing(s)
 *     @graph[].itemListElement[].item.offers.price      ×60  e.g. 26.8
 *     @graph[].itemListElement[].item.offers.priceCurrency ×60  e.g. GBP
 *
 * Its 742 kB `spartacus-app-state` block, the thing this module was expected
 * to be built for, turned out to hold CMS layout, navigation and translation
 * strings — the only product-shaped collection in it is
 * `cx-state.translations.chunks.entities.product`, which is UI copy. Superdrug
 * needs no entry here and must not get one.
 *
 * So this table exists for shops where the rendered page carries a real,
 * complete product grid in a format that is not schema.org and never will be,
 * and where the only alternatives were per-product metered rendering (which
 * docs/INGESTION.md's cost reasoning forbids) or leaving a proven-retrievable
 * shop dark. That is one shop today. Each entry costs a module, a fixture and
 * a set of tests, and the bar for adding one is a measurement showing the
 * JSON-LD route returning nothing against a page that demonstrably has the
 * data — not a suspicion that a bespoke reader might do better.
 *
 * ── Why keyed by retailer id ──────────────────────────────────────────────
 * A `__NEXT_DATA__` block is a Next.js convention, not a schema: the payload
 * inside it is whatever that one application put there, so a "Next.js parser"
 * that ran on any page carrying that script tag would be guessing at every
 * shop but the one it was written against. Naming the shop keeps each reader
 * honest about its own scope, and keeps a page that merely looks familiar
 * from being read by a parser that has never seen it.
 */
export interface RenderedStateParseOptions {
  sectionId: string;
  pageUrl: string;
}

type RenderedStateParser = (html: string, options: RenderedStateParseOptions) => RawListing[];

const PARSERS: Record<string, RenderedStateParser> = {
  'john-lewis': parseJohnLewisListings,
};

/** Whether this shop has a second reading available at all. */
export function hasRenderedStateParser(retailerId: string): boolean {
  return retailerId in PARSERS;
}

/**
 * Read a rendered page's own state blob, for the shops that have a reader.
 *
 * Returns an empty array for every other shop, so a caller can try this
 * unconditionally after `parseListings` has come back with nothing and get
 * "no second route exists here" and "the second route found nothing" as the
 * same, correct answer: no listings.
 */
export function parseRenderedState(
  retailerId: string,
  html: string,
  options: RenderedStateParseOptions,
): RawListing[] {
  const parser = PARSERS[retailerId];
  return parser ? parser(html, options) : [];
}
