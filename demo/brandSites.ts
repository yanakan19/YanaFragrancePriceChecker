import { marketOf } from '../src/catalogue/brandSiteCheck.js';

/**
 * Verified official brand websites, keyed by brand name.
 *
 * Populated one brand at a time as each site is actually looked up and
 * confirmed as the brand's own homepage — never guessed from a plausible
 * domain pattern. A brand with no entry here simply has no website line on
 * its profile page, the same "absent rather than invented" rule the rest of
 * this registry runs on (see the `blurb` field on Retailer for the same
 * discipline applied to retailers).
 *
 * ── Re-measured 2026-08-25, by the same method as the 2026-08-19 note that
 * follows (buildBrandCanon() over every "brand" field on every product in
 * demo/catalogue.generated.ts, then officialSiteFor() over each canonical
 * house, minus "Unbranded"): 14,756 products, 697 houses, 341 of them
 * resolving here — 48.9%, up from 294/697 (42.2%) before this pass. Because
 * this file was always filled from the top of the volume ranking down, the
 * house count understates the reach: 13,483 of the 14,560 products that sit
 * under a named house, 92.6%, now show a website line. The 356 houses still
 * unresolved are the long tail, and the ceiling on further work is low —
 * the 30 largest of them are 2.5% of all products between them, the top 50
 * reach 3.3%, the top 100 reach 4.8%. A further 196 products carry
 * "Unbranded", which is not a house and can never resolve.
 *
 * Measured 2026-08-19 by running buildBrandCanon() from src/catalogue/
 * brandName.ts — the module that actually decides one canonical display
 * spelling per house — over every "brand" field on every product in the live
 * CATALOGUE array (demo/catalogue.generated.ts), including repeats (the
 * counts are what buildBrandCanon uses to break casing ties), then checking
 * each canonical name against this file with officialSiteFor(), minus
 * "Unbranded" (a feed artifact, not a house; see the worklist comment
 * below). That is a stricter count than a raw grep-and-dedupe of the feed
 * strings: it collapses "ARMAF"/"Armaf", "Paco Rabanne"/"Rabanne" and similar
 * pairs to one house the way the app itself does, rather than counting each
 * spelling separately. By that measure the live catalogue currently carries
 * 629 real houses (this number moves as the harvest runs, so treat it as
 * "the count on the day someone last measured it," not a fixed total — a
 * prior version of this comment claimed 662 by the same method; this pass
 * could not reproduce that figure by re-running buildBrandCanon() the same
 * way and is reporting what it actually measured rather than carrying the
 * old number forward unchecked). 271 of those 629 resolve here as of this
 * measurement (43.1%, re-measured after this pass's own additions — 253/629
 * was the count at the start of the pass, before the CI dead-link fixes and
 * new brands below). This list is still only the highest-volume brands so
 * far, not a finished set.
 */
/**
 * ── CI brand:probe sweep, 2026-08-19 (GitHub Actions run 32241839615) ───────
 *
 * A scheduled run of `npm run brand:probe` followed every link below and
 * reported 22 "dead", 1 "redirected-domain" and 2 "redirected-region"
 * findings, plus 8 "could-not-ask" (robots.txt did not answer, so the probe
 * never actually requested the page — not evidence of a broken link, and
 * left untouched here: britney spears, byredo, elie saab, gissah, lush,
 * marc jacobs, victoria s secret, viktor rolf).
 *
 * Each of the 25 real findings was re-checked by web search (this sandbox
 * still cannot fetch the pages directly). Four were genuine and are fixed at
 * their own entries below, each with its own dated comment: acqua di parma
 * (real HTTP 404 — the /en_gb/ path is gone), louis vuitton and van cleef
 * arpels (root domain existed but a working UK-marked page was found and
 * substituted), and moschino (the declared path now redirects to a renamed
 * one, so the entry was pointed straight at where it lands). Lattafa and al
 * haramain's "redirected" findings turned out to be the probe's own
 * documented caveat — a CI runner outside the UK/target region getting
 * geo-bounced somewhere a real visitor would not — not a real fault; each is
 * noted inline rather than changed.
 *
 * The other 18 "dead" findings (bvlgari, by kilian/kilian, calvin klein,
 * chanel, clinique, emporio armani/giorgio armani, est e lauder, frederic
 * malle, gucci, jimmy choo, jo malone/jo malone london, lacoste, lanc me,
 * michael kors, mugler, nishane, phlur, prada, versace) were all confirmed
 * by search as still the brand's own current site — the "dead" verdict came
 * from an HTTP 403 (a bot-defence block reacting to the probe's plain,
 * non-browser request — extremely common on major luxury retail platforms,
 * not evidence the address is wrong) or an AbortError (the request timing
 * out, not the page being gone). None of those 18 needed a change; none are
 * commented individually below to avoid scattering the same note 18 times.
 */
