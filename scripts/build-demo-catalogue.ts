/**
 * Build the app's catalogue from real harvested listings.
 *
 * Nothing here is curated by hand any more. Products come from what the shops
 * actually listed, grouped across shops by EAN, and a fragrance exists in the
 * app only because a shop was selling it when we looked.
 *
 * Two rules this enforces, both of which were broken before:
 *
 *   1. **Live snapshots only.** Fixture data is invented, so mixing it with
 *      real prices would put fabricated figures in front of a reader beside
 *      genuine ones, which is the one thing this project must never do.
 *   2. **Fragrance only.** A sitemap walk picks up whatever a shop files near
 *      its perfume, and "Fragrance-free baby nappy cream" is not a fragrance.
 *
 * Run after a harvest: npm run catalogue:demo
 */
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogueStore } from '../src/catalogue/store.js';
import { isNewListing } from '../src/catalogue/newBadge.js';
import type { StoredListing } from '../src/catalogue/types.js';
import { RETAILERS } from '../src/config/retailers.js';
import type { Retailer } from '../src/types/retailer.js';
import { HOUSES } from '../src/config/houses.js';
import { buildBrandCanon } from '../src/catalogue/brandName.js';
import { findDuplicateGroups } from '../src/catalogue/productMatch.js';
import { auditPriceScale } from '../src/catalogue/priceScale.js';
import {
  isFragrance,
  sizeMl,
  fragranceId,
  repairMojibake,
  NOT_A_FRAGRANCE,
} from '../src/catalogue/fragranceId.js';
import { concentration, displayName, stripRedundantSize } from '../src/catalogue/productName.js';

/**
 * Retailers whose product photos may be displayed, and on what grounds.
 *
 * A retailer qualifies once `imageBasis` names a reason — a licence read in
 * the affiliate terms, the brand's own storefront, or a deliberate unlicensed
 * hot-link. Unset still means the placeholder, so adding a shop never starts
 * showing its photography by accident.
 */
const IMAGE_ALLOWED = new Set(
  RETAILERS.filter((r) => r.affiliate.imageBasis != null).map((r) => r.id),
);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'data/catalogue');
const store = new CatalogueStore(dir);
const now = new Date();

/* ── deciding what is actually a fragrance ─────────────────────────────────── */


/**
 * The same question asked of a fragrance house's own storefront.
 *
 * The concentration and size tests above exist to pick perfume out of a
 * general retailer's sitemap, where "Fragrance-free baby nappy cream" sits two
 * URLs away from Sauvage. A house that sells nothing but perfume needs no such
 * proof: Armaf lists "CLUB DE NUIT INTENSE OVERDOSE 3.6 Oz" and French Avenue
 * lists "Imperial Ocean", neither of which names a concentration, and both of
 * which are obviously scent because of where they came from. Demanding the
 * same evidence there would reject almost the entire catalogue of exactly the
 * houses we went to the trouble of sourcing.
 *
 * The exclusion list still applies, because a house does also sell body
 * lotion and deodorant. That list is imported from fragranceId.ts rather than
 * kept as a second copy here. It used to be a copy, byte-identical to the
 * original, which is exactly how a copy starts: adding "air freshener" and
 * "body mist" to the retailer catalogue left this one silently unchanged and
 * still publishing 70 of them under the houses — Al Wataniah's air fresheners
 * and 28 of its perfumed body mists, Maison Asrar's room sprays, Surrati's and
 * The Body Shop's body mists. The same question deserves the same answer
 * wherever it is asked; see the header of fragranceId.ts, which makes this
 * point about isFragrance for the identical reason.
 */
function isHouseFragrance(l: StoredListing): boolean {
  if (NOT_A_FRAGRANCE.test(l.rawTitle)) return false;
  // The shared list catches "gift set" and "set of" but not a bare trailing
  // "set", which is how a house usually writes one — "Club de Nuit Bling
  // Travel Buddy Set" came through as though it were a single bottle. Kept
  // here rather than added to NOT_A_FRAGRANCE so the retailer catalogue's
  // behaviour is untouched. `\bset\b` is safe against "Sunset": there is no
  // word boundary before the "set" inside it.
  return !/\b(set|coffret|collection)\b/i.test(l.rawTitle);
}





/* ── gather ────────────────────────────────────────────────────────────────── */

interface Offer {
  retailerId: string;
  price: number;
  wasPrice: number | null;
  promoEndsAt: string | null;
  stock: 'inStock' | 'outOfStock' | 'unknown';
  url: string;
  fetchedAt: string;
  firstSeenAt: string;
  isNew: boolean;
  /** Only ever set for a retailer in IMAGE_ALLOWED — see that constant. */
  imageUrl: string | null;
  /** The retailer's own copy, read only to extract labelled notes from. */
  description: string | null;
}

