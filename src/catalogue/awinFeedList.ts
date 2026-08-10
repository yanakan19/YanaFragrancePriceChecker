import { parseDelimitedText, sniffDelimiter } from './awinFeed.js';

/**
 * Parser for Awin's "Feed List Download" CSV — a different export from the
 * per-merchant product feed `awinFeed.ts` reads, listing every feed a
 * publisher can see (joined or not) with a ready-to-use download URL per row.
 * See docs/AFFILIATE_SETUP.md and Awin's own docs (Product feeds > For
 * Publishers > Product Feed List Download) for the shape this is built from.
 *
 * ── Honesty check ─────────────────────────────────────────────────────────
 * This has not been run against a real downloaded file — this sandbox
 * cannot reach ui.awin.com at all (confirmed blocked, the same as every
 * other external domain this session), so the header names below are typed
 * from Awin's own published documentation table, not read off an actual
 * response. Their docs render column headers in Title Case ("Advertiser
 * ID", "Last Imported"); the real CSV's header row may or may not match
 * that literally. Matching is done on a normalised (lowercased,
 * whitespace-stripped) form specifically to absorb that uncertainty rather
 * than assume the docs page's formatting is the wire format. The first real
 * run against this account's own feed list (scripts/awin-feed-sync.ts) is
 * the actual verification step — treat it as one.
 */

export interface AwinFeedListRow {
  advertiserId: string;
  advertiserName: string;
  region: string;
  membershipStatus: string;
  feedId: string;
  feedName: string;
  language: string;
  /** Awin's own record of when this feed was last regenerated on their
   *  side — compared run to run so a sync only re-ingests a feed that has
   *  actually changed, see scripts/awin-feed-sync.ts. */
  lastImported: string;
  /** The ready-to-fetch download URL for this one feed, credentials and
   *  all. Never logged, never written to a committed file. */
  url: string;
}

const HEADER_ALIASES: Record<keyof AwinFeedListRow, string[]> = {
  advertiserId: ['advertiserid'],
  advertiserName: ['advertisername'],
  region: ['primaryregion', 'region'],
  membershipStatus: ['membershipstatus'],
  feedId: ['feedid'],
  feedName: ['feedname'],
  language: ['language'],
  lastImported: ['lastimported'],
  url: ['url'],
};

function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseAwinFeedList(csvText: string): AwinFeedListRow[] {
  const delimiter = sniffDelimiter(csvText);
  const rows = parseDelimitedText(csvText, delimiter);
  if (rows.length === 0) return [];

  const header = rows[0]!.map(normalise);
  const colIndex = (field: keyof AwinFeedListRow): number =>
    header.findIndex((h) => HEADER_ALIASES[field].includes(h));

  const indices = {
    advertiserId: colIndex('advertiserId'),
    advertiserName: colIndex('advertiserName'),
    region: colIndex('region'),
    membershipStatus: colIndex('membershipStatus'),
    feedId: colIndex('feedId'),
    feedName: colIndex('feedName'),
    language: colIndex('language'),
    lastImported: colIndex('lastImported'),
    url: colIndex('url'),
  };

  // advertiserId and url are the two fields scripts/awin-feed-sync.ts
  // cannot function without — everything else is descriptive. A feed list
  // missing either is not this parser's to guess at.
  if (indices.advertiserId === -1 || indices.url === -1) return [];

  const at = (row: string[], i: number): string => (i === -1 ? '' : (row[i] ?? '').trim());

  const out: AwinFeedListRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const advertiserId = at(row, indices.advertiserId);
    const url = at(row, indices.url);
    if (!advertiserId || !url) continue;
    out.push({
      advertiserId,
      advertiserName: at(row, indices.advertiserName),
      region: at(row, indices.region),
      membershipStatus: at(row, indices.membershipStatus),
      feedId: at(row, indices.feedId),
      feedName: at(row, indices.feedName),
      language: at(row, indices.language),
      lastImported: at(row, indices.lastImported),
      url,
    });
  }
  return out;
}

/**
 * The Awin merchant id a feed-list row is keyed by (`advertiserId`) already
 * lives in every Awin retailer's own `signupUrl`
 * (`https://ui.awin.com/merchant-profile/<id>`) — read it from there rather
 * than adding a second field to `AffiliateConfig` that could quietly drift
 * out of sync with it. Used by scripts/awin-feed-sync.ts to match a
 * `RETAILERS` entry to its row in the feed list.
 */
export function awinMerchantIdFromSignupUrl(signupUrl: string | null): string | null {
  if (!signupUrl) return null;
  return signupUrl.match(/merchant-profile\/(\d+)/)?.[1] ?? null;
}