export const BRAND_SITES: Record<string, string> = {
  'calvin klein': 'https://www.calvinklein.co.uk/',
  'dolce gabbana': 'https://www.dolcegabbana.com/en-gb/beauty/',
  // Job B pass, 2026-08-22: swapped the bare global root for the brand's own
  // UK-marked fragrance page (rabanne.com/uk/en_GB/...), confirmed live by
  // search under the same domain.
  'paco rabanne': 'https://www.rabanne.com/uk/en_GB/fragrance/homepagefragrance',
  rabanne: 'https://www.rabanne.com/uk/en_GB/fragrance/homepagefragrance',
  // Job B pass, 2026-08-22: same swap — carolinaherrera.com/uk/en/... is the
  // brand's own UK-marked page, confirmed live by search.
  'carolina herrera': 'https://www.carolinaherrera.com/uk/en/c/fragrances',
  'jean paul gaultier': 'https://www.jeanpaulgaultier.com/uk/en/',

  // ── Middle Eastern / Arabic houses, resolved 2026-08-05 ──────────────────
  // This session's own network is locked at the gateway (confirmed: even a
  // plain fetch to example.com is rejected by the proxy), so none of these
  // were opened directly the way the rest of this file's entries were. Each
  // one comes from a web search that returned the domain from the house's
  // own site content (a shipping page, an About page, a contact address) —
  // stronger than a guessed pattern, weaker than actually opening the page.
  // Treat these as the starting point for the next confirmation pass, not
  // page-verified facts.
  'french avenue': 'https://uk.shopfrenchavenue.com/',
  armaf: 'https://armaf.uk/',
  // The CI brand:probe sweep (run 32241839615) flagged this as
  // "redirected-region" because the runner landed on /en-us — search still
  // confirms alharamainperfumes.co.uk itself as the brand's own UK store
  // (Barking-based, free UK delivery over £50), so this reads as the probe's
  // own documented caveat (a CI runner outside the UK can get bounced to a
  // different region than a real UK visitor would) rather than a real fault.
  // Left unchanged.
  'al haramain': 'https://alharamainperfumes.co.uk/',
  riiffs: 'https://uk.riiffsperfumes.com/',
  // Bellavita Luxury (bellavitaluxury.uk) — the UK "luxury-inspired
  // fragrance dupes" business. Not to be confused with Bella Vita Organic
  // (bellavitaorganic.com), an unrelated Indian skincare brand that also
  // trades as "Bellavita" — if that second business ever enters the
  // catalogue under the same normalised key, this entry would wrongly send
  // its customers to the fragrance site instead.
  bellavita: 'https://bellavitaluxury.uk/',
  // Same business, fuller feed string: "BellaVita Luxury (UK)".
  'bellavita luxury uk': 'https://bellavitaluxury.uk/',
  // brandName.ts's own canon for this house is "Bellavita UK", which
  // normalizes to this key — added 2026-08-17 after an audit found the two
  // keys above no longer matched anything live: every current listing
  // resolves to "Bellavita UK" now, so without this key the already-verified
  // URL was silently unreachable.
  'bellavita uk': 'https://bellavitaluxury.uk/',
  ibraq: 'https://ibraquk.com/',
  assaf: 'https://assaf.ae/',
  'gulf orchid': 'https://shop-gulforchid.com/',
  'maison asrar': 'https://maisonasrar.com/',
  // Job B pass, 2026-08-22: ahmedalmaghribi.uk titles itself "Ahmed Al
  // Maghribi Perfumes UK – Official Site" directly, replacing the UAE
  // (ae.) storefront this entry pointed a UK reader to before.
  'ahmed al maghribi': 'https://www.ahmedalmaghribi.uk/',
  // The CI brand:probe sweep (run 32241839615) flagged this as
  // "redirected-domain" because the runner landed on lattafa-usa.com —
  // search still confirms lattafa.com itself as the brand's official global
  // shop (Copyright Lattafa Perfumes, its own /shop/ page live), with
  // lattafa-usa.com a separate regional storefront the .com root can bounce
  // a non-UK visitor to, the same region-detection caveat as al haramain
  // above. Left unchanged.
  lattafa: 'https://lattafa.com/',
  // Catalogue also carries this house as plain "Lattafa Perfumes" — same
  // company, same site, just the fuller trading name some feeds use.
  'lattafa perfumes': 'https://lattafa.com/',
  surrati: 'https://surrati.ae/',
  'surrati perfumes': 'https://surrati.ae/',
  rayhaan: 'https://rayhaanperfumes.com/',
  'rayhaan perfumes': 'https://rayhaanperfumes.com/',
  'paris corner': 'https://pariscorner.ae/',
  'arabiyat prestige': 'https://arabiyatprestige.shop/',
  // "Arabiyat" alone in some feeds; Arabiyat Prestige is the full trading name.
  arabiyat: 'https://arabiyatprestige.shop/',
  mykonos: 'https://officialmykonos.com/',
  bujairami: 'https://bujairami.ae/',
  // Sub-brand of Afnan Perfumes (same founder, Imran Fazlani), launched 2023,
  // with its own UK subdomain — hence a retailers.ts entry rather than a house.
  zimaya: 'https://uk.zimayaperfumes.com/',

  // ── Added 2026-08-05 on request. UK storefront preferred where the brand
  // runs one, because that is the site a UK reader should land on.
  kayali: 'https://uk.kayali.com/',
  // Zara's fragrance aisle rather than its homepage: linking a reader chasing
  // a perfume into a fashion storefront's front door is a dead end.
  'maison alhambra': 'https://maisonalhambra.co/',
  // The brand's own global site. arabianperfumes.uk is their stated sole UK
  // distributor, which is a shop rather than the brand, so it belongs in the
  // retailer registry if anywhere and not on this button.
  // Job B pass, 2026-08-22: swapped the bare global root for the brand's own
  // uk. subdomain (uk.swissarabian.com), confirmed by its own dealer social
  // account (@SwissArabianUK) and a UK-specific Trustpilot/contact-email
  // pattern (Customercare@swissarabianuk.co.uk) tying it to the same house.
  'swiss arabian': 'https://uk.swissarabian.com/',
  'fragrance world': 'https://fragranceworld.ae/',
  ajmal: 'https://www.ajmal.com/',
  dumont: 'https://www.dumontparis.com/',
  'dumont paris': 'https://www.dumontparis.com/',
  // Catalogue spells it "Al-Rehab"; normalizeBrand below turns the hyphen
  // into a space, so the key has to carry that space too, or this lookup
  // silently misses despite the URL already being verified. (Was "alrehab",
  // with no space, which never matched — caught in the 2026-08-10 brand
  // storefront-link audit.)
  'al rehab': 'https://www.alrehab.com/',
  // Two houses, one perfumer (Alessandro Gualtieri), separate storefronts.
  'orto parisi': 'https://ortoparisi.com/',
  nasomatto: 'https://nasomatto.com/',
  gissah: 'https://gissahuae.com/',
  reef: 'https://www.reef-parfum.com/en/',
  'al wataniah': 'https://www.alwataniah.com/',
  'sol de janeiro': 'https://soldejaneiro.com/',
  lush: 'https://www.lush.com/uk/en',
  'bdk parfums': 'https://bdkparfums.com/en',
  amouage: 'https://amouage.com/',
  khadlaj: 'https://www.khadlaj-perfumes.co.uk/',
  zara: 'https://www.zara.com/uk/en/woman-accessories-perfumes-l1017.html',
  'bath body works': 'https://www.bathandbodyworks.co.uk/',
  // Elysia has no entry: search turned up only individual perfume names
  // ("Elysia Vanilla", "Elysia Elegance") sold under Fragrance World, not a
  // standalone Elysia storefront — there is no site to link to yet.

  // ── Added 2026-08-05, confirmation pass against a ~130-brand volume list.
  // Every URL below came back as the brand's own domain in a web search this
  // session actually ran (title + snippet showing it as the official site),
  // not a guess. A few carry a specific caveat inline because the search
  // didn't fully resolve one — noted rather than smoothed over.
  // Fixed 2026-08-19 after the CI brand:probe sweep (GitHub Actions run
  // 32241839615) flagged this as a genuine HTTP 404, not the bot-blocking
  // false positive most of that sweep's other "dead" findings turned out to
  // be: the underscore path (en_gb) is gone, the site now serves the same UK
  // storefront at a slash path instead (en/gb) — confirmed by search results
  // landing on acquadiparma.com/en/gb/store-locator, /fragrances/... etc.
  'acqua di parma': 'https://www.acquadiparma.com/en/gb/',
  // Job B pass, 2026-08-22: uk.afnan.com is the brand's own UK subdomain
  // (its own /pages/about-us and /pages/our-stores pages), replacing the
  // global root.
  afnan: 'https://uk.afnan.com/',
  chanel: 'https://www.chanel.com/gb/',
  dior: 'https://www.dior.com/en_gb/beauty/fragrance/home',
  gucci: 'https://www.gucci.com/uk/en_gb/',
  // UK-specific fragrance path not separately confirmed; this is the main
  // Hermès site with a general fragrance category.
  'herm s': 'https://www.hermes.com/uk/en/',
  // Job B pass, 2026-08-22: tomfordbeauty.co.uk is the brand's own UK store
  // (its own /store-locator and /products/fragrance pages), replacing the
  // US .com root.
  'tom ford': 'https://www.tomfordbeauty.co.uk/products/fragrance',
  // Job B pass, 2026-08-22: yslbeauty.co.uk is the brand's own UK store
  // (Trustpilot lists it as a distinct reviewed site from the .com/.co.uk
  // pair the way lancome.co.uk does elsewhere in this file), replacing the
  // international path.
  'yves saint laurent': 'https://www.yslbeauty.co.uk/',
  // Only the US beauty domain turned up in search; no UK-specific one found.
  'giorgio armani': 'https://www.giorgioarmanibeauty-usa.com/',
  // Emporio Armani fragrances are produced and sold through the same Giorgio
  // Armani Beauty business, not a separate storefront.
  'emporio armani': 'https://www.giorgioarmanibeauty-usa.com/',
  burberry: 'https://uk.burberry.com/',
  // Job B pass, 2026-08-22: bulgari.com/en-gb/fragrances is the brand's own
  // UK-marked fragrance page, confirmed live by search under the same
  // domain, replacing the bare global root.
  bvlgari: 'https://www.bulgari.com/en-gb/fragrances',
  // Job B pass, 2026-08-22: prada.com/gb/en/... is the brand's own UK site
  // (prada.com itself, not the separate pradabeauty.co.uk storefront —
  // that domain's ownership by Prada was not independently confirmed the
  // way prada.com/gb/en was), replacing the beauty-only global root.
  prada: 'https://www.prada.com/gb/en/perfumes-and-beauty/fragrances/c/10566EU',
  // Updated 2026-08-19: a UK storefront does exist after all
  // (uk.louisvuitton.com/eng-gb/), confirmed live by search (perfumes,
  // stories and product pages all resolving under it) — the earlier note
  // above was wrong that only the US site could be found. Swapped from the
  // US root the CI brand:probe sweep (run 32241839615) flagged as a 403/
  // bot-block "dead" finding to this UK one.
  'louis vuitton': 'https://uk.louisvuitton.com/eng-gb/homepage',
  versace: 'https://www.versace.com/gb/en/fragrances/',
  // Multiple Valentino beauty domains exist (valentino.com, valentino-beauty.us,
  // valentino-beauty.co.uk); this is the brand's own primary site.
  valentino: 'https://www.valentino.com/en-gb/experience/valentino-beauty',
  // Updated 2026-08-19: pointed at the UK fragrance collection path directly
  // (confirmed live by search) rather than the bare root the CI brand:probe
  // sweep (run 32241839615) flagged as "dead" — same domain, same house,
  // just a more specific and UK-marked address.
  'van cleef arpels': 'https://www.vancleefarpels.com/gb/en/collections/fragrances.html',
  guerlain: 'https://www.guerlain.com/uk/en-uk/fragrance/',
  'lanc me': 'https://www.lancome.co.uk/',
  'jo malone london': 'https://www.jomalone.com/',
  // Catalogue also carries this house as plain "Jo Malone".
  'jo malone': 'https://www.jomalone.com/',
  'penhaligon s': 'https://www.penhaligons.com/',
  creed: 'https://creedfragrances.co.uk/',
  diptyque: 'https://www.diptyqueparis.com/',
  byredo: 'https://www.byredo.com/',
  'le labo': 'https://www.lelabofragrances.com/',
  'narciso rodriguez': 'https://www.narcisorodriguezparfums.com/',
  'clive christian': 'https://www.clivechristian.com/',
  'serge lutens': 'https://www.sergelutens.co.uk/',
  'ariana grande': 'https://arianagrandefragrances.com/',
  avon: 'https://avon.uk.com/',
  azzaro: 'https://www.azzaro.com/',
  'boadicea the victorious': 'https://boadiceaperfume.com/',
  'bond no': 'https://www.bondno9.com/',
  'britney spears': 'https://britneyspearsperfumes.com/',
  'by kilian': 'https://www.bykilian.com/',
  // Catalogue also carries this house as plain "Kilian".
  kilian: 'https://www.bykilian.com/',
  // Casamorati is a Xerjoff sub-line, not a separate company — this is its
  // collection page on Xerjoff's own site, not an independent storefront.
  casamorati: 'https://www.xerjoff.com/en-us/collections/casamorati-perfumes',
  // Live feeds now carry this house as "CASAMORATI DAL 1888" (normalizeBrand
  // strips the digits, leaving "casamorati dal") rather than plain
  // "Casamorati" — added 2026-08-17 after an audit found the key above no
  // longer matched any live listing, orphaning the already-verified URL.
  'casamorati dal': 'https://www.xerjoff.com/en-us/collections/casamorati-perfumes',
  chloe: 'https://www.chloe.com/en-gb/c/fragrances',
  'comme des garcons': 'https://comme-des-garcons-parfum.com/',
  'demeter fragrance': 'https://demeterfragrance.com/',
  'elizabeth arden': 'https://www.elizabetharden.co.uk/',
  'essential parfums': 'https://www.essentialparfums.com/en',
  // Site returned a maintenance notice when checked; domain is still the
  // brand's own registered one, kept here rather than dropped.
  'etat libre d orange': 'https://www.etatlibredorange.com/',
  'ex nihilo': 'https://www.ex-nihilo-paris.com/',
  'filippo sorcinelli': 'https://filipposorcinelli.com/en',
  'frederic malle': 'https://www.fredericmalle.com/',
  // "Frédéric Malle" — the catalogue's own canonical spelling keeps the
  // accents, and normalizeBrand is ASCII-only, so both é's drop out as
  // punctuation rather than folding to "e", leaving this as a second,
  // narrower key rather than a duplicate of the plain-ASCII one above. Same
  // root cause as Chloé, Le Falconé and Courrèges elsewhere in this file —
  // found 2026-08-19 while measuring coverage, when this brand still showed
  // as unresolved despite the entry above already existing.
  'fr d ric malle': 'https://www.fredericmalle.com/',
  fugazzi: 'https://fugazzifragrances.com/',
  'giardini di toscana': 'https://www.giardiniditoscana.com/en',
  givenchy: 'https://www.givenchybeauty.com/gb/',
  'goldfield banks australia': 'https://www.goldfieldandbanks.com/',
  // Brazilian house; .eu is the closest confirmed site to a UK reader — no
  // .com.br turned up in search results.
  granado: 'https://www.granado.eu/',
  'hugo boss': 'https://www.hugoboss.com/uk/',
  'initio parfums prives': 'https://initioparfums.com/',
  // Catalogue also carries this house as plain "Initio".
  initio: 'https://initioparfums.com/',
  'issey miyake': 'https://uk.isseymiyake.com/',
  'juliette has a gun': 'https://www.juliettehasagun.com/en',
  kenzo: 'https://www.kenzo.com/uk/en/',
  'l artisan parfumeur': 'https://www.artisanparfumeur.com/uk/en_GB/',
  lalique: 'https://uk.lalique.com/',
  'les liquides imaginaires': 'https://www.liquidesimaginaires.com/',
  loewe: 'https://www.perfumesloewe.com/int/en_GB/',
  'lorenzo pazzaglia': 'https://www.lorenzopazzaglia.com/en/',
  'maison francis kurkdjian': 'https://www.franciskurkdjian.com/uk-en',
  'maison martin margiela': 'https://www.maisonmargiela.com/en-gb/',
  mancera: 'https://manceraparfums.com/en/',
  // Main marcjacobs.com reads US-first; mymarcjacobs.com is the brand's own
  // dedicated fragrance storefront.
  'marc jacobs': 'https://mymarcjacobs.com/',
  'marc antoine barrois': 'https://marcantoinebarrois.com/',
  'matiere premiere': 'https://matiere-premiere.com/en',
  'memo paris': 'https://www.memoparis.com/',
  'mind games': 'https://www.mindgamesfragrance.com/',
  montale: 'https://montaleparfums.com/en/',
  montblanc: 'https://www.montblanc.com/en-gb/fragrances',
  // Updated 2026-08-19: the CI brand:probe sweep (run 32241839615) found
  // this old path now redirects to /en-gb — same market, same site, the
  // site just renamed its own UK path since this entry was added. Pointed
  // straight at where it actually lands rather than leave a redirect for
  // the reader.
  moschino: 'https://www.moschino.com/en-gb',
  mugler: 'https://www.mugler.co.uk/',
  natura: 'https://www.naturabrasil.com/',
  nishane: 'https://nishane.com/',
  // Normalises to this because normalizeBrand strips the accented í as a
  // non-letter — consistent with how the same feed string would look up.
  'o botic rio': 'https://www.boticario.com/',
  'parfums de marly': 'https://parfums-de-marly.com/',
  phlur: 'https://phlur.com/',
  'ralph lauren': 'https://www.ralphlauren.co.uk/',
  // Job B pass, 2026-08-22: rasasistore.co.uk is the same Rasasi Perfumes
  // Industry LLC storefront chain as the global rasasistore.com (which
  // itself carries the same "Rasasi Perfumes 1979 - UAE" branding as the
  // corporate rasasi.com this entry pointed to before) with a UK-marked
  // domain and next-day UK delivery, rather than a third-party stockist.
  rasasi: 'https://rasasistore.co.uk/',
  // Roja Dove's own brand is sold as Roja Parfums at rojalondon.com;
  // rojadoveperfumery.com is a separate multi-brand boutique he also runs.
  'roja dove': 'https://rojalondon.com/',
  // Catalogue also carries this house as "Roja Parfums" — the brand name on
  // the bottle; "Roja Dove" is the founder's name some other feeds use.
  'roja parfums': 'https://rojalondon.com/',
  sorce: 'https://shopsorce.com/',
  'sospiro perfumes': 'https://sospirointernational.com/',
  // Catalogue also carries this house as plain "Sospiro".
  sospiro: 'https://sospirointernational.com/',
  'tiziana terenzi': 'https://tizianaterenzi.com/en/',
  // US site only — no UK-specific Victoria's Secret fragrance page found.
  'victoria s secret': 'https://www.victoriassecret.com/',
  'viktor rolf': 'https://fragrances.viktor-rolf.com/uk',
  'vilhelm parfumerie': 'https://vilhelmparfumerie.com/',
  xerjoff: 'https://www.xerjoff.com/',
  'zoologist perfumes': 'https://www.zoologistperfumes.com/',
  'd annam': 'https://dannam.co/',
  // BORNTOSTANDOUT, Maison Crivelli and We Pink have no entry: search turned
  // up only third-party retailers (Jovoy, ZGO Perfumery, Fragrantica, 50ml)
  // for all three, never a brand-owned domain — so there is no site to link
  // to yet, the same "absent rather than invented" rule as Elysia above.

  // ── Added 2026-08-10, storefront-link audit against the highest-volume
  // brands still missing an entry. This sandbox's network is still locked at
  // the gateway the same way it was on 2026-08-05 (confirmed again this
  // session: a direct fetch to any retailer/brand domain is rejected), so
  // these again come from a web search returning the domain in the result
  // itself, not from opening the page — the same caveat as the Middle
  // Eastern section above, and the same reason to treat this as a starting
  // point for the next live-confirmation pass rather than a finished list.
  'jimmy choo': 'https://www.jimmychoo.com/',
  'est e lauder': 'https://www.esteelauder.co.uk/',
  davidoff: 'https://www.zinodavidoff.com/',
  // UK fragrance category; the .com root redirects by region rather than
  // exposing one fixed UK URL.
  lacoste: 'https://www.lacoste.com/gb/',
  orientica: 'https://www.orientica.co.uk/',
  diesel: 'https://uk.diesel.com/',
  // UK-specific fragrance storefront, separate from the main eliesaab.com.
  'elie saab': 'https://eliesaabperfume.co.uk/',
  // No UK-specific path found; the .com fragrance collection is the closest.
  dkny: 'https://www.dkny.com/collections/fragrance',
  joop: 'https://www.joop.com/',
  clinique: 'https://www.clinique.co.uk/',
  'michael kors': 'https://www.michaelkors.co.uk/',
  // Ted Baker's own physical fragrance stores closed; this collection page
  // on the brand's own site is still where it sells fragrance directly.
  'ted baker': 'https://www.tedbaker.com/collections/womens-fragrance',

  // ── Alias-drift repair, 2026-08-19 ────────────────────────────────────────
  // Not new research — buildBrandCanon() in src/catalogue/brandName.ts (the
  // module that decides one canonical display spelling per house) has moved
  // since several entries above were added, so the exact string this file
  // looks up under has drifted out from under an already-verified URL, and
  // the lookup silently missed despite the URL being fine. Found by running
  // every canonical brand name in the live catalogue against BRAND_SITES and
  // checking for a near-miss (see the audit note at the head of this file for
  // how). Each line below points at the same URL as its established match
  // above; nothing here is a new site.
  'assaf trading llc': 'https://assaf.ae/', // = assaf
  alwataniah: 'https://www.alwataniah.com/', // = al wataniah
  'bujairami perfumes uae': 'https://bujairami.ae/', // = bujairami
  // Parenthesised trading name: catalogue's canonical spelling for this house
  // is "Ibrahim Al Qurashi (IBRAQ)"; normalizeBrand turns the parens into
  // spaces, so the key needs them spelled out as spaces too.
  'ibrahim al qurashi ibraq': 'https://ibraquk.com/', // = ibraq
  'gissah perfumes uae': 'https://gissahuae.com/', // = gissah
  'reef perfumes': 'https://www.reef-parfum.com/en/', // = reef
  // "Chloé" — normalizeBrand is ASCII-only ([^a-z]+), so the accented é drops
  // out as punctuation rather than folding to "e" the way brandName.ts's own
  // KNOWN_ALIASES table does for Estée Lauder and Lancôme. That leaves the
  // key as "chlo", not "chloe" — a second, narrower bug from the same root
  // cause as those two, not a new house.
  chlo: 'https://www.chloe.com/en-gb/c/fragrances', // = chloe
  'swiss arabian uae': 'https://swissarabian.com/', // = swiss arabian
  'swiss arabian global': 'https://swissarabian.com/', // = swiss arabian
  'swiss arabian ksa': 'https://swissarabian.com/', // = swiss arabian
  // Amouage's own site titles itself "Amouage – The House of Amouage"
  // (amouage.com/pages/our-story, checked 2026-08-19), so this is the fuller
  // trading name some feeds use, not a different company.
  'the house of amouage': 'https://amouage.com/', // = amouage
  // Mugler's house name before its 2021 shortening; some feeds still send it.
  'thierry mugler': 'https://www.mugler.co.uk/', // = mugler
  memo: 'https://www.memoparis.com/', // = memo paris
  // Corrected 2026-08-19: this was first added as an assumed alias of
  // "dumont" (dumontparis.com). A later search found dumontparfums.com's own
  // page titling itself "Dumont Perfumes UAE" directly — a distinct,
  // separately-run regional site, not just a drift-matched spelling of the
  // Paris one. Pointing the key at its own real match instead of the
  // assumed one.
  'dumont perfumes uae': 'https://dumontparfums.com/',
  // Maxo Parfum is a line sold through this same Dumont Perfumes UAE site.
  'maxo parfum': 'https://dumontparfums.com/collections/maxo-parfum',
  // Hugo Boss now markets its fragrance line under the bare "BOSS" name
  // (hugoboss.com/boss-fragrances-inspiration/, checked 2026-08-19); same
  // company, same site as the "hugo boss" key already above.
  boss: 'https://www.hugoboss.com/uk/', // = hugo boss
  // Sub-line of Armaf carrying the parent's own name as a prefix.
  'armaf le parfait': 'https://armaf.uk/', // = armaf

  // ── Staged confirmation sweep, 2026-08-19 ─────────────────────────────────
  // Same network limit as every earlier block: this sandbox's own egress is
  // blocked (docs/INGESTION.md), so nothing below was opened directly. Unlike
  // the earlier blocks, though, this pass had WebSearch rather than raw HTTP —
  // real search results (titles, snippets, and the URLs search actually
  // returned), read and cross-checked rather than pattern-guessed. The method
  // was staged per the brief: a plain "<brand> official site" search first; a
  // UK-targeted follow-up (co.uk, site:, "<brand> UK") wherever the first pass
  // only turned up a global address or nothing; a third pass on name variants
  // and parent-company searches for what was still unresolved. Every entry
  // below is what that process actually returned, not an inferred pattern —
  // where it returned nothing usable, the brand was left out rather than
  // guessed (see the unresolved list this same session kept in its own commit
  // message and PR notes).
  //
  // The UK/Non-UK label a reader sees is not hand-set anywhere in this file —
  // officialSiteFor computes it from the URL itself via marketOf() (see that
  // function's doc above). That classifier is deliberately narrow: it reads a
  // `.co.uk` domain, a `uk.` subdomain, or a leading `/uk/`-or-`/en-gb/`-style
  // path segment, and nothing else. Two real shapes fall through it and are
  // called out inline below rather than worked around, since reusing the
  // probe's own classifier means taking its blind spots as they are: a path
  // where the market marker isn't the very first segment (`/shop/gb/en/...`),
  // and a domain that spells "uk" into its own name without a formal
  // subdomain, path or TLD marker (`cachareluk.com`). Both are genuinely UK
  // addresses that will still render "Non-UK Site" — a false negative, which
  // is the safe direction to be wrong in here.
  'the body shop': 'https://www.thebodyshop.com/',
  // uk.policelifestyle.com, not the .com root's own /uk-en/ path — that path
  // segment reads "uk-en" (country before language), which marketOf's path
  // regex parses as market "en", not "uk"; the subdomain is unambiguous where
  // the path would have been silently wrong.
  police: 'https://uk.policelifestyle.com/',
  // Job B pass, 2026-08-22: louiscardin.co.uk, not .com — the brand is a UK
  // company (203 Manningham Lane, Bradford, West Yorkshire, per its own
  // About Us page), so the .co.uk is the primary site, not a regional
  // mirror of a foreign one.
  'louis cardin': 'https://louiscardin.co.uk/',
  escentric: 'https://www.escentric.com/', // catalogue also carries this brand bare as "Escentric"
  'escentric molecule': 'https://www.escentric.com/', // singular spelling variant
  'escentric molecules': 'https://www.escentric.com/',
  'jo loves': 'https://www.joloves.com/',
  // Paris Corner's own Émir collection page, same domain as the existing
  // "paris corner" entry above — a line, not a separate company.
  emir: 'https://pariscorner.ae/',
  // Same house, same reasoning as Émir above.
  'pendora scents': 'https://pariscorner.ae/',
  // Owned by Sterling Perfumes Industries LLC (Dubai); no standalone Jenny
  // Glow domain turned up in search, only this brand page on the parent's own
  // site — sterlingparfums.com, not a retailer.
  'jenny glow': 'https://www.sterlingparfums.com/brand/fragrance/jenny-glow',
  // British perfumer since 1730, Jermyn Street — but florislondon.com carries
  // no .co.uk, uk. or /uk/ marker of its own (us.florislondon.com is the only
  // region-marked address that turned up), so this reads Non-UK here despite
  // being a British house.
  'floris london': 'https://www.florislondon.com/',
  // /shop/gb/en/ is a real UK path, but "shop" is the URL's first segment,
  // not "gb" — outside what marketOf's path check reads. See this block's own
  // header note on that blind spot.
  'salvatore ferragamo': 'https://www.ferragamo.com/shop/gb/en/',
  // Catalogue's canonical spelling for the accented house name; m-w.de is the
  // parent company's own site (English section), not a guessed pattern.
  'm urer wirtz': 'https://www.m-w.de/en/',
  'maurer wirtz': 'https://www.m-w.de/en/', // ASCII-spelled variant, no umlaut, some feeds use this
  'yardley london': 'https://yardleylondon.co.uk/',
  guess: 'https://www.guess.eu/en-gb/guess/women/accessories/fragrances',
  // British house, but dunhill.com itself carries no UK marker (no UK-specific
  // path turned up in search) — Non-UK here for the same reason as Floris
  // London above.
  // Job B pass, 2026-08-22: dunhill.com/en-gb/ is the brand's own UK site
  // (British house; confirmed live by search, including a /gb/fragrance
  // product path on the same domain), replacing the bare global root.
  dunhill: 'https://www.dunhill.com/en-gb/',
  'alfred dunhill': 'https://www.dunhill.com/', // full trading name a few feeds use
  // Catalogue's canonical spelling is plain "Maison Margiela"; the existing
  // "maison martin margiela" key above already points here under the fuller
  // name some feeds still use.
  'maison margiela': 'https://www.maisonmargiela.com/en-gb/',
  'karl lagerfeld': 'https://www.karllagerfeld.com/en-gb/',
  // risala.ae's own title names the company directly. "Risala Elite" (a
  // separate, higher-volume canonical brand in this catalogue) is NOT aliased
  // here: search turned up only third-party retailers and a separate
  // Fragrantica designer page for it, never confirmation it is the same
  // company's own line rather than a similarly-named one — left unresolved
  // rather than assumed.
  risala: 'https://risala.ae/',
  escada: 'https://www.escada.com/',
  // Job B pass, 2026-08-22: ninaricci.com/en-uk is the brand's own UK-marked
  // path, confirmed live by search under the same domain.
  'nina ricci': 'https://www.ninaricci.com/en-uk',
  // Job B pass, 2026-08-22: robertocavalli.com/en-gb/... is the brand's own
  // UK-marked fragrance page, confirmed live by search under the same
  // domain.
  'roberto cavalli': 'https://www.robertocavalli.com/en-gb/explore-perfume',
  lanvin: 'https://www.lanvin.com/',
  'laurent mazzone': 'https://www.lmparfums.com/en-us',
  caron: 'https://www.parfumscaron.com/en',
  'tommy hilfiger': 'https://uk.tommy.com/',
  'milton lloyd': 'https://uk.milton-lloyd.com/',
  coach: 'https://uk.coach.com/',
  'paris bleu': 'https://parisbleu.com/',
  'street origins': 'https://streetorigins.co/',
  laverne: 'https://laverne.com/en',
  'abercrombie fitch': 'https://www.abercrombie.com/',
  'oscar de la renta': 'https://www.oscardelarenta.com/',
  boucheron: 'https://www.boucheron.com/',
  embark: 'https://www.embarkperfumes.com/',
  // cachareluk.com's own title reads "Cacharel Perfume, Aftershave, Noa
  // Perfume UK Official Website" — genuinely their UK storefront — but the
  // word "uk" is baked into the domain label rather than sitting in a
  // subdomain, path or TLD position marketOf reads, so this renders Non-UK.
  // See this block's own header note; not fixed here on purpose.
  cacharel: 'https://cachareluk.com/',
  'jeanne arthes': 'https://www.groupe-arthes.com/en/jeanne-arthes-2/',
  // zadig-et-voltaire.com is Zadig & Voltaire's own domain (search actually
  // landed on its own /eu/be/ fragrance page); using the plain root rather
  // than that one region's path.
  'zadig voltaire': 'https://www.zadig-et-voltaire.com/',
  chopard: 'https://www.chopard.com/en-gb/accessories-perfume-women',
  ghost: 'https://www.ghost.co.uk/',
  lomani: 'https://lomaniperfumes.com/',
  tubbees: 'https://www.tubbees.com/',
  'juicy couture': 'https://juicycouture.com/',
  trussardi: 'https://trussardi.com/',
  cartier: 'https://www.cartier.com/en-gb',
  'antonio banderas': 'https://www.banderasperfumes.com/',
  // franckolivier.fr titles itself "Site Officiel"; franckolivierparfum.com
  // (found separately) calls itself "The Official US Site" for the same
  // house — either is real, this is the primary one.
  'franck olivier': 'https://franckolivier.fr/',
  'lolita lempicka': 'https://www.lolitalempicka.com/',
  // Terenzi family's niche house (Tiziana Terenzi's own family), separate
  // storefront from the tizianaterenzi.com entry already above.
  'v canto': 'https://vcanto.com/',
  'pascal morabito': 'https://parfumspascalmorabito.com/en',
  'le falcone': 'https://lefalcone.co.uk/',
  'le falcon': 'https://lefalcone.co.uk/', // = "Le Falconé" — accented é drops out under normalizeBrand the same way Chloé's did above
  'elizabeth taylor': 'https://elizabethtaylor.com/',
  'tiffany co': 'https://www.tiffany.co.uk/home-accessories/fragrances/',
  baldessarini: 'https://baldessarini-fragrances.com/en',
  'laura biagiotti': 'https://laurabiagiotti.it/fragrances/?lang=en',
  // Paris Corner sub-line, same domain as the existing "paris corner" entry.
  'ministry of oud': 'https://pariscorner.ae/',
  atralia: 'https://atralia.com/',
  'giorgio beverly hills': 'https://www.giorgiobeverlyhills.com/en/',
  korres: 'https://uk.korres.com/',
  'le couvent des minimes': 'https://fr.lecouventparfums.com/en',
  // Parent company's own "our brands" page names Cyrus directly; no
  // standalone Cyrus-branded domain turned up.
  cyrus: 'https://www.sppcparfums.com/new/en/our-brands/cyrus/',
  'fine perfumery': 'https://www.fineperfumery.com/', // British-made; domain itself carries no UK marker
  atkinsons: 'https://www.atkinsons1799.com/',
  'miu miu': 'https://www.miumiu.com/',
  fcuk: 'https://www.frenchconnection.com/collections/fcuk-collection',
  jaguar: 'https://jaguar-fragrances.com/en',
  // Coty's own brand page — Jovan has no standalone site of its own.
  jovan: 'https://www.coty.com/our-brands/consumer-brands/jovan',
  // London boutique house; own domain confirmed by search (self-titled "Shay
  // & Blue UK"), but the address itself carries no .co.uk/uk./​uk-path marker.
  'shay blue': 'https://www.shayandblue.com/',
  bentley: 'https://bentley-fragrances.com/en',
  missoni: 'https://www.missoni.com/',
  'bharara beauty': 'https://www.bhararabeauty.com/',
  // Spelling variant of the already-resolved "Ibrahim Al Qurashi (IBRAQ)".
  'ibraheem al qurashi': 'https://ibraquk.com/',
  dsquared: 'https://www.dsquared2.com/', // catalogue's normalizeBrand key for "DSquared2" (digit dropped)
  'emanuel ungaro': 'https://www.ungaro.com/',
  'anna sui': 'https://www.annasui.com/',
  moncler: 'https://www.moncler.com/',
  // "Clean" in the catalogue is this same New York label's current fragrance
  // line, trading today as Clean Reserve — thecleanreserve.com titles itself
  // "Official Website" directly.
  clean: 'https://thecleanreserve.com/',
  // Not an independent house: a Clive Dorris Collection sub-line sold under
  // the existing "fragrance world" entry's own domain — every search result
  // names Fragrance World (Dubai) as the manufacturer, never a Clive
  // Dorris-branded site of its own.
  'clive dorris': 'https://fragranceworld.ae/',
  // Paris Corner sub-lines, same domain as the existing "paris corner" entry
  // (pariscorner.ae carries its own /product-category/ministry-of-gourmand/
  // page, confirming the domain directly rather than by inference).
  'north stag': 'https://pariscorner.ae/',
  'ministry of gourmand': 'https://pariscorner.ae/',
  'billie eilish': 'https://store.billieeilish.com/',
  'christina aguilera': 'https://parfum.christinaaguilera.com/',
  // Resolved 2026-08-19 — see the normalizeBrandKeepingDigits fallback and
  // its own doc comment near the bottom of this file for how the "4711"
  // lookup itself was made to work without touching normalizeBrand's
  // behaviour for every other brand in this file.
  '4711': 'https://4711.com/en',
  'david beckham': 'https://www.beckham-fragrances.com/en',
  'jean patou': 'https://www.patou.com/',
  'sabrina carpenter': 'https://fragrancebysabrina.com/',
  'sarah jessica parker': 'https://sjpbysarahjessicaparker.com/',
  'privee couture collection': 'https://www.priveecouturecollection.com/',
  sistelle: 'https://sistelleetcyrus.com/',
  'prime collection': 'https://primeperfumeuae.com/',
  // Licensee-run storefront (Eden Parfums Ltd), self-titled "CR7 Fragrances"
  // directly, the same shape as David Beckham's beckham-fragrances.com above.
  'cristiano ronaldo': 'https://cr7fragrances.store/',
  'laurelle parfums': 'https://laurelle.co.uk/',
  'collection prestige': 'https://collection-prestige.com/',
  'la perla': 'https://beautybylaperla.com/',
  'mercedes benz': 'https://parfums.mercedes-benz.com/en',
  'ramon monegal': 'https://ramonmonegal.com/',
  alezz: 'https://alezz-oud.com/en/alezz-perfumes/c179816661',
  'pairfum london': 'https://www.pairfum.com/', // British house; domain itself carries no UK marker
  'guy laroche': 'https://www.guylaroche.com/fragrances',
  aramis: 'https://aramisbrand.com/',
  sisley: 'https://www.sisley-paris.com/en-GB/',
  'vera wang': 'https://www.verawang.com/',
  'john varvatos': 'https://www.johnvarvatos.com/',
  thameen: 'https://thameenfragrance.com/', // British house; domain itself carries no UK marker
  'roger gallet': 'https://en.roger-gallet.com/',
  'molton brown': 'https://www.moltonbrown.co.uk/',
  // Catalogue's canonical spelling keeps the accent — "Courrèges" — and
  // normalizeBrand drops è as punctuation rather than folding it to "e",
  // leaving a space in its place rather than the plain ASCII spelling this
  // key first assumed. Same root cause as Chloé and Le Falconé above.
  'courr ges': 'https://www.courreges.com/',
  replay: 'https://www.replayjeans.com/',
  benetton: 'https://us.benetton.com/',
  // normalizeBrand strips digits, so "100 Bon" collapses to "bon" — a real,
  // if surprising, key rather than the empty-string dead end "4711" hits
  // above, since this name has letters left over once the digits go.
  bon: 'https://www.100bon.com/en',
  furla: 'https://www.furla.com/us/en/eshop/women/accessories/fragrances/',
  iceberg: 'https://www.iceberg.com/',
  mexx: 'https://www.mexx.com/',
  'gloria vanderbilt': 'https://gloriavanderbilt-jeans.com/perfume/',
  'rue broca': 'https://ruebrocaparfums.com/',
  gres: 'https://www.parfumsgres.com/en',
  'paloma picasso': 'https://paloma-picasso.com/',
  // Parent group's own site — Puig owns Nina Ricci, Carolina Herrera, Jean
  // Paul Gaultier, Paco Rabanne, Penhaligon's and others already in this file.
  'antonio puig': 'https://www.puig.com/',
  'katy perry': 'https://www.katyperryfragrances.com/',
  'alyssa ashley': 'https://www.alyssaashley.com/',
  'miller harris': 'https://www.millerharris.com/', // British house; domain itself carries no UK marker
  'arabian oud': 'https://arabianoud.co.uk/en',
  // Dumont Perfumes UAE sub-lines, same domain as the "dumont perfumes uae"
  // and "maxo parfum" entries above.
  borouj: 'https://dumontparfums.com/collections/borouj',
  'ramon blazar': 'https://dumontparfums.com/collections/ramon-blazar',
  hollister: 'https://www.hollisterco.com/',
  'bruno banani': 'https://brunobanani.com/en',
  coty: 'https://www.coty.com/',
  rochas: 'https://www.rochas.com/en',
  gisada: 'https://www.gisada.com/en-us',
  // Italart Co is named directly as the line's brand-management company, not
  // merely a reseller among several.
  roccobarocco: 'https://italartprofumi.com/brand-rocco-barocco/?lang=en',
  'histoires de parfums': 'https://www.histoiresdeparfums.com/',
  // Another Dumont Perfumes UAE sub-line, same domain as the entries above.
  'sergio vallanti': 'https://dumontparfums.com/collections/sergio-vallanti',
  'b u m equipment': 'https://www.bum.com/',
  // Spelling variant of the already-resolved "Al Wataniah" — one letter short
  // of the usual transliteration, same house.
  alwatniah: 'https://www.alwataniah.com/',
  // Owned by Sterling Perfumes Industries LLC, same parent-page pattern as
  // the "jenny glow" and "risala" entries above; no standalone Flavia domain.
  flavia: 'https://www.sterlingparfums.com/brand/fragrance/flavia',
  edeniste: 'https://www.edeniste.com/en-us', // British house; domain itself carries no UK marker
  // Terenzi family house, same as "v canto" above.
  'giardino benessere': 'https://giardinobenessere.com/en/',
  // Dumont Perfumes UAE sub-line, same domain as the entries above.
  'franco maxim': 'https://dumontparfums.com/collections/franco-maxim',
  'contes de parfums': 'https://contesdeparfums.com/',
  'maison noir': 'https://maison-noir.com/',

  // ── Coverage continuation, 2026-08-19 ─────────────────────────────────────
  // Same staged method as the sweep above: plain "<brand> official site"
  // search first, a UK-targeted follow-up, then parent-company/variant
  // searches for stragglers. Working down the worklist below by product
  // count. WebSearch only, same as the sweep above — nothing opened directly.
  //
  // Domain itself named after the brand, and every business-directory and
  // "about us" listing found for it ties it to Ard Al Zaafaran Trading LLC
  // (the manufacturer, Deira/Al Ras, Dubai) rather than reading as an
  // unrelated third party that happened to pick a matching name.
  'ard al zaafaran': 'https://ardalzaafaranshop.com/',
  // Confirmed by matching this catalogue's own product names (Elation
  // Eloise, Cosmopolitan) directly against orchidperfumesfactory.com's own
  // product pages and its own /product-category/orchid/ line — this is a
  // different UAE house from the already-resolved "Gulf Orchid" above, not
  // a spelling variant of it.
  orchid: 'https://orchidperfumesfactory.com/',
  // The file's own 2026-08-19 sweep above deliberately left this unaliased
  // to "risala" pending confirmation it was the same company's own line.
  // Found this pass: multiple independent retailers (FragranceX, Perfume.com,
  // Khan El Khalili) all credit Risala Elite fragrances as "by Risala," and
  // risala.ae's own navigation carries an Elite Collection — enough to
  // resolve it to the same site as the existing "risala" entry.
  'risala elite': 'https://risala.ae/',
  'pepe jeans': 'https://www.pepejeans.com/en_gb/men/accessories/fragrances',
  // Coty-produced line; cerruti1881fragrances.com titles itself the Cerruti
  // 1881 Fragrances site directly.
  cerruti: 'https://www.cerruti1881fragrances.com/',
  // Own-brand of Mavive S.p.A. (Venice) — no separate monotheme.com, but
  // mavive.com carries its own dedicated /85-monotheme product line, not a
  // third-party listing.
  monotheme: 'https://www.mavive.com/en/85-monotheme',
  // French house; louisvarel.fr carries its own "About Us" page rather than
  // reading as a retailer.
  'louis varel': 'https://louisvarel.fr/',
  // nikos-sculpture.com titles itself "NIKOS SCULPTURE: Official website"
  // directly.
  nikos: 'https://www.nikos-sculpture.com/',
  // Global US site; no UK-specific Revlon fragrance path found.
  revlon: 'https://www.revlon.com/',
  // Disney's own UK retail storefront (disneystore.co.uk, confirmed by
  // search as "shopDisney online is now disneystore.co.uk"); its fragrance
  // stock was not separately confirmed live in search results the way most
  // other entries in this file were, so treat the fragrance-carrying claim
  // as unverified even though the site itself is genuinely Disney's own.
  disney: 'https://www.disneystore.co.uk/',

  // bogartperfumes.com has its own /about page and a Facebook page under the
  // same "Bogart Perfumes" name (@bogartperfumes.official) — a distributor
  // reading as the house's own storefront rather than a plain reseller.
  'jacques bogart': 'https://www.bogartperfumes.com/',
  // Same collection as the existing "david beckham" entry above (Coty-
  // produced, beckham-fragrances.com) — the catalogue also carries this
  // house under its fuller couple's-name spelling, which normalizes to a
  // different key than "David Beckham" alone.
  'david victoria beckham': 'https://www.beckham-fragrances.com/en',
  // reebok.co.uk is genuinely Reebok's own UK site, confirmed by search
  // ("Reebok® Official Site"), but fragrance is licensed out (Tailored
  // Perfumes make it) and a fragrance-specific page on reebok.co.uk itself
  // was not confirmed live in search results the way most other entries in
  // this file were — same caveat as the "disney" entry above.
  reebok: 'https://www.reebok.co.uk/',
  // alexandre-j.com has its own /pages/about page ("Welcome to La Maison
  // Alexandre.J"), not a retailer.
  'alexandre j': 'https://www.alexandre-j.com/',
  // normalizeBrand strips digits entirely, so "Bois 1920" collapses to the
  // bare word "bois" — a real, if surprising, key rather than a collision:
  // measured against every brand string in the live catalogue, "Bois 1920"
  // is the only one that normalizes to "bois". bois1920.it titles itself
  // "Artisan Perfumes Florence | Bois 1920 Italian Niche Fragrances"
  // directly.
  bois: 'https://www.bois1920.it/en/',
  // angelschlesserparfums.com carries its own dedicated brand ("Il Brand")
  // and collection pages.
  'angel schlesser': 'https://www.angelschlesserparfums.com/en/',

  // ── Job A coverage pass, 2026-08-22 ───────────────────────────────────────
  // Same method as the sweeps above (WebSearch only — this session's network
  // is also locked at the gateway), working down the "no entry at all"
  // worklist by product count. Every URL below was confirmed as a page the
  // brand's own manufacturer/licensee actually publishes (an About page, a
  // named product-category tree, or a company profile explicitly tying the
  // domain to the house), not a retailer that happens to stock the brand.
  //
  // PC Design Perfumes SARL (Paris) is the manufacturer behind five house
  // names this catalogue carries as separate brands — New Brand, New Brand
  // Prestige, New Brand Parfums and Cuba Paris among them — confirmed by its
  // own site (pcdesignperfumes.com) carrying dedicated, branded
  // product-category pages for each rather than a single mixed shop list.
  'new brand': 'https://pcdesignperfumes.com/new-brand/',
  // Catalogue also carries this house under its fuller trading name; same
  // manufacturer, same landing page as "new brand" above.
  'new brand parfums': 'https://pcdesignperfumes.com/new-brand/',
  // NB Prestige is a sub-line inside the same manufacturer's "NB Collection"
  // category tree; no separately paged NB-Prestige-only URL was found, so
  // this points at the collection page that includes it.
  'new brand prestige': 'https://pcdesignperfumes.com/product-category/new-brand/',
  // Same manufacturer as the New Brand entries above; its own dedicated Cuba
  // collection page, not a retailer.
  'cuba paris': 'https://pcdesignperfumes.com/cuba/',
  // ceviperfumes.com is the brand's own storefront (not cevicosmetics.com, an
  // unrelated business with a similar name) — confirmed by its own product
  // listings (CEVI X SUBZERO EXTRAIT and others) matching this catalogue's
  // Cevi Perfumes line.
  'cevi perfumes': 'https://ceviperfumes.com/',
  // Saudi house, launched 2023; lebonheurperfumes.com is its own bilingual
  // site (confirmed by its own /en path and matching product names).
  'le bonheur': 'https://lebonheurperfumes.com/en',
  // Indonesian house founded 2024; velixirparfums.com is named directly in
  // its own "About Us" page as the brand's site.
  velixir: 'https://velixirparfums.com/',
  // bhararabeauty.com is the brand's own "House of Niche Fragrance Brands"
  // site; a separate bhararabeauty.eu also exists (EU storefront, not UK).
  bharara: 'https://www.bhararabeauty.com/',
  // UK-marked page found directly (katespade.co.uk), so used instead of the
  // US katespade.com root.
  'kate spade': 'https://www.katespade.co.uk/shop/accessories/fragrance',
  philosophy: 'https://philosophy.com/collections/fragrance',
  // Cofinluxe (Paris) licenses the Dalí name for fragrance; parfums-
  // salvadordali.com is Cofinluxe's own dedicated brand site for it, not a
  // reseller — confirmed via cofinluxe.fr's own brand-page listing.
  'salvador dali': 'https://www.parfums-salvadordali.com/en/',
  // UK-marked page found directly (toryburch.com/en-gb/...), so used instead
  // of the US en-us root.
  'tory burch': 'https://www.toryburch.com/en-gb/accessories/fragrance/essenceofdreams/',
  // Lattafa-group house (Dubai); nusukfragrance.com is its own dedicated
  // site, distinct from the parent "lattafa"/"lattafa perfumes" entries
  // above.
  nusuk: 'https://nusukfragrance.com/',
  // Sterling Perfumes Industries (same manufacturer as the existing "armaf"
  // and "flavia" entries) — hamidi.ae is its own dedicated Hamidi site.
  hamidi: 'https://hamidi.ae/',
  // Genuinely tous.com's UK path — the site orders it region-then-language
  // ("gb-en") rather than the "en-gb" shape marketOf() reads a path market
  // from, so officialSiteFor() will still report this as Non-UK; noted here
  // rather than silently accepted as a false negative.
  tous: 'https://www.tous.com/gb-en/',
  'pino silvestre': 'https://pinosilvestre.com/',
  // French house (Grasse); geparlys.com is its own site.
  geparlys: 'https://geparlys.com/en-us',
  // Puig-produced line; only an international path was confirmed, no
  // UK-specific one.
  shakira: 'https://www.shakiraperfumes.com/int/en',
  // Avon's own UK storefront for this fragrance line (avon.uk.com), used in
  // preference to the US avon.com/brand page. "uk.com" is a UK-market
  // second-level domain space (avon.uk.com, not a uk. subdomain of avon.com)
  // that isn't in marketOf()'s MULTI_PART_SUFFIXES list, so officialSiteFor()
  // will still report this as Non-UK — a false negative, not a wrong link.
  'far away': 'https://avon.uk.com/collections/far-away',
  // Same avon.uk.com UK storefront and the same marketOf() false-negative as
  // "far away" above.
  'today tomorrow always': 'https://avon.uk.com/collections/today-tomorrow-always',
  // French niche house founded 2022; delrobaparfums.com is its own site.
  delroba: 'https://delrobaparfums.com/',
  // Amsterdam house (Anna Hegeman & Patrick Munsters, founded 2018);
  // salle-privee.com carries its own dedicated /pages/fragrance and
  // /pages/about pages.
  'salle privee': 'https://www.salle-privee.com/pages/fragrance',
  // British house; hackett.com/uk/... is its own UK site (fragrance line is
  // Tailored Perfumes-produced, same shape as the existing "reebok" and
  // "disney" entries, but the page itself was confirmed live).
  'hackett london': 'https://www.hackett.com/uk/en_gb/men/accessories/fragrances-and-personal-care/',
  // British house since 1894; barbour.com/gb/all-fragrance is its own
  // UK-marked fragrance page.
  barbour: 'https://www.barbour.com/gb/all-fragrance',
  // Sterling Perfumes Industries (same manufacturer as the existing "armaf",
  // "hamidi" and "flavia" entries) — its own site carries a dedicated
  // /brand/fragrance/just-jack page.
  'just jack': 'https://www.sterlingparfums.com/brand/fragrance/just-jack',
  // Same manufacturer page as "just jack" above — catalogue also carries
  // this house under a pluralised misspelling.
  'just jacks': 'https://www.sterlingparfums.com/brand/fragrance/just-jack',

  // ══ 2026-08-25 pass ═════════════════════════════════════════════════════
  //
  // How every URL below was established, said once rather than repeated at
  // 40 entries: by web search only. This sandbox's egress proxy refuses
  // brand and retailer domains outright (`CONNECT tunnel failed, response
  // 403`), so not one of these pages was opened, and nothing here is a
  // page-verified fact. It is the same standard the 2026-08-05 Middle
  // Eastern batch above recorded for itself, applied deliberately:
  //
  //   - a URL is used only when a search result's *own link list* carried
  //     that domain, with a title identifying it as the brand's own site.
  //     A domain that appeared only inside a result summary, or only in a
  //     third party's prose, was not used — that is the exact trap the
  //     Ellen Tracy / Liz Claiborne note above records, and it caught
  //     Halston, Kenneth Cole, Missguided and Laura Ashley this pass too;
  //   - where the search confirmed the domain but returned only
  //     region-specific paths under it, the entry is the domain root. That
  //     is not a guess: it is the least-specific form of an already
  //     confirmed address, and it lets the brand's own geo-routing decide
  //     where a UK reader lands instead of this file hard-coding someone
  //     else's locale;
  //   - two or more competing "official" domains for one house meant no
  //     entry. Ed Hardy and Reyane Tradition were dropped on that alone.
  //
  // Verify with `npm run brand:probe` (the price-verify.yml workflow with
  // brand_site_probe: true). It follows every link and reports dead,
  // redirected-domain and redirected-region findings — which is the step
  // this pass could not perform and the reason these are additions rather
  // than confirmations.

  // ── Spelling keys onto URLs this file had already verified ──────────────
  // The cheapest additions here and the safest: no new URL is introduced by
  // any of them, only a key that the live catalogue actually uses and that
  // normalizeBrand was missing. Each was checked against the products the
  // catalogue files under that spelling, not assumed from the name.
  //
  // "Bulgari" — the house's ordinary spelling; this file keys the stylised
  // "BVLGARI". Products: Man Rain Essence, Splendida Patchouli Tentation.
  bulgari: 'https://www.bulgari.com/en-gb/fragrances',
  // "Salle Privée" with its accent. normalizeBrand strips everything but
  // a-z, so the é becomes a space and the key is 'salle priv e' — which is
  // why the already-verified 'salle privee' entry above was unreachable
  // from the live catalogue's own spelling. Products: Illegal, Legal,
  // Rialto, Concorde, Super 8.
  'salle priv e': 'https://www.salle-privee.com/pages/fragrance',
  // "Le Couvent" — the shortened trading name. The catalogue's own product
  // names settle it beyond doubt: every one begins "Des Minimes ...", so
  // the retailer split "Le Couvent des Minimes" across the brand and name
  // fields. Same URL as the existing 'le couvent des minimes' entry.
  'le couvent': 'https://fr.lecouventparfums.com/en',
  // "New Brand Perfumes" — anglicised form of "New Brand Parfums", already
  // resolved above. Products: Prestige Gold, Gold Women Prestige.
  'new brand perfumes': 'https://pcdesignperfumes.com/new-brand/',
  // Feed truncations, each confirmed by the product name carrying the
  // missing characters: "Giorgio Beverly Hill" + "s Red" is Giorgio
  // Beverly Hills Red; "L'Artisan" + "Parfumeur 4 * Mini Set..." is
  // L'Artisan Parfumeur; "Tiffany" + "Co 1 Oz For Women" is Tiffany & Co.
  'giorgio beverly hill': 'https://www.giorgiobeverlyhills.com/en/',
  'l artisan': 'https://www.artisanparfumeur.com/uk/en_GB/',
  tiffany: 'https://www.tiffany.co.uk/home-accessories/fragrances/',
  // "VALENTINO BEAUTY" is Valentino's own beauty division, and the existing
  // 'valentino' entry already points at that division's page.
  'valentino beauty': 'https://www.valentino.com/en-gb/experience/valentino-beauty',
  // "Banderas" alone; the product is "Antonio Banderas Mediterraneo".
  banderas: 'https://www.banderasperfumes.com/',
  // Lattafa sub-line, same domain as the existing "lattafa" entry, which
  // carries its own /brands/asdaaf/ page — the same relationship (and the
  // same treatment) as 'ministry of oud' under Paris Corner above.
  asdaaf: 'https://lattafa.com/brands/asdaaf/',

  // ── Newly resolved houses ───────────────────────────────────────────────
  // Ordered roughly by how many products in the live catalogue gain a link.
  //
  // 91 products, and the largest single unresolved house on the list. The
  // note further down used to say Brandy Designs had no brand-owned domain,
  // only the distributor I&K IMPEX — that is now out of date.
  // brandyperfumes.com carries its own /about-us/ ("UAE Perfume
  // Manufacturer", Al Daiem Perfumes & Cosmetics) and a /brand/brandy-
  // designs/ page, and the house's own Instagram is @brandy.designs. The
  // catalogue's product names all read "<name> by Brandy", which is the
  // same house under the same trading name.
  'brandy designs': 'https://brandyperfumes.com/',
  'dkhoon emirates': 'https://dkhoonemirates.com/en/',
  // Two catalogue spellings, one house. The plain "Lamborghini" listings
  // are Classico, Prestigio, Acqua, Essenza, Forza, Intenso, Invincibile
  // and Millennials — the Tonino Lamborghini fragrance line exactly, not
  // Automobili Lamborghini, which is a different company on a different
  // domain (lamborghini.com). Tonino Lamborghini's own site is
  // lamborghini.it, whose pages title themselves "TONINO LAMBORGHINI".
  // The /collections/all-products path is used rather than a fragrance
  // section because that is the page search actually returned; no
  // fragrance-specific path on the domain was confirmed, and constructing
  // one would be inventing it.
  lamborghini: 'https://lamborghini.it/en-int/collections/all-products',
  'tonino lamborghini': 'https://lamborghini.it/en-int/collections/all-products',
  izod: 'https://izod.com/',
  // British house, London; frenchconnection.com/pages/about-us titles
  // itself "About Us – Brand Bio – French Connection UK".
  'french connection': 'https://www.frenchconnection.com/',
  // Two catalogue spellings of one Munich house — the lowercase "aigner"
  // listings are literally named "Etienne Aigner Aigner No 1", "Etienne
  // Aigner First Class" and so on. aignermunich.com's /imprint names
  // Etienne Aigner AG, Zielstattstraße 27, München.
  aigner: 'https://www.aignermunich.com/',
  'etienne aigner': 'https://www.aignermunich.com/',
  'paris hilton': 'https://parishiltonfragrances.com/',
  travalo: 'https://www.travalo.com/',
  'la martina': 'https://lamartina.com/',
  'jil sander': 'https://www.jilsander.com/',
  'maison crivelli': 'https://maisoncrivelli.com/en-int/collections/frontpage',
  affinessence: 'https://affinessence.com/en',
  annayake: 'https://annayake.com/en/',
  gant: 'https://www.gant.co.uk/',
  'philipp plein': 'https://www.plein.com/',
  nautica: 'https://www.nautica.com/',
  'atelier cologne': 'https://www.ateliercologne.com/',
  'perris monte carlo': 'https://perrismontecarlo.com/collections/all-perfums-extracts',
  'nicolai parfumeur createur': 'https://pnicolai.com/en/',
  'thomas kosmala': 'https://thomaskosmala.com/',
  'atelier des ors': 'https://atelierdesors.com/en',
  'el ganso': 'https://www.elganso.com/intl_en/',
  superdry: 'https://www.superdry.com/',
  'makeup revolution': 'https://www.revolutionbeauty.com/uk/en',
  // Air-Val International, Barcelona, 1979 — a children's-fragrance house
  // whose own site names Disney as its largest partner, which is exactly
  // what the catalogue files under this brand (Disney Princess Snow White,
  // Disney Frozen II, Eau My Unicorn).
  'air val': 'https://www.air-val.com/en/',
  'mandarina duck': 'https://mandarinaduck.com/',
  'gianfranco ferre': 'https://gianfrancoferre.com/',
  // Same house with the accent the catalogue may also carry; normalizeBrand
  // turns the é into a space and then trims it, so this is a different key.
  'gianfranco ferr': 'https://gianfrancoferre.com/',
  'the woods collection': 'https://www.thewoodscollection.com/collections/eau-de-parfums',
  houbigant: 'https://www.houbigant-parfum.com/',
  // Isle of Arran, Scotland. A .com with no market marker, so marketOf will
  // label it Non-UK — the deliberate under-claim this file's own
  // officialSiteFor doc describes, not a statement that the house is not
  // British.
  'arran sense of scotland': 'https://arran.com/',
  'carner barcelona': 'https://carnerbarcelona.com/',
  accessorize: 'https://www.accessorize.com/uk',
  // int.biotherm.com/en_GB/homepage is the brand's own UK storefront, and
  // the en_GB segment is a shape marketOf reads correctly, so this one
  // labels as UK rather than falling back to the global .com.
  biotherm: 'https://int.biotherm.com/en_GB/homepage',
  'kajal perfumes': 'https://kajalperfumes.com/',
  kajal: 'https://kajalperfumes.com/',
  collistar: 'https://www.collistar.com/',

  // Left unresolved this pass — search turned up only third-party retailers
  // and Fragrantica/Parfumo listings, never a confirmed brand-owned domain:
  // Jennifer Lopez (JLo fragrances are sold only through
  // retailers, no dedicated brand site found), Diane Castel, Taylor of
  // London, Cevi Les Parfums (a second, differently-spelled Cevi line — not
  // confirmed to be the same company as "Cevi Perfumes" above, so left
  // separate and unresolved rather than guessed), Marvel (sold via a
  // licensed manufacturer, JADS International, not Marvel's/Disney's own
  // site), Hello Kitty (sold via a Sanrio license, no dedicated
  // fragrance-brand site of Sanrio's own found), Rotana, Attraction, United
  // Colors & Prestige Beauty (reads as two brand names concatenated by a
  // retailer feed, the same "Unbranded"-shaped trap noted above — not
  // guessed at as either Benetton or a single house). Ellen Tracy and Liz
  // Claiborne are deliberately left out too: search surfaced only domains
  // ("ellentracy.com", "lizclaiborns.com" — note the missing "e",
  // "lizclaiborneperfume.com") that were never actually present in any
  // search result's own link list, or read as spammy multi-brand
  // storefronts rather than the house's own site — the "never invent, never
  // guess" rule this file runs on applies exactly here. Also left
  // unresolved: Parfums des Champs (its "Champs" line is credited to a
  // Belgium-based "New Brand" business in search results, distinct from the
  // Paris-based PC Design Perfumes SARL this file's own "new brand" entry
  // above resolves to — not folded together on that ambiguity), Aubusson,
  // Daniel Hechter, Attar & Co (only fineperfumery.com's own collection
  // page turned up, a retailer rather than the house).
  //
  // ── Left unresolved by the 2026-08-25 pass, with the reason ─────────────
  // Kept because "no link" is a correct outcome and the reasons are worth
  // not re-deriving:
  //
  //  - Halston, Kenneth Cole, Missguided, Laura Ashley. In each case a
  //    search *summary* named a plausible domain (halston.com,
  //    kennethcole.com, missguided.co.uk, lauraashley.com) that no result's
  //    own link list actually contained. Laura Ashley is the clearest
  //    warning of why that distinction matters: the domains that were
  //    returned were "lauraashaley.co.uk" — note the transposed letters —
  //    and "lauraashley-uk.com", neither of them the house. Missguided also
  //    went into administration in 2022 and is now Shein-owned, so what is
  //    behind that name today is a separate question.
  //  - Ed Hardy (edhardy.eu, edhardyoriginals.com, edhardyoriginal.us.com
  //    and edhardy.com.my all present themselves as official, with no way
  //    from search alone to say which the house runs) and Reyane Tradition
  //    (thereyanetradition.com and myreyanetradition.com, same problem).
  //  - Rotana, Jeanne en Provence, Jean-Louis Scherrer, Blood Concept: a
  //    real house each, with a social presence and retailer listings, and
  //    no brand-owned domain in any result.
  //  - Annick Goutal. The house renamed itself Goutal Paris in 2018, one of
  //    the two annickgoutal.com results returned was its Shopify /password
  //    page, and the working storefront found was us.goutalparis.com — a US
  //    store. Too many unresolved questions at once to pick an address.
  //  - Christian Louboutin, for a reason specific to this codebase rather
  //    than to the brand. Its UK fragrance pages are real and were
  //    confirmed (eu.christianlouboutin.com/uk_en/beauty/fragrances/), but
  //    that path is REGION_language, and marketOf's path rule reads a
  //    two-letter pair as language_REGION — so it returns "en" and the
  //    brand page would print "Non-UK Site" over a genuine UK storefront.
  //    Under-claiming on a bare .com is this file's documented behaviour;
  //    printing the wrong market for a marked UK page is not, and widening
  //    marketOf is a change to the classifier brand-site-probe.ts shares,
  //    which does not belong in a link-adding pass. Recorded here so
  //    whoever fixes marketOf knows there is an entry waiting on it.
  //  - Banana Republic. No UK site exists — the brand closed its UK stores
  //    in 2016 and now reaches UK buyers through Next — and the only
  //    confirmed storefront is bananarepublic.gap.com, a US Gap-hosted
  //    one. A link that cannot sell a UK reader anything is not worth the
  //    row.
  //
  // Not brands at all, so no site could ever be right. Reported rather
  // than resolved, in the same spirit as "Unbranded" and the already
  // folded-away "Fragrance Hub LTD" / "My Store" / "Fragrancehub.co.uk":
  //
  //  - "Essential Perfumes" (4 products) is *not* the French house
  //    Essential Parfums this file already resolves, despite normalising to
  //    within one letter of it. Its listings are Azlaan, Essence Of Arabia,
  //    The Ocean and Twilight — an Arabic-style line, nothing Essential
  //    Parfums has ever made. Deliberately left unresolved rather than
  //    keyed onto that URL; this is the near-miss most likely to be folded
  //    in by mistake by a later pass.
  //  - "Designer Collection" (9), whose products are named "Aqua Man DC
  //    Pour Homme", "I Love DC Pour Femme" — a retailer's own house line
  //    rather than a house.
  //  - "Scent Favourites" (8) and "Perfect Nonsense" (7) read the same way.
  //  - Seven brand strings that look like Avon's own fragrance lines rather
  //    than houses: Attraction (16 products), Black Suede (8), Full Speed
  //    (5), Little Black Dress (5), Imari (4), Perceive (4), Incandessence
  //    (3). What that reading rests on is the shape of the listings
  //    themselves — "Attraction | Game for Her", "Attraction | Deep
  //    Instinct for Him", "Imari | Corset", "Full Speed | Max Turbo",
  //    "Little Black Dress | Lace" — and, tellingly, the repeated "Purse"
  //    variants, which is Avon's own purse-spray format and not a size any
  //    other house sells. That is a strong pattern, not a confirmation, so
  //    none of them was keyed to the existing 'avon' entry: doing that
  //    would be asserting a corporate relationship on the strength of
  //    product names. Flagged for the owner, who can settle it from the
  //    source feed in a way search cannot.
};

