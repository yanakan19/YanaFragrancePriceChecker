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
 * run. Turning it on for a shop is a deliberate, priced owner decision (see
 * the Retailer field's own doc comment in src/types/retailer.ts for the
 * cost), not something this module or the harvest script decides on its own.
 *
 * ── And how often, which is the part that decides whether it is affordable ──
 * 2026-09-02: the owner approved the tier for John Lewis, and it is set on
 * that one shop. Approving *which* shop is not the same decision as approving
 * *how often*, and at the hourly cron the second one is where the money is:
 * four pages an hour is more than the whole shared monthly pool, spent by one
 * shop. So the tier comes with a bound — ACTOR_TIER_MIN_INTERVAL_HOURS and
 * actorTierDue below, with the arithmetic written out on the constant. Inside
 * the window the shop gets no renderer at all, deliberately, rather than
 * falling back to the free tier it is already refused by.
 *
 * ── Whether a feed could retire this bound, checked 2026-09-03 ─────────────
 * The owner wants John Lewis reachable without paying Apify if a free route
 * exists. The candidate free route is an affiliate product feed (this project
 * already consumes Awin feeds for several shops — see src/catalogue/
 * awinFeed.ts), which would replace rendering entirely rather than make it
 * cheaper. No such feed is confirmed for John Lewis as of this date: its own
 * registry entry in src/config/retailers.ts records no primary source for
 * which network (if any) its affiliate programme runs on — third-party
 * aggregators disagree across Awin, Impact and CJ, none traceable to a real
 * merchant profile or the retailer's own affiliate page, and the owner's Awin
 * and Rakuten publisher accounts are the only way left to settle it (both
 * pending, per that entry). Until one of those searches turns up a real
 * merchant id with a data feed, and ingestion code is written for whichever
 * network it is, `renderTier: 'actor'` on the John Lewis entry is this shop's
 * only working route and stays as-is. If a feed is later confirmed and wired,
 * this field becomes unnecessary and can be removed then — not before.
 */
import type { HttpResponse } from './attempt.js';

/** The minimal shape both localBrowserRenderer() and apifyActorRenderer() satisfy. */
export interface ShopRenderer {
  render: (urls: string[]) => Promise<Map<string, HttpResponse>>;
  used: () => number;
}

export type RenderTierChoice = 'local' | 'actor';

/**
 * The least time that may pass between two paid actor renders of one shop.
 *
 * ── The arithmetic this number comes from ───────────────────────────────────
 * The cron fires hourly (`.github/workflows/catalogue-daily.yml`, `15 * * * *`).
 * A shop on the actor tier renders its configured sections' first pages, four
 * of them for John Lewis, and docs/INGESTION.md prices an actor render at
 * roughly $2-5 per 1,000 pages. So:
 *
 *   per run reached      4 pages          $0.008 - $0.02
 *   once every hour      2,918 pages/mo   $5.84  - $14.60/mo
 *   once every 24 hours    122 pages/mo   $0.24  - $0.61/mo
 *
 * The shared Apify credit is $5 a month (src/catalogue/localBrowser.ts's
 * header; it ran out on day 21 of August 2026 and took five shops dark with
 * it). Hourly rendering of ONE shop overruns that pool on its own — 117% of it
 * at the cheap end of the estimate, 292% at the dear end — before any other
 * shop draws a page. Once every 24 hours costs 5-12% of the pool, which leaves
 * the other four render-dependent shops the same room they have today.
 *
 * That is the whole reason this constant exists rather than a bare
 * `renderTier: 'actor'`. Enabling the tier must not be able to darken the
 * shops that already depend on the same credit, and at an hourly cadence it
 * plainly could.
 *
 * ── Why 24 rather than relying on the gates that already exist ──────────────
 * Two other gates bound this today and neither is sufficient on its own.
 * The workflow's `guard` job holds a real harvest to one per ~150 minutes plus
 * the run's own duration, ~6/day; and the harvest step only passes
 * `--allow-metered` when data/metered-harvest-marker.txt is at least 20 hours
 * old. Both live in YAML, both are run-wide rather than per-shop, and the
 * second is explicitly overridden by a hand dispatch: "An explicit
 * allow_metered dispatch always wins — asking for it by hand is a decision,
 * not a schedule." That is the correct rule for a human deciding to spend, and
 * it is exactly the hole a per-shop bound has to close, because a few
 * successive dispatches on one afternoon would each hand this shop another
 * four paid pages with nothing counting them.
 *
 * 24 hours, not 20, and deliberately not matched to the workflow marker: this
 * is a ceiling on one shop's own spend, not a second copy of the run gate. A
 * fragrance retailer's catalogue does not turn over inside a day — the same
 * reasoning the workflow's own comment gives for rendering these shops once
 * daily rather than every tick.
 */
