/**
 * Which render tier one specific shop's render escalation uses this run.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * scripts/catalogue-harvest.ts used to build exactly one renderer per run:
 *
 *     const localRenderer = noLocalRender ? null : localBrowserRenderer(...);
 *     const actorRenderer = localRenderer ?? (useApifyActor ? apifyActorRenderer(actorConfig!) : null);
 *
 * The free local renderer is non-null whenever it is not explicitly turned
 * off, so it is what every shop's render call actually used on every
 * ordinary run — the paid Apify actor was only ever reached with
 * `--no-local-render`, a run-wide switch, not a per-shop one. There was no
 * code path that sent one shop to the actor while every other render-
 * dependent shop kept using the free tier.
 *
 * That mattered concretely for John Lewis (see its own registry entry in
 * src/config/retailers.ts): its actor route is proven — real ~1MB section
 * pages, real priced listings, run 19 among others — while its local-render
 * route is refused ten times over. Recovering it should not require moving
 * every other render-dependent shop (Selfridges included, this project's one
 * shop with a genuinely positive *local*-render outcome) onto the metered
 * tier for the whole run. That run-wide move is exactly what emptied the
 * shared $5 monthly Apify credit on 2026-08-21, darkening five shops
 * together (Boots, Selfridges, John Lewis, Superdrug, Zara) when only one of
 * them needed the actor at all.
 *
 * ── What this does instead ──────────────────────────────────────────────────
 * rendererForShop() decides, per retailer, which renderer that one shop's
 * render calls use — the local renderer by default (identical to the prior
 * run-wide behaviour), or the shared actor renderer when the retailer's own
 * `renderTier: 'actor'` asks for it AND the actor is actually available this
 * run. No retailer sets `renderTier` today (src/config/retailers.ts) —
 * turning it on for a shop is a deliberate, priced owner decision (see the
 * Retailer field's own doc comment in src/types/retailer.ts for the cost),
 * not something this module or the harvest script decides on its own.
 */
import type { HttpResponse } from './attempt.js';

/** The minimal shape both localBrowserRenderer() and apifyActorRenderer() satisfy. */
export interface ShopRenderer {
  render: (urls: string[]) => Promise<Map<string, HttpResponse>>;
  used: () => number;
}

export type RenderTierChoice = 'local' | 'actor';

/**
 * Resolve the renderer (and its name, for logging and for knownRenderRefusal)
 * one specific shop uses this run.
 *
 * `retailer.renderTier === 'actor'` is honoured only when `sharedActorRenderer`
 * is non-null — i.e. the actor tier is genuinely configured and allowed this
 * run (APIFY_TOKEN set, --allow-metered passed, budget not exhausted). It can
 * never manufacture an actor renderer that does not otherwise exist, and it
 * never affects any other shop: this function is called once per retailer,
 * with the same two renderer instances, and returns an answer for that one
 * retailer alone.
 *
 * Falls back to `localRenderer` when there is no per-shop override (or the
 * override cannot be honoured), and to `sharedActorRenderer` only once
 * `localRenderer` itself is null — exactly the prior run-wide ordering, kept
 * as the default so a run with no `renderTier` set anywhere behaves
 * identically to before this existed.
 */
export function rendererForShop(
  retailer: { renderTier?: 'actor' },
  localRenderer: ShopRenderer | null,
  sharedActorRenderer: ShopRenderer | null,
): { renderer: ShopRenderer | null; tier: RenderTierChoice } {
  if (retailer.renderTier === 'actor' && sharedActorRenderer) {
    return { renderer: sharedActorRenderer, tier: 'actor' };
  }
  if (localRenderer) return { renderer: localRenderer, tier: 'local' };
  return { renderer: sharedActorRenderer, tier: 'actor' };
}

/** Human name for the tier a render call used, for the run log. */
export function renderTierLabel(tier: RenderTierChoice): string {
  return tier === 'actor' ? 'Apify actor' : 'local browser';
}
