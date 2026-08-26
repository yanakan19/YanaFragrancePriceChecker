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
import { RETAILERS, cannotCarryBrand } from '../src/config/retailers.js';
import type { Retailer } from '../src/types/retailer.js';
import { HOUSES } from '../src/config/houses.js';
import { buildBrandCanon, armafLineName } from '../src/catalogue/brandName.js';
import {
  findDuplicateGroups,
  untrustworthyEans as computeUntrustworthyEans,
  trustworthyEan,
} from '../src/catalogue/productMatch.js';
import { auditPriceScale } from '../src/catalogue/priceScale.js';
import { auditWasPrices } from '../src/catalogue/wasPriceCredibility.js';
import {
  isFragrance,
  sizeMl,
  fragranceId,
  repairMojibake,
  NOT_A_FRAGRANCE,
} from '../src/catalogue/fragranceId.js';
import { concentration, displayName, stripRedundantSize, reattachArmafLine } from '../src/catalogue/productName.js';
import { parseNotes } from '../src/catalogue/notesParse.js';

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
  /**
   * The retailer's own aggregateRating, read only to pick a product-level
   * rating from — see pickRating. Carried at the offer level for the same
   * reason description is: it is per-listing data, and which offer it came
   * from matters for attribution.
   */
  rating: { value: number; count: number | null } | null;
  /**
   * Millilitres read from *this shop's own title*, not the product record's
   * size. Carried only so the reference-price check can refuse to compare an
   * 80ml against a 100ml — see src/catalogue/wasPriceCredibility.ts and the
   * shared-EAN case in its header. Dropped before anything is written, exactly
   * like `description` is, so it costs nothing in the shipped bundle.
   */
  sizeMl: number | null;
  /**
   * True when this offer is the product's own fragrance house selling it —
   * armaf.uk on an Armaf bottle. Test zero in wasPriceCredibility.ts is the
   * only reader; dropped before anything is written, like `sizeMl`.
   *
   * Filled in by a pass of its own further down rather than set here, because
   * the question is about *the product's* brand and this offer may not be the
   * one that named it: an offer joining an existing product, or a whole
   * product absorbed by findDuplicateGroups below, would otherwise be judged
   * against a brand string that is about to be replaced. False until then, so
   * the failure mode of getting the pass wrong is a missing anchor rather than
   * a wrong one.
   */
  brandDirect: boolean;
}

interface Product {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
  offers: Offer[];
  /**
   * The Armaf sub-line this product's own originating raw brand string named
   * before the 2026-08-21 fold ('Armaf - Landi' -> 'Landi'), or null for
   * every product the fold does not touch — see armafLineName in
   * brandName.ts. Carried on the record itself, the same way `ean` is,
   * because the merge step below (findDuplicateGroups) can absorb this
   * product into a different shop's canonical record or vice versa, and this
   * fact has to survive that merge to reach the final reattachArmafLine pass
   * regardless of which side of the merge it started on.
   */
  armafLine: string | null;
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
  /**
   * Which offer these notes were actually read from, so the app can name and
   * link the retailer instead of a generic "the retailer listing it". Null
   * only if `parseNotes` somehow succeeded with no attributable offer, which
   * `pickNotes` never does today (see its own doc) but is kept nullable so
   * an app render that forgets to check it fails safe onto the old wording
   * rather than a broken link.
   */
  source: { retailerId: string; url: string } | null;
}

/**
 * Notes from whichever offer published them most recently, tagged with which
 * offer that was. The provenance is what lets the app say "As published by
 * [Retailer]" instead of a generic line, and link back to the exact page the
 * notes were read from — see notesBlock in demo/app.ts.
 */
function pickNotes(offers: Offer[]): Notes | null {
  const withCopy = offers
    .filter((o) => o.description)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  for (const o of withCopy) {
    const parsed = parseNotes(o.description);
    if (parsed) return { ...parsed, source: { retailerId: o.retailerId, url: o.url } };
  }
  return null;
}

