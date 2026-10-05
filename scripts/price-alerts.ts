/**
 * Daily price drop emails for wishlist items (queue item 4.1).
 *
 *   npm run alerts:send                     # dry run: reads, plans, sends nothing
 *   DRY_RUN=false npm run alerts:send       # the real thing (the scheduled job)
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY and RESEND_API_KEY in the environment
 * (GitHub secrets in .github/workflows/price-alerts.yml). Without either it
 * prints "not configured" and exits 0, before loading anything else.
 *
 * Prices come from the committed catalogue (demo/catalogue.generated.ts)
 * through the very functions the product page uses: buildComparison sorted by
 * delivered price, then bestOffer. So the figure in an email is the figure
 * the reader sees when they click through, as of the last crawl.
 *
 * The rules, the email and the run itself live in src/alerts/ and are tested
 * there without a network. This file only wires real things together.
 * It never prints an email address, a token or a key.
 */
import { notConfiguredMessage, readAlertConfig } from '../src/alerts/config.js';

async function main(): Promise<void> {
  const config = readAlertConfig(process.env);
  if (!config.configured) {
    console.log(notConfiguredMessage(config.missing));
    return;
  }

  // Loaded only once configured: the catalogue is large, and an unconfigured
  // run has no reason to pay for it.
  const [{ createClient }, { SUPABASE_URL }, { SITE_URL }, { COMPANY }, catalogue, data, prices, store, provider, run, resolver, dormant] =
    await Promise.all([
      import('@supabase/supabase-js'),
      import('../demo/supabase.js'),
      import('../demo/head.js'),
      import('../demo/legal.js'),
      import('../demo/catalogue.generated.js'),
      import('../demo/data.js'),
      import('../src/services/priceService.js'),
      import('../src/alerts/supabaseStore.js'),
      import('../src/alerts/provider.js'),
      import('../src/alerts/run.js'),
      import('../src/services/wishlistResolve.js'),
      import('../demo/dormant.generated.js'),
    ]);

  const now = new Date();
  // A saved id is looked up by the product it stands for today: one that was
  // merged into another (ID_ALIASES) is priced as the survivor. The wishlist
  // row itself keeps the id the reader saved.
  const priceFor: import('../src/alerts/run.js').PriceLookup = (savedId) => {
    const fragranceId = resolver.resolveFragranceId(savedId, dormant.ID_ALIASES, (id) => data.fragranceById(id) !== undefined);
    if (fragranceId === null) return null;
    const frag = data.fragranceById(fragranceId);
    if (!frag) return null;
    const best = prices.bestOffer(prices.buildComparison(catalogue.offersFor(fragranceId), { sortBy: 'delivered', now }));
    const size = frag.sizeMl === null ? '' : ` ${frag.sizeMl}ml`;
    return {
      price: best?.deliveredPriceGbp ?? null,
      shop: best?.retailer.name ?? '',
      name: `${frag.brand} ${frag.name}, ${frag.concentration}${size}`,
      slug: frag.slug,
      id: fragranceId,
    };
  };

  const client = createClient(SUPABASE_URL, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  console.log(`Price alerts: ${config.dryRun ? 'dry run' : 'live run'}, catalogue crawled ${catalogue.CRAWLED_AT}.`);
  const summary = await run.runPriceAlerts({
    store: store.supabaseAlertStore(client),
    provider: provider.resendProvider({ apiKey: config.resendApiKey, from: config.from, replyTo: COMPANY.email }),
    priceFor,
    siteUrl: SITE_URL,
    now,
    dryRun: config.dryRun,
    log: (line) => console.log(line),
  });

  // A failed send is reported, and the job still exits 0: the drops stay
  // pending and go out on the next run, and a red run would only mean
  // someone has to look at a log that already says what happened.
  console.log(JSON.stringify(summary));
}

main().catch((err: unknown) => {
  // Message only, never the error object: a thrown fetch error can carry the
  // request it was making.
  console.error(`Price alerts failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  process.exitCode = 1;
});
