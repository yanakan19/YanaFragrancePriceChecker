/**
 * Mobile and desktop harness for the PriceSniffs comparison core.
 *
 * Holds no pricing logic of its own. It is a thin renderer over the real modules
 * in `src/`, bundled unchanged, so the demo cannot drift from what ships.
 *
 * ── Structure ────────────────────────────────────────────────────────────────
 * Four top level places. Only one of them, the middle one, carries a level of
 * subpages beneath it:
 *
 *   Home           the mark, what this is, and the popular rail
 *   Today's Deals  the discounted-fragrance snapshot, a flat list with no
 *                  leaves of its own
 *   Explore        Brands · Retailers · Notes · Search
 *   Settings       preferences, contact, legal
 *
 * Everything else (a fragrance, a retailer, a note, a legal document) is a leaf
 * reached from one of those and always carries a Back control. Nothing is ever
 * more than two taps from Home, which is the whole reason the subpages live
 * under Explore rather than crowding the top bar. Today's Deals sits in the
 * bar itself rather than under Explore precisely because it has no subpages to
 * hide: there is nothing a tab would be saving the reader from.
 *
 * House style for every reader facing string in this file: no hyphens, no en
 * dashes, no em dashes. Where a compound would normally take a hyphen, reword
 * it. Code comments are exempt.
 */
import {
  buildComparison,
  bestOffer,
  canShowCountdown,
  cheapestVerdict,
  // `tooCloseToCallNote` is deliberately not imported here any more: this
  // harness no longer renders that sentence (see lowestPriceBox). It stays
  // exported from src/index.ts for consumers of the core — the verdict it
  // words is still computed and still drives the label swap above the price.
  formatGbp,
  RETAILERS,
  getRetailer,
  cannotCarryBrand,
  type CheapestVerdict,
} from '../src/index.js';
import { CONCENTRATION_NOT_STATED } from '../src/catalogue/productName.js';
import type { PresentedOffer, StockState } from '../src/types/offer.js';
import type { Retailer, RetailerTier } from '../src/types/retailer.js';
import {
  DEMO_FRAGRANCES, BY_POPULARITY, DEALS, NOTE_INDEX,
  brandTierFor, fragranceById, fragrancesAt, listingCountAt, fragrancesWithNote, lowestPrice, compareVariants,
  type DemoFragrance, type NoteLayer,
} from './data.js';
import { productArt, type ArtSize } from './photo.js';
import { AA_TEXT, contrastRatio, parseColour, type Rgba } from './contrast.js';
import { GENDER_LABEL, GENDER_ORDER, readGender, type GenderReading } from './gender.js';
import { VOLUME_BANDS, volumeBandFor, type VolumeBand } from './volumeBands.js';
import { LIST_SORT_OPTIONS, sortFragrances, type BrowseSort, type ListSort } from './listSort.js';
import {
  PER_ROW_CHOICES, PER_ROW_DEFAULT, clampPerRow, gridWidthFor, perRowChoicesFor,
} from './tileDensity.js';
import { trustpilotStateFor } from './trustpilotWidget.js';
import { deliveryLines } from './deliveryFacts.js';
import { deliveryPriceNote } from './priceDeliveryNote.js';
import { msrpComparison, msrpComparisonLabel, type MsrpComparison } from './msrpComparison.js';
import { pickReferencePrice } from './referencePrice.js';
import { COMPANY, LEGAL_PAGES, legalPage } from './legal.js';
import { CHANGELOG } from './changelog.js';
import { isNewAt, offersFor, SHOP_COUNT, HOUSE_PRODUCTS } from './catalogue.generated.js';
import { priceHistoryFor, priceHistoryGapFor, PRICE_HISTORY } from './priceHistory.generated.js';
import { dayKey, dailyHistory, type DailyHistoryPoint } from '../src/services/priceHistoryDaily.js';
import { priceHistoryGapMessage, type PriceHistoryGap } from '../src/services/priceHistoryGaps.js';
import { officialSiteFor } from './brandSites.js';
import { fragranceLinksFor } from './fragranceLinks.js';
import { matchRoute, routeToPath, slugify, basePath, type Route, type RouteName } from './router.js';
import { headFor, type HeadTags, type HeadInput } from './head.js';
import { SUPABASE_CONFIGURED } from './supabase.js';
import {
  signUp, signIn, signOut, resendVerification, requestPasswordReset, currentUser, isVerified, onAuthChange,
  checkEmailLinkCallback,
} from './auth.js';
import type { User } from '@supabase/supabase-js';
import { accountState, wishlistControl, type AccountStateInput } from '../src/services/accountState.js';
import { fetchWishlist, addToWishlist, removeFromWishlist, type WishlistEntry } from './wishlist.js';
import {
  VIRTUAL_YANNY_CONFIGURED, checkYannyHealth, askVirtualYanny, warmVirtualYanny,
  type YannyIntent, type YannyResult, type YannyEvent, type YannyHealth,
} from './virtualYanny.js';

type View = 'home' | 'deals' | 'explore' | 'browse' | 'detail' | 'retailer' | 'brand' | 'note' | 'legal' | 'about' | 'settings' | 'account' | 'design' | 'notFound';
type AuthTab = 'signIn' | 'signUp';
type ExploreTab = 'brands' | 'retailers' | 'notes' | 'search';
type DisplayMode = 'dark' | 'light' | 'system';
type Layout = 'mobile' | 'desktop';
type BrandSort = 'az' | 'za';
type BrandFilter = RetailerTier | 'all';
type DealSort = 'discount' | 'lowest' | 'highest';
type NoteSort = 'common' | 'az';
type NoteLayerFilter = NoteLayer | 'any';
/** Sort for a fragrance list scoped to one note, brand or retailer. Same
 *  vocabulary as the rest of the app: alphabetical both ways (Brands),
 *  price both ways (Deals). */
// ListSort, BrowseSort and sortFragrances live in demo/listSort.ts — see that
// file's header for why they are not inline here.

/** One of the price bands offered under the Price facet. */
type PriceBand = '0-20' | '20-30' | '30-50' | '50-80' | '80-150' | '150-300' | '300+';
/** Every facet a fragrance list can be narrowed by. Matches the state.facet* fields below 1:1. */
type FacetGroup = 'volume' | 'concentration' | 'gender' | 'priceBand' | 'tier' | 'onSale' | 'inStock';

const MODE_KEY = 'pricesniffs.display';
const LAYOUT_KEY = 'pricesniffs.layout';
const PER_ROW_KEY = 'pricesniffs.perrow';
/**
 * Where the Virtual Yanny transcript is kept across a page refresh, and the
 * only thing about the chat that is written to storage at all.
 *
 * `sessionStorage`, deliberately, where every other preference above uses
 * `localStorage`. Those three are settings a reader chose and expects to
 * still hold next week; a chat is not. sessionStorage is scoped to this one
 * tab and is dropped when the tab closes, which covers exactly what was
 * asked for — a refresh, or an accidental reload, keeping the conversation —
 * without leaving somebody's shopping questions sitting on a shared or
 * borrowed computer indefinitely, and without two tabs writing into one
 * shared transcript and interleaving each other's turns.
 *
 * What is stored is the visible conversation and nothing else: the reader's
 * own messages, Virtual Yanny's replies, and a marker where an answer was
 * stopped. The scoring matrix is not persisted — it is working detail for
 * the answer in front of you, not part of the conversation, and it is by
 * far the largest thing in the thread. Bounds and the failure behaviour are
 * at saveYannyThread/loadYannyThread.
 */
const YANNY_THREAD_KEY = 'pricesniffs.yanny.thread';

// PER_ROW_CHOICES, PER_ROW_DEFAULT and the width arithmetic that decides which
// of those counts a given window can actually carry live in demo/tileDensity.ts
// — see that file's header for what 10 per row was doing to product names.

const state = {
  view: 'home' as View,
  tab: 'brands' as ExploreTab,
  fragranceId: '',
  retailerId: '',
  brandProfile: '',
  noteName: '',
  legalId: '',
  /** The address that matched nothing, shown back on the not-found view. */
  notFoundPath: '',
  brand: null as string | null,
  query: '',
  mode: 'dark' as DisplayMode,
  layout: 'mobile' as Layout,
  perRow: PER_ROW_DEFAULT,
  brandSort: 'az' as BrandSort,
  brandFilter: 'all' as BrandFilter,
  dealSort: 'discount' as DealSort,
  noteSort: 'common' as NoteSort,
  noteLayer: 'any' as NoteLayerFilter,
  noteDetailSort: 'az' as ListSort,
  noteDetailFilter: 'all' as BrandFilter,
  // Browse and search. Defaults to the order this list already arrived in, so
  // the control's existence changes nothing until a reader uses it.
  browseSort: 'stocked' as BrowseSort,
  brandDetailSort: 'az' as ListSort,
  retailerDetailSort: 'az' as ListSort,
  retailerDetailFilter: 'all' as BrandFilter,
  // Scoped to *this* retailer's own offer, not the sitewide inStock facet
  // above — a fragrance can be purchasable elsewhere while sold out here, and
  // a shop's own page should only ever claim what is true of that shop.
  retailerInStockOnly: false,

  // ── facets ────────────────────────────────────────────────────────────────
  // One shared set of selections rather than one per page: every list page
  // resets them on navigation (see `go`), so nothing carries over somewhere it
  // would not make sense, and one implementation covers Browse, Search, Deals,
  // a retailer's page, a brand's page and a note's page alike.
  facetsOpen: false,
  facetVolume: new Set<VolumeBand>(),
  facetConcentration: new Set<string>(),
  facetGender: new Set<GenderReading>(),
  facetPriceBand: new Set<PriceBand>(),
  facetTier: new Set<RetailerTier>(),
  facetOnSale: false,
  facetInStock: false,

  // ── accounts (Module 7) ──────────────────────────────────────────────────
  authUser: null as User | null,
  // Set once, at startup, by loadAuthUser — distinct from authUser being null
  // (signed out) so the account page can show "loading" rather than flash a
  // signed out state before the first check has even run.
  authChecked: false,
  authTab: 'signIn' as AuthTab,
  authBusy: false,
  authError: '' as string,
  // Set after a successful signup or resend, so the "check your email" state
  // knows which address to offer resending to.
  authPendingEmail: '' as string,
  authResetSent: false,

  // ── wishlist (Module 7 continued) ────────────────────────────────────────
  // The signed-in reader's own saved fragrance ids, loaded once verification
  // is confirmed and cleared on sign out (see loadWishlist/init). A Set so
  // the detail page's toggle button is an O(1) lookup rather than scanning
  // the full list on every render.
  wishlistIds: new Set<string>(),
  wishlistLoaded: false,
  wishlistBusy: false,
  // Full entries only fetched for the account page's own list, not needed
  // just to render a toggle button correctly on the detail page.
  wishlistEntries: [] as WishlistEntry[],

  // ── Virtual Yanny ─────────────────────────────────────────────────────────
  yannyOpen: false,
  // 'idle' before the panel has ever been opened this session; the health
  // check only ever runs on open (see openYanny), never speculatively, so a
  // reader who never clicks the launcher never pays for it.
  yannyStatus: 'idle' as 'idle' | 'checking' | 'unavailable' | 'ready',
  // Why the last check failed, so the unavailable panel can say which thing
  // is wrong. "Not available" covered a missing deploy, a sleeping machine
  // and a rate-limited third-party router equally, and those want different
  // words: one is permanent, one fixes itself in seconds, one in minutes.
  yannyReason: 'no-answer' as YannyHealth['reason'],
  // Always null now that the intent buttons are gone, and kept rather than
  // deleted because askVirtualYanny's signature is the contract with the
  // server: null is the value that means "you work it out", and the server
  // does (classifyIntent). Dropping the parameter would make an explicit
  // intent unexpressible if a future surface ever needs to send one.
  yannyIntent: null as YannyIntent | null,
  yannyThread: [] as YannyThreadItem[],
  yannyBusy: false,
  yannySplash: '',
  yannyAgentChips: [] as { agentNumber: number; ok: boolean }[],
  yannyLastResult: null as YannyResult | null,
  // "Clear chat" asks once before it wipes anything — see clearYannyChat for
  // why one extra press beats both a modal and no guard at all. False is the
  // resting state; the button only reads "Clear chat?" while this is true.
  yannyClearArmed: false,
  // Focus returns here on close — whatever had focus before the panel opened,
  // almost always the launcher button itself but not necessarily (a reader
  // could open it via keyboard from anywhere focus happens to be).
  yannyOpenedFrom: null as HTMLElement | null,
};

/** Every facet selection back to empty. Called on every navigation — see `go`. */
function clearFacets(): void {
  state.facetsOpen = false;
  state.facetVolume.clear();
  state.facetConcentration.clear();
  state.facetGender.clear();
  state.facetPriceBand.clear();
  state.facetTier.clear();
  state.facetOnSale = false;
  state.facetInStock = false;
}

function activeFacetCount(): number {
  return (
    state.facetVolume.size +
    state.facetConcentration.size +
    state.facetGender.size +
    state.facetPriceBand.size +
    state.facetTier.size +
    (state.facetOnSale ? 1 : 0) +
    (state.facetInStock ? 1 : 0)
  );
}

function toggleInSet<T>(set: Set<T>, value: T): void {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const $ = (sel: string) => document.querySelector(sel)!;

/**
 * Display casing only — every lookup keyed on a note name (data-note
 * attributes, fragrancesWithNote, NOTE_INDEX) keeps using the raw string
 * exactly as extracted, so this never risks a note silently failing to
 * match. Extracted note text only reliably capitalises its first word
 * ("Fresh florals"), so this fixes every word for display, e.g. "Floral
 * boquet" reads as "Floral Boquet".
 */
const titleCase = (s: string) => s.replace(/\S+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());

// Includes houses read straight from their own storefront (HOUSE_PRODUCTS)
// alongside brands with real UK offers, so a house that has not yet been
// matched to a UK listing still gets a page instead of needing a section of
// its own — it is a brand like any other, just one whose products so far
// only carry a price it charges directly.
const BRANDS = [...new Set([...DEMO_FRAGRANCES.map((f) => f.brand), ...HOUSE_PRODUCTS.map((p) => p.house)])].sort();
const TIER_LABEL: Record<RetailerTier, string> = {
  designer: 'Designer', niche: 'Niche', mideast: 'Middle Eastern / Dupe Houses',
};

/**
 * How the leading list is ranked, and what it does not claim.
 *
 * `BY_POPULARITY` orders by how many of our shops carry a fragrance, then by
 * price. That is a real, checkable fact about availability, and it is a decent
 * proxy for demand — shops stock what sells — but it is *not* a popularity
 * measurement, so the UI calls it "most stocked" rather than implying we have
 * counted anything.
 *
 * Genuine popularity would need one of: our own outbound click counts (nothing
 * is logged yet, and the site has no traffic to log), Awin conversion data
 * (which reports on transactions we referred, of which there are none so far,
 * and only for one merchant), or per product sales rank from a retailer (none
 * publish it). Time windowed popularity would additionally need a history of
 * daily snapshots per product, which only began accumulating this month.
 * Inventing any of that would be exactly the thing this project refuses to do.
 */
const TOP_N = 50;

/**
 * Oils are kept out of the leading list, on the owner's instruction
 * (2026-08-20).
 *
 * A perfume oil is a different product from a bottle of eau de parfum — sold
 * by the roller or the tola, worn differently, priced on a scale that does not
 * compare — so a list whose whole job is "here is what the UK's shops stock,
 * ranked" reads better without them mixed in. 298 of the catalogue's products
 * carry the "Perfume Oil" concentration as of this change (counted over
 * demo/catalogue.generated.ts, 2026-08-20).
 *
 * Excluded from the front-page rail and from the capped Most Stocked list
 * only. An oil still has its own page, still appears under its brand, still
 * comes back in a search for it, and still carries every price we have for it
 * — this hides nothing, it only declines to rank oils against sprays.
 */
const isOil = (f: DemoFragrance): boolean => f.concentration === 'Perfume Oil';

const POPULAR = BY_POPULARITY.filter((f) => !isOil(f)).slice(0, 12);

/**
 * Prices come from the catalogue crawl and the affiliate feed, never from a
 * hand written table. That is what makes them live.
 */
/**
 * Deliberately does not pass `tier`.
 *
 * That option is a plausibility filter — "restrict to retailers that stock
 * this catalogue segment", there so a search does not go asking Superdrug for
 * Amouage. It answers a question about who *might* have something. Every offer
 * `offersFor` returns is the opposite kind of thing: a shop that was observed
 * listing this exact bottle, at a price read off its own page. Filtering
 * observation through a guess about plausibility can only ever discard true
 * information, and it did, at scale.
 *
 * Measured before removing it: 4,217 of 15,447 products with at least one
 * in-stock offer — 27.3% — had every one of those offers dropped here and
 * rendered "Sold out everywhere / no shop has it in stock right now / 0 shops"
 * while genuinely in stock at up to three shops. French Avenue Vulcan Feu is
 * stocked by Beautybase, Justmylook and MyBeauty.Boutique; its tier is
 * 'mideast'; none of those three declares 'mideast'; so all three real offers
 * vanished and the page said nobody had it.
 *
 * This is the third appearance of the same fault. Emirates Oud and Escentric
 * Molecules were each patched by correcting one brand's tier assignment, which
 * fixed those brands and left the mechanism intact to do it again. A product's
 * tier is one guessed label; a retailer's `tiers` is a hand-maintained list;
 * they disagree constantly, and on this page the disagreement is not
 * informative about anything. The option stays — it is right for a browse or
 * search context, and tests cover it — it just has no business standing
 * between a reader and a shop that demonstrably has the bottle.
 */
function rowsFor(frag: DemoFragrance): PresentedOffer[] {
  return buildComparison(offersFor(frag.id), { sortBy: 'delivered' });
}

/* ── facets ──────────────────────────────────────────────────────────────────
   Amazon's own rule, not just a description of it: an option only appears if
   at least one fragrance in the list actually has it, and its count reflects
   every *other* active facet but never its own group — so ticking a second
   volume never zeroes out the first, but ticking Volume can still empty out
   Concentration. Ticking a filter that would leave nothing selected is not
   possible, because that option would never have been offered. */

const PRICE_BANDS: { id: PriceBand; label: string; min: number; max: number | null }[] = [
  { id: '0-20', label: 'Under £20', min: 0, max: 20 },
  { id: '20-30', label: '£20 - £30', min: 20, max: 30 },
  { id: '30-50', label: '£30 - £50', min: 30, max: 50 },
  { id: '50-80', label: '£50 - £80', min: 50, max: 80 },
  { id: '80-150', label: '£80 - £150', min: 80, max: 150 },
  { id: '150-300', label: '£150 - £300', min: 150, max: 300 },
  { id: '300+', label: '£300 And Over', min: 300, max: null },
];

/**
 * Which band a delivered price falls in, or null when there is no delivered
 * price because the shop does not state its delivery cost.
 *
 * Banding such an offer on its item price instead would place it in a cheaper
 * band than it can be shown to belong to, which is the same "looks artificially
 * cheap" error the whole delivered-price model exists to avoid — so it is left
 * out of the price facet rather than filed under a number nobody has.
 */
function priceBandFor(deliveredPriceGbp: number | null): PriceBand | null {
  if (deliveredPriceGbp === null) return null;
  const price = deliveredPriceGbp;
  return (PRICE_BANDS.find((b) => price >= b.min && (b.max === null || price < b.max)) ?? PRICE_BANDS[PRICE_BANDS.length - 1]!).id;
}

/**
 * Who a fragrance is sold to, as read off its own title — see demo/gender.ts
 * for what counts as evidence and for why silence gets its own reading rather
 * than being folded into "unisex".
 *
 * Cached per product id because it is a handful of regexes and facetGroups
 * asks the question of every candidate once per group on every render. The
 * inputs are a build-time constant, so an entry can never go stale within a
 * session.
 */
const genderCache = new Map<string, GenderReading>();
function genderOf(f: DemoFragrance): GenderReading {
  const cached = genderCache.get(f.id);
  if (cached) return cached;
  // The same string the card prints, so a reader can check the reading
  // against what is on screen.
  const reading = readGender(`${f.brand} ${f.name} ${f.concentration}`);
  genderCache.set(f.id, reading);
  return reading;
}

/**
 * Whether one fragrance survives every active facet except `exclude`. Passing
 * a group's own id when computing that same group's option counts is what
 * makes ticking a second option within a group additive rather than
 * self-defeating — see the header comment above.
 */
function passesFacets(f: DemoFragrance, exclude: FacetGroup | null): boolean {
  // A fragrance whose own title cannot be read as one size (volumeBandFor
  // returns null — see its own comment) belongs to no band, the same
  // "cannot answer, so it does not match a specific band" rule priceBand
  // just below already applies to a delivery cost nobody states.
  if (exclude !== 'volume' && state.facetVolume.size) {
    const band = volumeBandFor(f.sizeMl);
    if (band === null || !state.facetVolume.has(band)) return false;
  }
  if (exclude !== 'concentration' && state.facetConcentration.size && !state.facetConcentration.has(f.concentration)) return false;
  if (exclude !== 'gender' && state.facetGender.size && !state.facetGender.has(genderOf(f))) return false;
  if (exclude !== 'tier' && state.facetTier.size && !state.facetTier.has(f.tier)) return false;

  if (exclude !== 'priceBand' && state.facetPriceBand.size) {
    const best = bestOffer(rowsFor(f));
    const band = best ? priceBandFor(best.deliveredPriceGbp) : null;
    if (band === null || !state.facetPriceBand.has(band)) return false;
  }
  if (exclude !== 'onSale' && state.facetOnSale) {
    if (!rowsFor(f).some((r) => r.discount !== null)) return false;
  }
  if (exclude !== 'inStock' && state.facetInStock) {
    if (!rowsFor(f).some((r) => r.isPurchasable)) return false;
  }
  return true;
}

function applyFacets(list: DemoFragrance[]): DemoFragrance[] {
  return list.filter((f) => passesFacets(f, null));
}

interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Every facet option worth offering for this list, each with a live count —
 * `list` should be the *pre-facet* candidates for the page (everything Browse
 * or a brand page would show with no facets applied), not the already-filtered
 * result, or every count would just read as "however many are left".
 */
function facetGroups(list: DemoFragrance[]) {
  const volume = new Map<VolumeBand, number>();
  const concentration = new Map<string, number>();
  const gender = new Map<GenderReading, number>();
  const priceBand = new Map<PriceBand, number>();
  const tier = new Map<RetailerTier, number>();
  let onSale = 0;
  let inStock = 0;

  for (const f of list) {
    const rows = rowsFor(f);
    if (passesFacets(f, 'volume')) {
      const band = volumeBandFor(f.sizeMl);
      if (band !== null) volume.set(band, (volume.get(band) ?? 0) + 1);
    }
    if (passesFacets(f, 'concentration')) {
      concentration.set(f.concentration, (concentration.get(f.concentration) ?? 0) + 1);
    }
    if (passesFacets(f, 'gender')) {
      const reading = genderOf(f);
      gender.set(reading, (gender.get(reading) ?? 0) + 1);
    }
    if (passesFacets(f, 'tier')) tier.set(f.tier, (tier.get(f.tier) ?? 0) + 1);
    if (passesFacets(f, 'priceBand')) {
      const best = bestOffer(rows);
      const band = best ? priceBandFor(best.deliveredPriceGbp) : null;
      if (band !== null) {
        priceBand.set(band, (priceBand.get(band) ?? 0) + 1);
      }
    }
    if (passesFacets(f, 'onSale') && rows.some((r) => r.discount !== null)) onSale++;
    if (passesFacets(f, 'inStock') && rows.some((r) => r.isPurchasable)) inStock++;
  }

  const toOptions = <T extends string | number>(counts: Map<T, number>, label: (v: T) => string): FacetOption[] =>
    [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => (typeof a[0] === 'number' ? (a[0] as number) - (b[0] as number) : String(a[0]).localeCompare(String(b[0]))))
      .map(([value, count]) => ({ value: String(value), label: label(value), count }));

  // "Not stated" is an option like any other, and it goes last, where a
  // reader expects the bucket that means "none of the above". Everything
  // else stays alphabetical. It is not a concentration and does not get to
  // sit among them as though it were one — see CONCENTRATION_NOT_STATED in
  // src/catalogue/productName.ts for what it means and why it is separate
  // from "Parfum".
  const concentrationOptions = toOptions(concentration, (v) => shortConcentration(v));
  const notStated = concentrationOptions.filter((o) => o.value === CONCENTRATION_NOT_STATED);

  return {
    // Fixed order, not alphabetical or by count — same reason as priceBand
    // below: VOLUME_BANDS is already narrowest-to-widest, and that is the
    // order a reader expects a size filter to read in, not the order counts
    // happen to sort in.
    volume: VOLUME_BANDS.filter((b) => (volume.get(b.id) ?? 0) > 0).map((b) => ({
      value: b.id, label: b.label, count: volume.get(b.id)!,
    })),
    concentration: [...concentrationOptions.filter((o) => o.value !== CONCENTRATION_NOT_STATED), ...notStated],
    // Fixed order rather than alphabetical or by count, so "Not stated" is
    // always the last option and the three stated readings always sit in the
    // same place. Same "only offer what would return something" rule as every
    // other group: a reading nobody in this list has is left out.
    gender: GENDER_ORDER.filter((g) => (gender.get(g) ?? 0) > 0).map((g) => ({
      value: g, label: GENDER_LABEL[g], count: gender.get(g)!,
    })),
    priceBand: PRICE_BANDS.filter((b) => (priceBand.get(b.id) ?? 0) > 0).map((b) => ({
      value: b.id, label: b.label, count: priceBand.get(b.id)!,
    })),
    tier: toOptions(tier, (v) => TIER_LABEL[v as RetailerTier]),
    onSale,
    inStock,
  };
}

/** A single toggle pill within a facet group — a button, not a native
 *  checkbox, so it fits the rest of the app's delegated-click-handler
 *  pattern rather than needing a second kind of listener just for this.
 *
 *  `ico` is optional and only the gender group passes one. Every mark from
 *  icon() is aria-hidden, so the button's accessible name stays the label and
 *  the count, word for word what is on screen: the mark is something extra
 *  for a sighted reader, never the thing carrying the meaning. */
function facetPill(group: FacetGroup, value: string, label: string, count: number, active: boolean, ico = ''): string {
  return `<button type="button" class="facet-pill${ico ? ' has-ico' : ''}${active ? ' is-active' : ''}" data-facet-group="${group}" data-facet-value="${esc(value)}" aria-pressed="${active}">
    ${ico}<span>${esc(label)}</span> <span class="facet-count t-count">${count}</span>
  </button>`;
}

/**
 * The filter control for a fragrance list: a toggle button (badge shows how
 * many facets are active) that opens a panel of pill groups underneath.
 * Groups with nothing to narrow — every candidate shares the one available
 * value — are left out entirely rather than shown with a single dead option.
 */
function facetsBlock(list: DemoFragrance[]): string {
  const g = facetGroups(list);
  const count = activeFacetCount();

  const group = (title: string, groupId: FacetGroup, options: FacetOption[], isSelected: (value: string) => boolean): string => {
    if (options.length < 2) return '';
    return `<fieldset class="facet-group">
      <legend>${esc(title)}</legend>
      <div class="facet-pills">${options.map((o) => facetPill(groupId, o.value, o.label, o.count, isSelected(o.value))).join('')}</div>
    </fieldset>`;
  };

  /**
   * The gender group, which is the same pill group as every other one plus a
   * sentence, because without the sentence it would mislead.
   *
   * Nothing in this project's data says who a fragrance is for. The reading
   * comes off wording in the title and most titles have none, so the honest
   * shape of this filter is a large "Not stated" pile beside three small
   * stated ones. A reader who ticks Women's and sees a few hundred results
   * out of ten thousand should be told why on the spot, rather than left to
   * conclude the catalogue is thin or the filter is broken. The counts are
   * the live ones for this list, so the sentence is arithmetic a reader can
   * check against the pills right above it.
   */
  const genderGroup = (): string => {
    if (g.gender.length < 2) return '';
    const total = g.gender.reduce((n, o) => n + o.count, 0);
    const stated = g.gender.filter((o) => o.value !== 'notStated').reduce((n, o) => n + o.count, 0);
    return `<fieldset class="facet-group">
      <legend>Gender</legend>
      <div class="facet-pills">${g.gender
        .map((o) => facetPill('gender', o.value, o.label, o.count, state.facetGender.has(o.value as GenderReading), GENDER_ICON[o.value as GenderReading]))
        .join('')}</div>
      <p class="facet-note t-caption">Read from wording in the title, such as Pour Homme or For Her.
        ${stated.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} here say who they are for.
        The rest do not say, and not stated is not the same as unisex.</p>
    </fieldset>`;
  };

  const onSalePill = g.onSale > 0
    ? `<fieldset class="facet-group"><legend>Offers</legend><div class="facet-pills">
         ${facetPill('onSale', '1', 'On Sale', g.onSale, state.facetOnSale)}
       </div></fieldset>`
    : '';
  const inStockPill = g.inStock > 0 && g.inStock < list.length
    ? `<fieldset class="facet-group"><legend>Availability</legend><div class="facet-pills">
         ${facetPill('inStock', '1', 'In Stock Only', g.inStock, state.facetInStock)}
       </div></fieldset>`
    : '';

  const panel = `${group('Volume', 'volume', g.volume, (v) => state.facetVolume.has(v as VolumeBand))}
    ${group('Concentration', 'concentration', g.concentration, (v) => state.facetConcentration.has(v))}
    ${genderGroup()}
    ${group('Price', 'priceBand', g.priceBand, (v) => state.facetPriceBand.has(v as PriceBand))}
    ${group('Type', 'tier', g.tier, (v) => state.facetTier.has(v as RetailerTier))}
    ${onSalePill}
    ${inStockPill}`;

  if (!panel.trim()) return '';

  return `<div class="facets">
    <button type="button" class="control facets-toggle" data-facets-toggle aria-expanded="${state.facetsOpen}">
      <span class="control-ico">${ICON_FILTER}</span>
      <span>Filters</span>
      ${count > 0 ? `<span class="facets-badge">${count}</span>` : ''}
    </button>
    ${
      state.facetsOpen
        ? `<div class="facets-panel">
             ${panel}
             ${count > 0 ? `<button type="button" class="link-btn facets-clear" data-facets-clear>Clear all filters</button>` : ''}
           </div>`
        : ''
    }
  </div>`;
}

/* ── display mode ────────────────────────────────────────────────────────────
   `data-mode` is ours and never collides with the host's `data-theme`. When the
   reader picks "match my device" we fall through to both the OS preference and
   any theme the host has stamped, so an external toggle still works. */

function applyMode(): void {
  document.documentElement.setAttribute('data-mode', state.mode);
}

function loadMode(): void {
  try {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') state.mode = saved;
  } catch {
    // Storage can be unavailable in a sandboxed frame. Dark stays the default.
  }
  applyMode();
}

function setMode(mode: DisplayMode): void {
  state.mode = mode;
  applyMode();
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Preference simply will not persist. Nothing else breaks.
  }
}

