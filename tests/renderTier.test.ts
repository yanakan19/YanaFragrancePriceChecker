import { describe, expect, it, vi } from 'vitest';
import { rendererForShop, renderTierLabel, type ShopRenderer } from '../src/catalogue/renderTier.js';

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