/**
 * Shop names reduced to a comparable core, so a retailer tagging itself is
 * recognised however it spells its own name.
 *
 * Exact string equality was the original test and it missed the worst case in
 * the catalogue. FragranceHub's registry name is "FragranceHub", and it vendors
 * its own listings three different ways — "Fragrance Hub LTD" (39 listings),
 * "Fragrancehub.co.uk" (28) and Shopify's untouched default "My Store" (31).
 * None matched, so 98 products carried a shop as their fragrance house, and the
 * real houses in those titles — Ajmal, Lattafa, Armaf, Fragrance World — lost
 * them. Measured against demo/catalogue.generated.ts on 2026-08-25; all three
 * strings occur at fragrancehub and at no other shop, which is what makes them
 * a vendor-field defect rather than a small house this build has not heard of.
 *
 * Punctuation, spacing and a trailing company suffix all go, because they are
 * exactly what differs between a shop's legal name, its trading name and its
 * domain. Nothing here touches the *middle* of a name, so two genuinely
 * different houses cannot be collapsed into one by this.
 */
function shopNameCore(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.(co\.uk|com|net|org|shop|store|uk)$/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/(ltd|limited|llc|inc|plc|gmbh)$/i, '');
}

/**
 * Shopify's out-of-the-box shop name, which a merchant is meant to replace.
 *
 * Not tied to any one retailer: it is never a fragrance house at any shop, and
 * a listing carrying it has told us nothing about its brand. Kept as its own
 * short list rather than folded into the retailer-name test because it is a
 * different fact — "this is a placeholder" rather than "this is the shop".
 */
const PLACEHOLDER_VENDOR_NAMES: ReadonlySet<string> = new Set(['mystore', 'myshop', 'defaulttitle']);

/**
 * True when a listing's own vendor field cannot be trusted as its brand.
 *
 * A multi-brand retailer's Shopify `vendor` field is supposed to name the
 * fragrance house, and for the overwhelming majority of listings it does.
 * Occasionally a shop tags its own vendor field with its own shop name
 * instead — checked against the live catalogue, this happens for 10 of
 * Emirates Oud's 2468 listings, for all 173 of Oud Arabian's, and for 98 of
 * FragranceHub's (all three already documented in src/config/retailers.ts as
 * multi-brand listings, not a house's own storefront). "Emirates Oud", "Oud
 * Arabian" and "FragranceHub" are shops, not fragrance houses, so keeping any
 * of them as a brand states something false.
 *
 * The comparison is against the shop's registry name *and* its domain, both
 * reduced by shopNameCore, because a shop that vendors itself does not
 * reliably use the same spelling the registry does — see that helper for the
 * measurement behind it.
 *
 * `retailer.singleBrandOnly` is the reason this is never applied to a
 * house's own UK storefront: there, the vendor field naming the retailer's
 * own name is not a mistake, it is the one legitimately correct answer.
 */
function isSelfVendored(rawBrand: string | null | undefined, retailer: Retailer): boolean {
  if (!rawBrand || retailer.singleBrandOnly) return false;
  const core = shopNameCore(rawBrand);
  if (!core) return false;
  if (PLACEHOLDER_VENDOR_NAMES.has(core)) return true;
  return core === shopNameCore(retailer.name) || core === shopNameCore(retailer.domain);
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

/** One retailer's eligible listings, repaired, kept together for resolveRawBrand below. */
interface EligibleSnapshot {
  retailer: Retailer;
  listings: StoredListing[];
}
const eligible: EligibleSnapshot[] = [];

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

    // Repaired once, here, so the same text drives the fragrance decision,
    // the brand match and the label a reader sees. MyBeauty.Boutique's feed
    // arrives as UTF-8 decoded as Latin-1 — "Rosé" as "RosÃ©" — and 114 of
    // those were already rendering that way on the live site. Doing this
    // only at display time would leave the classifier reading different
    // text from the one shown, which is how "ParfumÃ©e" came to pass the
    // concentration test for the wrong reason. See repairMojibake.
    eligible.push({
      retailer,
      listings: active.map((stored) => ({
        ...stored,
        rawTitle: repairMojibake(stored.rawTitle),
        rawBrand: stored.rawBrand === null ? null : repairMojibake(stored.rawBrand),
      })),
    });
  }
}

