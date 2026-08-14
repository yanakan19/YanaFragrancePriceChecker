/**
 * Which Awin advertisers has this account actually been accepted onto?
 *
 *   npm run awin:memberships
 *
 * The question this answers came up because the feed sync's own log line —
 * "910 feed(s) visible on this Awin account" — is easy to misread as 910
 * approvals. It is not. Awin's feed list carries every feed the account can
 * see, and `membershipStatus` is the column that says which of those are
 * programmes the account has actually joined. This script reads that column
 * and nothing else of consequence, so "have I been accepted onto anything
 * new" stops being a question anybody has to log in and eyeball.
 *
 * It also cross-references the registry, because the useful form of the
 * answer is not a list of names, it is the difference: joined advertisers
 * this project does not yet list, and listed retailers whose membership is
 * not what src/config/retailers.ts claims it is.
 *
 * Safety, same rules as scripts/awin-feed-diag.ts: this prints advertiser
 * names, advertiser ids, membership statuses and counts. It never prints a
 * feed URL — those carry the account's credentials in the query string — and
 * never prints `process.env` or the feed list URL itself. Advertiser ids are
 * public (they are the merchant-profile numbers already recorded in the
 * registry), so printing them is what makes the output actionable.
 *
 * Runs in CI, not from the dev sandbox: the feed list host is unreachable
 * from there, the same reason the feed sync and the diagnostic both run in
 * the workflow. Dispatch `.github/workflows/catalogue-daily.yml` with
 * `awin_memberships: true`.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { parseAwinFeedList, awinMerchantIdFromSignupUrl } from '../src/catalogue/awinFeedList.js';

/**
 * Statuses that mean "this programme has accepted us".
 *
 * Matched case-insensitively on a normalised string rather than by equality,
 * because the exact wording is Awin's to change and a status this script does
 * not recognise must never be silently counted as a rejection. Anything
 * unrecognised is reported under its own literal name in the breakdown below,
 * so a new status shows up as a question rather than disappearing.
 */
const JOINED = new Set(['joined', 'active', 'approved', 'accepted']);

function norm(s: string): string {
  return s.trim().toLowerCase();
}

async function main(): Promise<void> {
  const listUrl = process.env.AWIN_FEED_LIST_URL;
  if (!listUrl) {
    console.error(
      'AWIN_FEED_LIST_URL is not set. This script only runs where that secret is ' +
        'available — see the workflow, not the dev sandbox.',
    );
    process.exitCode = 1;
    return;
  }

  const http = createHttp();
  const res = await http(listUrl, { 'user-agent': 'PriceSniffsBot/0.2' });
  if (!res.ok || !res.body) {
    // Deliberately does not echo the URL or the body: both can carry credentials.
    console.error(`Could not read the Awin feed list (HTTP ${res.status}).`);
    process.exitCode = 1;
    return;
  }

  const rows = parseAwinFeedList(res.body);
  console.log(`Awin membership check`);
  console.log(`${rows.length} feed row(s) visible on this account\n`);

  // One advertiser can publish several feeds; the membership is per advertiser,
  // so collapse before counting or the totals overstate every multi-feed
  // merchant.
  const byAdvertiser = new Map<string, { name: string; status: string; feeds: number }>();
  for (const r of rows) {
    const prev = byAdvertiser.get(r.advertiserId);
    if (prev) prev.feeds += 1;
    else
      byAdvertiser.set(r.advertiserId, {
        name: r.advertiserName,
        status: r.membershipStatus,
        feeds: 1,
      });
  }

  const statusCounts = new Map<string, number>();
  for (const a of byAdvertiser.values()) {
    const k = a.status || '(blank)';
    statusCounts.set(k, (statusCounts.get(k) ?? 0) + 1);
  }

  console.log('Advertisers by membership status:');
  for (const [status, n] of [...statusCounts].sort((a, b) => b[1] - a[1])) {
    const joined = JOINED.has(norm(status)) ? '  <- counts as accepted' : '';
    console.log(`  ${String(n).padStart(5)}  ${status}${joined}`);
  }

  const accepted = [...byAdvertiser.entries()]
    .filter(([, a]) => JOINED.has(norm(a.status)))
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\n${accepted.length} advertiser(s) this account has been accepted onto:`);
  for (const a of accepted) {
    console.log(`  ${a.id.padStart(7)}  ${a.name}`);
  }

  // ── The part that is actually actionable ────────────────────────────────
  // The registry records a merchant id per retailer, either directly or
  // inside its Awin signup URL. Matching on that id rather than on the name
  // is deliberate: advertiser names in the feed list carry market and entity
  // noise ("(UK)", "Ltd") that no name comparison survives reliably, and a
  // wrong match here would tell somebody a programme is live when it is not.
  const registryIds = new Map<string, string>();
  for (const r of RETAILERS) {
    if (r.affiliate.network !== 'awin') continue;
    const id = awinMerchantIdFromSignupUrl(r.affiliate.signupUrl);
    if (id) registryIds.set(id, r.id);
  }

  const unlisted = accepted.filter((a) => !registryIds.has(a.id));
  console.log(
    `\n${unlisted.length} accepted advertiser(s) with no entry in src/config/retailers.ts.`,
  );
  console.log(
    'These are not automatically worth adding — most of an Awin account\'s joined\n' +
      'programmes will be irrelevant to fragrance. Read the names and pick.',
  );
  for (const a of unlisted) console.log(`  ${a.id.padStart(7)}  ${a.name}`);

  const listedNotAccepted = [...registryIds.entries()].filter(([id]) => {
    const a = byAdvertiser.get(id);
    return !a || !JOINED.has(norm(a.status));
  });
  if (listedNotAccepted.length > 0) {
    console.log(
      `\n${listedNotAccepted.length} registry retailer(s) not showing as accepted in the feed list:`,
    );
    for (const [id, retailerId] of listedNotAccepted) {
      const a = byAdvertiser.get(id);
      console.log(`  ${id.padStart(7)}  ${retailerId} — ${a ? a.status : 'not in the feed list'}`);
    }
    // The distinction in that last column is the whole point, and the first
    // version of this script got it wrong — it printed both cases under
    // "membership is NOT accepted", which overstates the second one badly.
    //
    // A row carrying an explicit status ("Not Joined") is Awin stating the
    // membership, and a registry entry claiming 'active' against it is a real
    // contradiction.
    //
    // A row reading "not in the feed list" proves far less. This is a list of
    // FEEDS: an advertiser that has accepted us but publishes no product feed
    // does not appear in it at all, and is indistinguishable here from one
    // that never accepted us. Treat it as a prompt to open the dashboard,
    // never as evidence on its own that a programme is dead.
    console.log(
      "  'Not Joined' against a registry status of 'active' is a real contradiction.\n" +
        "  'not in the feed list' is not: an accepted advertiser publishing no feed\n" +
        '  is absent here too. Check the Awin dashboard before concluding anything.',
    );
  }
}

main().catch((err) => {
  console.error(`awin:memberships failed: ${String(err?.message ?? err)}`);
  process.exitCode = 1;
});
