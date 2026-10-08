/**
 * Deal of the Day VIDEO: the same deal as the daily picture post, as a 10
 * second 9:16 clip (1080 x 1920, H.264) made from the shared video template
 * (scripts/social-video-template.ts, rules in docs/SOCIAL-MEDIA-PLAN.md
 * section 9).
 *
 *   npx tsx scripts/social-video-deal.ts --id <fragrance id>      a chosen deal
 *   npx tsx scripts/social-video-deal.ts                          the next deal by the daily rules
 *   npm run social:video -- --id <fragrance id>
 *
 *   --date YYYY-MM-DD       the date shown (default: today, UK)
 *   --out <folder>          default social/posts/<date>-deal-video-<product slug>
 *   --name <text>           show this shorter name (a name too long to fit is refused, never cut)
 *   --checked-at <ISO>      when the price was last confirmed by hand, if later than the crawl
 *   --allow-brand-repeat    post a brand inside its seven day rest (recorded in check.json)
 *   --skip-live-check       do not look the product link up on the live site
 *   --dry-run               say what would be made, write nothing
 *   --keep-frames           keep the drawn frames in _frames/ (git ignores them)
 *
 * Where the figures come from: the deal is the one the daily post would make
 * (`dealFor` in social-deal-of-day.ts: the product page's own MSRP and
 * cheapest boxes), and it must also be in demo/deals.generated.ts with the
 * same shop, price and brand price. If the two disagree nothing is made. No
 * figure is typed anywhere in this file.
 *
 * It writes the video, caption.txt, tiktok-caption.txt, check.json and
 * source.md. It does not touch social/deal-of-the-day-history.json: whoever
 * posts the video as the day's deal records it there (see the plan).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { DEALS_GENERATED_AT, DEALS_RAW } from '../demo/deals.generated.js';
import { CRAWLED_AT } from '../demo/catalogue.generated.js';
import { tiktokCaption } from './socialRender.js';
import {
  BRAND_REST_DAYS,
  caption,
  chooseFrom,
  dealFor,
  liveCheck,
  photoDataUri,
  restingBrands,
  type HistoryEntry,
  type Pick,
} from './social-deal-of-day.js';
import { renderVideo } from './social-video-render.js';
import { DEAL_VIDEO, dealScenes, undash, type DealVideoData } from './social-video-template.js';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = 'https://pricesniffs.space';
const HISTORY = join(ROOT, 'social', 'deal-of-the-day-history.json');
const VIDEO_FILE = 'deal-video-9x16.mp4';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const brandKey = (brand: string) => brand.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The deal as demo/deals.generated.ts lists it, or why it does not. */
export function dealsListEntry(p: Pick) {
  const raw = DEALS_RAW.find((d) => d.fragranceId === p.frag.id);
  if (!raw) return { ok: false as const, reason: `${p.frag.id} is not in demo/deals.generated.ts` };
  const problems: string[] = [];
  if (raw.retailerId !== p.best.retailer.id) problems.push(`shop ${raw.retailerId} against ${p.best.retailer.id}`);
  if (raw.price !== p.delivered) problems.push(`price ${raw.price} against ${p.delivered}`);
  if (raw.wasPrice !== p.msrp) problems.push(`brand price ${raw.wasPrice} against ${p.msrp}`);
  if (raw.kind !== 'house') problems.push(`reference is "${raw.kind}", not the brand's own price`);
  if (!raw.delivered) problems.push('delivery not stated');
  return problems.length ? { ok: false as const, reason: `${p.frag.id}: ${problems.join('; ')}` } : { ok: true as const, raw };
}

const slugPart = (p: Pick) => p.frag.slug.replace(/_/g, '-');