/**
 * ── Worklist: highest-product brands with no entry above ────────────────────
 *
 * Not code — a priority order for whoever runs the next confirmation pass,
 * ranked by product count in the live catalogue. Re-measured 2026-08-25
 * against demo/catalogue.generated.ts (14,756 products / 697 houses) using
 * the same buildBrandCanon()-based method as the file header's own count.
 * This replaces a 2026-08-19 version of the list that the 2026-08-25 pass
 * cleared the head of: Cuba Paris, New Brand Parfums, Dkhoon Emirates,
 * Lamborghini, Brandy Designs and 14 more of that list's top 30 now have
 * entries above. "cum" is what share of all products in a named house would
 * gain a website line if every unresolved brand up to that point were added.
 *
 * 356 of 697 houses still have no entry, but the work left is genuinely
 * small and getting smaller: the 30 largest below cover 2.5% of products
 * between them, the top 50 reach 3.3%, the top 100 reach 4.8%. Nine of the
 * thirty are on the "not a brand" or "deliberately unresolved" lists at the
 * end of BRAND_SITES above (Attraction, Black Suede, Scent Favourites,
 * Designer Collection, Rotana, Blood Concept, Jean-Louis Scherrer,
 * Halston, Banana Republic), so the reachable remainder is smaller again.
 * Whoever picks this up should read those notes first rather than
 * re-deriving them.
 *
 * "Unbranded" (196 products) is excluded from this ranking — not a house,
 * the literal string some retailer feeds send when they have no brand for a
 * listing. Its products span dozens of real houses (4711, Acqua Di Parma,
 * Aesop, Banana Republic, Calvin Klein, Diesel, DKNY, Dolce&Gabbana, ...), so
 * there is no single URL that could ever belong there — see brandName.ts's
 * own doc for why a catch-all like this can't be folded into any one brand.
 *
 *   Parfums des Champs                  43 products  (cum  0.3%)
 *   Jennifer Lopez                      26 products  (cum  0.5%)
 *   Rotana                              18 products  (cum  0.6%)
 *   Diane Castel                        17 products  (cum  0.7%)
 *   Attraction                          16 products  (cum  0.8%)  (reads as an Avon line — see note above)
 *   Cevi Les Parfums                    15 products  (cum  0.9%)
 *   United Colors & Prestige Beauty     15 products  (cum  1.0%)
 *   Marvel                              14 products  (cum  1.1%)
 *   Ellen Tracy                         13 products  (cum  1.2%)
 *   Taylor of London                    12 products  (cum  1.3%)
 *   Aubusson                            10 products  (cum  1.4%)
 *   Hello Kitty                         10 products  (cum  1.4%)
 *   Liz Claiborne                       10 products  (cum  1.5%)
 *   Banana Republic                      9 products  (cum  1.6%)
 *   Blood Concept                        9 products  (cum  1.6%)
 *   Dana                                 9 products  (cum  1.7%)
 *   Designer Collection                  9 products  (cum  1.8%)
 *   Halston                              9 products  (cum  1.8%)
 *   Oud Elixir                           9 products  (cum  1.9%)
 *   Adidas                               8 products  (cum  1.9%)
 *   Attar & Co                           8 products  (cum  2.0%)
 *   Black Suede                          8 products  (cum  2.0%)  (reads as an Avon line — see note above)
 *   Jean-Louis Scherrer                  8 products  (cum  2.1%)
 *   Masquerade                           8 products  (cum  2.1%)
 *   Mayfair                              8 products  (cum  2.2%)
 *   Mustang                              8 products  (cum  2.3%)
 *   Oros                                 8 products  (cum  2.3%)
 *   Scent Favourites                     8 products  (cum  2.4%)
 *   Whisky                               8 products  (cum  2.4%)
 *   Daniel Hechter                       7 products  (cum  2.5%)
 *
 * (full ranked list is reproducible any time by running buildBrandCanon()
 * over the live catalogue and diffing against this file's own keys, the same
 * check this pass ran; nothing here is stored anywhere else.)
 */

