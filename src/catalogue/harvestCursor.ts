/**
 * Which shop the sweep asks first, so that no shop is starved run after run.
 *
 * ── The failure this replaces ───────────────────────────────────────────────
 * The harvest asked shops in one fixed order — never-live first, then the
 * registry's own order — and the run never got to the end of the list. Run
 * #330's report (data/harvest-report.json, committed as 2cd38bf) planned 36
 * shops, reported 25 and named 11 it never reached:
 *
 *   perfumeo, the-beauty-store-uk, zimaya, kayali, zara, escentric-molecules,
 *   fragrancehub, avon, morrisons, bm-stores, home-bargains
 *
 * Those are the last eleven entries of the order, and a fixed order means they
 * are the last eleven every single run. The cost is visible in the snapshots
 * themselves — `updatedAt` in data/catalogue on 2026-08-25, against a run that
 * started at 16:29 that day:
 *
 *   2026-08-20T12:29Z  avon                  1,725 listings   5 days old
 *   2026-08-21T18:26Z  bm-stores                69 listings   4 days
 *   2026-08-21T18:26Z  home-bargains            69 listings   4 days
 *   2026-08-21T18:26Z  morrisons                70 listings   4 days
 *   2026-08-24T20:30Z  kayali                  187 listings
 *   2026-08-24T20:30Z  the-beauty-store-uk   5,264 listings
 *   2026-08-24T22:33Z  perfumeo                655 listings
 *
 * against sixteen shops carrying that same run's 16:29 timestamp. The tail was
 * not failing. It was not being asked.
 *
 * ── Why rotation rather than a smaller budget ───────────────────────────────
 * Measured from run #330's own per-shop `finishedAt` stamps: 25 shops took
 * 4,386s, a mean of 175s each. Extrapolating the eleven unreached at that mean
 * puts a full 36-shop sweep at about 6,300s — 105 minutes — against a harvest
 * step that has 60. A full sweep does not fit, and no amount of ordering makes
 * it fit. The choice is between reaching every shop less deeply every run, or
 * reaching some shops fully and rotating which ones. Rotation keeps the depth
 * (--max=70 with a 0.4 refresh share, which is what makes a shop's stored
 * prices actually move) and costs only latency: a shop is asked every second
 * or third run rather than every run, which at a two-hourly cron is still
 * several times a day against snapshots that were four and five days old.
 *
 * ── How the rotation is kept honest ─────────────────────────────────────────
 * Least-recently-attempted, not a start offset that walks forward by a fixed
 * amount. An offset drifts out of step the moment a run reaches more or fewer
 * shops than the last one, and it cannot express "this shop was asked and
 * failed in four seconds" differently from "this shop was never asked". The
 * timestamp can, and it is self-correcting: a shop the run did not reach keeps
 * its old stamp, so it sorts to the front of the very next run by
 * construction. Starvation is not merely unlikely, it is unrepresentable.
 *
 * Attempted, deliberately, not harvested. `updatedAt` on the snapshot would
 * have been free and is the wrong signal: store.write() only fires for a shop
 * that produced priced listings, so a shop that is asked every run and answers
 * nothing every run — John Lewis, Boots, Debenhams — would keep an ancient
 * stamp, sort first forever and starve the rest. Debenhams alone spent 392s of
 * run #330 discovering 718 URLs and pricing none of them.
 */

/** When each shop was last asked. Keys are retailer ids, values ISO stamps. */
export interface HarvestCursor {
  /** ISO timestamp of the last run that reached this shop, per retailer id. */
  attempted: Record<string, string>;
  /**
   * ISO timestamp of the last run that actually spent an Apify actor render on
   * this shop, per retailer id. Empty for every shop that has never reached
   * the paid tier, which is all but the one that sets `renderTier: 'actor'`.
   *
   * Separate from `attempted` because they answer different questions and must
   * be allowed to disagree. `attempted` is written for every shop the sweep
   * reaches, whether or not it rendered anything, precisely so a shop that
   * fails fast still rotates to the back — see this module's own header. A
   * money-spending bound cannot use that: John Lewis is *attempted* on most
   * runs and would have its bound reset by attempts that spent nothing, which
   * would make the bound meaningless in the one direction that costs. This map
   * is written only where a real actor render actually happened.
   *
   * Read by actorTierDue in src/catalogue/renderTier.ts. Optional in shape
   * only: parseCursor always fills it, so callers never see undefined.
   */
  actorRendered: Record<string, string>;
}