/* ── layout ──────────────────────────────────────────────────────────────────
   `data-layout` is its own attribute, deliberately not `data-mode`: an earlier
   build put layout and colour theme on the same attribute name and
   `closest('[data-mode]')` click handling matched whichever one came first,
   not the one the click was actually for. Two names, two handlers, no
   ambiguity. */

/**
 * A real desktop with a mouse gets the wider layout by default; a phone, a
 * tablet or a resized browser window on a laptop trackpad does not. This reads
 * actual device capability rather than sniffing the user agent string, which is
 * both unreliable and unnecessary here.
 */
function detectDefaultLayout(): Layout {
  try {
    const hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isWide = window.innerWidth >= 900;
    return hasMouse && isWide ? 'desktop' : 'mobile';
  } catch {
    return 'mobile';
  }
}

function applyLayout(): void {
  document.documentElement.setAttribute('data-layout', state.layout);
}

function loadLayout(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(LAYOUT_KEY);
  } catch {
    // Storage can be unavailable in a sandboxed frame.
  }
  state.layout = saved === 'mobile' || saved === 'desktop' ? saved : detectDefaultLayout();
  applyLayout();
}

function setLayout(layout: Layout): void {
  state.layout = layout;
  applyLayout();
  try {
    window.localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Preference simply will not persist. Nothing else breaks.
  }
}

/* ── tiles per row ───────────────────────────────────────────────────────────
   Carried as a CSS variable rather than a class per choice, so the grid rule
   stays one line and a new count needs no new CSS.

   Only the desktop layout honours it. At mobile width ten columns would be
   about thirty pixels each, which is not a smaller tile but an unusable one,
   so the narrow layout keeps fitting as many whole tiles as the screen has
   room for and the control is not offered there.

   The same argument holds inside the desktop layout, which is what
   demo/tileDensity.ts now enforces: ten columns on a 1440px laptop is a 96px
   tile, and a 96px tile clips a product name down to its first word or two.
   state.perRow stays whatever the reader picked; effectivePerRow() is what
   gets drawn. */

/** The count actually rendered right now, which the window may cap. */
function effectivePerRow(): number {
  return clampPerRow(state.perRow, gridWidthFor(window.innerWidth));
}

/** The counts this window is wide enough to offer, smallest first. */
function offeredPerRow(): number[] {
  return perRowChoicesFor(gridWidthFor(window.innerWidth));
}

function applyPerRow(): void {
  document.documentElement.style.setProperty('--per-row', String(effectivePerRow()));
}

function loadPerRow(): void {
  try {
    const saved = Number(window.localStorage.getItem(PER_ROW_KEY));
    if ((PER_ROW_CHOICES as readonly number[]).includes(saved)) state.perRow = saved;
  } catch {
    // Storage can be unavailable in a sandboxed frame. The default stands.
  }
  applyPerRow();
}

function setPerRow(perRow: number): void {
  state.perRow = perRow;
  applyPerRow();
  try {
    window.localStorage.setItem(PER_ROW_KEY, String(perRow));
  } catch {
    // Preference simply will not persist. Nothing else breaks.
  }
}

/* ── labels ──────────────────────────────────────────────────────────────── */

/**
 * The stock line says the state and nothing else. There is no unit count
 * anywhere on the site and there never has been: a retailer feed carries a
 * true/false in-stock flag, never a number, so there is nothing to show.
 *
 * A `stockQtyMark()` helper used to append "(-)" after "In stock" to say that
 * absence out loud. It was removed on 2026-08-26 (owner's instruction: no
 * stock count anywhere) and should not come back in another shape — the "(-)"
 * read as a broken template or a missing figure rather than as the deliberate
 * statement it was, which is the failure mode of stating an absence with a
 * punctuation mark. The gap itself is still real and is documented here.
 */
const STOCK_LABEL: Record<StockState, string> = {
  inStock: 'In stock',
  lowStock: 'Low stock',
  preOrder: 'Preorder',
  unknown: 'Stock not confirmed',
  outOfStock: 'Sold out',
};

const STOCK_CLASS: Record<StockState, string> = {
  inStock: 'ok',
  lowStock: 'warn',
  preOrder: 'warn',
  unknown: 'muted',
  outOfStock: 'gone',
};