/* ── an EAN one retailer's own feed has stuck on two different products ─────
   Computed once, over every eligible listing from every shop, before any of
   them are turned into a product — see productMatch.ts's untrustworthyEans
   for the full reasoning and the measured Nicchia case (19 EANs once padding
   is normalised, one shared by three products) this exists to catch. It has
   to run here rather than inside the loop below: fragranceId() decides a
   listing's identity from its very first line, and by the time a second
   listing with the same EAN reaches "if (existing)" it has already silently
   become an offer on the first one's product — too late for any check placed
   after that point to undo. */
const untrustworthyEans = computeUntrustworthyEans(eligible.flatMap(({ listings }) => listings));

for (const { retailer, listings } of eligible) {
  for (const l of listings) {
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
    const id = fragranceId(l, untrustworthyEans);
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
      rating: l.rating ?? null,
      sizeMl: size,
      brandDirect: false,
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
        // Not the raw `l.ean`: a code this shop's own feed has also put on a
        // different product (see untrustworthyEans above) must not survive
        // into the one place findDuplicateGroups (productMatch.ts) still
        // reads an ean from, or it would sit in a match bucket later and
        // either wrongly identify a bottle or wrongly veto a real merge —
        // the same failure this file exists to prevent, one step downstream.
        ean: trustworthyEan(l, untrustworthyEans),
        offers: [offer],
        // See armafLineName's own comment: null for every product outside
        // the reviewed 51 "Armaf - <line>" strings, in which case this is
        // exactly the same 'Unbranded'-style no-op it always was before this
        // field existed.
        armafLine: armafLineName(effectiveRawBrand),
      });
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
    // Same reasoning as ean just above: if the absorbed record was the one
    // sourced from an "Armaf - <line>" raw brand, that fact must not vanish
    // just because a different shop's record won the merge — see
    // reattachArmafLine's own comment for why this has to run after every
    // merge is already settled, on the surviving record's final name.
    canonical.armafLine ??= dupe.armafLine;
    products.delete(dupe.id);
  }
}
const mergedProducts = duplicateGroups.reduce((n, g) => n + g.absorbed.length, 0);

/* ── put back the Armaf sub-line name the fold above throws away ────────────
   src/catalogue/brandName.ts's Armaf alias block folds 51 "Armaf - <line>"
   brand strings into plain "Armaf" and flags, without fixing, that roughly a
   quarter of the 178 products that applies to never mention their own
   sub-line anywhere in their own `name` field — the line word existed only
   in the brand string just folded away. Run once here, after every same-
   bottle merge above has already happened (never inside displayName, and
   never before the merge): two shops selling the identical Armaf bottle are
   folded together by matching brand, size, concentration and the exact set
   of words in the name (productMatch.ts's matchKey), and prepending a
   sub-line name to only one shop's copy of that name before the merge runs
   would change its word set and silently stop it matching the other shop's
   otherwise-identical listing — see reattachArmafLine's own comment in
   productName.ts for the full reasoning. */
for (const product of products.values()) {
  product.name = reattachArmafLine(product.name, product.armafLine);
}

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

/* ── which offers are the fragrance house's own ─────────────────────────────
   The strongest evidence about a bottle's RRP is what the company that makes
   it charges for it, and fourteen houses already run a UK storefront that sits
   in the ordinary registry flagged `singleBrandOnly` and is harvested into
   data/catalogue in sterling like any other shop. So "go and get the brand's
   price" is this loop: a join over data already on disk, not a fetch. See test
   zero in src/catalogue/wasPriceCredibility.ts for what it is then used for,
   and for why data/houses — the other brand-direct source — still cannot
   supply this (71% of it is priced in AED, USD, EUR or IDR).

   Runs here, after every same-bottle merge above has settled and before the
   audit below, because the question is asked of the product's *final* brand:
   an offer that joined an existing product, or one absorbed by
   findDuplicateGroups, would otherwise be matched against a brand string that
   is about to be replaced. See Offer.brandDirect.

   `cannotCarryBrand` rather than a bare `singleBrandOnly` test, and that is
   load-bearing rather than tidiness: a house's own shop also resells other
   houses. armaf.uk's live catalogue carries 76 "Armaf - Club De Nuit" and 50
   "Armaf - Odyssey Series" listings, but also 42 Jenny Glow, 8 Just Jacks and
   7 Hamidi. Armaf's price for a Jenny Glow bottle is one shop's opinion like
   any other, and reading it as the manufacturer's word would hand a single
   shop the power to refute the whole market on a brand it does not make. */