interface Product {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
  offers: Offer[];
}

/**
 * Picks the product-level photo from whichever licensed offer has one, most
 * recently fetched first. A stale licensed photo is worse than none, so
 * freshness — not a fixed retailer ranking — breaks the tie when more than
 * one licensed source ever exists.
 */
function pickImage(offers: Offer[]): string | null {
  const licensed = offers
    .filter((o) => o.imageUrl !== null)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  return licensed[0]?.imageUrl ?? null;
}

export interface Notes {
  top: string[];
  middle: string[];
  base: string[];
}

/** Groups spelling variants for the Notes key so counting them once, not once per spelling. */
const noteKey = (s: string): string => s.toLowerCase().replace(/[-\s]+/g, ' ').trim();

/**
 * Real spelling and typo variants of one note, checked against the live
 * catalogue's own Notes list before being added — a fragrance house's own
 * inconsistent spelling within a single feed ("Ylang-Ylang" and "Ylang
 * ylang" a few products apart), not a guess at what might be the same note.
 * Kept small and specific rather than an automated fuzzy match, the same
 * reason `brandName.ts`'s KNOWN_ALIASES stays a short hand-checked list:
 * a wrong merge silently hides two genuinely different notes as one entry.
 */
const NOTE_ALIASES: Record<string, string> = {
  [noteKey('Woody')]: 'Woods',
  [noteKey('Ylang ylang')]: 'Ylang-Ylang',
  [noteKey('Cyrpiol')]: 'Cypriol',
  [noteKey('Guiacwoof')]: 'Guaiac Wood',
  [noteKey('Gaiac wood')]: 'Guaiac Wood',
  [noteKey('Haiti Vetiver')]: 'Haitian Vetiver',
  [noteKey('Haiti Vetyver')]: 'Haitian Vetiver',
  [noteKey('Ooakmoss')]: 'Oakmoss',
  [noteKey('Oak Moss')]: 'Oakmoss',
  [noteKey('Muget')]: 'Lily-of-the-Valley',
  [noteKey('Muguet')]: 'Lily-of-the-Valley',
  [noteKey('Mandarino')]: 'Mandarin',
  [noteKey('Vetyver')]: 'Vetiver',
  [noteKey('Jasmin')]: 'Jasmine',
  [noteKey('Cedar Wood')]: 'Cedarwood',
};

const canonicalNoteName = (s: string): string => NOTE_ALIASES[noteKey(s)] ?? s;

/**
 * Pull the note pyramid out of a retailer's own product copy.
 *
 * This only ever reads notes a source has explicitly labelled ("Top notes:",
 * "Middle notes:" or "Heart notes:", "Base notes:"). It never infers a note
 * from a product name, a brand's house style or anything else — a fragrance
 * whose description does not spell them out simply has no notes here, and the
 * app says so rather than filling the gap.
 *
 * Worth being precise about the source: this is the *retailer's* copy, taken
 * from the affiliate feed we are licensed to use, not the perfumer's own
 * website. Those two usually agree, and where a retailer has copied the house
 * text they agree exactly, but this is not a claim to be quoting the maker
 * directly.
 */