function age(seconds: number): string {
  if (seconds < 90) return 'just now';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  // Past two days, "Nh ago" stops being readable at a glance (a stale offer
  // sitting at STALE_OFFER_DAYS would otherwise read "240h ago") — days is
  // the unit a reader actually judges freshness in beyond that point.
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function countdown(iso: string): string {
  const h = Math.floor((Date.parse(iso) - Date.now()) / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}d left` : `${h}h left`;
}

/** "Eau de Toilette" to "EDT". Falls through for anything already short.
 *
 *  Extrait de Parfum is here for the same reason the other three are: it is
 *  the fourth of the long "X de Y" names and was the only one still printing
 *  in full beside a 100ml on a card narrow enough that the size wrapped. Its
 *  short form is the word people actually use for it. */
const CONCENTRATION_ABBR: Record<string, string> = {
  'Eau de Parfum': 'EDP',
  'Eau de Toilette': 'EDT',
  'Eau de Cologne': 'EDC',
  'Extrait de Parfum': 'Extrait',
};
const shortConcentration = (c: string): string => CONCENTRATION_ABBR[c] ?? c;

/* ── icons ───────────────────────────────────────────────────────────────────
   Line drawn, single weight, taking their colour from the surrounding text so
   they read as quiet controls rather than decoration. */

const icon = (paths: string, extraClass = '') =>
  `<svg class="ico${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${paths}</svg>`;

const ICON_FILTER = icon('<path d="M3.5 5h17l-6.6 7.8V20l-3.8-2.2v-5L3.5 5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>');
const ICON_SORT = icon('<path d="M4 7h16M6.5 12h11M10 17h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>');
const ICON_RANK = icon('<path d="M7.5 20V5m0 0L4 8.5M7.5 5 11 8.5M16.5 4v15m0 0 3.5-3.5M16.5 19 13 15.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>');
// Stands in for the native <select> arrow once appearance: none removes it —
// see .control-chevron in template.html.
const ICON_CHEVRON = icon('<path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>');
const ICON_SEARCH = icon('<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');
const ICON_GRID = icon('<rect x="3" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.7"/>');
const ICON_MOBILE = icon('<rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18.3" r=".9" fill="currentColor"/>');
const ICON_DESKTOP = icon('<rect x="2.5" y="4" width="19" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 21h7M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');
/* Neutral marks, not TikTok's or Instagram's own logos: this project has no
   licence to reproduce those. */
const ICON_TIKTOK = icon('<path d="M14 3v11.2a3.3 3.3 0 1 1-3.3-3.3c.3 0 .6 0 .9.1V8.4a6.1 6.1 0 1 0 5.1 6V9.8a7.5 7.5 0 0 0 4.3 1.4V8.5A4.6 4.6 0 0 1 17 4.5V3h-3Z" fill="currentColor"/>');
const ICON_INSTAGRAM = icon('<rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"/>');
const ICON_EXTERNAL = icon('<path d="M14 4h6v6M20 4l-8.5 8.5M19 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>');
// Outline by default; .wishlist-toggle.on switches it to a filled heart via
// the shared .ico fill/stroke rule in template.html, the same on/off
// language every other toggle in this app already uses (.seg-btn.on, etc).
const ICON_HEART = icon('<path d="M12 20.5s-7.5-4.6-10-9.3C.5 7.8 2.6 4.5 6 4.5c2 0 3.4 1 6 3.6 2.6-2.6 4-3.6 6-3.6 3.4 0 5.5 3.3 4 6.7-2.5 4.7-10 9.3-10 9.3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>');
const ICON_CLOSE = icon('<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');
/* The one filled mark in this set, and the exception is the point: a stop
   square drawn as a 1.7px outline at this size reads as an empty checkbox,
   which is the opposite of a control that halts something. `currentColor`
   rather than a colour of its own, so it takes --accent-on from the button
   it sits in — near-black on the dark theme's red, white on the light
   theme's — and stays correct under every value of data-mode, including the
   default "match my device". */
const ICON_STOP = icon('<rect x="7" y="7" width="10" height="10" rx="1.6" fill="currentColor"/>');

/* ── the gender marks ────────────────────────────────────────────────────────
   Venus and Mars, drawn to this set's own rules: one 24 unit box, one 1.7px
   line weight, round joins, no fills. Every one of them is inline SVG in the
   bundle, like everything else here, so the page still makes no external
   request for a picture of anything.

   Colour is the one place these differ from the rest of the set. The other
   icons take currentColor and are done; these carry pink and blue, which is
   what was asked for and is also the convention a reader already knows. So
   the coloured strokes are classed rather than hardcoded, and the class picks
   up --gender-women / --gender-men from template.html, where both are defined
   in all five palette blocks and both flip to their --on variant on a
   selected pill, whose ground inverts to --ink. Measured contrast for every
   one of those eight combinations is written out beside the tokens.

   Colour is never the only signal: every pill prints the word too, so the
   marks are decoration on a label rather than the label itself.

   Unisex is the two glyphs interlocked into one: a single ring carrying both
   the Venus cross below it and the Mars arrow off its shoulder, each stroke
   in its own colour. Not stated is deliberately not a gender mark at all —
   the bare ring both symbols share, drawn broken, in the pill's own ink with
   no colour of its own. It says "nobody filled this in", which is exactly
   what it means, and it could not be mistaken for the unisex glyph beside
   it. */
const ICON_GENDER_WOMEN = icon(
  '<circle cx="12" cy="9" r="5.2" stroke-width="1.7" class="g-women"/>' +
  '<path d="M12 14.2V21.4M8.8 18.4h6.4" stroke-width="1.7" stroke-linecap="round" class="g-women"/>',
  'gender-ico',
);
const ICON_GENDER_MEN = icon(
  '<circle cx="10" cy="14" r="5.2" stroke-width="1.7" class="g-men"/>' +
  '<path d="m13.9 10.2 5.7-5.7M14.6 4.5h5v5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="g-men"/>',
  'gender-ico',
);
const ICON_GENDER_UNISEX = icon(
  '<circle cx="11" cy="12.6" r="5" stroke="currentColor" stroke-width="1.7"/>' +
  '<path d="M11 17.6v4.2M8.6 19.9h4.8" stroke-width="1.7" stroke-linecap="round" class="g-women"/>' +
  '<path d="m14.6 9 4.9-4.9M14.8 4.1h4.7v4.7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="g-men"/>',
  'gender-ico',
);
const ICON_GENDER_UNSTATED = icon(
  '<circle cx="12" cy="12" r="6.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="2.4 3"/>',
  'gender-ico',
);

/** Which mark goes with which reading. Ordering lives in GENDER_ORDER. */
const GENDER_ICON: Record<GenderReading, string> = {
  womens: ICON_GENDER_WOMEN,
  mens: ICON_GENDER_MEN,
  unisex: ICON_GENDER_UNISEX,
  notStated: ICON_GENDER_UNSTATED,
};

/** A labelled dropdown with its icon, used for every sort and filter control. */
function control(id: string, label: string, ico: string, options: { value: string; label: string }[], current: string): string {
  return `<label class="control">
    <span class="control-ico">${ico}</span>
    <span class="sr">${esc(label)}</span>
    <select id="${id}" class="dropdown">
      ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>
    <span class="control-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
  </label>`;
}

/** The sort dropdown offered on a note, brand or retailer page. The
 *  comparator itself and the option list are in demo/listSort.ts. */
function listSortControl(id: string, current: ListSort): string {
  return control(id, 'Sort fragrances', ICON_SORT, LIST_SORT_OPTIONS, current);
}

/**
 * The same control for browse and search, with the stock ranking kept as an
 * option rather than thrown away.
 *
 * "Most Stocked" leads because it is what this list already did — see
 * BrowseSort — so a reader who never opens this control sees exactly the page
 * they saw before it existed.
 */
function browseSortControl(current: BrowseSort): string {
  return control('browse-sort', 'Sort fragrances', ICON_SORT, [
    { value: 'stocked', label: 'Most Stocked' },
    ...LIST_SORT_OPTIONS,
  ], current);
}

/** Same tier filter Brands uses. Not offered on a brand's own page: every
 *  fragrance from one brand shares that brand's tier, so the filter would
 *  only ever show everything or nothing — never a real subset. */
function tierFilterControl(id: string, current: BrandFilter): string {
  return control(id, 'Filter by type', ICON_FILTER, [
    { value: 'all', label: 'All Types' },
    ...(['designer', 'niche', 'mideast'] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
  ], current);
}

/* ── shared pieces ───────────────────────────────────────────────────────── */

/**
 * The bottle size as shown beside a product's name, or the honest admission
 * that its own title cannot be read as one — see DemoFragrance.sizeMl's own
 * comment and sizeConflict in src/catalogue/fragranceId.ts.
 *
 * Worded as a fact about the site rather than the bottle ("not confirmed",
 * not "unknown size" or "0ml"): the shop stated a size, twice, and printing
 * neither number is not the same claim as the shop having said nothing —
 * that silence is what "Not stated" already means elsewhere on this page
 * (CONCENTRATION_NOT_STATED, GenderReading's own not-stated case), and
 * reusing that exact phrase here would flatten a real disagreement into a
 * blank. No hyphen, matching demo/legal.ts's own house style for
 * reader-facing text on this site.
 */
function sizeLabel(sizeMl: number | null): string {
  return sizeMl === null ? 'Size not confirmed' : `${sizeMl}ml`;
}

/**
 * Name, size and concentration as one block. The brand used to live here too,
 * but it is now its own clickable control (see `brandButton`) rendered
 * beside this rather than inside it — the fragrance tile wraps most of this
 * in a button already, and a button cannot nest another interactive element.
 *
 * Size and concentration ride on the right, smaller and quieter, vertically
 * centred against the name rather than hanging off the top. Used everywhere
 * a product appears so the same product reads identically in a rail, a list
 * row and a page heading.
 *
 * `nameRole` is the type role the name itself takes. In a tile or a row the
 * product is one object among many and reads as `.t-title`; on its own detail
 * page it *is* the page heading, so that one caller passes `.t-page`. Same
 * markup, same component, one role each — rather than a `.hero .phead-name`
 * override quietly inventing a fourth heading size.
 */
/*
 * `title` on the name is the last resort, not the fix. `.phead-name` clamps to
 * two lines, and demo/tileDensity.ts now keeps tiles wide enough that two
 * lines is nearly always the whole name — but "nearly always" is not always,
 * and the catalogue's longest names run past thirty words. Where the clamp
 * still bites, the full string is at least reachable with a pointer. The
 * tile's own button already carries `aria-label="<brand> <name>"`, so a screen
 * reader was never reading the clipped version.
 */
function productHead(f: DemoFragrance, tag = 'span', nameRole = 't-title'): string {
  return `<${tag} class="phead">
    <span class="phead-text">
      <span class="phead-name-wrap"><span class="phead-name ${nameRole}" title="${esc(f.name)}">${esc(f.name)}</span></span>
    </span>
    <span class="phead-meta t-caption">
      <span>${sizeLabel(f.sizeMl)}</span>
      <span>${esc(shortConcentration(f.concentration))}</span>
    </span>
  </${tag}>`;
}

/**
 * Brand name, clickable wherever a product appears, to that brand's own
 * profile page. A real `<button>`, styled to match the `.phead-brand` label
 * it replaces, so it is reachable and activatable by keyboard exactly like
 * every other control in the app — see the delegated `data-brand` handler.
 */
function brandButton(brand: string): string {
  // Single line with an ellipsis, by design — a wrapped pill stops reading as
  // a pill. `title` carries the rest: "FRENCH AVEN..." is what a narrow tile
  // was showing for French Avenue, and at the narrowest count the grid still
  // offers, a long house name will still not fit on one line of an 11px chip.
  return `<button type="button" class="phead-brand t-eyebrow" data-brand="${esc(brand)}" title="${esc(brand)}">${esc(brand)}</button>`;
}

/**
 * "Official Site" + "Fragrantica" under a fragrance's own title block —
 * item 11 of the 2026-08-20 backlog, centred per the owner's follow-up on
 * 2026-08-26. Reuses `.brand-site-link`, the exact pill brandView() already
 * renders for the brand-homepage link, so a pill here and the one on the
 * brand page are pixel-for-pixel the same control — same icon, same text
 * size, same shape — and the two pages still agree on what an official-site
 * link *looks like*.
 *
 * What deliberately differs is the row around it. brandView() sits its pill
 * left-aligned, flush with that page's own left-aligned heading. This row
 * centres (`.frag-links-row`'s own `justify-content`, not something
 * `.brand-site-link` carries) because the fragrance hero above it is already
 * a centred column — art, name and price boxes all centre themselves — and a
 * left-aligned row here would hang off the card's left edge on its own
 * rather than sitting under the rest of the hero the way it does everywhere
 * else. One pill and two pills both centre the same way, so the row still
 * reads as one deliberate line even on the many products with no Official
 * Site link.
 *
 * Official Site is absent (renders nothing) when `officialSiteFor` has no
 * entry for this brand — same rule brandView() already follows, never a
 * placeholder. Fragrantica always renders: it's a constructed search link,
 * not a lookup that can miss. See demo/fragranceLinks.ts for why each link
 * is scoped the way it is.
 */
function fragranceLinksBlock(f: DemoFragrance): string {
  const links = fragranceLinksFor(f.brand, f.name);
  return `<div class="frag-links-row">
    ${
      links.officialSite
        ? `<a class="brand-site-link" href="${esc(links.officialSite.url)}" target="_blank" rel="noopener nofollow">
             <span class="control-ico">${ICON_EXTERNAL}</span>
             <span>Official Site</span>
           </a>`
        : ''
    }
    <a class="brand-site-link" href="${esc(links.fragranticaSearchUrl)}" target="_blank" rel="noopener nofollow">
      <span class="control-ico">${ICON_EXTERNAL}</span>
      <span>Fragrantica</span>
    </a>
  </div>`;
}

function priceLine(f: DemoFragrance): string {
  const best = bestOffer(rowsFor(f));
  if (!best) return `<span class="amt none">Sold out</span>`;
  // One element, not a bare text node beside a span: .tile-price stacks its
  // children, so anything left loose would drop the arrow onto its own line.
  if (best.deliveredPriceGbp !== null) {
    return `<span class="amt">from ${formatGbp(best.deliveredPriceGbp)} <span aria-hidden="true">→</span></span>`;
  }
  // Only reachable when no shop with a stated delivery cost has it: the number
  // shown is the item price alone, and the line under it says so, because
  // "from £45" beside every other tile's delivered price would read as the
  // same kind of figure when it is not.
  return `<span class="amt">${formatGbp(best.itemPriceGbp)} <span aria-hidden="true">→</span></span>
    <span class="amt-note">delivery not stated</span>`;
}

/**
 * One tile in any grid of fragrances: the shape used for the home rail, and
 * for every browse, search, deals and retailer results list. The picture is
 * the point, sized at 90% of the tile in CSS, so this stays one component
 * rather than a compact row version and a spacious card version drifting
 * apart from each other.
 *
 * The badge names which shop the picture and price are actually from. It is
 * text, not a logo: reproducing a retailer's own mark is a trademark question
 * this project has no licence to answer, the same call already made for the
 * Retailers directory's monogram tiles.
 */
function fragranceTile(
  f: DemoFragrance,
  opts?: { rank?: number; trailing?: string; rail?: boolean },
): string {
  const rows = rowsFor(f);
  const best = bestOffer(rows);
  // No shop named once a fragrance is sold out everywhere. This used to fall
  // back to rows[0]'s retailer — the cheapest one on record even though it is
  // not buyable right now — but naming a shop under a "Sold out" tile reads as
  // "go here for it," which is exactly backwards for a shop that does not
  // currently have it. The placeholder below still holds the row's height, so
  // a sold-out tile is never shorter than an in-stock neighbour; it just
  // never claims a specific shop.
  const badgeRetailer = best?.retailer.name ?? null;
  // "from" when the figure above is a delivered price the shop won on against
  // others, "at" when it is that one shop's own item price with delivery not
  // stated — the same distinction priceLine already draws in its wording, so
  // the balloon and the number above it never disagree about what is being
  // shown.
  const badgePrefix = best && best.deliveredPriceGbp !== null ? 'from' : 'at';
  const medal = opts?.rank !== undefined && opts.rank < 3 ? MEDALS[opts.rank] : null;
  // The tile states no shop count. It used to print one — "Ranked at N shops",
  // the DemoFragrance.popularity figure the Most Stocked list is ordered on —
  // added so the list could not appear to contradict its own order after the
  // owner's report that "the no1 listing is less stocked than the no2 and no3".
  // That report was about the *ordering*, which is fixed where it belongs, in
  // BY_POPULARITY and the `.popularity` field itself (see demo/data.ts and
  // tests/byPopularity.test.ts). The line on the tile was the owner's own next
  // complaint: a fourth row of small grey text between the product and its
  // picture, on every tile of the two lists that carry it. The count is still
  // one click away on the fragrance's own page, under "Available at".
  // Two sibling buttons, not one wrapping the other: the brand's own control
  // and the rest of the tile (name, art, price, shop) each need their own
  // click and keyboard target, and a button cannot contain another button.
  return `<li${opts?.rail ? ' class="pop-item"' : ''}>
    <div class="tile">
      ${brandButton(f.brand)}
      <button class="tile-body" data-frag="${f.id}" aria-label="${esc(f.brand)} ${esc(f.name)}">
        ${productHead(f)}
        <span class="tile-art">
          ${medal ? `<span class="medal ${medal}" aria-label="Number ${opts!.rank! + 1} most popular">${opts!.rank! + 1}</span>` : ''}
          ${productArt(f.photoUrl, 'md', `${f.brand} ${f.name}`)}
        </span>
        <span class="tile-price">${opts?.trailing ?? priceLine(f)}</span>
        ${badgeRetailer ? `<span class="sold-by" title="${esc(`${badgePrefix} ${badgeRetailer}`)}"><span>${badgePrefix} ${esc(badgeRetailer)}</span></span>` : `<span class="sold-by" aria-hidden="true" style="visibility:hidden"><span>&nbsp;</span></span>`}
      </button>
    </div>
  </li>`;
}

/** The chooser's `<option>` list, shared with the resize path below. */
function perRowOptions(choices: number[], current: number): string {
  return choices
    .map((n) => `<option value="${n}" ${n === current ? 'selected' : ''}>${n} Per Row</option>`)
    .join('');
}

/** The per-row chooser. Empty on mobile, where the count is not the reader's. */
function perRowControl(): string {
  if (state.layout !== 'desktop') return '';
  const choices = offeredPerRow();
  // One option is not a choice, and a dropdown that cannot be changed is worse
  // than no dropdown: the same reasoning that keeps the control off mobile.
  if (choices.length < 2) return '';
  return `<label class="control">
    <span class="control-ico">${ICON_GRID}</span>
    <span class="sr">Tiles per row</span>
    <select id="per-row" class="dropdown">
      ${perRowOptions(choices, effectivePerRow())}
    </select>
    <span class="control-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
  </label>`;
}

/**
 * Keep the chooser honest while the window is being dragged.
 *
 * Patched in place rather than re-rendered, for the reason the `per-row`
 * change handler already gives: the grid reads a CSS variable, so the columns
 * reflow on their own, and repainting several hundred tiles mid-drag (and
 * resetting how far down a chunked list the reader had got) buys nothing. A
 * full render is only asked for in the one case a patch cannot cover — the
 * window widening past the point where a chooser is worth showing at all.
 */
function syncPerRowControl(): void {
  applyPerRow();
  const choices = offeredPerRow();
  const wanted = choices.length > 1 ? choices : [];
  const select = document.getElementById('per-row') as HTMLSelectElement | null;
  if (!select) {
    if (wanted.length > 0 && state.layout === 'desktop' && document.querySelector('.tile-grid')) render();
    return;
  }
  if (wanted.length === 0) {
    // On a results list the chooser is alone in its own .controls row, which
    // carries 22px of margin and would be left holding nothing; on Deals it
    // shares that row with the sort control and the facets, which must stay.
    const label = select.closest('.control');
    const row = label?.parentElement;
    label?.remove();
    if (row?.classList.contains('controls') && row.children.length === 0) row.remove();
    return;
  }
  const current = effectivePerRow();
  if (Array.from(select.options).map((o) => Number(o.value)).join(',') !== wanted.join(',')) {
    select.innerHTML = perRowOptions(wanted, current);
  }
  select.value = String(current);
}

/**
 * Every tile grid on the site: browse, search, deals, a retailer's, a brand's
 * and a note's own list. One tile shape and one chooser above it, whatever the
 * list is of — the Most Stocked list once rendered a shop count on each of its
 * tiles that no other list carried, and it no longer does (see fragranceTile).
 */
function fragranceList(list: DemoFragrance[], empty: string): string {
  if (list.length === 0) return `<p class="empty-note t-body">${esc(empty)}</p>`;
  const control = perRowControl();
  return `${control ? `<div class="controls">${control}</div>` : ''}
    <ul class="tile-grid">${chunked(list, fragranceTile)}</ul>`;
}

/* ── home ────────────────────────────────────────────────────────────────── */

const MEDALS = ['gold', 'silver', 'bronze'] as const;

/**
 * Microcopy cull, 2026-08-25 (docs/MICROCOPY-INVENTORY-2026-08-21.md row 5).
 *
 * This note used to open "Tell us what you would like to see." That sentence
 * asked for nothing the reader had not been asked for twice already: the
 * heading directly above it says "Got an idea?" and the first field is
 * labelled "Your suggestion". What is left is the half carrying a fact — that
 * Send hands the message to the reader's own email client rather than posting
 * it anywhere — which is not inferable from looking at the form, and which a
 * reader who expects a web form to submit somewhere is entitled to know
 * before they type into it.
 */
const SUGGEST_NOTE =
  'There is no server behind this page, so sending opens your own email app with this addressed and ready to go.';

function homeView(): string {
  return `
    <section class="intro">
      <div class="hero-logo">
        <p class="hero-wordmark">Price<em>Sniffs</em></p>
        <p class="hero-by">by YannySniffs</p>
      </div>
      <p class="hero-mission">The only tool you need to find the best price on any fragrance.</p>
      <p class="intro-points">
        <span>Delivery Costs Reflected</span>
        <span>Real and Live Prices</span>
        <span>No Promoted Listings</span>
      </p>
      <p class="db-count">Current Database: ${DEMO_FRAGRANCES.length.toLocaleString('en-GB')} fragrances
        <span class="live-dot" aria-hidden="true"></span><span class="sr-only"> (live)</span></p>
    </section>

    <section class="pop-section">
      <div class="section-head">
        <h3 class="t-section">Most stocked</h3>
        <button class="link-btn see-top" data-browse>See Top ${TOP_N} <span aria-hidden="true">→</span></button>
      </div>
      <ul class="pop-rail">
        ${POPULAR.map((f, i) => fragranceTile(f, { rank: i, rail: true })).join('')}
      </ul>
    </section>

    <div class="bottom-split">
      <section class="suggest-section">
        <h3 class="t-section">Got an idea?</h3>
        <p class="panel-note t-body">${SUGGEST_NOTE}</p>
        <form id="home-suggest-form" class="contact-form">
          <label class="field">
            <span>Your suggestion</span>
            <textarea id="home-suggest-body" rows="3" placeholder="What should we add or change?"></textarea>
          </label>
          <label class="field">
            <span>Your name <span class="dimmer">(optional)</span></span>
            <input id="home-suggest-name" type="text" placeholder="So we know who to thank" />
          </label>
          <label class="field">
            <span>Your email <span class="dimmer">(optional, if you would like a reply)</span></span>
            <input id="home-suggest-email" type="email" placeholder="you@example.com" />
          </label>
          <button type="submit" class="contact-send">Send</button>
        </form>
        <p id="home-suggest-confirm" class="contact-confirm" hidden></p>
      </section>

      <section class="updates-section">
        <h3 class="t-section">Update History</h3>
        <ul class="updates-list">
          ${CHANGELOG.map(
            (entry) => {
              const isPrelaunch = entry.version.startsWith('v0.');
              return `<li class="update-entry${isPrelaunch ? ' prelaunch' : ''}">
                <p class="update-head">
                  <span class="update-version">${esc(entry.version)}</span>
                  <span class="update-date">${esc(entry.date)}</span>
                </p>
                <p class="update-title">${esc(entry.title)}</p>
                <ul class="update-points">
                  ${entry.points.map((p) => `<li>${esc(p)}</li>`).join('')}
                </ul>
              </li>`;
            },
          ).join('')}
        </ul>
      </section>
    </div>`;
}

/* ── browse ──────────────────────────────────────────────────────────────── */

function visibleFragrances(): DemoFragrance[] {
  const q = state.query.trim().toLowerCase();
  // No brand and no query means this is the leading Most Stocked list rather
  // than a brand page or a search, and oils are kept out of that one list (see
  // isOil). Dropped here rather than at the slice in browseView so the facet
  // counts and the row count agree with what is actually listed — a facet
  // offering "17 Perfume Oil" on a page that shows none is worse than either.
  const isTop = !state.brand && !q;
  return BY_POPULARITY.filter((f) => {
    if (isTop && isOil(f)) return false;
    if (state.brand && f.brand !== state.brand) return false;
    if (!q) return true;
    return `${f.brand} ${f.name} ${f.concentration}`.toLowerCase().includes(q);
  });
}

function browseView(): string {
  const filtered = visibleFragrances();
  const faceted = applyFacets(filtered);
  // With no brand or query in play this is the leading list, which is capped:
  // an 879 row wall is not a starting point anyone can use.
  const isTop = !state.brand && !state.query.trim();
  // The cap is applied *before* the chosen sort, deliberately. Sorting the
  // whole catalogue by price and then taking 50 would show the fifty cheapest
  // bottles on the site, which is a different page from the one this is; the
  // cap picks the fifty most stocked, and the sort then arranges those fifty.
  // On a search or a brand there is no cap and the distinction does not arise.
  const capped = isTop ? faceted.slice(0, TOP_N) : faceted;
  const list = state.browseSort === 'stocked' ? capped : sortFragrances(capped, state.browseSort);
  const title = state.brand ?? (state.query.trim() ? `Results for "${state.query.trim()}"` : `Most stocked`);

  return `
    <button class="back" data-back-home>Back</button>
    <div class="page-head"><h2 class="t-page">${esc(title)}</h2><span class="count t-count">${list.length}</span></div>
    ${
      isTop && state.browseSort === 'stocked'
        ? `<p class="panel-note t-body">Ranked by how many of our ${SHOP_COUNT} shops carry each one — not counting
             a brand's own store, which says nothing about how far the market has picked it up — then by brand
             and name where that ties. Oils are not listed here. This is stock breadth, not a measure of
             what sells: nothing here counts views or purchases, so it is never presented as if it did.</p>`
        : isTop
          ? `<p class="panel-note t-body">The ${TOP_N} most stocked fragrances, in the order you chose. Oils are
               not listed here.</p>`
          : ''
    }
    <div class="controls">
      ${browseSortControl(state.browseSort)}
      ${facetsBlock(filtered)}
    </div>
    ${fragranceList(list, 'Nothing here matches that search.')}`;
}

/* ── detail ──────────────────────────────────────────────────────────────── */

/**
 * What the leading row may be called, in the three or four words a tag holds.
 *
 * "Cheapest" is a superlative and only survives when the evidence supports it.
 * The two weaker labels are not hedges for their own sake: each says exactly
 * what the number beside it is. "Lowest total" is the lowest delivered price we
 * can compute, on figures one of which is not confirmed. "Lowest item price" is
 * a bottle price with no delivery in it at all.
 */
function cheapestTag(v: CheapestVerdict): string | null {
  if (!v.offer) return null;
  if (v.decided) return 'Cheapest';
  return v.reason === 'delivery-unstated' ? 'Lowest item price' : 'Lowest total';
}

/**
 * The MSRP comparison for one row, or null where it does not apply.
 *
 * Two things have to both be true: the fragrance's own house has to be
 * stocked here at all (`frag.houseCeiling` set — see CatalogueEntry, 852 of
 * 14,784 products measured 2026-08-26) and this particular shop's price has
 * to differ from it by at least a whole percent (`msrpComparison` returns null
 * otherwise, which is what keeps "0% below MSRP" off the page).
 *
 * The house's own row is excluded on top of that. Comparing armaf.uk's price
 * against armaf.uk's own ceiling is either meaningless (they are the same
 * offer) or, where the house is mid-sale, would double up on the ordinary
 * `wasPrice` strikethrough that row already earns through the ordinary
 * corroboration pipeline if the market does not contradict it — see test
 * zero's own note that a house's claim about its own bottle is still judged
 * by the two market tests. The `singleBrandOnly` + `cannotCarryBrand` pair is
 * exactly build-demo-catalogue.ts's own test for "is this offer the bottle's
 * house", reused here rather than re-derived.
 *
 * Until 2026-09-01 this returned `buildHouseAnchor`'s `HouseAnchorDisplay`,
 * which by contract is null whenever the house is *not* the dearer side — so
 * a shop charging above the house's own price rendered nothing where the
 * comparison was at its most useful. 55 of the 411 comparable rows in today's
 * catalogue are exactly that; see demo/msrpComparison.ts for the counts and
 * for why widening `buildHouseAnchor` itself was the wrong place to fix it.
 * `row.itemPriceGbp` is unchanged and remains the only price handed to the
 * comparison — never `deliveredPriceGbp`, which would put a bottle-plus-
 * postage figure up against a bottle-only one.
 */
function msrpFor(row: PresentedOffer, frag: DemoFragrance): MsrpComparison | null {
  if (frag.houseCeiling === null) return null;
  if (row.retailer.singleBrandOnly && !cannotCarryBrand(row.retailer, frag.brand)) return null;
  return msrpComparison(row.itemPriceGbp, frag.houseCeiling);
}

/**
 * `isBest` marks the row the comparison put first. `bestTag` is what that row
 * is allowed to be *called*, which is a different question and is answered by
 * cheapestVerdict: when an unverified delivery figure is what puts this row in
 * front, the accent and the ordering stay — it is still our best reading — and
 * only the superlative goes.
 *
 * `msrp` is the MSRP comparison from `msrpFor`, computed by the caller (it
 * needs the fragrance record, which this function does not otherwise take).
 * Where it applies it *replaces* the shop's own `wasPrice` strikethrough on
 * this row rather than sitting beside it: measured 2026-08-26, 72 of the 325
 * offers a house anchor reaches also carry a kept, corroborated retailer RRP
 * (FragranceHub's RRP £29.95 on Armaf Club De Nuit Intense Man EDT 105ml,
 * under armaf.uk's own £37.99, is exactly this case). Two reference prices on
 * one row would ask the reader to decide which is real, and the house's own
 * figure is the stronger evidence of the two — it is what test zero already
 * elevates above market corroboration when the two disagree, so the render
 * follows the same ordering rather than inventing a second one. Nothing here
 * touches the offer's real `wasPrice` field or the verdict that produced it; a
 * row not chosen for display keeps its own strikethrough on every other page
 * that reads `row.discount` directly.
 *
 * That rule now covers an "above MSRP" row too, and it has to: a row reading
 * "20% off RRP" beside "30% above MSRP" is the two-contradicting-reference-
 * prices problem in its sharpest form. No row in today's catalogue is in that
 * state — 0 of the 55 above-MSRP rows carries a surviving retailer RRP,
 * measured 2026-09-01 — but the rule is written for the case rather than for
 * today's data.
 *
 * ── The second price line ───────────────────────────────────────────────────
 *
 * `.now` is the *total* — delivered where the shop states a delivery cost. The
 * MSRP percentage is not computed from that number and never was: both
 * `msrpFor` and `buildDiscount` take the item price alone. Printed on their
 * own two lines apart, as they were until 2026-09-01, the two invited exactly
 * the wrong arithmetic — Perfume Click's Azzure Aoud row showed "£32.20" above
 * "2% below MSRP", and 2% of £32.20 is not what produced that 2%; £29.25
 * against the house's £30.00 is. So the percentage now sits on the same line
 * as the price it was actually derived from, which is the whole point of the
 * line: "£29.25 · 2% below MSRP" can be checked against the MSRP box at the
 * top of the page by anyone who cares to.
 *
 * The item price is printed there only when it is not already the number
 * above. Where the shop states no delivery cost, or states free delivery,
 * `.now` *is* the item price (see PresentedOffer.deliveredPriceGbp: it is
 * never filled in from the item price), so repeating it would put the same
 * figure twice in two type sizes and imply two different prices where there is
 * one. On those rows the line carries the percentage alone, and it is still
 * sitting directly under the figure it was computed from. 12,927 of the 22,402
 * offer rows in the catalogue have a delivered price that genuinely differs
 * from their item price and so do print both.
 */
function offerRow(
  row: PresentedOffer,
  isBest: boolean,
  bestTag: string | null = 'Cheapest',
  msrp: MsrpComparison | null = null,
): string {
  const d = msrp ? null : row.discount;
  // The total on the row's first line. Only ever a delivered price where the
  // shop actually states a delivery cost — never the item price wearing a
  // delivered price's clothes.
  const totalGbp = row.deliveredPriceGbp ?? row.itemPriceGbp;
  // See the header: the second line names the bottle price only where that is
  // a different number from the total above it.
  const showsItemPrice = row.itemPriceGbp !== totalGbp;
  // A shop that has never published a standard delivery rate gets said out
  // loud, the same way "No longer stocked" is. Anything quieter — a blank, a
  // "Free delivery", a £0 — would be us filling in a number the shop has not
  // given, and this row is deliberately never the cheapest one as a result.
  const deliveryUnknown = row.delivery.costGbp === null;
  // Delivery figures we have not read off the shop's own delivery page are
  // marked as such wherever they are shown. The registry has always recorded
  // which is which (shipping.confidence); until now the screen did not, so an
  // unverified £2.99 and a confirmed £3.99 arrived at the reader looking
  // identically solid. Two thirds of live listings are in the first group, so
  // this is the ordinary case rather than a rare caveat.
  const unconfirmed = !deliveryUnknown && !row.delivery.confirmed;
  const sub: string[] = [
    deliveryUnknown
      ? 'Delivery not stated'
      : row.delivery.isFree
        ? `Free delivery${unconfirmed ? ' (not confirmed with the shop)' : ''}`
        : `plus ${formatGbp(row.delivery.costGbp!)} delivery${unconfirmed ? ' (not confirmed with the shop)' : ''}`,
  ];
  if (row.delivery.spendMoreForFreeGbp !== null) {
    sub.push(`${formatGbp(row.delivery.spendMoreForFreeGbp)} more for free postage`);
  }
  // The page-level "checked N ago" caption above the offer list (see
  // detailView) reports the *freshest* row's age, which is exactly the fact
  // that let John Lewis's four stale prices render with nothing beside them
  // saying so — a reader glancing at "checked 2h ago" had no way to know one
  // specific row was 11 days old. Said on the row it actually applies to
  // instead, and only there: every fresh row already reads as current from
  // that shared caption, so repeating an age on every line would bury the
  // one that matters.
  if (row.stale) {
    sub.push(`price last confirmed ${age(row.ageSeconds)}`);
  }
  // This retailer's own published rating for this listing — read from its
  // schema.org aggregateRating (src/catalogue/jsonld.ts), never computed and
  // never borrowed from a different shop's rating of the same fragrance.
  // Fragrantica's own ratings are off limits (its ToS forbids scraping them,
  // see docs/SCRAPING.md); this is the legitimate substitute, shown only
  // where a retailer actually publishes one.
  if (row.rating) {
    sub.push(
      `★ ${row.rating.value.toFixed(1)}${row.rating.count !== null ? ` (${row.rating.count})` : ''}`,
    );
  }

  return `<li class="offer ${isBest ? 'best' : ''} ${row.isPurchasable ? '' : 'unavail'}">
    <a class="offer-link" href="${esc(row.outboundUrl)}" rel="nofollow noopener" target="_blank">
      <span class="offer-top">
        <span class="shop t-title">${esc(row.retailer.name)}${
          isNewAt(row.variantId, row.retailer.id) ? '<span class="tag new">New</span>' : ''
        }${
          isBest && bestTag
            ? `<span class="tag ${bestTag === 'Cheapest' ? '' : 'unsure'}">${esc(bestTag)}</span>`
            : ''
        }</span>
        <span class="price">
          ${
            // A row carrying an MSRP comparison shows no reference figure here
            // at all. Until 2026-08-26 it rendered "£37.99 at Armaf" beside the
            // price; the owner asked for the house price off the row, and the
            // percentage on the second line below carries the comparison on its
            // own. Note the `msrp ? ... : d ? ...` shape is kept rather than
            // collapsed to `d ? ...`: such a row must still suppress the shop's
            // own RRP strikethrough (see this function's header — two reference
            // prices on one row is the thing that must not happen), and
            // dropping the branch would put it straight back.
            msrp
              ? ''
              : d
                ? `<span class="was">RRP ${formatGbp(d.wasPrice)}</span>`
                : ''
          }
          <span class="now t-price ${
            // The saving ink, and only for a saving. A retailer promotion and a
            // price under the house's own are both good news for the reader and
            // both earn it; a price *above* MSRP is the same news inverted and
            // must not be painted as a bargain, so `direction` is checked here
            // rather than the comparison merely existing.
            d || msrp?.direction === 'below' ? 'sale' : ''
          }">${formatGbp(totalGbp)}<span class="del-note${
            deliveryUnknown ? ' excl' : ''
          }">${esc(deliveryPriceNote(row.delivery))}</span></span>
        </span>
      </span>
      <span class="offer-bot">
        <span class="facts t-caption">
          <span class="dot ${STOCK_CLASS[row.stock]}"></span>${STOCK_LABEL[row.stock]}
          <span class="sep">·</span>${esc(sub.join(' · '))}
        </span>
        <span class="alone">${
          // The bottle price on its own, beside the comparison actually
          // computed from it. See this function's header for why it is omitted
          // where it would only repeat the total above.
          showsItemPrice
            ? `<span class="alone-price t-price">${formatGbp(row.itemPriceGbp)}</span>`
            : ''
        }${
          // "below MSRP" rather than "below Armaf" (owner's wording,
          // 2026-08-26). The figure is unchanged and still the house's own
          // ceiling for this size; MSRP is the word the box at the top of the
          // page already uses for that same number, so the row and the box name
          // the reference the same way instead of two different ways. "above"
          // is the same sentence about the same figure pointing the other way,
          // and is given its own ink (.off.over) so the two can never be
          // skimmed as the same claim.
          msrp
            ? `<span class="off anchor${
                msrp.direction === 'above' ? ' over' : ''
              }">${msrpComparisonLabel(msrp)}</span>`
            : d
              ? `<span class="off">${d.percentOff}% off RRP</span>`
              : ''
        }</span>
      </span>
      ${
        d && canShowCountdown(d)
          ? `<span class="offer-bot"><span class="ends">Offer ${esc(countdown(d.endsAt!))}</span></span>`
          : ''
      }
    </a>
  </li>`;
}

/**
 * The shops with no listing for this fragrance at all, not even a sold out
 * one, as one line of names.
 *
 * Until 2026-08-26 this was a `<ul class="offers">` of full-height rows, one
 * per shop, each carrying a name and a "&minus;" where a price would be. The
 * registry holds 79 shops and a fragrance is listed by a handful of them, so
 * that was routinely 50-plus rows of identical furniture below the chart,
 * styled exactly like the rows above that *are* offers. The owner asked for
 * a single line of smaller text
 * instead, which is the right weight for what this section actually says:
 * these shops were checked and none of them has it.
 *
 * Until 2026-08-26 each name went out to `Retailer.homepage` — the shop's own
 * front page. That field is still what a few build/harvest scripts use to
 * find a shop's site (see e.g. src/catalogue/robotsSource.ts), but it is the
 * wrong destination *here*: this whole section exists to say "checked, not
 * stocked", so a click out to the shop's homepage lands a reader on a page
 * that has never heard of this fragrance — a dead end we sent them to. Our
 * own `/retailers/<id>` page is the better answer to the same click: it says
 * what that shop *does* stock and what its delivery terms are, which is
 * useful even though this one bottle is not among them.
 *
 * Internal, not outbound, so these are `data-retailer` buttons — the same
 * click-delegated pattern the shop directory (`retailersPanel`) and every
 * other id-scoped internal link in this file already uses (the document
 * click handler below matches `[data-retailer]`, sets `state.retailerId`,
 * and routes to the retailer view). No id-scoped internal link in this app
 * is a plain `<a href>` — routing here is client-side against
 * `location.pathname`, and a real anchor pointing at a route this document
 * also serves would risk a full page reload if a click ever slipped past the
 * delegated handler. `.unavail-shop` strips the browser's own button
 * chrome back down to the underlined-text look the old `<a>` had.
 *
 * Not every shop gets a button, though. A shop only has a real page to send
 * a reader to when build-sitemap.ts would list one for it: `enabled` and
 * carrying at least one live offer somewhere in the catalogue (`Retailer.
 * enabled` and `listingCountAt(r.id) > 0` — the exact test that script
 * runs). Measured against the registry on 2026-08-26: 32 of the 79 shops
 * clear that bar, 47 don't — mostly the 46 disabled retailers, plus a
 * handful of enabled ones still waiting on their first successful crawl
 * (Notino, Boots, The Fragrance Shop, The Perfume Shop, Harvey Nichols,
 * Riiffs, Debenhams). Those render as plain text: a page that would show "0
 * fragrances here" is the same dead end the homepage link was, just hosted
 * by us instead of them.
 */
function unavailableShopsLine(shops: Retailer[]): string {
  // Comma-separated rather than one-per-line: the names are the content and
  // the separator should cost as little vertical space as possible. The list
  // wraps as ordinary text, so it is 3-4 lines at 390px instead of 50-plus
  // rows, and it stays in alphabetical order (the caller sorts).
  const names = shops
    .map((r) =>
      r.enabled && listingCountAt(r.id) > 0
        ? `<button type="button" class="unavail-shop" data-retailer="${esc(r.id)}">${esc(r.name)}</button>`
        : `<span class="unavail-shop-plain">${esc(r.name)}</span>`,
    )
    .join(', ');
  return `<p class="unavail-shops t-caption">${names}</p>`;
}

/** "6 Aug" — enough to place a point in time without crowding a small chart. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * The historical cheapest-price line for one fragrance, reconstructed from
 * real harvest commits — see scripts/build-price-history.ts for how. Omitted
 * entirely below two real points: a single dot has no trend to show, and
 * showing one anyway would read as a chart implying history that is not
 * there. priceHistoryChart below replaces the chart with an honest sentence
 * instead in that case — see priceHistoryGapMessage's own header for why
 * there are three different sentences rather than one generic one.
 *
 * dayKey, DailyHistoryPoint and dailyHistory itself live in
 * src/services/priceHistoryDaily.ts, not here: that is the one piece of this
 * chart with real decision logic in it (the carry forward rule, and the gap
 * that used to be able to break it), and living in src/ makes it a plain,
 * testable function rather than a private closure in this file.
 */

/**
 * The first and last calendar day any price was recorded for anything — the
 * shared x-axis every chart is drawn on, so two fragrances' charts sit on the
 * same timeline and can be compared by eye. Computed once from the generated
 * history rather than hardcoded, so it extends itself as the site ages.
 *
 * Every point is scanned rather than just each list's ends: the rest of this
 * file assumes those lists are in commit order, and that assumption being
 * wrong anywhere would silently mis-scale the axis on every chart at once.
 */
const HISTORY_SPAN: { first: string; last: string } | null = (() => {
  let first: string | null = null;
  let last: string | null = null;
  for (const series of Object.values(PRICE_HISTORY)) {
    for (const p of series) {
      // Gap markers (priceGbp: null) carry a real timestamp too, but they
      // never widen the axis on their own — they only ever fall between two
      // real readings that already bound the same span.
      if (p.priceGbp === null) continue;
      const key = dayKey(p.at);
      if (first === null || key < first) first = key;
      if (last === null || key > last) last = key;
    }
  }
  return first !== null && last !== null ? { first, last } : null;
})();

/**
 * ── Why the dots are not SVG circles ──────────────────────────────────────
 * The chart's own svg stretches non-uniformly to fill whatever width its
 * column happens to be (`preserveAspectRatio="none"`, needed so the line
 * fills the full card width rather than staying locked to its viewBox's own
 * aspect ratio). That stretch also warps a `<circle>`'s fill into an
 * ellipse the moment the rendered box's aspect ratio differs from the
 * viewBox's, which it usually does. Percent-positioned HTML dots, laid over
 * the svg rather than inside it, size themselves in real CSS pixels and
 * stay perfectly round regardless of how the chart around them stretches.
 */
/**
 * The scopes offered above the chart, longest name first for the reader and
 * shortest window first in the control.
 *
 * Days, not calendar months or years, because the axis is built by counting
 * days forward from a start key — a "this month" that meant "since the 1st"
 * would be one day long on the 2nd and thirty-one on the 31st, which makes
 * the same chart mean something different depending on when it is opened.
 */
const HISTORY_SCOPES = [
  { id: 'week', label: 'This week', days: 7 },
  { id: 'month', label: 'This month', days: 30 },
  { id: 'year', label: 'This year', days: 365 },
] as const;

/** Shift a YYYY-MM-DD key by a whole number of days. */
function shiftDayKey(key: string, days: number): string {
  return dayKey(new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString());
}

/**
 * The replacement for the chart when there is no line to draw. Renders into
 * the exact same slot under the exact same "Price history" heading the
 * chart itself uses, so a page that used to carry a chart never goes from a
 * heading and a line to nothing at all — it goes from a line to one honest
 * sentence about why there is not one. See src/services/priceHistoryGaps.ts
 * for what each of the four reasons says and why a single generic sentence
 * would misstate most of them.
 */
function priceHistoryGapBlock(gap: PriceHistoryGap): string {
  return `<div class="history-block" data-history-block>
    <p class="gone-head t-eyebrow">Price history</p>
    <p class="history-empty t-caption">${esc(priceHistoryGapMessage(gap))}</p>
  </div>`;
}

function priceHistoryChart(f: DemoFragrance, isCurrentlyPurchasable: boolean): string {
  const raw = priceHistoryFor(f.id);
  // Gap markers (priceGbp: null — see scripts/build-price-history.ts) never
  // count towards the two-point bar on their own; only real prices do.
  const realPoints = raw.filter((p) => p.priceGbp !== null);
  if (realPoints.length < 2 || HISTORY_SPAN === null) return priceHistoryGapBlock(priceHistoryGapFor(f.id));

  // Where this fragrance's own record starts, rather than where the site's
  // does. Previously every chart was drawn across the whole site history, so
  // a fragrance first seen last week opened with a fortnight of empty floor
  // before its line began — space that said nothing except that other
  // fragrances are older.
  const ownFirstDay = realPoints.map((p) => dayKey(p.at)).sort()[0] ?? HISTORY_SPAN.first;

  // Every scope ends on the site's most recent day, not this fragrance's, so
  // the right-hand edge is always today's price for anything still on sale —
  // the carry-forward in dailyHistory is what fills the gap, and it stops at
  // the last sighting for anything that has since sold out.
  const to = HISTORY_SPAN.last;

  const panels = HISTORY_SCOPES.map((scope) => {
    const windowStart = shiftDayKey(to, -(scope.days - 1));
    const from = windowStart > ownFirstDay ? windowStart : ownFirstDay;
    const points = dailyHistory(raw, from, to, isCurrentlyPurchasable);
    return { scope, points, body: priceHistoryBody(points, isCurrentlyPurchasable) };
  });

  // A scope with fewer than two real readings inside it has nothing to draw,
  // so it is offered as a disabled control rather than silently missing: the
  // reader can see that "this week" exists and simply has too little in it.
  const usable = panels.filter((p) => p.body !== null);
  // realPoints.length >= 2 got this fragrance past the guard above, but that
  // counts raw readings, not distinct calendar days — every scope's window
  // spans this fragrance's whole own history (see ownFirstDay above, and
  // HISTORY_SCOPES' longest window being a year against a site under a year
  // old), so if every real reading still collapsed onto a single day inside
  // it (a price that changed twice in one day and never again), no scope
  // has two distinct days to draw a line between. Measured on 2026-08-26:
  // 17 of 5,455 chartable fragrances hit this. Named rather than left blank,
  // for the same reason the two point guard above is.
  if (usable.length === 0) {
    const latest = realPoints.at(-1)!;
    return priceHistoryGapBlock({ reason: 'same-day', priceGbp: latest.priceGbp!, retailerId: latest.retailerId!, at: latest.at });
  }
  // Default to the shortest scope that actually has a line in it. Asking for
  // "this week" and getting an empty frame would read as a broken chart.
  const active = usable[0]!;

  const tabs = panels
    .map((p) => {
      const on = p.scope.id === active.scope.id;
      const dead = p.body === null;
      return `<button
        type="button"
        class="history-scope${on ? ' is-on' : ''}"
        data-history-scope="${p.scope.id}"
        aria-pressed="${on}"
        ${dead ? 'disabled aria-disabled="true" title="Not enough recorded prices in this range"' : ''}
      >${esc(p.scope.label)}</button>`;
    })
    .join('');

  const bodies = panels
    .filter((p) => p.body !== null)
    .map((p) => `<div class="history-panel" data-history-panel="${p.scope.id}"${p.scope.id === active.scope.id ? '' : ' hidden'}>${p.body}</div>`)
    .join('');

  return `<div class="history-block" data-history-block>
    <div class="history-head">
      <p class="gone-head t-eyebrow">Price history</p>
      <div class="history-scopes" role="group" aria-label="Price history range">${tabs}</div>
    </div>
    ${bodies}
  </div>`;
}

/**
 * One chart, for one already-windowed run of days. Returns null when the
 * window holds too little to draw honestly.
 *
 * Split out of priceHistoryChart so the same drawing code serves every scope
 * — three windows over the same data, not three near-copies of a chart.
 */
function priceHistoryBody(
  points: DailyHistoryPoint[],
  isCurrentlyPurchasable: boolean,
): string | null {
  // Two days on which a price was actually *read* — not two days that have a
  // price. The axis below now always spans the site's whole history, so
  // points.length is identical for every fragrance and tests nothing; and
  // counting priced days instead would wave through a fragrance seen exactly
  // once, whose single reading then carries flat to today. That flat line
  // would imply a price held steady for a fortnight when it was measured on
  // one afternoon. Same bar as before this chart gained a full calendar
  // axis: at least two real readings, or no chart.
  const priced = points.filter((p) => p.priceGbp !== null);
  if (points.filter((p) => p.priceGbp !== null && !p.isCarried).length < 2) return null;

  const W = 600;
  const H = 160;
  const PAD_X_PCT = 1.3;
  const PAD_Y_PCT = 8.75;

  // Scaled off real prices only. Letting the no-price days into this would
  // drag every chart's floor to zero and squash the actual price movement —
  // the thing the chart exists to show — into a flat line at the top.
  const prices = priced.map((p) => p.priceGbp!);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  // A flat line (every point the same price) would divide by zero placing y;
  // treated as its own one-point-wide band, centred, rather than crashing.
  const spanP = maxP - minP || 1;
  const lastIndex = points.length - 1;
  // The most recent day that has a real or carried price — where the "this is
  // the current price" dot belongs. On a sold-out fragrance that is no longer
  // the right-hand edge of the chart, because the days since are blank.
  const lastPricedIndex = points.reduce((acc, p, i) => (p.priceGbp !== null ? i : acc), -1);

  const xPct = (i: number): number => PAD_X_PCT + (i / (lastIndex || 1)) * (100 - PAD_X_PCT * 2);
  const yPct = (p: number): number => PAD_Y_PCT + (1 - (p - minP) / spanP) * (100 - PAD_Y_PCT * 2);
  // Where a day with no price sits: on the chart's own floor. Visually "at
  // zero" without claiming a price of zero — see DailyHistoryPoint.priceGbp.
  const yFloorPct = 100 - PAD_Y_PCT;

  // The line is drawn in runs of consecutive priced days and breaks across
  // the blank ones. Joining across a gap would draw the price plunging to the
  // floor and back — a crash and recovery that never happened.
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  points.forEach((p, i) => {
    if (p.priceGbp === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      return;
    }
    run.push([(xPct(i) / 100) * W, (yPct(p.priceGbp) / 100) * H]);
  });
  if (run.length > 0) runs.push(run);

  const asPath = (seg: [number, number][]): string =>
    seg.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const linePath = runs.map(asPath).join(' ');
  // Filled area under the line, purely decorative, closed back along the
  // baseline rather than the data — never read as a second data series. One
  // closed shape per run, for the same reason the line breaks.
  const baseY = (yFloorPct / 100) * H;
  const areaPath = runs
    .filter((seg) => seg.length >= 2)
    .map((seg) => `${asPath(seg)} L${seg.at(-1)![0].toFixed(1)},${baseY.toFixed(1)} L${seg[0]![0].toFixed(1)},${baseY.toFixed(1)} Z`)
    .join(' ');

  const dots = points
    .map((p, i) => {
      if (p.priceGbp === null) {
        // A day with nothing to report: grey, on the floor, and it says so
        // rather than showing a price. Not focusable as a data point would
        // be — there is no datum here — but still hoverable/tappable so the
        // reader can find out why the line stops.
        const label = `No price recorded, ${shortDate(`${p.dateKey}T00:00:00Z`)}`;
        return `<button
        type="button"
        class="history-dot history-dot-nodata"
        style="left:${xPct(i).toFixed(2)}%;top:${yFloorPct.toFixed(2)}%"
        data-price="No price recorded"
        data-retailer=""
        data-date="${esc(shortDate(`${p.dateKey}T00:00:00Z`))}"
        aria-label="${esc(label)}"
      ></button>`;
      }
      const isLast = i === lastPricedIndex;
      // The pulse means "this is a live price right now", so it only belongs
      // on the final point when the fragrance is actually purchasable this
      // moment — a fragrance that has since sold out everywhere still gets
      // its last known point marked as the most recent (bigger, filled), just
      // without a live animation implying a currency this data no longer has.
      const isLive = isLast && isCurrentlyPurchasable;
      const retailerName = esc(getRetailer(p.retailerId!)?.name ?? p.retailerId!);
      const dateLabel = p.isCarried ? `unchanged since ${shortDate(p.recordedAt!)}` : shortDate(p.recordedAt!);
      const label = `${formatGbp(p.priceGbp)} at ${retailerName}, ${dateLabel}`;
      return `<button
        type="button"
        class="history-dot${isLast ? ' history-dot-last' : ''}${isLive ? ' history-dot-live' : ''}"
        style="left:${xPct(i).toFixed(2)}%;top:${yPct(p.priceGbp).toFixed(2)}%"
        data-price="${esc(formatGbp(p.priceGbp))}"
        data-retailer="${retailerName}"
        data-date="${esc(dateLabel)}"
        aria-label="${label}"
      ></button>`;
    })
    .join('');

  // A label under every single day would overlap on anything but a very
  // short history, so a small, even sample is picked instead — always the
  // first and last day (the range's own edges), spread no closer than
  // MAX_LABELS apart in between.
  const MAX_LABELS = 6;
  const labelStep = Math.max(1, Math.ceil(lastIndex / (MAX_LABELS - 1)));
  const labelIndices = new Set<number>();
  for (let i = 0; i <= lastIndex; i += labelStep) labelIndices.add(i);
  labelIndices.add(lastIndex);
  const xAxis = [...labelIndices]
    .sort((a, b) => a - b)
    // dateKey, not recordedAt: a carried day's recordedAt is the earlier real
    // reading it copied forward, which would mislabel the axis with the wrong
    // date even though the tooltip is right to cite it as "unchanged since".
    .map((i) => `<span class="history-xlabel" style="left:${xPct(i).toFixed(2)}%">${esc(shortDate(points[i]!.dateKey))}</span>`)
    .join('');

  return `<div class="history-chart" data-history-chart>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="history-svg" aria-hidden="true" focusable="false">
        <path d="${areaPath}" class="history-area" />
        <path d="${linePath}" class="history-line" />
      </svg>
      ${dots}
      <div class="history-tip" data-history-tip hidden></div>
    </div>
    <div class="history-xaxis">${xAxis}</div>`;
}

function notesBlock(f: DemoFragrance): string {
  if (!f.notes) {
    return `<div class="notes-block">
      <p class="gone-head t-eyebrow">Notes</p>
      <p class="notes-none">Notes unavailable for this fragrance.</p>
    </div>`;
  }
  // The tier is a class, never a graphic. It used to drive an indent and a
  // rule weight per layer, drawing the pyramid out of the layout itself; the
  // block is centred now (owner's instruction, 2026-08-26 — see .notes-block
  // in the stylesheet for why an indent and a centre line cannot both hold),
  // so nothing styles `.note-layer--top|middle|base` any more. The modifier
  // is kept on the element all the same: it is the tier of a fragrance note,
  // which is a fact about the content and not about the old indent, and it is
  // the hook anything reading this DOM would reach for. The ordering that
  // indent used to show is carried where it always really was — the three
  // labels below, in fixed document order, which is also the only version of
  // this shape a screen reader ever had.
  const layer = (label: string, tier: 'top' | 'middle' | 'base', list: string[]) =>
    list.length === 0
      ? ''
      : `<div class="note-layer note-layer--${tier}">
           <p class="note-layer-name t-eyebrow">${label}</p>
           <p class="note-chips">${list
             .map((n) => `<button class="note-chip" data-note="${esc(n)}">${esc(titleCase(n))}</button>`)
             .join('')}</p>
         </div>`;
  // Provenance is only ever missing for notes a future build somehow produced
  // with no attributable offer (see Notes.source's own doc) or a retailer id
  // that no longer resolves — both fall back to the old, unlinked wording
  // rather than rendering a broken link or a made-up name.
  const source = f.notes.source;
  const sourceRetailer = source ? getRetailer(source.retailerId) : undefined;
  const sourceLine =
    source && sourceRetailer
      ? `<a class="notes-source-link" href="${esc(source.url)}" target="_blank" rel="noopener nofollow">As published by ${esc(sourceRetailer.name)}<span class="notes-source-ico" aria-hidden="true">${ICON_EXTERNAL}</span></a>`
      : 'As published by the retailer listing it.';
  return `<div class="notes-block">
    <p class="gone-head t-eyebrow">Notes</p>
    ${layer('Top', 'top', f.notes.top)}
    ${layer('Middle', 'middle', f.notes.middle)}
    ${layer('Base', 'base', f.notes.base)}
    <p class="notes-source t-caption">${sourceLine}</p>
  </div>`;
}

/** The account page's own wishlist list — a saved fragrance no longer in the
 *  live catalogue (delisted everywhere since it was saved) is skipped rather
 *  than rendered as a broken link; the row in the database is untouched, so
 *  it would reappear if the fragrance ever comes back into stock somewhere. */
function wishlistSectionHtml(): string {
  if (!state.wishlistLoaded) return `<h3 class="t-section">Wishlist</h3><p class="settings-note t-caption">Loading.</p>`;

  const rows = state.wishlistEntries
    .map((e) => ({ entry: e, frag: fragranceById(e.fragranceId) }))
    .filter((x): x is { entry: WishlistEntry; frag: DemoFragrance } => x.frag != null);

  if (rows.length === 0) {
    return `<h3 class="t-section">Wishlist</h3><p class="settings-note t-caption">Nothing saved yet. Tap Save on a fragrance to add it here.</p>`;
  }

  return `
    <h3 class="t-section">Wishlist</h3>
    <ul class="shop-list">
      ${rows
        .map(
          ({ frag }) => `<li class="wishlist-row">
            <button class="shop-row" data-frag="${esc(frag.id)}">
              ${monogram(frag.brand)}
              <span class="shop-row-text">
                <span class="shop-row-name t-title">${esc(frag.brand)} ${esc(frag.name)}</span>
                <span class="shop-row-meta t-caption">${esc(frag.concentration)}, ${esc(sizeLabel(frag.sizeMl))}</span>
              </span>
              <span class="shop-row-go" aria-hidden="true">→</span>
            </button>
            <button class="wishlist-remove" data-wishlist-remove="${esc(frag.id)}"
                aria-label="Remove ${esc(frag.brand)} ${esc(frag.name)} from your wishlist">${ICON_CLOSE}</button>
          </li>`,
        )
        .join('')}
    </ul>`;
}

/** Fetches the signed-in reader's wishlist once verification is confirmed,
 *  and re-renders when it lands — see handleAuthUser in init(). */
function loadWishlist(): void {
  fetchWishlist().then((entries) => {
    state.wishlistEntries = entries;
    state.wishlistIds = new Set(entries.map((e) => e.fragranceId));
    state.wishlistLoaded = true;
    render();
  });
}

/**
 * The four already-resolved facts that decide every account-shaped question
 * on this site, gathered in one place and handed to the pure functions in
 * src/services/accountState.ts.
 *
 * It is one function rather than two inline ladders because the account page
 * and the detail page's Save button previously disagreed: the Save button had
 * no notion of a reader who has signed up but holds no session yet, so a
 * successful signup rendered as though nothing had happened. One input, one
 * answer, and the answer is unit tested (tests/accountState.test.ts) without
 * needing a Supabase this sandbox cannot reach.
 */
function accountStateInput(): AccountStateInput {
  const user = state.authUser;
  return {
    configured: SUPABASE_CONFIGURED,
    checked: state.authChecked,
    user: user ? { email: user.email ?? null, verified: isVerified(user) } : null,
    pendingEmail: state.authPendingEmail,
  };
}

/**
 * Invisible while accounts are not configured (nothing to save into yet).
 * Once configured: an inviting "Sign in to save" for a signed out reader —
 * this is one of the few places worth nudging toward /account, since saving
 * something is exactly the moment an account earns its keep — and a real
 * on/off toggle once signed in and verified.
 *
 * An unverified reader gets the invitation, not the toggle. That is not
 * politeness: supabase/migrations/0002_wishlists.sql is what actually refuses
 * their write, and a button that fails on every press would be the UI lying
 * about what the database will allow.
 */
function wishlistButton(fragranceId: string): string {
  const control = wishlistControl(accountStateInput());
  if (control === 'hidden') return '';
  if (control === 'prompt') {
    return `<button class="wishlist-toggle" data-go-account>${ICON_HEART}<span>Sign in to save</span></button>`;
  }
  const saved = state.wishlistIds.has(fragranceId);
  return `<button class="wishlist-toggle ${saved ? 'on' : ''}" data-wishlist-toggle="${esc(fragranceId)}"
      aria-pressed="${saved}" ${state.wishlistBusy ? 'disabled' : ''}>
    ${ICON_HEART}<span>${saved ? 'Saved' : 'Save'}</span>
  </button>`;
}

/* ── the two boxes under the product ─────────────────────────────────────────
   Left, in red: the strongest reference price available — the house that
   makes the bottle where it is stocked here, a shop's corroborated RRP where
   it is not (see referenceBox and demo/referencePrice.ts). Right, in green:
   the least anyone here charges. The pair is the whole argument of a price
   comparison site made in one glance, which is why it sits directly under the
   product and above everything else on the page.

   Red on the left is not "bad": red is this app's brand accent (see the note
   at the top of demo/template.html) and it is already what the single box
   carried before there were two. Green on the right is the palette's --ok,
   which this stylesheet already uses for a saving (.off), a sale price
   (.now.sale) and in-stock — so the colour on the number a reader is meant to
   act on means the same thing it means everywhere else on the site. */

/**
 * The MSRP box, and the reason it is so often absent.
 *
 * `houseCeiling` is the only figure in this codebase entitled to be called a
 * manufacturer's price: the highest amount the fragrance's own house publishes
 * for this exact size on its own UK storefront. 874 of 14,836 products carry
 * one (5.89%); 13,962 do not. Of the 874, 709 have something buyable to put
 * beside the figure and 165 are sold out everywhere.
 *
 * Those 13,962 render no box at all, rather than a box reading "MSRP not
 * established". Two reasons, and the second is the deciding one:
 *
 *   - A placeholder that appears on 94.11% of pages is not an exception, it is
 *     the layout. It would take the most valuable position on the page to
 *     state a fact about our coverage rather than about the fragrance.
 *   - A red box saying "unknown" sitting beside the price reads as a warning
 *     about the price. There is nothing wrong with the price; we simply have
 *     no manufacturer figure to set beside it.
 *
 * What must never happen is the third option: filling the gap from a
 * retailer's `wasPrice`. That is the shop's own claim about a reference price,
 * and src/catalogue/wasPriceCredibility.ts exists because those claims are
 * demonstrably inflated. `houseCeiling` or nothing.
 *
 * The caption underneath reads "Brand's Current Price" (owner's wording,
 * 2026-08-26). It previously spelled the derivation out — "the highest price
 * <Brand> itself lists for this size" — which is exactly what the number is,
 * and is still exactly what the number is: nothing about the figure changed,
 * only the words under it. The derivation stays documented here and stays
 * enforced by the field this box reads, which is `houseCeiling` and will
 * never be anything else. Note the caption no longer interpolates the brand
 * name, so it is a static string with a literal apostrophe rather than an
 * `esc()`-ed one; the surrounding markup is unchanged.
 *
 * `price-box-from--fit` (2026-08-26, alongside `lowestPriceBox`'s two-box
 * amount sizing below) forces this caption onto one line — see the class's
 * own comment in demo/template.html for the width it was measured against
 * and why the box widths and hero-number sizes changed at the same time.
 */
function houseCeilingBox(frag: DemoFragrance): string {
  if (frag.houseCeiling === null) return '';
  return `<div class="price-box price-box--msrp">
      <p class="price-box-label t-eyebrow">MSRP</p>
      <p class="price-box-amount t-price">${formatGbp(frag.houseCeiling)}</p>
      <p class="price-box-from price-box-from--fit t-caption">Brand's Current Price</p>
    </div>`;
}

/**
 * The second report and the fix, after the first ("I only see the MSRP box
 * under French Avenue listings") got a narrower answer than the owner asked
 * for. The renewed report was explicit: applied everywhere else, not just
 * documented as rare. See demo/referencePrice.ts's own header for the
 * measurement this responds to and the three tiers it establishes; this
 * function is only the render half.
 *
 * `pickReferencePrice` decides which tier applies and never reads a shop's
 * raw `wasPrice` to do it — `row.discount` is already the corroborated
 * survivor of src/catalogue/wasPriceCredibility.ts by the time it reaches
 * here (build-demo-catalogue.ts nulls everything else before the catalogue
 * is written), so this box is exactly as strict as the strikethrough on the
 * offer row underneath it, never more permissive.
 *
 * Same class, same measured widths, same font-size steps as the MSRP box —
 * `.price-box--msrp` in demo/template.html sizes itself and its paired
 * `.price-box--best` sibling off that one class name regardless of which
 * label sits inside it, so a second class was not worth adding for a box
 * that looks identical either way. What must differ, and does, is the two
 * strings a reader actually reads: "MSRP" only ever names the house's own
 * figure (`houseCeilingBox` above, untouched), never a shop's claim about
 * it, and the retailer tier below is labelled "RRP" — the same word the
 * offer row already uses for a shop's own corroborated reference price
 * (`offerRow`'s `RRP ${formatGbp(d.wasPrice)}`) — with a caption that says
 * whose word it is rather than the brand's. Kept a static string rather than
 * naming the specific shop, for the same reason `houseCeilingBox`'s caption
 * dropped the brand name (2026-08-26): the shop is already named on its own
 * row directly below, and `price-box-from--fit`'s nowrap budget was measured
 * against "from <shop>", not against "As stated by <the 26-character shop
 * name the registry can produce>" — a caption naming the shop here would
 * need its own width audit this file has no reason to take on when the
 * attribution is already one glance away.
 */
function retailerRrpBox(amountGbp: number): string {
  return `<div class="price-box price-box--msrp">
      <p class="price-box-label t-eyebrow">RRP</p>
      <p class="price-box-amount t-price">${formatGbp(amountGbp)}</p>
      <p class="price-box-from price-box-from--fit t-caption">Shop's Stated RRP</p>
    </div>`;
}

/**
 * The box `priceBoxRow` actually renders on the left: the house's own price
 * where one exists, a corroborated retailer RRP where it does not, or
 * nothing. `rows` must be every offer on the page — live and gone alike, the
 * same set `offerRow` itself reads `discount` off of — because a reference
 * price is a fact about the bottle, not about today's stock, exactly the
 * reasoning `houseCeiling` already rests on.
 *
 * The house's own storefront offer is excluded from the retailer scan via
 * `isHouseOffer`, computed the same way `msrpFor` already does it —
 * `singleBrandOnly` crossed with `cannotCarryBrand` — rather than re-derived,
 * so the two can never disagree about which offer is the house's own.
 */
function referenceBox(frag: DemoFragrance, rows: readonly PresentedOffer[]): string {
  const ref = pickReferencePrice(
    frag.houseCeiling,
    rows.map((row) => ({
      wasPriceGbp: row.discount?.wasPrice ?? null,
      isHouseOffer: Boolean(row.retailer.singleBrandOnly) && !cannotCarryBrand(row.retailer, frag.brand),
    })),
  );
  if (!ref) return '';
  return ref.tier === 'house' ? houseCeilingBox(frag) : retailerRrpBox(ref.amountGbp);
}

/**
 * The lowest price box, in green, with the three labels it has always had.
 *
 * The wording is a correctness guarantee about what the number underneath is,
 * not decoration, so all three states are kept exactly as they were:
 *
 *   "Cheapest price"     the delivery-confidence verdict is decided, so the
 *                        page is entitled to the word — see
 *                        src/services/deliveryConfidence.ts
 *   "Lowest total price" it is not decided, so the number is the lowest of
 *                        the delivered prices we can actually compute, which
 *                        is a weaker claim than "cheapest"
 *   "Lowest item price"  no shop stating its delivery cost has this one, so
 *                        there is no delivered price to name at all, and the
 *                        second line says in as many words that this is not
 *                        one
 *
 * Two things this box used to say and no longer does (owner's instruction,
 * 2026-08-26), and why neither loss is a correctness one:
 *
 *   - The "from X" line ended ", incl. delivery". What the number contains is
 *     already the job of the label above it: the delivered-price branch is
 *     reached only when `deliveredPriceGbp` is non-null, and the one branch
 *     where the figure is *not* delivered is the branch that still spells that
 *     out at length. So the clause was a second statement of what the label
 *     already guarantees, on every page that has a delivered price at all.
 *   - The `.price-box-caveat` line rendered `tooCloseToCallNote(verdict)`. The
 *     safeguard behind that sentence is untouched and must stay untouched: the
 *     label above still reads "Lowest total price" rather than "Cheapest price"
 *     whenever `verdict.decided` is false, which is precisely the case the
 *     sentence described. The word is still withheld; only the paragraph
 *     explaining the withholding is gone. See src/services/deliveryConfidence.ts
 *     and the note above `tooCloseToCallNote` itself.
 *
 * One more caption rule, 2026-08-26: "from <shop>" must never wrap, for any
 * shop name the registry can produce (see `.price-box-from--fit` in
 * demo/template.html) — but only in the delivered-price branch below, where
 * the caption is just a name. The other branch's caption is a full sentence
 * explaining *why* there is no delivered price, and stays free to wrap; a
 * sentence four times as long forced onto one line would need a caption too
 * small to read for a far less urgent fact than a shop's own name.
 */
function lowestPriceBox(best: PresentedOffer, verdict: CheapestVerdict): string {
  if (best.deliveredPriceGbp === null) {
    return `<div class="price-box price-box--best">
        <p class="price-box-label t-eyebrow">Lowest item price</p>
        <p class="price-box-amount t-price t-price--hero">${formatGbp(best.itemPriceGbp)}</p>
        <p class="price-box-from t-caption">from ${esc(best.retailer.name)} &mdash; delivery not stated, so this is not a delivered price</p>
      </div>`;
  }
  return `<div class="price-box price-box--best">
      <p class="price-box-label t-eyebrow">${verdict.decided ? 'Cheapest price' : 'Lowest total price'}</p>
      <p class="price-box-amount t-price t-price--hero">${formatGbp(best.deliveredPriceGbp)}</p>
      <p class="price-box-from price-box-from--fit t-caption">from ${esc(best.retailer.name)}</p>
    </div>`;
}

/**
 * The row the two boxes sit in, or the one line that replaces both.
 *
 * With no buyable offer there is no price box and no reference box either —
 * house price or retailer RRP, whichever `referenceBox` would otherwise pick.
 * The figure is real either way, but on a page whose entire message is "you
 * cannot buy this anywhere here" it would be a lone claim in the loudest
 * position on the page with nothing to be a reference for — the exact reading
 * the pair exists to give it. One line, not two: the second line used to read
 * "no shop has it in stock right now", which is the first line again in
 * different words, and the shop count in the results head below says the same
 * thing a third time.
 */
function priceBoxRow(
  frag: DemoFragrance,
  rows: readonly PresentedOffer[],
  best: PresentedOffer | null,
  verdict: CheapestVerdict,
): string {
  if (!best) return `<p class="hero-price none">Sold out everywhere</p>`;
  return `<div class="price-boxes">${referenceBox(frag, rows)}${lowestPriceBox(best, verdict)}</div>`;
}

function detailView(): string {
  const frag = fragranceById(state.fragranceId);
  if (!frag) return homeView();

  const rows = rowsFor(frag);
  const best = bestOffer(rows);
  // Whether this page is entitled to the word "cheapest" at all — see
  // src/services/deliveryConfidence.ts. The ordering is untouched either way;
  // what this decides is the wording placed on top of it.
  const verdict = cheapestVerdict(rows);
  const bestTag = cheapestTag(verdict);
  const live = rows.filter((r) => r.isPurchasable);
  // Alphabetical, not by price: this section is about "who usually stocks it",
  // not "who was cheapest last time it was in stock" — a price ordering would
  // read as if these were live, buyable offers, which they are not.
  const gone = rows.filter((r) => !r.isPurchasable).sort((a, b) => a.retailer.name.localeCompare(b.retailer.name));
  const newest = rows.length ? Math.min(...rows.map((r) => r.ageSeconds)) : 0;
  /**
   * Whether this page may print the word MSRP at all.
   *
   * The rows and the box are one decision, not two, and they were two. With no
   * buyable offer `priceBoxRow` deliberately drops both boxes for the single
   * "Sold out everywhere" line — see its own note for why the MSRP figure is
   * not worth the loudest position on a page whose whole message is that you
   * cannot buy this. But the rows below kept rendering "57% below MSRP", so on
   * every one of those pages (165 of the 874 products carrying a houseCeiling,
   * per houseCeilingBox's own count) a reader met the term up to five times
   * with nothing anywhere on the page saying what the figure is. Zimaya Royal
   * Paragon is the case looked at: four rows naming MSRP, no MSRP stated.
   *
   * Tied to `best` rather than given its own rule, because `best` is exactly
   * the condition `priceBoxRow` already branches on — so the page now names
   * MSRP only where it also states it, and the two cannot drift apart again.
   * Nothing is invented and nothing else moves: a row losing its house
   * comparison falls back through offerRow's existing `msrp ? null :
   * row.discount` to the shop's own RRP, which is self-defining because the
   * struck-through figure is printed beside it.
   */
  const mayNameMsrp = best !== null;

  const shownIds = new Set(rows.map((r) => r.retailer.id));
  const missing = RETAILERS.filter((r) => !shownIds.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
  // A shop that stocks many houses and simply does not have this one is a real
  // "not available". One house's own storefront is not: Armaf's shop was never
  // going to sell a Dior bottle, so it is excluded here rather than listed as
  // a gap in that shop's range.
  const unavailable = missing.filter((r) => !cannotCarryBrand(r, frag.brand));

  return `
    <button class="back" data-back>Back</button>

    <div class="detail-grid">
      <div class="hero">
        <div class="hero-art">${productArt(frag.photoUrl, 'lg', `${frag.brand} ${frag.name}`)}</div>
        ${brandButton(frag.brand)}
        ${productHead(frag, 'div', 't-page')}
        ${fragranceLinksBlock(frag)}
        ${wishlistButton(frag.id)}
        ${priceBoxRow(frag, rows, best, verdict)}
        ${notesBlock(frag)}
      </div>

      <div class="detail-offers">
        <div class="results-head gone-head">
          <p class="t-eyebrow">${
            // Was its own heading line ("Available at") sitting above a
            // second line that carried the shop count and the delivery
            // caption. The owner asked for one row: the count folds into
            // this label instead of a separate "N shops" span (which is
            // what carried the singular/plural check before — kept here,
            // verbatim, so "1 shop" still never reads "1 shops"), and the
            // label disappears with nothing in its place, exactly as
            // "Available at" itself did, when there is nothing to be
            // available at (live.length === 0 — see priceBoxRow's own note
            // on that state, and cheapestVerdict for the rest of the
            // reasoning). The <p> stays in the document either way, empty
            // rather than removed, so `.results-head`'s space-between still
            // has two children and the caption on the right does not drift
            // left into the gap the heading used to fill — see .results-head
            // in the stylesheet for the narrow-width version of this row.
            live.length ? `Available at (${live.length} ${live.length === 1 ? 'shop' : 'shops'})` : ''
          }</p>
          <span class="dim t-caption">${
            // Until 2026-09-01 this caption led with "delivery included where
            // the shop states it" (or plain "delivery included", where every
            // row had a stated cost) before the age. Nothing is lost by
            // dropping it: it was a page-level summary of a fact each row
            // already states about *itself*, on its own price, in .del-note —
            // "INCL. £2.95 DELIVERY", "INCL. FREE DELIVERY" or "DELIVERY NOT
            // INCLUDED", rendered on every row rather than only on the odd one
            // out. The hedged form in particular told a reader that some row on
            // this page excluded delivery without saying which, when the row
            // that does says so on its own line, in warn ink. What is left is
            // the one fact no row carries: how current the page is. age()
            // handles its own units, so this reads "Updated 17h ago" and, past
            // 48h, "Updated 3d ago".
            `Updated ${esc(age(newest))}`
          }</span>
        </div>

        <ul class="offers">${live.map((r) => offerRow(r, r === best, bestTag, mayNameMsrp ? msrpFor(r, frag) : null)).join('')}</ul>

        ${
          gone.length
            ? `<p class="gone-head t-eyebrow">Sold out</p>
               <ul class="offers">${gone.map((r) => offerRow(r, false, 'Cheapest', mayNameMsrp ? msrpFor(r, frag) : null)).join('')}</ul>`
            : ''
        }

        ${priceHistoryChart(frag, best !== null)}

        ${
          unavailable.length
            ? `<p class="gone-head t-eyebrow">Not available</p>
               ${unavailableShopsLine(unavailable)}`
            : ''
        }
      </div>
    </div>`;
}

/* ── explore: brands ─────────────────────────────────────────────────────── */

function brandsPanel(): string {
  const filtered = BRANDS.filter(
    (b) => state.brandFilter === 'all' || brandTierFor(b) === state.brandFilter,
  );
  const list = [...filtered].sort((a, b) =>
    state.brandSort === 'az' ? a.localeCompare(b) : b.localeCompare(a),
  );

  const controls = `<div class="controls">
    ${control('brand-sort', 'Sort brands', ICON_SORT, [
      { value: 'az', label: 'A To Z' },
      { value: 'za', label: 'Z To A' },
    ], state.brandSort)}
    ${control('brand-filter', 'Filter brands', ICON_FILTER, [
      { value: 'all', label: 'All Types' },
      ...(['designer', 'niche', 'mideast'] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
    ], state.brandFilter)}
  </div>`;

  if (list.length === 0) {
    return `${controls}<p class="empty-note t-body">No brands match that filter yet.</p>`;
  }

  // Group under the initial so a long alphabetical list stays scannable. The
  // rule after each letter runs to the end of the column, which is what makes
  // the break read as a divider rather than a heading that happens to be short.
  let out = '';
  let current = '';
  for (const b of list) {
    const initial = (b[0] ?? '').toUpperCase();
    if (initial !== current) {
      current = initial;
      out += `<li class="alpha-break" aria-hidden="true"><span>${esc(initial)}</span><i></i></li>`;
    }
    out += `<li><button class="brand-row t-title" data-brand="${esc(b)}">${esc(b)}</button></li>`;
  }
  return `${controls}<ul class="brand-list">${out}</ul>`;
}

/* ── deals ────────────────────────────────────────────────────────────────
   Promoted out of Explore to a top level page in the top bar, between Home
   and Explore. Was one of the Explore subnav tabs until the owner asked for
   it to sit at the same level as Home and Explore rather than a tap inside
   the latter — see the top-of-file structure comment. The internal name
   (dealsPanel, state.dealSort, the 'deals' route and view) is unchanged: this
   was a presentation move, not a data or routing one, and the URL /deals
   still resolves to the same place it always has. */

/** The page shell: a heading (Explore's own tabs used to do that job) over
 *  the unchanged panel below. */
function dealsView(): string {
  return `<div class="page-head"><h2 class="t-page">Today’s Deals</h2></div>${dealsPanel()}`;
}

function dealsPanel(): string {
  // A deal tile leads with the bottle's photo, so a fragrance with none —
  // photoUrl is only ever set for a retailer whose affiliate programme has
  // confirmed image rights, see demo/data.ts's own header — read as broken
  // on this page specifically, even though the discount itself is real.
  // Restricted here rather than upstream in demo/data.ts's DEALS: the same
  // fragrance still deserves its price shown everywhere else a listing
  // appears (search, brand pages, its own detail page all fall back to a
  // plain placeholder), only the deals rail's photo-led layout can't carry
  // it. Cuts the page from 6,299 deals to 2,855, measured 2026-08-18.
  const withPhoto = DEALS.filter((d) => d.fragrance.photoUrl !== null);
  const sorted = [...withPhoto].sort((a, b) => {
    if (state.dealSort === 'lowest') return a.price - b.price;
    if (state.dealSort === 'highest') return b.price - a.price;
    return b.percentOff - a.percentOff;
  });
  // Facets are computed and applied against the fragrance each deal is on,
  // not the deal record itself — same groups, same counts, as everywhere
  // else a fragrance list appears.
  const filtered = sorted.filter((d) => passesFacets(d.fragrance, null));

  const controls = `<div class="controls">
    ${control('deal-sort', 'Sort deals', ICON_RANK, [
      { value: 'discount', label: 'Biggest Savings (%)' },
      { value: 'lowest', label: 'Lowest Price' },
      { value: 'highest', label: 'Highest Price' },
    ], state.dealSort)}
    ${perRowControl()}
    ${facetsBlock(sorted.map((d) => d.fragrance))}
  </div>`;

  if (DEALS.length === 0) {
    return `${controls}<p class="empty-note t-body">No shop is publishing a reference price right now.</p>`;
  }
  if (sorted.length === 0) {
    return `${controls}<p class="empty-note t-body">No discounted fragrance has a shop-licensed photo right now.</p>`;
  }
  if (filtered.length === 0) {
    return `${controls}<p class="empty-note t-body">No deal matches that filter.</p>`;
  }

  // `kind` decides the attribution the same way houseAnchorFor's callers do
  // on the fragrance's own page: a 'house' deal is a fact about the
  // manufacturer, not this shop's claim, and the tile must name the
  // manufacturer for the CPR reason offerRow used to — see
  // scripts/build-deals.ts's own header for the measurement.
  //
  // Left naming the house, deliberately, when the offer row moved to "% below
  // MSRP" on 2026-08-26. That instruction was about the fragrance detail page,
  // and the detail page is where it works: the MSRP box sits at the top of it
  // carrying the figure and the product's own brand, so "below MSRP" on a row
  // underneath has its referent on the same screen. A deal tile has no such
  // context. It is one photo, one price and one line in a grid of hundreds of
  // fragrances by hundreds of brands, and "40% below MSRP" there would be a
  // comparison against a reference price the tile never identifies — which is
  // the one thing a price comparison is not allowed to leave unsaid. The tile
  // also still shows the reference figure itself beside the percentage
  // ("£37.99 at Armaf"), so changing only the percentage would have the same
  // tile name the same number two different ways.
  const dealTile = (d: (typeof sorted)[number]) =>
    fragranceTile(d.fragrance, {
      trailing:
        d.kind === 'house'
          ? `<span class="off anchor">${d.percentOff}% below ${esc(d.houseName!)}</span>
        <span class="amt">${formatGbp(d.price)}</span>
        <span class="was anchor">${formatGbp(d.wasPrice)} at ${esc(d.houseName!)}</span>`
          : `<span class="off">${d.percentOff}% off</span>
        <span class="amt">${formatGbp(d.price)}</span>
        <span class="was">RRP ${formatGbp(d.wasPrice)}</span>`,
    });

  return `${controls}
    <p class="panel-note t-body">Savings are against the shop's own published recommended retail price, or, where the fragrance's own manufacturer is stocked here too, against the manufacturer's own price.</p>
    <ul class="tile-grid">${chunked(filtered, dealTile)}</ul>`;
}

/* ── explore: retailers ──────────────────────────────────────────────────── */

/**
 * Deterministic hue (0-359) from a name, so the same shop or brand always
 * tints the same way and different ones are visually distinct at a glance.
 * Not a lookup of that brand's real colour — this project has no licence to
 * reproduce brand identity, the same restriction .monogram's initials-only
 * rule already applies, just extended to colour. A plain djb2-style hash: no
 * cryptographic property needed, only that it is stable and spreads names
 * across the wheel rather than clustering them.
 */
function monogramHue(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Initials, drawn as a monogram. Deliberately not a copy of the shop's logo. */
function monogram(name: string): string {
  const initials = name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return `<span class="monogram" style="--mh:${monogramHue(name)}" aria-hidden="true">${esc(initials || '?')}</span>`;
}

/**
 * How many fragrances a retailer currently lists, as the plainest mark that
 * says so: `(n)` when we hold real live data, `(-)` when we do not — a shop
 * still on fixtures, or one added but not yet enabled, has genuinely nothing
 * to report here rather than a zero that would read as "definitely none".
 */
function retailerCountMark(retailerId: string): string {
  const n = listingCountAt(retailerId);
  return n > 0 ? `(${n.toLocaleString('en-GB')})` : '(-)';
}

/**
 * The Retailers directory: shops you could go to for many different houses.
 *
 * A house's own storefront is deliberately not here. Armaf's UK shop is a
 * genuine source of a genuine sterling price — that is why it is in the
 * retailer registry at all, and why its prices appear on Armaf fragrances the
 * same as anyone else's. But it is not somewhere you browse *for fragrance*,
 * only somewhere you buy Armaf, so listing it beside Boots and Selfridges
 * invites a reader to open it expecting a shop and find a single brand.
 *
 * Those shops are reached the way they actually make sense: through the brand.
 * Explore > Brands > Armaf carries both its fragrances and the link to its own
 * site. Being a price source and being a destination to browse are two
 * different jobs, and only the second belongs in this list.
 */
function retailersPanel(): string {
  const shops = [...RETAILERS]
    .filter((r) => !r.singleBrandOnly)
    .sort((a, b) => a.name.localeCompare(b.name));
  return `<ul class="shop-list">
    ${shops
      .map((r) => {
        return `<li>
          <button class="shop-row" data-retailer="${esc(r.id)}">
            ${monogram(r.name)}
            <span class="shop-row-text">
              <span class="shop-row-name t-title">${esc(r.name)}</span>
              <span class="shop-row-meta t-caption">${retailerCountMark(r.id)}</span>
            </span>
            <span class="shop-row-go" aria-hidden="true">→</span>
          </button>
        </li>`;
      })
      .join('')}
  </ul>`;
}

/**
 * Trustpilot's own "TrustBox" embed, in its Micro Star template — a compact
 * star rating and review count, right-sized for sitting under delivery facts
 * rather than a full review carousel. `trustpilotStateFor` (demo/
 * trustpilotWidget.ts) decides which of two things this is: the widget, once
 * a `trustpilotBusinessId` is configured, or an honest "No Trustpilot
 * reviews available" note in its place — the owner's explicit call, so a
 * reader sees a stated absence rather than silence indistinguishable from
 * "this shop has no delivery facts either". The fallback link inside the
 * widget itself is Trustpilot's own convention — if their script never loads
 * (blocked, offline, slow), a plain link to the real review page is what a
 * reader sees instead of a blank box.
 */
function trustpilotWidget(r: Retailer): string {
  const state = trustpilotStateFor(r);
  if (state.kind === 'unavailable') {
    return `<p class="trustpilot-unavailable t-caption dimmer">${esc(state.message)}</p>`;
  }
  return `<div class="trustpilot-block">
    <div
      class="trustpilot-widget"
      data-trustpilot-widget
      data-locale="en-GB"
      data-template-id="5419b6ffb0d04a076446a9af"
      data-businessunit-id="${esc(state.businessId)}"
      data-style-height="24px"
      data-style-width="100%"
      data-theme="dark"
    >
      <a href="${esc(state.reviewUrl)}" target="_blank" rel="noopener nofollow">See reviews on Trustpilot</a>
    </div>
  </div>`;
}

/** Whether this retailer's own offer for `f` — not any other shop's — is
 *  currently purchasable. Reads the same `isPurchasable` flag the detail
 *  page's "Available at" / "No longer stocked" split uses, just scoped down
 *  to one retailer's row instead of every row. */
function inStockAt(f: DemoFragrance, retailerId: string): boolean {
  return rowsFor(f).some((row) => row.retailer.id === retailerId && row.isPurchasable);
}

function retailerView(): string {
  const r = getRetailer(state.retailerId);
  if (!r) return exploreView();
  const filtered = fragrancesAt(r.id).filter(
    (f) => state.retailerDetailFilter === 'all' || f.tier === state.retailerDetailFilter,
  );
  const list = sortFragrances(applyFacets(filtered), state.retailerDetailSort)
    .filter((f) => !state.retailerInStockOnly || inStockAt(f, r.id));

  const controls = `<div class="controls">
    ${listSortControl('retailer-detail-sort', state.retailerDetailSort)}
    ${tierFilterControl('retailer-detail-filter', state.retailerDetailFilter)}
    ${facetsBlock(filtered)}
  </div>`;

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="org-hero">
      ${monogram(r.name)}
      <div class="org-hero-text">
        <h2 class="org-hero-name t-page">${esc(r.name)} <span class="org-hero-count t-count">${retailerCountMark(r.id)}</span></h2>
        <p class="org-hero-domain t-caption">${esc(r.domain)}</p>
        ${r.blurb ? `<p class="org-hero-blurb t-body">${esc(r.blurb)}</p>` : ''}
        <ul class="fact-list">
          ${deliveryLines(r).map((l) => `<li>${esc(l)}</li>`).join('')}
        </ul>
        ${trustpilotWidget(r)}
        <label class="stock-only">
          <input type="checkbox" id="retailer-in-stock" ${state.retailerInStockOnly ? 'checked' : ''} />
          <span>In stock only</span>
        </label>
      </div>
    </div>

    <p class="gone-head t-eyebrow">${list.length} ${list.length === 1 ? 'fragrance' : 'fragrances'} here</p>
    ${controls}
    ${fragranceList(list, 'Nothing from this shop matches that filter.')}`;
}

/**
 * A brand's own profile: the same org-hero shape as a retailer, official
 * website first, its fragrances underneath. The website line only appears
 * once `officialSiteFor` has a verified entry — absent rather than a
 * guessed domain, same rule as everywhere else a link leaves this app.
 *
 * Where this brand runs its own UK shop (`ownShop`), its delivery terms
 * render the same way retailerView() already shows any other shop's —
 * `deliveryLines()`, the shared helper, so "delivery not stated" reads
 * identically here as it does on the shop's own retailer page rather than
 * inventing a second wording for the same fact. Scoped to `ownShop` only,
 * not every retailer stocking this brand's fragrances: those already get
 * their own delivery facts on each fragrance's own comparison row, and
 * repeating every listed shop's terms here would duplicate that rather than
 * add anything a reader does not already have.
 */
function brandView(): string {
  const b = state.brandProfile;
  if (!b) return exploreView();
  const filtered = BY_POPULARITY.filter((f) => f.brand === b);
  const list = sortFragrances(applyFacets(filtered), state.brandDetailSort);
  const site = officialSiteFor(b);
  // Products read straight from this house's own storefront, priced in
  // whatever currency it charges. Not part of the UK comparison (see the
  // houses comment above houseCard), so shown as their own group rather than
  // mixed into `list`, which is sterling delivered price all the way down.
  const houseItems = HOUSE_PRODUCTS.filter((p) => p.house === b);
  // This house's own UK shop, when we carry one. It is kept out of the
  // Retailers directory (see retailersPanel) precisely so it can surface
  // here instead, where "buy direct from the brand" is what it means.
  const ownShop = RETAILERS.find((r) => r.singleBrandOnly && !cannotCarryBrand(r, b));

  // Sort and facets, no tier filter: every fragrance from one brand shares
  // that brand's tier (brandTierFor is a function of the brand name alone),
  // so a tier filter here would only ever show everything or nothing — the
  // Type facet group already knows this and hides itself for exactly that
  // reason (an option only appears when at least two values exist).
  const controls = `<div class="controls">
    ${listSortControl('brand-detail-sort', state.brandDetailSort)}
    ${facetsBlock(filtered)}
  </div>`;

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="org-hero">
      ${monogram(b)}
      <div class="org-hero-text">
        <h2 class="org-hero-name t-page">${esc(b)}</h2>
        ${
          site
            ? `<a class="brand-site-link" href="${esc(site.url)}" target="_blank" rel="noopener nofollow">
                 <span class="control-ico">${ICON_EXTERNAL}</span>
                 <span>Open Brand Website</span>
                 <span class="brand-site-flag ${site.uk ? 'is-uk' : 'is-nonuk'}">${site.uk ? 'UK Site' : 'Non-UK Site'}</span>
               </a>`
            : `<p class="org-hero-domain dimmer t-caption">Official site not yet confirmed</p>`
        }
        ${
          ownShop
            ? `<p class="org-hero-blurb t-body">Sells direct in the UK${
                ownShop.enabled
                  ? ', and its own price is compared below like any other shop’s.'
                  : ', but its delivery terms are not confirmed yet, so its price is not compared.'
              }</p>
               <ul class="fact-list">
                 ${deliveryLines(ownShop).map((l) => `<li>${esc(l)}</li>`).join('')}
               </ul>`
            : ''
        }
      </div>
    </div>

    ${
      list.length > 0
        ? `<p class="gone-head t-eyebrow">${list.length} ${list.length === 1 ? 'fragrance' : 'fragrances'}</p>
           ${controls}
           ${fragranceList(list, 'Nothing from this brand has been harvested yet.')}`
        : houseItems.length === 0
          ? fragranceList(list, 'Nothing from this brand has been harvested yet.')
          : ''
    }
    ${
      houseItems.length > 0
        ? `<p class="gone-head t-eyebrow">${houseItems.length} direct from ${esc(b)}
             <span class="dimmer">not part of the UK comparison</span></p>
           <ul class="house-grid">${chunked(houseItems, houseCard)}</ul>`
        : ''
    }`;
}

/* ── explore: notes ──────────────────────────────────────────────────────── */

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/**
 * The vertical A-to-Z index strip, iOS Contacts-style. Mobile only — hidden
 * on desktop by CSS (`:root[data-layout="desktop"]`), where a mouse can
 * already reach any point in a shorter list without one. `aria-hidden`
 * unconditionally, on both layouts: this is a supplementary rapid-jump
 * gesture over content that already exists as an ordinary, keyboard-reachable
 * list right next to it, not a second copy of that content, so nothing here
 * needs its own accessible path — the letters underneath do.
 *
 * A letter with nothing under it still renders, just dimmed and inert
 * (`data-empty`, no `data-letter`), rather than being left out: removing it
 * would shift every letter below it sideways under the finger mid-drag,
 * which is the one thing an index strip must never do.
 */
function alphaScrubber(activeLetters: Set<string>): string {
  const letters = ALPHABET.map((l) =>
    activeLetters.has(l)
      ? `<span class="alpha-scrubber-letter" data-letter="${l}">${l}</span>`
      : `<span class="alpha-scrubber-letter" data-empty>${l}</span>`,
  ).join('');
  return `<div class="alpha-scrubber" data-alpha-scrubber aria-hidden="true">${letters}</div>`;
}

function notesPanel(): string {
  const filtered = NOTE_INDEX.filter(
    (n) => state.noteLayer === 'any' || n.layers.has(state.noteLayer),
  );
  const list = [...filtered].sort((a, b) =>
    state.noteSort === 'az' ? a.name.localeCompare(b.name) : b.count - a.count || a.name.localeCompare(b.name),
  );

  const controls = `<div class="controls">
    ${control('note-sort', 'Sort notes', ICON_SORT, [
      { value: 'common', label: 'Most Common' },
      { value: 'az', label: 'A To Z' },
    ], state.noteSort)}
    ${control('note-layer', 'Filter notes', ICON_FILTER, [
      { value: 'any', label: 'Any Layer' },
      { value: 'top', label: 'Top Notes' },
      { value: 'middle', label: 'Middle Notes' },
      { value: 'base', label: 'Base Notes' },
    ], state.noteLayer)}
  </div>`;

  // "Fragrance Note Groups" as the three layers the sourced note data
  // genuinely carries — top, middle, base — rather than a scent-family
  // taxonomy (floral, woody, gourmand...) this dataset has no real source
  // for. Tapping one filters the alphabetical list below exactly like the
  // dropdown above does; tapping the active one again clears it. "All"
  // is the same clear, offered as its own card rather than only reachable
  // by deselecting — the combined view every note actually starts on.
  const groupCard = (id: NoteLayerFilter, label: string) => {
    const count = id === 'any' ? NOTE_INDEX.length : NOTE_INDEX.filter((n) => n.layers.has(id)).length;
    return `<button class="note-group-card${state.noteLayer === id ? ' on' : ''}" data-note-layer="${id}">
      <span class="note-group-count">${count}</span>
      <span class="note-group-label">${label} Notes</span>
    </button>`;
  };
  const groups = `<div class="notes-groups">
    <p class="section-label t-eyebrow">Note Groups</p>
    <div class="notes-groups-row">
      ${groupCard('any', 'All')}
      ${groupCard('top', 'Top')}
      ${groupCard('middle', 'Middle')}
      ${groupCard('base', 'Base')}
    </div>
  </div>`;

  if (list.length === 0) {
    return `${groups}${controls}<p class="empty-note t-body">No notes recorded for that layer yet.</p>`;
  }

  // The same row-list shape as Brands, including the alphabetical dividers —
  // but only under the A-to-Z sort. Under "most common" the list is ranked by
  // count, not by letter, so a divider between two counts would land on
  // whichever letter their names happen to start with and break up entries
  // that belong together in the ranking. The scrubber follows the same rule:
  // it only makes sense to jump to a letter the list is actually ordered by.
  let out = '';
  let current = '';
  const seenLetters = new Set<string>();
  for (const n of list) {
    if (state.noteSort === 'az') {
      const initial = (n.name[0] ?? '').toUpperCase();
      if (initial !== current) {
        current = initial;
        seenLetters.add(initial);
        out += `<li class="alpha-break" data-alpha="${esc(initial)}" aria-hidden="true"><span>${esc(initial)}</span><i></i></li>`;
      }
    }
    out += `<li><button class="brand-row note-row t-title" data-note="${esc(n.name)}">
      <span>${esc(titleCase(n.name))}</span><span class="note-row-count t-count">(${n.count})</span>
    </button></li>`;
  }

  return `${groups}
    ${controls}
    <p class="panel-note t-body">Only notes a shop has explicitly published. ${DEMO_FRAGRANCES.filter((f) => f.notes).length} of ${DEMO_FRAGRANCES.length} fragrances list them.</p>
    <div class="notes-browse">
      <p class="section-label t-eyebrow">Browse Alphabetically</p>
      <div class="notes-browse-scroll" data-notes-scroll>
        <ul class="brand-list">${out}</ul>
      </div>
      ${state.noteSort === 'az' ? alphaScrubber(seenLetters) : ''}
    </div>`;
}

/**
 * A note's own profile: this page already is that, and has been since Notes
 * shipped — a real URL (survives Back, is directly linkable), every
 * fragrance that carries it. What was missing is the note's own layer
 * breakdown, added below as tappable chips that filter the list under
 * them exactly the way the group cards on notesPanel do. Real counts read
 * straight from NOTE_INDEX, not a written description: this codebase has no
 * source for what a note "smells like" beyond what a retailer's own listing
 * says, and inventing one here would be exactly the kind of fabricated fact
 * this app exists to avoid.
 */
function noteView(): string {
  const entry = NOTE_INDEX.find((n) => n.name === state.noteName);
  const filtered = fragrancesWithNote(state.noteName, state.noteLayer).filter(
    (f) => state.noteDetailFilter === 'all' || f.tier === state.noteDetailFilter,
  );
  const list = sortFragrances(applyFacets(filtered), state.noteDetailSort);

  const controls = `<div class="controls">
    ${listSortControl('note-detail-sort', state.noteDetailSort)}
    ${tierFilterControl('note-detail-filter', state.noteDetailFilter)}
    ${facetsBlock(filtered)}
  </div>`;

  const layerChips = entry
    ? (['top', 'middle', 'base'] as NoteLayer[])
        .filter((l) => entry.layers.has(l))
        .map((l) => {
          const count = fragrancesWithNote(state.noteName, l).length;
          return `<button class="note-chip${state.noteLayer === l ? ' on' : ''}" data-note-layer="${l}">${titleCase(l)} &middot; ${count}</button>`;
        })
        .join('')
    : '';

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="page-head"><h2 class="t-page">${esc(titleCase(state.noteName))}</h2><span class="count t-count">${list.length}</span></div>
    ${layerChips ? `<p class="note-chips note-chips-profile">${layerChips}</p>` : ''}
    <p class="panel-note t-body">Fragrances listing ${esc(titleCase(state.noteName))}${state.noteLayer === 'any' ? '' : ` as a ${state.noteLayer} note`}.</p>
    ${controls}
    ${fragranceList(list, 'Nothing matches that filter.')}`;
}

/* ── explore: search ─────────────────────────────────────────────────────── */

/**
 * The results half of the Search tab — its own function because the live
 * keystroke handler further down replaces just this block's innerHTML rather
 * than re-rendering the whole page, and needs the exact same markup.
 */
function searchResultsHtml(q: string): string {
  if (!q) return `<p class="empty-note t-body">Type to search all ${DEMO_FRAGRANCES.length} fragrances.</p>`;
  const filtered = visibleFragrances();
  const list = applyFacets(filtered);
  return `<div class="page-head"><h2 class="t-page">Results</h2><span class="count t-count">${list.length}</span></div>
    <div class="controls">${facetsBlock(filtered)}</div>
    ${fragranceList(list, 'Nothing matches that search.')}`;
}

function searchPanel(): string {
  const q = state.query.trim();
  return `
    <label class="search-big">
      ${ICON_SEARCH}
      <input type="search" id="search-full" placeholder="Search by brand, name or concentration"
        value="${esc(state.query)}" aria-label="Search fragrances" />
    </label>
    ${
      state.brand
        ? `<p class="panel-note t-body">Filtered to ${esc(state.brand)}. <button class="link-btn" data-clear-brand>Clear</button></p>`
        : ''
    }
    <div class="search-results">${searchResultsHtml(q)}</div>`;
}

/* ── explore shell ───────────────────────────────────────────────────────── */

const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'brands', label: 'Brands' },
  { id: 'retailers', label: 'Retailers' },
  { id: 'notes', label: 'Notes' },
  { id: 'search', label: 'Search' },
];

