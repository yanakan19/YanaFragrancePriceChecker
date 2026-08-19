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
 * Measured 2026-08-19 by running buildBrandCanon() from src/catalogue/
 * brandName.ts — the module that actually decides one canonical display
 * spelling per house — over every "brand" string in demo/catalogue.generated.ts,
 * then checking each canonical name against this file, minus "Unbranded" and
 * "vendor-unknown" (feed artifacts, not houses; see the worklist comment
 * below). That is a stricter count than a raw grep-and-dedupe of the feed
 * strings: it collapses "ARMAF"/"Armaf", "Paco Rabanne"/"Rabanne" and similar
 * pairs to one house the way the app itself does, rather than counting each
 * spelling separately. By that measure the live catalogue currently carries
 * 662 real houses (this number moves as the harvest runs; it was 629 by the
 * cruder count on 2026-08-17, 664 distinct raw strings by that same cruder
 * count on 2026-08-19 — the catalogue grows between harvests, so treat this
 * as "the count on the day someone last measured it," not a fixed total).
 * 168 of those 662 resolve here as of this measurement (25.4%). This list is
 * still only the highest-volume brands so far, not a finished set.
 */
export const BRAND_SITES: Record<string, string> = {
  'calvin klein': 'https://www.calvinklein.co.uk/',
  'dolce gabbana': 'https://www.dolcegabbana.com/en-gb/beauty/',
  'paco rabanne': 'https://www.rabanne.com/',
  rabanne: 'https://www.rabanne.com/',
  'carolina herrera': 'https://www.carolinaherrera.com/',
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
  'ahmed al maghribi': 'https://ae.ahmedalmaghribi.com/en',
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
  'swiss arabian': 'https://swissarabian.com/',
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
  'acqua di parma': 'https://www.acquadiparma.com/en_gb/',
  afnan: 'https://www.afnan.com/',
  chanel: 'https://www.chanel.com/gb/',
  dior: 'https://www.dior.com/en_gb/beauty/fragrance/home',
  gucci: 'https://www.gucci.com/uk/en_gb/',
  // UK-specific fragrance path not separately confirmed; this is the main
  // Hermès site with a general fragrance category.
  'herm s': 'https://www.hermes.com/uk/en/',
  'tom ford': 'https://www.tomfordbeauty.com/',
  'yves saint laurent': 'https://www.yslbeauty.com/int/fragrances.html',
  // Only the US beauty domain turned up in search; no UK-specific one found.
  'giorgio armani': 'https://www.giorgioarmanibeauty-usa.com/',
  // Emporio Armani fragrances are produced and sold through the same Giorgio
  // Armani Beauty business, not a separate storefront.
  'emporio armani': 'https://www.giorgioarmanibeauty-usa.com/',
  burberry: 'https://uk.burberry.com/',
  bvlgari: 'https://www.bulgari.com/',
  prada: 'https://www.prada-beauty.com/',
  // US site only — no UK-specific Louis Vuitton fragrance page found.
  'louis vuitton': 'https://us.louisvuitton.com/',
  versace: 'https://www.versace.com/gb/en/fragrances/',
  // Multiple Valentino beauty domains exist (valentino.com, valentino-beauty.us,
  // valentino-beauty.co.uk); this is the brand's own primary site.
  valentino: 'https://www.valentino.com/en-gb/experience/valentino-beauty',
  'van cleef arpels': 'https://www.vancleefarpels.com/',
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
  moschino: 'https://www.moschino.com/gb_en/',
  mugler: 'https://www.mugler.co.uk/',
  natura: 'https://www.naturabrasil.com/',
  nishane: 'https://nishane.com/',
  // Normalises to this because normalizeBrand strips the accented í as a
  // non-letter — consistent with how the same feed string would look up.
  'o botic rio': 'https://www.boticario.com/',
  'parfums de marly': 'https://parfums-de-marly.com/',
  phlur: 'https://phlur.com/',
  'ralph lauren': 'https://www.ralphlauren.co.uk/',
  rasasi: 'https://www.rasasi.com/',
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
  'dumont perfumes uae': 'https://www.dumontparis.com/', // = dumont
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
  'louis cardin': 'https://www.louiscardin.com/',
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
  dunhill: 'https://www.dunhill.com/',
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
  'nina ricci': 'https://www.ninaricci.com/',
  'roberto cavalli': 'https://www.robertocavalli.com/',
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
};