export const EMPTY_CURSOR: HarvestCursor = { attempted: {}, actorRendered: {} };

/**
 * Read a cursor out of whatever was on disk, tolerating anything.
 *
 * A cursor is an optimisation of ordering, never a correctness input: a
 * missing, empty or corrupt file must degrade to "nothing has ever been
 * asked", which orders by the fallbacks below and harvests exactly as the old
 * fixed order did. It must never be a reason a harvest fails.
 */
function stampMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
    if (typeof at === 'string' && at.length > 0) out[id] = at;
  }
  return out;
}

export function parseCursor(raw: string | null | undefined): HarvestCursor {
  if (!raw) return EMPTY_CURSOR;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_CURSOR;
    const attempted = (parsed as { attempted?: unknown }).attempted;
    if (!attempted || typeof attempted !== 'object') return EMPTY_CURSOR;
    // A cursor written before `actorRendered` existed has no such key, and
    // that must read as "no shop has ever spent an actor render" rather than
    // failing the whole parse — the first run after this ships reads exactly
    // that file. It is also the safe direction: an absent stamp means the
    // bound allows one render, which is the same as a fresh install.
    return {
      attempted: stampMap(attempted),
      actorRendered: stampMap((parsed as { actorRendered?: unknown }).actorRendered),
    };
  } catch {
    return EMPTY_CURSOR;
  }
}

export interface SweepCandidate {
  id: string;
  /**
   * Whether this shop has never once produced live data.
   *
   * Still a tiebreak, for the reason the harvest gave when it made this the
   * whole ordering: a shop with no working route fails in seconds, so asking
   * it costs almost nothing, and it is the one whose answer is unknown. It is
   * only a tiebreak now, because "never asked" already sorts first and a shop
   * that IS asked every run no longer needs to be first to be asked at all.
   */
  neverLive: boolean;
}

/**
 * The order to ask shops in: longest-unasked first.
 *
 * Ties break on never-live, then on the order given, so a run with no cursor
 * at all reproduces the old never-live-first registry order exactly. That
 * matters on the first run after this ships, and on any run whose cursor was
 * lost.
 */
export function sweepOrder<T extends SweepCandidate>(
  shops: readonly T[],
  cursor: HarvestCursor,
): T[] {
  return shops
    .map((shop, index) => ({ shop, index }))
    .sort((a, b) => {
      // '' for a shop never asked, which sorts before every real ISO stamp.
      const aAt = cursor.attempted[a.shop.id] ?? '';
      const bAt = cursor.attempted[b.shop.id] ?? '';
      if (aAt !== bAt) return aAt < bAt ? -1 : 1;
      if (a.shop.neverLive !== b.shop.neverLive) return a.shop.neverLive ? -1 : 1;
      return a.index - b.index;
    })
    .map((e) => e.shop);
}

/** A cursor with `id` marked as asked at `at`. Pure; the caller writes it. */
export function withAttempt(cursor: HarvestCursor, id: string, at: string): HarvestCursor {
  return { ...cursor, attempted: { ...cursor.attempted, [id]: at } };
}

/**
 * A cursor with `id` marked as having spent a real Apify actor render at `at`.
 * Pure; the caller writes it.
 *
 * Spread over the whole cursor, not just its own map, for the reason
 * withAttempt now is too: these two maps are written by different call sites
 * at different moments in the same run, and a rebuild-from-one-field would
 * silently drop whichever the other had just recorded. A dropped `attempted`
 * stamp starves a shop; a dropped `actorRendered` stamp spends money.
 */
export function withActorRender(cursor: HarvestCursor, id: string, at: string): HarvestCursor {
  return { ...cursor, actorRendered: { ...cursor.actorRendered, [id]: at } };
}

/** When this shop last spent an actor render, or null if it never has. */
export function lastActorRender(cursor: HarvestCursor, id: string): string | null {
  return cursor.actorRendered[id] ?? null;
}

/**
 * Ids in the cursor that are no longer shops we sweep.
 *
 * A retailer that is disabled or removed leaves its stamp behind forever
 * otherwise, and the file grows without bound. Exposed rather than applied
 * automatically because a shop absent from *this* run's list may simply have
 * been narrowed out by `--shop=`, and dropping its stamp then would quietly
 * send it to the front of the next full sweep.
 */
export function staleCursorIds(cursor: HarvestCursor, known: readonly string[]): string[] {
  const live = new Set(known);
  return Object.keys(cursor.attempted).filter((id) => !live.has(id));
}