function exploreView(): string {
  const panel =
    state.tab === 'brands'
      ? brandsPanel()
      : state.tab === 'retailers'
        ? retailersPanel()
        : state.tab === 'notes'
          ? notesPanel()
          : searchPanel();
  return `<div class="explore">${panel}</div>`;
}


/* ── houses ──────────────────────────────────────────────────────────────── */

/**
 * Fragrance houses read direct from their own storefronts.
 *
 * These are deliberately not in the comparison and carry no sterling price.
 * Every one is sold in the house's own currency, and the offer pipeline —
 * bestOffer, the delivered-price sort, the discount badges — is sterling all
 * the way down. Converting at a rate we invented and presenting the result as
 * what a UK buyer pays would be a fabricated price, so the house's own figure
 * is shown in its own currency and labelled as exactly that.
 *
 * What is real here: the product exists, the house photographed it, and that
 * is the price on the house's own page. What is missing is any claim about
 * the UK. Shown on that house's own brand page (see brandView) rather than a
 * section of its own, because a house with no UK listing yet is still a
 * brand, not a different kind of thing.
 */
/** One house product. Extracted so the chunked renderer can call it per item. */
function houseCard(p: (typeof HOUSE_PRODUCTS)[number]): string {
  return `<li class="house-card">
    <a href="${esc(p.url)}" target="_blank" rel="noopener nofollow sponsored">
      ${
        /* The onerror is the same protection demo/photo.ts's productArt has
           carried since photography went hot-linked, and this was the one
           product-image surface on the site still without it. Every one of
           these is hot-linked from the house's own storefront, and a house
           that deletes a product, reshuffles its CDN or turns on hot-link
           protection would otherwise leave a browser's broken-image glyph in
           the grid. On failure the img replaces itself with the identical
           placeholder the no-image branch below already renders, so the two
           cases are indistinguishable on screen — which is the point: the
           reader sees a shop with no photo, not a page that is broken.

           Written as DOM rather than markup because an inline handler cannot
           carry nested double quotes, and built to match the branch below
           exactly rather than approximately. */
        p.image
          ? `<img class="house-img" src="${esc(p.image)}" alt="" loading="lazy"
               decoding="async" referrerpolicy="no-referrer"
               onerror="const s=document.createElement('span');s.className='house-img house-img-none';s.setAttribute('aria-hidden','true');this.replaceWith(s)" />`
          : `<span class="house-img house-img-none" aria-hidden="true"></span>`
      }
      <span class="house-name">${esc(p.name)}</span>
      <span class="house-price">${
        p.nativePrice
          ? `${esc(p.nativePrice.currency)} ${p.nativePrice.amount.toFixed(2)}`
          : 'Price not published'
      }</span>
      <span class="house-caveat">at the house, not a UK price</span>
    </a>
  </li>`;
}