let brandDirectOffers = 0;
const brandDirectShops = new Map<string, number>();
for (const product of products.values()) {
  for (const offer of product.offers) {
    const retailer = RETAILERS.find((r) => r.id === offer.retailerId);
    if (!retailer?.singleBrandOnly) continue;
    if (cannotCarryBrand(retailer, product.brand)) continue;
    offer.brandDirect = true;
    brandDirectOffers++;
    brandDirectShops.set(offer.retailerId, (brandDirectShops.get(offer.retailerId) ?? 0) + 1);
  }
}

/* ── the house ceiling, kept where it can still be checked ──────────────────
   Test zero's ceiling is not recoverable from what this script ships. The
   house's own reference price is part of it, the withholding rule below clears
   every uncorroborated `wasPrice` including the house's own, and `brandDirect`
   and `sizeMl` are both dropped before writing — so the shipped catalogue can
   only ever reconstruct a ceiling *lower* than the real one, and a test built
   on that reconstruction reports products as violations that are nothing of
   the kind. Five did, all Armaf, all for that reason: on Connoisseur Man,
   Perfume Click's RRP £39.99 is exactly the figure armaf.uk itself struck
   through, and the reconstruction saw only armaf.uk's £34.99 sale price.

   So it is recorded on the product, as `houseCeiling` below, and
   tests/dealsBrandDirect.test.ts joins Today's Deals against it. That join is
   worth having rather than the build marking its own homework: the deals
   snapshot is produced two steps later by a different script out of `wasPrice`
   alone, so it catches the withholding below or build-deals.ts drifting from
   this check — which is the failure that put "65% off RRP" on the Armaf page.

   Written onto the product record rather than into a data/ report because the
   two must move together or the join is meaningless, and the product record is
   already committed and regenerated in lockstep with the offers it describes
   by every path in .github/workflows/catalogue-daily.yml. A separate report
   file would need adding to three commit lists and to commit-and-push.sh's
   conflict rules, and would silently go stale the first time one of them was
   missed. It is 851 numbers, one per product whose house is stocked here. */
const houseCeilings = new Map<string, number>();
for (const product of products.values()) {
  let ceiling = 0;
  for (const offer of product.offers) {
    if (!offer.brandDirect || offer.sizeMl !== product.sizeMl) continue;
    if (offer.price > 0) ceiling = Math.max(ceiling, offer.price);
    if (offer.wasPrice !== null && offer.wasPrice > 0) ceiling = Math.max(ceiling, offer.wasPrice);
  }
  if (ceiling > 0) houseCeilings.set(product.id, ceiling);
}