function parseNotes(description: string | null | undefined): Notes | null {
  if (!description) return null;

  // Each section runs until the next label or the end of the copy. Feeds
  // frequently omit any separator between one section and the next label
  // ("...CardamomMiddle notes:"), so the lookahead does the splitting.
  /**
   * A note name, as opposed to a sentence that happened to follow one.
   *
   * The last section in a description runs into whatever marketing prose comes
   * after it, and some sources write the next heading without a colon so the
   * lookahead cannot split on it. Both leak sentences into the list, so the
   * shape of a real note is asserted directly: a short phrase of a few words,
   * with no sentence punctuation and no leftover heading fragment.
   */
  /**
   * Words that only ever appear because a sentence has been sliced mid clause
   * ("...where amber and musk take over", "citrus through spices"). A real note
   * is a noun phrase and never contains any of these.
   */
  // Adverbs are matched by name rather than by an "ends in ly" rule, which
  // would throw away Lily of the Valley.
  const PROSE =
    /\b(take|takes|taken|over|through|leading|with|into|from|that|which|while|before|after|creating|providing|making|giving|adding|fairly|quickly|slowly|gently|softly|deeply|subtly|really|quite|very|soon|later|eventually|immediately)\b/i;

  /**
   * Trims a real note back out of a sentence describing how it behaves —
   * "Amber  emerge", "Musk provide depth", "Vetiver come forth" all name a
   * genuine note in their first word or two and then run straight into the
   * clause that says what it does. Two rules catch this before the shape
   * check below ever sees it:
   *
   *   1. A real note phrase never contains two consecutive spaces — only
   *      prose does, wherever the source's own markup ("<br>" and similar)
   *      collapsed to whitespace. Cutting at the first such run recovers
   *      "Amaryllis" from "Amaryllis  🍮" the same way it recovers "Amber"
   *      from "Amber  emerge", with no need to name every stray glyph.
   *   2. A fixed list of description verbs ("emerge", "provide depth", "come
   *      forth" and the rest) that a note name itself never contains, cutting
   *      at the first one found even across a single space ("Vetiver come
   *      forth", "Patchouli for depth").
   *
   * Checked against the live catalogue before being written: every note name
   * that actually exists survives both cuts unchanged.
   */
  const TRAILING_CLAUSE =
    /\s+(emerge|emerges|develop|develops|settle|settles|unfold|unfolds|linger|lingers|intertwine|intertwines|provide|provides|contribute|contributes|add|adds|offer|offers|come\s+forth|comes\s+forth|greet|greets|resonate|resonates|lend|lends|uplift|steam|delivery|for\s+her|for\s+him|for\s+depth|these\b).*$/i;

  const cleanCandidate = (s: string): string =>
    s
      .split(/\s{2,}/)[0]!
      .replace(TRAILING_CLAUSE, '')
      .replace(/[|*•·™®—–-]+$/, '')
      .trim();

  const looksLikeNote = (s: string): boolean =>
    s.length > 1 &&
    s.length <= 24 &&
    s.split(/\s+/).length <= 3 &&
    !/[.:;!?()]/.test(s) &&
    !/\bnotes?\b/i.test(s) &&
    // Feed copy capitalises note names. A lowercase start means the split
    // landed inside a sentence rather than on a list item.
    /^[A-Z]/.test(s) &&
    !PROSE.test(s) &&
    // A real note never opens on a bare article or pronoun — nothing genuinely
    // named "A Bright", "As It Develops" or "At Its Core" exists, those are a
    // sentence's own opening words ("A bright, sparkling, vibrant citrus...",
    // "As it develops...", "At its core...") caught by the comma split before
    // the sentence itself was recognised as prose. "the" is checked only at
    // the very start, not anywhere in the phrase — "Lily of the Valley" keeps
    // its own "the" mid-phrase, which this must never touch.
    !/^(a|as|at|it|its|the)\b/i.test(s);

  const section = (label: string): string[] => {
    const re = new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=(?:top|middle|heart|base)\\s+notes?\\s*:|$)`, 'i');
    const m = description.match(re);
    if (!m?.[1]) return [];
    // Notes are a comma separated list, never sentences, so the first full stop
    // that ends a sentence also ends the list.
    const listOnly = m[1].split(/\.\s|\.$/)[0] ?? '';
    return listOnly
      .split(/[,;/]|\band\b/i)
      .map((s) => cleanCandidate(s.trim()))
      .filter(looksLikeNote)
      .map(canonicalNoteName)
      .slice(0, 14);
  };

  const top = section('top\\s+notes?');
  const middle = section('(?:middle|heart)\\s+notes?');
  const base = section('base\\s+notes?');

  if (top.length === 0 && middle.length === 0 && base.length === 0) return null;
  return { top, middle, base };
}

/** Notes from whichever offer published them most recently. */
function pickNotes(offers: Offer[]): Notes | null {
  const withCopy = offers
    .filter((o) => o.description)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  for (const o of withCopy) {
    const parsed = parseNotes(o.description);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * True when a listing's own vendor field cannot be trusted as its brand.
 *
 * A multi-brand retailer's Shopify `vendor` field is supposed to name the
 * fragrance house, and for the overwhelming majority of listings it does.
 * Occasionally a shop tags its own vendor field with its own shop name
 * instead — checked against the live catalogue, this happens for 10 of
 * Emirates Oud's 2468 listings and for all 173 of Oud Arabian's (both
 * already documented in src/config/retailers.ts as multi-brand listings,
 * not a house's own storefront). "Emirates Oud" and "Oud Arabian" are shops,
 * not fragrance houses, so keeping either as a brand states something false.
 *
 * `retailer.singleBrandOnly` is the reason this is never applied to a
 * house's own UK storefront: there, the vendor field naming the retailer's
 * own name is not a mistake, it is the one legitimately correct answer.
 */
function isSelfVendored(rawBrand: string | null | undefined, retailer: Retailer): boolean {
  if (!rawBrand || retailer.singleBrandOnly) return false;
  return rawBrand.trim().toLowerCase() === retailer.name.trim().toLowerCase();
}

/**
 * Brand names this build has confirmed independently of any one retailer's
 * vendor field — every `rawBrand` actually published by a genuine fragrance
 * listing (isFragrance), except a self-vendored multi-brand retailer's own
 * name tagging itself (see isSelfVendored) — that cannot also be evidence
 * for its own mistake. Kept only once a name is confirmed by at least two
 * such listings, because a single stray bad vendor tag elsewhere in the
 * catalogue is real (checked: mybeauty-boutique has exactly one DKNY
 * listing tagged rawBrand "Women") and one match is not enough to call it a
 * genuine house rather than someone else's dirty data leaking in.
 */
const knownFragranceBrands: ReadonlySet<string> = (() => {
  const counts = new Map<string, number>();
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const snap = store.read(file.replace(/\.json$/, ''));
      if (snap.source !== 'live') continue;
      const retailer = RETAILERS.find((r) => r.id === snap.retailerId);
      if (!retailer) continue;
      for (const l of snap.listings) {
        if (l.status !== 'active' || !l.rawBrand || !isFragrance(l)) continue;
        if (isSelfVendored(l.rawBrand, retailer)) continue;
        const key = l.rawBrand.trim().toLowerCase();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  const confirmed = new Set<string>();
  for (const [key, count] of counts) if (count >= 2) confirmed.add(key);
  return confirmed;
})();

/**
 * Recover a real brand from a title's own text when the vendor field is
 * unusable (see isSelfVendored).
 *
 * The shop still usually writes the true house name inside the title even
 * when its vendor field names itself instead — "Costa de Amalfi Perfume
 * 100ml EDP Riiffs" is a genuine Riiffs fragrance despite Emirates Oud's own
 * vendor tag reading "Emirates Oud". This looks for it at either end of the
 * title: the longest leading run of words, then the longest trailing run,
 * that exactly matches (case-insensitively) a brand independently confirmed
 * elsewhere (knownFragranceBrands above). Leading is tried first because
 * that is the far more common shape across the retailers checked (Oud
 * Arabian's own titles overwhelmingly open with the house name).
 *
 * Deliberately not a fuzzy or partial match, and never a guess at a word
 * that merely looks brand-shaped — mid-title text is never considered, so
 * "Yara Perfume 100ml EDP Lattafa Set Of 4" cannot produce "Lattafa" (it
 * sits in the middle, not at either end) or "4" (not a real, confirmed
 * brand). A title with no confirmed brand at either end returns null, which
 * canonBrand/'Unbranded' downstream turns into an honest gap rather than an
 * invented fact.
 */
function recoverBrandFromTitle(rawTitle: string, retailerName: string): string | null {
  const words = rawTitle.trim().split(/\s+/).filter(Boolean);
  const shopName = retailerName.trim().toLowerCase();

  let leading: string | null = null;
  let leadingLen = 0;
  for (let end = words.length; end > 0; end--) {
    const candidate = words.slice(0, end).join(' ');
    const key = candidate.toLowerCase();
    if (key !== shopName && knownFragranceBrands.has(key) && end > leadingLen) {
      leading = candidate;
      leadingLen = end;
    }
  }
  if (leading) return leading;

  let trailing: string | null = null;
  let trailingLen = 0;
  for (let start = 0; start < words.length; start++) {
    const candidate = words.slice(start).join(' ');
    const key = candidate.toLowerCase();
    const len = words.length - start;
    if (key !== shopName && knownFragranceBrands.has(key) && len > trailingLen) {
      trailing = candidate;
      trailingLen = len;
    }
  }
  return trailing;
}

/**
 * The brand to actually use for a listing: its own vendor field, unless that
 * field is self-vendored (see isSelfVendored), in which case the real brand
 * is recovered from the title text or, failing that, left null so
 * canonBrand turns it into the honest 'Unbranded' rather than the shop's own
 * name masquerading as a fragrance house.
 */
function resolveRawBrand(l: StoredListing, retailer: Retailer): string | null {
  if (!isSelfVendored(l.rawBrand, retailer)) return l.rawBrand ?? null;
  return recoverBrandFromTitle(l.rawTitle, retailer.name);
}

/**
 * One display spelling per brand, decided before anything is built.
 *
 * Retailer feeds disagree about casing for the same house, and every variant
 * used to become its own row in the Brands list: "ARMAF" and "Armaf" were two
 * brands, "Dolce & Gabbana" was three. Ten such groups across 166 strings.
 * See src/catalogue/brandName.ts for how the winner is chosen and why it is
 * not simply the most common one.
 *
 * Built from each listing's *effective* brand (resolveRawBrand), not the raw
 * vendor field directly — a title-recovered brand like "MAISON ASRAR" needs
 * to fall into the same casing group as every "Maison Asrar" read straight
 * off a vendor field, or the two would sit as separate rows in the Brands
 * list purely because of which path found the name, the exact bug this
 * function exists to prevent for ordinary vendor-field casing differences.
 */
const brandCanon = (() => {
  const seen: string[] = [];
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const snap = store.read(file.replace(/\.json$/, ''));
      if (snap.source !== 'live') continue;
      // A snapshot file can outlive its registry entry (a retired retailer's
      // last-crawled data, still sitting on disk). resolveRawBrand needs a
      // retailer to ask "is this self-vendored?", so without one the raw
      // vendor field is used as-is — exactly what this loop did before the
      // self-vendoring check existed, so a file with no registry match keeps
      // contributing to the brand list precisely as it always has.
      const retailer = RETAILERS.find((r) => r.id === snap.retailerId);
      for (const l of snap.listings) {
        if (l.status !== 'active') continue;
        const effective = retailer ? resolveRawBrand(l, retailer) : l.rawBrand;
        if (effective) seen.push(effective);
      }
    }
  }
  const housesDir = resolve(root, 'data/houses');
  if (existsSync(housesDir)) {
    const s = new CatalogueStore(housesDir);
    for (const file of readdirSync(housesDir).filter((f) => f.endsWith('.json'))) {
      const snap = s.read(file.replace(/\.json$/, ''));
      if (snap.source !== 'live') continue;
      for (const l of snap.listings) {
        if (l.status === 'active' && l.rawBrand) seen.push(l.rawBrand);
      }
    }
  }
  return buildBrandCanon(seen);
})();

/** The chosen spelling for a brand, or the raw one if it was never grouped. */
function canonBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return brandCanon.get(raw.trim()) ?? raw.trim();
}

const products = new Map<string, Product>();
let liveShops = 0;
let considered = 0;
const skippedShops: string[] = [];
let rejected = 0;
/** Active listings carrying no usable price. Never published; see the guard below. */
let unpriced = 0;

if (existsSync(dir)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const snapshot = store.read(file.replace(/\.json$/, ''));

    // Invented data never reaches the app, whatever else happens. This used
    // to be a silent `continue`: correct for what it kept out, but it meant a
    // retailer stuck on fixtures forever looked identical to a healthy build
    // in every log this script ever printed. Eight retailers sat that way for
    // a week before anyone noticed (see docs/INGESTION-AUDIT.md) because
    // nothing here ever said so.
    if (snapshot.source !== 'live') {
      skippedShops.push(`${snapshot.retailerId} (fixtures only, never live-harvested)`);
      continue;
    }

    // A snapshot can exist for a retailer that is not in the registry or is
    // switched off. Those are skipped.
    //
    // A retailer with no established standard delivery cost is no longer one
    // of them. It used to be, because resolveDelivery threw rather than guess
    // a figure it was never given. It now returns a null delivery cost, which
    // travels all the way to the screen as "delivery not stated" and is ranked
    // below every offer with a real delivered price — so importing such a shop
    // can no longer sort it to the top of the comparison, which was the whole
    // reason for excluding it here.
    const retailer = RETAILERS.find((r) => r.id === snapshot.retailerId);
    if (!retailer || !retailer.enabled) {
      skippedShops.push(`${snapshot.retailerId} (${retailer ? 'disabled' : 'not in the registry'})`);
      continue;
    }

    const active = snapshot.listings.filter((l) => l.status === 'active');
    if (active.length > 0) liveShops++;

    for (const stored of active) {
      // Repaired once, here, so the same text drives the fragrance decision,
      // the brand match and the label a reader sees. MyBeauty.Boutique's feed
      // arrives as UTF-8 decoded as Latin-1 — "Rosé" as "RosÃ©" — and 114 of
      // those were already rendering that way on the live site. Doing this
      // only at display time would leave the classifier reading different
      // text from the one shown, which is how "ParfumÃ©e" came to pass the
      // concentration test for the wrong reason. See repairMojibake.
      const l = {
        ...stored,
        rawTitle: repairMojibake(stored.rawTitle),
        rawBrand: stored.rawBrand === null ? null : repairMojibake(stored.rawBrand),
      };
      considered++;

      // An offer with no price is not an offer. This was an unguarded `l.priceGbp!`
      // three lines down, and the only thing keeping a bad number off the site was
      // luck: two Oud Arabian listings currently carry priceGbp 0, and a £0 offer
      // wins the cheapest-price sort everywhere it appears. It is also what makes
      // "we could not corroborate this price" expressible at all — see
      // src/catalogue/feedPriceRepair.ts, which clears rather than guesses.
      if (typeof l.priceGbp !== 'number' || !(l.priceGbp > 0)) {
        unpriced++;
        continue;
      }

      if (!isFragrance(l)) {
        rejected++;
        continue;
      }

      const size = sizeMl(l.rawTitle)!;
      const id = fragranceId(l);
      const effectiveRawBrand = resolveRawBrand(l, retailer);

      const existing = products.get(id);
      const offer: Offer = {
        retailerId: l.retailerId,
        price: l.priceGbp!,
        wasPrice: l.wasPriceGbp,
        promoEndsAt: l.promoEndsAt,
        stock: l.inStock === true ? 'inStock' : l.inStock === false ? 'outOfStock' : 'unknown',
        url: l.url,
        fetchedAt: l.lastSeenAt,
        firstSeenAt: l.firstSeenAt,
        isNew: isNewListing(l, now),
        imageUrl: IMAGE_ALLOWED.has(l.retailerId) ? l.imageUrl : null,
        description: l.description ?? null,
      };

      if (existing) {
        existing.offers.push(offer);
      } else {
        // The displayed brand is handed to displayName as well as the raw
        // vendor field: it is the string that will sit beside the name on
        // screen, so it is the one whose duplication a reader actually sees.
        const displayedBrand = canonBrand(effectiveRawBrand);
        products.set(id, {
          id,
          brand: displayedBrand ?? 'Unbranded',
          name: displayName(l.rawTitle, effectiveRawBrand, displayedBrand),
          concentration: concentration(l.rawTitle),
          sizeMl: size,
          ean: l.ean,
          offers: [offer],
        });
      }
    }
  }
}

/* ── one bottle, one product ───────────────────────────────────────────────
   Keying on EAN alone left the same bottle listed twice whenever only one
   shop published a barcode — Afnan Supremacy In Extrait De Parfum, 100ml,
   appeared at £38.99 and £50.00 as two products. Folding them together is
   what turns two listings into an actual comparison. See
   src/catalogue/productMatch.ts for when two listings count as the same
   bottle and where it refuses to decide. */
const duplicateGroups = findDuplicateGroups([...products.values()]);
for (const { canonical, absorbed } of duplicateGroups) {
  for (const dupe of absorbed) {
    canonical.offers.push(...dupe.offers);
    // The barcode is worth keeping if the canonical record lacked one.
    canonical.ean ??= dupe.ean;
    products.delete(dupe.id);
  }
}
const mergedProducts = duplicateGroups.reduce((n, g) => n + g.absorbed.length, 0);

/* ── a shop whose whole price list is on the wrong scale ────────────────────
   Escentual published 2,542 offers here at about 1.44× what it charges, and
   every check upstream passed: the figures were copied faithfully from the
   shop's own /products.json, so re-reading that source could only ever confirm
   the copy. The ingest guard in src/catalogue/shopCurrency.ts stops those
   figures being written as pounds; this stops them being *published* whatever
   route they arrived by. See src/catalogue/priceScale.ts for the measurement
   and for why it is run on reference prices rather than selling prices. */
const scaleAudit = auditPriceScale([...products.values()]);
const withheldForScale = new Map<string, number>();
if (scaleAudit.offScale.length > 0) {
  const suspect = new Set(scaleAudit.offScale.map((f) => f.retailerId));
  for (const product of products.values()) {
    const kept = product.offers.filter((o) => !suspect.has(o.retailerId));
    if (kept.length === product.offers.length) continue;
    for (const o of product.offers) {
      if (suspect.has(o.retailerId)) {
        withheldForScale.set(o.retailerId, (withheldForScale.get(o.retailerId) ?? 0) + 1);
      }
    }
    product.offers = kept;
  }
  // A product left with no offers is no longer something anyone can buy here.
  for (const [id, product] of products) if (product.offers.length === 0) products.delete(id);
}

/* ── houses we source direct, which we cannot price in sterling yet ────────── */

/**
 * Fragrance houses read straight from their own storefronts.
 *
 * These are kept completely apart from the products above and never enter the
 * comparison. Every one of them is priced in the house's own currency — Armaf
 * in USD, French Avenue in AED — and the app's entire offer pipeline, from
 * bestOffer down to the delivered-price sort, is built on the assumption that
 * a price is sterling. Letting a dirham figure into it would produce a wrong
 * "cheapest" answer, which is the one failure this project exists to avoid.
 *
 * So they are surfaced as what they honestly are: products we know exist, with
 * the house's own photograph and its own published price in its own currency,
 * and no claim about what they would cost a UK buyer.
 */
interface HouseProduct {
  id: string;
  house: string;
  brand: string;
  name: string;
  sizeMl: number | null;
  url: string;
  image: string | null;
  nativePrice: { amount: number; currency: string } | null;
  inStock: boolean | null;
}

const houseProducts: HouseProduct[] = [];
const housesDir = resolve(root, 'data/houses');

if (existsSync(housesDir)) {
  const houseStore = new CatalogueStore(housesDir);
  for (const file of readdirSync(housesDir).filter((f) => f.endsWith('.json'))) {
    const id = file.replace(/\.json$/, '');
    const snapshot = houseStore.read(id);
    if (snapshot.source !== 'live') continue;

    const houseName = HOUSES.find((h) => h.id === id)?.name ?? id;

    for (const l of snapshot.listings) {
      if (l.status !== 'active') continue;
      if (!isHouseFragrance(l)) continue;

      // A house's own title is used as-is, unlike a retailer listing's (see
      // displayName above) — so the size sizeMl already carries as its own
      // field is otherwise still sitting in the name too, doubling up on the
      // card as both "Ashore 100ml" and a 100ml badge. stripRedundantSize
      // only removes it where the two plainly agree; see its own comment for
      // the cases it deliberately leaves alone.
      const size = sizeMl(l.rawTitle);
      houseProducts.push({
        id: `${id}-${l.retailerSku}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
        house: houseName,
        brand: canonBrand(l.rawBrand) ?? houseName,
        name: stripRedundantSize(l.rawTitle, size),
        sizeMl: size,
        url: l.url,
        // A house's own photography of its own bottle, hot-linked exactly like
        // every other image here — nothing is downloaded or rehosted.
        image: l.imageUrl,
        nativePrice: l.nativePrice ?? null,
        inStock: l.inStock,
      });
    }
  }
}