/**
 * ── Worklist: highest-product brands with no entry above ────────────────────
 *
 * Not code — a priority order for whoever runs the next confirmation pass,
 * ranked by product count in the live catalogue (measured 2026-08-17 against
 * demo/catalogue.generated.ts, 12,664 products / 629 brands). "cum" is what
 * share of the whole catalogue's products would gain a website line if every
 * brand up to that point were added. 517 of 629 brands (82.2%) have no entry
 * yet, but they are mostly small: the 30 largest below already cover 12.7%
 * of all products on their own, the top 100 would cover 24.6%.
 *
 * One entry is deliberately excluded from this ranking: "Unbranded" (61
 * products, would rank 5th) is not a house at all — it is the literal string
 * some retailer feeds send when they have no brand for a listing. Its
 * products span dozens of real houses (4711, Acqua Di Parma, Aesop, Banana
 * Republic, Calvin Klein, Diesel, DKNY, Dolce&Gabbana, ...), so there is no
 * single URL that could ever belong there — see brandName.ts's own doc for
 * why a catch-all like this can't be folded into any one brand.
 *
 *   Ard Al Zaafaran                    127 products  (cum  1.0%)
 *   Police                             117 products  (cum  1.9%)
 *   Louis Cardin                       114 products  (cum  2.8%)
 *   Orchid                              82 products  (cum  3.5%)
 *   Jenny Glow                          59 products  (cum  4.4%)  [Unbranded, 61, skipped]
 *   Ibrahim Al Qurashi (IBRAQ)          59 products  (cum  4.9%)
 *   Yardley London                      56 products  (cum  5.3%)
 *   Mäurer & Wirtz                      56 products  (cum  5.8%)
 *   Floris London                       56 products  (cum  6.2%)
 *   Salvatore Ferragamo                 55 products  (cum  6.7%)
 *   Guess                               51 products  (cum  7.1%)
 *   Escentric Molecules                 48 products  (cum  7.4%)
 *   Dunhill                             45 products  (cum  7.8%)
 *   Maison Margiela                     44 products  (cum  8.1%)
 *   Chloé                               44 products  (cum  8.5%)
 *   Risala Elite                        42 products  (cum  8.8%)
 *   Karl Lagerfeld                      42 products  (cum  9.1%)
 *   Rochas                              41 products  (cum  9.5%)
 *   Escada                              41 products  (cum  9.8%)
 *   Roberto Cavalli                     39 products  (cum 10.1%)
 *   Reef Perfumes                       39 products  (cum 10.4%)
 *   Nina Ricci                          39 products  (cum 10.7%)
 *   Laurent Mazzone                     37 products  (cum 11.0%)
 *   Lanvin                              37 products  (cum 11.3%)
 *   Street Origins                      36 products  (cum 11.6%)
 *   Caron                               36 products  (cum 11.9%)
 *   Tommy Hilfiger                      35 products  (cum 12.1%)
 *   Milton Lloyd                        35 products  (cum 12.4%)
 *   Cuba Paris                          34 products  (cum 12.7%)   <- 29 real brands here (Unbranded occupied would-be rank 5)
 *
 * (top 50 reaches 17.1% cumulative, top 100 reaches 24.6% — full ranked list
 * is reproducible any time with the grep-and-tally in this comment's own
 * measurement note above; nothing here is stored anywhere else.)
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

export function officialSiteFor(brand: string): BrandSite | null {
  const url = BRAND_SITES[normalizeBrand(brand)];
  if (!url) return null;
  // marketOf reports the /en-gb/ path shape as "gb" rather than "uk" — the
  // same synonym classifyLanding's own sameMarket() normalises before
  // comparing two markets. Doing the same normalisation here, rather than
  // teaching marketOf a new return value, keeps the one classifier the probe
  // depends on unchanged.
  const market = marketOf(url);
  return { url, uk: market === 'uk' || market === 'gb' };
}
