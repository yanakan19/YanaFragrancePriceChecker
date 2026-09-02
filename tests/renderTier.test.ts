import { describe, expect, it, vi } from 'vitest';
import {
  rendererForShop,
  renderTierLabel,
  actorTierDue,
  ACTOR_TIER_MIN_INTERVAL_HOURS,
  type ShopRenderer,
} from '../src/catalogue/renderTier.js';

/**
 * rendererForShop() is the mechanism behind `retailer.renderTier`: a per-shop
 * preference for the paid Apify actor tier, so recovering one shop (John
 * Lewis is the worked example — see its registry entry) does not require
 * moving every other render-dependent shop off the free local renderer via
 * the run-wide --no-local-render switch. Every case below is a clause of
 * that contract; see src/catalogue/renderTier.ts's own header for the full
 * reasoning.
 */
function fakeRenderer(): ShopRenderer {
  return { render: vi.fn(async () => new Map()), used: () => 0 };
}

describe('rendererForShop', () => {
  it('defaults to the local renderer when a shop has no renderTier preference', () => {
    const local = fakeRenderer();
    const actor = fakeRenderer();
    const result = rendererForShop({}, local, actor);
    expect(result.renderer).toBe(local);
    expect(result.tier).toBe('local');
  });

  it('falls back to the actor when local rendering is off and no preference is set', () => {
    // Today's exact prior behaviour: `--no-local-render` with the actor
    // configured meant every shop used the actor.
    const actor = fakeRenderer();
    const result = rendererForShop({}, null, actor);
    expect(result.renderer).toBe(actor);
    expect(result.tier).toBe('actor');
  });

  it('returns no renderer when neither tier is available and there is no preference', () => {
    const result = rendererForShop({}, null, null);
    expect(result.renderer).toBeNull();
  });

  it("routes a shop with renderTier: 'actor' to the actor even though local rendering is on for everyone else", () => {
    // The one thing the run-wide --no-local-render switch could never do:
    // one shop on the paid tier while every other shop keeps the free one.
    const local = fakeRenderer();
    const actor = fakeRenderer();
    const result = rendererForShop({ renderTier: 'actor' }, local, actor);
    expect(result.renderer).toBe(actor);
    expect(result.tier).toBe('actor');
    // The local renderer this run still has is untouched by this shop's
    // choice — nothing here ever calls into it.
    expect(local.render).not.toHaveBeenCalled();
  });

  it("never manufactures an actor renderer: renderTier: 'actor' with no actor configured falls back to local", () => {
    // This is the hard requirement: a per-shop preference must never turn a
    // run with no metered tier configured into one that needs one.
    const local = fakeRenderer();
    const result = rendererForShop({ renderTier: 'actor' }, local, null);
    expect(result.renderer).toBe(local);
    expect(result.tier).toBe('local');
  });

  it("renderTier: 'actor' with neither tier available still returns no renderer, not a crash", () => {
    const result = rendererForShop({ renderTier: 'actor' }, null, null);
    expect(result.renderer).toBeNull();
  });

  it('one shop\'s preference never changes what another shop would get from the same call', () => {
    const local = fakeRenderer();
    const actor = fakeRenderer();
    const withPreference = rendererForShop({ renderTier: 'actor' }, local, actor);
    const withoutPreference = rendererForShop({}, local, actor);
    expect(withPreference.tier).toBe('actor');
    expect(withoutPreference.tier).toBe('local');
    // Same two renderer instances passed both times — this function reads
    // only the one retailer object given to it, never anything shared.
    expect(withPreference.renderer).toBe(actor);
    expect(withoutPreference.renderer).toBe(local);
  });
});

describe('renderTierLabel', () => {
  it('names each tier for the run log', () => {
    expect(renderTierLabel('local')).toBe('local browser');
    expect(renderTierLabel('actor')).toBe('Apify actor');
  });
});

/**
 * The frequency bound on paid rendering, added 2026-09-02 when John Lewis's
 * `renderTier: 'actor'` was enabled for real.
 *
 * The arithmetic it exists for, restated from ACTOR_TIER_MIN_INTERVAL_HOURS:
 * four section pages at docs/INGESTION.md's $2-5 per 1,000, against an hourly
 * cron, is 2,918 pages and $5.84-$14.60 a month — 117% to 292% of the whole
 * shared $5 pool, spent by one shop, before the other four render-dependent
 * shops draw a page. At one render a day it is 122 pages and $0.24-$0.61,
 * which is 5-12% of the pool. The bound is the difference between enabling
 * this shop and re-running the 2026-08-21 outage that darkened five shops at
 * once.
 */