// Same rule as the retailer catalogue above: smallest bottle first within one
// perfume. A house listing may have no size at all, and those sort last rather
// than being treated as zero millilitres and leading the group.
houseProducts.sort(
  (a, b) =>
    a.house.localeCompare(b.house) ||
    a.name.localeCompare(b.name) ||
    (a.sizeMl ?? Infinity) - (b.sizeMl ?? Infinity) ||
    a.id.localeCompare(b.id),
);

// Most shops first, so the comparison leads with products that have one.
// Name and then size break the remaining ties, both ascending: without them
// the three sizes of one bottle came out in whatever order the Map happened to
// hold them, which is neither reproducible between builds nor sensible to
// read. Smallest bottle first — see compareVariants in demo/data.ts, which
// applies the same rule at display time.
const ordered = [...products.values()].sort(
  (a, b) =>
    b.offers.length - a.offers.length ||
    a.brand.localeCompare(b.brand) ||
    a.name.localeCompare(b.name) ||
    a.sizeMl - b.sizeMl,
);

// `description` is read for its notes above and then deliberately dropped: it
// is several hundred words per product across hundreds of products, and
// shipping all of it into a single page bundle would cost far more than the
// handful of note names actually displayed.
const crawled: Record<string, Omit<Offer, 'description'>[]> = {};
for (const p of ordered) {
  crawled[p.id] = p.offers.map(({ description: _drop, ...rest }) => rest);
}