/* ── settings ────────────────────────────────────────────────────────────── */

const MODE_OPTIONS: { id: DisplayMode; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'Use System Setting' },
];

const CONTACT_TYPES = ['An issue', 'A suggestion', 'A promotional enquiry', 'Something else'] as const;

function settingsView(): string {
  return `
    <button class="back" data-back>Back</button>
    <article class="doc settings-doc">
      <h2 class="t-page">Settings</h2>

      ${SUPABASE_CONFIGURED ? `<button class="account-entry" data-go-account>
        <span>${accountEntryLabel()}</span>${ICON_CHEVRON}
      </button>` : ''}

      <div class="seg-group">
        <p class="seg-label t-eyebrow">Theme</p>
        <div class="seg" role="group" aria-label="Display theme">
          ${MODE_OPTIONS.map(
            (m) =>
              `<button class="seg-btn ${state.mode === m.id ? 'on' : ''}" data-set-mode="${m.id}">${esc(m.label)}</button>`,
          ).join('')}
        </div>
      </div>

      <div class="seg-group">
        <p class="seg-label t-eyebrow">Layout</p>
        <div class="seg" role="group" aria-label="Page layout">
          <button class="seg-btn seg-icon ${state.layout === 'mobile' ? 'on' : ''}" data-set-layout="mobile" aria-label="Mobile layout">${ICON_MOBILE}<span>Mobile</span></button>
          <button class="seg-btn seg-icon ${state.layout === 'desktop' ? 'on' : ''}" data-set-layout="desktop" aria-label="Desktop layout">${ICON_DESKTOP}<span>Desktop</span></button>
        </div>
      </div>

      <p class="settings-note t-caption">Your preference will be remembered on this device.</p>

      <h3 class="t-section">Contact us</h3>
      <form id="contact-form" class="contact-form">
        <label class="field">
          <span>What is this about</span>
          <select id="contact-type">
            ${CONTACT_TYPES.map((t) => `<option>${t}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Describe it</span>
          <textarea id="contact-body" rows="4" placeholder="Tell us what is going on"></textarea>
        </label>
        <button type="submit" class="contact-send">Send</button>
      </form>
      <p id="contact-confirm" class="contact-confirm" hidden></p>

      <h3 class="t-section">Follow</h3>
      <a class="social" href="https://www.tiktok.com/@yannysniffs">
        ${ICON_TIKTOK}<span>TikTok</span><span class="social-handle">@yannysniffs</span>
      </a>
      <a class="social" href="https://www.instagram.com/yannysniffs">
        ${ICON_INSTAGRAM}<span>Instagram</span><span class="social-handle">@yannysniffs</span>
      </a>

      <h3 class="t-section">Legal</h3>
      <nav class="foot-links">
        ${LEGAL_PAGES
          // About has its own place in the top bar now, so it is not repeated
          // here — this list is the legal and policy documents.
          .filter((p) => p.id !== 'about')
          .map((p) => `<button class="link-btn" data-page="${p.id}">${esc(p.short)}</button>`)
          .join('')}
      </nav>
      <p class="foot-legal dimmer">© ${new Date().getFullYear()} ${esc(COMPANY.name)}.</p>
    </article>`;
}

/* ── account ─────────────────────────────────────────────────────────────── */

/** What the Settings entry row says: enough to act on without opening the page. */
function accountEntryLabel(): string {
  const s = accountState(accountStateInput());
  switch (s.kind) {
    // Unconfigured never reaches here — the row itself is not rendered (see
    // the SUPABASE_CONFIGURED guard on the Settings entry) — but the label
    // has to answer for every state the type admits rather than assume that.
    case 'unconfigured':
    case 'loading':
      return 'Account';
    case 'signedOut':
      return 'Sign in or create an account';
    case 'verify':
      return 'Verify your email';
    case 'signedIn':
      return s.email === '' ? 'Account' : s.email;
  }
}

/**
 * Signed out: a tabbed sign in / sign up form. Signed in but unverified: a
 * "check your email" state with a resend action, since a Supabase account
 * exists the moment signUp() returns but is not yet allowed to do anything
 * that assumes a real, controlled address. Signed in and verified: the
 * account itself. Never a form that fails on every submit — SUPABASE_CONFIGURED
 * being false renders as a plain, honest "not live yet" state instead.
 */
function accountView(): string {
  const s = accountState(accountStateInput());

  if (s.kind === 'unconfigured') {
    // Microcopy cull, 2026-08-25 (docs/MICROCOPY-INVENTORY-2026-08-21.md row
    // 78): the line used to end "Check back soon." That carried no fact —
    // nobody has committed this deployment to a date — so it was a promise
    // the site is not in a position to make, which is the one thing this
    // site's copy is not allowed to do. What is left is the whole honest
    // answer on its own.
    return `
      <button class="back" data-back>Back</button>
      <article class="doc settings-doc">
        <h2 class="t-page">Account</h2>
        <p>Accounts are not switched on for this deployment yet.</p>
      </article>`;
  }

  if (s.kind === 'loading') {
    return `<button class="back" data-back>Back</button><article class="doc settings-doc"><h2 class="t-page">Account</h2><p>Loading.</p></article>`;
  }

  if (s.kind === 'signedIn') {
    return `
      <button class="back" data-back>Back</button>
      <article class="doc settings-doc">
        <h2 class="t-page">Account</h2>
        <p class="account-note">Signed in as ${esc(s.email)}.</p>
        <button class="contact-send" id="auth-sign-out">Sign out</button>
        ${wishlistSectionHtml()}
      </article>`;
  }

  if (s.kind === 'verify') {
    // Two different readers land here and are owed the same instruction.
    //
    //   hasSession true  — Supabase issued a session but has not recorded a
    //                      confirmed address. They can sign out of it.
    //   hasSession false — the ordinary case with "Confirm email" switched
    //                      on: signUp() succeeded and deliberately handed
    //                      back no session at all, so there is nothing to
    //                      sign out of. Before this branch existed, that
    //                      reader saw the empty form re-render and had no
    //                      way to tell their signup had worked.
    //
    // The way back for the second one is to forget the pending address, not
    // to sign out — see the #auth-leave-pending handler.
    const leave = s.hasSession
      ? `<button class="link-btn" id="auth-sign-out-pending">Sign out</button>`
      : `<button class="link-btn" id="auth-leave-pending">Back to sign in</button>`;
    return `
      <button class="back" data-back>Back</button>
      <article class="doc settings-doc">
        <h2 class="t-page">Verify your email</h2>
        <p class="account-note">
          We sent a link to ${esc(s.email === '' ? 'your email address' : s.email)}. Follow it to finish setting up your
          account, then come back here.
        </p>
        <button class="contact-send" id="auth-resend" data-email="${esc(s.email)}">Resend the email</button>
        <p id="auth-notice" class="contact-confirm" hidden></p>
        ${leave}
      </article>`;
  }

  const signUpTab = state.authTab === 'signUp';
  return `
    <button class="back" data-back>Back</button>
    <article class="doc settings-doc">
      <h2 class="t-page">Account</h2>

      <div class="seg" role="group" aria-label="Sign in or sign up">
        <button class="seg-btn ${!signUpTab ? 'on' : ''}" data-auth-tab="signIn">Sign in</button>
        <button class="seg-btn ${signUpTab ? 'on' : ''}" data-auth-tab="signUp">Sign up</button>
      </div>

      <form id="${signUpTab ? 'auth-signup-form' : 'auth-signin-form'}" class="contact-form">
        <label class="field">
          <span>Email</span>
          <input type="email" id="auth-email" autocomplete="email" required />
        </label>
        <label class="field">
          <span>Password</span>
          <!-- The reveal is a real button with a real word on it, not a bare
               eye glyph: an eye alone never says whether it means "showing"
               or "press to show", and the two readings are opposites. It
               carries aria-pressed so a screen reader gets the state rather
               than inferring it from a label that changed. It matters most on
               the Sign up tab, where a typo in a password nobody can see is
               invisible and unrecoverable. -->
          <span class="pw-field">
            <input type="password" id="auth-password" autocomplete="${signUpTab ? 'new-password' : 'current-password'}" required minlength="8" />
            <button type="button" class="pw-reveal" id="auth-password-reveal"
                    aria-pressed="false" aria-controls="auth-password">Show</button>
          </span>
        </label>
        <button type="submit" class="contact-send" ${state.authBusy ? 'disabled' : ''}>
          ${signUpTab ? 'Create account' : 'Sign in'}
        </button>
      </form>

      ${!signUpTab ? `<button class="link-btn" id="auth-forgot">Forgot your password</button>` : ''}

      ${state.authError ? `<p class="auth-error">${esc(state.authError)}</p>` : ''}
      ${state.authResetSent ? `<p class="contact-confirm">If that address has an account, a reset link is on its way.</p>` : ''}
    </article>`;
}

/* ── legal ───────────────────────────────────────────────────────────────── */

/**
 * About, as its own top-level page beside Explore and Settings.
 *
 * Shares its copy with the legal-page registry so there is one source for the
 * text, but renders without a Back control: this is a nav destination reached
 * from the top bar, not a leaf you arrived at from somewhere else.
 */
/**
 * What a wrong address gets.
 *
 * Every in-app path is served by demo/404.html, which is this same document,
 * so a genuinely missing page and a working one arrive by the identical
 * route. Until 2026-08-17 the router answered both with the homepage, which
 * left a reader with a broken link no way of telling their link was broken.
 *
 * This says so plainly and offers the three things someone with a dead link
 * actually wants: the search box, the catalogue, and the way home. No
 * apology, no illustration.
 */
function notFoundView(): string {
  const path = state.notFoundPath.replace(/^\/+/, '/');
  return `
    <article class="doc">
      <h2 class="t-page">Page not found</h2>
      <p class="t-body">Nothing on this site answers to
        ${path && path !== '/' ? `<code>${esc(path)}</code>` : 'that address'}.
        It may have been a fragrance or a shop that has since been delisted.</p>
      <p class="t-body">Search the catalogue, or start from one of these:</p>
      <p class="notfound-links">
        <button class="link-btn" data-goto="home">Home</button>
        <button class="link-btn" data-goto="browse">Search ${DEMO_FRAGRANCES.length.toLocaleString('en-GB')} fragrances</button>
        <button class="link-btn" data-tab="brands">Brands</button>
        <button class="link-btn" data-tab="retailers">Shops</button>
      </p>
    </article>`;
}

function aboutView(): string {
  const page = legalPage('about');
  if (!page) return homeView();
  return `
    <article class="doc">
      <h2 class="t-page">${esc(page.title)}</h2>
      ${page.body}
    </article>`;
}

function legalView(): string {
  const page = legalPage(state.legalId);
  if (!page) return homeView();
  return `
    <button class="back" data-back>Back</button>
    <article class="doc">
      <h2 class="t-page">${esc(page.title)}</h2>
      ${page.body}
    </article>`;
}


/* ── long lists ──────────────────────────────────────────────────────────────
   Rendering an entire result set in one innerHTML assignment was the single
   biggest cause of the app feeling sluggish: browse-all built roughly 35,000
   nodes and 769 images synchronously, blocking the main thread for about two
   seconds before anything appeared. Measured rather than guessed — scrolling
   and the ambient background were both already holding 60fps, so the animation
   was never the problem.

   So a list paints its first screenful immediately and appends the rest a chunk
   at a time as the reader approaches the end. Nothing is hidden or dropped: the
   same items arrive, just not all in the same frame. */

const CHUNK = 48;

/**
 * Lists on the current page that still have items waiting, keyed by sentinel id.
 *
 * A map rather than a single slot because a page can hold more than one chunked
 * list: the Houses tab renders one grid per house, so a single shared slot let
 * the second group overwrite the first and the first could never finish loading
 * — it sat at 48 of its items forever with a dead sentinel below it.
 */
const pendingLists = new Map<string, { items: unknown[]; render: (item: unknown) => string }>();
let listObserver: IntersectionObserver | null = null;
let chunkSeq = 0;

/** Clear anything held for the previous page. Called at the top of render(). */
function resetChunkedLists(): void {
  listObserver?.disconnect();
  listObserver = null;
  pendingLists.clear();
  chunkSeq = 0;
}

/** Emit the first chunk plus a sentinel, and hold the remainder for later. */
function chunked<T>(items: readonly T[], renderItem: (item: T) => string): string {
  const first = items.slice(0, CHUNK);
  const rest = items.slice(CHUNK);
  if (rest.length === 0) return first.map(renderItem).join('');

  const id = `chunk-${++chunkSeq}`;
  pendingLists.set(id, {
    items: rest as unknown[],
    render: renderItem as (i: unknown) => string,
  });
  return (
    first.map(renderItem).join('') +
    `<li class="grid-more" data-more="${id}" aria-hidden="true"></li>`
  );
}

/**
 * Watch every sentinel on the page and append the next chunk as it nears view.
 *
 * insertAdjacentHTML on the sentinel leaves every already-painted tile
 * untouched, so appending never re-creates or re-decodes what is on screen.
 * The 600px margin means the next chunk is built before the reader reaches the
 * gap where it would otherwise appear.
 */
function mountChunkedList(): void {
  listObserver?.disconnect();
  listObserver = null;
  if (pendingLists.size === 0) return;

  listObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const el = entry.target as HTMLElement;
        const id = el.dataset.more;
        const held = id ? pendingLists.get(id) : undefined;
        if (!id || !held) continue;

        const next = held.items.slice(0, CHUNK);
        const rest = held.items.slice(CHUNK);
        el.insertAdjacentHTML('beforebegin', next.map(held.render).join(''));

        if (rest.length === 0) {
          pendingLists.delete(id);
          listObserver?.unobserve(el);
          el.remove();
        } else {
          pendingLists.set(id, { items: rest, render: held.render });
        }
      }
    },
    { rootMargin: '600px 0px' },
  );

  for (const el of document.querySelectorAll('[data-more]')) listObserver.observe(el);
}

/* ── price history tooltip ──────────────────────────────────────────────────
   A hover shows it, a tap pins it — the same touch has no hover state to fall
   back on, so tapping a point has to be the way it stays open rather than
   flickering shut the instant the finger lifts. Only ever one tip live at a
   time, tracked here rather than per-dot, since a fresh render replaces every
   dot in the DOM on navigation anyway. */
let pinnedHistoryDot: Element | null = null;

function positionHistoryTip(dot: Element): void {
  const chart = dot.closest('[data-history-chart]');
  const tip = chart?.querySelector('[data-history-tip]') as HTMLElement | null;
  if (!chart || !tip) return;

  // A no-price day has no retailer to name, so the separator has to go too —
  // otherwise the tip reads " · 3 Aug" with a dangling dot in front of it.
  const retailer = dot.getAttribute('data-retailer') ?? '';
  const date = dot.getAttribute('data-date') ?? '';
  tip.innerHTML =
    `<b>${esc(dot.getAttribute('data-price') ?? '')}</b>` +
    `<span>${retailer === '' ? esc(date) : `${esc(retailer)} · ${esc(date)}`}</span>`;
  tip.hidden = false;

  const chartRect = chart.getBoundingClientRect();
  const dotRect = dot.getBoundingClientRect();
  const dotX = dotRect.left + dotRect.width / 2 - chartRect.left;
  const y = dotRect.top - chartRect.top;

  // Centring the tip on the dot is right everywhere except the two points
  // that matter most — the first and, especially, the last (the current
  // price, the one someone is most likely to check) — which sit flush
  // against the chart's own edges and would push the tip half off-screen.
  // Measured after the content is in and unhidden, since an empty or
  // stale-content tip has the wrong width to clamp against.
  const tipWidth = tip.offsetWidth;
  const left = Math.min(Math.max(dotX - tipWidth / 2, 4), chartRect.width - tipWidth - 4);

  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(y, 40)}px`;
}

