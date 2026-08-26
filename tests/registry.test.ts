import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RETAILERS,
  getRetailer,
  enabledRetailers,
  retailersForTier,
  cannotCarryBrand,
  CURRENCY_UNCONFIRMED,
} from '../src/config/retailers.js';
import { buildComparison, bestOffer, presentOffer } from '../src/services/priceService.js';
import type { RawOffer } from '../src/types/offer.js';

describe('retailer registry', () => {
  it('contains the retailers from the plan plus any live affiliate or direct additions', () => {
    // Twelve from the original plan, three added as their Awin programmes
    // actually approved us (Fragrance Click UK, MyBeauty.Boutique, Glorious
    // Beauty), four added as direct scrapes — Escentual, The Fragrance
    // Counter, ScentStore and Perfume Shopping — sourced without Awin
    // approval, nine Middle Eastern / Arabic shops added 2026-08-05 (French
    // Avenue and Armaf promoted out of houses.ts, Al Haramain, Riiffs, IBRAQ,
    // BellaVita Luxury, Oud Arabian, Manchester Ouds, Perfumeo), The Beauty
    // Store UK, Zimaya, and five single-brand UK storefronts added the same
    // day on request: Khadlaj, KAYALI, Zara, LUSH, Bath & Body Works. Emirates
    // Oud added 2026-08-10 on approval into their GoAffPro programme. Another
    // seventeen added 2026-08-11 as temporary placeholders for every UK
    // retailer this account applied to on Awin that day but had no registry
    // entry yet: Debenhams, Niche-Beauty UK, Nicchia Luxury UK, Paco
    // Perfumerias, Wowcher, Beauty Pie, very.co.uk, Gorgeous Shop, Beauty
    // Flash, Scentsational, Beauty The Shop UK, Perfume Market UK,
    // Parfumdreams UK, Perfume Click, Beauty Bay, Fragrancedirect and Cult
    // Beauty Global. Cosmetify added the same day after turning up in a
    // Microsoft Shopping listing — a confirmed Awin merchant (id 29993, read
    // off their own merchant profile) not yet applied to on this account.
    // Escentric Molecules added 2026-08-12, promoted out of houses.ts once
    // its UK/GBP storefront and standard delivery rate were confirmed —
    // same basis as French Avenue and Armaf before it.
    //
    // Carethy added 2026-08-13 from a Microsoft Shopping results page, on the
    // same route that surfaced Cosmetify two days earlier. Disabled, and in
    // CURRENCY_UNCONFIRMED from the moment it was written: nothing has been
    // read from that shop.
    //
    // Amazon UK added 2026-08-16 as a deliberate placeholder. Disabled, and
    // its entry records three blockers rather than a to-do: no legitimate
    // price source without PA-API (whose keys require Associates sales
    // first), a possible conflict between PA-API's retention terms and this
    // repo's stored prices and price history, and a marketplace where "the
    // price" is several sellers' prices. Nothing has been read from Amazon.
    //
    // FragranceHub added 2026-08-18 as a candidate sourced entirely from
    // WebSearch snippets of its own pages — WebFetch to fragrancehub.co.uk
    // returns EGRESS_BLOCKED here, so nothing on the site has actually been
    // read. Disabled, and in CURRENCY_UNCONFIRMED: the entry exists to give
    // currency:probe, run from CI where the network reaches it, something to
    // ask.
    //
    // Harrods, Next, Avon and Sephora UK added 2026-08-20, the first batch of
    // an owner-requested expansion (Harrods, Next and Avon named directly;
    // department stores and niche specialists more broadly). Same basis as
    // FragranceHub: WebSearch snippets only, nothing opened directly, all
    // four disabled and in CURRENCY_UNCONFIRMED.
    //
    // Space NK, House of Fraser, Marks & Spencer and Les Senteurs added the
    // same day, second batch of the same expansion — two more department
    // stores and the first independent niche perfumery. Same basis again:
    // WebSearch only, disabled, in CURRENCY_UNCONFIRMED.
    //
    // Bloom Perfumery, Shy Mimosa, Perfume Price and Perfume Direct added
    // the same day, closing out the expansion at twelve new entries: two
    // more independent niche perfumeries (Bloom in Covent Garden, Shy
    // Mimosa in Bristol) and two independent discount fragrance specialists
    // (Perfume Price, a registered UK company per Companies House; Perfume
    // Direct, Manchester-founded 2018). Same basis again: WebSearch only,
    // disabled, in CURRENCY_UNCONFIRMED. Sephora UK, Space NK, ASOS, Argos,
    // Perfume Price, Perfume Direct, CheapSmells, Bloom Perfumery, Les
    // Senteurs and Shy Mimosa were all suggested as candidates worth
    // checking; ASOS and Argos were confirmed real (both sell genuine
    // multi-brand fragrance ranges) but left out to keep this batch to the
    // department-store/niche-specialist/independent-perfumery shape the
    // request asked for, and CheapSmells was dropped outright — a
    // site:cheapsmells.com / site:cheapsmells.co.uk WebSearch returned no
    // page from either domain, only third parties talking about it, which
    // is not the same as a domain confirmed to resolve.
    //
    // Tesco added 2026-08-20 — the first supermarket in this registry, and
    // added disabled with a boundary drawn inside it rather than around it.
    // The owner pasted a tesco.com product URL, and that URL turned out to be
    // a Tesco MARKETPLACE listing (/shop/en-GB/products/{id}), i.e. a
    // third-party seller on Tesco's Mirakl platform who sets their own price,
    // charges their own separate delivery and handles their own returns, with
    // Tesco's terms disclaiming all three. That is not a Tesco price and
    // cannot be shown as one. Tesco's own grocery fragrance range
    // (/groceries/en-GB/shop/health-and-beauty/perfumes-aftershaves-and-gift-
    // sets/) is the comparable thing and is what the entry is for. Same
    // evidential basis as the twelve above: WebSearch only, nothing opened,
    // disabled, and in CURRENCY_UNCONFIRMED.
    //
    // Asda, Sainsbury's, Morrisons, Ocado, Savers, B&M, The Range and Home
    // Bargains added the same day, answering the other half of the same
    // request — "try find other major UK supermarkets for this as well".
    // Four grocers and four volume discounters, all disabled, all in
    // CURRENCY_UNCONFIRMED, all sourced from WebSearch result URLs and
    // titles with no page opened. What each entry actually records is its
    // URL shape and whether the brands named in its own search results are
    // designer bottles or own-label, because that is what separates a real
    // price source from a shelf of body sprays.
    //
    // Three named candidates were checked and deliberately NOT added, which
    // is a finding rather than an omission:
    //
    //   Waitrose  — every fragrance URL returned was home fragrance:
    //               /candles_and_home_fragrance, /home_fragrance_gifts, and
    //               a "Luxury Fragrance" page that sits under
    //               household/laundry_and_detergents/fabric_conditioner. No
    //               personal designer fragrance range surfaced at all.
    //   Iceland   — no fragrance, perfume or aftershave page on
    //               iceland.co.uk or thefoodwarehouse.com appeared in a
    //               search aimed directly at it. Own-label frozen food
    //               specialist; the fragrance results were unrelated
    //               businesses with similar names.
    //   Aldi      — sells fragrance, but its own Lacura line, described in
    //               its own results and third-party coverage as alternatives
    //               to designer scents. A dupe is not the product this site
    //               compares, and Aldi's non-food is Specialbuys — stock
    //               that by Aldi's own description is not restocked once
    //               sold out, which is the opposite of the stable product
    //               identity a price comparison needs.
    //
    // Lidl, Co-op, Wilko and Poundland were named in the same request and
    // are simply not researched — no search was run against them, and this
    // note says so rather than implying they were ruled out.
    expect(RETAILERS).toHaveLength(79);

    // And the file's own header has to say the same thing. It said "Nineteen
    // UK retailers" while this assertion said 55 and passed — the number was
    // pinned in the test and left to rot in the prose beside it, where anyone
    // reading the registry to understand it would meet the wrong one first.
    // Folded into this test rather than added as its own so the count of
    // assertions here still tracks the count of facts being asserted.
    const source = readFileSync(
      new URL('../src/config/retailers.ts', import.meta.url),
      'utf8',
    );
    const header = source.slice(0, source.indexOf('const NO_AFFILIATE_YET'));
    expect(header).toContain(`${RETAILERS.length} retailers`);
    expect(header).toContain(`${enabledRetailers().length} of them \`enabled: true\``);
  });

  // The whole point of allowing `standardGbp: null` is that "we have not
  // established this" stops being unsayable.
  //
  // It used to be made safe by keeping such a retailer out of the offer
  // pipeline entirely: `enabled: false`, and a test here enforcing it. That
  // protected the comparison by hiding real shops, which is its own kind of
  // dishonesty, so the guarantee has been narrowed to the part that actually
  // matters. Delivered price is the default sort key, so an unknown delivery
  // cost counted as zero would sort that shop to the top as artificially
  // cheapest. What is now enforced instead is:
  //
  //   - an unknown delivery cost produces a null delivered price, never a
  //     number, and never the item price wearing a delivered price's clothes;
  //   - such an offer can never outrank one with a known delivered price under
  //     the default sort, and is never named as the best offer while any
  //     comparable offer exists;
  //   - a real, sourced `standardGbp: 0` still means free delivery and is
  //     never confused with "we don't know".
  //
  // The tests below are what keep that true. Between them they cover the exact
  // failure the old test existed to prevent.
  describe('retailers with an unknown standard delivery cost', () => {
    // Every retailer that is enabled without a stated standard delivery cost.
    // This is deliberately not asserted to be empty any more — it is asserted
    // to behave.
    const unstated = RETAILERS.filter((r) => r.shipping.standardGbp === null && r.enabled);

    const rawOffer = (retailerId: string, price: number): RawOffer => ({
      retailerId,
      variantId: 'test-variant',
      price,
      currency: 'GBP',
      stock: 'inStock',
      url: 'https://example.com/p/1',
      fetchedAt: '2026-08-01T11:55:00Z',
    });

    it('is a short, deliberate list rather than everything unresearched', () => {
      // Being shown without a delivery cost is safe, but it is not free: each
      // of these is a shop a reader can open and be sent to. They are here
      // because each has a real ingestion route (a catalogue config, a
      // confirmed live Awin feed, or `shopifyStorefront: true` pointed at a
      // confirmed-Shopify, confirmed-sterling storefront) and a real reason
      // to be listed. The other retailers carrying standardGbp: null have
      // none of those — catalogue: null, adapter: 'unknown' and no
      // shopifyStorefront — nothing to fetch, so they would render as empty
      // shops — and mostly a pending affiliate application, so listing them
      // as live partners would describe a relationship that does not exist
      // yet.
      // Glorious Beauty and The Fragrance Counter graduated out of this list
      // 2026-08-12: both now have a directly-quoted flat rate read off their
      // own shipping policy pages (see src/config/retailers.ts), so they
      // carry a real standardGbp and are no longer shown as "delivery not
      // stated". Manchester Ouds remains here — see its entry's
      // shipping.notes for what was tried. Perfume Shopping left this list
      // 2026-08-19 for a worse reason than the others: disabled outright,
      // because two separate probes a week apart (a direct 403 on
      // 2026-08-12, a CI probe that got no robots.txt answer at all on
      // 2026-08-19, run 32276664942 job 96145604924) found the domain
      // unreachable by this tooling. This list only covers *enabled*
      // retailers, so it drops out on that basis rather than a delivery
      // figure having been found.
      // Al Haramain, Armaf, French Avenue, IBRAQ and Zimaya joined this list
      // 2026-08-19: each cleared the Shopify-suspect currency probe (real
      // /products.json payload, a sterling price list confirmed by a CI
      // runner, robots.txt permitting every request — see each entry's own
      // comment for its run and job id) and was enabled on that, with no
      // standard delivery cost found for any of them yet. A confirmed
      // ingestion route is not the same claim as a confirmed delivery cost;
      // this list is exactly the record of that gap.
      // Nicchia Luxury UK left this list on 2026-08-13 for a different and
      // worse reason: it was disabled outright, because what currency it
      // charges in was never established. This list only covers *enabled*
      // retailers, so a disabled one drops out of it — that is the list
      // tracking the registry, not a delivery figure having been found.
      // fragrancehub joined on being enabled 2026-08-20: its shop publishes
      // a £90 free-delivery threshold and no flat standard rate at all —
      // recorded on the entry via standardRateNotPublished with the policy
      // page quoted, so this is a shop that does not state the figure, not a
      // figure nobody has looked for.
      // riiffs joined the same day for a genuinely different reason than
      // fragrancehub: nobody has read its delivery page at all (see the
      // entry's own shipping.notes), not "read and found silent". It is here
      // because a sterling reading finally cleared CURRENCY_UNCONFIRMED (see
      // src/config/retailers.ts's own removal comment) and its ingestion
      // route is `sitemapHarvestConfirmed: true` rather than any of the three
      // this test used to check for — see that field's own doc comment in
      // src/types/retailer.ts for why it exists and what it asserts.
      // perfumeo joined the same day on the fragrancehub side of that split:
      // shipping probe, run 32279620206 job 96155027469, read its delivery
      // page directly and confirmed NO RATE STATED, a genuine
      // standardRateNotPublished shape rather than an unread page. Cleared
      // CURRENCY_UNCONFIRMED the same way riiffs did — a sterling reading off
      // its own product page's JSON-LD, not the shop's origin — and carries
      // the same `sitemapHarvestConfirmed: true` route.
      // home-bargains and bm-stores joined 2026-08-21, on the riiffs/perfumeo
      // route: both cleared CURRENCY_UNCONFIRMED on a sterling
      // schema.org priceCurrency reading off their own harvest-fetched sample
      // product page (see each entry's own comment and CURRENCY_UNCONFIRMED's
      // own removal notes in src/config/retailers.ts for the run and job
      // ids), and both carry `sitemapHarvestConfirmed: true` from the same
      // 10-of-10-priced harvest probe that produced the sample URL — home
      // Bargains' the cleanest sweep of the whole batch it was measured in,
      // with zero errors at all.
      // morrisons joined the same day, on the same route, after a second
      // currency probe finally reached a resolving product page (its first
      // attempt, a WebSearch-sourced URL, had 404'd) and read that page's
      // schema.org priceCurrency as sterling. Its standardGbp stays null on
      // purpose — grocery delivery is slot-booked, not a flat per-order rate
      // — but it carries `sitemapHarvestConfirmed: true` from the same
      // 10-of-10-priced harvest probe that produced the sample URL the
      // currency probe used.
      expect(unstated.map((r) => r.id).sort()).toEqual([
        'al-haramain',
        'armaf',
        'avon',
        'bm-stores',
        'fragrancehub',
        'french-avenue',
        'home-bargains',
        'ibraq',
        'manchester-ouds',
        'morrisons',
        'perfumeo',
        'riiffs',
        'zimaya',
      ]);
      for (const r of unstated) {
        expect(
          r.catalogue !== null ||
            r.adapter === 'affiliate-feed' ||
            r.shopifyStorefront === true ||
            r.sitemapHarvestConfirmed === true,
          `${r.name} is enabled with no way to fetch anything`,
        ).toBe(true);
      }
    });

    it('yields a null delivered price, never a number', () => {
      for (const r of unstated) {
        const row = presentOffer(rawOffer(r.id, 42), r);
        expect(row.deliveredPriceGbp, `${r.name} invented a delivered price`).toBeNull();
        expect(row.delivery.costGbp, `${r.name} invented a delivery cost`).toBeNull();
        // The item price is still shown; it is simply never passed off as a
        // delivered one.
        expect(row.itemPriceGbp).toBe(42);
        // Nothing about free delivery can be claimed for a cost nobody has.
        expect(row.delivery.isFree).toBe(false);
        expect(row.delivery.freeReason).toBeNull();
        expect(row.delivery.spendMoreForFreeGbp).toBeNull();
      }
    });

    it('never sorts above a known-delivery offer, however cheap the item', () => {
      // Boots at £90 delivers at £90 (its £25 threshold is long cleared). The
      // unknown-delivery shop is listed at £1 — the most extreme form of the
      // error this guards against — and still has to come second.
      for (const r of unstated) {
        const rows = buildComparison([rawOffer(r.id, 1), rawOffer('boots', 90)]);
        expect(rows.map((row) => row.retailer.id), `${r.name} outranked a priced offer`).toEqual([
          'boots',
          r.id,
        ]);
        expect(bestOffer(rows)!.retailer.id, `${r.name} was named cheapest`).toBe('boots');
      }
    });

    it('orders unknown-delivery offers among themselves by item price', () => {
      // They are comparable to each other on the only figure they have.
      const [a, b] = unstated;
      const rows = buildComparison([rawOffer(b!.id, 80), rawOffer(a!.id, 20)]);
      expect(rows.map((row) => row.retailer.id)).toEqual([a!.id, b!.id]);
      expect(rows.every((row) => row.deliveredPriceGbp === null)).toBe(true);
    });

    it('keeps a real zero distinct from an unknown cost', () => {
      // Fragrance Click UK ships free on every order. That is a sourced claim,
      // not an absence of one, and it must keep producing a genuine delivered
      // price equal to the item price — the exact output an unknown cost is
      // forbidden from producing.
      const free = getRetailer('fragrance-click')!;
      expect(free.shipping.standardGbp).toBe(0);
      const row = presentOffer(rawOffer('fragrance-click', 42), free);
      expect(row.delivery.costGbp).toBe(0);
      expect(row.delivery.isFree).toBe(true);
      expect(row.delivery.freeReason).toBe('always-free');
      expect(row.deliveredPriceGbp).toBe(42);
      // And it competes normally: free delivery is a real advantage, unlike
      // an unstated cost, so it is allowed to win.
      const rows = buildComparison([rawOffer('fragrance-click', 42), rawOffer('boots', 90)]);
      expect(bestOffer(rows)!.retailer.id).toBe('fragrance-click');
    });
  });

  it('has unique ids and domains', () => {
    expect(new Set(RETAILERS.map((r) => r.id)).size).toBe(RETAILERS.length);
    expect(new Set(RETAILERS.map((r) => r.domain)).size).toBe(RETAILERS.length);
  });

  it('gives every retailer at least one tier', () => {
    for (const r of RETAILERS) {
      expect(r.tiers.length, `${r.name} has no tiers`).toBeGreaterThan(0);
    }
  });

  // This asserts less than its old name ("prices everything in sterling")
  // implied. `Retailer['currency']` is the literal type 'GBP', so this can
  // only ever pass — it catches a widening of the type, not a shop that turns
  // out to price in euros. The check that carries real weight is the one
  // below.
  it('declares GBP on every entry, which is all the type allows', () => {
    for (const r of RETAILERS) expect(r.currency).toBe('GBP');
  });

  // Three entries assert 'GBP' while their own shipping.notes say the currency
  // is unestablished — a Spanish site, a Madrid warehouse and a storefront
  // advertising in dollars. Nothing is wrong today because all three are
  // disabled; the danger is the edit that enables one without reading the
  // note, which would publish euro prices as pounds. src/config/retailers.ts
  // records that as data in CURRENCY_UNCONFIRMED and throws on import if any
  // of them is enabled. These tests keep that record honest: an id that is
  // quietly dropped, or renamed out from under it, would otherwise disarm the
  // guard without anything failing.
  describe('retailers whose currency is not confirmed', () => {
    it('names only real retailers, each with a stated reason', () => {
      expect(CURRENCY_UNCONFIRMED.size).toBeGreaterThan(0);
      for (const [id, reason] of CURRENCY_UNCONFIRMED) {
        expect(getRetailer(id), `${id} is not a retailer in this registry`).toBeDefined();
        expect(reason.length, `${id} has no stated reason`).toBeGreaterThan(20);
      }
    });

    it('keeps every one of them disabled', () => {
      for (const id of CURRENCY_UNCONFIRMED.keys()) {
        expect(
          getRetailer(id)!.enabled,
          `${id} is enabled without a confirmed currency — see CURRENCY_UNCONFIRMED`,
        ).toBe(false);
      }
    });

    // The specific case this was written for. Named rather than derived, so
    // deleting the entry from CURRENCY_UNCONFIRMED fails here too and has to
    // be a deliberate act with a checkout behind it.
    it('still covers the Spanish and Madrid-shipping entries', () => {
      expect(CURRENCY_UNCONFIRMED.has('paco-perfumerias')).toBe(true);
      expect(CURRENCY_UNCONFIRMED.has('beauty-the-shop-uk')).toBe(true);
    });

    // zimaya was removed 2026-08-19 on a currency probe that read a sterling
    // price list off the shop's own storefront (see src/config/retailers.ts).
    // khadlaj joined the same day for the opposite finding: confirmed
    // Shopify, but every way of asking quoted USD or 404d, never sterling.
    // Named rather than derived, so deleting either entry fails here too and
    // has to be a deliberate act with a checkout behind it.
    it('covers khadlaj, confirmed Shopify but never confirmed sterling', () => {
      expect(CURRENCY_UNCONFIRMED.has('khadlaj')).toBe(true);
      expect(CURRENCY_UNCONFIRMED.has('zimaya')).toBe(false);
    });
  });

  it('includes Beauty Base, enabled', () => {
    const bb = getRetailer('beautybase');
    expect(bb?.enabled).toBe(true);
    expect(bb?.tiers).toContain('niche');
  });

  it('exposes no trust flag — honesty lives in the offer pipeline, not a boolean', () => {
    for (const r of RETAILERS) {
      expect(r).not.toHaveProperty('trusted');
      expect(r).not.toHaveProperty('recommended');
    }
  });

  describe('shipping rules', () => {
    it('records a verification date and confidence for every retailer', () => {
      for (const r of RETAILERS) {
        expect(Number.isFinite(Date.parse(r.shipping.verifiedAt))).toBe(true);
        expect(['confirmed', 'unverified']).toContain(r.shipping.confidence);
      }
    });

    it('never has a negative cost or threshold', () => {
      for (const r of RETAILERS) {
        // null is "not established yet", which is a different statement from
        // any number and is checked by its own test above. Only a recorded
        // figure can be nonsensical.
        if (r.shipping.standardGbp !== null) {
          expect(r.shipping.standardGbp).toBeGreaterThanOrEqual(0);
        }
        // 0 is a legitimate threshold — it means "free from the first item",
        // not "no threshold recorded". Fragrance Click UK is free on every
        // order, so freeOverGbp: 0 is the honest way to say that, not a bug.
        if (r.shipping.freeOverGbp !== null) {
          expect(r.shipping.freeOverGbp).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('has a coherent estimated-days range', () => {
      for (const r of RETAILERS) {
        const [min, max] = r.shipping.estimatedDays;
        expect(min).toBeGreaterThan(0);
        expect(max).toBeGreaterThanOrEqual(min);
      }
    });

    it('models Notino as having no spend-based free delivery', () => {
      // Notino gates free postage on specific products, not basket value. A
      // threshold here would systematically understate its delivered price.
      expect(getRetailer('notino-uk')?.shipping.freeOverGbp).toBeNull();
    });

    it('uses the non-member threshold for Superdrug', () => {
      // £25 non-member, not the £20 Beautycard rate.
      expect(getRetailer('superdrug')?.shipping.freeOverGbp).toBe(25);
      expect(getRetailer('superdrug')?.shipping.membershipPerk).toBeDefined();
    });
  });

  describe('affiliate config', () => {
    it('never has an active programme with placeholder ids', () => {
      // status: 'active' is what flips buildOutboundLink into producing a
      // real tracked link — if it were ever set without real ids behind it,
      // every link for that retailer would silently be broken. A retailer
      // sets one of deeplinkTemplate (redirect-domain networks) or
      // querySuffixTemplate (in-house tools like GoAffPro), never neither —
      // see buildOutboundLink's own handling of the two shapes.
      for (const r of RETAILERS) {
        if (r.affiliate.status === 'active') {
          expect(r.affiliate.publisherId, `${r.name} is active with no publisherId`).toBeTruthy();
          expect(
            r.affiliate.deeplinkTemplate || r.affiliate.querySuffixTemplate,
            `${r.name} is active with neither a deeplinkTemplate nor a querySuffixTemplate`,
          ).toBeTruthy();
        }
      }
    });

    it('gives every confirmed network a signup URL to act on', () => {
      for (const r of RETAILERS) {
        if (r.affiliate.verified && r.affiliate.network) {
          expect(r.affiliate.signupUrl, `${r.name} is confirmed but has no signup URL`).toBeTruthy();
        }
      }
    });
  });

  describe('lookups', () => {
    it('returns undefined for an unknown id', () => {
      expect(getRetailer('not-a-retailer')).toBeUndefined();
    });

    it('filters by tier', () => {
      const niche = retailersForTier('niche');
      expect(niche.map((r) => r.id)).toContain('selfridges');
      expect(niche.map((r) => r.id)).not.toContain('boots');
    });

    it('only returns enabled retailers from tier and enabled lookups', () => {
      for (const r of [...enabledRetailers(), ...retailersForTier('designer')]) {
        expect(r.enabled).toBe(true);
      }
    });
  });

  describe('single-brand storefronts', () => {
    const armaf = getRetailer('armaf')!;
    const boots = getRetailer('boots')!;

    it("does not claim a house's own shop merely lacks another house's fragrance", () => {
      expect(cannotCarryBrand(armaf, 'Dior')).toBe(true);
      expect(cannotCarryBrand(armaf, 'Calvin Klein')).toBe(true);
    });

    it("still reports a house's own shop as genuinely missing its own fragrance", () => {
      // Armaf's own shop not listing an Armaf bottle IS a real absence, and
      // has to keep reading as one rather than being explained away.
      expect(cannotCarryBrand(armaf, 'Armaf')).toBe(false);
    });

    it('never excuses an ordinary multi-brand retailer', () => {
      for (const brand of ['Dior', 'Armaf', 'Lattafa', 'Anything At All']) {
        expect(cannotCarryBrand(boots, brand)).toBe(false);
      }
    });

    it('matches a house across the casing and suffixes feeds actually use', () => {
      const bellavita = getRetailer('bellavita-luxury')!;
      // Real strings from this shop's own harvested listings.
      expect(cannotCarryBrand(bellavita, 'BellaVita Luxury (UK)')).toBe(false);
      expect(cannotCarryBrand(bellavita, 'BELLAVITA')).toBe(false);
      // But a different house is still a different house.
      expect(cannotCarryBrand(bellavita, 'Bella Donna')).toBe(true);
    });

    it('only flags shops that genuinely sell one house', () => {
      // Oud Arabian and Manchester Ouds stock many houses between them, so
      // "not available" there is an ordinary, truthful absence.
      for (const id of ['oud-arabian', 'manchester-ouds', 'perfumeo']) {
        expect(getRetailer(id)!.singleBrandOnly, id).toBeUndefined();
      }
    });
  });

  describe('renderRefused — shops the local render tier has already answered', () => {
    // Every id here carries a dated, multi-run byte-count writeup in its own
    // entry above — see knownRenderRefusal in src/catalogue/renderRefusal.ts
    // for what setting this actually does.
    const flagged = ['superdrug'];

    it('is set on exactly the shops this pass established, no more and no fewer', () => {
      const actuallyFlagged = RETAILERS.filter((r) => r.renderRefused === true).map((r) => r.id).sort();
      expect(actuallyFlagged).toEqual([...flagged].sort());
    });

    it('never turns off the shop entirely — only the render escalation', () => {
      // This flag says "do not spend a render-tier page here", not "give up
      // on this shop". Every one of them stays enabled with its cheaper tiers
      // (plain fetch, the Apify proxy) intact, and keeps the catalogue
      // section URLs those tiers and the render tier both still read from.
      for (const id of flagged) {
        const r = getRetailer(id)!;
        expect(r.enabled, id).toBe(true);
        expect(r.catalogue, id).not.toBeNull();
      }
    });
  });
});