export const ACTOR_TIER_MIN_INTERVAL_HOURS = 24;

/**
 * Whether a shop bounded to the actor tier may spend a render this run.
 *
 * Pure and clock-injected so the bound is testable without waiting a day.
 *
 * Three answers that are not simply "has enough time passed", each chosen for
 * which direction it errs in — and money is the thing being erred about:
 *
 *  - No stamp at all (never rendered, or a cursor written before this map
 *    existed): allowed. A shop that has never spent must be able to spend
 *    once, or the bound would mean "never" rather than "once a day".
 *  - An unparseable stamp: allowed, treated as no stamp. A corrupt ordering
 *    hint must never be the reason a shop goes permanently dark; the cursor's
 *    own header already holds that rule for `attempted`, and the exposure is
 *    one render, not an unbounded run of them.
 *  - A stamp in the future: REFUSED. That can only be a clock skew or a
 *    hand-edited file, and the two ways of being wrong are not symmetric —
 *    refusing costs one day of freshness on one shop, allowing spends real
 *    money on a signal known to be wrong.
 */
export function actorTierDue(
  lastRenderedAt: string | null | undefined,
  now: Date,
  minIntervalHours: number = ACTOR_TIER_MIN_INTERVAL_HOURS,
): boolean {
  if (!lastRenderedAt) return true;
  const last = Date.parse(lastRenderedAt);
  if (!Number.isFinite(last)) return true;
  const elapsedMs = now.getTime() - last;
  if (elapsedMs < 0) return false;
  return elapsedMs >= minIntervalHours * 60 * 60 * 1000;
}

/** What rendererForShop decided, and why, where the "why" is worth logging. */
export interface RenderTierDecision {
  renderer: ShopRenderer | null;
  tier: RenderTierChoice;
  /**
   * Non-null only when the per-shop actor bound declined this run — the one
   * case where a shop that would otherwise have rendered gets no renderer at
   * all. The string is the run-log line; null every other time, including
   * every ordinary shop on every ordinary run.
   */
  deferred: string | null;
}

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
  retailer: { id?: string; name?: string; renderTier?: 'actor' },
  localRenderer: ShopRenderer | null,
  sharedActorRenderer: ShopRenderer | null,
  bound?: { lastActorRenderAt: string | null; now: Date; minIntervalHours?: number },
): RenderTierDecision {
  if (retailer.renderTier === 'actor' && sharedActorRenderer) {
    // The frequency bound — see ACTOR_TIER_MIN_INTERVAL_HOURS for the cost
    // arithmetic that sets it. Applied only on the `renderTier: 'actor'`
    // branch, so it can never touch a shop that was going to use the free
    // local renderer anyway.
    if (bound && !actorTierDue(bound.lastActorRenderAt, bound.now, bound.minIntervalHours)) {
      const hours = bound.minIntervalHours ?? ACTOR_TIER_MIN_INTERVAL_HOURS;
      // No renderer at all, deliberately, rather than dropping to
      // `localRenderer`. Falling back to the free tier would look thriftier
      // and would be wrong twice over: this shop is on the actor tier
      // precisely because its local route is refused (ten attempts on file for
      // John Lewis), so a local fallback spends a page from the shared local
      // budget to reproduce a known refusal — and it would also make the run
      // log claim a local attempt where the real fact is "the paid tier was
      // declined this run, on purpose". No render is the honest answer.
      return {
        renderer: null,
        tier: 'actor',
        deferred:
          `[actor] not due: ${retailer.name ?? retailer.id ?? 'this shop'} is bounded to one actor render every ` +
          `${hours}h and last rendered ${bound.lastActorRenderAt} — no render this run`,
      };
    }
    return { renderer: sharedActorRenderer, tier: 'actor', deferred: null };
  }
  if (localRenderer) return { renderer: localRenderer, tier: 'local', deferred: null };
  return { renderer: sharedActorRenderer, tier: 'actor', deferred: null };
}

/** Human name for the tier a render call used, for the run log. */
export function renderTierLabel(tier: RenderTierChoice): string {
  return tier === 'actor' ? 'Apify actor' : 'local browser';
}