async function main() {
  const today = opt('--date') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const history: HistoryEntry[] = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : [];

  let p: Pick;
  const forced = opt('--id');
  if (forced) {
    const frag = DEMO_FRAGRANCES.find((f) => f.id === forced);
    const deal = frag && dealFor(frag);
    if (!deal) throw new Error(`${forced} does not qualify as a deal on today's data`);
    const rest = restingBrands(history, today).get(brandKey(deal.frag.brand));
    if (rest && !flag('--allow-brand-repeat')) {
      throw new Error(`${deal.frag.brand} was posted on ${rest.lastPosted} and a brand rests ${BRAND_REST_DAYS} days. Add --allow-brand-repeat to go on.`);
    }
    if (history.some((h) => h.id === deal.frag.id && h.date !== today)) throw new Error(`${deal.frag.id} has been posted as a Deal of the Day before.`);
    p = deal;
  } else {
    const choice = chooseFrom(DEMO_FRAGRANCES.map(dealFor).filter((d): d is Pick => d !== null && dealsListEntry(d).ok), history, today);
    if (choice.pick === null) throw new Error(choice.reason);
    p = choice.pick;
  }

  const listed = dealsListEntry(p);
  if (!listed.ok) throw new Error(listed.reason);

  const url = `${SITE}/${p.frag.slug}`;
  const checkedAt = new Date(opt('--checked-at') ?? p.best.fetchedAt ?? CRAWLED_AT);
  const checked = `${checkedAt.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} UK, ${checkedAt.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' })}`;
  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const outDir = resolve(ROOT, opt('--out') ?? join('social', 'posts', `${today}-deal-video-${slugPart(p)}`));

  console.log(`${today}: ${p.frag.brand} ${p.frag.name} ${p.frag.sizeMl ?? ''}ml ${p.delivered.toFixed(2)} at ${p.best.retailer.name}, MSRP ${p.msrp.toFixed(2)} (${p.percent}% less), checked ${checked}`);
  if (flag('--dry-run')) {
    console.log(`Would write ${outDir}. Nothing written.`);
    return;
  }

  const check = flag('--skip-live-check') ? null : liveCheck(p.frag.id, url);
  if (check && !check.ok) throw new Error(`Live link check failed for ${url}: ${JSON.stringify(check)}`);

  const data: DealVideoData = {
    name: opt('--name') ?? p.frag.name,
    sizeMl: p.frag.sizeMl,
    brand: p.frag.brand,
    photo: photoDataUri(p.frag.photoUrl!),
    shop: p.best.retailer.name,
    delivered: p.delivered,
    msrp: p.msrp,
    percent: p.percent,
    dateLabel,
    checked,
  };
  mkdirSync(outDir, { recursive: true });
  const report = await renderVideo({
    spec: DEAL_VIDEO,
    scenes: dealScenes(data),
    outDir,
    file: VIDEO_FILE,
    keepFrames: flag('--keep-frames'),
  });

  const feedCaption = caption(p, url, checked, dateLabel);
  writeFileSync(join(outDir, 'caption.txt'), feedCaption);
  writeFileSync(join(outDir, 'tiktok-caption.txt'), tiktokCaption(feedCaption));
  writeFileSync(
    join(outDir, 'check.json'),
    JSON.stringify(
      {
        id: p.frag.id,
        url,
        name: undash(`${opt('--name') ?? p.frag.name} ${p.frag.sizeMl ?? ''}ml`),
        brand: p.frag.brand,
        delivered: p.delivered,
        msrp: p.msrp,
        shop: p.best.retailer.name,
        percent: p.percent,
        pricesCheckedAt: checkedAt.toISOString(),
        dealsList: { generatedAt: DEALS_GENERATED_AT, retailerId: listed.raw.retailerId, price: listed.raw.price, wasPrice: listed.raw.wasPrice, percentOff: listed.raw.percentOff, kind: listed.raw.kind },
        photo: p.frag.photoUrl,
        brandRule: { restDays: BRAND_REST_DAYS, overridden: flag('--allow-brand-repeat') },
        liveCheck: check,
        video: { file: VIDEO_FILE, seconds: report.facts.seconds, frames: report.facts.frames, bytes: report.facts.bytes, transitions: report.timeline.transitions },
      },
      null,
      2,
    ) + '\n',
  );
  const rel = outDir.startsWith(ROOT) ? outDir.slice(ROOT.length + 1) : outDir;
  writeFileSync(
    join(outDir, 'source.md'),
    `# Source

\`${VIDEO_FILE}\` is drawn by \`scripts/social-video-deal.ts\` from the shared video template
(\`scripts/social-video-template.ts\`; rules in \`docs/SOCIAL-MEDIA-PLAN.md\` section 9). The deal is
read from the site's own data at the time (\`demo/deals.generated.ts\`, built ${DEALS_GENERATED_AT});
nothing on screen is typed in. \`check.json\` holds the figures and the video's measured length.

    npx tsx scripts/social-video-deal.ts --id ${p.frag.id} --date ${today} --out ${rel} --checked-at ${checkedAt.toISOString()}
`,
  );
  console.log(`Link for the caption: ${url}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