/* ── what a strikethrough is allowed to mean ─────────────────────────────────
   The owner's original report was that Perfume Click's RRPs are misleading.
   Measuring it said the instinct was right and the suspect was wrong: shops
   agree with each other about RRP (median ratio 1.000 over 5,391 comparable
   claims — see wasPriceCredibility.ts), and what actually misleads is that an
   RRP sits far above street price across the *whole* discount market — this
   file's own measurement of every claiming offer against the cheapest price
   anyone charges for the identical product puts the median at 1.72-1.9x,
   depending on whether the comparison is restricted to products two or more
   shops stock. A strikethrough against a bare RRP therefore advertises a
   saving most readers cannot capture by shopping anywhere on this site, not
   just at one shop. That was the open question the previous version of this
   comment left to the owner: whether "was" should ever mean "RRP" at all.

   The answer implemented below is that a reference price only earns a
   strikethrough when the market has actually corroborated it — the
   `corroborated` verdict from wasPriceCredibility.ts. Both of the other two
   verdicts now have the same consequence, `wasPrice` withheld, for two
   different reasons:

     - `refuted`   (307 of 12,195 claims, 2.5%) — the evidence actively
       contradicts the figure. Unsafe to publish full stop. 163 of those 307
       are test zero's: the shop states a reference price above what the
       fragrance house itself charges for the identical bottle, and 136 of
       them had passed both market tests because enough other shops repeated
       the same inflated number. Cross-retailer agreement cannot tell a
       manufacturer's RRP from a figure retailers copied off one another; the
       manufacturer can.
     - `unchecked` (8,879 of 12,195 claims, 72.8%) — fewer than two other
       shops stock the identical bottle, so the figure has never been tested
       against anything. "Nothing disproved it" is not the same claim as
       "the market confirms it", and a comparison site has no business
       showing the stronger claim on the weaker evidence — that gap is
       exactly what let Perfume Click's *volume* of RRP publishing look like
       a deals problem in the first place. An unchecked claim is not known to
       be false: it is left on the offer's own record (nothing here deletes
       it from data/catalogue) and is free to earn a strikethrough once enough
       shops stock the same bottle in the same size to judge it.

       How many is "enough" is worth stating plainly, because it is the real
       cost of this rule. MIN_REFERENCE_SHOPS is 2 and counts *other* shops,
       so a claim needs three shops on the identical bottle before either
       market test can run — the claiming shop plus two references — and all
       three must agree on size. Measured against this catalogue: of 14,784
       products, 10,156 are stocked by exactly one shop and 3,019 by two, so
       13,175 of them (89.1%) are out of reach of the market tests no matter
       what their RRP says. Only 1,609 products (10.9%) carry three or more
       offers at all. A strikethrough is therefore a thing the mainstream of
       the catalogue can show and the long tail structurally cannot, which is
       a deliberate trade — silence on a figure nothing can test, rather than
       a saving claim resting on one shop's word — but it is not a gap that
       closes on its own as the crawl widens, and it should not be described
       as if it were.

       Test zero is the one route into that 89.1%, and a narrow one: it needs
       the product's own house to run a UK storefront we harvest, which 851 of
       the 14,784 products have. 49 claims reach a verdict through it that no
       market test could have reached — 27 refuted, 22 corroborated.

   One caveat on the verdict's name, since it is the load-bearing one:
   `corroborated` means a test was able to run and did not refute the claim,
   not that anyone confirmed the figure. All three tests in
   wasPriceCredibility.ts are refutation tests — "the saving exceeds the whole
   bottle", "the claim towers over the highest RRP anyone else states", "the
   claim exceeds what the manufacturer charges" — so passing them is a sanity
   check the claim survived, not positive evidence for it. Test zero's version
   of that is the strongest of the three, because surviving it means the
   figure is one the company making the bottle does not contradict, but it is
   still survival rather than endorsement.

   Only `corroborated` (3,009 of 12,195, 24.7%) survives to reach `wasPrice`
   below, which is what feeds the strikethrough, the "X% off" badge and
   Today's Deals — none of those three needing to know this check exists, the
   same property the refuted-only version of this rule already had. The price
   itself is never touched, only the reference price beside it. Percentages
   above are this build's own console output (see the audit log below), which
   is reproducible by re-running this script; the 1.72-1.9x ratio is measured
   independently by a throwaway script rather than repeating this file's own
   numbers back at itself. */