const crawledAt =
  ordered.flatMap((p) => p.offers.map((o) => o.fetchedAt)).sort().at(-1) ??
  new Date(0).toISOString();

const catalogue = ordered.map((p) => ({
  id: p.id,
  brand: p.brand,
  name: p.name,
  concentration: p.concentration,
  sizeMl: p.sizeMl,
  ean: p.ean,
  shops: p.offers.length,
  image: pickImage(p.offers),
  notes: pickNotes(p.offers),
}));

/**
 * TypeScript's checker can choke ("Expression produces a union type that is
 * too complex to represent", TS2590) when a single array literal this large
 * is checked against an interface in one pass — the catalogue crossed that
 * threshold at around 3,950 products, right after the Aventus-style naming
 * fix stopped over-merging distinct product lines and pushed the count back
 * up. Splitting the literal into fixed-size chunks, each independently typed
 * and then spread into the exported array, keeps every individual check well
 * under the threshold no matter how large the catalogue grows from here.
 */
function chunkedArrayLiteral(varName: string, typeName: string, items: unknown[], chunkSize = 500): string {
  if (items.length === 0) return `export const ${varName}: ${typeName}[] = [];`;
  const chunkDecls: string[] = [];
  const chunkNames: string[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunkName = `${varName}_CHUNK_${chunkNames.length}`;
    chunkNames.push(chunkName);
    chunkDecls.push(`const ${chunkName}: ${typeName}[] = ${JSON.stringify(items.slice(i, i + chunkSize), null, 2)};`);
  }
  return `${chunkDecls.join('\n\n')}\n\nexport const ${varName}: ${typeName}[] = [${chunkNames.map((n) => `...${n}`).join(', ')}];`;
}