/** Lowercase, strip everything but letters — so "Dolce & Gabbana", "Dolce&Gabbana"
 *  and "DOLCE&GABBANA" all resolve to the same lookup key regardless of which
 *  casing/punctuation variant a given retailer feed happened to use. */
function normalizeBrand(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/**
 * Fallback for the one real shape normalizeBrand cannot key at all: a brand
 * name with no a-z letters in it, like "4711", which normalizeBrand collapses
 * to the empty string.
 *
 * Only ever consulted when normalizeBrand's own result is empty (see
 * officialSiteFor below), so it can never change what any *other* brand
 * resolves to — a brand with at least one letter always matches on
 * normalizeBrand first, exactly as before this fallback existed. That is a
 * measured claim, not an assumption: every "brand" string in the live
 * catalogue (664 distinct raw spellings, checked 2026-08-19 against
 * demo/catalogue.generated.ts) normalizes to a non-empty string under
 * normalizeBrand except "4711" itself, so this fallback is inert for
 * everything else in the file today.
 *
 * Teaching normalizeBrand itself to keep digits was considered and rejected:
 * three existing keys — 'bon' (from "100 Bon"), 'casamorati dal' (from
 * "CASAMORATI DAL 1888") and 'dsquared' (from "DSquared2") — rely on digits
 * being stripped to reach their current key. Changing normalizeBrand
 * globally would silently orphan all three already-verified entries by
 * changing what they normalize to, trading one dead lookup for three. This
 * narrower fallback fixes the one broken case without moving any of the
 * others.
 */
function normalizeBrandKeepingDigits(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The brand's own official site, if we have verified one — never invented —
 * plus whether it is a UK storefront, so a reader knows before clicking.
 *
 * `uk` is computed once, at module load, from the same market-detection rule
 * `scripts/brand-site-probe.ts` uses to judge a probed landing address
 * (`marketOf` in src/catalogue/brandSiteCheck.ts): a `.co.uk` domain, a `uk.`
 * subdomain, or a `/uk/` or `/en-gb/` path counts as UK; a plain global `.com`
 * with no market marker does not, and is labelled Non-UK rather than guessed
 * at. Reusing that function rather than a second copy is deliberate — the
 * probe's classifier and this label must never quietly disagree about what
 * "UK" means for the same URL.
 */
export interface BrandSite {
  url: string;
  uk: boolean;
}

/**
 * Spellings to try after the brand's own key misses, in order.
 *
 * Every one of these is a *fallback*: it is only ever consulted once
 * `BRAND_SITES[primaryKey]` has already come back undefined, so none of them
 * can change what an already-resolving brand resolves to. That is the whole
 * safety argument for adding them — the worst case is a brand that had no
 * link still has no link.
 *
 * Both rules were found by measurement, not guessed at. Running
 * `officialSiteFor` over every canonical house in the live catalogue
 * (demo/catalogue.generated.ts, 723 houses on 2026-08-20) left 64 entries in
 * this file that no house reached, while 451 houses had no link — and 11 of
 * those misses were the same two spelling mismatches repeated:
 *
 *  - "and" written out where this file keys the ampersand form.
 *    normalizeBrand strips "&" to whitespace, so "Dolce & Gabbana" keys as
 *    'dolce gabbana'; a feed writing "Dolce and Gabbana" keys as
 *    'dolce and gabbana' and misses. Same for Viktor & Rolf, Abercrombie &
 *    Fitch, Roger & Gallet, Tiffany & Co.
 *  - A trailing market word. "ARMAF UK" and "French Avenue UK" are the same
 *    houses as 'armaf' and 'french avenue'; the feed just appended where it
 *    ships to.
 *
 * Checked before adding: folding "and" out of every existing key, and
 * stripping a trailing " uk" from every existing key, produces no case where
 * two keys holding *different* URLs collapse onto one another. So neither
 * rule can silently hand a brand another brand's website.
 */
function fallbackKeys(primaryKey: string): string[] {
  const keys: string[] = [];
  const withoutAnd = primaryKey.split(' ').filter((w) => w !== 'and').join(' ');
  if (withoutAnd !== primaryKey && withoutAnd !== '') keys.push(withoutAnd);
  for (const k of [primaryKey, withoutAnd]) {
    const withoutUk = k.replace(/ uk$/, '');
    if (withoutUk !== k && withoutUk !== '' && !keys.includes(withoutUk)) keys.push(withoutUk);
  }
  return keys;
}

export function officialSiteFor(brand: string): BrandSite | null {
  const primaryKey = normalizeBrand(brand);
  // The digit-keeping fallback only ever runs for the empty-string case (see
  // its own doc comment above) — everything else resolves on primaryKey
  // exactly as it always has.
  let url = BRAND_SITES[primaryKey] ?? (primaryKey === '' ? BRAND_SITES[normalizeBrandKeepingDigits(brand)] : undefined);
  if (!url) {
    for (const key of fallbackKeys(primaryKey)) {
      url = BRAND_SITES[key];
      if (url) break;
    }
  }
  if (!url) return null;
  // marketOf reports the /en-gb/ path shape as "gb" rather than "uk" — the
  // same synonym classifyLanding's own sameMarket() normalises before
  // comparing two markets. Doing the same normalisation here, rather than
  // teaching marketOf a new return value, keeps the one classifier the probe
  // depends on unchanged.
  const market = marketOf(url);
  return { url, uk: market === 'uk' || market === 'gb' };
}