const HOUR = 60 * 60 * 1000;
const now = new Date('2026-09-02T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();

describe('actorTierDue: the per-shop cap on paid rendering', () => {
  it('is 24 hours', () => {
    // Pinned because the cost arithmetic above is stated against this exact
    // number: changing it changes what the pool can afford.
    expect(ACTOR_TIER_MIN_INTERVAL_HOURS).toBe(24);
  });

  it('allows a shop that has never spent an actor render', () => {
    expect(actorTierDue(null, now)).toBe(true);
    expect(actorTierDue(undefined, now)).toBe(true);
    expect(actorTierDue('', now)).toBe(true);
  });

  it('refuses inside the window and allows once it has passed', () => {
    expect(actorTierDue(hoursAgo(1), now)).toBe(false);
    expect(actorTierDue(hoursAgo(23), now)).toBe(false);
    expect(actorTierDue(hoursAgo(24), now)).toBe(true);
    expect(actorTierDue(hoursAgo(25), now)).toBe(true);
  });

  it('treats an unparseable stamp as never rendered rather than as forever', () => {
    // A corrupt ordering hint must never be why a shop goes permanently dark;
    // the exposure the other way is one render, not an unbounded run of them.
    expect(actorTierDue('not a date', now)).toBe(true);
  });

  it('refuses a stamp in the future rather than trusting it', () => {
    // Clock skew or a hand-edited file. The two ways of being wrong are not
    // symmetric: refusing costs a day of freshness on one shop, allowing
    // spends real money on a signal already known to be wrong.
    expect(actorTierDue(new Date(now.getTime() + HOUR).toISOString(), now)).toBe(false);
  });

  it('honours a caller-supplied interval, for callers that are not this default', () => {
    expect(actorTierDue(hoursAgo(2), now, 1)).toBe(true);
    expect(actorTierDue(hoursAgo(2), now, 6)).toBe(false);
  });
});

describe('rendererForShop: the bound applied', () => {
  it('gives an actor-tier shop no renderer at all inside the window', () => {
    // Not a fallback to the local renderer. This shop is on the actor tier
    // because its local route is refused ten times over, so dropping to local
    // would spend a page from the shared local budget to reproduce a known
    // refusal, and would make the run log claim a local attempt when the real
    // fact is that the paid tier was declined on purpose.
    const local = fakeRenderer();
    const actor = fakeRenderer();
    const result = rendererForShop({ id: 'john-lewis', name: 'John Lewis', renderTier: 'actor' }, local, actor, {
      lastActorRenderAt: hoursAgo(3),
      now,
    });
    expect(result.renderer).toBeNull();
    expect(result.tier).toBe('actor');
    expect(result.deferred).toContain('John Lewis');
    expect(result.deferred).toContain('24h');
  });

  it('gives it the actor once the window has passed', () => {
    const local = fakeRenderer();
    const actor = fakeRenderer();
    const result = rendererForShop({ id: 'john-lewis', name: 'John Lewis', renderTier: 'actor' }, local, actor, {
      lastActorRenderAt: hoursAgo(30),
      now,
    });
    expect(result.renderer).toBe(actor);
    expect(result.tier).toBe('actor');
    expect(result.deferred).toBeNull();
  });

  it('never touches a shop that has no renderTier preference, however recently anything rendered', () => {
    // The whole point of enabling one shop's paid tier is that it must not be
    // able to darken the others. A bound that could reach an ordinary shop
    // would do exactly that.
    const local = fakeRenderer();
    const actor = fakeRenderer();
    const result = rendererForShop({ id: 'selfridges', name: 'Selfridges' }, local, actor, {
      lastActorRenderAt: hoursAgo(0),
      now,
    });
    expect(result.renderer).toBe(local);
    expect(result.tier).toBe('local');
    expect(result.deferred).toBeNull();
  });

  it('behaves exactly as before when no bound is supplied at all', () => {
    // Every existing caller and every existing case above passes three
    // arguments. The fourth being optional is what keeps this additive.
    const local = fakeRenderer();
    const actor = fakeRenderer();
    expect(rendererForShop({ renderTier: 'actor' }, local, actor).renderer).toBe(actor);
    expect(rendererForShop({}, local, actor).renderer).toBe(local);
  });

  it('cannot manufacture an actor render when the actor is unavailable this run', () => {
    // A bound that says "due" is permission to spend, not a renderer. With no
    // actor configured (no APIFY_TOKEN, or the month's credit gone) this shop
    // still falls through to whatever the run actually has.
    const local = fakeRenderer();
    const result = rendererForShop({ id: 'john-lewis', renderTier: 'actor' }, local, null, {
      lastActorRenderAt: null,
      now,
    });
    expect(result.renderer).toBe(local);
    expect(result.tier).toBe('local');
  });
});