const body = `// Generated by scripts/build-demo-catalogue.ts. Do not edit by hand.
//
// Every product and every price below was harvested from a live UK shop through
// its own sitemap. Nothing here is curated, invented or typed by hand: a
// fragrance appears because a shop was selling it when we looked.
//
// Regenerate: npm run harvest && npm run catalogue:demo

import type { RawOffer, StockState } from '../src/types/offer.js';

export interface CrawledOffer {
  retailerId: string;
  price: number;
  wasPrice: number | null;
  promoEndsAt: string | null;
  stock: StockState;
  url: string;
  fetchedAt: string;
  firstSeenAt: string;
  isNew: boolean;
  imageUrl: string | null;
}

export interface Notes {
  top: string[];
  middle: string[];
  base: string[];
}

export interface CatalogueEntry {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
  shops: number;
  /** A real, licensed product photo — see demo/photo.ts. Null means none yet. */
  image: string | null;
  /**
   * Notes as a source explicitly labelled them, never inferred. Null where the
   * retailer's copy did not spell them out, which the app states plainly
   * rather than papering over.
   */
  notes: Notes | null;
}

/** Products, most widely stocked first. */
${chunkedArrayLiteral('CATALOGUE', 'CatalogueEntry', catalogue)}

export const CRAWLED: Record<string, CrawledOffer[]> = ${JSON.stringify(crawled, null, 2)};

/**
 * Houses read direct from their own storefronts.
 *
 * Deliberately not part of CATALOGUE and never priced against it: these carry
 * the house's own currency, and the comparison assumes sterling throughout.
 */
export interface HouseProduct {
  id: string;
  house: string;
  brand: string;
  name: string;
  sizeMl: number | null;
  url: string;
  image: string | null;
  /** The house's published price in its own currency. Never converted. */
  nativePrice: { amount: number; currency: string } | null;
  inStock: boolean | null;
}

${chunkedArrayLiteral('HOUSE_PRODUCTS', 'HouseProduct', houseProducts)}

/** When the harvest that produced this data ran. */
export const CRAWLED_AT = ${JSON.stringify(crawledAt)};

/** How many shops the data came from. */
export const SHOP_COUNT = ${liveShops};

export function offersFor(productId: string): RawOffer[] {
  return (CRAWLED[productId] ?? []).map((o) => ({
    retailerId: o.retailerId,
    variantId: productId,
    price: o.price,
    wasPrice: o.wasPrice,
    currency: 'GBP' as const,
    stock: o.stock,
    url: o.url,
    promoEndsAt: o.promoEndsAt,
    fetchedAt: o.fetchedAt,
  }));
}

/** Whether a shop added this product inside the badge window. */
export function isNewAt(productId: string, retailerId: string): boolean {
  return CRAWLED[productId]?.some((o) => o.retailerId === retailerId && o.isNew) ?? false;
}
`;

writeFileSync(resolve(root, 'demo/catalogue.generated.ts'), body);

const multi = ordered.filter((p) => p.offers.length > 1).length;
console.log(
  `demo/catalogue.generated.ts written from LIVE data only:\n` +
    `  ${liveShops} shops, ${considered} listings considered, ${rejected} were not fragrance, ${unpriced} carried no price\n` +
    `  ${ordered.length} products, ${multi} of them stocked by more than one shop\n` +
    `  ${mergedProducts} duplicate listings folded into an existing product\n` +
    `  ${houseProducts.length} house products, catalogue-only (no sterling price yet)` +
    (skippedShops.length
      ? `\n  skipped: ${skippedShops.join(', ')}`
      : ''),
);

for (const f of scaleAudit.offScale) {
  console.log(
    `::warning::${f.retailerId}: reference prices sit at ${f.factor.toFixed(3)}× the rest of the ` +
      `market's across ${f.sample} shared products, interquartile spread ${(f.spread * 100).toFixed(1)}% ` +
      `— a scale, not a disagreement. ${withheldForScale.get(f.retailerId) ?? 0} offers withheld ` +
      'rather than published at a price we cannot stand behind.',
  );
}