const { audit: wasAudit, verdicts: wasVerdicts } = auditWasPrices([...products.values()]);
for (const product of products.values()) {
  for (const offer of product.offers) {
    if (wasVerdicts.get(offer) !== 'corroborated') offer.wasPrice = null;
  }
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
// handful of note names actually displayed. `sizeMl` goes the same way and for
// the same reason: it exists so the reference-price check can size-gate its
// comparisons, the product record already carries the size once, and a second
// copy on all 21,796 offers would be paid for on every page load. `brandDirect`
// is dropped for the same reason and one more: it is a fact about the registry
// (`singleBrandOnly`) that the app can already recompute from RETAILERS at any
// time, so shipping it would be shipping a derived boolean per offer.
const crawled: Record<string, Omit<Offer, 'description' | 'sizeMl' | 'brandDirect'>[]> = {};
for (const p of ordered) {
  crawled[p.id] = p.offers.map(
    ({ description: _drop, sizeMl: _size, brandDirect: _house, ...rest }) => rest,
  );
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
  // Omitted entirely rather than written as null where the house is not
  // stocked here — JSON.stringify drops an undefined value, so 13,933 of the
  // 14,784 products cost nothing for a field that has nothing to say.
  houseCeiling: houseCeilings.get(p.id),
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
  /**
   * This retailer's own published rating for this listing, read from its
   * schema.org aggregateRating — see src/catalogue/jsonld.ts. Null wherever
   * the source publishes none; never defaulted or guessed.
   */
  rating: { value: number; count: number | null } | null;
}

export interface Notes {
  top: string[];
  middle: string[];
  base: string[];
  /**
   * Which offer these notes were actually read from, so the app can name and
   * link the retailer instead of a generic "the retailer listing it". Null
   * only if a future build somehow produces notes with no attributable
   * offer; today's pickNotes never does.
   */
  source: { retailerId: string; url: string } | null;
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
  /**
   * The highest figure this fragrance's own house publishes for this bottle on
   * its own UK storefront — its price, or its own struck-through reference
   * price, whichever is higher. Absent for the 13,933 products whose house
   * either has no UK storefront here or does not list this size.
   *
   * This is test zero's ceiling in src/catalogue/wasPriceCredibility.ts: no
   * \`wasPrice\` above it survived into CRAWLED above, whatever the rest of the
   * market said about it. Carried on the record because it cannot be
   * reconstructed from the shipped offers — the house's own reference price is
   * part of it and is itself subject to the withholding rule — and because it
   * is the one number that makes "this shop is cheaper than buying direct"
   * expressible without inventing anything.
   */
  houseCeiling?: number;
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
    rating: o.rating,
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

/* The three verdicts are printed together, always. `unchecked` is the
   majority, and unlike the version of this rule that only acted on `refuted`,
   it is no longer idle information: only `corroborated` claims below keep
   their `wasPrice`, so this line is the log's record of how much of the
   site's strikethrough pricing that decision actually removes. */
{
  const claims = wasAudit.refuted + wasAudit.corroborated + wasAudit.unchecked;
  const pct = (n: number) => (claims === 0 ? '0.0' : ((n / claims) * 100).toFixed(1));
  console.log(
    `reference prices: ${claims} offers claim a reduction — ` +
      `${wasAudit.corroborated} corroborated and kept (${pct(wasAudit.corroborated)}%), ` +
      `${wasAudit.refuted} refuted (${pct(wasAudit.refuted)}%), ` +
      `${wasAudit.unchecked} unchecked (${pct(wasAudit.unchecked)}%, no two other shops and no house price) ` +
      `— the latter two withheld, not just the refuted ones`,
  );
  console.log(
    `brand-direct evidence: ${brandDirectOffers} offers are the product's own house ` +
      `(${[...brandDirectShops].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ')}); ` +
      `${wasAudit.brandAnchored} claims had a size-matched house price to test against, ` +
      `${wasAudit.refutedByBrand} of them stated an RRP above what the house itself charges, ` +
      `and ${wasAudit.brandOnlyEvidence} were judged on the house price alone (no two other shops)`,
  );
  for (const [retailerId, n] of [...wasAudit.refutedByShop].sort((a, b) => b[1] - a[1])) {
    const checked = wasAudit.checkedByShop.get(retailerId) ?? 0;
    console.log(
      `::warning::${retailerId}: ${n} of ${checked} checkable reference prices are contradicted by the ` +
        'other shops selling the same bottle — published without one rather than with one we cannot stand behind.',
    );
  }
  if (wasAudit.productsWithMixedSizes > 0) {
    console.log(
      `::warning::${wasAudit.productsWithMixedSizes} products carry offers that disagree about bottle size. ` +
        'No reference price was compared across a size boundary; see wasPriceCredibility.ts.',
    );
  }
}

for (const f of scaleAudit.offScale) {
  console.log(
    `::warning::${f.retailerId}: reference prices sit at ${f.factor.toFixed(3)}× the rest of the ` +
      `market's across ${f.sample} shared products, interquartile spread ${(f.spread * 100).toFixed(1)}% ` +
      `— a scale, not a disagreement. ${withheldForScale.get(f.retailerId) ?? 0} offers withheld ` +
      'rather than published at a price we cannot stand behind.',
  );
}