function hideHistoryTip(): void {
  for (const tip of document.querySelectorAll('[data-history-tip]')) (tip as HTMLElement).hidden = true;
  pinnedHistoryDot = null;
}

/* ── A-to-Z scrubber ─────────────────────────────────────────────────────────
   Touch-drag and tap both resolve to the same question — which letter is the
   finger over — asked continuously on touchstart and every touchmove, so a
   tap is simply a drag with zero movement rather than a separate code path. */

/**
 * Divides the strip's own height into 26 even bands and reads off which one
 * a Y coordinate falls in, rather than hit-testing via elementFromPoint: the
 * letters are laid out in one straight column with nothing else overlapping
 * them, so the geometry is simpler and does not care whether the coordinate
 * is technically still over a `<span>` once a fast drag has outrun layout.
 * A band with nothing in it (no notes for that letter) resolves to the
 * nearest real one instead of going dead, so dragging through a gap in the
 * alphabet still tracks continuously — the same feel as iOS's own strip.
 */
function letterAtY(scrubber: HTMLElement, clientY: number): string | null {
  const rect = scrubber.getBoundingClientRect();
  if (rect.height === 0) return null;
  const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 0.999);
  const index = Math.floor(ratio * ALPHABET.length);
  const isActive = (i: number) => !!scrubber.querySelector(`.alpha-scrubber-letter[data-letter="${ALPHABET[i]}"]`);
  if (isActive(index)) return ALPHABET[index]!;
  for (let d = 1; d < ALPHABET.length; d++) {
    if (index - d >= 0 && isActive(index - d)) return ALPHABET[index - d]!;
    if (index + d < ALPHABET.length && isActive(index + d)) return ALPHABET[index + d]!;
  }
  return null;
}

/** Instant, not smooth: an animated scroll lags a fast-moving finger, and the
 *  point of a scrubber is that the list keeps pace with the drag exactly. */
function jumpToLetter(letter: string): void {
  document.querySelector(`[data-notes-scroll] [data-alpha="${letter}"]`)?.scrollIntoView({ block: 'start' });
}

let scrubberBubble: HTMLElement | null = null;

function showScrubberBubble(letter: string, x: number, y: number): void {
  if (!scrubberBubble) {
    scrubberBubble = document.createElement('div');
    scrubberBubble.className = 'alpha-scrubber-bubble';
    document.body.appendChild(scrubberBubble);
  }
  scrubberBubble.textContent = letter;
  // Left of the finger and vertically centred on it, so the strip along the
  // right edge and the bubble it spawns never sit on top of each other.
  scrubberBubble.style.left = `${x - 90}px`;
  scrubberBubble.style.top = `${y - 32}px`;
}

function hideScrubberBubble(): void {
  scrubberBubble?.remove();
  scrubberBubble = null;
}

/* ── routing ─────────────────────────────────────────────────────────────────
   The view functions and render() know nothing about URLs. Everything here is
   a translation between `state` and the address bar, so routing stays
   reversible and rendering stays ignorant of it. */

/** Where we currently are, as a route. */
/**
 * Write the tags into the live document.
 *
 * Updates in place rather than appending, so a reader who navigates twenty
 * times does not accumulate twenty canonical tags — a mistake that turns one
 * clear instruction to a crawler into twenty contradictory ones.
 */
export function applyHead(tags: HeadTags): void {
  document.title = tags.title;

  setMeta('name', 'description', tags.description);
  setLink('canonical', tags.canonical);

  // og:title and og:description are updated too. A scraper will not see it
  // (see this file's header), but a browser extension, a reading-list tool or
  // an in-page share that reads the live DOM will, and keeping them in step
  // with the title costs nothing.
  setMeta('property', 'og:title', tags.title);
  setMeta('property', 'og:description', tags.description);
  setMeta('property', 'og:url', tags.canonical);

  if (tags.noindex) setMeta('name', 'robots', 'noindex, follow');
  else document.head.querySelector('meta[name="robots"]')?.remove();
}

