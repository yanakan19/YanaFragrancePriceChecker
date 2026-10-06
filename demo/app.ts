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
 *   Deals          the discounted-fragrance snapshot, a flat list with no
 *                  leaves of its own (headed "Today's Deals" until the owner
 *                  asked for the shorter label on 2026-10-03)
 *   Explore        Brands · Retailers · Notes (a Search tab with its own
 *                  search box sat here too until 2026-10-03: the owner asked
 *                  for one search box, the Quick Search in the top bar)
 *   About          the mission, live numbers, method, FAQ, contact and legal
 *
 * Settings and the three account pages (profile, wishlist, notifications)
 * hang off the account menu at the far right of the bar, after the nav row
 * (owner's account revamp, 2026-10-04; moved from the far left the same day).
 *
 * Everything else (a fragrance, a retailer, a note, a legal document) is a leaf
 * reached from one of those and always carries a Back control. Nothing is ever
 * more than two taps from Home, which is the whole reason the subpages live
 * under Explore rather than crowding the top bar. Deals sits in the
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
import { availabilityHeading, offerGroups, offersInPageOrder, rowShowsAge } from './offerGroups.js';
import { mostStockedRail, rankedInMostStocked } from './mostStocked.js';
import { bestDealPerScent, onePerScent } from './oneScent.js';
import type { PresentedOffer } from '../src/types/offer.js';
import { noStockLabel, rowStockMarks } from './stockLabels.js';
import type { Retailer, RetailerTier, LogoRef } from '../src/types/retailer.js';
import { logoFor } from './brandLogos.js';
import {
  DEMO_FRAGRANCES, BY_POPULARITY, DEALS, NOTE_INDEX,
  brandTierFor, fragranceById, fragranceBySlug, fragrancesAt, listingCountAt, fragrancesWithNote, lowestPrice, compareVariants,
  type DemoFragrance, type NoteLayer,
} from './data.js';
import { productArt, photoSrcAttrs, HOUSE_IMG_SIZES, RETRY_ORIGINAL, type ArtSize } from './photo.js';
import { AA_TEXT, contrastRatio, parseColour, type Rgba } from './contrast.js';
import { GENDER_LABEL, GENDER_ORDER, readGender, type GenderReading } from './gender.js';
import { GIFT_SET_BAND, volumeBandFor, volumeOptions, type VolumeBand } from './volumeBands.js';
import {
  BRAND_SORT_OPTIONS, BROWSE_SORT_OPTIONS, DEAL_SORT_OPTIONS, LIST_SORT_OPTIONS, NOTE_SORT_OPTIONS, SORT_LEAD,
  sortFragrances, sortNotes, type BrowseSort, type ListSort, type NoteSort,
} from './listSort.js';
import { pricePerMl, pricePerMlLabel } from './tabFacets.js';
import { TAB_SEARCH_ID, TAB_SORT_ID, createTabs, facetSelectId, isTabKind, type TabKind } from './tabPanels.js';
import type { TabListState } from './tabLists.js';
import { isOil, isSet } from './productKind.js';
import {
  PER_ROW_CHOICES, PER_ROW_DEFAULT, clampPerRow, gridWidthFor, perRowChoicesFor,
} from './tileDensity.js';
import { trustpilotStateFor, trustpilotLinkMarkup, TRUSTPILOT_LINK_TEXT } from './trustpilotWidget.js';
import { COVERAGE } from './legal.js';
import { marqueeHtml, marqueePhrases } from './marquee.js';
import { adPreviewOn, adPreviewRequested, adSlotHtml, interleaveAds, isGridAd, setAdPreview, withAdPreview } from './ads.js';
import { installAds, mountAds } from './adsRuntime.js';
import { deliveryLines } from './deliveryFacts.js';
import {
  msrpComparison, msrpComparisonLabel, rrpSavingFor, rrpSavingLabel, shownPrice, type MsrpComparison,
} from './msrpComparison.js';
import { pickReferencePrice } from './referencePrice.js';
import { COMPANY, LEGAL_PAGES, legalPage } from './legal.js';
import { CHANGELOG } from './changelog.js';
import { offersFor, SHOP_COUNT, HOUSE_PRODUCTS, HISTORY_ALIASES, OLDER_OFFERS } from './catalogue.generated.js';
import { priceHistory, prefetchWhenIdle, type PriceHistoryData } from './priceHistoryStore.js';
import { dormant, dormantEntry, idForSlug, movedTo } from './dormantStore.js';
import type { DormantEntry } from '../src/catalogue/dormantProducts.js';
import type { PriceHistoryPoint } from './priceHistory.generated.js';
import type { RawHistoryPoint } from '../src/services/priceHistoryDaily.js';
import type { PriceHistoryGap } from '../src/services/priceHistoryGaps.js';
import { mergeCheapestSeries } from '../src/services/priceHistoryMerge.js';
import { HIDE_OFFER_AFTER_DAYS } from '../src/services/offerAge.js';
import { HISTORY_SCOPES, priceHistoryChart, type ChartObservation, type PriceHistoryChartInput } from './priceHistoryChart.js';
import { officialSiteFor } from './brandSites.js';
import { fragranceLinksFor, fragranticaLabel } from './fragranceLinks.js';
import { matchRoute, routeToPath, setProductSlugLookup, slugify, basePath, type Route, type RouteName } from './router.js';
import { headFor, withPreviewNoindex, SITE_URL, type HeadTags, type HeadInput } from './head.js';
import { WRONG_PRICE_PROBLEMS, OTHER_SHOP, wrongPriceMailto, type WrongPriceProblem } from './wrongPrice.js';
import { shareUrl, shareText, shareLinks, shareProductName, type ShareProduct, type SharePrice } from './share.js';
import { SUPABASE_CONFIGURED } from './supabase.js';
import {
  signUp, signIn, signOut, resendVerification, requestPasswordReset, currentUser, isVerified, onAuthChange,
  checkEmailLinkCallback, updatePassword, updateEmail, deleteOwnAccount, onPasswordRecovery,
} from './auth.js';
import type { User } from '@supabase/supabase-js';
import { accountState, wishlistControl, type AccountStateInput } from '../src/services/accountState.js';
import {
  accountAvatar, accountButtonLabel, accountMenuItems, buildDataExport, dataExportFileName, sortWishlist,
  changeSinceSaved, effectiveWishlistSort, wishlistSortsFor, type AccountMenuAction, type DataExportInput,
  type WishlistSort,
} from '../src/services/accountMenu.js';
import { REGIONS, CURRENT_REGION, regionButtonLabel, type Region } from '../src/services/regions.js';
import { flagSvg } from './flags.js';
import { ABOUT } from './legal.js';
import { liveCounts } from './data.js';
import { fetchWishlist, addToWishlist, removeFromWishlist, setTargetPrice, type WishlistEntry } from './wishlist.js';
import { groupWishlist, type WishlistGroup } from '../src/services/wishlistResolve.js';
import { fetchPriceAlerts, setPriceAlerts, unsubscribe } from './priceAlerts.js';
import {
  fetchPhotoState, downloadPhoto, shrinkPhoto, savePhoto, removePhoto, removePhotoForDeletion, blobToDataUrl,
} from './profilePhoto.js';
import { checkPhotoFile, PHOTO_ACCEPT_ATTR } from '../src/services/profilePhoto.js';
import { parseTargetPrice } from '../src/alerts/target.js';
import { UNSUBSCRIBE_PARAM, unsubscribeMessage } from '../src/alerts/unsubscribe.js';

type View =
  | 'home' | 'deals' | 'explore' | 'browse' | 'detail' | 'retailer' | 'brand' | 'note' | 'legal' | 'about'
  | 'settings' | 'suggestions' | 'account' | 'accountWishlist' | 'accountNotifications' | 'design' | 'notFound';
/** The three pages behind the account menu, each with its own address. */
const ACCOUNT_VIEWS: readonly View[] = ['account', 'accountWishlist', 'accountNotifications'];
type AuthTab = 'signIn' | 'signUp';
type ExploreTab = 'brands' | 'retailers' | 'notes' | 'oils' | 'sets';
type DisplayMode = 'dark' | 'light' | 'system';
type Layout = 'mobile' | 'desktop';
type BrandSort = 'az' | 'za';
type BrandFilter = RetailerTier | 'all';
type DealSort = 'discount' | 'lowest' | 'highest';
type NoteLayerFilter = NoteLayer | 'any';
/** Sort for a fragrance list scoped to one note, brand or retailer. Same
 *  vocabulary as the rest of the app: alphabetical both ways (Brands),
 *  price both ways (Deals). */
// ListSort, BrowseSort and sortFragrances live in demo/listSort.ts — see that
// file's header for why they are not inline here.

/** One of the price bands offered under the Price facet. */
type PriceBand = '0-25' | '25-50' | '50-100' | '100-200' | '200+';
/** The Concentration facet's options: rare strengths share one "other" bucket. */
type ConcentrationGroup = 'edp' | 'edt' | 'parfum' | 'edc' | 'oil' | 'other';
/** Every facet a fragrance list can be narrowed by. Matches the state.facet* fields below 1:1. */
type FacetGroup = 'volume' | 'concentration' | 'gender' | 'priceBand' | 'tier' | 'onSale' | 'inStock';

const MODE_KEY = 'pricesniffs.display';
const LAYOUT_KEY = 'pricesniffs.layout';
const PER_ROW_KEY = 'pricesniffs.perrow';

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
  // Browse and search. Defaults to the order this list already arrived in, so
  // the control's existence changes nothing until a reader uses it.
  browseSort: 'stocked' as BrowseSort,
  brandDetailSort: 'az' as ListSort,
  retailerDetailSort: 'az' as ListSort,
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
  facetConcentration: new Set<ConcentrationGroup>(),
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
  // True while the reader who followed a password reset link has not yet set
  // a new password: the account page asks for one before anything else.
  authRecovery: false,
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
  // The same rows as the lines the page shows: each saved id resolved through
  // the merge map (src/services/wishlistResolve.ts). The rows above keep the
  // ids as saved; only this read side follows a merge. See refreshWishlistLines.
  wishlistLines: [] as WishlistGroup<WishlistEntry>[],
  // Price drop emails (queue item 4.1). null until read, and stays null when
  // the database has no such setting yet (migration 0004 not run), which
  // keeps the checkbox off the page rather than showing one that cannot save.
  priceAlerts: null as boolean | null,
  // True once that read has come back, so My Notifications can tell "still
  // loading" from "not available on this deployment" (both leave it null).
  priceAlertsLoaded: false,
  // The wishlist page's sort. Not kept across visits: a fresh visit starts
  // from the newest save, which is what the list was before it had a sort.
  wishlistSort: 'recent' as WishlistSort,
  // The account menu at the top right of the bar (see openAccountMenu).
  accountMenuOpen: false,
  // The country and currency menu just left of it (see openRegionMenu).
  regionMenuOpen: false,
  // The profile photo (demo/profilePhoto.ts). photoAvailable is null until
  // read, false when the owner has not run migration 0006 yet (no control is
  // offered then), true once photos work. photoUrl is a blob: address for the
  // stored photo, made in this browser from the reader's own download, and
  // photoBroken is set when that image fails to show, so the button and the
  // profile fall back to the initial.
  photoAvailable: null as boolean | null,
  photoPath: null as string | null,
  photoBlob: null as Blob | null,
  photoUrl: null as string | null,
  photoBroken: false,
  photoBusy: false,

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
  state.retailerInStockOnly = false;
}

/**
 * Everything a reader can set on a list page: facets, every sort and filter
 * dropdown, and how far down they had scrolled. Stored on that page's own
 * history entry (see rememberListState), so Back to a list brings it back
 * exactly as it was left, while a fresh visit still starts clean.
 */
interface ListSnapshot {
  facetsOpen: boolean;
  facetVolume: VolumeBand[];
  facetConcentration: ConcentrationGroup[];
  facetGender: GenderReading[];
  facetPriceBand: PriceBand[];
  facetTier: RetailerTier[];
  facetOnSale: boolean;
  facetInStock: boolean;
  brand: string | null;
  brandSort: BrandSort;
  brandFilter: BrandFilter;
  dealSort: DealSort;
  noteSort: NoteSort;
  noteLayer: NoteLayerFilter;
  noteDetailSort: ListSort;
  browseSort: BrowseSort;
  brandDetailSort: ListSort;
  retailerDetailSort: ListSort;
  retailerInStockOnly: boolean;
  /** The Oils and Sets tabs' own search, sort and filters (demo/tabPanels.ts). */
  tabs: Record<TabKind, TabListState>;
  scrollY: number;
  /** The product tile at the top of the screen, and how far down it sat. */
  anchorFrag: string | null;
  anchorTop: number;
}

function snapshotListState(): ListSnapshot {
  const anchor = firstVisibleTile();
  return {
    anchorFrag: anchor?.dataset.frag ?? null,
    anchorTop: anchor ? Math.round(anchor.getBoundingClientRect().top) : 0,
    facetsOpen: state.facetsOpen,
    facetVolume: [...state.facetVolume],
    facetConcentration: [...state.facetConcentration],
    facetGender: [...state.facetGender],
    facetPriceBand: [...state.facetPriceBand],
    facetTier: [...state.facetTier],
    facetOnSale: state.facetOnSale,
    facetInStock: state.facetInStock,
    brand: state.brand,
    brandSort: state.brandSort,
    brandFilter: state.brandFilter,
    dealSort: state.dealSort,
    noteSort: state.noteSort,
    noteLayer: state.noteLayer,
    noteDetailSort: state.noteDetailSort,
    browseSort: state.browseSort,
    brandDetailSort: state.brandDetailSort,
    retailerDetailSort: state.retailerDetailSort,
    retailerInStockOnly: state.retailerInStockOnly,
    tabs: tabs.snapshot(),
    scrollY: window.scrollY,
  };
}

function restoreListState(saved: ListSnapshot): void {
  // history.state outlives a deploy, so an entry saved by an older build may
  // lack a field added since; that field keeps its current value.
  const s: ListSnapshot = { ...snapshotListState(), ...saved };
  state.facetsOpen = s.facetsOpen;
  state.facetVolume = new Set(s.facetVolume);
  // Band and group ids can change between builds; an id this build does not
  // offer would filter everything out behind a dropdown that cannot show it.
  state.facetConcentration = new Set(s.facetConcentration.filter((v) => CONCENTRATION_GROUPS.some((g) => g.id === v)));
  state.facetGender = new Set(s.facetGender);
  state.facetPriceBand = new Set(s.facetPriceBand.filter((v) => PRICE_BANDS.some((b) => b.id === v)));
  state.facetTier = new Set(s.facetTier);
  state.facetOnSale = s.facetOnSale;
  state.facetInStock = s.facetInStock;
  state.brand = s.brand;
  state.brandSort = s.brandSort;
  state.brandFilter = s.brandFilter;
  state.dealSort = s.dealSort;
  state.noteSort = s.noteSort;
  state.noteLayer = s.noteLayer;
  state.noteDetailSort = s.noteDetailSort;
  state.browseSort = s.browseSort;
  state.brandDetailSort = s.brandDetailSort;
  state.retailerDetailSort = s.retailerDetailSort;
  state.retailerInStockOnly = s.retailerInStockOnly;
  tabs.restore(s.tabs);
}

/**
 * rememberListState after the next frame, for a change on the same page.
 * Measuring which tile is on screen straight after a render forces the browser
 * to lay the page out early, a second time; after the frame it is already done.
 */
let rememberQueued = false;
function rememberListStateSoon(): void {
  if (rememberQueued) return;
  rememberQueued = true;
  window.requestAnimationFrame(() =>
    window.setTimeout(() => {
      rememberQueued = false;
      rememberListState();
    }, 0),
  );
}