function setMeta(keyAttr: 'name' | 'property', key: string, value: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${keyAttr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(keyAttr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Resolve the facts head.ts needs to describe whatever is on screen.
 *
 * Every value handed over is read from the catalogue that is already
 * rendered, never composed for the benefit of the description: if a fragrance
 * has no priced offer, the detail is simply omitted rather than softened into
 * a claim. head.ts does the wording; this does the looking up.
 */
function headInputForState(): HeadInput {
  const route = currentRoute();

  switch (state.view) {
    case 'detail': {
      const frag = fragranceById(state.fragranceId);
      if (!frag) return { route };
      const rows = rowsFor(frag);
      const best = bestOffer(rows);
      const shops = rows.length;
      // Only a delivered price is quoted here. An item price without delivery
      // would read as the same kind of figure in a search result while being
      // a different one, which is the distinction the whole site turns on.
      const detail =
        best && best.deliveredPriceGbp !== null && shops > 0
          ? `from ${formatGbp(best.deliveredPriceGbp)} delivered, across ${shops} ${shops === 1 ? 'shop' : 'shops'}`
          : shops > 0
            ? `stocked by ${shops} ${shops === 1 ? 'shop' : 'shops'} we track`
            : undefined;
      return {
        route,
        leafName: `${frag.brand} ${frag.name}${frag.sizeMl ? ` ${frag.sizeMl}ml` : ''}`,
        leafDetail: detail,
      };
    }

    case 'retailer': {
      const r = getRetailer(state.retailerId);
      if (!r) return { route };
      const count = listingCountAt(r.id);
      return {
        route,
        leafName: r.name,
        leafDetail: count > 0 ? `${count.toLocaleString('en-GB')} bottles` : undefined,
      };
    }

    case 'brand': {
      const count = DEMO_FRAGRANCES.filter((f) => f.brand === state.brandProfile).length;
      return {
        route,
        leafName: state.brandProfile,
        leafDetail: count > 0 ? `${count} in the catalogue` : undefined,
      };
    }

    case 'note': {
      const count = fragrancesWithNote(state.noteName, 'any').length;
      return {
        route,
        leafName: state.noteName,
        leafDetail: count > 0 ? `${count.toLocaleString('en-GB')} of them` : undefined,
      };
    }

    case 'legal':
      return { route, leafName: legalPage(state.legalId)?.title };

    default:
      return {
        route,
        productCount: DEMO_FRAGRANCES.length,
        retailerCount: SHOP_COUNT,
      };
  }
}

function currentRoute(): Route {
  const query: Record<string, string> = {};
  if (state.query) query.q = state.query;

  switch (state.view) {
    case 'home': return { name: 'home', param: '', query: {} };
    case 'deals': return { name: 'deals', param: '', query: {} };
    case 'browse': return { name: 'search', param: '', query };
    case 'detail': return { name: 'fragrance', param: state.fragranceId, query: {} };
    case 'retailer': return { name: 'retailer', param: state.retailerId, query: {} };
    case 'brand': return { name: 'brand', param: slugify(state.brandProfile), query: {} };
    case 'note': return { name: 'note', param: slugify(state.noteName), query: {} };
    case 'legal': return { name: 'legal', param: state.legalId, query: {} };
    case 'notFound': return { name: 'notFound', param: state.notFoundPath, query: {} };
    case 'about': return { name: 'about', param: '', query: {} };
    case 'design': return { name: 'design', param: '', query: {} };
    case 'settings': return { name: 'settings', param: '', query: {} };
    case 'account': return { name: 'account', param: '', query: {} };
    case 'explore':
      return {
        name: state.tab === 'search' ? 'search' : (state.tab as RouteName),
        param: '',
        query: state.tab === 'search' ? query : {},
      };
  }
}

/**
 * Apply a route to `state`.
 *
 * Returns false when the route names something that does not exist — a stale
 * bookmark to a delisted fragrance, say — so the caller can fall back to home
 * rather than rendering an empty leaf.
 */
function applyRoute(route: Route): boolean {
  state.query = route.query.q ?? '';

  switch (route.name) {
    case 'home': state.view = 'home'; return true;
    case 'notFound':
      state.notFoundPath = route.param;
      state.view = 'notFound';
      return true;
    case 'about': state.view = 'about'; return true;
    case 'design': state.view = 'design'; return true;
    case 'settings': state.view = 'settings'; return true;
    case 'account': state.view = 'account'; return true;

    case 'search':
      // The bar search and the Search subpage are the same destination.
      state.view = 'browse';
      return true;

    // Deals is a top level view in its own right now, not a tab under
    // Explore, so it gets state.view set directly rather than falling into
    // the brands/retailers/notes case below that also sets state.tab.
    case 'deals': state.view = 'deals'; return true;

    case 'brands': case 'retailers': case 'notes':
      state.view = 'explore';
      state.tab = route.name as ExploreTab;
      return true;

    case 'fragrance': {
      if (!fragranceById(route.param)) return false;
      state.fragranceId = route.param;
      state.view = 'detail';
      return true;
    }
    case 'retailer': {
      if (!getRetailer(route.param)) return false;
      state.retailerId = route.param;
      state.view = 'retailer';
      return true;
    }
    case 'brand': {
      // Brand names are free text, so the slug is resolved by scanning. See
      // the collision note in router.ts.
      const brand = BRANDS.find((b) => slugify(b) === route.param);
      if (!brand) return false;
      state.brandProfile = brand;
      state.view = 'brand';
      return true;
    }
    case 'note': {
      // NOTE_INDEX is an array of {name, count, layers}, not a lookup keyed
      // by name — Object.keys() on it silently returned numeric indices
      // ('0', '1', ...) instead, so a slug never matched anything and every
      // direct link to a note (a reload, a shared URL, Back landing on one)
      // fell through to home instead. Only ever exposed via a real URL, not
      // the in-app buttons that set state.noteName directly — which is
      // exactly why it went unnoticed.
      const note = NOTE_INDEX.find((n) => slugify(n.name) === route.param)?.name;
      if (!note) return false;
      state.noteName = note;
      state.view = 'note';
      return true;
    }
    case 'legal': {
      if (!legalPage(route.param)) return false;
      state.legalId = route.param;
      state.view = 'legal';
      return true;
    }
  }
}

/**
 * How many in-app navigations deep the current history entry is.
 *
 * Carried in `history.state` itself rather than a module-level counter,
 * because a counter would only track pushes we made in this tab and would
 * drift the moment the reader used the browser's own Back/Forward — those
 * fire `popstate`, not our code, and land on whatever entry the browser
 * restores. `history.state` is restored right along with the entry by the
 * browser itself, on both Back and Forward, so reading it here always
 * reflects the page actually on screen rather than a copy we forgot to
 * update. render() replacing the DOM every navigation cannot desync it,
 * because it never touches the DOM in the first place.
 */
function historyDepth(): number {
  return (window.history.state as { depth?: number } | null)?.depth ?? 0;
}

/** Push the current state onto history, or replace the top of it. */
function syncUrl(mode: 'push' | 'replace' = 'push'): void {
  const url = basePath().replace(/\/$/, '') + routeToPath(currentRoute());
  const current = window.location.pathname + window.location.search;
  if (url === current) return;
  const depth = mode === 'push' ? historyDepth() + 1 : historyDepth();
  try {
    window.history[mode === 'push' ? 'pushState' : 'replaceState']({ depth }, '', url);
  } catch {
    // A sandboxed frame or a file:// document rejects pushState. The app is
    // fully usable without it, so this is not worth surfacing.
  }
}

/**
 * Where Back should land when there is no in-app history entry behind the
 * current one to return to — a fragrance opened from a shared link, a
 * bookmark, or GitHub Pages serving the path through 404.html, none of which
 * push anything onto the stack before this page renders. `history.back()`
 * would walk off the site in that case, so the site's own hierarchy stands
 * in for "where the reader came from" instead: a retailer, brand or note
 * page falls back to its own list, legal and account fall back to Settings
 * (the only place either is linked from), a fragrance falls back to the
 * current search results if a query or brand filter is already active
 * (mirroring what the bar search would show) and home otherwise, and
 * anything else that is not already a top-level page falls back to home.
 */
function fallbackBackRoute(): Route {
  switch (state.view) {
    case 'detail':
      return state.query || state.brand
        ? { name: 'search', param: '', query: state.query ? { q: state.query } : {} }
        : { name: 'home', param: '', query: {} };
    case 'retailer': return { name: 'retailers', param: '', query: {} };
    case 'brand': return { name: 'brands', param: '', query: {} };
    case 'note': return { name: 'notes', param: '', query: {} };
    case 'legal':
    case 'account':
      return { name: 'settings', param: '', query: {} };
    default:
      return { name: 'home', param: '', query: {} };
  }
}

/**
 * The one handler behind every "Back" button on the site.
 *
 * When the current entry was reached by an in-app navigation (`historyDepth()
 * > 0`), the previous in-app view really is the previous entry in the
 * browser's own history, so real Back is used — `history.back()` — and
 * `popstate` (wired below) takes it from there. Nothing is pushed in that
 * branch, so History does not grow and repeated presses walk back through
 * exactly the views that were visited, never further.
 *
 * When it was not (`historyDepth() === 0`: a deep link, a reload, or a fresh
 * tab), there is nothing in real history to go back to, so the fallback
 * route above is applied with `replace` rather than `push` — it rewrites the
 * current entry instead of stacking a new one, which is what keeps this from
 * turning into a two-view Back/Back loop: the next Back press (still at
 * depth 0) walks one level further up the same fixed hierarchy rather than
 * bouncing to the page just replaced.
 */
function handleBack(): void {
  if (historyDepth() > 0) {
    window.history.back();
    return;
  }
  clearFacets();
  applyRoute(fallbackBackRoute());
  render();
  syncUrl('replace');
  window.scrollTo({ top: 0 });
}

/* ── virtual yanny ───────────────────────────────────────────────────────── */

type YannyThreadItem =
  | { kind: 'msg'; who: 'user' | 'bot'; text: string }
  | { kind: 'ranking'; result: YannyResult }
  // A turn the reader stopped before it finished. It is its own kind rather
  // than a bot message so a truncated turn can never be mistaken for an
  // answer Virtual Yanny actually gave — it renders as a note, not a bubble.
  | { kind: 'stopped'; responded: number };

/**
 * The in-flight request, if there is one, and a sequence number that makes
 * every callback from an older one a no-op.
 *
 * Both live outside `state` on purpose: nothing here is drawn, and putting a
 * live AbortController in the render state invites somebody to serialise it.
 * The sequence number is what settles the genuinely racy cases — stop
 * pressed in the same tick the final event arrives, or a second question
 * asked immediately after a stop — without any of them needing to know
 * about each other. Whichever of the two paths runs first bumps `yannySeq`,
 * and the loser finds its own number stale and does nothing.
 */
let yannyAbort: AbortController | null = null;
let yannySeq = 0;
/** Disarms "Clear chat?" if the reader walks away from it — see armYannyClear. */
let yannyClearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * How much of the conversation survives a refresh.
 *
 * Bounded two ways because neither bound alone is enough: a cap on turns
 * keeps an ordinary long chat from growing without limit, and a cap on
 * bytes keeps one pathological turn — a pasted wall of text — from blowing
 * the quota on its own. sessionStorage is typically ~5 MB, so 32 KB is not
 * close to a limit; it is a limit on this widget's share of it.
 */
const YANNY_THREAD_MAX_ITEMS = 40;
const YANNY_THREAD_MAX_CHARS = 32_000;
/**
 * Bumped whenever the stored shape changes. An entry written by an older
 * version of the site is dropped rather than guessed at, so a reader who
 * happens to have a stale tab open gets an empty chat instead of a widget
 * that throws on load.
 */
const YANNY_THREAD_VERSION = 1;

/**
 * Writes the visible conversation to sessionStorage (see YANNY_THREAD_KEY).
 *
 * Never throws. Storage can be absent (a sandboxed frame), disabled
 * (private mode on some browsers), or full, and none of those are worth
 * breaking a working chat over — the conversation simply will not outlive
 * the page, which is where it was before any of this.
 *
 * `ranking` items are dropped on the way out. The scoring matrix is working
 * detail attached to a live answer rather than part of the conversation,
 * and it is most of the bytes; keeping it would mean storing 28 rows of
 * per-criterion scores per turn to redraw a collapsed <details> nobody
 * opened.
 */
function saveYannyThread(): void {
  try {
    const keep = state.yannyThread.filter((item) => item.kind !== 'ranking');
    let items = keep.slice(-YANNY_THREAD_MAX_ITEMS);
    let payload = JSON.stringify({ v: YANNY_THREAD_VERSION, items });
    // Oldest turns go first until it fits, rather than refusing to store
    // anything: the end of a conversation is the part still being read.
    while (payload.length > YANNY_THREAD_MAX_CHARS && items.length > 1) {
      items = items.slice(1);
      payload = JSON.stringify({ v: YANNY_THREAD_VERSION, items });
    }
    if (payload.length > YANNY_THREAD_MAX_CHARS) {
      window.sessionStorage.removeItem(YANNY_THREAD_KEY);
      return;
    }
    window.sessionStorage.setItem(YANNY_THREAD_KEY, payload);
  } catch {
    // The transcript will not survive a refresh. Nothing else changes.
  }
}

/**
 * Reads the conversation back, validating every field rather than trusting
 * the entry — sessionStorage is writable by anything else running on this
 * origin, and the values below are rendered. Anything that is not exactly
 * the expected shape is dropped, so the worst case is an empty chat.
 *
 * `esc()` is what actually keeps stored text out of the DOM as markup (see
 * yannyThreadHtml); the checks here are about not handing the renderer an
 * object with the wrong fields in it.
 */
function loadYannyThread(): void {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(YANNY_THREAD_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; items?: unknown };
    if (parsed.v !== YANNY_THREAD_VERSION || !Array.isArray(parsed.items)) {
      window.sessionStorage.removeItem(YANNY_THREAD_KEY);
      return;
    }
    const items: YannyThreadItem[] = [];
    for (const entry of parsed.items as unknown[]) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      if (item.kind === 'msg' && typeof item.text === 'string' && (item.who === 'user' || item.who === 'bot')) {
        items.push({ kind: 'msg', who: item.who, text: item.text });
      } else if (item.kind === 'stopped' && typeof item.responded === 'number' && Number.isFinite(item.responded)) {
        items.push({ kind: 'stopped', responded: Math.max(0, Math.trunc(item.responded)) });
      }
    }
    state.yannyThread = items.slice(-YANNY_THREAD_MAX_ITEMS);
  } catch {
    // Corrupt or half-written entry: start clean rather than half-restored.
    try {
      window.sessionStorage.removeItem(YANNY_THREAD_KEY);
    } catch {
      /* nothing further to do */
    }
  }
}

/**
 * The opening state of an empty chat: what this thing can be asked, as a
 * sentence rather than a set of buttons.
 *
 * There used to be three buttons — "Check a price", "Suggest by notes",
 * "General question" — that set an intent sent alongside the question. They
 * are gone, and nothing is lost by it: the server already classifies intent
 * from the message text itself (`classifyIntent` in server/index.js, used
 * whenever no explicit intent arrives), so the buttons only ever overrode a
 * decision that was being made anyway. What they cost was real, though —
 * three taps competing with the input, and a reader deciding which category
 * their question was before they were allowed to ask it.
 *
 * Named examples rather than category labels, because the useful thing to
 * communicate is the shape of a question that works, not a taxonomy.
 */
const YANNY_EMPTY_PROMPTS = [
  'how much is Bleu de Chanel EDP',
  'something vanilla, no florals',
  'how do these prices get checked',
];
const YANNY_PLACEHOLDER = 'Ask anything about this site…';

/**
 * "Clear chat" sits here and nowhere else, and only when there is something
 * to clear — a control that wipes an empty conversation is a control that
 * exists solely to be pressed by mistake. It is also absent while an answer
 * is in flight: clearing the thread a pending response is about to append to
 * is a state worth not having.
 *
 * Its accessible name says what it will do, which changes with the arm
 * state, rather than staying on the resting label while the visible text
 * asks a question.
 */
function yannyClearHtml(): string {
  if (state.yannyThread.length === 0 || state.yannyBusy) return '';
  return state.yannyClearArmed
    ? `<button class="yanny-clear armed" id="yanny-clear" type="button" aria-label="Confirm clearing the chat history">Clear chat?</button>`
    : `<button class="yanny-clear" id="yanny-clear" type="button" aria-label="Clear the chat history">Clear chat</button>`;
}

function yannyHeadHtml(): string {
  return `<div class="yanny-head">
    <span class="yanny-head-mark" aria-hidden="true">🤖</span>
    <div class="yanny-head-text">
      <p class="yanny-head-name">Virtual Yanny</p>
      <p class="yanny-head-sub">Grounded only in what this site actually shows</p>
    </div>
    ${yannyClearHtml()}
    <button class="yanny-close" id="yanny-close" aria-label="Close chat">${ICON_CLOSE}</button>
  </div>`;
}

function yannyRankingHtml(result: YannyResult): string {
  if (!result.ok || !result.matrix || !result.criteria) return '';
  const critKeys = result.criteria.map((c) => c.key);
  return `<details class="yanny-ranking">
    <summary>Scoring matrix, ${result.respondedCount}/${result.agentCount} agents responded, ranked anonymously</summary>
    <table>
      <thead><tr><th>Rank</th><th>Agent</th>${critKeys.map((k) => `<th>${esc(k)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        ${result.matrix
          .map(
            (m) => `<tr class="${m.rank === 1 ? 'winner' : ''}">
              <td>#${m.rank}</td><td>Agent ${m.agentNumber}</td>
              ${critKeys.map((k) => `<td>${m.criteriaScores[k]}</td>`).join('')}
              <td><strong>${m.totalScore}</strong></td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </details>`;
}

function yannyThreadHtml(): string {
  // Nothing said yet: centre the invitation in the empty space instead of
  // opening with a bot message the reader did not ask for. It is prose, not
  // controls — nothing here is clickable, so it reads as "here is the kind
  // of thing that works" rather than "pick one of three".
  if (state.yannyThread.length === 0 && !state.yannyBusy) {
    return `<div class="yanny-empty">
      <p class="yanny-empty-lead">Ask about a price, get picks by notes, or ask how this site works.</p>
      <ul class="yanny-empty-eg">
        ${YANNY_EMPTY_PROMPTS.map((p) => `<li>“${esc(p)}”</li>`).join('')}
      </ul>
    </div>`;
  }

  const items = state.yannyThread
    .map((item) => {
      if (item.kind === 'msg') return `<div class="yanny-msg ${item.who}">${esc(item.text)}</div>`;
      if (item.kind === 'ranking') return yannyRankingHtml(item.result);
      // A stopped turn. Deliberately not a bot bubble: the council sends its
      // answer as one final event rather than token by token, so a stop
      // genuinely leaves nothing of the answer behind, and saying that
      // plainly is better than a bubble a reader could take for a short
      // reply. The tally is the only thing that had actually arrived.
      const tally =
        item.responded > 0
          ? ` ${item.responded} ${item.responded === 1 ? 'agent had' : 'agents had'} replied, but nothing had been ranked yet.`
          : '';
      return `<p class="yanny-stopped">You stopped this one, so there is no answer to it.${tally}</p>`;
    })
    .join('');

  if (!state.yannyBusy) return items;

  const chips = state.yannyAgentChips.length
    ? `<div class="yanny-agent-chips">${state.yannyAgentChips
        .map((c) => `<span class="yanny-agent-chip ${c.ok ? 'ok' : 'fail'}">Agent ${c.agentNumber} ${c.ok ? '✓' : '✗'}</span>`)
        .join('')}</div>`
    : '';
  return `${items}<div class="yanny-splash"><span class="yanny-spinner" aria-hidden="true"></span><span>${esc(state.yannySplash)}</span></div>${chips}`;
}

const YANNY_UNAVAILABLE_COPY: Record<YannyHealth['reason'], { mark: string; text: string }> = {
  none: { mark: '🤖', text: 'Virtual Yanny is available.' },
  'not-built': {
    mark: '🤖🔧',
    text: "Virtual Yanny isn't switched on in this build of the site yet.",
  },
  'no-answer': {
    mark: '🤖💤',
    text: "Virtual Yanny didn't answer in time. It sleeps when nobody's chatting, so give it a few seconds and open this again.",
  },
  'not-configured': {
    mark: '🤖🔧',
    text: "Virtual Yanny is running but hasn't been given its key, so it can't answer anything yet.",
  },
  'router-down': {
    mark: '🤖⏳',
    text: "Virtual Yanny is up, but the free model service behind it is busy or rate-limited right now. It usually clears within a few minutes. Try again shortly.",
  },
};

/**
 * The panel in each of its three states, and in all three the conversation
 * stays on screen if there is one.
 *
 * That is the whole of what changed here, and it is the bug behind "it loses
 * my history when I click on and off it". The transcript was never actually
 * thrown away — `state.yannyThread` outlives a close, since closing only
 * empties the host element — but the health check runs again on every open
 * (deliberately; see openYanny), and both the states it passes through on
 * the way replaced the entire panel body. So a reopen showed a spinner and
 * then, if the backend happened to be asleep, an "unavailable" splash with
 * the conversation nowhere in it. It came back on the next successful open,
 * which is not a thing a reader can be expected to discover.
 *
 * Now the checking and unavailable states put what they have to say in a
 * strip where the composer goes, and leave the body alone. The composer
 * itself is still withheld until the backend has answered for itself —
 * offering a text box that cannot send anything is worse than saying why.
 */
function yannyPanelHtml(): string {
  const hasHistory = state.yannyThread.length > 0;
  const transcript = `<div class="yanny-body" id="yanny-body">${yannyThreadHtml()}</div>`;

  if (state.yannyStatus === 'idle' || state.yannyStatus === 'checking') {
    // With nothing to show yet, the spinner keeps the whole body — there is
    // no history for it to be sitting under.
    const body = hasHistory ? transcript : `<div class="yanny-checking"><span class="yanny-spinner" aria-hidden="true"></span></div>`;
    const foot = hasHistory
      ? `<p class="yanny-foot" role="status"><span class="yanny-spinner" aria-hidden="true"></span>Reconnecting to Virtual Yanny…</p>`
      : '';
    return `<div class="yanny-panel">${yannyHeadHtml()}${body}${foot}</div>`;
  }

  if (state.yannyStatus === 'unavailable') {
    // Each line says what is actually true and what the reader can do about
    // it. "Try again" only appears where trying again could plausibly work:
    // a suspended machine wakes and a rate limit clears, whereas an
    // unconfigured or unbuilt backend will answer identically all day.
    const { mark, text } = YANNY_UNAVAILABLE_COPY[state.yannyReason] ?? YANNY_UNAVAILABLE_COPY['no-answer'];
    if (!hasHistory) {
      return `<div class="yanny-panel">${yannyHeadHtml()}
        <div class="yanny-unavailable">
          <div class="yanny-unavailable-mark" aria-hidden="true">${mark}</div>
          <p>${esc(text)}</p>
        </div>
      </div>`;
    }
    return `<div class="yanny-panel">${yannyHeadHtml()}${transcript}
      <p class="yanny-foot" role="status"><span aria-hidden="true">${mark}</span>${esc(text)}</p>
    </div>`;
  }

  // Send and stop are two different buttons rather than one relabelled one.
  // A submit button that stops something is a trap: the moment a browser
  // decides to submit the form for any other reason — an implicit submit
  // from the text field, say — it would fire the stop path. `type="button"`
  // on the stop control means the form cannot be submitted while an answer
  // is in flight at all, which is the duplicate-request guard made
  // structural rather than a check that has to be remembered.
  const control = state.yannyBusy
    ? `<button type="button" id="yanny-stop" class="yanny-stop" aria-label="Stop generating this answer">${ICON_STOP}</button>`
    : `<button type="submit" id="yanny-send" aria-label="Send">&#10148;</button>`;

  return `<div class="yanny-panel">
    ${yannyHeadHtml()}
    ${transcript}
    <form id="yanny-composer" class="yanny-composer">
      <label class="sr" for="yanny-input">Message Virtual Yanny</label>
      <input id="yanny-input" type="text" placeholder="${esc(YANNY_PLACEHOLDER)}" autocomplete="off" ${state.yannyBusy ? 'disabled' : ''} />
      ${control}
    </form>
  </div>`;
}

/** Redraws just the launcher/panel pair — never the full app render(), so
 *  opening or using the chat never disturbs whatever page sits behind it. */
function renderYanny(): void {
  const launcher = $('#yanny-launcher') as HTMLElement;
  const host = $('#yanny-panel-host') as HTMLElement;

  // The panel is rebuilt wholesale on every event of a streaming answer, and
  // replacing innerHTML destroys whatever had focus inside it. Left alone
  // that drops a keyboard reader onto <body> several times a second while an
  // answer comes in, and again at the exact moment send becomes stop — the
  // one instant they are most likely to want that button. Remembering the id
  // and handing focus on is the fix, and it only ever fires when focus was
  // inside the panel to begin with, so it can never steal focus from the
  // page behind it.
  const active = document.activeElement as HTMLElement | null;
  const focusedId = active && host.contains(active) ? active.id : '';

  launcher.toggleAttribute('data-open', state.yannyOpen);
  host.innerHTML = state.yannyOpen ? yannyPanelHtml() : '';
  if (state.yannyOpen && state.yannyStatus === 'ready') {
    const body = $('#yanny-body') as HTMLElement | null;
    if (body) body.scrollTop = body.scrollHeight;
  }

  if (focusedId && state.yannyOpen) {
    // In order of preference: the same control, then whichever of the two
    // composer controls is currently live, then close — which always exists.
    // Sending from the text field with Enter lands on the second entry,
    // because the field is disabled while an answer is coming and a disabled
    // element cannot hold focus.
    for (const id of [focusedId, 'yanny-stop', 'yanny-send', 'yanny-input', 'yanny-close']) {
      const el = document.getElementById(id) as (HTMLElement & { disabled?: boolean }) | null;
      if (el && !el.disabled) {
        el.focus({ preventScroll: true });
        break;
      }
    }
  }
}

/**
 * The health check runs every single time the panel opens, never cached
 * from an earlier open in the same session — the backend or its own
 * FreeLLMAPI router can go down between one open and the next, and a stale
 * "it worked last time" would show a chat box that then hangs on the first
 * real question instead of the honest unavailable state up front.
 */
function openYanny(triggeredBy: HTMLElement): void {
  state.yannyOpen = true;
  state.yannyOpenedFrom = triggeredBy;
  state.yannyStatus = 'checking';
  renderYanny();
  (document.querySelector('#yanny-close') as HTMLElement | null)?.focus();

  checkYannyHealth().then((health) => {
    state.yannyStatus = health.ok ? 'ready' : 'unavailable';
    state.yannyReason = health.reason;
    // No greeting is pushed into the thread any more. It said the same thing
    // the empty state now says, but as a message, which made the transcript
    // open with a turn nobody took and pushed the real first answer down.
    // See yannyThreadHtml's empty branch.
    renderYanny();
    (document.querySelector('#yanny-close') as HTMLElement | null)?.focus();
  });
}

function closeYanny(): void {
  state.yannyOpen = false;
  // An armed "Clear chat?" must not still be armed when the panel is opened
  // again — a question asked minutes ago should not be answerable by the
  // first press of a session.
  disarmYannyClear();
  renderYanny();
  state.yannyOpenedFrom?.focus();
  state.yannyOpenedFrom = null;
}

/**
 * The lifecycle of one question, and every way it can end.
 *
 * idle → sending on the way in; sending → idle on a `result` or an `error`;
 * sending → stopped → idle when the reader presses stop. `yannySeq` is what
 * makes those exclusive: it is bumped by whichever path gets there first,
 * and both the event callback and the settle handler below check their own
 * number against it before touching anything. So a stop pressed in the same
 * tick the winning answer arrives resolves one way or the other and never
 * both — either the answer is already in the thread and stopYanny declines
 * (it also requires `yannyBusy`), or the stop landed first and the answer,
 * along with any events still buffered behind it, is dropped.
 *
 * The settle handler is the backstop for the case no event covers: a stream
 * that ends without a terminal event at all, which is what a backend crash
 * or a proxy cutting the connection looks like from here. Without it the
 * panel would sit on a spinner and a stop button with nothing behind it,
 * forever. With it, "still busy once the request is over" is by definition
 * a failed turn and is reported as one.
 */
function sendYannyMessage(text: string): void {
  const trimmed = text.trim();
  if (!trimmed || state.yannyBusy) return;

  disarmYannyClear();
  state.yannyThread.push({ kind: 'msg', who: 'user', text: trimmed });
  state.yannyBusy = true;
  state.yannySplash = 'Thinking…';
  state.yannyAgentChips = [];
  const controller = new AbortController();
  yannyAbort = controller;
  const seq = ++yannySeq;
  saveYannyThread();
  renderYanny();

  void askVirtualYanny(
    trimmed,
    state.yannyIntent,
    (event: YannyEvent) => {
      if (seq !== yannySeq) return;
      if (event.type === 'status') {
        state.yannySplash = event.message;
      } else if (event.type === 'agent') {
        state.yannyAgentChips.push({ agentNumber: event.agentNumber, ok: event.ok });
      } else if (event.type === 'result') {
        state.yannyBusy = false;
        if (event.result.ok && event.result.winner) {
          state.yannyThread.push({ kind: 'msg', who: 'bot', text: event.result.winner.content });
          state.yannyThread.push({ kind: 'ranking', result: event.result });
        } else {
          state.yannyThread.push({ kind: 'msg', who: 'bot', text: `The council could not answer that: ${event.result.error ?? 'unknown error'}.` });
        }
        saveYannyThread();
      } else if (event.type === 'error') {
        state.yannyBusy = false;
        state.yannyThread.push({ kind: 'msg', who: 'bot', text: event.message });
        saveYannyThread();
      }
      renderYanny();
    },
    controller.signal,
  ).finally(() => {
    if (seq !== yannySeq) return;
    yannyAbort = null;
    if (!state.yannyBusy) return;
    state.yannyBusy = false;
    state.yannyThread.push({
      kind: 'msg',
      who: 'bot',
      text: 'Virtual Yanny stopped part-way through without answering. Ask that again and it should go through.',
    });
    saveYannyThread();
    renderYanny();
  })
  // askVirtualYanny is written not to reject — every path it has ends in an
  // event or a plain return. This is here for the day that stops being true:
  // without it a rejection would escape as an unhandled promise rejection,
  // and the handler above would still have done the right thing (the turn is
  // reported as failed and the panel returns to idle) while the console
  // claimed something worse had happened.
  .catch(() => {});
}

/**
 * Stop, and what it genuinely halts.
 *
 * Aborting the controller tears down the `fetch` this browser has open (see
 * askVirtualYanny), so the connection closes and no further event can be
 * delivered here. That much is real and takes effect immediately. Whether
 * the *backend* also stops depends on a change to server/index.js that only
 * takes effect when that service is redeployed; until then the council keeps
 * calling its models into a socket nobody is reading. Nothing on screen
 * claims otherwise — the note this leaves says the reader stopped it, not
 * that the work stopped.
 *
 * Bumping `yannySeq` before anything else is what makes this safe against
 * the in-flight callback: from this line on, every event and the settle
 * handler for that request are stale and return without touching state.
 */
function stopYanny(): void {
  // Not busy means the answer already landed between the button being drawn
  // and being pressed. Nothing to stop, and appending a "you stopped this"
  // note under a complete answer would be a lie about what happened.
  if (!state.yannyBusy) return;
  yannySeq++;
  yannyAbort?.abort();
  yannyAbort = null;
  state.yannyBusy = false;
  state.yannyThread.push({ kind: 'stopped', responded: state.yannyAgentChips.filter((c) => c.ok).length });
  state.yannyAgentChips = [];
  state.yannySplash = '';
  saveYannyThread();
  renderYanny();
  (document.getElementById('yanny-input') as HTMLElement | null)?.focus({ preventScroll: true });
}

/**
 * Clear asks once before it wipes anything, and that is the whole guard.
 *
 * A modal would be too much for a chat with a price bot, and no guard at all
 * is one stray tap from losing a conversation somebody has been building up
 * — the button sits next to Close, which is a tap people make on purpose all
 * the time. Turning the button itself into the question costs one extra
 * press, needs no new surface, is reachable by exactly the same keyboard
 * path as the first press, and is announced because the accessible name
 * changes with it. It disarms itself after a few seconds, and on close, and
 * on sending anything, so it can never be sitting armed from a decision the
 * reader has plainly moved on from.
 */
function armYannyClear(): void {
  state.yannyClearArmed = true;
  if (yannyClearTimer) clearTimeout(yannyClearTimer);
  yannyClearTimer = setTimeout(() => {
    yannyClearTimer = null;
    if (!state.yannyClearArmed) return;
    state.yannyClearArmed = false;
    renderYanny();
  }, 5000);
  renderYanny();
}

function disarmYannyClear(): void {
  if (yannyClearTimer) {
    clearTimeout(yannyClearTimer);
    yannyClearTimer = null;
  }
  state.yannyClearArmed = false;
}

/** Wipes the on-screen transcript and the stored copy together — leaving one
 *  behind would resurrect the conversation on the next refresh. */
function clearYannyChat(): void {
  disarmYannyClear();
  state.yannyThread = [];
  state.yannyAgentChips = [];
  state.yannySplash = '';
  try {
    window.sessionStorage.removeItem(YANNY_THREAD_KEY);
  } catch {
    // Nothing was ever stored, so there is nothing to remove. The on-screen
    // thread is cleared either way.
  }
  renderYanny();
  (document.getElementById('yanny-input') as HTMLElement | null)?.focus({ preventScroll: true });
}

/* ── the design system page ──────────────────────────────────────────────────
   A page that documents the design system by rendering it, not by describing
   it. Reachable at /design and linked once, quietly, from the footer.

   The rule this whole section is built around: nothing on this page is a
   transcription. A swatch is painted with `var(--token)` so it is the token,
   and the hex printed beside it is read back out of the live stylesheet by
   `mountDesignSpecs` after the page is in the DOM. A type sample is a real
   element carrying the real class, and its size, weight and tracking are read
   off that element with getComputedStyle. Change a value in template.html and
   this page changes with it; it has no copy of anything to fall out of date.

   That is the same discipline as the retailer registry's header counts being
   asserted by tests/registry.test.ts, applied to a stylesheet: the way to stop
   documentation lying is to make it impossible for it to disagree.

   docs/DESIGN-SYSTEM.md was written this way too and drifted anyway — it still
   describes a `--bg` of #3A353C, a palette this site has not had for weeks —
   which is the argument for this page existing at all. Where the two disagree,
   the tokens are right and the document is wrong.

   Not in the top bar, deliberately. This is a shop for perfume. A fifth
   primary nav item also breaks the phone layout at 375px, and a style guide
   is not what that slot is for. */

/** One documented colour token: the name, what it is for, and whether it is opaque. */
interface TokenRow {
  name: string;
  role: string;
  /** Alpha-bearing tokens are shown over a chequer so the transparency reads. */
  translucent?: boolean;
}

const DS_COLOUR_GROUPS: { title: string; note: string; tokens: TokenRow[] }[] = [
  {
    title: 'Ground',
    note: 'Three steps of background and the glass the bars sit on.',
    tokens: [
      { name: '--bg', role: 'The page itself' },
      { name: '--surface', role: 'A card or a control, one step up' },
      { name: '--surface-2', role: 'A second step up: chips, pills, segments' },
    ],
  },
  {
    title: 'Ink',
    note: 'Three weights of text, and the two hairlines under them.',
    tokens: [
      { name: '--ink', role: 'Primary text' },
      { name: '--ink-2', role: 'Secondary text' },
      { name: '--faint', role: 'Meta, captions, placeholders' },
      { name: '--line', role: 'Default hairline' },
      { name: '--line-firm', role: 'A firmer divider' },
    ],
  },
  {
    title: 'Accent',
    note: 'One red, five jobs. It is the brand colour, so it never also means "bad": a sold out listing goes grey instead.',
    tokens: [
      { name: '--accent', role: 'The fill: primary action, best price marker' },
      { name: '--accent-on', role: 'Text painted on that fill' },
      { name: '--accent-ink', role: 'The accent as text on the page ground' },
      { name: '--accent-press', role: 'An accent fill, pressed' },
      { name: '--accent-sf', role: 'A tinted ground under accent text' },
      { name: '--focus', role: 'The focus ring, named apart so a retint cannot move it' },
    ],
  },
  {
    title: 'State',
    note: 'Only positive and cautionary states carry colour, for the reason above.',
    tokens: [
      { name: '--ok', role: 'In stock, a saving, new' },
      { name: '--ok-sf', role: 'Its ground, for the lowest-price box under a fragrance' },
      { name: '--warn', role: 'Low stock, a countdown' },
    ],
  },
  {
    title: 'Gender marks',
    note: 'The Venus and Mars marks on the Gender filter. Two values each: the second is for a selected pill, whose ground inverts to --ink. Contrast for all eight is measured further down this page.',
    tokens: [
      { name: '--gender-women', role: 'On an unselected pill' },
      { name: '--gender-women-on', role: 'On a selected pill' },
      { name: '--gender-men', role: 'On an unselected pill' },
      { name: '--gender-men-on', role: 'On a selected pill' },
    ],
  },
  {
    title: 'Chart',
    note: 'The price history chart. The two drifting red glows that used to sit behind every page were removed on 17 Aug 2026, along with their tokens: the accent means "look here", and it should not also be the wallpaper.',
    tokens: [
      { name: '--chart-grid', role: 'Gridlines, below --line so data reads above them' },
      { name: '--chart-band', role: 'The fill under the live price line', translucent: true },
    ],
  },
  {
    title: 'Rank badges',
    note: 'First, second and third on the deals list. Flat values, the same in every theme, each with the text colour measured against its own ground rather than assumed.',
    tokens: [
      { name: '--rank-1', role: 'First place' },
      { name: '--rank-1-on', role: 'The digit on first place' },
      { name: '--rank-2', role: 'Second place' },
      { name: '--rank-2-on', role: 'The digit on second place' },
      { name: '--rank-3', role: 'Third place' },
      { name: '--rank-3-on', role: 'The digit on third place' },
    ],
  },
];

/** Pairs whose contrast is measured live, and what each pair actually is. */
const DS_CONTRAST_PAIRS: { fg: string; bg: string; use: string }[] = [
  { fg: '--ink', bg: '--bg', use: 'Body text on the page' },
  { fg: '--ink-2', bg: '--bg', use: 'Secondary text on the page' },
  { fg: '--faint', bg: '--bg', use: 'Captions and meta' },
  { fg: '--ink', bg: '--surface', use: 'Text on a card' },
  { fg: '--accent-ink', bg: '--bg', use: 'A link, or a price' },
  { fg: '--accent-on', bg: '--accent', use: 'Text on the primary button' },
  { fg: '--ok', bg: '--surface', use: 'In stock, on a card' },
  { fg: '--ok', bg: '--ok-sf', use: 'The price in the lowest-price box' },
  { fg: '--ink-2', bg: '--ok-sf', use: 'The shop line in the lowest-price box' },
  { fg: '--warn', bg: '--surface', use: 'Low stock, on a card' },
  { fg: '--gender-women', bg: '--surface-2', use: 'Venus mark, unselected pill' },
  { fg: '--gender-men', bg: '--surface-2', use: 'Mars mark, unselected pill' },
  { fg: '--gender-women-on', bg: '--ink', use: 'Venus mark, selected pill' },
  { fg: '--gender-men-on', bg: '--ink', use: 'Mars mark, selected pill' },
];

/** The eight type roles, in the order the stylesheet declares them. */
const DS_TYPE_ROLES: { cls: string; sample: string; role: string }[] = [
  { cls: 't-page', sample: 'Page title', role: 'One per view, at the top' },
  { cls: 't-section', sample: 'Section heading', role: 'Separates blocks with space, not decoration' },
  { cls: 't-title', sample: 'Card and row title', role: 'A fragrance, a brand and a shop are the same kind of object' },
  { cls: 't-body', sample: 'Body copy, the paragraphs a reader actually reads.', role: 'Running text' },
  { cls: 't-eyebrow', sample: 'Eyebrow', role: 'One size, one tracking. 11px is the floor at 360px wide' },
  { cls: 't-caption', sample: 'Caption and meta text', role: 'Under a title, beside a figure' },
  { cls: 't-count', sample: '1,419', role: 'Tabular numerals, so a column of counts lines up' },
  { cls: 't-price', sample: '£82.50', role: 'Tabular numerals, the one thing this site exists to show' },
];

/** Everything in the icon set, by the name it is declared under. */
const DS_ICONS: { name: string; svg: string }[] = [
  { name: 'ICON_FILTER', svg: ICON_FILTER },
  { name: 'ICON_SORT', svg: ICON_SORT },
  { name: 'ICON_RANK', svg: ICON_RANK },
  { name: 'ICON_CHEVRON', svg: ICON_CHEVRON },
  { name: 'ICON_SEARCH', svg: ICON_SEARCH },
  { name: 'ICON_GRID', svg: ICON_GRID },
  { name: 'ICON_MOBILE', svg: ICON_MOBILE },
  { name: 'ICON_DESKTOP', svg: ICON_DESKTOP },
  { name: 'ICON_HEART', svg: ICON_HEART },
  { name: 'ICON_EXTERNAL', svg: ICON_EXTERNAL },
  { name: 'ICON_CLOSE', svg: ICON_CLOSE },
  { name: 'ICON_STOP', svg: ICON_STOP },
  { name: 'ICON_TIKTOK', svg: ICON_TIKTOK },
  { name: 'ICON_INSTAGRAM', svg: ICON_INSTAGRAM },
  { name: 'ICON_GENDER_WOMEN', svg: ICON_GENDER_WOMEN },
  { name: 'ICON_GENDER_MEN', svg: ICON_GENDER_MEN },
  { name: 'ICON_GENDER_UNISEX', svg: ICON_GENDER_UNISEX },
  { name: 'ICON_GENDER_UNSTATED', svg: ICON_GENDER_UNSTATED },
];

/** Tokens that are one value for every theme, so they are listed once. */
const DS_CONSTANTS: TokenRow[] = [
  { name: '--gutter', role: 'The page gutter. 16px, and 28px from 900px wide' },
  { name: '--bar-h', role: 'The top bar, which content clears' },
  { name: '--col', role: 'The mobile column measure. Uncapped on desktop' },
  { name: '--sheet-col', role: 'A dialog stays this wide in both layouts' },
  { name: '--mono-sat', role: 'Saturation of the per brand monogram tint' },
  { name: '--mono-bg-l', role: 'Monogram ground lightness, per theme' },
  { name: '--mono-fg-l', role: 'Monogram ink lightness. 30% is the highest value that clears AA at every one of the 360 hues' },
  { name: '--mono-border-l', role: 'Monogram border lightness, per theme' },
];

const DS_MOTION: TokenRow[] = [
  { name: '--dur-1', role: 'Press and release, colour only swaps' },
  { name: '--dur-2', role: 'Hover, chip select, toggle, tab underline' },
  { name: '--dur-3', role: 'Content entering, sheets, list settle' },
  { name: '--dur-4', role: 'Theme cross fade, the longest thing on the site' },
  { name: '--ease-standard', role: 'Everything arriving or settling' },
  { name: '--ease-exit', role: 'Everything leaving, and the press half of a tap' },
];

const DS_FONTS: TokenRow[] = [
  { name: '--font-sans', role: 'The system stack. No webfont to fail loading' },
  { name: '--font-num', role: 'Numerals that have to align down a column' },
];

const DS_ELEVATION: TokenRow[] = [
  { name: '--shadow', role: 'The one drop shadow' },
  { name: '--shadow-lift', role: 'Card lift. A hairline on dark, a real shadow on light, because a shadow does not read on a near black ground' },
];

/** A row in a token table: the live swatch, the name, the read back value. */
function dsTokenRow(row: TokenRow, swatch: boolean): string {
  return `<div class="ds-row">
    ${swatch ? `<span class="ds-chip${row.translucent ? ' is-alpha' : ''}" style="background: var(${row.name})" aria-hidden="true"></span>` : ''}
    <code class="ds-name">${esc(row.name)}</code>
    <span class="ds-value t-count" data-ds-token="${esc(row.name)}"></span>
    <span class="ds-role t-caption">${esc(row.role)}</span>
  </div>`;
}

function dsTokenTable(rows: TokenRow[], swatch: boolean): string {
  return `<div class="ds-table">${rows.map((r) => dsTokenRow(r, swatch)).join('')}</div>`;
}

function designView(): string {
  const colour = DS_COLOUR_GROUPS.map(
    (g) => `<div class="ds-group">
      <h4 class="ds-group-title t-eyebrow">${esc(g.title)}</h4>
      <p class="ds-group-note t-caption">${esc(g.note)}</p>
      ${dsTokenTable(g.tokens, true)}
    </div>`,
  ).join('');

  const contrast = DS_CONTRAST_PAIRS.map(
    (p) => `<div class="ds-row ds-contrast" data-ds-contrast="${esc(p.fg)}|${esc(p.bg)}">
      <span class="ds-contrast-demo" style="background: var(${p.bg}); color: var(${p.fg})" aria-hidden="true">Aa</span>
      <code class="ds-name">${esc(p.fg)} on ${esc(p.bg)}</code>
      <span class="ds-value t-count" data-ds-ratio></span>
      <span class="ds-role t-caption"><span data-ds-verdict></span> ${esc(p.use)}</span>
    </div>`,
  ).join('');

  const type = DS_TYPE_ROLES.map(
    (t) => `<div class="ds-type">
      <p class="${t.cls}" data-ds-sample=".${t.cls}">${esc(t.sample)}</p>
      <code class="ds-name">.${esc(t.cls)}</code>
      <span class="ds-value t-count" data-ds-computed=".${esc(t.cls)}"></span>
      <span class="ds-role t-caption">${esc(t.role)}</span>
    </div>`,
  ).join('');

  const icons = DS_ICONS.map(
    (i) => `<figure class="ds-icon">${i.svg}<figcaption class="t-caption">${esc(i.name.replace('ICON_', '').toLowerCase().replace(/_/g, ' '))}</figcaption></figure>`,
  ).join('');

  return `
    <button class="back" data-back>Back</button>
    <article class="doc design-doc">
      <h2 class="t-page">Design system</h2>
      <p class="t-body">Every value on this page was read out of the live stylesheet at the
        moment the page rendered. The swatches are painted with the tokens themselves and the
        text samples are real elements carrying the real classes, so nothing here is a copy of
        anything and nothing here can quietly stop being true. Change a value in
        demo/template.html and this page changes with it.</p>

      <section class="ds-section">
        <h3 class="t-section">Theme</h3>
        <p class="t-body">The palette is five near identical blocks of custom properties, one per
          state the page can be in: the dark default, the light theme, the system theme following
          the operating system, and the two a host page can force by stamping data-theme on the
          root. Switch below and watch every value on this page move.</p>
        <div class="seg" role="group" aria-label="Display theme">
          ${MODE_OPTIONS.map(
            (m) => `<button class="seg-btn ${state.mode === m.id ? 'on' : ''}" data-set-mode="${m.id}">${esc(m.label)}</button>`,
          ).join('')}
        </div>
        <p class="ds-resolved t-caption" data-ds-resolved></p>
      </section>

      <section class="ds-section">
        <h3 class="t-section">Colour</h3>
        ${colour}
      </section>

      <section class="ds-section">
        <h3 class="t-section">Contrast, measured now</h3>
        <p class="t-body">Computed in the browser from the two tokens named on each row, in
          whichever theme is showing. AA asks 4.5:1 of text and 3:1 of a graphic; every pair here
          is held to the text bar. A row that fails says so rather than being left off the list.</p>
        <div class="ds-table">${contrast}</div>
      </section>

      <section class="ds-section">
        <h3 class="t-section">Type</h3>
        <p class="t-body">Eight roles, one size, weight and tracking each. The specification
          beside each sample is read off the sample itself.</p>
        <div class="ds-table ds-type-table">${type}</div>
        ${dsTokenTable(DS_FONTS, false)}
      </section>

      <section class="ds-section">
        <h3 class="t-section">Space and layout</h3>
        ${dsTokenTable(DS_CONSTANTS, false)}
        <p class="t-caption ds-gap">There is no radius or spacing scale to read: corner radii and
          gaps are written as literals where they are used. Naming that here rather than inventing
          a scale nothing refers to, because a token no rule uses would be the same kind of
          fiction this page exists to prevent.</p>
      </section>

      <section class="ds-section">
        <h3 class="t-section">Elevation</h3>
        <p class="t-body">One level, and it is for things that genuinely float: the dialog and the
          chart's own tooltip. Cards, tiles, badges and the price box carried it too until
          17 Aug 2026; each of them already had a border or a ground of its own doing the same
          job, so the shadow was the separation drawn twice. The sample below is the token
          itself, not a picture of it.</p>
        <div class="ds-lift-demo"><span class="ds-lift">Dialog</span></div>
        ${dsTokenTable(DS_ELEVATION, false)}
      </section>

      <section class="ds-section">
        <h3 class="t-section">Motion</h3>
        <p class="t-body">Four durations and two curves. Motion explains a change of state, never
          arrival, and nothing animates a price.</p>
        ${dsTokenTable(DS_MOTION, false)}
      </section>

      <section class="ds-section">
        <h3 class="t-section">Icons</h3>
        <p class="t-body">Line drawn, one 24 unit box, one weight, no fills, and inline in the
          bundle so the page makes no request for a picture of anything. The four gender marks at
          the end carry their own colour; every other icon takes the colour of the text around it.</p>
        <div class="ds-icons">${icons}</div>
      </section>
    </article>`;
}

/* ── reading the live values back ────────────────────────────────────────────
   Everything above renders placeholders; this fills them in, after the markup
   is in the DOM and the cascade has actually resolved. Called from render().

   Colours are read through a probe element rather than straight off the custom
   property, because a token's declared text can be a hex, an rgba() or an
   hsl(), and one of those three is not something a contrast calculation can
   take. Assigning it to a real element's `color` and reading the computed
   value back hands every one of them over as the same rgb() triple, resolved
   by the browser exactly as it resolved it for the page. The arithmetic
   itself lives in demo/contrast.ts, which tests/contrast.test.ts holds the
   documented figures in template.html to. */

function dsProbeColour(token: string, probe: HTMLElement): Rgba | null {
  probe.style.color = '';
  probe.style.color = `var(${token})`;
  return parseColour(window.getComputedStyle(probe).color);
}

/**
 * Fill in every read back value on the design page.
 *
 * A no-op on every other view, so render() can call it unconditionally.
 */
function mountDesignSpecs(): void {
  const doc = document.querySelector('.design-doc');
  if (!doc) return;

  const root = document.documentElement;
  const rootStyle = window.getComputedStyle(root);

  for (const el of doc.querySelectorAll<HTMLElement>('[data-ds-token]')) {
    const name = el.getAttribute('data-ds-token')!;
    el.textContent = rootStyle.getPropertyValue(name).trim() || 'not set';
  }

  // One hidden probe, reused for every colour on the page.
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.display = 'none';
  doc.appendChild(probe);

  for (const el of doc.querySelectorAll<HTMLElement>('[data-ds-contrast]')) {
    const [fgToken, bgToken] = el.getAttribute('data-ds-contrast')!.split('|');
    const fg = dsProbeColour(fgToken!, probe);
    const bg = dsProbeColour(bgToken!, probe);
    const ratioEl = el.querySelector('[data-ds-ratio]') as HTMLElement | null;
    const verdictEl = el.querySelector('[data-ds-verdict]') as HTMLElement | null;
    if (!fg || !bg || !ratioEl || !verdictEl) continue;
    const ratio = contrastRatio(fg, bg);
    ratioEl.textContent = `${ratio.toFixed(2)}:1`;
    const passes = ratio >= AA_TEXT;
    verdictEl.textContent = passes ? 'Passes AA.' : 'Below 4.5:1.';
    verdictEl.className = passes ? 'ds-pass' : 'ds-fail';
  }
  probe.remove();

  for (const el of doc.querySelectorAll<HTMLElement>('[data-ds-computed]')) {
    const sample = doc.querySelector<HTMLElement>(`[data-ds-sample="${el.getAttribute('data-ds-computed')}"]`);
    if (!sample) continue;
    const s = window.getComputedStyle(sample);
    const tracking = s.letterSpacing === 'normal' ? '0' : s.letterSpacing;
    el.textContent = `${s.fontSize} / ${s.fontWeight} / ${s.lineHeight} / ${tracking}`;
  }

  const resolved = doc.querySelector('[data-ds-resolved]');
  if (resolved) {
    // What the page is actually painting, not what was clicked: "match my
    // device" resolves through the OS preference and any theme a host has
    // stamped, and the honest answer is the one the cascade settled on.
    const chosen = root.getAttribute('data-mode') ?? 'dark';
    const hostTheme = root.getAttribute('data-theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const showing =
      chosen === 'system' ? (hostTheme ?? (prefersLight ? 'light' : 'dark')) : chosen;
    const because =
      chosen !== 'system'
        ? 'because you chose it'
        : hostTheme
          ? `because the page around this one asked for ${hostTheme}`
          : `because this device prefers ${prefersLight ? 'light' : 'dark'}`;
    resolved.textContent = `Showing the ${showing} palette, ${because}.`;
  }
}

/* ── chrome ──────────────────────────────────────────────────────────────── */

function render(): void {
  resetChunkedLists();
  const body =
    state.view === 'home'
      ? homeView()
      : state.view === 'deals'
        ? dealsView()
        : state.view === 'explore'
          ? exploreView()
          : state.view === 'browse'
            ? browseView()
            : state.view === 'detail'
              ? detailView()
              : state.view === 'retailer'
                ? retailerView()
                : state.view === 'brand'
                  ? brandView()
                  : state.view === 'note'
                    ? noteView()
                    : state.view === 'about'
                      ? aboutView()
                      : state.view === 'design'
                        ? designView()
                        : state.view === 'settings'
                          ? settingsView()
                          : state.view === 'account'
                            ? accountView()
                            : state.view === 'notFound'
                              ? notFoundView()
                              : legalView();

  // What this page tells a search engine it is. Applied on every render
  // because the site is one document: without this, /fragrance/ean-123 and
  // /brands and every one of the 12,000-odd product pages carry the title,
  // description and — worst — the canonical URL of the homepage, which is an
  // instruction not to index them. See demo/head.ts for what this does and
  // does not reach.
  applyHead(headFor(headInputForState()));

  // The wrapper is a fresh element on every render, so the rise it carries
  // just plays on insertion. No JS animation retriggering needed. It is the
  // design system's own .ps-rise (behaviour 1: content entering a view), not
  // a class of its own — this is the one block on the page that rises, and
  // one rise per block is the whole rule.
  $('#view').innerHTML = `<div class="ps-rise">${body}</div>`;

  // Any list that emitted a sentinel now gets its observer. Done here rather
  // than inside each view so no view has to remember to do it.
  mountChunkedList();

  // The design page's read-back values, which can only be read once its
  // markup is in the DOM. A no-op anywhere else.
  mountDesignSpecs();

  // The sub nav belongs to Explore and its leaves, and appears nowhere else.
  const inExplore =
    state.view === 'explore' || state.view === 'retailer' || state.view === 'brand' || state.view === 'note';
  const subnav = $('#subnav') as HTMLElement;
  subnav.hidden = !inExplore;
  subnav.innerHTML = inExplore
    ? TABS.map(
        (t) => `<button class="subnavbtn ${state.tab === t.id ? 'on' : ''}" data-tab="${t.id}">${t.label}</button>`,
      ).join('')
    : '';

  ($('#nav-home') as HTMLElement).classList.toggle('on', state.view === 'home');
  ($('#nav-deals') as HTMLElement).classList.toggle('on', state.view === 'deals');
  ($('#nav-explore') as HTMLElement).classList.toggle('on', inExplore || state.view === 'browse');
  ($('#nav-about') as HTMLElement).classList.toggle('on', state.view === 'about');
  // Account has no top bar entry of its own yet (see settingsView's own
  // Account section) — Module 2.3 is where "profile picture click routes to
  // /account everywhere" actually redesigns navigation for accounts.
  ($('#nav-settings') as HTMLElement).classList.toggle('on', state.view === 'settings' || state.view === 'account');

  syncUpdatesHeight();
  mountTrustpilotWidgets();
}

/**
 * On desktop, the update history sits beside the suggestion box rather than
 * below it. The list of releases only grows over time, so left unchecked it
 * would run taller than the form next to it and the two columns would end at
 * different points. Capping the list's height to whatever the suggestion box
 * actually rendered at, and letting it scroll internally past that, keeps the
 * two bottoms aligned instead. Stacked on mobile, neither constraint applies,
 * so the cap is cleared there and the list just flows.
 */
function syncUpdatesHeight(): void {
  const suggest = document.querySelector('.suggest-section') as HTMLElement | null;
  const list = document.querySelector('.updates-list') as HTMLElement | null;
  if (!suggest || !list) return;
  if (state.layout !== 'desktop') {
    list.style.maxHeight = '';
    return;
  }
  // Measured from the list's own top, not the suggestion box's total height:
  // the updates column carries its own heading above the list, so matching
  // the suggestion box's full height would push the list past it. What has
  // to match is the bottom edge, so the cap is exactly the gap between where
  // the list starts and where the suggestion box ends.
  const suggestBottom = suggest.getBoundingClientRect().bottom;
  const listTop = list.getBoundingClientRect().top;
  list.style.maxHeight = `${Math.max(120, suggestBottom - listTop)}px`;
}

/** The one method this app calls on Trustpilot's own global once it loads. */
interface TrustpilotGlobal {
  loadFromElement(el: Element, forceRedirect?: boolean): void;
}

let trustpilotScriptState: 'unloaded' | 'loading' | 'loaded' = 'unloaded';

/**
 * Trustpilot's bootstrap script is loaded on demand, the first time a
 * retailer page actually has a rating configured to show — never eagerly on
 * every page load, for a third-party script that today would render nothing
 * on all but a handful of retailers. Once loaded, the same script instance
 * serves every widget for the rest of the session; this app is a client-side
 * router, so a widget appearing on the second retailer page visited is a DOM
 * mutation the bootstrap script never saw happen on its own, and
 * `loadFromElement` is Trustpilot's own documented hook for exactly that.
 */
function mountTrustpilotWidgets(): void {
  const widgets = document.querySelectorAll('[data-trustpilot-widget]');
  if (widgets.length === 0) return;

  if (trustpilotScriptState === 'loaded') {
    const tp = (window as unknown as { Trustpilot?: TrustpilotGlobal }).Trustpilot;
    widgets.forEach((el) => tp?.loadFromElement(el, true));
    return;
  }
  if (trustpilotScriptState === 'loading') return; // Its onload below covers these too.

  trustpilotScriptState = 'loading';
  const script = document.createElement('script');
  script.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
  script.async = true;
  script.onload = () => {
    trustpilotScriptState = 'loaded';
    const tp = (window as unknown as { Trustpilot?: TrustpilotGlobal }).Trustpilot;
    document.querySelectorAll('[data-trustpilot-widget]').forEach((el) => tp?.loadFromElement(el, true));
  };
  // A failed load (offline, blocked) leaves the fallback link inside the
  // widget div visible, which is exactly what it is there for — no retry,
  // no error state to manage.
  document.head.appendChild(script);
}

function go(view: View): void {
  // Every navigation lands on a different list (or none at all), so facet
  // selections from wherever we just were would only ever be stale here —
  // see clearFacets' own comment.
  clearFacets();
  state.view = view;
  render();
  syncUrl('push');
  window.scrollTo({ top: 0 });
}

function openExplore(tab: ExploreTab): void {
  state.tab = tab;
  go('explore');
}

/** Re-render from whatever the address bar now says. */
function renderFromUrl(): void {
  const route = matchRoute(
    window.location.pathname.slice(basePath().replace(/\/$/, '').length) || '/',
    window.location.search,
  );
  if (!applyRoute(route)) {
    // applyRoute returns false when the address is well formed but names
    // something that is not here any more: a bookmark to a fragrance that has
    // since been delisted, a retailer that was switched off. That is a miss,
    // not the homepage, and saying so beats silently showing something else.
    state.notFoundPath = window.location.pathname;
    state.view = 'notFound';
  }
  const box = $('#search') as HTMLInputElement | null;
  if (box) box.value = state.query;
  render();
}

/* ── wiring ──────────────────────────────────────────────────────────────── */

function init(): void {
  loadMode();
  loadLayout();
  loadPerRow();
  // Restores the chat transcript this tab was holding before a refresh. Runs
  // before the first render but draws nothing on its own — the panel is
  // closed until the launcher is pressed, and the health check still runs
  // fresh on that open, so a restored conversation never implies a backend
  // that is still there.
  loadYannyThread();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.yannyOpen) closeYanny();
  });

  // Starts the backend waking as soon as somebody looks like they are headed
  // for the chat, rather than after they have committed to it — see
  // warmVirtualYanny for what this does and does not buy. `pointerenter`
  // covers touch as well as mouse (the pointer enters the element as the
  // finger lands, before the tap completes); `focus` covers arriving by
  // keyboard. Both are passive: nothing on screen changes, and the health
  // check on open is untouched and still the only thing that decides whether
  // the panel is usable.
  const yannyLauncher = $('#yanny-launcher') as HTMLElement;
  yannyLauncher.addEventListener('pointerenter', warmVirtualYanny);
  yannyLauncher.addEventListener('focus', warmVirtualYanny);

  // The very first render happens synchronously below, before either of
  // these callbacks can possibly fire — accountView's own `!state.authChecked`
  // branch, and wishlistButton's own `!state.authChecked` branch, are what
  // cover that gap rather than this holding up startup for every page.
  const handleAuthUser = (user: User | null) => {
    state.authUser = user;
    state.authChecked = true;
    if (user) {
      // A real session has arrived — most often the tab that just followed a
      // verification link back in. Whatever the form was complaining about a
      // moment ago is now stale, and a leftover pendingEmail would otherwise
      // hold a freshly verified reader on the "check your inbox" screen they
      // have just finished with.
      state.authPendingEmail = '';
      state.authError = '';
      state.authResetSent = false;
    }
    if (user && isVerified(user)) {
      loadWishlist();
    } else {
      // A different reader may be signing in on the same device, or this one
      // just signed out — either way, the previous session's saved ids must
      // not linger and render as if they belonged to whoever is here now.
      state.wishlistIds = new Set();
      state.wishlistEntries = [];
      state.wishlistLoaded = false;
    }
    render();
  };
  currentUser().then(handleAuthUser);
  // Fires on every sign in, sign out and token refresh, including the tab
  // that just followed a verification link back in — see its own comment in
  // auth.ts for why nothing here needs to poll for that.
  onAuthChange(handleAuthUser);
  // The other half of "the tab that just followed a link back in": if that
  // link did NOT produce a session — expired, already used, or (see
  // supabase.ts's flowType comment) opened in a browser without a stored
  // PKCE verifier — nothing above fires at all, and the reader would
  // otherwise land on /account looking exactly like a fresh, signed out
  // visit. See auth.ts's checkEmailLinkCallback for why that was silent
  // until now.
  checkEmailLinkCallback().then((message) => {
    if (!message) return;
    state.authError = message;
    render();
  });

  // The bar search is the quick one: type a name, get results. The Search
  // subpage under Explore is where the same query gains a brand filter and
  // room to show what it matched against.
  // Typing replaces rather than pushes: one history entry per keystroke would
  // make Back a character-by-character undo of the search box, and leaving the
  // search would take a dozen presses to escape.
  $('#search').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value;
    state.view = 'browse';
    render();
    syncUrl('replace');
  });

  const goHome = () => {
    state.query = '';
    state.brand = null;
    ($('#search') as HTMLInputElement).value = '';
    go('home');
  };

  $('#nav-home').addEventListener('click', goHome);
  $('#brand-home').addEventListener('click', goHome);
  $('#nav-deals').addEventListener('click', () => go('deals'));
  $('#nav-explore').addEventListener('click', () => openExplore(state.tab));
  $('#nav-about').addEventListener('click', () => go('about'));
  $('#nav-settings').addEventListener('click', () => go('settings'));

  // Hover shows a price history point; leaving it hides that point again
  // unless it is the one currently pinned by a tap (see the click handler
  // below). `focusin`/`focusout` carry the identical pair for keyboard users
  // tabbing across dots, so nothing here works only for a mouse.
  document.addEventListener('mouseover', (e) => {
    const dot = (e.target as HTMLElement).closest('.history-dot');
    if (dot) positionHistoryTip(dot);
  });
  document.addEventListener('mouseout', (e) => {
    const dot = (e.target as HTMLElement).closest('.history-dot');
    if (dot && dot !== pinnedHistoryDot) hideHistoryTip();
  });
  document.addEventListener('focusin', (e) => {
    const dot = (e.target as HTMLElement).closest('.history-dot');
    if (dot) positionHistoryTip(dot);
  });
  document.addEventListener('focusout', (e) => {
    const dot = (e.target as HTMLElement).closest('.history-dot');
    if (dot && dot !== pinnedHistoryDot) hideHistoryTip();
  });

  // The A-to-Z scrubber. `{ passive: false }` is what lets preventDefault
  // actually stop the page behind it scrolling during the drag — scoped to
  // only fire when the touch itself is on the strip, so nothing about
  // scrolling anywhere else in the app is affected. touchmove's `target`
  // stays whatever touchstart hit, not whatever is under the finger now (per
  // the Touch Events spec), so `closest` here keeps resolving correctly for
  // the rest of a drag that has moved off the strip's own bounds.
  const scrubberTouch = (e: TouchEvent): void => {
    const scrubber = (e.target as HTMLElement).closest('.alpha-scrubber') as HTMLElement | null;
    if (!scrubber) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const letter = letterAtY(scrubber, touch.clientY);
    if (letter) {
      jumpToLetter(letter);
      showScrubberBubble(letter, touch.clientX, touch.clientY);
    }
  };
  document.addEventListener('touchstart', scrubberTouch, { passive: false });
  document.addEventListener('touchmove', scrubberTouch, { passive: false });
  document.addEventListener('touchend', (e) => {
    if ((e.target as HTMLElement).closest('.alpha-scrubber')) hideScrubberBubble();
  });
  document.addEventListener('touchcancel', hideScrubberBubble);

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    // Touch has no hover state to show a tip on, so a tap has to double as
    // both "show" and "stay open" — pinning it here is what keeps it up once
    // the finger lifts, and tapping the same point again (or anywhere else,
    // handled just below) is what closes it again.
    const historyDot = t.closest('.history-dot');
    if (historyDot) {
      if (pinnedHistoryDot === historyDot) {
        hideHistoryTip();
      } else {
        pinnedHistoryDot = historyDot;
        positionHistoryTip(historyDot);
      }
      return;
    }
    if (pinnedHistoryDot && !t.closest('.history-tip')) hideHistoryTip();

    // Switching the chart's range. Every scope was rendered up front, so this
    // only swaps which one is shown — no re-render, and no refetch of history
    // that is already in the page. A pinned tip belongs to the chart being
    // hidden, so it goes with it.
    const scopeBtn = t.closest<HTMLElement>('[data-history-scope]');
    if (scopeBtn && !scopeBtn.hasAttribute('disabled')) {
      const block = scopeBtn.closest('[data-history-block]');
      const want = scopeBtn.getAttribute('data-history-scope');
      if (block && want) {
        hideHistoryTip();
        for (const b of block.querySelectorAll<HTMLElement>('[data-history-scope]')) {
          const on = b.getAttribute('data-history-scope') === want;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', String(on));
        }
        for (const panel of block.querySelectorAll<HTMLElement>('[data-history-panel]')) {
          panel.hidden = panel.getAttribute('data-history-panel') !== want;
        }
      }
      return;
    }

    // An internal link that carries a real href, so it can be copied and
    // opened in a new tab, but navigates through the router when clicked
    // normally. Modified clicks (new tab, new window, download) and any
    // non-primary button are left to the browser.
    const gotoLink = t.closest<HTMLElement>('[data-goto]');
    if (gotoLink && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault();
      go(gotoLink.getAttribute('data-goto') as View);
      return;
    }

    // Deliberately not `data-mode`: that attribute lives on <html> to drive the
    // palette, and closest() would match it for every click in the app.
    const modeBtn = t.closest('[data-set-mode]');
    if (modeBtn) {
      setMode(modeBtn.getAttribute('data-set-mode') as DisplayMode);
      render();
      return;
    }

    const layoutBtn = t.closest('[data-set-layout]');
    if (layoutBtn) {
      setLayout(layoutBtn.getAttribute('data-set-layout') as Layout);
      render();
      return;
    }

    const tab = t.closest('[data-tab]');
    if (tab) {
      openExplore(tab.getAttribute('data-tab') as ExploreTab);
      return;
    }

    const card = t.closest('[data-frag]');
    if (card) {
      state.fragranceId = card.getAttribute('data-frag')!;
      go('detail');
      return;
    }

    const shop = t.closest('[data-retailer]');
    if (shop) {
      state.retailerId = shop.getAttribute('data-retailer')!;
      go('retailer');
      return;
    }

    const note = t.closest('[data-note]');
    if (note) {
      state.noteName = note.getAttribute('data-note')!;
      go('note');
      return;
    }

    // A group card filters the alphabetical list below it in place, the same
    // in-panel update the layer dropdown already does — clicking the active
    // one again clears back to "any", the same toggle a filter chip implies.
    const noteGroup = t.closest('[data-note-layer]');
    if (noteGroup) {
      const layer = noteGroup.getAttribute('data-note-layer') as NoteLayerFilter;
      state.noteLayer = state.noteLayer === layer ? 'any' : layer;
      render();
      return;
    }

    const page = t.closest('[data-page]');
    if (page) {
      state.legalId = page.getAttribute('data-page')!;
      go('legal');
      return;
    }

    // Password reveal. Delegated like everything else, because the auth form
    // is re-rendered on every tab switch and a bound listener would be lost.
    const reveal = t.closest<HTMLElement>('#auth-password-reveal');
    if (reveal) {
      const input = $('#auth-password') as HTMLInputElement | null;
      if (input) {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        reveal.setAttribute('aria-pressed', showing ? 'false' : 'true');
        reveal.textContent = showing ? 'Show' : 'Hide';
        // Typing should carry on where it left off, not from the start.
        const at = input.value.length;
        input.focus();
        input.setSelectionRange(at, at);
      }
      return;
    }

    if (t.closest('[data-go-account]')) {
      go('account');
      return;
    }

    if (t.closest('#yanny-launcher')) {
      openYanny(t.closest('#yanny-launcher') as HTMLElement);
      return;
    }
    if (t.closest('#yanny-close')) {
      closeYanny();
      return;
    }
    if (t.closest('#yanny-stop')) {
      stopYanny();
      return;
    }
    if (t.closest('#yanny-clear')) {
      if (state.yannyClearArmed) clearYannyChat();
      else armYannyClear();
      return;
    }
    const authTabBtn = t.closest('[data-auth-tab]');
    if (authTabBtn) {
      state.authTab = authTabBtn.getAttribute('data-auth-tab') as AuthTab;
      state.authError = '';
      state.authResetSent = false;
      render();
      return;
    }

    if (t.closest('#auth-sign-out') || t.closest('#auth-sign-out-pending')) {
      // Clearing the remembered address here as well as in handleAuthUser:
      // signOut() only reaches handleAuthUser via onAuthChange, and a reader
      // whose session Supabase has already discarded server-side would
      // otherwise stay parked on the verification screen with nothing to
      // sign out of.
      state.authPendingEmail = '';
      void signOut();
      return;
    }

    // The way out of the verification screen for a reader who holds no
    // session — a fresh signup, or a sign in that bounced off an unconfirmed
    // address. There is nothing to sign out of, so this simply forgets the
    // address and hands the sign-in form back.
    if (t.closest('#auth-leave-pending')) {
      state.authPendingEmail = '';
      state.authError = '';
      state.authTab = 'signIn';
      render();
      return;
    }

    const resendBtn = t.closest('#auth-resend');
    if (resendBtn) {
      const email = resendBtn.getAttribute('data-email') ?? '';
      const notice = $('#auth-notice') as HTMLElement;
      resendVerification(email).then((result) => {
        notice.textContent = result.ok
          ? 'Sent. Check your inbox again in a moment.'
          : result.message;
        notice.hidden = false;
      });
      return;
    }

    if (t.closest('#auth-forgot')) {
      const email = ($('#auth-email') as HTMLInputElement | null)?.value.trim() ?? '';
      if (!email) {
        state.authError = 'Enter your email above first, then tap Forgot your password again.';
        render();
        return;
      }
      state.authBusy = true;
      state.authError = '';
      render();
      requestPasswordReset(email).then((result) => {
        state.authBusy = false;
        state.authResetSent = result.ok;
        state.authError = result.ok ? '' : result.message;
        render();
      });
      return;
    }

    const wishlistRemoveBtn = t.closest('[data-wishlist-remove]');
    if (wishlistRemoveBtn) {
      const fragranceId = wishlistRemoveBtn.getAttribute('data-wishlist-remove')!;
      state.wishlistIds.delete(fragranceId);
      state.wishlistEntries = state.wishlistEntries.filter((e) => e.fragranceId !== fragranceId);
      render();
      removeFromWishlist(fragranceId).then((result) => {
        if (!result.ok) {
          // Roll back by reloading from the server rather than guessing what
          // the entry's own target price was, since this optimistic removal
          // already discarded it.
          loadWishlist();
        }
      });
      return;
    }

    const wishlistBtn = t.closest('[data-wishlist-toggle]');
    if (wishlistBtn) {
      const fragranceId = wishlistBtn.getAttribute('data-wishlist-toggle')!;
      const saved = state.wishlistIds.has(fragranceId);
      state.wishlistBusy = true;
      // Reflects the change immediately rather than waiting on the round
      // trip — a save button that visibly lags behind the tap reads as
      // broken, and the worst case of being wrong is a re-render once the
      // request actually settles a moment later.
      if (saved) state.wishlistIds.delete(fragranceId);
      else state.wishlistIds.add(fragranceId);
      render();
      const action = saved ? removeFromWishlist(fragranceId) : addToWishlist(fragranceId);
      action.then((result) => {
        state.wishlistBusy = false;
        if (!result.ok) {
          // Roll back: the optimistic flip above did not actually happen.
          if (saved) state.wishlistIds.add(fragranceId);
          else state.wishlistIds.delete(fragranceId);
          render();
          return;
        }
        // The flip above only ever touched wishlistIds, which is all the
        // button on this page needs. state.wishlistEntries — the account
        // page's own list — was left behind, so saving something here and
        // then opening the account page showed a heart that said "Saved"
        // above a list that did not contain it.
        //
        // Refetching rather than splicing an entry in locally is the point:
        // an entry carries an `added_at` that only the database knows, and
        // inventing a timestamp to fill the gap is the one thing this
        // project does not do with any other number either. One extra round
        // trip on a deliberate tap is a fair price for the list being true.
        loadWishlist();
      });
      return;
    }

    if (t.closest('[data-browse]')) {
      state.brand = null;
      go('browse');
      return;
    }

    const brandOpt = t.closest('[data-brand]');
    if (brandOpt) {
      state.brandProfile = brandOpt.getAttribute('data-brand')!;
      go('brand');
      return;
    }

    if (t.closest('[data-back-explore], [data-back], [data-back-home]')) {
      handleBack();
      return;
    }

    if (t.closest('[data-clear-brand]')) {
      state.brand = null;
      render();
      return;
    }

    if (t.closest('[data-facets-toggle]')) {
      state.facetsOpen = !state.facetsOpen;
      render();
      return;
    }

    if (t.closest('[data-facets-clear]')) {
      clearFacets();
      state.facetsOpen = true; // stay open — the reader is mid-filtering, not leaving the page
      render();
      return;
    }

    const facetPillBtn = t.closest<HTMLElement>('[data-facet-group]');
    if (facetPillBtn) {
      const group = facetPillBtn.getAttribute('data-facet-group') as FacetGroup;
      const value = facetPillBtn.getAttribute('data-facet-value')!;
      // Two shapes: most groups are a Set toggled by value, onSale/inStock
      // are single booleans — same data-facet-group/value markup either way,
      // read differently by group id.
      if (group === 'onSale') state.facetOnSale = !state.facetOnSale;
      else if (group === 'inStock') state.facetInStock = !state.facetInStock;
      else if (group === 'volume') toggleInSet(state.facetVolume, value as VolumeBand);
      else if (group === 'concentration') toggleInSet(state.facetConcentration, value);
      else if (group === 'gender') toggleInSet(state.facetGender, value as GenderReading);
      else if (group === 'priceBand') toggleInSet(state.facetPriceBand, value as PriceBand);
      else if (group === 'tier') toggleInSet(state.facetTier, value as RetailerTier);
      render();
      return;
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.id !== 'search-full') return;
    state.query = (t as HTMLInputElement).value;
    ($('#search') as HTMLInputElement).value = state.query;
    // Re-rendering would tear out the field mid keystroke and lose focus, so
    // only the results below it are replaced.
    const panel = $('.explore') as HTMLElement;
    const results = panel.querySelector('.search-results');
    if (results) results.innerHTML = searchResultsHtml(state.query.trim());
  });

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    const id = t.id;
    const value = (t as HTMLSelectElement).value;
    if (id === 'brand-sort') state.brandSort = value as BrandSort;
    else if (id === 'brand-filter') state.brandFilter = value as BrandFilter;
    else if (id === 'deal-sort') state.dealSort = value as DealSort;
    else if (id === 'note-sort') state.noteSort = value as NoteSort;
    else if (id === 'note-layer') state.noteLayer = value as NoteLayerFilter;
    else if (id === 'browse-sort') state.browseSort = value as BrowseSort;
    else if (id === 'note-detail-sort') state.noteDetailSort = value as ListSort;
    else if (id === 'note-detail-filter') state.noteDetailFilter = value as BrandFilter;
    else if (id === 'brand-detail-sort') state.brandDetailSort = value as ListSort;
    else if (id === 'retailer-detail-sort') state.retailerDetailSort = value as ListSort;
    else if (id === 'retailer-detail-filter') state.retailerDetailFilter = value as BrandFilter;
    else if (id === 'retailer-in-stock') state.retailerInStockOnly = (t as HTMLInputElement).checked;
    else if (id === 'per-row') {
      // The grid reads a CSS variable, so the columns reflow without a
      // re-render. Returning early also keeps the search box from losing
      // focus mid-typing on the search panel.
      setPerRow(Number(value));
      return;
    } else return;
    render();
  });

  // There is no server behind this page, so "send" means handing the message to
  // the reader's own email app, not silently claiming it reached us. The
  // confirmation says exactly that rather than pretending we received it.
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLElement;
    if (form.id === 'home-suggest-form') {
      e.preventDefault();
      const suggestion = ($('#home-suggest-body') as HTMLTextAreaElement).value.trim();
      const name = ($('#home-suggest-name') as HTMLInputElement).value.trim();
      const email = ($('#home-suggest-email') as HTMLInputElement).value.trim();
      const subject = `PriceSniffs: A suggestion`;
      const body = [
        suggestion,
        name ? `\nFrom: ${name}` : '',
        email ? `Reply to: ${email}` : '',
      ].filter(Boolean).join('\n');
      const mailto = `mailto:${COMPANY.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;

      const confirm = $('#home-suggest-confirm') as HTMLElement;
      confirm.textContent = `Your email app should now be open with your suggestion ready to send. Hit send there to reach us, we really appreciate it.`;
      confirm.hidden = false;
      return;
    }
    if (form.id === 'yanny-composer') {
      e.preventDefault();
      const input = $('#yanny-input') as HTMLInputElement;
      const text = input.value;
      input.value = '';
      sendYannyMessage(text);
      return;
    }
    if (form.id === 'auth-signin-form' || form.id === 'auth-signup-form') {
      e.preventDefault();
      const email = ($('#auth-email') as HTMLInputElement).value.trim();
      const password = ($('#auth-password') as HTMLInputElement).value;
      state.authBusy = true;
      state.authError = '';
      state.authResetSent = false;
      render();
      const action = form.id === 'auth-signup-form' ? signUp(email, password) : signIn(email, password);
      action.then((result) => {
        state.authBusy = false;
        if (!result.ok) {
          if (result.reason === 'unverified') {
            // Not a dead end: this reader has an account and needs the link
            // resent. Putting them on the verification screen puts them in
            // front of the Resend button, which is what the mapped message
            // ("request a new one below") was already telling them to use —
            // and which, before this, was not rendered anywhere they could
            // reach, since Supabase issues no session on a rejected sign in.
            state.authPendingEmail = email;
            state.authError = '';
          } else {
            state.authError = result.message;
          }
          render();
          return;
        }
        // Signup with "Confirm email" on (see docs/SUPABASE-SETUP.md, which
        // requires it) resolves ok and returns no session at all, so
        // onAuthChange will not fire and nothing else would tell the reader
        // their signup worked. Remembering the address is what puts them on
        // the verification screen — see accountState's `pendingEmail`.
        if (form.id === 'auth-signup-form') state.authPendingEmail = email;
        // A successful sign in updates state.authUser itself via
        // onAuthChange (see init), which re-renders once the session is
        // actually confirmed rather than optimistically here.
        render();
      });
      return;
    }
    if (form.id !== 'contact-form') return;
    e.preventDefault();

    const type = ($('#contact-type') as HTMLSelectElement).value;
    const body = ($('#contact-body') as HTMLTextAreaElement).value.trim();
    const subject = `PriceSniffs: ${type}`;
    const mailto = `mailto:${COMPANY.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    const confirm = $('#contact-confirm') as HTMLElement;
    confirm.textContent = `Your email app should now be open with your ${type.toLowerCase()} ready to send. Hit send there to reach us, we really appreciate it.`;
    confirm.hidden = false;
  });

  // Back and Forward must move within the app, not out of it. popstate is the
  // only place the address bar is the source of truth: it has already changed
  // by the time this fires, so state follows it rather than the other way
  // round, and nothing is pushed in response or the history would grow on
  // every Back press.
  window.addEventListener('popstate', () => {
    renderFromUrl();
    window.scrollTo({ top: 0 });
  });

  // A window resize can change how the suggestion box wraps (and so its
  // height) without touching state or triggering a re-render on its own, so
  // the update list's cap would otherwise go stale until the next navigation.
  let resizeTimer = 0;
  // ── skip link ───────────────────────────────────────────────────────────
  // The href alone scrolls the landmark into view but leaves focus on the
  // link, so the next Tab resumes from the top bar and the reader is back
  // where they started. Moving focus to <main> is the part that makes it work.
  document.querySelector('.skip-link')?.addEventListener('click', () => {
    ($('#view') as HTMLElement).focus();
  });

  // ── back to top ─────────────────────────────────────────────────────────
  // Shown past two viewport heights: far enough that scrolling back is a real
  // journey, not so eager that it appears on a page barely scrolled. The
  // handler is passive and does its work in a frame callback, because this
  // fires continuously down lists thousands of tiles long.
  const toTop = $('#to-top') as HTMLElement;
  let ticking = false;
  const syncToTop = (): void => {
    const past = window.scrollY > window.innerHeight * 2;
    toTop.classList.toggle('on', past);
    toTop.hidden = !past;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(syncToTop);
  }, { passive: true });
  syncToTop();

  toTop.addEventListener('click', () => {
    // Smooth unless the reader has asked for less motion, in which case a
    // long smooth scroll is exactly the thing they turned off.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // Focus follows the scroll, or a keyboard reader is returned to the top
    // of the page visually while their tab position stays at the bottom.
    ($('#view') as HTMLElement).focus();
  });

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      syncUpdatesHeight();
      syncPerRowControl();
    }, 120);
  });

  // First paint comes from whatever URL we were opened at, so a deep link,
  // a bookmark or a shared link lands on the right view. replaceState then
  // normalises the address bar without adding a history entry. An address
  // that matched nothing keeps the path the reader actually typed, so they
  // can see and correct it, and the not-found view says so; it used to be
  // rewritten to "/" while the homepage rendered underneath.
  renderFromUrl();
  syncUrl('replace');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export type { ArtSize };