/** Write the current list state onto the current history entry, keeping its depth. */
function rememberListState(): void {
  try {
    const prev = (window.history.state as Record<string, unknown> | null) ?? {};
    window.history.replaceState({ ...prev, list: snapshotListState() }, '');
  } catch {
    // Same as syncUrl: a sandboxed frame rejects history writes, and the app
    // still works without remembering.
  }
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
//
// A house whose own products carry no price at all is left out (the owner's
// call, 2026-10-03: no blank brands). That hid The Body Shop, Jo Loves,
// Pairfum London and a duplicate "escentric-molecules" house, none of which
// had a single price to show.
const BRANDS = [
  ...new Set([
    ...DEMO_FRAGRANCES.map((f) => f.brand),
    ...HOUSE_PRODUCTS.filter((p) => p.nativePrice !== null).map((p) => p.house),
  ]),
].sort();
const TIER_LABEL: Record<RetailerTier, string> = {
  designer: 'Designer', niche: 'Niche', mideast: 'Middle East',
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

// Perfume oils and gift sets are kept out of the Most stocked list (the rail
// and the full list behind See All); the rule and the rail itself live in demo/mostStocked.ts,
// where tests/mostStocked.test.ts holds them to the real catalogue.
const POPULAR = mostStockedRail(BY_POPULARITY);

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

// Five round bands rather than seven: a native dropdown is easier to read
// short, and on 2026-10-01 the cheapest offer per product split 6,662 / 4,689
// / 3,145 / 1,227 / 464 across them — every band worth offering.
const PRICE_BANDS: { id: PriceBand; label: string; min: number; max: number | null }[] = [
  { id: '0-25', label: 'Under £25', min: 0, max: 25 },
  { id: '25-50', label: '£25 to £50', min: 25, max: 50 },
  { id: '50-100', label: '£50 to £100', min: 50, max: 100 },
  { id: '100-200', label: '£100 to £200', min: 100, max: 200 },
  { id: '200+', label: '£200 and Over', min: 200, max: null },
];

/**
 * The Concentration facet's options. Ten raw strengths were too many for one
 * dropdown, and four of them (Aftershave 46, Disputed 15, Eau Fraiche 11 and
 * Not stated 311 on 2026-10-01) are rare or are not a strength at all, so they
 * share "Other or not stated" — which still says plainly that some are not
 * stated rather than folding them into a real strength. Parfum and Extrait de
 * Parfum are the same tier under two names. A product's own card still shows
 * its exact concentration.
 */
const CONCENTRATION_GROUPS: { id: ConcentrationGroup; label: string; members: readonly string[] }[] = [
  { id: 'edp', label: 'Eau de Parfum (EDP)', members: ['Eau de Parfum'] },
  { id: 'edt', label: 'Eau de Toilette (EDT)', members: ['Eau de Toilette'] },
  { id: 'parfum', label: 'Parfum / Extrait', members: ['Parfum', 'Extrait de Parfum'] },
  { id: 'edc', label: 'Eau de Cologne (EDC)', members: ['Eau de Cologne'] },
  { id: 'oil', label: 'Perfume Oil', members: ['Perfume Oil'] },
  { id: 'other', label: 'Other or Not Stated', members: [] },
];

function concentrationGroupOf(concentration: string): ConcentrationGroup {
  return CONCENTRATION_GROUPS.find((g) => g.members.includes(concentration))?.id ?? 'other';
}

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
  // A name that states an audience is read first. Where it is silent, the
  // audience a shop's own category label gave stays (f.gender): Perfume Direct's
  // "Women's Perfume" is off the name so the bottle meets the other shops'.
  const named = readGender(`${f.brand} ${f.name} ${f.concentration}`);
  const reading = named === 'notStated' && f.gender ? f.gender : named;
  genderCache.set(f.id, reading);
  return reading;
}

/** What every facet reads off one fragrance, worked out once. */
interface FacetAttrs {
  volume: VolumeBand | null;
  concentration: ConcentrationGroup;
  gender: GenderReading;
  tier: RetailerTier;
  priceBand: PriceBand | null;
  onSale: boolean;
  inStock: boolean;
}

const FACET_ORDER: FacetGroup[] = ['volume', 'concentration', 'gender', 'tier', 'priceBand', 'onSale', 'inStock'];

/**
 * FacetAttrs per fragrance, kept for the current minute. The price band, sale
 * and stock come from the fragrance's comparison rows, which read the clock (a
 * promotion can end), so they cannot be kept for the session; but rebuilding
 * every product's rows on every filter change, several times over, was most
 * of what made a change take 370ms on a phone-speed CPU.
 */
const facetAttrsCache = new Map<string, FacetAttrs>();
let facetAttrsMinute = -1;

function facetAttrs(f: DemoFragrance): FacetAttrs {
  const minute = Math.floor(Date.now() / 60_000);
  if (minute !== facetAttrsMinute) {
    facetAttrsCache.clear();
    facetAttrsMinute = minute;
  }
  let a = facetAttrsCache.get(f.id);
  if (!a) {
    const rows = rowsFor(f);
    const best = bestOffer(rows);
    a = {
      // A title that cannot be read as one size (volumeBandFor returns null —
      // see its own comment) belongs to no band, the same "cannot answer, so
      // it does not match a specific band" rule the price band applies to a
      // delivery cost nobody states.
      // A gift set is filed under its own Volume option and in no size band.
      volume: volumeBandFor(f.sizeMl, f.giftSet !== null),
      concentration: concentrationGroupOf(f.concentration),
      gender: genderOf(f),
      tier: f.tier,
      priceBand: best ? priceBandFor(best.deliveredPriceGbp) : null,
      // On sale means the product page prints a sale price for at least one
      // row: the same decision offerRow makes (below MSRP, or else a saving
      // against the shop's RRP), on the same shown figure. Before 3 Oct 2026
      // this counted any RRP at all, including rows whose page reads "above
      // MSRP" or whose delivered total is not below the RRP.
      onSale: rows.some((r) => {
        const m = best ? msrpFor(r, f) : null;
        return m ? m.direction === 'below' : rrpSavingFor(r) !== null;
      }),
      inStock: rows.some((r) => r.isPurchasable),
    };
    facetAttrsCache.set(f.id, a);
  }
  return a;
}

/** Whether a fragrance fails one facet group as it is currently set. */
function failsFacet(a: FacetAttrs, group: FacetGroup): boolean {
  switch (group) {
    case 'volume': return state.facetVolume.size > 0 && (a.volume === null || !state.facetVolume.has(a.volume));
    case 'concentration': return state.facetConcentration.size > 0 && !state.facetConcentration.has(a.concentration);
    case 'gender': return state.facetGender.size > 0 && !state.facetGender.has(a.gender);
    case 'tier': return state.facetTier.size > 0 && !state.facetTier.has(a.tier);
    case 'priceBand': return state.facetPriceBand.size > 0 && (a.priceBand === null || !state.facetPriceBand.has(a.priceBand));
    case 'onSale': return state.facetOnSale && !a.onSale;
    case 'inStock': return state.facetInStock && !a.inStock;
  }
}

/**
 * Whether one fragrance survives every active facet except `exclude`. Passing
 * a group's own id when computing that same group's option counts is what
 * makes ticking a second option within a group additive rather than
 * self-defeating — see the header comment above.
 */
function passesFacets(f: DemoFragrance, exclude: FacetGroup | null): boolean {
  const a = facetAttrs(f);
  return FACET_ORDER.every((g) => g === exclude || !failsFacet(a, g));
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
  const concentration = new Map<ConcentrationGroup, number>();
  const gender = new Map<GenderReading, number>();
  const priceBand = new Map<PriceBand, number>();
  const tier = new Map<RetailerTier, number>();
  let onSale = 0;
  let inStock = 0;

  // One pass: a fragrance that fails no group counts in every group; one that
  // fails exactly one group counts only in that group, which is what "every
  // other facet but never its own" means; one that fails two counts nowhere.
  for (const f of list) {
    const a = facetAttrs(f);
    let failed: FacetGroup | null = null;
    let failures = 0;
    for (const g of FACET_ORDER) {
      if (!failsFacet(a, g)) continue;
      failed = g;
      if (++failures > 1) break;
    }
    if (failures > 1) continue;
    const counts = (g: FacetGroup) => failures === 0 || failed === g;
    if (counts('volume') && a.volume !== null) volume.set(a.volume, (volume.get(a.volume) ?? 0) + 1);
    if (counts('concentration')) concentration.set(a.concentration, (concentration.get(a.concentration) ?? 0) + 1);
    if (counts('gender')) gender.set(a.gender, (gender.get(a.gender) ?? 0) + 1);
    if (counts('tier')) tier.set(a.tier, (tier.get(a.tier) ?? 0) + 1);
    if (counts('priceBand') && a.priceBand !== null) priceBand.set(a.priceBand, (priceBand.get(a.priceBand) ?? 0) + 1);
    if (counts('onSale') && a.onSale) onSale++;
    if (counts('inStock') && a.inStock) inStock++;
  }

  const toOptions = <T extends string | number>(counts: Map<T, number>, label: (v: T) => string): FacetOption[] =>
    [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => (typeof a[0] === 'number' ? (a[0] as number) - (b[0] as number) : String(a[0]).localeCompare(String(b[0]))))
      .map(([value, count]) => ({ value: String(value), label: label(value), count }));

  // Every group in a fixed order, not alphabetical or by count, so each
  // dropdown reads the same way every time: sizes and prices low to high,
  // strengths strongest-selling first with "Other or not stated" last, and
  // gender's three stated readings before "Not stated". Same "only offer what
  // would return something" rule as before: a value nobody here has is left out.
  return {
    // The five size bands, then Gift Sets: see volumeOptions.
    volume: volumeOptions(volume),
    concentration: CONCENTRATION_GROUPS.filter((g) => (concentration.get(g.id) ?? 0) > 0).map((g) => ({
      value: g.id, label: g.label, count: concentration.get(g.id)!,
    })),
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

/** The `<select>` id for each dropdown facet, read back by the change handler. */
const FACET_SELECT_ID = {
  volume: 'facet-volume',
  concentration: 'facet-concentration',
  gender: 'facet-gender',
  priceBand: 'facet-price',
  tier: 'facet-tier',
} as const;

/**
 * One facet as the browser's own dropdown — the iPhone or Android picker on a
 * phone, a plain menu on a computer — with "Any …" first so choosing nothing
 * is a choice like any other. One value per facet: a native multiple-select is
 * a picker on phones but an always-open list box on desktop.
 *
 * A selected value whose count has dropped to nothing (another facet has
 * since ruled it out) stays in the list at 0. Leaving it out would make the
 * dropdown read "Any …" while the filter was still applied.
 */
function facetSelect(group: keyof typeof FACET_SELECT_ID, label: string, anyLabel: string, options: FacetOption[], selected: Set<string>): string {
  const current = [...selected][0];
  const shown = current !== undefined && !options.some((o) => o.value === current)
    ? [...options, { value: current, label: options.find((o) => o.value === current)?.label ?? current, count: 0 }]
    : options;
  if (shown.length < 2 && current === undefined) return '';
  return `<label class="control facet-control">
    <span class="sr">${esc(label)}</span>
    <select id="${FACET_SELECT_ID[group]}" class="dropdown">
      <option value="">${esc(anyLabel)}</option>
      ${shown.map((o) => `<option value="${esc(o.value)}"${o.value === current ? ' selected' : ''}>${esc(o.label)} (${o.count.toLocaleString('en-GB')})</option>`).join('')}
    </select>
    <span class="control-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
  </label>`;
}

/** A yes/no facet as the browser's own checkbox, boxed to match the dropdowns. */
function facetCheckbox(id: string, label: string, count: number | null, checked: boolean): string {
  return `<label class="control facet-check">
    <input type="checkbox" id="${id}"${checked ? ' checked' : ''} />
    <span class="facet-check-label">${esc(label)}</span>
    ${count === null ? '' : `<span class="facet-count t-count">${count.toLocaleString('en-GB')}</span>`}
  </label>`;
}

/** A list page's filters: the toggle for its controls row and the panel shown under that row. */
interface FacetUi {
  toggle: string;
  panel: string;
}

/**
 * The filters for a fragrance list. `list` is the page's candidates before
 * any facet is applied, so every count reads "how many would this give".
 *
 * `inStockHere` is for a shop's own page: there "In stock" has to mean in
 * stock at that shop, not anywhere, so the shop's own checkbox replaces the
 * sitewide one rather than sitting beside it as a second, different switch.
 * Like every other facet it is only offered when it would narrow the list
 * (or is already ticked, so it can be unticked).
 */
function facets(list: DemoFragrance[], opts: { inStockHere?: { checked: boolean; narrows: boolean } } = {}): FacetUi {
  const g = facetGroups(list);
  const here = opts.inStockHere;
  const count = activeFacetCount() + (here?.checked ? 1 : 0);

  const controls = [
    facetSelect('volume', 'Size', 'Any Size', g.volume, state.facetVolume),
    facetSelect('concentration', 'Concentration', 'Any Concentration', g.concentration, state.facetConcentration),
    facetSelect('gender', 'Gender', 'Any Gender', g.gender, state.facetGender),
    facetSelect('priceBand', 'Price', 'Any Price', g.priceBand, state.facetPriceBand),
    facetSelect('tier', 'Brand Type', 'Any Brand Type', g.tier, state.facetTier),
    g.onSale > 0 || state.facetOnSale ? facetCheckbox('facet-on-sale', 'On Sale', g.onSale, state.facetOnSale) : '',
    here
      ? here.narrows || here.checked ? facetCheckbox('retailer-in-stock', 'In Stock Here', null, here.checked) : ''
      : (g.inStock > 0 && g.inStock < list.length) || state.facetInStock
        ? facetCheckbox('facet-in-stock', 'In Stock', g.inStock, state.facetInStock)
        : '',
  ].filter(Boolean);

  if (controls.length === 0) return { toggle: '', panel: '' };

  // Who a fragrance is for is read off wording in its title, and most titles
  // have none, so "Not stated" is the biggest gender reading by far. Said
  // once, in the panel, so a short Women's list is not mistaken for a thin
  // catalogue or a broken filter.
  const genderNote = g.gender.length >= 2
    ? `<p class="facet-note t-caption">Gender is read from wording in the title, such as Pour Homme or For Her. Not Stated is not the same as Unisex.</p>`
    : '';

  return {
    toggle: `<button type="button" class="control facets-toggle" data-facets-toggle aria-expanded="${state.facetsOpen}">
      <span class="control-ico">${ICON_FILTER}</span>
      <span>Filters</span>
      ${count > 0 ? `<span class="facets-badge">${count}</span>` : ''}
    </button>`,
    panel: state.facetsOpen
      ? `<div class="facets-panel">
          <div class="facet-grid">${controls.join('')}</div>
          ${genderNote}
          ${count > 0 ? `<button type="button" class="link-btn facets-clear" data-facets-clear>Clear All Filters</button>` : ''}
        </div>`
      : '',
  };
}

/**
 * The one controls row every fragrance list shares, in the same order on every
 * page: sort, filters, then (desktop only) tiles per row. The filter panel
 * opens underneath the row, full width, rather than inside it.
 */
function listControls(sort: string, f: FacetUi): string {
  return `<div class="controls">${sort}${f.toggle}${perRowControl()}</div>${f.panel}`;
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

/**
 * Publishes the width of the page's vertical scrollbar as --sbw, in pixels:
 * 0 where scrollbars float over the page (phones, macOS), about 15 where a
 * classic one takes room. 100vw includes it, the page's own width does not,
 * and the full width home banner needs the difference to stop short of
 * making the page scroll sideways. Written only when it changes.
 */
let lastScrollbarWidth = -1;
function syncScrollbarWidth(): void {
  const root = document.documentElement;
  const width = Math.max(0, window.innerWidth - root.clientWidth);
  if (width === lastScrollbarWidth) return;
  lastScrollbarWidth = width;
  root.style.setProperty('--sbw', `${width}px`);
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

function age(seconds: number): string {
  if (seconds < 90) return 'just now';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  // Past two days, "Nh ago" stops being readable at a glance (an offer six
  // days old would otherwise read "144h ago") — days is the unit a reader
  // actually judges freshness in beyond that point. Nothing shown here is
  // older than HIDE_OFFER_AFTER_DAYS (7), so this reads "2d ago" to "7d ago".
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
// The share set (the Share button and its pop-up, see openShareDialog). Same
// line drawn, single weight look as the rest. The four brand marks are plain
// monochrome glyphs of our own drawing, not the companies' logo artwork.
const ICON_SHARE = icon('<path d="M12 15.5V3.5M12 3.5 7.8 7.7M12 3.5l4.2 4.2M5 11.5v6.2A2.3 2.3 0 0 0 7.3 20h9.4a2.3 2.3 0 0 0 2.3-2.3v-6.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>');
const ICON_COPY = icon('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.4" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 8.5V6.4A2.4 2.4 0 0 0 13.1 4H6.4A2.4 2.4 0 0 0 4 6.4v6.7a2.4 2.4 0 0 0 2.4 2.4h2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');
const ICON_TICK = icon('<path d="m5 12.8 4.6 4.6L19 7.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
const ICON_MORE = icon('<circle cx="5.5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor"/>');
const ICON_WHATSAPP = icon('<path d="M3.6 20.4 5 15.9A8.5 8.5 0 1 1 8.2 19L3.6 20.4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.4 8.3c-.5.6-.6 1.4-.2 2.4.9 2 2.6 3.6 4.7 4.3 1 .3 1.8 0 2.3-.6l.2-.4-1.9-1-.9.8c-1-.4-2-1.3-2.5-2.4l.8-.9-1-1.9-.5-.3Z" fill="currentColor"/>');
const ICON_SNAPCHAT = icon('<path d="M12 3.6c-2.6 0-4.3 2-4.3 4.5v2.2c-.5.3-1.4.4-2.2.5.2.5.6.9 1.3 1.1-.4 1.2-1.4 2.2-2.5 2.8.7.5 1.6.6 2.4.8.3.4.2 1 .8 1.3 1 .4 1.7-.3 2.6.2.5.3 1.2 1.3 1.9 1.3s1.4-1 1.9-1.3c.9-.5 1.6.2 2.6-.2.6-.3.5-.9.8-1.3.8-.2 1.7-.3 2.4-.8-1.1-.6-2.1-1.6-2.5-2.8.7-.2 1.1-.6 1.3-1.1-.8-.1-1.7-.2-2.2-.5V8.1c0-2.5-1.7-4.5-4.3-4.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>');
const ICON_X = icon('<path d="M4.5 4.5h3.7l11.3 15h-3.7L4.5 4.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M19 4.5 13.2 11M5 19.5l5.8-6.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>');
/* The one filled mark in this set, and the exception is the point: a stop
   square drawn as a 1.7px outline at this size reads as an empty checkbox,
   which is the opposite of a control that halts something. `currentColor`
   rather than a colour of its own, so it takes --accent-on from the button
   it sits in — near-black on the dark theme's red, white on the light
   theme's — and stays correct under every value of data-mode, including the
   default "match my device". */
const ICON_STOP = icon('<rect x="7" y="7" width="10" height="10" rx="1.6" fill="currentColor"/>');

/** A labelled dropdown with its icon, used for every sort and filter control. */
function control(id: string, label: string, ico: string, options: { value: string; label: string }[], current: string, lead = ''): string {
  return `<label class="control${lead ? ' control-sort' : ''}">
    <span class="control-ico">${ico}</span>
    ${lead ? `<span class="control-lead">${esc(lead)}</span>` : ''}
    <span class="sr">${esc(label)}</span>
    <select id="${id}" class="dropdown">
      ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>
    <span class="control-chevron" aria-hidden="true">${ICON_CHEVRON}</span>
  </label>`;
}

/**
 * Every sort dropdown on the site is built here, so every one of them says
 * "Sort By:" in the closed state and names both ends of its order (owner's
 * rule, 2026-10-04).
 *
 * The words come from a fixed label inside the control's box, not from a
 * prefix on each option: the native select, and the picker the OS draws for
 * it (the wheel on iPhone Safari), then list only the orders themselves
 * instead of repeating "Sort By:" on every row. The label is real text, so
 * it also names the control for a screen reader: `subject` is the hidden half
 * ("fragrances"), read after the visible "Sort By:", and nothing else says
 * "sort", so it is never read twice.
 */
function sortControl(id: string, subject: string, ico: string, options: { value: string; label: string }[], current: string): string {
  return control(id, subject, ico, options, current, SORT_LEAD);
}

/** The sort dropdown offered on a note, brand or retailer page. The
 *  comparator itself and the option list are in demo/listSort.ts. */
function listSortControl(id: string, current: ListSort): string {
  return sortControl(id, 'Fragrances', ICON_SORT, LIST_SORT_OPTIONS, current);
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
  return sortControl('browse-sort', 'Fragrances', ICON_SORT, BROWSE_SORT_OPTIONS, current);
}

/**
 * The Oils and Sets tabs under Explore: their lists, filters and search, all in
 * demo/tabPanels.ts. The page hands in what it owns (the tile grid, the sort
 * control, the shared filter attributes and options).
 */
const tabs = createTabs({
  attrs: (f) => {
    const a = facetAttrs(f);
    return { concentration: a.concentration, gender: a.gender, tier: a.tier, priceBand: a.priceBand, inStock: a.inStock };
  },
  concentrationOptions: CONCENTRATION_GROUPS.map((g) => ({ value: g.id, label: g.label })),
  genderOptions: GENDER_ORDER.map((g) => ({ value: g, label: GENDER_LABEL[g] })),
  priceOptions: PRICE_BANDS.map((b) => ({ value: b.id, label: b.label })),
  tierOptions: (['designer', 'niche', 'mideast'] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
  fragranceList: (list, empty) => fragranceList(list, empty),
  sortControl: (id, subject, options, current) => sortControl(id, subject, ICON_SORT, [...options], current),
  listControls: (sort, ui) => listControls(sort, ui),
  esc,
  iconFilter: ICON_FILTER,
  iconChevron: ICON_CHEVRON,
});

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
function sizeLabel(f: Pick<DemoFragrance, 'sizeMl' | 'giftSet'>): string {
  // A gift set is its own category (src/catalogue/giftSet.ts): it says so
  // where a single bottle states its size, and never "Size not confirmed",
  // which would read as a bottle whose size is in doubt.
  if (f.giftSet) return f.giftSet.bundle ? 'Bundle' : 'Gift Set';
  return f.sizeMl === null ? 'Size not confirmed' : `${f.sizeMl}ml`;
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
  // In a tile this whole block sits inside a <button>, which may only hold
  // phrasing content, so everything is a span. On the detail page (`tag`
  // 'div') it is the page's own heading: the name is the one h1, and its
  // wrappers are divs so the heading is not nested inside inline elements.
  // Styling is by class throughout, so nothing moves.
  const block = tag !== 'span';
  const wrap = block ? 'div' : 'span';
  const name = block ? 'h1' : 'span';
  return `<${tag} class="phead">
    <${wrap} class="phead-text">
      <${wrap} class="phead-name-wrap"><${name} class="phead-name ${nameRole}" title="${esc(f.name)}">${esc(f.name)}</${name}></${wrap}>
    </${wrap}>
    <span class="phead-meta t-caption">
      <span>${sizeLabel(f)}</span>
      <span>${esc(shortConcentration(f.concentration))}</span>
    </span>
  </${tag}>`;
}

/**
 * What is in a gift set, under its name on its own page, and the one fact
 * that sets its prices apart: they are for this set, compared only with the
 * same set at other shops, never with a single bottle (src/catalogue/giftSet.ts).
 * The contents are read from the shop's title; where it does not spell them
 * out, the shop's own title is shown instead of a guess.
 */
function giftSetBlock(f: DemoFragrance): string {
  if (!f.giftSet) return '';
  const contents = f.giftSet.contents
    ? `<p class="giftset-contents t-body"><span class="giftset-label">In this set:</span> ${esc(f.giftSet.contents.join(', '))}</p>`
    : `<p class="giftset-contents t-body"><span class="giftset-label">As the shop lists it:</span> ${esc(f.giftSet.title)}</p>`;
  return `<div class="giftset-block">
      ${contents}
      <p class="giftset-note t-caption">Gift set prices are compared only with this same set, never with a single bottle.</p>
    </div>`;
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
 * Each link goes straight to this perfume's own page — on the brand's
 * website and on Fragrantica — wherever one has been found and checked
 * (data/fragrance-links.json). Where none has, Official Site falls back to the
 * brand's homepage and is absent (renders nothing) when `officialSiteFor` has
 * no entry for the brand — same rule brandView() already follows, never a
 * placeholder — and Fragrantica falls back to a search for the perfume, which
 * always renders and says so: the pill reads "Fragrantica" only where it opens
 * the perfume's own page and "Search Fragrantica" where it opens a search
 * (owner request of 2026-10-05: a pill must not claim a page it does not
 * open). See demo/fragranceLinks.ts for why each link is scoped the way it is.
 */
function fragranceLinksBlock(f: DemoFragrance): string {
  const links = fragranceLinksFor(f.brand, f.name, f.concentration);
  return `<div class="frag-links-row">
    ${
      links.officialSite
        ? `<a class="brand-site-link" href="${esc(links.officialSite.url)}" target="_blank" rel="noopener nofollow">
             <span class="control-ico">${ICON_EXTERNAL}</span>
             <span>Official Site</span>
           </a>`
        : ''
    }
    <a class="brand-site-link" href="${esc(links.fragranticaUrl)}" target="_blank" rel="noopener nofollow">
      <span class="control-ico">${ICON_EXTERNAL}</span>
      <span>${fragranticaLabel(links)}</span>
    </a>
  </div>`;
}

function priceLine(f: DemoFragrance): string {
  const rows = rowsFor(f);
  const best = bestOffer(rows);
  if (!best) return `<span class="amt none">${noStockLabel(rows)}</span>`;
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
    <span class="amt-note">Delivery Not Stated</span>`;
}

/**
 * The Share control on a wishlist row (/account/wishlist): an icon button, the
 * remove button's own size, stacked above it in the row's end column so the
 * row gets no wider (see .wishlist-side in template.html). It is a sibling of
 * the row's button, so a tap on it never opens the product. Same pop-up, link
 * and text as the product page's button. See openShareDialog.
 */
function shareRowButton(f: Pick<DemoFragrance, 'id' | 'brand' | 'name'>): string {
  return `<button type="button" class="share-btn wishlist-share" data-share="${esc(f.id)}"
      aria-label="Share ${esc(f.brand)} ${esc(f.name)}" aria-haspopup="dialog">${ICON_SHARE}</button>`;
}

/**
 * The Share button on a product page: the wishlist Save button's own shape,
 * beside it (see .hero-actions in template.html), with its word showing
 * because there is room for it.
 */
function sharePageButton(f: Pick<DemoFragrance, 'id' | 'brand' | 'name'>): string {
  return `<button type="button" class="share-btn share-page" data-share="${esc(f.id)}"
      aria-label="Share ${esc(f.brand)} ${esc(f.name)}" aria-haspopup="dialog">${ICON_SHARE}<span>Share</span></button>`;
}

/**
 * What a set's tile says about what is in the box (docs/GIFT-SETS-AND-OILS-PLAN.md,
 * 2.3). With a photo, one or two lines under the name; the shop's own title,
 * labelled as such, where no contents are known. Without a photo the contents take
 * the picture's place instead (setContentsArt), so this line is left out.
 */
function setTileLine(f: DemoFragrance): string {
  const g = f.giftSet;
  if (!g || !f.photoUrl) return '';
  return g.contents
    ? `<span class="tile-contents t-caption"><span class="sr">In this set: </span>${esc(g.contents.join(', '))}</span>`
    : `<span class="tile-contents t-caption"><span class="sr">As the shop lists it: </span>${esc(g.title)}</span>`;
}

/**
 * What an oil's tile adds under its name: the price of a millilitre at the cheapest
 * shop (the one honest comparison between oils, which come in so many sizes), and
 * "Roll On", "Dropper" or "Alcohol Free" only where a shop said so.
 */
function oilTileLine(f: DemoFragrance): string {
  if (!isOil(f)) return '';
  const per = pricePerMl(f);
  const tags = [f.oil?.format === 'roll-on' ? 'Roll On' : f.oil?.format === 'dropper' ? 'Dropper' : '', f.oil?.alcoholFree ? 'Alcohol Free' : ''].filter(Boolean);
  const parts = [...(per !== null ? [pricePerMlLabel(per)] : []), ...tags];
  return parts.length > 0 ? `<span class="tile-contents t-caption">${esc(parts.join(', '))}</span>` : '';
}

/** A set with no photo: its contents, a line to an item, where the picture would be. */
function setContentsArt(g: NonNullable<DemoFragrance['giftSet']>): string {
  const SHOWN = 6;
  const items = g.contents ?? [];
  const body =
    items.length > 0
      ? `<span class="art-contents-head">In this set</span>${items
          .slice(0, SHOWN)
          .map((i) => `<span class="art-contents-item">${esc(i)}</span>`)
          .join('')}${items.length > SHOWN ? `<span class="art-contents-more">and ${items.length - SHOWN} more</span>` : ''}`
      : `<span class="art-contents-head">As the shop lists it</span><span class="art-contents-item art-contents-title">${esc(g.title)}</span>`;
  return `<span class="art art-md art-contents">${body}</span>`;
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
  opts?: { rank?: number; trailing?: string; rail?: boolean; eager?: boolean; soldBy?: string | undefined },
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
  // A deal tile names the shop the deal is at, which need not be the
  // product's cheapest shop: the price above it is that shop's.
  const badgeRetailer = opts?.soldBy ?? best?.retailer.name ?? null;
  // "from" when the figure above is a delivered price the shop won on against
  // others, "at" when it is that one shop's own item price with delivery not
  // stated — the same distinction priceLine already draws in its wording, so
  // the balloon and the number above it never disagree about what is being
  // shown.
  const badgePrefix = opts?.soldBy ? 'at' : best && best.deliveredPriceGbp !== null ? 'from' : 'at';
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
        ${setTileLine(f)}${oilTileLine(f)}
        <span class="tile-art">
          ${medal ? `<span class="medal ${medal}" aria-label="Number ${opts!.rank! + 1} most popular"><span class="medal-disc">${opts!.rank! + 1}</span></span>` : ''}
          ${f.giftSet && !f.photoUrl ? setContentsArt(f.giftSet) : productArt(f.photoUrl, 'md', `${f.brand} ${f.name}`, f.imageTransform, { eager: opts?.eager === true })}
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
  const eager = gridEagerCount();
  return `<ul class="tile-grid">${chunked(
    withGridAds(list, (f, i) => fragranceTile(f, { eager: i !== undefined && i < eager })),
    (item, i) => item(i),
  )}</ul>`;
}

/**
 * A grid's tiles as render functions, with an ad tile after every few when
 * ads are on (interleaveAds in demo/ads.ts: never in the first row, never a
 * change to the order). With ads off this is the list's own tiles, nothing
 * more. An ad never takes a first row index, so `eager` still counts only
 * product tiles.
 */
function withGridAds<T>(list: readonly T[], tile: (item: T, index?: number) => string): ((index?: number) => string)[] {
  return interleaveAds(list, adListSeed()).map((item) => (isGridAd(item) ? () => adSlotHtml('grid') : (i?: number) => tile(item, i)));
}

/**
 * What names the list being drawn, for placing its ads: its address without
 * the ad preview parameter (the route and its query), so the same list gets
 * the same ad positions on every draw, scroll, windowing swap and Back.
 */
function adListSeed(): string {
  return routeToPath(currentRoute());
}

/**
 * How many tiles of a grid are in its first row, and so on screen when the
 * list appears: their photos are fetched at once rather than lazily (see
 * productArt). Two on the narrow layout, the reader's column count on the
 * wide one.
 */
function gridEagerCount(): number {
  return state.layout === 'desktop' ? effectivePerRow() : 2;
}

/** The same for the home page's horizontal rail: as many 172px cards as fit. */
function railEagerCount(): number {
  return Math.max(1, Math.ceil(window.innerWidth / 172));
}

/* ── home ────────────────────────────────────────────────────────────────── */

const MEDALS = ['gold', 'silver', 'bronze'] as const;

/** Built once: both inputs are fixed for the life of the bundle. */
const MARQUEE = marqueeHtml(marqueePhrases(DEMO_FRAGRANCES.length, COVERAGE));

function homeView(): string {
  return `
    <section class="intro">
      <div class="hero-logo">
        <!-- The site name is the home page's one level-one heading; every
             other view's title carries .t-page as an h1 of its own. The class
             does the styling, so the element can be the honest one. -->
        <h1 class="hero-wordmark">Price<em>Sniffs</em></h1>
      </div>
      <!-- Replaced "The only tool you need to find the best price on any
           fragrance" on 2026-09-06: "only", "best" and "any" are three claims
           this site cannot support, and the CAP Code treats an unsupportable
           superlative as misleading. What follows is what the site can show.
           The trust lines that used to sit under it (delivery, how often
           prices are checked, no promoted listings, the database count) are
           gone on the owner's request, 2026-10-04: the banner under the hero
           already says all of it, and says it once. -->
      <p class="hero-mission">See what a fragrance really costs across ${COVERAGE} UK shops, delivery included.</p>
    </section>

    <!-- The scrolling word banner, full width, directly under the hero. Its
         phrases and why each is true live in demo/marquee.ts. -->
    ${MARQUEE}

    <section class="pop-section">
      <div class="section-head">
        <h2 class="t-section">Most Stocked</h2>
        <button class="link-btn see-top" data-browse>See All <span aria-hidden="true">→</span></button>
      </div>
      <ul class="pop-rail">
        ${POPULAR.map((f, i) => fragranceTile(f, { rank: i, rail: true, eager: i < railEagerCount() })).join('')}
      </ul>
    </section>${adSlotHtml('home')}

    <!-- The suggestion form that used to sit beside this moved to its own
         page, Suggestions in the account menu (owner request, 2026-10-04). -->
    <div class="bottom-split">
      <section class="updates-section">
        <h2 class="t-section">Update History</h2>
        <!-- The list scrolls on desktop (max-height in the stylesheet), and a
             region that scrolls must be reachable from the keyboard or its
             lower entries are unreachable without a mouse: tabindex="0" puts
             it in the tab order, and the label says what the reader has
             landed on. axe scrollable-region-focusable, 2026-09-06. -->
        <ul class="updates-list" tabindex="0" aria-label="Update history">
          ${CHANGELOG.map(
            (entry) => `<li class="update-entry">
                <p class="update-head">
                  <span class="update-version">${esc(entry.version)}</span>
                  <span class="update-date">${esc(entry.date)}</span>
                </p>
                ${entry.groups
                  .map(
                    (group) => `<h3 class="update-group">${esc(group.heading)}</h3>
                <ul class="update-points">
                  ${group.points.map((p) => `<li>${esc(p)}</li>`).join('')}
                </ul>`,
                  )
                  .join('')}
              </li>`,
          ).join('')}
        </ul>
      </section>
    </div>`;
}

/* ── browse ──────────────────────────────────────────────────────────────── */

/**
 * Whether the search page is showing the leading Most Stocked list rather than
 * a brand page, a search or a Gift Sets list. No brand and no query means it
 * is, and oils and gift sets are kept out of that one list (see
 * demo/mostStocked.ts), so Gift Sets is not an option there at all. The one
 * way to have it chosen with no query is the old /gift-sets address, which
 * lands here with Size set to Gift Sets (applyRoute); that list is then every
 * gift set, not the Most Stocked ranking with the sets taken out of it, so the list stops
 * being the Most Stocked one while the choice stands and comes back when it
 * is cleared.
 */
function isMostStockedList(): boolean {
  return !state.brand && !state.query.trim() && !state.facetVolume.has(GIFT_SET_BAND.id);
}

function visibleFragrances(): DemoFragrance[] {
  const q = state.query.trim().toLowerCase();
  // The leading Most Stocked list leaves oils and gift sets out (see
  // demo/mostStocked.ts). Dropped here rather than at the slice in browseView so the facet
  // counts and the row count agree with what is actually listed — a facet
  // offering "17 Perfume Oil" on a page that shows none is worse than either.
  const isTop = isMostStockedList();
  const list = BY_POPULARITY.filter((f) => {
    if (isTop && !rankedInMostStocked(f)) return false;
    if (state.brand && f.brand !== state.brand) return false;
    if (!q) return true;
    return `${f.brand} ${f.name} ${f.concentration}`.toLowerCase().includes(q);
  });
  // The Most stocked list keeps one entry per scent, its best ranked size
  // (owner's decision, 2026-10-03; see demo/oneScent.ts). Before the facets,
  // like the oil and gift set rule above, so the counts beside each filter
  // option agree with the rows. A search or a brand still lists every size.
  return isTop ? onePerScent(list) : list;
}

function browseView(): string {
  const filtered = visibleFragrances();
  const faceted = applyFacets(filtered);
  // No list on the site is capped (owner's decision, 2026-10-04). The leading
  // list is every fragrance in the Most Stocked ranking, one per scent, and
  // it loads a chunk at a time as the reader scrolls (chunked, below), so the
  // first paint is one chunk however long the list is. Sort and filters work
  // on the whole ranking: sorting by price lists the cheapest of all of them,
  // not the cheapest of a first fifty.
  const isTop = isMostStockedList();
  const list = state.browseSort === 'stocked' ? faceted : sortFragrances(faceted, state.browseSort);
  const title =
    state.brand ??
    (state.query.trim() ? `Results for "${state.query.trim()}"` : isTop ? `Most stocked` : `All Fragrances`);

  return `
    <button class="back" data-back-home>Back</button>
    <div class="page-head"><h1 class="t-page">${esc(title)}</h1><span class="count t-count">${list.length}</span></div>
    ${
      isTop && state.browseSort === 'stocked'
        ? `<p class="panel-note t-body">Ranked by how many of our ${SHOP_COUNT} shops stock each one, then by
             brand and name. A brand's own store does not count. Oils are not listed here, and each perfume is
             listed once, in its most stocked size. This shows how widely a fragrance is stocked, not how well
             it sells: we do not count views or purchases.</p>`
        : isTop
          ? `<p class="panel-note t-body">Every fragrance in the Most Stocked ranking, in the order you chose. Oils
               are not listed here, and each perfume is listed once.</p>`
          : ''
    }
    ${listControls(browseSortControl(state.browseSort), facets(filtered))}
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
  return v.reason === 'delivery-unstated' ? 'Lowest Item Price' : 'Lowest Total';
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
 * The figure compared is the one the row prints (`shownPrice`): the delivered
 * total where the shop states delivery, the item price where it does not.
 * Until 3 Oct 2026 this compared the item price while the row printed the
 * delivered total, so £29.55 + £2.95 delivery against a £30 MSRP read
 * "1% below MSRP" beside £32.50. See demo/msrpComparison.ts.
 */
function msrpFor(row: PresentedOffer, frag: DemoFragrance): MsrpComparison | null {
  if (frag.houseCeiling === null) return null;
  if (row.retailer.singleBrandOnly && !cannotCarryBrand(row.retailer, frag.brand)) return null;
  return msrpComparison(shownPrice(row).amountGbp, frag.houseCeiling);
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
 * ── Kept to two lines (2026-10-01) ─────────────────────────────────────────
 *
 * Owner feedback: the rows were informative but busy, so each one now says
 * only what a shopper needs to choose a shop. Line one is the shop and the
 * price; line two says what the price contains and how it compares:
 *
 *   Perfume Click  CHEAPEST                                   £27.00
 *   Incl. £2.95 delivery · Affiliate link             27% below MSRP
 *
 * What went: the "£X more for free postage" hint (it read as a second,
 * contradictory delivery figure beside the one already included), the bottle
 * price repeated under the total, the "In stock" dot on every buyable row (the
 * section heading already says so; only Low stock / Preorder / unconfirmed
 * stock is still said), star ratings and the New tag. A delivery figure we have
 * not confirmed with the shop is still marked, as "est.", and a price more
 * than a day old still says how old it is, because both change what the number means.
 *
 * Both the MSRP percentage and the RRP saving are worked from the figure this
 * row prints, `totalGbp`, never from a figure it does not (see msrpFor and
 * demo/msrpComparison.ts).
 */
function offerRow(
  row: PresentedOffer,
  isBest: boolean,
  bestTag: string | null = 'Cheapest',
  msrp: MsrpComparison | null = null,
): string {
  // The shop's RRP restated against the figure printed below, so the struck
  // through RRP and the big number beside it can be checked against each
  // other (rrpSavingFor). Null where that figure is not below the RRP.
  const d = msrp ? null : rrpSavingFor(row);
  // Only ever a delivered price where the shop actually states a delivery
  // cost — never the item price wearing a delivered price's clothes.
  const totalGbp = shownPrice(row).amountGbp;
  const facts: string[] = [];
  // A pre-order is not buyable today, so it sits with the sold out rows, but
  // its price is the shop's live pre-order price rather than a last one, so
  // it keeps the delivery and age facts and wears a Preorder tag instead.
  const marks = rowStockMarks(row);
  // Two same size rows of one shop, told apart by the shop's own format words
  // ("Miniature", "Travel Spray"). Said first, because it is what the reader
  // is choosing between. Title Case already, from src/catalogue/offerFormat.ts.
  if (row.formatLabel) facts.push(row.formatLabel);
  if (marks.lastPrice) {
    facts.push('Last price');
  } else {
    if (row.delivery.costGbp === null) {
      // Listed under "Delivery not included", so the heading says the rest.
      facts.push('+ delivery');
    } else {
      // Marked "est." where the figure is not read off the shop's own delivery
      // page (shipping.confidence): about two thirds of live listings.
      const est = row.delivery.confirmed ? '' : 'est. ';
      facts.push(
        row.delivery.costGbp === 0
          ? `${row.delivery.confirmed ? 'Free' : 'Est. free'} delivery`
          : `Incl. ${est}${formatGbp(row.delivery.costGbp)} delivery`,
      );
    }
    if (marks.fact) facts.push(marks.fact);
    // A bottle below the shop's minimum basket cannot be bought on its own.
    const minimum = row.retailer.shipping.minimumOrderGbp;
    if (minimum && row.itemPriceGbp < minimum) facts.push(`${formatGbp(minimum)} minimum order`);
    // Said on the row it applies to: the page caption gives the freshest age.
    // Every row checked more than about a day ago states its own age (owner's
    // decision, 2026-10-03): older offers are in the one list now, and the
    // Cheapest tag can be on one of them, so its age is on the row itself.
    if (rowShowsAge(row)) facts.push(age(row.ageSeconds));
  }
  // The CAP Code asks for an affiliate relationship to be obvious before the
  // click, so a commissioned shop's row says so, and rel="sponsored" tells
  // search engines the same. Decided from the registry, like the disclosure
  // page's own list, so the two can never disagree.
  const commissioned = row.retailer.affiliate.status === 'active';
  if (commissioned) facts.push('Affiliate link');

  return `<li class="offer ${isBest ? 'best' : ''} ${row.isPurchasable ? '' : 'unavail'}">
    <a class="offer-link" href="${esc(row.outboundUrl)}" rel="nofollow noopener${commissioned ? ' sponsored' : ''}" target="_blank">
      <span class="offer-top">
        <span class="shop t-title">${offerMark(row.retailer)}${esc(row.retailer.name)}${
          isBest && bestTag
            ? `<span class="tag ${bestTag === 'Cheapest' ? '' : 'unsure'}">${esc(bestTag)}</span>`
            : marks.tag
              ? `<span class="tag unsure">${esc(marks.tag)}</span>`
              : ''
        }</span>
        <span class="price">${
          // A row with an MSRP comparison never also shows the shop's own RRP:
          // two reference prices on one row is the thing that must not happen.
          d ? `<span class="was">RRP ${formatGbp(d.wasPrice)}</span>` : ''
        }<span class="now t-price ${
          // The saving ink only for a saving; a price above MSRP is not one.
          d || msrp?.direction === 'below' ? 'sale' : ''
        }">${formatGbp(totalGbp)}</span></span>
      </span>
      <span class="offer-bot">
        <span class="facts t-caption">${facts.map((f) => `<span>${esc(f)}</span>`).join('<span class="sep">·</span>')}</span>${
          msrp
            ? `<span class="off anchor${msrp.direction === 'above' ? ' over' : ''}">${msrpComparisonLabel(msrp)}</span>`
            : d
              ? `<span class="off">${rrpSavingLabel(d)}</span>`
              : ''
        }
      </span>${
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

/*
 * The product page's price history slot. The graph itself, and the caption
 * that says honestly what is on it, are drawn by demo/priceHistoryChart.ts
 * (see its header for the owner's 2026-10-03 rules: every product page gets a
 * graph, older prices are plotted rather than listed above today's Cheapest
 * row). This file only gathers the graph's input, because that needs the
 * page's own rows and the generated catalogue.
 *
 * The shared right edge every chart is drawn to (the last day any price was
 * recorded for anything) is PriceHistoryData.span, computed once when the
 * history arrives: see demo/priceHistoryStore.ts, which also explains why the
 * history is fetched on demand rather than before the app starts.
 */

type NotEnoughGap = Extract<PriceHistoryGap, { reason: 'not-enough' }>;

/**
 * One page row as a point on the graph: its bottle price, on the day it was
 * checked. The graph adds that shop's delivery itself (plottedPrice in
 * demo/priceHistoryChart.ts), the same way it does for the recorded line.
 */
function rowObservation(r: PresentedOffer): ChartObservation {
  return { at: r.fetchedAt, priceGbp: r.itemPriceGbp, retailerId: r.retailer.id };
}

/**
 * Everything the graph for one product draws, from three real sources and
 * nothing else:
 *
 *   - the recorded line, merged across this product's id and every id the
 *     catalogue folded into it (HISTORY_ALIASES; see mergeCheapestSeries for
 *     why the merge is exact). Where none of them has a line, the one buyable
 *     reading the history records for any of them (its 'not-enough' entry);
 *     and where the history has not reached this product at all, the
 *     cheapest current price on this page, which the caption then names as
 *     such;
 *   - older prices: the offers too old to list (OLDER_OFFERS, kept out of
 *     every price list by HIDE_OFFER_AFTER_DAYS but still real observations,
 *     drawn hollow on the day they were checked and labelled as older);
 *   - only when neither of those has anything, the page's sold out rows, drawn
 *     grey and labelled sold out, so a product nobody can buy still shows what
 *     it last cost without that being drawn as a price anyone could pay.
 */
function historyChartInput(data: PriceHistoryData, fragranceId: string, isCurrentlyPurchasable: boolean): PriceHistoryChartInput {
  const frag = fragranceById(fragranceId);
  const rows = frag ? rowsFor(frag) : [];
  const ids = [fragranceId, ...(HISTORY_ALIASES[fragranceId] ?? [])];

  const recorded = ids
    .map((id) => data.history[id])
    .filter((s): s is PriceHistoryPoint[] => Array.isArray(s) && s.some((p) => p.priceGbp !== null));
  let line: RawHistoryPoint[] = mergeCheapestSeries(recorded);
  let lineSource: PriceHistoryChartInput['lineSource'] = 'history';
  let carryForward = true;

  if (line.length === 0) {
    const single = ids
      .map((id) => data.gaps[id])
      .filter((g): g is NotEnoughGap => g?.reason === 'not-enough')
      .sort((a, b) => a.at.localeCompare(b.at))
      .at(-1);
    if (single) {
      line = [{ at: single.at, priceGbp: single.priceGbp, retailerId: single.retailerId }];
      // The summary keeps the price, not when it stopped being buyable, so
      // it is drawn as the one point it is and never carried to today.
      carryForward = false;
    }
  }
  if (line.length === 0) {
    // The page's own cheapest current row, in the page's own order: lowest
    // delivered price first, a shop that states no delivery cost after every
    // one that does (as buildComparison ranks them), so the point is the row
    // the page itself leads with, now that the graph plots delivered prices.
    const current = rows
      .filter((r) => r.isPurchasable)
      .sort(
        (a, b) =>
          Number(a.deliveredPriceGbp === null) - Number(b.deliveredPriceGbp === null) ||
          (a.deliveredPriceGbp ?? a.itemPriceGbp) - (b.deliveredPriceGbp ?? b.itemPriceGbp) ||
          a.retailer.id.localeCompare(b.retailer.id),
      )[0];
    if (current) {
      line = [{ at: current.fetchedAt, priceGbp: current.itemPriceGbp, retailerId: current.retailer.id }];
      lineSource = 'page';
    }
  }

  // The recorded line is carried flat on to today only while the shop that set
  // its last price still shows that price on this page. A shop whose offer is
  // now too old to list (HIDE_OFFER_AFTER_DAYS) has stopped confirming it, so
  // the line stops at the last reading instead of claiming the price holds
  // today. Nothing on the graph then presents a price over seven days old as
  // the current one.
  if (lineSource === 'history' && carryForward) {
    const last = [...line].reverse().find((p) => p.priceGbp !== null);
    if (last && !rows.some((r) => r.isPurchasable && r.retailer.id === last.retailerId)) carryForward = false;
  }

  // A product with no current prices carries its own older prices (they are in
  // the lazy file with it, not in the catalogue); every other product's are in
  // OLDER_OFFERS.
  const older: ChartObservation[] = [...(OLDER_OFFERS[fragranceId] ?? []), ...(dormantEntry(fragranceId)?.older ?? [])]
    .filter((o) => o.stock !== 'outOfStock' && o.stock !== 'preOrder' && getRetailer(o.retailerId)?.enabled === true)
    .map((o) => ({ at: o.fetchedAt, priceGbp: o.price, retailerId: o.retailerId }));
  // A pre-order is not a price anyone paid or could pay today: it is no point on
  // the graph, the sold out marker included.
  const soldOut = line.length === 0 && older.length === 0 ? rows.filter((r) => r.stock === 'outOfStock').map(rowObservation) : [];

  return { line, lineSource, carryForward, older, soldOut, siteLastDay: data.span?.last ?? null, isCurrentlyPurchasable, isGiftSet: frag?.giftSet != null };
}

function priceHistoryFor(data: PriceHistoryData, fragranceId: string, isCurrentlyPurchasable: boolean): string {
  return priceHistoryChart(historyChartInput(data, fragranceId, isCurrentlyPurchasable));
}

/**
 * The product page's price history slot. The history is fetched on demand
 * (demo/priceHistoryStore.ts), and usually already in, prefetched while the
 * browser was idle after the first paint. When it is not, the slot holds a
 * quiet placeholder the size of a chart and asks for it; fillPendingHistory
 * swaps the chart in where the placeholder still stands once it arrives, or a
 * one-line note if it could not be fetched. The rest of the page never waits.
 */
function priceHistorySection(fragranceId: string, isCurrentlyPurchasable: boolean): string {
  const data = priceHistory.current();
  if (data) return priceHistoryFor(data, fragranceId, isCurrentlyPurchasable);
  priceHistory.load().then(fillPendingHistory, (err: unknown) => {
    console.warn('PriceSniffs: price history could not be loaded', err);
    fillPendingHistory();
  });
  return priceHistoryLoadingBlock(fragranceId, isCurrentlyPurchasable);
}

/**
 * Same outer box, heading row and chart height as a drawn chart, so the swap
 * moves nothing. The range buttons are there but invisible, purely to hold
 * the heading row at its real height.
 */
function priceHistoryLoadingBlock(fragranceId: string, isCurrentlyPurchasable: boolean): string {
  const ghostScopes = HISTORY_SCOPES.map(
    (scope) => `<span class="history-scope">${esc(scope.label)}</span>`,
  ).join('');
  return `<div class="history-block history-pending" data-history-block data-history-pending="${esc(fragranceId)}" data-history-live="${isCurrentlyPurchasable}" aria-busy="true">
    <div class="history-head">
      <p class="gone-head t-eyebrow">Price History</p>
      <div class="history-scopes history-ghost" aria-hidden="true">${ghostScopes}</div>
    </div>
    <div class="history-chart history-loading">
      <p class="history-loading-text t-caption">Loading price history…</p>
    </div>
    <div class="history-xaxis"></div>
    <p class="history-note t-caption" aria-hidden="true"></p>
  </div>`;
}

/** What the slot says when the history could not be fetched. The next product page asks again. */
function priceHistoryFailedBlock(): string {
  return `<div class="history-block" data-history-block data-history-failed>
    <p class="gone-head t-eyebrow">Price History</p>
    <p class="history-empty t-caption">Price history could not be loaded just now. The prices above are unaffected.</p>
  </div>`;
}

/** Replaces every loading placeholder still on the page with its chart, or the failure note. */
function fillPendingHistory(): void {
  const data = priceHistory.current();
  for (const slot of document.querySelectorAll<HTMLElement>('[data-history-pending]')) {
    const id = slot.getAttribute('data-history-pending') ?? '';
    const live = slot.getAttribute('data-history-live') === 'true';
    slot.outerHTML = data ? priceHistoryFor(data, id, live) : priceHistoryFailedBlock();
  }
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

/** The saved bottle's cheapest price today, so the wishlist doubles as a
 *  price check: the same figure the product page leads with. `sortGbp` is
 *  the delivered price only; an item price with delivery not stated is shown
 *  but sorts last under Cheapest, since it is not the same kind of figure. */
function wishlistPriceFacts(frag: DemoFragrance): { html: string; sortGbp: number | null } {
  const rows = rowsFor(frag);
  const best = bestOffer(rows);
  if (!best) {
    return {
      html: noStockLabel(rows) === 'Preorder Only' ? 'Preorder only, none in stock today' : 'Sold out everywhere today',
      sortGbp: null,
    };
  }
  if (best.deliveredPriceGbp === null) {
    return {
      html: `<strong>${formatGbp(best.itemPriceGbp)}</strong> at ${esc(best.retailer.name)}, delivery not stated`,
      sortGbp: null,
    };
  }
  return {
    html: `<strong>${formatGbp(best.deliveredPriceGbp)}</strong> delivered at ${esc(best.retailer.name)}`,
    sortGbp: best.deliveredPriceGbp,
  };
}

/**
 * What the price has done since the day the fragrance was saved, in words:
 * "Down £4.00 since saved at £60.00". Nothing at all for a row with no saved
 * price. A row with one but no delivered price today still says what it was
 * saved at, which is a fact, and no change, which cannot be worked out.
 */
function wishlistChangeHtml(savedGbp: number | null, changeGbp: number | null): string {
  if (savedGbp === null) return '';
  if (changeGbp === null) {
    return `<span class="shop-row-meta t-caption wishlist-change">Saved at ${formatGbp(savedGbp)}</span>`;
  }
  const text =
    changeGbp < 0
      ? `Down ${formatGbp(-changeGbp)} since saved at ${formatGbp(savedGbp)}`
      : changeGbp > 0
        ? `Up ${formatGbp(changeGbp)} since saved at ${formatGbp(savedGbp)}`
        : `Same price as when saved at ${formatGbp(savedGbp)}`;
  return `<span class="shop-row-meta t-caption wishlist-change${changeGbp < 0 ? ' down' : ''}">${esc(text)}</span>`;
}

/** "Saved 3 Oct 2026", from the row's own added_at. */
function savedOnLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Saved ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** The optional per item target price, shown once price alerts are on. Saved
 *  when the field changes (see the change handler); blank clears it. */
function wishlistTargetHtml(line: WishlistGroup<WishlistEntry>, frag: DemoFragrance): string {
  const value = line.targetPriceGbp === null ? '' : line.targetPriceGbp.toFixed(2);
  return `<label class="wishlist-target t-caption">
      <span>Also email me at or below £</span>
      <input type="text" inputmode="decimal" autocomplete="off" size="7" maxlength="9"
        data-wishlist-target="${esc(line.primary.fragranceId)}" value="${esc(value)}" placeholder="optional"
        aria-label="Target price in pounds for ${esc(frag.brand)} ${esc(frag.name)}" />
    </label>`;
}

/** The opt in for price drop emails, as the browser's own checkbox. Hidden
 *  until the setting has been read, and for good if it cannot be (see
 *  state.priceAlerts). */
function priceAlertsSectionHtml(): string {
  if (state.priceAlerts === null) {
    // Still loading, or the setting does not exist on this deployment yet
    // (migration 0004 not run): never a checkbox that cannot save.
    return `
      <h2 class="t-section">Price Alerts</h2>
      <p class="account-note">${state.priceAlertsLoaded ? 'Price alert emails are not switched on for this site yet.' : 'Loading.'}</p>`;
  }
  return `
    <h2 class="t-section">Price Alerts</h2>
    <label class="control facet-check alerts-check">
      <input type="checkbox" id="price-alerts"${state.priceAlerts ? ' checked' : ''} />
      <span class="facet-check-label">Email me when a saved fragrance gets cheaper</span>
    </label>
    <p class="account-note">One email a morning at most, when a saved fragrance drops by 5% or £2,
      whichever is more, or reaches a target you set. Every email has a link to stop them.</p>
    <p class="account-note">${state.priceAlerts
      ? 'Set a target price for each fragrance on <button type="button" class="link-btn" data-acct-go="wishlist">My Wishlist</button>.'
      : 'Once alerts are on, you can also set a target price for each fragrance on your wishlist.'}</p>`;
}

/**
 * The wishlist page's list. A saved fragrance no longer in the live catalogue
 * (delisted everywhere since it was saved) is skipped rather than rendered as
 * a broken link; the row in the database is untouched, so it reappears if
 * the fragrance ever comes back into stock somewhere.
 *
 * "Change since saved" is shown only where the row recorded the cheapest
 * delivered price on the day it was saved (supabase/migrations/
 * 0005_wishlist_saved_price.sql) and there is a delivered price today. A row
 * without one, saved before that was run or on a day with no delivered price,
 * shows no change, never one worked out from today's price. Biggest Drop is
 * offered only when some row has a change to rank (see wishlistSortsFor).
 */
function wishlistListHtml(): string {
  if (!state.wishlistLoaded) return `<p class="account-note">Loading.</p>`;

  // A line whose id resolves to nothing is a product that no longer exists,
  // and says so with a Remove button. Only once the merge map is in: without
  // it a merged id would look gone, so those lines stay out of sight, as every
  // unlisted one did before, and the note below says how many.
  const mapKnown = dormant.current() !== null;
  const lines = state.wishlistLines.filter((l) => l.id !== null || mapKnown);
  const rows = lines
    .filter((l): l is WishlistGroup<WishlistEntry> & { id: string } => l.id !== null)
    .map((l) => ({ line: l, frag: fragranceById(l.id) }))
    .filter((x): x is { line: WishlistGroup<WishlistEntry> & { id: string }; frag: DemoFragrance } => x.frag != null)
    .map((x) => {
      const price = wishlistPriceFacts(x.frag);
      return {
        ...x,
        price,
        addedAt: x.line.primary.addedAt,
        priceGbp: price.sortGbp,
        changeGbp: changeSinceSaved(x.line.savedPriceGbp, price.sortGbp),
        name: `${x.frag.brand} ${x.frag.name}`,
      };
    });
  const gone = lines.filter((l) => l.id === null);

  if (rows.length === 0 && gone.length === 0) {
    return `<p class="account-note">Nothing saved yet. Tap Save on a fragrance to add it here.</p>`;
  }

  const hasAnyChange = rows.some((r) => r.changeGbp !== null);
  const activeSort = effectiveWishlistSort(state.wishlistSort, hasAnyChange);
  const sorted = sortWishlist(rows, activeSort);
  const wishlistSortControl = sortControl(
    'wishlist-sort', 'Saved Fragrances', ICON_SORT,
    wishlistSortsFor(hasAnyChange).map((s) => ({ value: s.id, label: s.label })),
    activeSort,
  );
  const hiddenCount = state.wishlistLines.length - lines.length;
  const storedIds = (l: WishlistGroup<WishlistEntry>) => l.rows.map((r) => r.fragranceId).join(' ');

  return `
    ${rows.length > 0 ? `<div class="controls">${wishlistSortControl}</div>` : ''}
    <ul class="shop-list wishlist-list">
      ${sorted
        .map(
          ({ line, frag, price, changeGbp }) => `<li class="wishlist-row">
            <button class="shop-row" data-frag="${esc(frag.id)}">
              <span class="wishlist-art">${productArt(frag.photoUrl, 'sm', `${frag.brand} ${frag.name}`, frag.imageTransform)}</span>
              <span class="shop-row-text">
                <span class="shop-row-name t-title">${esc(frag.brand)} ${esc(frag.name)}</span>
                <span class="shop-row-meta t-caption">${esc(frag.concentration)}, ${esc(sizeLabel(frag))}</span>
                <span class="shop-row-meta wishlist-price">${price.html}</span>
                ${wishlistChangeHtml(line.savedPriceGbp, changeGbp)}
                <span class="shop-row-meta t-caption">${esc(savedOnLabel(line.primary.addedAt))}</span>
                ${line.merged ? `<span class="shop-row-meta t-caption wishlist-merged">${line.combined ? 'Saved more than once: those listings have merged into this one.' : 'This listing has merged into another, so your saved fragrance carries on here.'}</span>` : ''}
              </span>
              <span class="shop-row-go" aria-hidden="true">→</span>
            </button>
            <span class="wishlist-side">
              ${shareRowButton(frag)}
              <button class="wishlist-remove" data-wishlist-remove="${esc(storedIds(line))}"
                  aria-label="Remove ${esc(frag.brand)} ${esc(frag.name)} from your wishlist">${ICON_CLOSE}</button>
            </span>
            ${state.priceAlerts === true ? wishlistTargetHtml(line, frag) : ''}
          </li>`,
        )
        .join('')}
      ${gone
        .map((line) => {
          const old = dormantEntry(line.primary.fragranceId);
          const label = old ? `${old.brand} ${old.name}` : 'A saved fragrance';
          return `<li class="wishlist-row wishlist-gone">
            <div class="shop-row">
              <span class="shop-row-text">
                <span class="shop-row-name t-title">${esc(label)}</span>
                <span class="shop-row-meta wishlist-price">No longer listed</span>
                <span class="shop-row-meta t-caption">${esc(savedOnLabel(line.primary.addedAt))}</span>
              </span>
            </div>
            <span class="wishlist-side">
              <button class="wishlist-remove" data-wishlist-remove="${esc(storedIds(line))}"
                  aria-label="Remove ${esc(label)} from your wishlist">${ICON_CLOSE}</button>
            </span>
          </li>`;
        })
        .join('')}
    </ul>
    ${hiddenCount > 0
      ? `<p class="account-note">${hiddenCount === 1 ? 'One saved fragrance is' : `${hiddenCount} saved fragrances are`} not listed by any shop right now, so ${hiddenCount === 1 ? 'it is' : 'they are'} hidden until a shop lists ${hiddenCount === 1 ? 'it' : 'them'} again.</p>`
      : ''}
    ${state.priceAlerts === true
      ? ''
      : `<p class="account-note">Want an email when one of these gets cheaper? Turn on Price Alerts in
          <button type="button" class="link-btn" data-acct-go="notifications">My Notifications</button>.</p>`}`;
}

/** Fetches the signed-in reader's wishlist once verification is confirmed,
 *  and re-renders when it lands — see handleAuthUser in init(). */
function loadPriceAlerts(): void {
  fetchPriceAlerts().then((on) => {
    state.priceAlerts = on;
    state.priceAlertsLoaded = true;
    renderInPlace();
  });
}

/** Shows a photo blob (or none) in the button and on the profile. */
function setPhotoBlob(blob: Blob | null): void {
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photoBlob = blob;
  state.photoUrl = blob ? URL.createObjectURL(blob) : null;
  state.photoBroken = false;
}

/** Bumped whenever the photo is forgotten, so a read still in flight for the
 *  previous reader cannot land on the next one's page. */
let photoGeneration = 0;

/** Forgets the photo, on sign out or when another reader signs in. */
function clearPhoto(): void {
  photoGeneration++;
  setPhotoBlob(null);
  state.photoAvailable = null;
  state.photoPath = null;
  state.photoBusy = false;
}

/** Reads whether photos work here and, if one is stored, fetches it. */
function loadPhoto(): void {
  const gen = photoGeneration;
  void (async () => {
    const p = await fetchPhotoState();
    const blob = p.path ? await downloadPhoto(p.path) : null;
    if (gen !== photoGeneration) return;
    state.photoAvailable = p.available;
    state.photoPath = p.path;
    setPhotoBlob(blob);
    renderInPlace();
  })();
}

/**
 * Works the saved rows out into the lines to show, resolving every id through
 * the merge map (src/services/wishlistResolve.ts) so a saved id that was
 * folded into another product finds its price, its Save heart and its target
 * again. Read side only: the rows and the database keep the ids as saved.
 * `wishlistIds` holds each line's current id (the saved one for a product that
 * no longer exists), so the menu count and the Save button agree with the page.
 */
function refreshWishlistLines(): void {
  const isLive = (id: string) => fragranceById(id) !== undefined;
  state.wishlistLines = groupWishlist(state.wishlistEntries, dormant.current()?.aliases ?? null, isLive);
  state.wishlistIds = new Set(state.wishlistLines.map((l) => l.id ?? l.primary.fragranceId));
}

/** The ids as saved of every row that stands for this product, for removing it. */
function savedIdsFor(productId: string): string[] {
  const line = state.wishlistLines.find((l) => l.id === productId);
  return line ? line.rows.map((r) => r.fragranceId) : [productId];
}

/** Removes each saved row in turn; the first failure is the answer. */
async function removeSavedRows(ids: readonly string[]): Promise<{ ok: boolean; message?: string }> {
  let answer: { ok: boolean; message?: string } = { ok: true };
  for (const id of ids) {
    const result = await removeFromWishlist(id);
    if (!result.ok && answer.ok) answer = result;
  }
  return answer;
}

function loadWishlist(): void {
  fetchWishlist().then(async (entries) => {
    state.wishlistEntries = entries;
    // The merge map rides in the lazy file of pages with no current prices,
    // so it is fetched only when a saved id is not in the catalogue.
    if (entries.some((e) => fragranceById(e.fragranceId) === undefined)) {
      try {
        await dormant.load();
      } catch (err) {
        console.warn('PriceSniffs: the merged addresses could not be loaded', err);
      }
    }
    refreshWishlistLines();
    state.wishlistLoaded = true;
    renderInPlace();
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
    return `<button class="wishlist-toggle" data-go-account>${ICON_HEART}<span>Sign In to Save</span></button>`;
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
 * "Excl. delivery" (owner, 2026-10-03): the brand's price is its item price,
 * while the offer rows and the Cheapest box show delivered totals, so the
 * box says what it leaves out.
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
      <p class="price-box-from price-box-from--fit t-caption">Excl. delivery</p>
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
      // Only an RRP some row actually prints as a saving: a box stating a
      // shop's RRP that no row below it can show would be stricter on the row
      // than on the box, the opposite of this function's own rule.
      wasPriceGbp: rrpSavingFor(row)?.wasPrice ?? null,
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
        <p class="price-box-label t-eyebrow">Lowest Item Price</p>
        <p class="price-box-amount t-price t-price--hero">${formatGbp(best.itemPriceGbp)}</p>
        <p class="price-box-from t-caption">from ${esc(best.retailer.name)}. Delivery not stated, so this is not a delivered price</p>
      </div>`;
  }
  return `<div class="price-box price-box--best">
      <p class="price-box-label t-eyebrow">${verdict.decided ? 'Cheapest Price' : 'Lowest Total Price'}</p>
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
  if (!best) {
    return `<p class="hero-price none">${
      noStockLabel(rows) === 'Preorder Only' ? 'Preorder only, none in stock' : 'Sold out everywhere'
    }</p>`;
  }
  return `<div class="price-boxes">${referenceBox(frag, rows)}${lowestPriceBox(best, verdict)}</div>`;
}

// offerGroups (offers with delivery, "Delivery not included", sold out) lives
// in demo/offerGroups.ts, where tests/offerGroups.test.ts holds it to the
// owner's rule that no cheaper row ever sits above the Cheapest row.

/**
 * A product with no current prices, as the page helpers expect a fragrance to
 * look. Only what its header needs: it has no notes, no house price and no
 * offers, and it is in no list, so nothing reads the rest.
 */
function dormantFragrance(id: string, d: DormantEntry): DemoFragrance {
  return {
    id,
    slug: d.slug,
    brand: d.brand,
    name: d.name,
    concentration: d.concentration,
    sizeMl: d.sizeMl,
    ean: d.ean,
    tier: brandTierFor(d.brand),
    popularity: 0,
    photoUrl: d.image,
    imageTransform: d.imageTransform ?? null,
    notes: null,
    houseCeiling: null,
    giftSet: d.giftSet ?? null,
    oil: null,
    // In no list, so the Gender filter never asks.
    gender: null,
  };
}

/**
 * The page for a product whose last price any shop confirmed is older than the
 * hide window and that no live product matches (src/catalogue/dormantProducts.ts).
 *
 * It says so in two places and no more: the Title Case state where the price
 * boxes would be, and one sentence beside the graph. The graph is the page's
 * content: what the shops last confirmed, drawn as older prices and never as a
 * price anyone can pay now. There is no price box, no offer rows, no Cheapest,
 * no save button (the wishlist lists only what is in the catalogue), and the
 * brand is a link only where the brand has a page of its own.
 *
 * The data is a lazy file fetched when this address is opened, so for a moment
 * after a direct link it is a plain "Loading", and then either this page or
 * Page Not Found, whichever the file settles (settleDormantRoute).
 */
function dormantDetailView(): string {
  const id = state.fragranceId;
  const entry = dormantEntry(id);
  if (!entry) {
    // Not here, or not fetched yet. A failed fetch is a miss like any other.
    if (dormant.status() === 'failed') return notFoundView();
    settleDormantRoute();
    return `<p class="panel-note t-body" aria-busy="true">Loading.</p>`;
  }
  const frag = dormantFragrance(id, entry);
  const brand = BRANDS.includes(frag.brand)
    ? brandButton(frag.brand)
    : `<span class="phead-brand t-eyebrow" title="${esc(frag.brand)}">${esc(frag.brand)}</span>`;
  return `
    <button class="back" data-back>Back</button>

    <div class="detail-grid">
      <div class="hero">
        <div class="hero-art">${productArt(frag.photoUrl, 'lg', `${frag.brand} ${frag.name}`, frag.imageTransform)}</div>
        ${brand}
        ${productHead(frag, 'div', 't-page')}
        ${giftSetBlock(frag)}
        ${fragranceLinksBlock(frag)}
        <div class="hero-actions">${sharePageButton(frag)}</div>
        <p class="hero-price none">No Current Prices</p>
      </div>

      <div class="detail-offers">
        <p class="panel-note t-body">No shop we check has confirmed a price for this in the last ${HIDE_OFFER_AFTER_DAYS} days, so none is shown, and the graph below keeps the prices we recorded.</p>
        ${priceHistorySection(id, false)}
      </div>
    </div>`;
}

/**
 * Where an address that is neither in the catalogue nor a page with no current
 * prices lands: the product that absorbed it in a merge, when that product is
 * a page, otherwise null (src/catalogue/idAliases.ts). Reads the same lazy file
 * as the pages with no current prices, so it answers only once that is loaded.
 */
function absorbedLanding(id: string): string | null {
  const isLive = (other: string) => fragranceById(other) !== undefined;
  // A product address (/BRAND_NAME_VOLUME) that is not in the catalogue waits
  // for the same file: it may be a page with no current prices, or the address
  // of a product a merge folded into another (SLUG_ALIASES).
  if (id.startsWith(SLUG_PENDING)) return idForSlug(dormant.current(), id.slice(SLUG_PENDING.length), isLive);
  return movedTo(dormant.current(), id, isLive);
}

/**
 * What state.fragranceId holds, followed by the slug, while a product address
 * that is not in the catalogue waits for the file of pages with no current
 * prices to say what it is. Never a real id (ids have no colon), so it can
 * only ever be settled or be Page Not Found, and currentRoute() turns it back
 * into the same address so the address bar is not rewritten meanwhile.
 */
const SLUG_PENDING = 'slug:';

/**
 * The slug of a product page, for the router's routeToPath: what the catalogue
 * says, or what the file of pages with no current prices says once it is in.
 * Registered below, before the first render.
 */
function slugOfProduct(id: string): string | null {
  return fragranceById(id)?.slug ?? dormantEntry(id)?.slug ?? null;
}

/**
 * Settles a direct link to a fragrance that is not in the catalogue, once the
 * file of products with no current prices has arrived: the page for it where it
 * is one of them, Page Not Found where it is not. Does nothing if the reader
 * has moved on in the meantime.
 */
function settleDormantRoute(): void {
  const id = state.fragranceId;
  const settle = () => {
    if (state.view !== 'detail' || state.fragranceId !== id || fragranceById(id)) return;
    if (!dormantEntry(id)) {
      // A product a merge folded into another opens the one that holds it,
      // and the address bar follows (replace, not push: the old address is
      // not a place Back should return to).
      const to = absorbedLanding(id);
      if (to !== null) {
        state.fragranceId = to;
        render();
        syncUrl('replace');
        return;
      }
      state.notFoundPath = window.location.pathname;
      state.view = 'notFound';
    }
    render();
  };
  dormant.load().then(settle, (err: unknown) => {
    console.warn('PriceSniffs: products with no current prices could not be loaded', err);
    settle();
  });
}

function detailView(): string {
  const frag = fragranceById(state.fragranceId);
  if (!frag) return dormantDetailView();

  const rows = rowsFor(frag);
  const best = bestOffer(rows);
  // Whether this page is entitled to the word "cheapest" at all — see
  // src/services/deliveryConfidence.ts. The ordering is untouched either way;
  // what this decides is the wording placed on top of it.
  const verdict = cheapestVerdict(rows);
  const bestTag = cheapestTag(verdict);
  const groups = offerGroups(rows);
  const { delivered, plusDelivery, gone, preOrder } = groups;
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
  // Only shops the site actually has prices from: "not available at Boots"
  // would imply Boots was checked, and a shop with no prices here was not.
  const unavailable = missing.filter(
    (r) => !cannotCarryBrand(r, frag.brand) && r.enabled && listingCountAt(r.id) > 0,
  );

  return `
    <button class="back" data-back>Back</button>

    <div class="detail-grid">
      <div class="hero">
        <div class="hero-art">${productArt(frag.photoUrl, 'lg', `${frag.brand} ${frag.name}`, frag.imageTransform)}</div>
        ${brandButton(frag.brand)}
        ${productHead(frag, 'div', 't-page')}
        ${giftSetBlock(frag)}
        ${fragranceLinksBlock(frag)}
        <div class="hero-actions">${wishlistButton(frag.id)}${sharePageButton(frag)}</div>
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
            // available at (nothing buyable — see priceBoxRow's own note
            // on that state, and cheapestVerdict for the rest of the
            // reasoning). The <p> stays in the document either way, empty
            // rather than removed, so `.results-head`'s space-between still
            // has two children and the caption on the right does not drift
            // left into the gap the heading used to fill — see .results-head
            // in the stylesheet for the narrow-width version of this row.
            // Every listed buyable row counts, whatever its age (owner's
            // decision, 2026-10-03; see availabilityHeading).
            esc(availabilityHeading(groups))
          }</p>
          <span class="dim t-caption">${
            // The one fact no row carries: how current the page is. Each row
            // says what its own price contains; age() handles its own units.
            `Updated ${esc(age(newest))}`
          }</span>
        </div>

        ${
          delivered.length
            ? `<ul class="offers">${delivered.map((r) => offerRow(r, r === best, bestTag, mayNameMsrp ? msrpFor(r, frag) : null)).join('')}</ul>`
            : ''
        }

        ${
          plusDelivery.length
            ? `<p class="gone-head t-eyebrow">Delivery Not Included</p>
               <ul class="offers">${plusDelivery.map((r) => offerRow(r, r === best, bestTag, mayNameMsrp ? msrpFor(r, frag) : null)).join('')}</ul>`
            : ''
        }

        ${
          gone.length
            ? `<p class="gone-head t-eyebrow">Sold Out</p>
               <ul class="offers">${gone.map((r) => offerRow(r, false, 'Cheapest', mayNameMsrp ? msrpFor(r, frag) : null)).join('')}</ul>`
            : ''
        }

        ${
          // Under the sold out rows, in the same style: the shop sells the
          // bottle but is not shipping it yet. Never tagged Cheapest, never
          // in the heading's count (see offerGroups).
          preOrder.length
            ? `<p class="gone-head t-eyebrow">Preorder</p>
               <ul class="offers">${preOrder.map((r) => offerRow(r, false, 'Cheapest', mayNameMsrp ? msrpFor(r, frag) : null)).join('')}</ul>`
            : ''
        }

        ${
          // One quiet link under the whole list rather than one per row: a
          // report is rare, and a control on every row would be furniture on
          // the busiest part of the page. Opens wrongPriceDialog.
          rows.length
            ? `<p class="report-wrong t-caption"><button type="button" class="link-btn" data-report-price aria-haspopup="dialog">Spotted a Wrong Price? Tell Us</button></p>`
            : ''
        }

        ${priceHistorySection(frag.id, best !== null)}

        ${
          unavailable.length
            ? `<p class="gone-head t-eyebrow">Not Available</p>
               ${unavailableShopsLine(unavailable)}`
            : ''
        }

        ${
          // The page's one ad, when ads are on: under the whole price list
          // and every section that follows it, never above the prices or the
          // price boxes. '' with ads off. See demo/ads.ts.
          adSlotHtml('product')
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
    ${sortControl('brand-sort', 'Brands', ICON_SORT, BRAND_SORT_OPTIONS, state.brandSort)}
    ${control('brand-filter', 'Filter brands', ICON_FILTER, [
      { value: 'all', label: 'All Types' },
      ...(['designer', 'niche', 'mideast'] as const).map((t) => ({ value: t, label: TIER_LABEL[t] })),
    ], state.brandFilter)}
  </div>`;

  if (list.length === 0) {
    return `<div class="page-head"><h1 class="t-page">Brands</h1><span class="count t-count">0</span></div>
    ${controls}<p class="empty-note t-body">No brands match that filter yet.</p>`;
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
  // A heading of its own, like Shops and Results: the tab bar names the
  // view but a tab is not a heading (axe page-has-heading-one, 2026-09-06).
  return `<div class="page-head"><h1 class="t-page">Brands</h1><span class="count t-count">${list.length}</span></div>
  ${controls}<ul class="brand-list">${out}</ul>`;
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
  return `<div class="page-head"><h1 class="t-page">Deals</h1></div>${dealsPanel()}`;
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
  // One deal per scent, the best of its sizes (owner's decision, 2026-10-03;
  // see bestDealPerScent in demo/oneScent.ts), chosen before the sort below
  // so the reader's sort order cannot change which size is shown.
  const withPhoto = bestDealPerScent(DEALS.filter((d) => d.fragrance.photoUrl !== null));
  const sorted = [...withPhoto].sort((a, b) => {
    if (state.dealSort === 'lowest') return a.price - b.price;
    if (state.dealSort === 'highest') return b.price - a.price;
    return b.percentOff - a.percentOff;
  });
  // Facets are computed and applied against the fragrance each deal is on,
  // not the deal record itself — same groups, same counts, as everywhere
  // else a fragrance list appears.
  const filtered = sorted.filter((d) => passesFacets(d.fragrance, null));

  const controls = listControls(
    sortControl('deal-sort', 'Deals', ICON_RANK, DEAL_SORT_OPTIONS, state.dealSort),
    facets(sorted.map((d) => d.fragrance)),
  );

  if (DEALS.length === 0) {
    return `${controls}<p class="empty-note t-body">No shop is publishing a reference price right now.</p>`;
  }
  if (sorted.length === 0) {
    return `${controls}<p class="empty-note t-body">No discounted fragrance has a photo we may show right now.</p>`;
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
  const eager = gridEagerCount();
  const dealTile = (d: (typeof sorted)[number], i?: number) =>
    fragranceTile(d.fragrance, {
      eager: i !== undefined && i < eager,
      soldBy: RETAILERS.find((r) => r.id === d.retailerId)?.name,
      trailing:
        // `d.price` is the figure the product page's row prints for this
        // offer (delivered total, or item price where delivery is not
        // stated), and the percentage is worked from it — see
        // demo/msrpComparison.ts. An item price says so, as priceLine does.
        (d.kind === 'house'
          ? `<span class="off anchor">${d.percentOff}% Below ${esc(d.houseName!)}</span>
        <span class="amt">${formatGbp(d.price)}</span>
        <span class="was anchor">${formatGbp(d.wasPrice)} at ${esc(d.houseName!)}</span>`
          : `<span class="off">${d.percentOff}% Off</span>
        <span class="amt">${formatGbp(d.price)}</span>
        <span class="was">RRP ${formatGbp(d.wasPrice)}</span>`) +
        (d.delivered ? '' : `<span class="amt-note">Delivery Not Stated</span>`),
    });

  return `${controls}
    <p class="panel-note t-body">Savings are against the shop's own published recommended retail price. Where the maker also sells the fragrance here, they are against the maker's own price. Prices include delivery where the shop states it. Each perfume shows its best deal across its sizes.</p>
    <ul class="tile-grid">${chunked(withGridAds(filtered, dealTile), (item, i) => item(i))}</ul>`;
}

/* ── explore: retailers ──────────────────────────────────────────────────── */

/**
 * Deterministic hue (0-359) from a name, so the same shop or brand always
 * tints the same way and different ones are visually distinct at a glance.
 * Not a lookup of that brand's real colour: the monogram tint is deliberately
 * never the brand's own palette, whether or not this shop or brand also has a
 * real logo shown elsewhere on its page (docs/LOGOS-PLAN.md §2c) — the two
 * are unrelated questions, and this hue answers only the first. A plain
 * djb2-style hash: no cryptographic property needed, only that it is stable
 * and spreads names across the wheel rather than clustering them.
 */
function monogramHue(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Up to two initials from a name, the same reduction both `monogram` and
 *  `orgMark`'s CSS-drawn fallback use. */
function initialsOf(name: string): string {
  return name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Initials, drawn as a monogram. Deliberately not a copy of the shop's logo. */
function monogram(name: string): string {
  const initials = initialsOf(name);
  return `<span class="monogram" style="--mh:${monogramHue(name)}" aria-hidden="true">${esc(initials || '?')}</span>`;
}

/**
 * The square mark a shop can show in a square slot: its `logo` when that is
 * square, else the `squareLogo` recorded beside a wordmark, else null (the
 * initials tile). A wide wordmark is never squeezed into a square box.
 */
function squareLogoOf(r: Pick<Retailer, 'logo' | 'squareLogo'>): LogoRef | null {
  if (r.logo?.shape === 'square') return r.logo;
  if (r.squareLogo?.shape === 'square') return r.squareLogo;
  return null;
}

/** Turns a failed offer row logo into the initials tile, in place: the
 *  inline style keeps `--mh`, `data-fallback` carries the initials. */
const OFFER_MARK_ONERROR =
  "var m=this.parentElement;m.className='offer-mark offer-mark--initials';m.textContent=m.dataset.fallback";

/**
 * The 20px shop mark beside a shop's name in a product's price list. Every
 * row gets one, the same size and shape (the owner, 2026-10-03: "I hate the
 * fact that on a perfume listing some retailers have logos and some don't").
 * A shop with a square logo shows it on its tile; any other shop gets an
 * initials tile in the same slot, tinted by `monogramHue` with the monogram
 * tokens, which are contrast tested at every hue in both themes. If a logo
 * fails to load, onerror swaps the tile to those same initials rather than
 * removing it, so the slot is never empty and the row never shifts.
 */
function offerMark(r: Pick<Retailer, 'name' | 'logo' | 'squareLogo'>): string {
  const logo = squareLogoOf(r);
  const hue = monogramHue(r.name);
  const initials = esc(initialsOf(r.name) || '?');
  if (!logo) {
    return `<span class="offer-mark offer-mark--initials" style="--mh:${hue}" aria-hidden="true">${initials}</span>`;
  }
  return `<span class="org-mark offer-mark ${orgMarkInkClass(logo.ink)}" style="--mh:${hue}" data-fallback="${initials}" aria-hidden="true"><img src="${esc(logo.src)}" alt="" width="20" height="20" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="${OFFER_MARK_ONERROR}" /></span>`;
}

/**
 * The tile CSS class for a `LogoRef.ink` — see docs/LOGOS-PLAN.md §4c. Dark
 * ink needs a light tile to read against; light ink needs a dark one; an
 * opaque mark carrying its own background needs no fill at all, only a
 * boundary so the tile still reads as a tile.
 */
function orgMarkInkClass(ink: LogoRef['ink']): string {
  return ink === 'dark' ? 'org-mark--light' : ink === 'light' ? 'org-mark--dark' : 'org-mark--own';
}

/**
 * The logo in place of the monogram, when one is on file and fits the slot —
 * docs/LOGOS-PLAN.md §3/§4c/§4d. Render order is monogram-unless-logo: with
 * no `LogoRef`, or a `shape: 'wordmark'` asset offered to the directory row
 * (`hero: false`, which only ever takes a square asset), this returns exactly
 * `monogram(name)` and nothing about the logo path runs at all.
 *
 * The `<img>` carries the same `onerror` `productArt` has carried since
 * photography went hot-linked (demo/photo.ts) — remove the image, mark the
 * container, let CSS draw the monogram. What makes that last part possible
 * without a second, hidden copy of the monogram in the DOM (the exact
 * duplication `productArt`'s own comment rejects for photos) is that the
 * initials and hue this shop or brand would draw are cheap to compute and are
 * placed on the container from the start, as a `data-fallback` attribute and
 * the same `--mh` custom property `monogram()` itself sets: `.org-mark-failed`
 * in demo/template.html paints the background from `--mh` and the monogram
 * tokens, and a `::after` reads `content: attr(data-fallback)`. Nothing is
 * rendered from that data unless the image actually fails.
 */
function orgMark(name: string, logo: LogoRef | null | undefined, hero = false): string {
  if (!logo || (logo.shape === 'wordmark' && !hero)) return monogram(name);
  const shapeClass = logo.shape === 'wordmark' ? 'org-mark--wordmark' : 'org-mark--square';
  const inkClass = orgMarkInkClass(logo.ink);
  return `<span class="org-mark ${shapeClass} ${inkClass}" style="--mh:${monogramHue(name)}"
      data-fallback="${esc(initialsOf(name) || '?')}">
    <img src="${esc(logo.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
      onerror="this.closest('.org-mark').classList.add('org-mark-failed');this.remove()" />
  </span>`;
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
  // Only shops with prices on the site (the owner's call, 2026-10-03): a shop
  // with nothing to show, such as one that blocks us or one waiting on its
  // first harvest, is hidden until it has something.
  const shops = [...RETAILERS]
    .filter((r) => !r.singleBrandOnly && r.enabled && listingCountAt(r.id) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  // The one view that rendered a bare list with no heading of its own —
  // the tab bar named it, but a tab is not a heading, and the page had no
  // h1 (axe page-has-heading-one, 2026-09-06). Same head as Results.
  return `<div class="page-head"><h1 class="t-page">Shops</h1><span class="count t-count">${shops.length}</span></div>
  <ul class="shop-list">
    ${shops
      .map((r) => {
        return `<li>
          <button class="shop-row" data-retailer="${esc(r.id)}">
            ${orgMark(r.name, squareLogoOf(r))}
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
 * A shop's Trustpilot block: a plain link to the shop's own review page, and
 * nothing else unless a Trustpilot business id is also on file.
 * `trustpilotStateFor` (demo/trustpilotWidget.ts) decides what shows. A shop
 * without a verified review page shows nothing at all, not a placeholder.
 * No score, star rating or review count is copied; the reader goes to
 * Trustpilot for those.
 *
 * Where a business id is also on file, a button offers Trustpilot's own
 * "TrustBox" rating widget (Micro Star template), and that is the one thing
 * here that loads from Trustpilot's servers.
 */
function trustpilotWidget(r: Retailer): string {
  const state = trustpilotStateFor(r);
  if (state.kind === 'none') return '';
  const link = trustpilotLinkMarkup(state, ICON_EXTERNAL);
  if (state.kind === 'link') return `<div class="trustpilot-block">${link}</div>`;
  // Nothing is fetched from Trustpilot until the reader asks for it. Their
  // bootstrap script is the one third-party script this site can load, and
  // loading it on page view would store and send things on Trustpilot's
  // behalf before anyone had agreed to anything: the exact case PECR
  // regulation 6 requires consent for. A button that says what it will do,
  // and does it only when pressed, is that consent, given where it is
  // needed and withheld by simply not pressing it. The plain link to the
  // review page is there regardless, so the fact is never hidden behind the
  // widget. See the cookies page.
  return `<div class="trustpilot-block trustpilot-consent">
    ${link}
    <button type="button" class="link-btn tp-show"
            data-tp-show="${esc(state.businessId)}" data-tp-review="${esc(state.reviewUrl)}"
            data-tp-shop="${esc(r.name)}"
            aria-describedby="tp-consent-note">Show ${esc(r.name)}'s Trustpilot Rating</button>
    <span id="tp-consent-note" class="t-caption dimmer">Loads Trustpilot's widget from their servers, under their privacy policy.</span>
  </div>`;
}

/** The TrustBox itself, rendered only after showTrustpilot() has been asked to. */
function trustpilotWidgetMarkup(businessId: string, reviewUrl: string, theme: 'light' | 'dark', shopName: string): string {
  return `<div
      class="trustpilot-widget"
      data-trustpilot-widget
      data-locale="en-GB"
      data-template-id="5419b6ffb0d04a076446a9af"
      data-businessunit-id="${esc(businessId)}"
      data-style-height="24px"
      data-style-width="100%"
      data-theme="${theme}"
    >
      <a href="${esc(reviewUrl)}" target="_blank" rel="noopener" aria-label="${esc(`${TRUSTPILOT_LINK_TEXT} for ${shopName}, opens in a new tab`)}">${TRUSTPILOT_LINK_TEXT}</a>
    </div>`;
}

/** The palette the page is actually showing, so the widget is drawn to match rather than always dark. */
function currentTheme(): 'light' | 'dark' {
  const root = document.documentElement;
  const host = root.getAttribute('data-theme');
  if (host === 'light' || host === 'dark') return host;
  const mode = root.getAttribute('data-mode');
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Swaps the consent button for the live widget, then mounts it. */
function showTrustpilot(button: HTMLElement): void {
  const businessId = button.getAttribute('data-tp-show') ?? '';
  const reviewUrl = button.getAttribute('data-tp-review') ?? '';
  const block = button.closest<HTMLElement>('.trustpilot-block');
  if (!block || !businessId) return;
  block.classList.remove('trustpilot-consent');
  block.innerHTML = trustpilotWidgetMarkup(businessId, reviewUrl, currentTheme(), button.getAttribute('data-tp-shop') ?? '');
  mountTrustpilotWidgets();
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
  // A switched off shop has no page (see the 'retailer' route): the Shops
  // list is where a stale shop id lands.
  if (!r || !r.enabled) return exploreView();
  const filtered = fragrancesAt(r.id);
  const list = sortFragrances(applyFacets(filtered), state.retailerDetailSort)
    .filter((f) => !state.retailerInStockOnly || inStockAt(f, r.id));

  const controls = listControls(
    listSortControl('retailer-detail-sort', state.retailerDetailSort),
    facets(filtered, {
      inStockHere: { checked: state.retailerInStockOnly, narrows: filtered.some((f) => !inStockAt(f, r.id)) },
    }),
  );

  // A shop none of whose prices is recent enough to show (one that blocks us,
  // for instance) is not in the Shops list or the sitemap, but its address can
  // still be opened from an old link. It says so in a sentence instead of
  // printing "0 Fragrances Here" over a sort control and a filter that
  // cannot match anything.
  const noCurrentPrices = filtered.length === 0;

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="org-hero">
      ${orgMark(r.name, r.logo, true)}
      <div class="org-hero-text">
        <h1 class="org-hero-name t-page">${esc(r.name)} <span class="org-hero-count t-count">${retailerCountMark(r.id)}</span></h1>
        <p class="org-hero-domain t-caption">${esc(r.domain)}</p>
        ${r.blurb ? `<p class="org-hero-blurb t-body">${esc(r.blurb)}</p>` : ''}
        <ul class="fact-list">
          ${deliveryLines(r).map((l) => `<li>${esc(l)}</li>`).join('')}
        </ul>
        ${trustpilotWidget(r)}
      </div>
    </div>

    ${
      noCurrentPrices
        ? `<p class="empty-note t-body">We have no prices from ${esc(r.name)} checked in the last ${HIDE_OFFER_AFTER_DAYS} days, so none are shown.</p>`
        : `<p class="gone-head t-eyebrow">${list.length} ${list.length === 1 ? 'Fragrance' : 'Fragrances'} Here</p>
    ${controls}
    ${fragranceList(list, 'Nothing from this shop matches that filter.')}`
    }`;
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
  // Switched off shops are left out: a house's own shop that is off the site
  // gets no sentence here, so nothing on the page says it is checked or
  // compared.
  const ownShop = RETAILERS.find((r) => r.enabled && r.singleBrandOnly && !cannotCarryBrand(r, b));

  // Sort and facets, no tier filter: every fragrance from one brand shares
  // that brand's tier (brandTierFor is a function of the brand name alone),
  // so a tier filter here would only ever show everything or nothing — the
  // Type facet group already knows this and hides itself for exactly that
  // reason (an option only appears when at least two values exist).
  const controls = listControls(listSortControl('brand-detail-sort', state.brandDetailSort), facets(filtered));

  return `
    <button class="back" data-back-explore>Back</button>
    <div class="org-hero">
      ${orgMark(b, logoFor(b), true)}
      <div class="org-hero-text">
        <h1 class="org-hero-name t-page">${esc(b)}</h1>
        ${
          site
            ? `<a class="brand-site-link" href="${esc(site.url)}" target="_blank" rel="noopener nofollow">
                 <span class="control-ico">${ICON_EXTERNAL}</span>
                 <span>Open Brand Website</span>
                 <span class="brand-site-flag ${site.uk ? 'is-uk' : 'is-nonuk'}">${site.uk ? 'UK Site' : 'Overseas Site'}</span>
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
        ? `<p class="gone-head t-eyebrow">${list.length} ${list.length === 1 ? 'Fragrance' : 'Fragrances'}</p>
           ${controls}
           ${fragranceList(list, 'We have no listings from this brand yet.')}`
        : houseItems.length === 0
          ? fragranceList(list, 'We have no listings from this brand yet.')
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
  const list = sortNotes(filtered, state.noteSort);

  const controls = `<div class="controls">
    ${sortControl('note-sort', 'Notes', ICON_SORT, NOTE_SORT_OPTIONS, state.noteSort)}
    ${control('note-layer', 'Filter notes', ICON_FILTER, [
      { value: 'any', label: 'Any Layer' },
      { value: 'top', label: 'Top Notes' },
      { value: 'middle', label: 'Middle Notes' },
      { value: 'base', label: 'Base Notes' },
    ], state.noteLayer)}
  </div>`;

  // The three layers the sourced note data genuinely carries (top, middle,
  // base), rather than a scent family taxonomy (floral, woody, gourmand...)
  // this dataset has no real source for, drawn as the same chips a note's own
  // page uses for its layers. Tapping one filters the list below exactly like
  // the dropdown above does; tapping the active one again clears it. "All" is
  // the same clear, offered as its own chip rather than only reachable by
  // deselecting: the combined view every note actually starts on. No heading
  // sits over them, because each chip says what it is.
  const layerChip = (id: NoteLayerFilter, label: string) => {
    const count = id === 'any' ? NOTE_INDEX.length : NOTE_INDEX.filter((n) => n.layers.has(id)).length;
    const on = state.noteLayer === id;
    return `<button class="note-chip${on ? ' on' : ''}" data-note-layer="${id}" aria-pressed="${on}">${label} Notes &middot; ${count}</button>`;
  };
  const chips = `<div class="note-chips note-chips-layers" role="group" aria-label="Note layers">
    ${layerChip('any', 'All')}
    ${layerChip('top', 'Top')}
    ${layerChip('middle', 'Middle')}
    ${layerChip('base', 'Base')}
  </div>`;

  if (list.length === 0) {
    return `<div class="page-head"><h1 class="t-page">Notes</h1><span class="count t-count">0</span></div>
    ${controls}${chips}<p class="empty-note t-body">No notes recorded for that layer yet.</p>`;
  }

  // The same row-list shape as Brands, including the alphabetical dividers,
  // but only under the two alphabetical sorts. Under "most used" the list is
  // ranked by count, not by letter, so a divider between two counts would land
  // on whichever letter their names happen to start with and break up entries
  // that belong together in the ranking. The scrubber is stricter still: its
  // letters run A down to Z, so it only matches a list that runs the same way.
  // Under Z to A the list runs the other way and the strip is left out.
  const alphabetical = state.noteSort === 'az' || state.noteSort === 'za';
  let out = '';
  let current = '';
  const seenLetters = new Set<string>();
  for (const n of list) {
    if (alphabetical) {
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

  return `<div class="page-head"><h1 class="t-page">Notes</h1><span class="count t-count">${list.length}</span></div>
    ${controls}
    ${chips}
    <p class="panel-note t-body">Only notes a shop has explicitly published. ${DEMO_FRAGRANCES.filter((f) => f.notes).length} of ${DEMO_FRAGRANCES.length} fragrances list them.</p>
    <div class="notes-browse">
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
  const filtered = fragrancesWithNote(state.noteName, state.noteLayer);
  const list = sortFragrances(applyFacets(filtered), state.noteDetailSort);

  const controls = listControls(listSortControl('note-detail-sort', state.noteDetailSort), facets(filtered));

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
    <div class="page-head"><h1 class="t-page">${esc(titleCase(state.noteName))}</h1><span class="count t-count">${list.length}</span></div>
    ${layerChips ? `<p class="note-chips note-chips-profile">${layerChips}</p>` : ''}
    <p class="panel-note t-body">Fragrances listing ${esc(titleCase(state.noteName))}${state.noteLayer === 'any' ? '' : ` as a ${state.noteLayer} note`}.</p>
    ${controls}
    ${fragranceList(list, 'Nothing matches that filter.')}`;
}

/* ── explore shell ───────────────────────────────────────────────────────── */

const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'brands', label: 'Brands' },
  { id: 'retailers', label: 'Retailers' },
  { id: 'notes', label: 'Notes' },
  { id: 'oils', label: 'Oils' },
  { id: 'sets', label: 'Sets' },
];

/**
 * What each Explore tab draws. TABS above says which tabs there are and in
 * what order; this says what is under each. A tab is one line in each, so
 * adding one (Oils and Sets came after Notes, see
 * docs/GIFT-SETS-AND-OILS-PLAN.md) leaves the shell alone.
 */
const EXPLORE_PANELS: Record<ExploreTab, () => string> = {
  brands: brandsPanel,
  retailers: retailersPanel,
  notes: notesPanel,
  oils: () => tabs.panel('oils'),
  sets: () => tabs.panel('sets'),
};

function exploreView(): string {
  return `<div class="explore">${EXPLORE_PANELS[state.tab]()}</div>`;
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
           exactly rather than approximately.

           Sized from the house's own Shopify image service the same way
           productArt's photos are (photoSrcAttrs in demo/photo.ts), and
           retries the stored URL once before giving up. */
        p.image
          ? `<img class="house-img"${photoSrcAttrs(p.image, HOUSE_IMG_SIZES)} alt="" width="240" height="240"
               loading="lazy" decoding="async" referrerpolicy="no-referrer"
               onerror="${RETRY_ORIGINAL}const s=document.createElement('span');s.className='house-img house-img-none';s.setAttribute('aria-hidden','true');this.replaceWith(s)" />`
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

const CONTACT_TYPES = ['An Issue', 'A Suggestion', 'A Promotional Enquiry', 'Something Else'] as const;

/**
 * Preferences only (owner's account revamp, 2026-10-04): Theme and Layout.
 * The account entry row went to the account menu at the top right of the
 * bar, and Contact Us and the Legal links went to the About page, which is
 * where a reader looking for who runs the site and on what terms looks.
 */
function settingsView(): string {
  return `
    <button class="back" data-back>Back</button>
    <article class="doc settings-doc">
      <h1 class="t-page">Settings</h1>

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

      <p class="settings-note t-caption">Your choice is saved on this device.</p>
    </article>`;
}

/**
 * What Send does, said once. Microcopy cull, 2026-08-25
 * (docs/MICROCOPY-INVENTORY-2026-08-21.md row 5): the note opens with the
 * fact a reader cannot see from the form, that Send hands the message to
 * their own email app rather than posting it anywhere.
 */
const SUGGEST_NOTE =
  'Send opens your own email app with your message ready to go. Nothing goes to a server of ours.';

/**
 * Suggestions, the page behind the account menu's item of that name (owner
 * request, 2026-10-04; it was "Got an Idea?" on the home page). A page of its
 * own like Settings, reached by its address and from the menu in every account
 * state, because anyone can suggest. The form is the one the home page had:
 * Send opens the reader's own email app (the suggest-form branch of the submit
 * handler) and nothing is sent to a server.
 */
function suggestionsView(): string {
  return `
    <button class="back" data-back>Back</button>
    <article class="doc suggest-doc">
      <h1 class="t-page">Suggestions</h1>
      <p class="panel-note t-body">${SUGGEST_NOTE}</p>
      <form id="suggest-form" class="contact-form">
        <label class="field">
          <span>Your Suggestion</span>
          <textarea id="suggest-body" rows="4" placeholder="What should we add or change?"></textarea>
        </label>
        <label class="field">
          <span>Your Name <span class="dimmer">(optional)</span></span>
          <input id="suggest-name" type="text" placeholder="So we know who to thank" />
        </label>
        <label class="field">
          <span>Your Email <span class="dimmer">(optional, if you would like a reply)</span></span>
          <input id="suggest-email" type="email" placeholder="you@example.com" />
        </label>
        <button type="submit" class="contact-send">Send</button>
      </form>
      <p class="form-privacy t-caption">We keep what you send only for as long as it takes to reply.
        <button type="button" class="link-btn" data-page="privacy">Privacy Notice</button></p>
      <p id="suggest-confirm" class="contact-confirm" hidden></p>
    </article>`;
}

/** The Contact Us form, on the About page since the 2026-10-04 revamp. It
 *  still sends nothing to a server: Send opens the reader's own email app
 *  (the contact-form branch of the submit handler). */
function contactSectionHtml(): string {
  return `
      <h2 class="t-section" id="contact">Contact Us</h2>
      <form id="contact-form" class="contact-form">
        <label class="field">
          <span>What Is This About</span>
          <select id="contact-type">
            ${CONTACT_TYPES.map((t) => `<option>${t}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Describe It</span>
          <textarea id="contact-body" rows="4" placeholder="Tell us what is going on"></textarea>
        </label>
        <button type="submit" class="contact-send">Send</button>
      </form>
      <p class="form-privacy t-caption">Send opens your own email app. Nothing goes to a server of ours.
        We keep what you send only for as long as it takes to reply.
        <button type="button" class="link-btn" data-page="privacy">Privacy Notice</button></p>
      <p id="contact-confirm" class="contact-confirm" hidden></p>`;
}

/** The legal and policy documents, at the foot of the About page. */
function legalLinksHtml(): string {
  return `
      <h2 class="t-section">Legal</h2>
      <nav class="foot-links" aria-label="Legal">
        ${LEGAL_PAGES
          // About is the page this list sits on, so it is not repeated here:
          // this list is the legal and policy documents.
          .filter((p) => p.id !== 'about')
          .map((p) => `<button class="link-btn" data-page="${p.id}">${esc(p.short)}</button>`)
          .join('')}
      </nav>
      <p class="foot-legal">Some shop links are affiliate links, marked on the page. We may earn
        commission if you buy, at no cost to you, and it never changes the order of results.
        <button class="link-btn" data-page="affiliate">How That Works</button></p>
      <p class="foot-legal dimmer">© ${new Date().getFullYear()} ${esc(COMPANY.name)}, run by ${esc(COMPANY.legalName)}.</p>`;
}

/* ── account ─────────────────────────────────────────────────────────────── */

/**
 * Signed out: a tabbed sign in / sign up form. Signed in but unverified: a
 * "check your email" state with a resend action, since a Supabase account
 * exists the moment signUp() returns but is not yet allowed to do anything
 * that assumes a real, controlled address. Signed in and verified: the
 * account itself. Never a form that fails on every submit — SUPABASE_CONFIGURED
 * being false renders as a plain, honest "not live yet" state instead.
 */
interface DialogOptions {
  title: string;
  message: string;
  /** Turns the pop-up into a question with Cancel beside this button. */
  confirmLabel?: string;
  /** Paints the confirm button in the warning colour (deleting things). */
  danger?: boolean;
  /** A success message rather than a problem: drops the warning accent. */
  ok?: boolean;
}

/**
 * Errors and confirmations as a pop-up (owner feedback, 2026-10-01: a line of
 * red text under a form was easy to miss). A native <dialog> opened with
 * showModal(), so focus moves into it, Esc closes it, the page behind is
 * inert and screen readers announce it, all without extra code. It lives on
 * <body>, outside #app, so a re-render underneath cannot wipe it. Resolves
 * true when the confirm/OK button closed it.
 */
function showDialog(o: DialogOptions): Promise<boolean> {
  let dlg = document.getElementById('ps-dialog') as HTMLDialogElement | null;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'ps-dialog';
    dlg.className = 'ps-dialog';
    dlg.setAttribute('aria-labelledby', 'ps-dialog-title');
    dlg.setAttribute('aria-describedby', 'ps-dialog-msg');
    // A tap on the dimmed backdrop (the dialog element itself, outside its
    // content box) dismisses it, as on every phone's own alerts.
    const self = dlg;
    self.addEventListener('click', (e) => {
      if (e.target === self) self.close('cancel');
    });
    document.body.appendChild(dlg);
  }
  if (dlg.open) dlg.close('cancel');
  dlg.setAttribute('role', 'alertdialog');
  dlg.classList.toggle('is-ok', o.ok === true);
  dlg.innerHTML = `<form method="dialog" class="ps-dialog-body">
      <h2 id="ps-dialog-title" class="ps-dialog-title">${esc(o.title)}</h2>
      <p id="ps-dialog-msg" class="ps-dialog-msg">${esc(o.message)}</p>
      <div class="ps-dialog-actions">${
        o.confirmLabel
          ? `<button value="cancel" class="ps-dialog-btn">Cancel</button>
             <button value="confirm" class="ps-dialog-btn ${o.danger ? 'danger' : 'primary'}">${esc(o.confirmLabel)}</button>`
          : `<button value="confirm" class="ps-dialog-btn primary" autofocus>OK</button>`
      }</div>
    </form>`;
  const d = dlg;
  return new Promise((resolve) => {
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'confirm'), { once: true });
    if (typeof d.showModal === 'function') {
      d.showModal();
    } else if (o.confirmLabel) {
      resolve(window.confirm(`${o.title}\n\n${o.message}`));
    } else {
      window.alert(`${o.title}\n\n${o.message}`);
      resolve(true);
    }
  });
}

/**
 * "Spotted a wrong price? Tell us" (queue item 3.3): a small form in the same
 * native <dialog> style as showDialog, so focus moves in, Esc closes it and
 * the page behind is inert without extra code. Sending follows the site's
 * no server pattern: it opens the reader's own email app with a prefilled
 * message to COMPANY.feedbackEmail (wording and encoding in
 * demo/wrongPrice.ts), then says so in a showDialog confirmation rather than
 * claiming the report reached us.
 *
 * The form uses method="dialog": the Send button submits only once the
 * native validation passes (a shop must be chosen), Cancel carries
 * formnovalidate, and the close event reads which of the two closed it.
 */
function openWrongPriceDialog(): void {
  const frag = fragranceById(state.fragranceId);
  if (!frag) return;
  const reportRows = rowsFor(frag);
  const offers = offersInPageOrder(offerGroups(reportRows));
  const product = `${frag.brand} ${frag.name}${frag.sizeMl ? ` ${frag.sizeMl}ml` : ''}`;

  let dlg = document.getElementById('ps-report') as HTMLDialogElement | null;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'ps-report';
    dlg.className = 'ps-dialog is-form';
    dlg.setAttribute('aria-labelledby', 'ps-report-title');
    dlg.setAttribute('aria-describedby', 'ps-report-msg');
    const self = dlg;
    self.addEventListener('click', (e) => {
      if (e.target === self) self.close('cancel');
    });
    document.body.appendChild(dlg);
  }
  if (dlg.open) return;

  // One shop listed: nothing to choose, so it starts chosen.
  const only = offers.length === 1;
  dlg.innerHTML = `<form method="dialog" class="ps-dialog-body report-form">
      <h2 id="ps-report-title" class="ps-dialog-title">Report a Wrong Price</h2>
      <p id="ps-report-msg" class="ps-dialog-msg">For ${esc(product)}. This opens your email app with the details filled in.</p>
      <label class="field">
        <span>Shop</span>
        <select name="shop" required>
          ${only ? '' : '<option value="">Choose a Shop</option>'}
          ${offers.map((r, i) => `<option value="${i}">${esc(r.retailer.name)}, ${esc(formatGbp(r.deliveredPriceGbp ?? r.itemPriceGbp))}</option>`).join('')}
          <option value="${OTHER_SHOP}">Other</option>
        </select>
      </label>
      <label class="field">
        <span>What Is Wrong</span>
        <select name="problem">
          ${WRONG_PRICE_PROBLEMS.map((p) => `<option value="${p.value}">${esc(p.label)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>Note <span class="dimmer">(optional)</span></span>
        <textarea name="note" rows="3" maxlength="1000" placeholder="For example, the price you saw"></textarea>
      </label>
      <label class="field">
        <span>Your Email <span class="dimmer">(optional, if you would like a reply)</span></span>
        <input name="email" type="email" autocomplete="email" placeholder="you@example.com" />
      </label>
      <div class="ps-dialog-actions">
        <button value="cancel" formnovalidate class="ps-dialog-btn">Cancel</button>
        <button value="send" class="ps-dialog-btn primary">Open Email</button>
      </div>
    </form>`;

  const d = dlg;
  const form = d.querySelector('form') as HTMLFormElement;
  d.returnValue = '';
  d.addEventListener('close', () => {
    if (d.returnValue !== 'send') return;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    const shop = field('shop');
    const row = shop === OTHER_SHOP ? null : offers[Number(shop)] ?? null;
    window.location.href = wrongPriceMailto(COMPANY.feedbackEmail, {
      product,
      productUrl: `${SITE_URL}${routeToPath({ name: 'fragrance', param: frag.id, query: {} })}`,
      offer: row && {
        shop: row.retailer.name,
        itemPriceGbp: row.itemPriceGbp,
        deliveredPriceGbp: row.deliveredPriceGbp,
        deliveryCostGbp: row.delivery.costGbp,
        isPurchasable: row.isPurchasable,
        isPreOrder: row.stock === 'preOrder',
        fetchedAt: row.fetchedAt,
      },
      problem: field('problem') as WrongPriceProblem,
      note: field('note'),
      replyTo: field('email'),
    });
    void showDialog({
      title: 'Thank You',
      message: 'Your email app should now be open with your report. Press send there to reach us.',
      ok: true,
    });
  }, { once: true });
  if (typeof d.showModal === 'function') d.showModal();
  else window.location.href = `mailto:${COMPANY.feedbackEmail}`;
}

/**
 * What the Share pop-up needs about a product: its name facts and the cheapest
 * price the product page shows (bestOffer, the same figure as the tile and the
 * page's Lowest Price box), or null when it has none. A product with no current
 * prices is found in the lazy file; if neither knows the id, null.
 */
function shareSubject(id: string): { product: ShareProduct; price: SharePrice | null } | null {
  const live = fragranceById(id);
  const entry = live ? undefined : dormantEntry(id);
  const frag = live ?? (entry ? dormantFragrance(id, entry) : null);
  if (!frag) return null;
  const best = live ? bestOffer(rowsFor(live)) : null;
  return {
    product: { id, brand: frag.brand, name: frag.name, sizeMl: frag.sizeMl, giftSet: frag.giftSet !== null },
    price: best
      ? {
          gbp: best.deliveredPriceGbp ?? best.itemPriceGbp,
          delivered: best.deliveredPriceGbp !== null,
          shop: best.retailer.name,
        }
      : null,
  };
}

/** How long the Copy button says Copied before it goes back to Copy. */
const SHARE_COPIED_MS = 2000;
let shareCopiedTimer = 0;

/**
 * The Share pop-up (the button on a product page and on each wishlist row): a native
 * <dialog> opened with showModal(), like showDialog and the wrong price form,
 * so focus moves in, Esc closes it, the page behind is inert and screen
 * readers announce it. A tap on the dimmed backdrop closes it. It is a small
 * centred card on every width.
 *
 * Top: the product's canonical link in a read only field with a Copy button.
 * Below: Instagram, WhatsApp, Snapchat, X and More.
 *   - WhatsApp, X and Snapchat are plain links (demo/share.ts) that open in a
 *     new tab or app. Nothing is sent anywhere until one is tapped.
 *   - Instagram has no web share address. Where the browser has the Web Share
 *     API (phones, some desktops) Instagram and More open the system share
 *     sheet, where the reader picks Instagram. Where it does not, Instagram
 *     copies the link and says so: it never claims to have posted anything.
 *   - More is the system share sheet, and is not shown where there is none.
 * The link is the product page's canonical address with no tracking and no
 * affiliate link, whichever list or page the button was tapped on.
 */
function openShareDialog(id: string, opener?: HTMLElement | null): void {
  const subject = shareSubject(id);
  if (!subject) return;
  const { product, price } = subject;
  const url = shareUrl(id);
  const text = shareText(product, price);
  const links = shareLinks(url, text);
  const name = shareProductName(product);
  const canNativeShare = typeof navigator.share === 'function';

  let dlg = document.getElementById('ps-share') as HTMLDialogElement | null;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'ps-share';
    dlg.className = 'ps-dialog is-form share-dialog';
    dlg.setAttribute('aria-labelledby', 'ps-share-title');
    const self = dlg;
    self.addEventListener('click', (e) => {
      if (e.target === self) self.close('cancel');
    });
    document.body.appendChild(dlg);
  }
  if (dlg.open) return;

  const out = 'target="_blank" rel="noopener noreferrer"';
  const newTab = '<span class="sr">, opens in a new tab</span>';
  dlg.innerHTML = `<div class="ps-dialog-body share-body">
      <div class="share-head">
        <h2 id="ps-share-title" class="ps-dialog-title">Share</h2>
        <p class="share-product t-caption">${esc(name)}</p>
      </div>
      <div class="share-copy">
        <input type="text" class="share-link" id="ps-share-link" readonly value="${esc(url)}"
          aria-label="Link to ${esc(name)}" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <button type="button" class="share-copy-btn" data-share-copy autofocus>
          <span class="share-copy-ico share-copy-ico-copy">${ICON_COPY}</span><span class="share-copy-ico share-copy-ico-tick">${ICON_TICK}</span>
          <span class="share-copy-label">Copy</span>
        </button>
      </div>
      <p class="sr" id="ps-share-status" role="status" aria-live="polite"></p>
      <p class="share-or t-eyebrow">Or Share On</p>
      <ul class="share-targets">
        <li><button type="button" class="share-target" data-share-instagram>${ICON_INSTAGRAM}<span>Instagram</span></button></li>
        <li><a class="share-target" href="${esc(links.whatsapp)}" ${out}>${ICON_WHATSAPP}<span>WhatsApp</span>${newTab}</a></li>
        <li><a class="share-target" href="${esc(links.snapchat)}" ${out}>${ICON_SNAPCHAT}<span>Snapchat</span>${newTab}</a></li>
        <li><a class="share-target" href="${esc(links.x)}" ${out}>${ICON_X}<span>X</span>${newTab}</a></li>
        ${canNativeShare ? `<li><button type="button" class="share-target" data-share-more>${ICON_MORE}<span>More</span></button></li>` : ''}
      </ul>
      <p class="share-note t-caption" id="ps-share-note" role="status" aria-live="polite"></p>
      <div class="ps-dialog-actions"><button type="button" class="ps-dialog-btn" data-share-close>Close</button></div>
    </div>`;

  const d = dlg;
  const $in = <T extends HTMLElement>(sel: string): T => d.querySelector(sel) as T;
  const input = $in<HTMLInputElement>('#ps-share-link');
  const copyBtn = $in<HTMLButtonElement>('[data-share-copy]');
  const label = $in<HTMLElement>('.share-copy-label');
  const status = $in<HTMLElement>('#ps-share-status');
  const note = $in<HTMLElement>('#ps-share-note');

  const resetCopy = (): void => {
    window.clearTimeout(shareCopiedTimer);
    copyBtn.classList.remove('is-copied');
    label.textContent = 'Copy';
  };
  const showCopied = (): void => {
    resetCopy();
    copyBtn.classList.add('is-copied');
    label.textContent = 'Copied';
    status.textContent = 'Link copied';
    shareCopiedTimer = window.setTimeout(() => {
      copyBtn.classList.remove('is-copied');
      label.textContent = 'Copy';
      status.textContent = '';
    }, SHARE_COPIED_MS);
  };
  /** Clipboard API first, then select and execCommand for older browsers. */
  const copy = async (): Promise<boolean> => {
    try {
      if (window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      /* blocked: try the older way */
    }
    try {
      input.focus();
      input.select();
      input.setSelectionRange(0, url.length);
      if (document.execCommand('copy')) return true;
    } catch {
      /* fall through */
    }
    // Blocked: leave the link selected so it can be copied by hand.
    input.focus();
    input.select();
    return false;
  };
  const shareNatively = async (): Promise<'shared' | 'cancelled' | 'failed'> => {
    try {
      await navigator.share({ title: name, text, url });
      return 'shared';
    } catch (err) {
      return err instanceof DOMException && err.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  };

  copyBtn.addEventListener('click', () => {
    note.textContent = '';
    void copy().then((ok) => {
      if (ok) showCopied();
      else note.textContent = 'Copying was blocked. The link is selected, so you can copy it by hand.';
    });
  });
  $in('[data-share-instagram]').addEventListener('click', () => {
    note.textContent = '';
    const pasteIt = (): void => {
      void copy().then((ok) => {
        note.textContent = ok
          ? 'Link copied. Paste it into Instagram.'
          : 'Copying was blocked. The link is selected, so you can copy it by hand, then paste it into Instagram.';
      });
    };
    if (!canNativeShare) {
      pasteIt();
      return;
    }
    void shareNatively().then((result) => {
      if (result === 'failed') pasteIt();
    });
  });
  d.querySelector('[data-share-more]')?.addEventListener('click', () => {
    note.textContent = '';
    void shareNatively();
  });
  $in('[data-share-close]').addEventListener('click', () => d.close('cancel'));
  d.addEventListener('close', () => {
    resetCopy();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }, { once: true });

  if (typeof d.showModal === 'function') d.showModal();
}

/** The new-password form used after a reset link and for changing it. */
function newPasswordForm(id: string, submitLabel: string): string {
  return `<form id="${id}" class="contact-form">
      <label class="field">
        <span>New Password</span>
        <input type="password" name="password" autocomplete="new-password" required minlength="8" />
      </label>
      <label class="field">
        <span>Repeat New Password</span>
        <input type="password" name="confirm" autocomplete="new-password" required minlength="8" />
      </label>
      <button type="submit" class="contact-send">${esc(submitLabel)}</button>
    </form>`;
}

/**
 * Everything an account page shows before there is a verified, signed in
 * reader to show it to: not switched on, loading, set a new password, verify
 * your email, or the sign in form. Null once signed in, and the page draws
 * itself.
 *
 * All three account pages pass through here, so a signed out reader who opens
 * /account/wishlist gets the sign in form at that same address, and once the
 * session arrives (onAuthChange re-renders) the page they asked for draws in
 * its place: the "land back where you were" needs no redirect at all.
 */
function accountGate(signedOut: { heading: string; note: string }): string | null {
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
        <h1 class="t-page">Account</h1>
        <p>Accounts are not switched on yet.</p>
      </article>`;
  }

  if (s.kind === 'loading') {
    return `<button class="back" data-back>Back</button><article class="doc settings-doc"><h1 class="t-page">Account</h1><p>Loading.</p></article>`;
  }

  if (s.kind === 'signedIn' && state.authRecovery) {
    return `
      <button class="back" data-back>Back</button>
      <article class="doc settings-doc">
        <h1 class="t-page">Set a New Password</h1>
        <p class="account-note">For ${esc(s.email)}.</p>
        ${newPasswordForm('auth-recovery-form', 'Save New Password')}
      </article>`;
  }

  if (s.kind === 'signedIn') return null;

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
      ? `<button class="link-btn" id="auth-sign-out-pending">Sign Out</button>`
      : `<button class="link-btn" id="auth-leave-pending">Back to Sign In</button>`;
    return `
      <button class="back" data-back>Back</button>
      <article class="doc settings-doc">
        <h1 class="t-page">Verify Your Email</h1>
        <p class="account-note">
          We sent a link to ${esc(s.email === '' ? 'your email address' : s.email)}. Follow it to finish setting up your
          account, then come back here.
        </p>
        <button class="contact-send" id="auth-resend" data-email="${esc(s.email)}">Resend the Email</button>
        <p id="auth-notice" class="contact-confirm" hidden></p>
        ${leave}
      </article>`;
  }

  const signUpTab = state.authTab === 'signUp';
  return `
    <button class="back" data-back>Back</button>
    <article class="doc settings-doc">
      <h1 class="t-page">${esc(signedOut.heading)}</h1>
      ${signedOut.note ? `<p class="account-note">${esc(signedOut.note)}</p>` : ''}

      <div class="seg" role="group" aria-label="Sign in or sign up">
        <button class="seg-btn ${!signUpTab ? 'on' : ''}" data-auth-tab="signIn">Sign In</button>
        <button class="seg-btn ${signUpTab ? 'on' : ''}" data-auth-tab="signUp">Sign Up</button>
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
          ${signUpTab ? 'Create Account' : 'Sign In'}
        </button>
        ${
          // Said at the point of signing up, where it is decided, not only on
          // a page the reader has to go and find: what is collected, who holds
          // it, and which terms apply. Plain buttons rather than links because
          // every in-app page is reached by data-page; type="button" so they
          // can never submit the form they sit inside.
          signUpTab
            ? `<p class="form-privacy t-caption">An account stores your email address, login, wishlist
                and a profile photo if you add one, with our account provider, Supabase. Creating one means you accept our
                <button type="button" class="link-btn" data-page="terms">terms</button>. The
                <button type="button" class="link-btn" data-page="privacy">privacy notice</button> says
                what is kept and how to delete it.</p>`
            : ''
        }
      </form>

      ${!signUpTab ? `<button class="link-btn" id="auth-forgot">Forgot Your Password</button>` : ''}

      ${state.authResetSent ? `<p class="contact-confirm">If that address has an account, a reset link is on its way.</p>` : ''}
    </article>`;
}

/** "4 October 2026", for dates Supabase reports about the account. */
function longDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The top of the profile: the photo (or the same initial the account button
 * shows), and the Add, Change and Remove controls. Until photos are switched
 * on for this site (migration 0006), no control is offered, only a plain
 * line saying so; while that is still being read, nothing is said at all.
 */
function profilePhotoHtml(email: string): string {
  const photo = shownPhotoUrl();
  const letter = [...email.trim()][0]?.toLocaleUpperCase('en-GB') ?? '';
  const face = photo
    ? `<img class="profile-photo-img" data-acct-photo src="${esc(photo)}" alt="Your profile photo" width="96" height="96" loading="eager" decoding="async" />`
    : `<span class="profile-photo-letter" aria-hidden="true">${esc(letter)}</span>`;
  let controls = '';
  if (state.photoAvailable === false) {
    controls = `<p class="profile-photo-note t-caption">Adding a profile photo is not available yet.</p>`;
  } else if (state.photoAvailable === true) {
    const busy = state.photoBusy ? ' disabled' : '';
    const has = state.photoPath !== null;
    controls = `
      <div class="profile-photo-actions">
        <button type="button" class="seg-btn acct-download" id="acct-photo-pick"${busy}>${has ? 'Change Photo' : 'Add a Photo'}</button>
        ${has ? `<button type="button" class="link-btn danger" id="acct-photo-remove"${busy}>Remove Photo</button>` : ''}
      </div>
      <input type="file" id="acct-photo-input" accept="${PHOTO_ACCEPT_ATTR}" hidden />
      <p class="profile-photo-note t-caption" aria-live="polite">${state.photoBusy
        ? 'Saving your photo.'
        : 'JPEG, PNG or WebP. It is made into a small square in your browser and only you can see it.'}</p>`;
  }
  return `<section class="profile-photo" aria-label="Profile Photo">
      <span class="profile-photo-face${photo ? ' has-photo' : ''}">${face}</span>
      <div class="profile-photo-side">${controls}</div>
    </section>`;
}

/** The heading each account page shows once signed in; head.ts titles match. */
const ACCOUNT_HEADINGS: Record<'account' | 'accountWishlist' | 'accountNotifications', string> = {
  account: 'My Profile',
  accountWishlist: 'My Wishlist',
  accountNotifications: 'My Notifications',
};

/**
 * /account once signed in: who is signed in, the plan, sign in details, the
 * data download, and the two account actions. The wishlist and the alert
 * choice that used to share this page have pages of their own now.
 *
 * Change Email is offered because Supabase's own flow is an honest one: the
 * address changes only after a confirmation link is followed (see
 * updateEmail in demo/auth.ts), and the page says so rather than showing the
 * new address as current.
 */
function accountView(): string {
  const gate = accountGate({ heading: 'Account', note: '' });
  if (gate !== null) return gate;
  const user = state.authUser;
  const email = user?.email ?? '';
  const created = longDate(user?.created_at);
  const pendingNew = user?.new_email ?? '';
  return `
    <button class="back" data-back>Back</button>
    <article class="doc account-doc">
      <h1 class="t-page">${ACCOUNT_HEADINGS.account}</h1>

      ${profilePhotoHtml(email)}

      <section class="acct-card" aria-label="Signed In As">
        <p class="acct-card-label t-eyebrow">Signed In As</p>
        <p class="acct-card-value">${esc(email)}</p>
        ${created ? `<p class="acct-card-note t-caption">Account created ${esc(created)}</p>` : ''}
        ${pendingNew ? `<p class="acct-card-note t-caption">Waiting for you to confirm ${esc(pendingNew)} from the link we sent.</p>` : ''}
      </section>

      <section class="acct-card" aria-label="Your Plan">
        <p class="acct-card-label t-eyebrow">Your Plan</p>
        <p class="acct-card-value">Free</p>
        <p class="acct-card-note t-caption">Premium will add browsing with no ads, email and push alerts, and an alert history. It is not on sale yet.</p>
      </section>

      <div class="acct-shortcuts">
        <button class="account-entry" data-acct-go="wishlist"><span>View My Wishlist${state.wishlistLoaded ? ` (${state.wishlistIds.size})` : ''}</span>${ICON_CHEVRON}</button>
        <button class="account-entry" data-acct-go="notifications"><span>My Notifications</span>${ICON_CHEVRON}</button>
      </div>

      <h2 class="t-section">Sign In Details</h2>
      <details class="account-more">
        <summary>Change Password</summary>
        ${newPasswordForm('auth-change-password-form', 'Change Password')}
      </details>
      <details class="account-more">
        <summary>Change Email</summary>
        <form id="auth-change-email-form" class="contact-form">
          <label class="field">
            <span>New Email</span>
            <input type="email" name="email" autocomplete="email" required />
          </label>
          <button type="submit" class="contact-send">Send Confirmation Link</button>
          <p class="form-privacy t-caption">We email a link to the new address. Your sign in email changes only
            once you follow it, and you may be asked to confirm from your current address too.</p>
        </form>
      </details>

      <h2 class="t-section">Your Data</h2>
      <p class="account-note">Download a file of everything we hold for your account: your email, when the
        account was created, your wishlist, your alert settings and your profile photo if you added one. It is
        made in your browser.</p>
      <button class="seg-btn acct-download" id="acct-download" type="button">Download My Data</button>

      <div class="account-actions">
        <button class="contact-send" id="auth-sign-out">Sign Out</button>
        <button class="link-btn danger" id="auth-delete">Delete Account</button>
      </div>
    </article>`;
}

/** /account/wishlist: every saved fragrance with today's cheapest price. */
function accountWishlistView(): string {
  const gate = accountGate({ heading: ACCOUNT_HEADINGS.accountWishlist, note: 'Sign in to see your wishlist.' });
  if (gate !== null) return gate;
  return `
    <button class="back" data-back>Back</button>
    <article class="doc account-doc">
      <h1 class="t-page">${ACCOUNT_HEADINGS.accountWishlist}</h1>
      ${wishlistListHtml()}
    </article>`;
}

/**
 * /account/notifications: the free Price Alerts opt in, moved here from the
 * old single account page, and what Premium is planned to add (owner's
 * decision, 2026-10-04: Premium is ad free browsing first, plus email and
 * push alerts). Written as planned, because it is: no price and no buy
 * button while nothing can be bought, and no alert history until the sender
 * actually logs what it sends (Phase 2 of docs/ACCOUNT-PREMIUM-PLAN.md).
 */
function accountNotificationsView(): string {
  const gate = accountGate({ heading: ACCOUNT_HEADINGS.accountNotifications, note: 'Sign in to choose your notifications.' });
  if (gate !== null) return gate;
  return `
    <button class="back" data-back>Back</button>
    <article class="doc account-doc">
      <h1 class="t-page">${ACCOUNT_HEADINGS.accountNotifications}</h1>
      ${priceAlertsSectionHtml()}
      <p class="account-note">Email alerts will move to Premium when it launches. Until then they stay free
        as they are today, and you will be told before anything changes.</p>

      <section class="premium-plan" aria-labelledby="premium-plan-title">
        <h2 class="t-section" id="premium-plan-title">Coming With Premium</h2>
        <p class="premium-tag t-eyebrow">Planned, Not on Sale Yet</p>
        <ul class="premium-list">
          <li><strong>No Ads</strong><span>Browse the whole site without adverts.</span></li>
          <li><strong>Email Alerts</strong><span>Price drops, a target price you set, back in stock and preorder shipping.</span></li>
          <li><strong>Push Notifications</strong><span>The same alerts on your phone or computer.</span></li>
          <li><strong>Alert History</strong><span>A list of every alert we have sent you.</span></li>
        </ul>
        <p class="t-caption">Premium cannot be bought yet. Search, prices, your wishlist and the price graphs stay free.</p>
      </section>
    </article>`;
}

/**
 * Download My Data: everything the signed in browser can read about this
 * account, read fresh at the moment of the click rather than from whatever
 * the pages last loaded, and handed over as a JSON file. Nothing is sent
 * anywhere; the file is built here and saved by the browser.
 */
async function downloadMyData(): Promise<void> {
  const user = state.authUser;
  if (!user) return;
  const [wishlist, alerts, photoState] = await Promise.all([fetchWishlist(), fetchPriceAlerts(), fetchPhotoState()]);
  // The photo itself goes inside the file as a data: address, read fresh
  // like everything else here. Null for "stored" when photos are not
  // switched on for this site, so the file never claims a no it cannot know.
  let photo: DataExportInput['photo'] = { stored: null, contentType: null, dataUrl: null };
  if (photoState.available) {
    const blob = photoState.path ? await downloadPhoto(photoState.path) : null;
    photo = {
      stored: photoState.path !== null,
      contentType: blob?.type || null,
      dataUrl: blob ? await blobToDataUrl(blob) : null,
    };
  }
  const now = new Date();
  const data = buildDataExport({
    email: user.email ?? null,
    accountCreatedAt: user.created_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    wishlist,
    fragranceName: (id) => {
      const f = fragranceById(id);
      return f ? `${f.brand} ${f.name}${f.sizeMl ? ` ${f.sizeMl}ml` : ''}` : null;
    },
    priceAlerts: alerts,
    photo,
    exportedAt: now,
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dataExportFileName(now);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Add a Photo and Change Photo: checks the file, shrinks it to a small square
 * in this browser (demo/profilePhoto.ts), then saves it. Every refusal is a
 * pop up, as everywhere else on the account pages.
 */
async function addProfilePhoto(file: File): Promise<void> {
  const check = checkPhotoFile(file);
  if (!check.ok) {
    void showDialog({ title: check.title, message: check.message });
    return;
  }
  state.photoBusy = true;
  renderInPlace();
  const small = await shrinkPhoto(file);
  if (!small) {
    state.photoBusy = false;
    renderInPlace();
    void showDialog({ title: 'That Photo Could Not Be Read', message: 'Your browser could not open that image. Please choose another photo.' });
    return;
  }
  const result = await savePhoto(small);
  state.photoBusy = false;
  if (!result.ok) {
    renderInPlace();
    void showDialog({ title: 'Photo Not Saved', message: result.message });
    return;
  }
  state.photoPath = result.path;
  setPhotoBlob(small);
  renderInPlace();
}

/* ── the account menu ────────────────────────────────────────────────────────
   The round button at the far right of the bar, after the nav items (it
   sat at the far left, before the brandmark, until the owner asked for it
   on the right, 2026-10-04). A real <button> with
   aria-haspopup and aria-expanded, opening a list of items marked up as a
   menu. Every item is an ordinary button in the tab order, so Tab walks
   through it and on out the other side (nothing is trapped), and the arrow
   keys, Home and End move between items as a menu's do. Esc closes it and
   puts focus back on the button; a click anywhere outside closes it too.

   One piece of markup serves both shapes: on a wide screen it drops down
   under the button, and on a phone the stylesheet turns the same element
   into a sheet from the bottom of the screen over a dimmed backdrop
   (.acct-menu in demo/template.html). The menu sits right after the button
   in the document, which is what makes Tab from the button land on its
   first item. */

const ICON_PERSON = icon('<circle cx="12" cy="8.5" r="3.8" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c.9-3.9 3.9-6 7.5-6s6.6 2.1 7.5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>');

/** The photo's blob: address while it is there and has not failed to show. */
function shownPhotoUrl(): string | null {
  return state.photoAvailable && state.photoPath && state.photoUrl && !state.photoBroken ? state.photoUrl : null;
}

/** Repaints the round button for the current account state. Cheap, and
 *  called on every render so a sign in or out shows without a reload. */
function syncAccountButton(): void {
  const btn = document.getElementById('account-btn');
  if (!btn) return;
  const s = accountState(accountStateInput());
  const avatar = accountAvatar(s);
  const photo = avatar.signedIn ? shownPhotoUrl() : null;
  // The photo, when there is one that has not failed to show; the initial
  // otherwise. The image is decoration: the button's own label names it.
  const face = photo
    ? `<img class="acct-photo" data-acct-photo src="${esc(photo)}" alt="" width="38" height="38" loading="eager" decoding="async" />`
    : avatar.kind === 'letter'
      ? `<span class="acct-letter" aria-hidden="true">${esc(avatar.letter)}</span>`
      : `<span class="acct-icon" aria-hidden="true">${ICON_PERSON}</span>`;
  if (btn.getAttribute('data-face') !== face) {
    btn.innerHTML = face;
    btn.setAttribute('data-face', face);
  }
  btn.classList.toggle('is-signed-in', avatar.signedIn);
  btn.classList.toggle('has-photo', photo !== null);
  btn.setAttribute('aria-label', accountButtonLabel(s));
  btn.classList.toggle('on', ACCOUNT_VIEWS.includes(state.view) || state.view === 'settings' || state.view === 'suggestions');
  if (state.accountMenuOpen) fillAccountMenu();
}

/** The panel holding the menu: the "signed in as" line, then the menu itself
 *  (#account-menu, role="menu"), kept apart so the menu holds only items. */
function accountMenuEl(): HTMLElement | null {
  return document.getElementById('account-pop');
}

function fillAccountMenu(): void {
  const menu = accountMenuEl();
  if (!menu) return;
  const s = accountState(accountStateInput());
  const items = accountMenuItems(s, state.wishlistLoaded ? state.wishlistIds.size : null);
  const current: Partial<Record<AccountMenuAction, boolean>> = {
    profile: state.view === 'account',
    wishlist: state.view === 'accountWishlist',
    notifications: state.view === 'accountNotifications',
    settings: state.view === 'settings',
    suggestions: state.view === 'suggestions',
  };
  const head = s.kind === 'signedIn' && s.email
    ? `<p class="acct-menu-head"><span class="t-caption">Signed in as</span> <span class="acct-menu-email">${esc(s.email)}</span></p>`
    : '';
  const list = items
    .map((it) => `<button type="button" role="menuitem" class="acct-item${it.action === 'signOut' ? ' is-quiet' : ''}"
        data-acct-action="${it.action}"${current[it.action] ? ' aria-current="page"' : ''}>${esc(it.label)}</button>`)
    .join('');
  const html = `${head}<div class="acct-items" role="menu" id="account-menu" aria-labelledby="account-btn">${list}</div>`;
  if (menu.getAttribute('data-html') !== html) {
    const focusedAction = (document.activeElement as HTMLElement | null)?.getAttribute('data-acct-action');
    menu.innerHTML = html;
    menu.setAttribute('data-html', html);
    if (focusedAction) menu.querySelector<HTMLElement>(`[data-acct-action="${focusedAction}"]`)?.focus();
  }
}

function accountMenuItemsEls(): HTMLElement[] {
  return [...(accountMenuEl()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

function openAccountMenu(focus: 'first' | 'last' = 'first'): void {
  const menu = accountMenuEl();
  const btn = document.getElementById('account-btn');
  const back = document.getElementById('account-menu-back');
  if (!menu || !btn) return;
  closeRegionMenu(false);
  state.accountMenuOpen = true;
  fillAccountMenu();
  menu.hidden = false;
  if (back) back.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('acct-menu-open');
  const items = accountMenuItemsEls();
  (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
}

function closeAccountMenu(returnFocus: boolean): void {
  const menu = accountMenuEl();
  const btn = document.getElementById('account-btn');
  const back = document.getElementById('account-menu-back');
  if (!state.accountMenuOpen) return;
  state.accountMenuOpen = false;
  if (menu) menu.hidden = true;
  if (back) back.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('acct-menu-open');
  if (returnFocus) btn?.focus();
}

/* ── the country and currency menu ──────────────────────────────────────────
   A compact button just left of the account button: a small flag, "GBP" and
   a chevron. UK and GBP is the site's only region, so the menu is a list of
   where it works now (ticked) and where it may one day (greyed out, "Coming
   Soon"). Choosing changes nothing: no storage, no cookie, no price moves.

   It follows the account menu's pattern: a real <button> with aria-haspopup
   and aria-expanded, a role="menu" panel right after it (so Tab from the
   button lands on the first item), arrow keys, Home and End to move, Esc to
   close and hand focus back, a click outside to close, and the same bottom
   sheet on a phone. The greyed out items are aria-disabled and out of the
   tab order, but the arrow keys still reach them, as the ARIA menu pattern
   advises, so a screen reader reads each as unavailable with its note.
   Opening either menu closes the other. */

function regionMenuEl(): HTMLElement | null {
  return document.getElementById('region-pop');
}

function regionItemHtml(r: Region): string {
  const nameId = `region-name-${r.id}`;
  const codeId = `region-code-${r.id}`;
  const noteId = `region-note-${r.id}`;
  const text = `<span class="region-text"><span class="region-line"><span id="${nameId}">${esc(r.name)}</span> <span class="region-code" id="${codeId}">${esc(r.currency)}</span></span>${
    r.note ? `<span class="region-note" id="${noteId}">${esc(r.note)}</span>` : ''}</span>`;
  const current = r.id === CURRENT_REGION.id;
  const attrs = r.available
    ? `tabindex="0" aria-checked="${current}"`
    : `tabindex="-1" aria-checked="false" aria-disabled="true" aria-describedby="${noteId}"`;
  return `<div role="menuitemradio" class="region-item" data-region="${r.id}" ${attrs} aria-labelledby="${nameId} ${codeId}">${flagSvg(r.id)}${text}${current ? `<span class="region-tick">${ICON_TICK}</span>` : ''}</div>`;
}

/** Paints the button and the list from the region data. Once, at start up:
 *  nothing about either changes while the page is open. */
function fillRegionMenu(): void {
  const btn = document.getElementById('region-btn');
  const menu = regionMenuEl();
  if (!btn || !menu) return;
  btn.innerHTML = `${flagSvg(CURRENT_REGION.id)}<span class="region-btn-code" aria-hidden="true">${esc(CURRENT_REGION.currency)}</span>${ICON_CHEVRON}`;
  btn.setAttribute('aria-label', regionButtonLabel(CURRENT_REGION));
  menu.innerHTML = `<div class="region-items" role="menu" id="region-menu" aria-labelledby="region-btn">${REGIONS.map(regionItemHtml).join('')}</div>`;
}

function regionMenuItemsEls(): HTMLElement[] {
  return [...(regionMenuEl()?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
}

function openRegionMenu(focus: 'first' | 'last' = 'first'): void {
  const menu = regionMenuEl();
  const btn = document.getElementById('region-btn');
  const back = document.getElementById('region-menu-back');
  if (!menu || !btn) return;
  closeAccountMenu(false);
  state.regionMenuOpen = true;
  menu.hidden = false;
  if (back) back.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  const items = regionMenuItemsEls();
  (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
}

function closeRegionMenu(returnFocus: boolean): void {
  const menu = regionMenuEl();
  const btn = document.getElementById('region-btn');
  const back = document.getElementById('region-menu-back');
  if (!state.regionMenuOpen) return;
  state.regionMenuOpen = false;
  if (menu) menu.hidden = true;
  if (back) back.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
  if (returnFocus) btn?.focus();
}

/** Opens an account page, or does the one thing an item does. */
function runAccountAction(action: AccountMenuAction): void {
  switch (action) {
    case 'profile':
    case 'verify':
      go('account');
      return;
    case 'wishlist':
      go('accountWishlist');
      return;
    case 'notifications':
      go('accountNotifications');
      return;
    case 'settings':
      go('settings');
      return;
    case 'suggestions':
      go('suggestions');
      return;
    case 'signIn':
    case 'signUp':
      state.authTab = action;
      state.authResetSent = false;
      go('account');
      return;
    case 'signOut':
      state.authPendingEmail = '';
      void signOut();
      return;
  }
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
      <h1 class="t-page">Page Not Found</h1>
      <p class="t-body">Nothing on this site answers to
        ${path && path !== '/' ? `<code>${esc(path)}</code>` : 'that address'}.
        It may have been a fragrance or a shop that has since been delisted.</p>
      <p class="t-body">Search the catalogue, or start from one of these:</p>
      <p class="notfound-links">
        <button class="link-btn" data-goto="home">Home</button>
        <button class="link-btn" data-goto="browse">Search ${DEMO_FRAGRANCES.length.toLocaleString('en-GB')} Fragrances</button>
        <button class="link-btn" data-tab="brands">Brands</button>
        <button class="link-btn" data-tab="retailers">Shops</button>
      </p>
    </article>`;
}

/**
 * /about as a page of its own (owner's revamp, 2026-10-04): the mission, live
 * numbers, how prices are checked, how the site makes money, who runs it, a
 * short FAQ, then Contact Us and the legal links that used to sit in
 * Settings. The words come from ABOUT in demo/legal.ts, the one source they
 * share with /legal/about; the three numbers are counted from the listings
 * by liveCounts() in demo/data.ts, never typed.
 */
function aboutView(): string {
  const page = legalPage('about');
  if (!page) return homeView();
  const live = liveCounts();
  const stat = (value: number, label: string, key: string) =>
    `<div class="about-stat" data-stat="${key}"><dt class="t-caption">${label}</dt><dd>${value.toLocaleString('en-GB')}</dd></div>`;
  return `
    <article class="doc about-doc">
      <h1 class="t-page">${esc(page.title)}</h1>
      <p class="about-mission">${esc(ABOUT.mission)}</p>
      <dl class="about-stats" aria-label="The site today">
        ${stat(live.shops, 'Shops With Current Prices', 'shops')}
        ${stat(live.fragrances, 'Fragrances', 'fragrances')}
        ${stat(live.offers, 'Current Offers', 'offers')}
      </dl>
      ${ABOUT.story}

      <h2 class="t-section">How Prices Are Checked</h2>
      <ul class="about-cards">
        ${ABOUT.checks.map((c) => `<li class="about-card"><h3 class="about-card-title">${esc(c.title)}</h3><p>${c.body}</p></li>`).join('')}
      </ul>
      ${ABOUT.method}

      <h2 class="t-section">How the Site Makes Money</h2>
      ${ABOUT.money}

      <h2 class="t-section">Who Runs It</h2>
      ${ABOUT.whoRuns}

      <h2 class="t-section">Questions</h2>
      <div class="about-faq">
        ${ABOUT.faq.map((f) => `<details class="about-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
      </div>

      <div class="about-foot">
        ${contactSectionHtml()}
        ${legalLinksHtml()}
      </div>
    </article>`;
}

function legalView(): string {
  const page = legalPage(state.legalId);
  if (!page) return homeView();
  return `
    <button class="back" data-back>Back</button>
    <article class="doc">
      <h1 class="t-page">${esc(page.title)}</h1>
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
 * Lists on the current page, keyed by sentinel id, with what each still holds.
 *
 * A map rather than a single slot because a page can hold more than one chunked
 * list: the Houses tab renders one grid per house, so a single shared slot let
 * the second group overwrite the first and the first could never finish loading
 * — it sat at 48 of its items forever with a dead sentinel below it.
 *
 * `items` is the whole list and `at` how many of it are on the page. `els`
 * and `real` are only kept for a tile grid (`windowed`): see keepNearTiles.
 */
interface HeldList {
  items: readonly unknown[];
  at: number;
  render: (item: unknown) => string;
  windowed: boolean;
  /** The element standing for each item loaded so far, a tile or its stand in. */
  els: HTMLElement[];
  /** 1 where `els[i]` is the item's own markup, 0 where it is the empty stand in. */
  real: Uint8Array;
  ul: HTMLElement | null;
  /** The shared row height the grid has been held to, so rows never shrink. */
  rowFloor: number;
  /** The grid's width and column count when rowFloor was measured: other ones are another row height. */
  floorKey: string;
}
const pendingLists = new Map<string, HeldList>();
let listObserver: IntersectionObserver | null = null;
let chunkSeq = 0;

/** Clear anything held for the previous page. Called at the top of render(). */
function resetChunkedLists(): void {
  listObserver?.disconnect();
  listObserver = null;
  pendingLists.clear();
  chunkSeq = 0;
}

/**
 * Emit the first chunk plus a sentinel, and hold the remainder for later.
 *
 * `renderItem` gets the item's position only for the first chunk, the one
 * painted with the page: that is how a list knows which tiles are in its
 * first row (see eagerCount). Items appended later get none, since they are
 * by construction below whatever the reader has already seen.
 */
function chunked<T>(items: readonly T[], renderItem: (item: T, index?: number) => string): string {
  const first = items.slice(0, CHUNK);
  if (items.length <= CHUNK) return first.map((item, i) => renderItem(item, i)).join('');

  // There is no cap on how long a list may be (owner's decision, 2026-10-04),
  // so this is the only thing standing between a list of thousands and a
  // frozen first paint: one chunk is built now, and the list is held whole
  // with a cursor, so taking the next chunk copies nothing already taken.
  const id = `chunk-${++chunkSeq}`;
  pendingLists.set(id, {
    items,
    at: CHUNK,
    render: renderItem as (i: unknown) => string,
    windowed: false,
    els: [],
    real: new Uint8Array(0),
    ul: null,
    rowFloor: 0,
    floorKey: '',
  });
  return (
    first.map((item, i) => renderItem(item, i)).join('') +
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
        if (entry.isIntersecting) appendNextChunk(entry.target as HTMLElement);
      }
    },
    { rootMargin: '600px 0px' },
  );

  for (const el of document.querySelectorAll<HTMLElement>('[data-more]')) {
    listObserver.observe(el);
    // Tile grids are the lists that can run to thousands, and the only ones
    // whose off screen tiles are swapped out (keepNearTiles).
    const held = pendingLists.get(el.dataset.more ?? '');
    const ul = el.parentElement;
    if (!held || !ul?.classList.contains('tile-grid')) continue;
    const first = Array.from(ul.children).filter((c) => c !== el) as HTMLElement[];
    if (first.length !== Math.min(CHUNK, held.items.length)) continue;
    held.windowed = true;
    held.ul = ul;
    held.els = first;
    held.real = new Uint8Array(held.items.length);
    held.real.fill(1, 0, first.length);
  }
}

/** Paint the next chunk of the list whose sentinel this is. False if it had none left. */
function appendNextChunk(el: HTMLElement): boolean {
  const id = el.dataset.more;
  const held = id ? pendingLists.get(id) : undefined;
  if (!id || !held || held.at >= held.items.length) return false;

  const next = held.items.slice(held.at, held.at + CHUNK);
  const before = el.previousElementSibling;
  el.insertAdjacentHTML('beforebegin', next.map((item) => held.render(item)).join(''));
  if (held.windowed) {
    const added: HTMLElement[] = [];
    for (let n = before ? before.nextElementSibling : el.parentElement?.firstElementChild ?? null; n && n !== el; n = n.nextElementSibling) {
      added.push(n as HTMLElement);
    }
    if (added.length === next.length) {
      held.els.push(...added);
      held.real.fill(1, held.at, held.at + added.length);
    } else {
      // Not one element per item: positions can no longer be trusted, so this
      // list is left whole rather than risk swapping the wrong tile.
      held.windowed = false;
    }
  }
  held.at += next.length;
  mountAds();

  if (held.at >= held.items.length) {
    listObserver?.unobserve(el);
    el.remove();
  } else if (listObserver) {
    // An observer reports a change, not a state: if this chunk was too short to
    // push the sentinel out of range (a very wide window, a short row) it
    // would stay "intersecting" and never report again, and the list would
    // stop mid scroll. Watching it afresh asks again.
    listObserver.unobserve(el);
    listObserver.observe(el);
  }
  scheduleKeepNear();
  return true;
}

/** Paint one more chunk of every list on the page. False once all are complete. */
function appendChunksEverywhere(): boolean {
  let any = false;
  document.querySelectorAll<HTMLElement>('[data-more]').forEach((el) => {
    if (appendNextChunk(el)) any = true;
  });
  return any;
}

/* ── keeping a very long list light ──────────────────────────────────────────
   Without a cap a list can run to every fragrance in the catalogue: the Most
   Stocked ranking alone is 16,000 tiles. Appending a chunk at a time keeps
   each step cheap, but nothing ever left the page, and measured on a phone
   sized window the page held about 207,000 elements and half a million DOM
   nodes by 10,000 tiles, took about 2 GB of memory, got slower with every
   chunk, and was killed by the browser before the end.

   So a tile grid only keeps the tiles near the screen. The ones further than
   KEEP_SCREENS screens above or below the reader are swapped for an empty
   <li> that holds their place in the grid, and swapped back as the reader
   scrolls toward them. The grid's rows are all one height (grid-auto-rows:
   1fr in the stylesheet), so a stand in changes nothing about the layout,
   provided that height never shrinks while the tallest tile is out of the
   page: rowFloor holds it. An advertisement is never swapped, so one is not
   asked for twice, and neither is the tile the reader has focus in. */

/** How many screens of real tiles are kept above and below what is on screen. */
const KEEP_SCREENS = 3;

let keepFrame = 0;
function scheduleKeepNear(): void {
  if (keepFrame || pendingLists.size === 0) return;
  keepFrame = window.requestAnimationFrame(() => {
    keepFrame = 0;
    keepNearTiles();
  });
}

function keepNearTiles(): void {
  for (const held of pendingLists.values()) {
    if (!held.windowed || !held.ul || !held.ul.isConnected || held.els.length === 0) continue;
    keepNearTilesOf(held, held.ul);
  }
}

function keepNearTilesOf(held: HeldList, ul: HTMLElement): void {
  const style = window.getComputedStyle(ul);
  const cols = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
  const gap = Number.parseFloat(style.rowGap) || 0;
  const rect = ul.getBoundingClientRect();

  // A different width or column count means a different row height: let the
  // grid measure afresh.
  const key = `${Math.round(rect.width)}x${cols}`;
  if (key !== held.floorKey) {
    ul.style.gridAutoRows = '';
    held.rowFloor = 0;
    held.floorKey = key;
  }
  // Every stand in is a row track tall, so any element tells the row height.
  const rowHeight = held.els[0]!.getBoundingClientRect().height;
  if (rowHeight <= 0) return;
  if (rowHeight > held.rowFloor + 0.5) {
    held.rowFloor = rowHeight;
    ul.style.gridAutoRows = `minmax(${rowHeight}px, 1fr)`;
  }

  const stride = rowHeight + gap;
  const margin = window.innerHeight * KEEP_SCREENS;
  const top = -rect.top - margin;
  const bottom = -rect.top + window.innerHeight + margin;
  const from = Math.max(0, Math.floor(top / stride)) * cols;
  const to = Math.min(held.els.length - 1, (Math.floor(bottom / stride) + 1) * cols - 1);

  const active = document.activeElement;
  let runStart = -1;
  let runReal = false;
  const flush = (end: number): void => {
    if (runStart >= 0) swapTiles(held, runStart, end, runReal);
    runStart = -1;
  };
  for (let i = 0; i < held.els.length; i++) {
    const want = i >= from && i <= to;
    if (want === (held.real[i] === 1)) {
      flush(i - 1);
      continue;
    }
    if (!want) {
      const el = held.els[i]!;
      // Kept: an ad (never asked for twice) and the tile the reader is in.
      if (el.classList.contains('ps-ad') || (active && el.contains(active))) {
        flush(i - 1);
        continue;
      }
    }
    if (runStart >= 0 && runReal !== want) flush(i - 1);
    if (runStart < 0) {
      runStart = i;
      runReal = want;
    }
  }
  flush(held.els.length - 1);
}

/** Swaps items from..to (inclusive) for their own markup (`real`) or for empty stand ins. */
function swapTiles(held: HeldList, from: number, to: number, real: boolean): void {
  if (!held.windowed) return;
  const count = to - from + 1;
  const html = real
    ? held.items.slice(from, to + 1).map((item) => held.render(item)).join('')
    : '<li class="tile-gone" aria-hidden="true"></li>'.repeat(count);
  const first = held.els[from]!;
  first.insertAdjacentHTML('beforebegin', html);
  const fresh: HTMLElement[] = [];
  for (let n = first.previousElementSibling; n && fresh.length < count; n = n.previousElementSibling) fresh.unshift(n as HTMLElement);
  for (let i = from; i <= to; i++) held.els[i]!.remove();
  if (fresh.length !== count) {
    // The markup did not give one element per item. Put nothing else in play.
    held.windowed = false;
    return;
  }
  for (let k = 0; k < count; k++) {
    held.els[from + k] = fresh[k]!;
    held.real[from + k] = real ? 1 : 0;
  }
  if (real) mountAds();
}

/**
 * Re-render for something that finished in the background (sign-in check,
 * wishlist load) without moving the reader: a plain render() rebuilds a long
 * list from its first chunk and they would lose their place mid-scroll.
 */
function renderInPlace(): void {
  // Mid-restore, the tiles have not been drawn yet and the one on screen is
  // only an estimate; the place being restored to is the true one.
  const anchor = restoringTo ? null : firstVisibleTile();
  const place = restoringTo ?? {
    scrollY: window.scrollY,
    anchorFrag: anchor?.dataset.frag ?? null,
    anchorTop: anchor ? Math.round(anchor.getBoundingClientRect().top) : 0,
  };
  render('update');
  restoreScroll(place);
}

/** The first product tile showing on screen, used to put the reader back on it. */
function firstVisibleTile(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('#view [data-frag]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) return el;
  }
  return null;
}

/**
 * Put a reader back where they left a list.
 *
 * Restored by the tile that was on screen, not by pixel offset: tiles are
 * `content-visibility: auto` (see .tile-grid in template.html), so after a
 * fresh render every tile not yet drawn is an estimated 260px and the same
 * pixel offset lands on a different product. The tile is found (painting
 * further chunks until it exists), then brought back to the same distance from
 * the top of the screen, and re-checked over the next two frames because
 * tiles drawn around it can still change size — Safari has no CSS scroll
 * anchoring to absorb that on its own.
 */
type ScrollPlace = Pick<ListSnapshot, 'scrollY' | 'anchorFrag' | 'anchorTop'>;
let restoringTo: ScrollPlace | null = null;
let restoreSeq = 0;

function restoreScroll(saved: ScrollPlace | null): void {
  ++restoreSeq;
  restoringTo = null;
  if (!saved || saved.scrollY < 1) {
    window.scrollTo({ top: 0 });
    return;
  }
  const find = () =>
    saved.anchorFrag
      ? document.querySelector<HTMLElement>(`#view [data-frag="${CSS.escape(saved.anchorFrag)}"]`)
      : null;
  let el = find();
  while (saved.anchorFrag && !el && appendChunksEverywhere()) el = find();

  if (!el) {
    const root = document.documentElement;
    while (saved.scrollY + window.innerHeight > root.scrollHeight && appendChunksEverywhere());
    window.scrollTo({ top: saved.scrollY });
    return;
  }
  const tile = el;
  const align = () => {
    if (tile.isConnected) window.scrollBy(0, tile.getBoundingClientRect().top - (saved.anchorTop ?? 0));
  };
  const token = ++restoreSeq;
  restoringTo = saved;
  align();
  window.requestAnimationFrame(() => {
    if (token !== restoreSeq) return;
    align();
    window.requestAnimationFrame(() => {
      if (token !== restoreSeq) return;
      align();
      restoringTo = null;
    });
  });
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
      if (!frag) {
        // A product with no current prices keeps its page and is kept off
        // search engines, the way a shop with nothing to show is (leafEmpty).
        const d = dormantEntry(state.fragranceId);
        return d
          ? {
              route,
              leafName: `${d.brand} ${d.name}${d.sizeMl ? ` ${d.sizeMl}ml` : ''}`,
              leafDetail: 'no shop has a current price for it, only its price history',
              leafEmpty: true,
            }
          : // Not here yet: a link to an absorbed product waits for the file that
            // says where it went, or is Page Not Found. Either way this address is
            // never a page of its own, so it is kept off search engines, and the
            // address that replaces it carries the product's real tags.
            { route, leafEmpty: true };
      }
      const rows = rowsFor(frag);
      const best = bestOffer(rows);
      // A pre-order is not stocked, so it is no part of "across N shops".
      const shops = rows.filter((r) => r.stock !== 'preOrder').length;
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
        legacyAddress: onLegacyProductAddress(),
      };
    }

    case 'retailer': {
      const r = getRetailer(state.retailerId);
      if (!r?.enabled) return { route };
      const count = listingCountAt(r.id);
      return {
        route,
        leafName: r.name,
        leafDetail: count > 0 ? `${count.toLocaleString('en-GB')} bottles` : undefined,
        leafEmpty: count === 0,
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

    // The profile's tab says "My Profile" only while the page does; signed
    // out, /account is the sign in form and its tab says Account.
    case 'account':
      return {
        route,
        leafName: accountState(accountStateInput()).kind === 'signedIn' && !state.authRecovery ? ACCOUNT_HEADINGS.account : undefined,
      };

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
    case 'detail':
      return state.fragranceId.startsWith(SLUG_PENDING)
        ? { name: 'product', param: state.fragranceId.slice(SLUG_PENDING.length), query: {} }
        : { name: 'fragrance', param: state.fragranceId, query: {} };
    case 'retailer': return { name: 'retailer', param: state.retailerId, query: {} };
    case 'brand': return { name: 'brand', param: slugify(state.brandProfile), query: {} };
    case 'note': return { name: 'note', param: slugify(state.noteName), query: {} };
    case 'legal': return { name: 'legal', param: state.legalId, query: {} };
    case 'notFound': return { name: 'notFound', param: state.notFoundPath, query: {} };
    case 'about': return { name: 'about', param: '', query: {} };
    case 'design': return { name: 'design', param: '', query: {} };
    case 'settings': return { name: 'settings', param: '', query: {} };
    case 'suggestions': return { name: 'suggestions', param: '', query: {} };
    case 'account': return { name: 'account', param: '', query: {} };
    case 'accountWishlist': return { name: 'accountWishlist', param: '', query: {} };
    case 'accountNotifications': return { name: 'accountNotifications', param: '', query: {} };
    case 'explore':
      // The Oils and Sets tabs keep their search, sort and filters in the
      // address, so a filtered list can be shared.
      return { name: state.tab as RouteName, param: '', query: isTabKind(state.tab) ? tabs.query(state.tab) : {} };
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
  // The Oils and Sets tabs have a search box of their own, whose words are in
  // the address as `q` too; they are not the bar's search.
  state.query = route.name === 'oils' || route.name === 'sets' ? '' : (route.query.q ?? '');

  switch (route.name) {
    case 'home': state.view = 'home'; return true;
    case 'notFound':
      state.notFoundPath = route.param;
      state.view = 'notFound';
      return true;
    case 'about': state.view = 'about'; return true;
    case 'design': state.view = 'design'; return true;
    case 'settings': state.view = 'settings'; return true;
    case 'suggestions': state.view = 'suggestions'; return true;
    case 'account': {
      state.view = 'account';
      const token = route.query[UNSUBSCRIBE_PARAM];
      if (token !== undefined) handleUnsubscribeLink(token);
      return true;
    }
    case 'accountWishlist': state.view = 'accountWishlist'; return true;
    case 'accountNotifications': state.view = 'accountNotifications'; return true;

    case 'search':
      // The bar search's results. There is no second search box under
      // Explore any more (owner request, 2026-10-03), so this is the only
      // search page there is.
      state.view = 'browse';
      // /gift-sets, an address that used to be a page of its own, arrives
      // here as this list with Gift Sets already chosen under Size (an alias
      // in demo/router.ts). Once drawn, the address is rewritten to /search
      // like any other, and the choice lives in the filter from then on.
      if (route.query.size === GIFT_SET_BAND.id) {
        state.facetVolume.add(GIFT_SET_BAND.id);
        // The panel is opened so the choice is in plain sight, not only a
        // badge on a closed Filters button.
        state.facetsOpen = true;
      }
      return true;

    // Deals is a top level view in its own right now, not a tab under
    // Explore, so it gets state.view set directly rather than falling into
    // the brands/retailers/notes case below that also sets state.tab.
    case 'deals': state.view = 'deals'; return true;

    case 'brands': case 'retailers': case 'notes':
      state.view = 'explore';
      state.tab = route.name as ExploreTab;
      return true;

    // The Oils and Sets tabs, whose search, sort and filters come with the address.
    case 'oils': case 'sets':
      state.view = 'explore';
      state.tab = route.name;
      tabs.fromQuery(route.name, route.query);
      return true;

    // The new address, /BRAND_NAME_VOLUME: the product the slug names, or the
    // same wait as an id that is not in the catalogue (openProduct).
    case 'product': {
      const live = fragranceBySlug(route.param);
      return openProduct(live ? live.id : `${SLUG_PENDING}${route.param}`);
    }
    // The old address, /fragrance/<id>: opens the product and is then rewritten
    // to its own address by syncUrl, with the head tags following (see
    // onLegacyProductAddress).
    case 'fragrance': return openProduct(route.param);
    case 'retailer': {
      // A shop that is switched off has no page: its old address is Page Not
      // Found, the same as an id that was never in the registry. (Ten shops
      // were switched off by the owner on 2026-10-04; their pages come back
      // with `enabled: true`.)
      if (!getRetailer(route.param)?.enabled) return false;
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
 * Opens a product page for an id, or for `slug:<slug>` while a product address
 * is waiting for the file of pages with no current prices. Returns false for an
 * address that names nothing.
 */
function openProduct(param: string): boolean {
  if (!fragranceById(param)) {
    // Not in the catalogue. It may still be a product with no current
    // prices, which keeps its page (src/catalogue/dormantProducts.ts); that
    // list is a file fetched on demand, so until it has arrived the page
    // holds open and settles afterwards (dormantDetailView).
    const known = dormant.current();
    if (known !== null ? !dormantEntry(param) && absorbedLanding(param) === null : dormant.status() === 'failed') return false;
  }
  state.fragranceId = param;
  // An address a merge absorbed: once the file is in, it opens the product
  // that holds it, and the address bar is rewritten to that product's.
  const landing = fragranceById(param) || dormantEntry(param) ? null : absorbedLanding(param);
  if (landing !== null) {
    state.fragranceId = landing;
    queueMicrotask(() => syncUrl('replace'));
  }
  state.view = 'detail';
  return true;
}

/**
 * The one click unsubscribe link from a price drop email lands on
 * /account?unsubscribe=<token>. Works signed out: the token alone is the
 * credential (supabase/migrations/0004_price_alerts.sql). The token is dropped
 * from the address bar straight away, since currentRoute() never carries it,
 * so it does not linger in history or get shared by accident.
 */
function handleUnsubscribeLink(token: string): void {
  queueMicrotask(() => syncUrl('replace'));
  unsubscribe(token).then((outcome) => {
    if (outcome === 'done' && state.priceAlerts !== null) state.priceAlerts = false;
    const m = unsubscribeMessage(outcome);
    void showDialog({ title: m.title, message: m.message, ok: m.ok });
    renderInPlace();
  });
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

/**
 * Whether the address bar holds the old /fragrance/<id> address of a product.
 * That address still opens the product (it is in shared links, bookmarks, old
 * emails and posts) and is rewritten to the product's own address straight
 * away; until it is, the page asks search engines to leave it out.
 */
function onLegacyProductAddress(): boolean {
  const path = window.location.pathname.slice(basePath().replace(/\/$/, '').length);
  return path.startsWith('/fragrance/');
}

/** Push the current state onto history, or replace the top of it. */
function syncUrl(mode: 'push' | 'replace' = 'push'): void {
  // The ad layout preview stays on the address while it is on, so a reload
  // keeps it (withAdPreview in demo/ads.ts; the page itself is noindex then).
  const url = basePath().replace(/\/$/, '') + withAdPreview(routeToPath(currentRoute()));
  const current = window.location.pathname + window.location.search;
  if (url === current) return;
  const depth = mode === 'push' ? historyDepth() + 1 : historyDepth();
  const wasLegacy = onLegacyProductAddress();
  try {
    window.history[mode === 'push' ? 'pushState' : 'replaceState']({ depth }, '', url);
    // The page was drawn while the old /fragrance/<id> address was in the bar,
    // so its head said noindex. The address is the product's own now: say so.
    if (wasLegacy && !onLegacyProductAddress()) applyHead(headFor(headInputForState()));
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
    case 'detail': {
      if (state.query || state.brand) return { name: 'search', param: '', query: state.query ? { q: state.query } : {} };
      // A set or an oil opened from a link goes back to its own tab, which is
      // where a reader looking at one most likely came from.
      const frag = fragranceById(state.fragranceId);
      if (frag && isSet(frag)) return { name: 'sets', param: '', query: {} };
      if (frag && isOil(frag)) return { name: 'oils', param: '', query: {} };
      return { name: 'home', param: '', query: {} };
    }
    case 'retailer': return { name: 'retailers', param: '', query: {} };
    case 'brand': return { name: 'brands', param: '', query: {} };
    case 'note': return { name: 'notes', param: '', query: {} };
    // Legal documents are linked from the About page now (they left
    // Settings in the 2026-10-04 revamp), so that is the level above them.
    case 'legal':
      return { name: 'about', param: '', query: {} };
    // The wishlist and notifications pages sit under the profile, which
    // links to both; the profile itself sits under home, since the menu
    // that opens it is on every page.
    case 'accountWishlist':
    case 'accountNotifications':
      return { name: 'account', param: '', query: {} };
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
      { name: '--ok-sf', role: 'Its ground, for the lowest price box under a fragrance' },
      { name: '--warn', role: 'Low stock, a countdown' },
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
    title: 'Rank Badges',
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
  { fg: '--ok', bg: '--ok-sf', use: 'The price in the lowest price box' },
  { fg: '--ink-2', bg: '--ok-sf', use: 'The shop line in the lowest price box' },
  { fg: '--warn', bg: '--surface', use: 'Low stock, on a card' },
];

/** The eight type roles, in the order the stylesheet declares them. */
const DS_TYPE_ROLES: { cls: string; sample: string; role: string }[] = [
  { cls: 't-page', sample: 'Page Title', role: 'One per view, at the top. Title Case, like every label' },
  { cls: 't-section', sample: 'Section Heading', role: 'Separates blocks with space, not decoration' },
  { cls: 't-title', sample: 'Card and Row Title', role: 'A fragrance, a brand and a shop are the same kind of object' },
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
  { name: 'ICON_SHARE', svg: ICON_SHARE },
  { name: 'ICON_COPY', svg: ICON_COPY },
  { name: 'ICON_TICK', svg: ICON_TICK },
  { name: 'ICON_MORE', svg: ICON_MORE },
  { name: 'ICON_WHATSAPP', svg: ICON_WHATSAPP },
  { name: 'ICON_SNAPCHAT', svg: ICON_SNAPCHAT },
  { name: 'ICON_X', svg: ICON_X },
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
      <h3 class="ds-group-title t-eyebrow">${esc(g.title)}</h3>
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
      <h1 class="t-page">Design System</h1>
      <p class="t-body">Every value on this page was read out of the live stylesheet at the
        moment the page rendered. The swatches are painted with the tokens themselves and the
        text samples are real elements carrying the real classes, so nothing here is a copy of
        anything and nothing here can quietly stop being true. Change a value in
        demo/template.html and this page changes with it.</p>

      <section class="ds-section">
        <h2 class="t-section">Theme</h2>
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
        <h2 class="t-section">Colour</h2>
        ${colour}
      </section>

      <section class="ds-section">
        <h2 class="t-section">Contrast, Measured Now</h2>
        <p class="t-body">Computed in the browser from the two tokens named on each row, in
          whichever theme is showing. AA asks 4.5:1 of text and 3:1 of a graphic; every pair here
          is held to the text bar. A row that fails says so rather than being left off the list.</p>
        <div class="ds-table">${contrast}</div>
      </section>

      <section class="ds-section">
        <h2 class="t-section">Type</h2>
        <p class="t-body">Eight roles, one size, weight and tracking each. The specification
          beside each sample is read off the sample itself.</p>
        <div class="ds-table ds-type-table">${type}</div>
        ${dsTokenTable(DS_FONTS, false)}
      </section>

      <section class="ds-section">
        <h2 class="t-section">Space and Layout</h2>
        ${dsTokenTable(DS_CONSTANTS, false)}
        <p class="t-caption ds-gap">There is no radius or spacing scale to read: corner radii and
          gaps are written as literals where they are used. Naming that here rather than inventing
          a scale nothing refers to, because a token no rule uses would be the same kind of
          fiction this page exists to prevent.</p>
      </section>

      <section class="ds-section">
        <h2 class="t-section">Elevation</h2>
        <p class="t-body">One level, and it is for things that genuinely float: the dialog and the
          chart's own tooltip. Cards, tiles, badges and the price box carried it too until
          17 Aug 2026; each of them already had a border or a ground of its own doing the same
          job, so the shadow was the separation drawn twice. The sample below is the token
          itself, not a picture of it.</p>
        <div class="ds-lift-demo"><span class="ds-lift">Dialog</span></div>
        ${dsTokenTable(DS_ELEVATION, false)}
      </section>

      <section class="ds-section">
        <h2 class="t-section">Motion</h2>
        <p class="t-body">Four durations and two curves. Motion explains a change of state, never
          arrival, and nothing animates a price.</p>
        ${dsTokenTable(DS_MOTION, false)}
      </section>

      <section class="ds-section">
        <h2 class="t-section">Icons</h2>
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

/**
 * Draw the current view. `update` is for the same page changing in place — a
 * filter, a sort, a background load — and skips the rise: behaviour 1 is
 * content entering a view, and replaying it on every filter tap made the whole
 * page flicker and cost a full animation pass each time.
 */
function render(mode: 'enter' | 'update' = 'enter'): void {
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
                          : state.view === 'suggestions'
                            ? suggestionsView()
                          : state.view === 'account'
                            ? accountView()
                            : state.view === 'accountWishlist'
                              ? accountWishlistView()
                              : state.view === 'accountNotifications'
                                ? accountNotificationsView()
                            : state.view === 'notFound'
                              ? notFoundView()
                              : legalView();

  // What this page tells a search engine it is. Applied on every render
  // because the site is one document: without this, /fragrance/ean-123 and
  // /brands and every one of the 12,000-odd product pages carry the title,
  // description and — worst — the canonical URL of the homepage, which is an
  // instruction not to index them. See demo/head.ts for what this does and
  // does not reach.
  applyHead(withPreviewNoindex(headFor(headInputForState()), adPreviewOn()));

  // The wrapper is a fresh element on every render, so the rise it carries
  // just plays on insertion. No JS animation retriggering needed. It is the
  // design system's own .ps-rise (behaviour 1: content entering a view), not
  // a class of its own — this is the one block on the page that rises, and
  // one rise per block is the whole rule.
  $('#view').innerHTML = `<div${mode === 'enter' ? ' class="ps-rise"' : ''}>${body}</div>`;

  // Any list that emitted a sentinel now gets its observer. Done here rather
  // than inside each view so no view has to remember to do it.
  mountChunkedList();

  // Ad slots this page drew, if ads are on (a no op otherwise).
  mountAds();

  // The design page's read-back values, which can only be read once its
  // markup is in the DOM. A no-op anywhere else.
  mountDesignSpecs();

  // The sub nav belongs to Explore and its leaves, and appears nowhere else.
  const inExplore =
    state.view === 'explore' || state.view === 'retailer' || state.view === 'brand' || state.view === 'note';
  const subnav = $('#subnav') as HTMLElement;
  subnav.hidden = !inExplore;
  // Redrawn only when the tab changes. A filter or a sort changes the list under
  // the row and nothing in it, and redrawing it (then measuring it, below) made the
  // browser lay the whole page out an extra time on every filter change.
  const subnavKey = inExplore ? state.tab : '';
  if (subnav.dataset.drawn !== subnavKey) {
    subnav.dataset.drawn = subnavKey;
    subnav.innerHTML = inExplore
      ? TABS.map(
          (t) => `<button class="subnavbtn ${state.tab === t.id ? 'on' : ''}" data-tab="${t.id}">${t.label}</button>`,
        ).join('')
      : '';
    // Five tabs fit a phone 360px wide and up; on a narrower one the row scrolls,
    // and the tab the reader is on is brought into view rather than left off the
    // end of it. Set directly on the row, so the page itself never scrolls.
    const here = subnav.querySelector<HTMLElement>('.subnavbtn.on');
    if (here && !subnav.hidden) {
      const overhang = here.getBoundingClientRect().right - subnav.getBoundingClientRect().left - subnav.clientWidth;
      if (overhang > 0) subnav.scrollLeft += Math.ceil(overhang);
    }
  }

  ($('#nav-home') as HTMLElement).classList.toggle('on', state.view === 'home');
  ($('#nav-deals') as HTMLElement).classList.toggle('on', state.view === 'deals');
  ($('#nav-explore') as HTMLElement).classList.toggle('on', inExplore || state.view === 'browse');
  ($('#nav-about') as HTMLElement).classList.toggle('on', state.view === 'about');
  // Settings and the account pages are reached from the account menu at the
  // top right now, not from this row; its button carries the "you are here".
  syncAccountButton();

  mountTrustpilotWidgets();
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
  // The page being left keeps its filters, sorts and scroll on its own history
  // entry, so Back restores it (see the popstate handler). The page being
  // opened is a different list, so it starts clean.
  rememberListState();
  clearFacets();
  state.view = view;
  render();
  syncUrl('push');
  window.scrollTo({ top: 0 });
}

function openExplore(tab: ExploreTab): void {
  state.tab = tab;
  // A tab opened from the bar starts clean, like every list: what was chosen
  // before comes back only with Back (rememberListState) or a shared link.
  if (isTabKind(tab)) tabs.reset(tab);
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
  // `?adpreview=1` draws every ad slot as a labelled frame, for this page view
  // only: held in memory, never stored. Set before anything draws.
  setAdPreview(adPreviewRequested(window.location.search));
  // Every address the app builds for a product goes through routeToPath, which
  // finds the product's slug here (demo/router.ts, docs/PRODUCT-URLS.md).
  setProductSlugLookup(slugOfProduct);
  installAds();
  loadMode();
  loadLayout();
  loadPerRow();
  // The very first render happens synchronously below, before either of
  // these callbacks can possibly fire — accountView's own `!state.authChecked`
  // branch, and wishlistButton's own `!state.authChecked` branch, are what
  // cover that gap rather than this holding up startup for every page.
  // Whose photo state holds, so a token refresh does not fetch it again.
  let photoOwner: string | null = null;
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
      state.authResetSent = false;
    } else {
      state.authRecovery = false;
    }
    if (user && isVerified(user)) {
      loadWishlist();
      loadPriceAlerts();
      // Once per reader: a token refresh fires this again for the same
      // account, and the photo it already holds is still the right one.
      if (photoOwner !== user.id) {
        clearPhoto();
        photoOwner = user.id;
        loadPhoto();
      }
    } else {
      clearPhoto();
      photoOwner = null;
      // A different reader may be signing in on the same device, or this one
      // just signed out — either way, the previous session's saved ids must
      // not linger and render as if they belonged to whoever is here now.
      state.wishlistIds = new Set();
      state.wishlistEntries = [];
      state.wishlistLines = [];
      state.wishlistLoaded = false;
      state.priceAlerts = null;
      state.priceAlertsLoaded = false;
    }
    renderInPlace();
  };
  currentUser().then(handleAuthUser);
  // Fires on every sign in, sign out and token refresh, including the tab
  // that just followed a verification link back in — see its own comment in
  // auth.ts for why nothing here needs to poll for that.
  onAuthChange(handleAuthUser);
  onPasswordRecovery(() => {
    state.authRecovery = true;
    if (state.view !== 'account') go('account');
    else renderInPlace();
  });
  // The other half of "the tab that just followed a link back in": if that
  // link did NOT produce a session — expired, already used, or (see
  // supabase.ts's flowType comment) opened in a browser without a stored
  // PKCE verifier — nothing above fires at all, and the reader would
  // otherwise land on /account looking exactly like a fresh, signed out
  // visit. See auth.ts's checkEmailLinkCallback for why that was silent
  // until now.
  checkEmailLinkCallback().then((message) => {
    if (message) void showDialog({ title: 'That Link Did Not Work', message });
  });

  // The bar search is the one search box on the site: type a name, get
  // results. Explore carried a second, bigger one on a Search tab until the
  // owner asked for it to go (2026-10-03).
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

  // ── the account menu (see openAccountMenu) ──────────────────────────────
  const accountBtn = $('#account-btn') as HTMLElement;
  fillAccountMenu();
  accountBtn.addEventListener('click', () => {
    if (state.accountMenuOpen) closeAccountMenu(true);
    else openAccountMenu('first');
  });
  accountBtn.addEventListener('keydown', (e) => {
    // The menu button pattern: Down or Up opens the menu with focus on the
    // first or last item. Enter and Space are the button's own click.
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openAccountMenu(e.key === 'ArrowDown' ? 'first' : 'last');
    }
  });
  const accountPop = $('#account-pop') as HTMLElement;
  accountPop.addEventListener('keydown', (e) => {
    const items = accountMenuItemsEls();
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      closeAccountMenu(true);
      return;
    }
    if (next >= 0 && items[next]) {
      e.preventDefault();
      items[next]!.focus();
    }
  });
  accountPop.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-acct-action]');
    if (!item) return;
    // Focus goes to the page that opens, not back to the button: the reader
    // chose somewhere to go. Sign Out stays put, so focus returns to the
    // button there.
    const action = item.getAttribute('data-acct-action') as AccountMenuAction;
    closeAccountMenu(action === 'signOut');
    runAccountAction(action);
    if (action !== 'signOut') ($('#view') as HTMLElement).focus({ preventScroll: true });
  });
  ($('#account-menu-back') as HTMLElement).addEventListener('click', () => closeAccountMenu(true));
  // Esc from anywhere while it is open (focus may have been moved out by a
  // pointer), and a click anywhere outside the button and the menu.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.accountMenuOpen) closeAccountMenu(true);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!state.accountMenuOpen) return;
    const t = e.target as HTMLElement;
    if (t.closest('#account-pop') || t.closest('#account-btn')) return;
    closeAccountMenu(false);
  });
  // Tabbing on past the last item (or back before the button) leaves the
  // menu, and the menu closes behind it rather than hanging open over the
  // page. Nothing is trapped.
  ($('.acct') as HTMLElement).addEventListener('focusout', (e) => {
    const to = (e as FocusEvent).relatedTarget as HTMLElement | null;
    if (!state.accountMenuOpen || !to) return;
    if (to.closest('.acct')) return;
    closeAccountMenu(false);
  });

  // ── the country and currency menu (see openRegionMenu) ──────────────────
  const regionBtn = $('#region-btn') as HTMLElement;
  fillRegionMenu();
  regionBtn.addEventListener('click', () => {
    if (state.regionMenuOpen) closeRegionMenu(true);
    else openRegionMenu('first');
  });
  regionBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openRegionMenu(e.key === 'ArrowDown' ? 'first' : 'last');
    }
  });
  const regionPop = $('#region-pop') as HTMLElement;
  regionPop.addEventListener('keydown', (e) => {
    const items = regionMenuItemsEls();
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      closeRegionMenu(true);
      return;
    } else if (e.key === 'Enter' || e.key === ' ') {
      // The one active item is the choice already made: closing is all it
      // does. A greyed out item does nothing at all.
      e.preventDefault();
      const item = document.activeElement as HTMLElement | null;
      if (item && item.getAttribute('aria-disabled') !== 'true') closeRegionMenu(true);
      return;
    }
    if (next >= 0 && items[next]) {
      e.preventDefault();
      items[next]!.focus();
    }
  });
  regionPop.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-region]');
    if (!item || item.getAttribute('aria-disabled') === 'true') return;
    closeRegionMenu(true);
  });
  ($('#region-menu-back') as HTMLElement).addEventListener('click', () => closeRegionMenu(true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.regionMenuOpen) closeRegionMenu(true);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!state.regionMenuOpen) return;
    const t = e.target as HTMLElement;
    if (t.closest('#region-pop') || t.closest('#region-btn')) return;
    closeRegionMenu(false);
  });
  ($('#region') as HTMLElement).addEventListener('focusout', (e) => {
    const to = (e as FocusEvent).relatedTarget as HTMLElement | null;
    if (!state.regionMenuOpen || !to) return;
    if (to.closest('#region')) return;
    closeRegionMenu(false);
  });

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
  // A profile photo that will not show (a damaged file, a blob address that
  // has gone) falls back to the initial, in the button and on the profile.
  // Captured, because an image's error event does not bubble.
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.hasAttribute('data-acct-photo') && !state.photoBroken) {
      state.photoBroken = true;
      renderInPlace();
    }
  }, true);

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

    // The Share button on a product page or a wishlist row. On a wishlist row it
    // is a sibling of the row's button, so it never reaches the data-frag
    // handler below.
    const shareBtn = t.closest<HTMLElement>('[data-share]');
    if (shareBtn) {
      e.preventDefault();
      openShareDialog(shareBtn.getAttribute('data-share')!, shareBtn);
      return;
    }

    if (t.closest('[data-report-price]')) {
      openWrongPriceDialog();
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

    // The Trustpilot consent button — see trustpilotWidget(). Delegated like
    // everything else because the retailer page re-renders.
    const tpShow = t.closest<HTMLElement>('[data-tp-show]');
    if (tpShow) {
      showTrustpilot(tpShow);
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

    // Links between the account pages (the profile's shortcuts, the notes on
    // the wishlist and notifications pages). Same actions as the menu's.
    const acctGo = t.closest<HTMLElement>('[data-acct-go]');
    if (acctGo) {
      runAccountAction(acctGo.getAttribute('data-acct-go') as AccountMenuAction);
      return;
    }

    if (t.closest('#acct-download')) {
      downloadMyData().catch(() => {
        void showDialog({ title: 'Could Not Make the File', message: 'Your data could not be read just now. Please try again.' });
      });
      return;
    }

    const authTabBtn = t.closest('[data-auth-tab]');
    if (authTabBtn) {
      state.authTab = authTabBtn.getAttribute('data-auth-tab') as AuthTab;
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
      state.authTab = 'signIn';
      render();
      return;
    }

    const resendBtn = t.closest('#auth-resend');
    if (resendBtn) {
      const email = resendBtn.getAttribute('data-email') ?? '';
      const notice = $('#auth-notice') as HTMLElement;
      resendVerification(email).then((result) => {
        if (!result.ok) {
          void showDialog({ title: 'Could Not Resend the Email', message: result.message });
          return;
        }
        notice.textContent = 'Sent. Check your inbox again in a moment.';
        notice.hidden = false;
      });
      return;
    }

    if (t.closest('#auth-forgot')) {
      const email = ($('#auth-email') as HTMLInputElement | null)?.value.trim() ?? '';
      if (!email) {
        void showDialog({ title: 'Enter Your Email First', message: 'Type your email address above, then tap Forgot your password again.' });
        return;
      }
      requestPasswordReset(email).then((result) => {
        if (!result.ok) {
          void showDialog({ title: 'Could Not Send the Reset Link', message: result.message });
          return;
        }
        state.authResetSent = true;
        renderInPlace();
      });
      return;
    }

    if (t.closest('#auth-delete')) {
      const withPhoto = state.photoPath !== null;
      void showDialog({
        title: 'Delete Your Account?',
        message: `This permanently deletes your account, your wishlist${withPhoto ? ' and your profile photo' : ''}. It cannot be undone.`,
        confirmLabel: 'Delete Account',
        danger: true,
      }).then(async (yes) => {
        if (!yes) return;
        // The photo first, with the reader's own session: stored files do not
        // go with the account on their own (see migration 0006). If it cannot
        // be removed, the account stays, so no photo is ever left behind
        // without an account to remove it from.
        if (!(await removePhotoForDeletion())) {
          void showDialog({
            title: 'Account Not Deleted',
            message: 'Your profile photo could not be deleted, so your account has been kept as it is. Please try again.',
          });
          return;
        }
        const result = await deleteOwnAccount(COMPANY.feedbackEmail);
        if (!result.ok) {
          // The photo is already gone; say so on the page rather than show it.
          if (withPhoto) {
            state.photoPath = null;
            setPhotoBlob(null);
            renderInPlace();
          }
          void showDialog({ title: 'Account Not Deleted', message: result.message });
          return;
        }
        void showDialog({
          title: 'Account Deleted',
          message: `Your account, wishlist${withPhoto ? ' and profile photo have' : ' have'} been deleted.`,
          ok: true,
        });
      });
      return;
    }

    if (t.closest('#acct-photo-pick')) {
      document.querySelector<HTMLInputElement>('#acct-photo-input')?.click();
      return;
    }

    if (t.closest('#acct-photo-remove')) {
      void showDialog({
        title: 'Remove Your Photo?',
        message: 'Your profile photo will be deleted and your initial shown instead.',
        confirmLabel: 'Remove Photo',
        danger: true,
      }).then(async (yes) => {
        if (!yes) return;
        state.photoBusy = true;
        renderInPlace();
        const result = await removePhoto();
        state.photoBusy = false;
        if (!result.ok) {
          void showDialog({ title: 'Photo Not Removed', message: result.message });
        } else {
          state.photoPath = null;
          setPhotoBlob(null);
        }
        renderInPlace();
      });
      return;
    }

    const wishlistRemoveBtn = t.closest('[data-wishlist-remove]');
    if (wishlistRemoveBtn) {
      // The ids as saved of every row on the line (more than one where saved
      // ids merged into one product), space separated: ids never hold a space.
      const savedIds = wishlistRemoveBtn.getAttribute('data-wishlist-remove')!.split(' ').filter(Boolean);
      state.wishlistEntries = state.wishlistEntries.filter((e) => !savedIds.includes(e.fragranceId));
      refreshWishlistLines();
      render();
      removeSavedRows(savedIds).then((result) => {
        if (!result.ok) {
          void showDialog({ title: 'Could Not Update Your Wishlist', message: result.message ?? 'Please try again.' });
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
      // The cheapest delivered price today goes in with the save, so the
      // wishlist can say how far it has moved since. Null where there is none
      // (sold out everywhere, or no delivery stated), and then none is kept.
      const savingFrag = fragranceById(fragranceId);
      const savedAt = savingFrag ? wishlistPriceFacts(savingFrag).sortGbp : null;
      const action = saved ? removeSavedRows(savedIdsFor(fragranceId)) : addToWishlist(fragranceId, null, savedAt);
      action.then((result) => {
        state.wishlistBusy = false;
        if (!result.ok) {
          void showDialog({ title: 'Could Not Update Your Wishlist', message: result.message ?? 'Please try again.' });
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
      render('update');
      rememberListStateSoon();
      return;
    }

    if (t.closest('[data-tab-facets-toggle]') && isTabKind(state.tab)) {
      tabs.toggleOpen(state.tab);
      render('update');
      rememberListStateSoon();
      return;
    }

    if (t.closest('[data-tab-facets-clear]') && isTabKind(state.tab)) {
      tabs.clearFilters(state.tab);
      render('update');
      syncUrl('replace');
      rememberListStateSoon();
      return;
    }

    if (t.closest('[data-facets-toggle]')) {
      state.facetsOpen = !state.facetsOpen;
      render('update');
      rememberListStateSoon();
      return;
    }

    if (t.closest('[data-facets-clear]')) {
      clearFacets();
      state.facetsOpen = true; // stay open — the reader is mid-filtering, not leaving the page
      render('update');
      rememberListStateSoon();
      return;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    const id = t.id;
    if (id === 'acct-photo-input') {
      const input = t as HTMLInputElement;
      const file = input.files?.[0];
      // Cleared straight away so choosing the same file again still fires.
      input.value = '';
      if (file) void addProfilePhoto(file);
      return;
    }
    if (id === 'price-alerts') {
      const box = t as HTMLInputElement;
      const on = box.checked;
      box.disabled = true;
      setPriceAlerts(on).then((result) => {
        if (!result.ok) {
          void showDialog({ title: 'Price Alerts Not Changed', message: result.message ?? 'Please try again.' });
        } else {
          state.priceAlerts = on;
          if (on) {
            void showDialog({
              title: 'Price Alerts Are On',
              message: 'We will email you when a saved fragrance gets cheaper. You can also set a target price for each one on My Wishlist.',
              ok: true,
            });
          }
        }
        renderInPlace();
      });
      return;
    }
    const targetFragId = t.getAttribute('data-wishlist-target');
    if (targetFragId) {
      const input = t as HTMLInputElement;
      const parsed = parseTargetPrice(input.value);
      if (!parsed.ok) {
        void showDialog({ title: 'Check the Target Price', message: 'Type an amount in pounds, such as 45 or 45.50, or leave it blank.' });
        return;
      }
      const entry = state.wishlistEntries.find((x) => x.fragranceId === targetFragId);
      const typed = parsed.value;
      setTargetPrice(targetFragId, parsed.value).then((result) => {
        if (!result.ok) {
          void showDialog({ title: 'Target Price Not Saved', message: result.message ?? 'Please try again.' });
          return;
        }
        if (entry) entry.targetPriceGbp = typed;
        refreshWishlistLines();
        input.value = parsed.value === null ? '' : parsed.value.toFixed(2);
      });
      return;
    }
    const value = (t as HTMLSelectElement).value;
    // The Oils and Sets tabs: each filter and the sort is in its address.
    if (state.view === 'explore' && isTabKind(state.tab) && (id === TAB_SORT_ID || id.startsWith(facetSelectId('')))) {
      if (id === TAB_SORT_ID) tabs.setSort(state.tab, value);
      else {
        const box = t as HTMLInputElement;
        tabs.setFacet(state.tab, id.slice(facetSelectId('').length), box.type === 'checkbox' ? (box.checked ? '1' : '') : value);
      }
      // The address first: the browser saves the scroll position when it changes, and
      // doing that after the list is redrawn made it lay the whole page out again.
      syncUrl('replace');
      render('update');
      rememberListStateSoon();
      return;
    }
    if (id === 'brand-sort') state.brandSort = value as BrandSort;
    else if (id === 'brand-filter') state.brandFilter = value as BrandFilter;
    else if (id === 'deal-sort') state.dealSort = value as DealSort;
    else if (id === 'note-sort') state.noteSort = value as NoteSort;
    else if (id === 'note-layer') state.noteLayer = value as NoteLayerFilter;
    else if (id === 'browse-sort') state.browseSort = value as BrowseSort;
    else if (id === 'note-detail-sort') state.noteDetailSort = value as ListSort;
    else if (id === 'brand-detail-sort') state.brandDetailSort = value as ListSort;
    else if (id === 'retailer-detail-sort') state.retailerDetailSort = value as ListSort;
    else if (id === 'wishlist-sort') state.wishlistSort = value as WishlistSort;
    else if (id === 'retailer-in-stock') state.retailerInStockOnly = (t as HTMLInputElement).checked;
    else if (id === 'facet-on-sale') state.facetOnSale = (t as HTMLInputElement).checked;
    else if (id === 'facet-in-stock') state.facetInStock = (t as HTMLInputElement).checked;
    else if (id === FACET_SELECT_ID.volume) state.facetVolume = new Set(value ? [value as VolumeBand] : []);
    else if (id === FACET_SELECT_ID.concentration) state.facetConcentration = new Set(value ? [value as ConcentrationGroup] : []);
    else if (id === FACET_SELECT_ID.gender) state.facetGender = new Set(value ? [value as GenderReading] : []);
    else if (id === FACET_SELECT_ID.priceBand) state.facetPriceBand = new Set(value ? [value as PriceBand] : []);
    else if (id === FACET_SELECT_ID.tier) state.facetTier = new Set(value ? [value as RetailerTier] : []);
    else if (id === 'per-row') {
      // The grid reads a CSS variable, so the columns reflow without a
      // re-render. Returning early also keeps the search box from losing
      // focus mid-typing on the search panel.
      setPerRow(Number(value));
      return;
    } else return;
    render('update');
    rememberListStateSoon();
  });

  // The search box at the top of the Oils and Sets tabs. Typing replaces the
  // address rather than pushing one, like the bar search (one history entry per
  // keystroke would make Back a character by character undo), and the box is
  // given back its focus and caret, because the draw replaces the whole page.
  document.addEventListener('input', (e) => {
    const box = e.target as HTMLInputElement;
    if (box.id !== TAB_SEARCH_ID || !isTabKind(state.tab)) return;
    const caret = box.selectionStart ?? box.value.length;
    tabs.setQuery(state.tab, box.value);
    render('update');
    syncUrl('replace');
    rememberListStateSoon();
    const fresh = document.getElementById(TAB_SEARCH_ID) as HTMLInputElement | null;
    if (fresh) {
      fresh.focus({ preventScroll: true });
      fresh.setSelectionRange(caret, caret);
    }
  });

  // There is no server behind this page, so "send" means handing the message to
  // the reader's own email app, not silently claiming it reached us. The
  // confirmation says exactly that rather than pretending we received it.
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLElement;
    if (form.id === 'suggest-form') {
      e.preventDefault();
      const suggestion = ($('#suggest-body') as HTMLTextAreaElement).value.trim();
      const name = ($('#suggest-name') as HTMLInputElement).value.trim();
      const email = ($('#suggest-email') as HTMLInputElement).value.trim();
      const subject = `PriceSniffs: A suggestion`;
      const body = [
        suggestion,
        name ? `\nFrom: ${name}` : '',
        email ? `Reply to: ${email}` : '',
      ].filter(Boolean).join('\n');
      const mailto = `mailto:${COMPANY.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;

      const confirm = $('#suggest-confirm') as HTMLElement;
      confirm.textContent = `Your email app should now be open with your suggestion. Press send there to reach us. Thank you.`;
      confirm.hidden = false;
      return;
    }
    if (form.id === 'auth-recovery-form' || form.id === 'auth-change-password-form') {
      e.preventDefault();
      const fields = form as HTMLFormElement;
      const password = (fields.elements.namedItem('password') as HTMLInputElement).value;
      const confirm = (fields.elements.namedItem('confirm') as HTMLInputElement).value;
      if (password !== confirm) {
        void showDialog({ title: 'Passwords Do Not Match', message: 'Type the same new password in both boxes.' });
        return;
      }
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      submit.disabled = true;
      updatePassword(password).then((result) => {
        submit.disabled = false;
        if (!result.ok) {
          void showDialog({ title: 'Password Not Changed', message: result.message });
          return;
        }
        fields.reset();
        state.authRecovery = false;
        renderInPlace();
        void showDialog({ title: 'Password Changed', message: 'Use your new password next time you sign in.', ok: true });
      });
      return;
    }
    if (form.id === 'auth-change-email-form') {
      e.preventDefault();
      const fields = form as HTMLFormElement;
      const email = (fields.elements.namedItem('email') as HTMLInputElement).value.trim();
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      submit.disabled = true;
      updateEmail(email).then((result) => {
        submit.disabled = false;
        if (!result.ok) {
          void showDialog({ title: 'Email Not Changed', message: result.message });
          return;
        }
        fields.reset();
        void showDialog({
          title: 'Check Your Inbox',
          message: `We sent a confirmation link to ${email}. Your sign in email changes only once you follow it. You may also be asked to confirm from your current address.`,
          ok: true,
        });
      });
      return;
    }
    if (form.id === 'auth-signin-form' || form.id === 'auth-signup-form') {
      e.preventDefault();
      const email = ($('#auth-email') as HTMLInputElement).value.trim();
      const password = ($('#auth-password') as HTMLInputElement).value;
      // The button is disabled in place rather than by re-rendering, so the
      // typed email and password are still there if the attempt fails.
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      submit.disabled = true;
      state.authBusy = true;
      state.authResetSent = false;
      const action = form.id === 'auth-signup-form' ? signUp(email, password) : signIn(email, password);
      action.then((result) => {
        state.authBusy = false;
        submit.disabled = false;
        if (!result.ok) {
          if (result.reason === 'unverified') {
            // Not a dead end: this reader has an account and needs the link
            // resent. Putting them on the verification screen puts them in
            // front of the Resend button, which is what the mapped message
            // ("request a new one below") was already telling them to use —
            // and which, before this, was not rendered anywhere they could
            // reach, since Supabase issues no session on a rejected sign in.
            state.authPendingEmail = email;
            render();
          } else {
            void showDialog({
              title: form.id === 'auth-signup-form' ? 'Could not create your account' : 'Could not sign you in',
              message: result.message,
            });
          }
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
    confirm.textContent = `Your email app should now be open with your ${type.toLowerCase()}. Press send there to reach us. Thank you.`;
    confirm.hidden = false;
  });

  // Back and Forward must move within the app, not out of it. popstate is the
  // only place the address bar is the source of truth: it has already changed
  // by the time this fires, so state follows it rather than the other way
  // round, and nothing is pushed in response or the history would grow on
  // every Back press.
  //
  // The entry being returned to carries the filters, sorts and scroll it was
  // left with (see rememberListState). One with none — never left via go(),
  // or saved before this existed — starts clean rather than inheriting
  // whatever the page just left had set.
  window.addEventListener('popstate', (e) => {
    const saved = (e.state as { list?: ListSnapshot } | null)?.list;
    if (saved) restoreListState(saved);
    else clearFacets();
    renderFromUrl();
    restoreScroll(saved ?? null);
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

  // A long list keeps only the tiles near the screen (keepNearTiles), so a
  // scroll or a resize asks which those are now. Passive, and one frame at a time.
  window.addEventListener('scroll', scheduleKeepNear, { passive: true });
  window.addEventListener('resize', scheduleKeepNear, { passive: true });

  toTop.addEventListener('click', () => {
    // Smooth unless the reader has asked for less motion, in which case a
    // long smooth scroll is exactly the thing they turned off.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // Focus follows the scroll, or a keyboard reader is returned to the top
    // of the page visually while their tab position stays at the bottom.
    ($('#view') as HTMLElement).focus();
  });

  // The home banner is as wide as the window (see .marquee in the stylesheet)
  // and needs the vertical scrollbar's width to end where the page does.
  // Watching the root's own size catches the scrollbar appearing when a page
  // grows long enough to need one, which no resize event reports.
  syncScrollbarWidth();
  window.addEventListener('resize', syncScrollbarWidth, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncScrollbarWidth).observe(document.documentElement);

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      syncPerRowControl();
    }, 120);
  });

  // First paint comes from whatever URL we were opened at, so a deep link,
  // a bookmark or a shared link lands on the right view. replaceState then
  // normalises the address bar without adding a history entry. An address
  // that matched nothing keeps the path the reader actually typed, so they
  // can see and correct it, and the not-found view says so; it used to be
  // rewritten to "/" while the homepage rendered underneath.
  //
  // A reload (including iOS Safari quietly reloading a background tab) keeps
  // history.state, so the filters, sorts and scroll saved on this entry come
  // back too. pagehide saves the latest scroll on the way out; the browser's
  // own scroll restoration is off so it cannot fight the restore below.
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  window.addEventListener('pagehide', rememberListState);
  const saved = (window.history.state as { list?: ListSnapshot } | null)?.list;
  if (saved) restoreListState(saved);
  renderFromUrl();
  syncUrl('replace');
  if (saved) restoreScroll(saved);

  // The price history is only drawn on a product page, so the app starts
  // without it (demo/priceHistoryStore.ts). Fetched once the first paint is
  // done and the browser is idle, so it is usually in before anyone opens a
  // product page; a product page opened first has already asked for it.
  prefetchWhenIdle(() => {
    priceHistory.load().catch(() => {
      // Nothing to show yet: a product page asks again, and says so if it fails.
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export type { ArtSize };
