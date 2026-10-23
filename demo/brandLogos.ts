import type { LogoRef } from '../src/types/retailer.js';

/**
 * Verified brand logos, keyed exactly as `demo/brandSites.ts` keys
 * `BRAND_SITES` — lowercase, everything but a-z folded to a single space,
 * trimmed. A new file rather than an addition to that one: brandSites.ts is
 * already 146 KB and under concurrent edit, and keying identically keeps the
 * two joinable without either depending on the other's exports.
 *
 * `normalizeBrand` below is a deliberate duplicate of the private function of
 * the same name in demo/brandSites.ts, not an import of it, for the same
 * reason this is a separate file at all — importing from a file under
 * concurrent edit risks a merge conflict on every entry either file adds. Any
 * future drift between the two would only ever make a brand that already
 * resolves in one file fail to resolve in the other, which is caught the
 * moment `tests/brandLogos.test.ts` or a manual check compares them; nothing
 * silently mismatches a brand to someone else's logo.
 *
 * ── The top-100 pass, 2026-09-10 ─────────────────────────────────────────────
 * Worked `BY_POPULARITY` top-down per docs/LOGOS-PLAN.md §5 step 6, from
 * `scripts/logo-probe.ts`'s report (docs/LOGO-PROBE-REPORT.md). Every entry
 * below was also opened and looked at by eye before it shipped — the probe
 * only measures ink and dimensions, it cannot tell a real mark from a wrong
 * one, and two real mismatches turned up exactly that way:
 *
 *   - French Avenue's own declared `Organization.logo` is, on inspection,
 *     the Fragrance World globe mark — a different house's identity, hosted
 *     on French Avenue's own CDN. Left out; the monogram stands.
 *   - "New Brand"'s only candidate belongs to pcdesignperfumes.com, the
 *     parent storefront BRAND_SITES resolves it through, not to the "New
 *     Brand" sub-line itself. Left out for the same reason.
 *
 * Three more were dropped for being real but wrong to ship: Al Haramain's
 * and Ahmed Al Maghribi's only candidates are dated anniversary badges ("55
 * Years"/"since 1970", "25 YEARS") rather than a standing mark, and Rasasi's
 * only candidate is an implausible gradient heart icon that reads as a
 * generic favicon rather than that house's identity — kept out on the same
 * caution §3 gives Wikidata name-matching. Issey Miyake's only candidate is
 * literal text reading "isseymiyake.com", not a mark at all.
 *
 * 49 of the top 100 brands had at least one automated candidate; 42 shipped
 * as `own-site-declared` after that review. A further 9 designer houses
 * whose own sites block a datacentre fetch were resolved through Wikidata by
 * hand (§3 source 2) — the QID is recorded in a comment beside each entry
 * because name-matching there is dangerous (§3: "Police" resolves to the
 * band, "Givenchy" to a French commune, "Louis Cardin" to a Canadian
 * politician, "Rasasi" to "Rasasienka") and every QID here was opened and
 * its label read before use. Dolce & Gabbana's Commons file (Q214480,
 * `Dolce & Gabbana - logo (Italy, 1985-).svg`) was found and is genuinely
 * `Public domain`, but at 13,812 bytes it is over this repo's 8 KB
 * per-file budget (§4b) and was left uncommitted rather than shipped over
 * budget — Dolce & Gabbana kept the monogram then; the 2026-10-05 pass
 * below found its own site's 192px manifest icon.
 *
 * That is 51 of the top 100 with a real mark and 49 keeping the monogram —
 * itself a legitimate outcome, not a gap to be filled by guessing.
 *
 * ── The 2026-10-05 pass: the next brands down the ranking ───────────────────
 * Worked the catalogue's brands by product count, top down, over the first 200
 * that had no logo (Al Haramain at 487 products down to Vyrao at 26). 61 of
 * those 200 have no official site in BRAND_SITES, so there is nothing to ask
 * and they keep the monogram. The other 139 were probed with
 * `scripts/logo-probe.ts --brands=... --no-social` as PriceSniffsBot: robots.txt
 * read first and obeyed literally (an unreachable or refusing robots.txt, a
 * Crawl-delay over 30s, or a Disallow on the page or icon path means nothing is
 * fetched from that origin), one request per host per 2s. 41 shipped.
 *
 * Refused us, recorded and not worked around: Guerlain, Givenchy, Jimmy Choo,
 * Jo Malone, Bvlgari, Ralph Lauren, Estee Lauder, Tom Ford, Acqua di Parma,
 * Kilian, Maison Francis Kurkdjian, Guess, Versace, Lacoste, Frederic Malle,
 * Moncler, Salvatore Ferragamo, Missoni (robots.txt answered 403); Marc Jacobs,
 * Viktor & Rolf, Tommy Hilfiger, Miu Miu (robots.txt 503); Byredo (robots.txt
 * disallows the page); Giorgio Armani, Emporio Armani, Mugler, Coach, Sisley
 * (homepage 403); Pepe Jeans (homepage 404); Police, Elie Saab, Britney Spears, Aramis (no answer at all,
 * twice). Declared nothing usable: Narciso Rodriguez, Arabiyat, Milton Lloyd,
 * Jenny Glow, Cerruti, Clean (homepage answered 200 with no icon or logo);
 * Lanvin (its manifest icons answer 403).
 *
 * Looked at and rejected:
 *   - another house's or a parent's mark: French Avenue (its declared logo and
 *     favicon are Fragrance World's), New Brand and Cuba Paris (PC Design
 *     Perfumes' PC), Casamorati (Xerjoff's), Jeanne Arthes (Groupe Arthes'
 *     mark), Disney (a storefront, disneystore.co.uk), Molton Brown's manifest
 *     icons (the Angular framework logo);
 *   - anniversary badges: Al Haramain (50 and 55 Years), Ahmed Al Maghribi (25);
 *   - not a mark: Issey Miyake's icon is the text "isseymiyake.com" again;
 *     Tiffany's is a plain teal square; Rasasi's is the same gradient heart
 *     rejected on 2026-09-10; Penhaligon's, Michael Kors, Azzaro, Moschino,
 *     Carner, Ted Baker, Nasomatto and Fugazzi declare a bare letter, which is
 *     no better than our own initials tile;
 *   - too small or blurry (a 16 to 48px favicon, or a Shopify file whose
 *     original is 32px): Jean Paul Gaultier (its larger icons answer 200 with
 *     an empty body), Creed, Maison Crivelli, Serge Lutens, Houbigant, Avon,
 *     Swiss Arabian, Mykonos, Initio, Essential Parfums, Floris,
 *     Caron, Bond No. 9, Cristiano Ronaldo, Antonio Banderas, Lolita Lempicka,
 *     Monotheme and the other 32px icons;
 *   - thin or tiny type that cannot be read at the size drawn: Parfums de
 *     Marly, Juliette Has a Gun, Oscar de la Renta, Goutal, Goldfield & Banks,
 *     Thameen's wordmark, V Canto, Diptyque (clipped);
 *   - light artwork that vanishes on the white tile: Assaf, Gulf Orchid, Ghost,
 *     Surrati, Le Falcone, Sarah Jessica Parker, Laurent Mazzone's wordmark;
 *   - weight or doubt: Atkinsons' only mark is a 1 MB SVG; Dkhoon Emirates'
 *     logo is a 200px file stretched to 512 by a third party host; Trussardi's
 *     and Cacharel's icons could not be told to be the house's mark.
 *
 * ── The 2026-10-12 pass: the next 200 houses without a logo ────────────────
 * Worked the same way, docs/LOGOS-PLAN.md section 8 and section 9, over the next
 * 200 houses without a logo by product count (the UK catalogue, and the US and
 * India catalogues for houses only they sell), skipping every house already
 * decided above: Unbranded (442 products, not a house) down to Fred Hayman (23).
 * 149 of the 200 have no official site in BRAND_SITES, so there is nothing to ask
 * and they keep the monogram. The other 51 were probed with
 * `scripts/logo-probe.ts --brands=... --no-social` as PriceSniffsBot (robots.txt
 * first, read literally, one request per host per 2s). 18 shipped, each opened and
 * looked at from the exact bytes at 42 and 56px on white and on dark.
 *
 * Refused us, recorded and not worked around: Loewe, Van Cleef & Arpels,
 * Courreges (robots.txt answered 403); Salvador Dali (robots.txt 503); Jaguar and
 * Bentley (no answer); Louis Vuitton and Fcuk (homepage 403); Emanuel Ungaro and
 * Arabian Oud (robots.txt disallows the icon path). Declared nothing usable:
 * Hollister, Giorgio Beverly Hills, Pascal Morabito (homepage 200, no icon or logo).
 *
 * Looked at and rejected:
 *   - too small: Mercedes-Benz, Le Couvent, Vera Wang and Laverne declare only a
 *     30 to 32px icon (Mercedes-Benz's and Le Couvent's declared logos answer 404);
 *   - a bare letter, which is no better than our own initials tile: David Beckham
 *     (D), Replay (R), Revlon (R), Chopard (script C), Elizabeth Taylor (T);
 *   - not a mark: Jo Loves declares a plain red circle;
 *   - light artwork that vanishes on the white tile: Lamborghini and Tonino
 *     Lamborghini (white script), Giardino Benessere (white leaf; its logo is a
 *     95 KB file with fine type);
 *   - thin or tiny type, or line art, that cannot be read at the size drawn: Louis
 *     Varel, Annayake, La Perla;
 *   - weight: Roger & Gallet's logo is a 27 KB SVG and Ex Nihilo's only icon a
 *     66 KB ICO (a Shopify width cannot shrink either);
 *   - not the house's own: Jovan (its site is Coty's, so the mark is Coty's; Coty
 *     itself shipped), Aigner (its declared logo is served from aignerimage.de,
 *     not its own domain).
 *
 * ── The 2026-10-23 pass: the top 200 houses still without a logo ────────────
 * Of the 200 houses with the most products and no logo (Unbranded and the
 * houses decided above included), 81 have an official site in BRAND_SITES and 59
 * of those were decided in the passes above. The 27 left (24 probed: three were
 * left out as decided under another spelling or a retailer's page) were probed
 * the same way (`scripts/logo-probe.ts --no-social`, robots.txt first, one request
 * per host per 2s) and **5 shipped**, each drawn at 42 and 56px on white and
 * on dark from the exact bytes: Ramon Monegal, Gisada, Rance 1795, Oud Elixir,
 * Sospiro (all dark ink wordmarks on the white tile). The other 119 of the 200
 * have no official site in BRAND_SITES, so nothing was asked and they keep the
 * monogram; no domain was guessed.
 *
 * Left on initials: Granado, Laurelle Parfums, Phlur (homepage 403), Cyrus
 * (homepage 404), Nylaa and Reebok (robots.txt 403 and 503), MCM (robots.txt
 * disallows its icons), Christina Aguilera (declares nothing); Thomas Kosmala,
 * d'Annam and Atralia (a 32px icon only); Velixir (light ink, vanishes on white),
 * Prime Collection (a 90 KB JPEG on its own white ground), Rituals (an 83 KB SVG
 * and a 16px icon), L'Artisan Parfumeur (its icons answer an HTML page), Alwataniah
 * (thin Arabic calligraphy that cannot be read at the size drawn); Sistelle (its
 * only wordmark is Paris Bleu's, another house), Today Tomorrow Always and Far
 * Away (Avon's favicon, the parent's mark).
 */
export const BRAND_LOGOS: Record<string, LogoRef> = {
  // ── Own site declared (42) ──────────────────────────────────────────────
  lattafa: {
    src: 'https://www.lattafa-usa.com/cdn/shop/files/Logo_07f1bbc2-d14d-487f-b177-17d76faa8469.png?v=1749241065&width=300',
    shape: 'wordmark',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://lattafa.com/',
    readAt: '2026-09-10',
  },
  'fragrance world': {
    src: 'https://fragranceworld.ae/wp-content/uploads/2025/10/cropped-Screenshot_2025-10-25_at_7.20.53_AM-removebg-preview-192x192.png',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://fragranceworld.ae/',
    readAt: '2026-09-10',
  },
  armaf: {
    src: 'https://armaf.uk/cdn/shop/files/1._ARMAF_LOGO_-_BLACK_PNG.png?v=1769167096&width=112',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://armaf.uk/',
    readAt: '2026-09-10',
  },
  bujairami: {
    src: 'https://bujairami.ae/cdn/shop/files/WhatsApp_Image_2024-09-29_at_3.45.43_PM.jpg?crop=center&height=152&v=1727614213&width=152',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://bujairami.ae/',
    readAt: '2026-09-10',
  },
  'maison alhambra': {
    src: 'https://maisonalhambra.co/wp-content/uploads/2025/10/Untitled_design__2_-removebg-preview.png',
    shape: 'square',
    ink: 'light',
    basis: 'own-site-declared',
    source: 'https://maisonalhambra.co/',
    readAt: '2026-09-10',
  },
  'hugo boss': {
    src: 'https://www.hugoboss.com/on/demandware.static/Sites-UK-Site/-/default/dwe5b84fa4/images/apple-touch-icon.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.hugoboss.com/uk/',
    readAt: '2026-09-10',
  },
  'carolina herrera': {
    src: 'https://www.carolinaherrera.com/assets/icons/icon_144x144.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.carolinaherrera.com/uk/en/c/fragrances',
    readAt: '2026-09-10',
  },
  burberry: {
    src: 'https://uk.burberry.com/nrws/common/favicon/180x180.png',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://uk.burberry.com/',
    readAt: '2026-09-10',
  },
  'paris corner': {
    src: 'https://pariscorner.ae/wp-content/uploads/2024/12/cropped-Paris-logo-512x512-white-BG.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://pariscorner.ae/',
    readAt: '2026-09-10',
  },
  'herm s': {
    src: 'https://www.hermes.com/uk/en/assets/images/favicon/apple-touch-icon-iphone-3x.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.hermes.com/uk/en/',
    readAt: '2026-09-10',
  },
  prada: {
    src: 'https://www.prada.com/favicon.ico',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.prada.com/gb/en/perfumes-and-beauty/fragrances/c/10566EU',
    readAt: '2026-09-10',
  },
  orchid: {
    src: 'https://orchidperfumesfactory.com/wp-content/uploads/2026/09/cropped-ORCHID-LOGO3-192x192.jpg',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://orchidperfumesfactory.com/',
    readAt: '2026-09-10',
  },
  afnan: {
    src: 'https://uk.afnan.com/cdn/shop/files/Screenshot_2024-09-27_at_12.30.34_AM.png?v=1728583135&width=112',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://uk.afnan.com/',
    readAt: '2026-09-10',
  },
  'elizabeth arden': {
    src: 'https://www.elizabetharden.co.uk/cdn/shop/files/safari-pinned-tab.svg?v=18107465327723548299',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.elizabetharden.co.uk/',
    readAt: '2026-09-10',
  },
  dkny: {
    src: 'https://www.dkny.com/cdn/shop/files/DKNYlogo_stack.png?v=1706650251&width=180',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.dkny.com/collections/fragrance',
    readAt: '2026-09-10',
  },
  'brandy designs': {
    src: 'https://brandyperfumes.com/wp-content/uploads/2025/03/cropped-Brandy-Logo-Icon_page-0001-192x192.jpg',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://brandyperfumes.com/',
    readAt: '2026-09-10',
  },
  montblanc: {
    src: 'https://www.montblanc.com/on/demandware.static/Sites-MontblancROW-Site/-/default/dwec615165/images/favicons/favicon.svg',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.montblanc.com/en-gb/fragrances',
    readAt: '2026-09-10',
  },
  kenzo: {
    src: 'https://www.kenzo.com/on/demandware.static/-/Library-Sites-Kenzo-SharedLibrary/default/dw059b9a09/PAID_KENZO-LOGO_240x240.png',
    shape: 'square',
    ink: 'light',
    basis: 'own-site-declared',
    source: 'https://www.kenzo.com/uk/en/',
    readAt: '2026-09-10',
  },
  rayhaan: {
    src: 'https://rayhaanperfumes.com/cdn/shop/t/14/assets/favicon.png?width=300',
    shape: 'wordmark',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://rayhaanperfumes.com/',
    readAt: '2026-09-10',
  },
  valentino: {
    src: 'https://www.valentino.com/etc.clientlibs/vlr/clientlibs/clientlib-static/resources/images/favicon/android-icon-192x192.png',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.valentino.com/en-gb/experience/valentino-beauty',
    readAt: '2026-09-10',
  },
  xerjoff: {
    src: 'https://www.xerjoff.com/cdn/shop/files/Logo.svg?v=1738685244&width=500',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.xerjoff.com/',
    readAt: '2026-09-10',
  },
  chlo: {
    src: 'https://www.chloe.com/on/demandware.static/Sites-ChloeEUROPE-Site/-/default/dwd616bffd/images/favicons/favicon.svg?v=2',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.chloe.com/en-gb/c/fragrances',
    readAt: '2026-09-10',
  },
  'yardley london': {
    src: 'https://yardleylondon.co.uk/favicon-192x192.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://yardleylondon.co.uk/',
    readAt: '2026-09-10',
  },
  'm urer wirtz': {
    src: 'https://www.m-w.de/wp-content/uploads/cropped-mw-favicon-192x192.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.m-w.de/en/',
    readAt: '2026-09-10',
  },
  davidoff: {
    src: 'https://cdn.prod.website-files.com/687ce6f184420067f31990d5/68d5a20b24c6e4f259a8f1b5_Webclip.jpg',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.zinodavidoff.com/',
    readAt: '2026-09-10',
  },
  montale: {
    src: 'https://www.montaleparfums.com/img/logo.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://montaleparfums.com/en/',
    readAt: '2026-09-10',
  },
  'reef perfumes': {
    src: 'https://www.reef-parfum.com/wp-content/uploads/2026/06/logo-reef-parfum.jpg',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.reef-parfum.com/en/',
    readAt: '2026-09-10',
  },
  'maison asrar': {
    src: 'https://maisonasrar.com/cdn/shop/files/MAISONASRARLOGOPNG.png?v=1786174491&width=300',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://maisonasrar.com/',
    readAt: '2026-09-10',
  },
  'maison margiela': {
    src: 'https://www.maisonmargiela.com/on/demandware.static/Sites-MargielaGB-Site/-/default/dw7e9dbd35/favicons/safari-pinned-tab.svg',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.maisonmargiela.com/en-gb/',
    readAt: '2026-09-10',
  },
  dunhill: {
    src: 'https://www.dunhill.com/on/demandware.static/Sites-DunhillROW-Site/-/default/dwe8b0d2c8/images/favicons/favicon-white.svg',
    shape: 'square',
    ink: 'light',
    basis: 'own-site-declared',
    source: 'https://www.dunhill.com/en-gb/',
    readAt: '2026-09-10',
  },
  'roberto cavalli': {
    src: 'https://www.robertocavalli.com/mobify/bundle/470/static/favicon/favicon.svg',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.robertocavalli.com/en-gb/explore-perfume',
    readAt: '2026-09-10',
  },
  'escentric molecules': {
    src: 'https://scdn.speedsize.com/54343ecb-8aeb-4686-af82-3f829e50d808/www.escentric.com/cdn/shop/files/Escentric_Molecules_Favicon.svg?crop=center&height=32&v=1739390404&width=32',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.escentric.com/',
    readAt: '2026-09-10',
  },
  'karl lagerfeld': {
    src: 'https://www.karllagerfeld.com/cdn/shop/t/144/assets/favicon.svg?v=43487585118945864841787066152',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.karllagerfeld.com/en-gb/',
    readAt: '2026-09-10',
  },
  'al rehab': {
    src: 'https://alrehab.com/wp-content/uploads/2026/02/cropped-logo-sqaure-192x192.jpg',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.alrehab.com/',
    readAt: '2026-09-10',
  },
  'nina ricci': {
    src: 'https://www.ninaricci.com/safari-pinned-tab.svg',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.ninaricci.com/en-uk',
    readAt: '2026-09-10',
  },
  rochas: {
    src: 'https://www.rochas.com/wp-content/uploads/2021/05/app.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.rochas.com/en',
    readAt: '2026-09-10',
  },
  'le bonheur': {
    src: 'https://cdn.files.salla.network/other/673065613/115d7933-1b37-4b04-81d7-19653061a3c9-original.webp',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://lebonheurperfumes.com/en',
    readAt: '2026-09-10',
  },
  lalique: {
    src: 'https://uk.lalique.com/cdn/shop/files/LOGO_LALIQUE_BLACK_2285233d-1ba1-40a3-b2ab-0861ef8fca6a.svg?v=8290495384548174312',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://uk.lalique.com/',
    readAt: '2026-09-10',
  },
  escada: {
    src: 'https://www.escada.com/cdn/shop/files/ESCADA-combined-logo-web.png?v=1733775154&width=300',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.escada.com/',
    readAt: '2026-09-10',
  },
  orientica: {
    src: 'https://www.orientica.co.uk/cdn/shop/files/Orientica_word_mark_White.png?v=1776155565&width=400',
    shape: 'wordmark',
    ink: 'light',
    basis: 'own-site-declared',
    source: 'https://www.orientica.co.uk/',
    readAt: '2026-09-10',
  },
  'ariana grande': {
    src: 'https://cdn.shopify.com/s/files/1/0949/7319/8654/files/ARI_LOGO.svg?v=1762467822',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://arianagrandefragrances.com/',
    readAt: '2026-09-10',
  },
  mancera: {
    src: 'https://www.manceraparfums.com/img/logo-1762917506.jpg',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://manceraparfums.com/en/',
    readAt: '2026-09-10',
  },

  // ── Wikimedia Commons, public domain wordmarks (own site blocks a
  //    datacentre fetch) — §3 source 2. Each QID was opened and its label
  //    read before use; extmetadata.LicenseShortName confirmed "Public
  //    domain" for every one, read the same day as the file. ────────────
  /** Wikidata Q1068628, "Calvin Klein" (American fashion house). */
  'calvin klein': {
    src: '/logos/calvin-klein.svg',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'commons-public-domain',
    source: 'https://commons.wikimedia.org/wiki/File:Calvin_klein_logo_web23.svg',
    readAt: '2026-09-10',
  },
  /** Wikidata Q178516, "Gucci" (Italian luxury fashion house). */
  gucci: {
    src: '/logos/gucci.svg',
    shape: 'square',
    ink: 'dark',
    basis: 'commons-public-domain',
    source: 'https://commons.wikimedia.org/wiki/File:Gucci_logo.svg',
    readAt: '2026-09-10',
  },
  /** Wikidata Q542767, "Christian Dior" (French multinational luxury fashion house). */
  dior: {
    src: '/logos/dior.svg',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'commons-public-domain',
    source: 'https://commons.wikimedia.org/wiki/File:Dior_Logo_2022.svg',
    readAt: '2026-09-10',
  },
  /** Wikidata Q1541268, "Lancôme" (French luxury perfumes and cosmetics house) —
   *  NOT Q1470545, the commune of the same name in Loir-et-Cher. */
  'lanc me': {
    src: '/logos/lancome.svg',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'commons-public-domain',
    source: 'https://commons.wikimedia.org/wiki/File:Lanc%C3%B4me_logo.svg',
    readAt: '2026-09-10',
  },
  /** Wikidata Q2282172, "Yves Saint Laurent" (French luxury fashion house) —
   *  NOT Q171556, the designer himself. */
  'yves saint laurent': {
    src: '/logos/yves-saint-laurent.svg',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'commons-public-domain',
    source: 'https://commons.wikimedia.org/wiki/File:Logo_of_Yves_Saint_Laurent_SAS.svg',
    readAt: '2026-09-10',
  },

  // ── Owner supplied, 2026-10-04 (docs/LOGOS-PLAN.md section 7) ──────────────
  // The same files as the shops of the same name in src/config/retailers.ts:
  // Zimaya and BellaVita are houses with a shop of their own, so the brand
  // page shows the owner's file too. Zimaya's is a type only wordmark, so it
  // fills the wide slot; BellaVita's is a square tile. The brand string the
  // catalogue carries is "Bellavita UK"; the other two keys are the spellings
  // demo/brandSites.ts already resolves to the same business.
  'zimaya': {
    src: '/logos/shops/zimaya.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 4 October 2026',
    readAt: '2026-10-04',
  },
  'bellavita uk': {
    src: '/logos/shops/bellavita-luxury.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 4 October 2026',
    readAt: '2026-10-04',
  },
  'bellavita': {
    src: '/logos/shops/bellavita-luxury.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 4 October 2026',
    readAt: '2026-10-04',
  },
  'bellavita luxury uk': {
    src: '/logos/shops/bellavita-luxury.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 4 October 2026',
    readAt: '2026-10-04',
  },

  // ── Owner supplied brand logos, 2026-10-05 ───────────────────────────────
  // Files the site owner sent for houses whose own sites block a datacentre
  // fetch, flattened on solid white and kept under /logos/brands/. Al Haramain
  // and Versace are marks with a symbol, so they fill the square slot; the
  // other three are type only, so they fill the wide slot.
  'al haramain': {
    src: '/logos/brands/al-haramain.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 5 October 2026',
    readAt: '2026-10-05',
  },
  'giorgio armani': {
    src: '/logos/brands/giorgio-armani.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 5 October 2026',
    readAt: '2026-10-05',
  },
  'tom ford': {
    src: '/logos/brands/tom-ford.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 5 October 2026',
    readAt: '2026-10-05',
  },
  'jean paul gaultier': {
    src: '/logos/brands/jean-paul-gaultier.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 5 October 2026',
    readAt: '2026-10-05',
  },
  versace: {
    src: '/logos/brands/versace.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 5 October 2026',
    readAt: '2026-10-05',
  },

  guerlain: {
    src: '/logos/brands/guerlain.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'acqua di parma': {
    src: '/logos/brands/acqua-di-parma.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'french avenue': {
    src: '/logos/brands/french-avenue.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  givenchy: {
    src: '/logos/brands/givenchy.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'issey miyake': {
    src: '/logos/brands/issey-miyake.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'marc jacobs': {
    src: '/logos/brands/marc-jacobs.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'jo malone': {
    src: '/logos/brands/jo-malone.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'bon parfumeur': {
    src: '/logos/brands/bon-parfumeur.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  police: {
    src: '/logos/brands/police.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  bvlgari: {
    src: '/logos/brands/bvlgari.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'narciso rodriguez': {
    src: '/logos/brands/narciso-rodriguez.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'pierre guillaume parfumerie g n rale': {
    src: '/logos/brands/pierre-guillaume.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'jimmy choo': {
    src: '/logos/brands/jimmy-choo.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'louis cardin': {
    src: '/logos/brands/louis-cardin.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  kilian: {
    src: '/logos/brands/kilian.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  mugler: {
    src: '/logos/brands/mugler.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  creed: {
    src: '/logos/brands/creed.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'parfums de marly': {
    src: '/logos/brands/parfums-de-marly.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'penhaligon s': {
    src: '/logos/brands/penhaligons.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  lacoste: {
    src: '/logos/brands/lacoste.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'ralph lauren': {
    src: '/logos/brands/ralph-lauren.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'viktor rolf': {
    src: '/logos/brands/viktor-and-rolf.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  byredo: {
    src: '/logos/brands/byredo.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'laboratorio olfattivo': {
    src: '/logos/brands/laboratorio-olfattivo.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  moschino: {
    src: '/logos/brands/moschino.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'd s durga': {
    src: '/logos/brands/ds-durga.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'fr d ric malle': {
    src: '/logos/brands/frederic-malle.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  molinard: {
    src: '/logos/brands/molinard.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  coach: {
    src: '/logos/brands/coach.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'ibrahim al qurashi': {
    src: '/logos/brands/ibrahim-al-qurashi.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'salvatore ferragamo': {
    src: '/logos/brands/salvatore-ferragamo.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  carner: {
    src: '/logos/brands/carner.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'maison francis kurkdjian': {
    src: '/logos/brands/maison-francis-kurkdjian.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'avon cosmetics': {
    src: '/logos/brands/avon.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'juliette has a gun': {
    src: '/logos/brands/juliette-has-a-gun.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'masque milano': {
    src: '/logos/brands/masque-milano.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  swedoft: {
    src: '/logos/brands/swedoft.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  houbigant: {
    src: '/logos/brands/houbigant.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'est e lauder': {
    src: '/logos/brands/estee-lauder.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  azzaro: {
    src: '/logos/brands/azzaro.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  rasasi: {
    src: '/logos/brands/rasasi.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  borntostandout: {
    src: '/logos/brands/borntostandout.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'parle moi de parfum': {
    src: '/logos/brands/parle-moi-de-parfum.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  tuesdays: {
    src: '/logos/brands/4160-tuesdays.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  nicolai: {
    src: '/logos/brands/nicolai.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  nobile: {
    src: '/logos/brands/nobile-1942.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'elie saab': {
    src: '/logos/brands/elie-saab.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'ted baker': {
    src: '/logos/brands/ted-baker.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'floris london': {
    src: '/logos/brands/floris-london.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'initio parfums priv s': {
    src: '/logos/brands/initio.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  fugazzi: {
    src: '/logos/brands/fugazzi.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'essential parfums': {
    src: '/logos/brands/essential-parfums.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'maison crivelli': {
    src: '/logos/brands/maison-crivelli.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'goldfield banks': {
    src: '/logos/brands/goldfield-and-banks.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'jenny glow': {
    src: '/logos/brands/jenny-glow.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'sarah jessica parker': {
    src: '/logos/brands/sarah-jessica-parker.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'carthusia i profumi di capri': {
    src: '/logos/brands/carthusia.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  guess: {
    src: '/logos/brands/guess.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'gulf orchid': {
    src: '/logos/brands/gulf-orchid.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'ahmed al maghribi': {
    src: '/logos/brands/ahmed-al-maghribi.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  arabiyat: {
    src: '/logos/brands/arabiyat.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'ormonde jayne': {
    src: '/logos/brands/ormonde-jayne.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'd orsay': {
    src: '/logos/brands/dorsay.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'liquides imaginaires': {
    src: '/logos/brands/liquides-imaginaires.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  moncler: {
    src: '/logos/brands/moncler.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  caron: {
    src: '/logos/brands/caron.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  mykonos: {
    src: '/logos/brands/mykonos.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'tommy hilfiger': {
    src: '/logos/brands/tommy-hilfiger.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  riiffs: {
    src: '/logos/brands/riiffs.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'simone andreoli': {
    src: '/logos/brands/simone-andreoli.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  cacharel: {
    src: '/logos/brands/cacharel.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'michael kors': {
    src: '/logos/brands/michael-kors.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'chabaud maison de parfum': {
    src: '/logos/brands/chabaud.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'jovoy paris': {
    src: '/logos/brands/jovoy-paris.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'swiss arabian': {
    src: '/logos/brands/swiss-arabian.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'farmacia ss annunziata': {
    src: '/logos/brands/farmacia-ss-annunziata.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  ajmal: {
    src: '/logos/brands/ajmal.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'stephane humbert lucas': {
    src: '/logos/brands/stephane-humbert-lucas.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  zoologist: {
    src: '/logos/brands/zoologist.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  akro: {
    src: '/logos/brands/akro.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  balmain: {
    src: '/logos/brands/balmain.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  casamorati: {
    src: '/logos/brands/casamorati.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'superz budapest': {
    src: '/logos/brands/superz-budapest.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'new notes': {
    src: '/logos/brands/new-notes.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'floral street': {
    src: '/logos/brands/floral-street.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'bond no': {
    src: '/logos/brands/bond-no-9.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  jeroboam: {
    src: '/logos/brands/jeroboam.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  diptyque: {
    src: '/logos/brands/diptyque.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'emporio armani': {
    src: '/logos/brands/emporio-armani.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  assaf: {
    src: '/logos/brands/assaf.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  cartier: {
    src: '/logos/brands/cartier.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'flora ku paris': {
    src: '/logos/brands/floraiku-paris.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'olfactive studio': {
    src: '/logos/brands/olfactive-studio.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'ellen tracy': {
    src: '/logos/brands/ellen-tracy.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  lanvin: {
    src: '/logos/brands/lanvin.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  aramis: {
    src: '/logos/brands/aramis.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'miu miu': {
    src: '/logos/brands/miu-miu.png',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'matiere premiere': {
    src: '/logos/brands/matiere-premiere.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  nasomatto: {
    src: '/logos/brands/nasomatto.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  'orto parisi': {
    src: '/logos/brands/orto-parisi.png',
    shape: 'square',
    ink: 'dark',
    basis: 'owner-supplied',
    source: 'Supplied by the site owner on 6 October 2026',
    readAt: '2026-10-06',
  },
  // ── Own site declared, the 2026-10-05 pass (41) ──────────────────────────
  // Every entry: the logo or icon the brand's own site declares (its
  // Organization.logo, apple-touch-icon, manifest icon or favicon), hot-linked
  // from the brand's own host, opened and looked at by eye at 42 and 56px on a
  // white and a dark ground before it went in. All but four sit on the white
  // tile (`ink: 'dark'`, a white tile in both themes, as the owner asked); the
  // four that carry their own dark or coloured ground (BDK, Diesel, Izod,
  // Laurent Mazzone) are `own`. A `&width=` on a Shopify URL asks
  // the same file for a smaller or larger rendition and nothing else.
  'vilhelm parfumerie': {
    src: 'https://vilhelmparfumerie.com/cdn/shop/files/VP-LOGO_No_background_2024_copie.png?v=1707223106&width=500', // Vilhelm Parfumerie: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://vilhelmparfumerie.com/',
    readAt: '2026-10-05',
  },
  chanel: {
    src: 'https://www.chanel.com/assets/icons/icon4.png?undefined', // Chanel: icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.chanel.com/gb/',
    readAt: '2026-10-05',
  },
  kajal: {
    src: 'https://kajalperfumes.com/cdn/shop/files/PITTOGRAMMA.png?v=1775831592&width=180', // Kajal: apple-touch-icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://kajalperfumes.com/',
    readAt: '2026-10-05',
  },
  'street origins': {
    src: 'https://streetorigins.co/cdn/shop/files/Street_SO_1_2.png?v=1763464854&width=500', // Street Origins: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://streetorigins.co/',
    readAt: '2026-10-05',
  },
  baldessarini: {
    src: 'https://baldessarini-fragrances.com/cdn/shop/files/BALDESSARINI_CLASSIC_Logo_Black.png?v=1727098894&width=500', // Baldessarini: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://baldessarini-fragrances.com/en',
    readAt: '2026-10-05',
  },
  izod: {
    src: 'https://izod.com/cdn/shop/files/ICON_96x.png?v=1632593762', // Izod: shortcut icon
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://izod.com/',
    readAt: '2026-10-05',
  },
  'sol de janeiro': {
    src: 'https://soldejaneiro.com/cdn/shop/files/logo.svg?v=1788375686&width=500', // Sol de Janeiro: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://soldejaneiro.com/',
    readAt: '2026-10-05',
  },
  rabanne: {
    src: 'https://www.rabanne.com/favicon.ico', // Rabanne: icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.rabanne.com/uk/en_GB/fragrance/homepagefragrance',
    readAt: '2026-10-05',
  },
  kayali: {
    src: 'https://uk.kayali.com/cdn/shop/files/favicon_v3_Kayali_logo_64x64.png?v=1771838288', // Kayali: shortcut icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://uk.kayali.com/',
    readAt: '2026-10-05',
  },
  khadlaj: {
    src: 'https://www.khadlaj-perfumes.co.uk/cdn/shop/files/Khadlaj_logo_160x_2x_160x_2x_58d4d523-785f-4796-b656-f59fe7c51c7e_small.avif?v=1762587505', // Khadlaj: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.khadlaj-perfumes.co.uk/',
    readAt: '2026-10-05',
  },
  'etat libre d orange': {
    src: 'https://www.etatlibredorange.com/cdn/shop/files/image_10.png?v=1670345084&width=272', // Etat Libre d'Orange: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.etatlibredorange.com/',
    readAt: '2026-10-05',
  },
  bois: {
    src: 'https://www.bois1920.it/wp-content/uploads/2014/07/bois1920-logo-home03.png', // Bois 1920: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.bois1920.it/en/',
    readAt: '2026-10-05',
  },
  'perris monte carlo': {
    src: 'https://perrismontecarlo.com/cdn/shop/files/Perris_Monte_Carlo_logo_96x.png?v=1626093862', // Perris Monte Carlo: shortcut icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://perrismontecarlo.com/collections/all-perfums-extracts',
    readAt: '2026-10-05',
  },
  'atelier des ors': {
    src: 'https://atelierdesors.com/cdn/shop/files/Favicon_Atelier_des_ors_1.png?v=1753966669&width=180', // Atelier des Ors: apple-touch-icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://atelierdesors.com/en',
    readAt: '2026-10-05',
  },
  joop: {
    src: 'https://www.joop.com/static/joop/images/favicon/favicon.png', // Joop!: icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.joop.com/',
    readAt: '2026-10-05',
  },
  'juicy couture': {
    src: 'https://juicycouture.com/cdn/shop/files/JC_MAIN_LINE_LOGO_2X_5e707f7d-a418-4028-a2df-b6b16b79bd01.png?v=1623787953&width=638', // Juicy Couture: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://juicycouture.com/',
    readAt: '2026-10-05',
  },
  dsquared: {
    src: 'https://www.dsquared2.com/on/demandware.static/Sites-dsquared2-row-Site/-/default/dw16a3111f/images/favicons/apple-icon-180x180.png', // DSquared2: apple-touch-icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.dsquared2.com/',
    readAt: '2026-10-05',
  },
  'paris bleu': {
    src: 'https://parisbleu.com/cdn/shop/files/PARIS_BLEU_1989_2.png?v=1749119442&width=500', // Paris Bleu: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://parisbleu.com/',
    readAt: '2026-10-05',
  },
  'tiziana terenzi': {
    src: 'https://tizianaterenzi.com/wp-content/uploads/2023/02/download-removebg-preview.png', // Tiziana Terenzi: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://tizianaterenzi.com/en/',
    readAt: '2026-10-05',
  },
  'boadicea the victorious': {
    src: 'https://boadiceaperfume.com/cdn/shop/files/site-logo-new.png?v=1765795877&width=500', // Boadicea The Victorious: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://boadiceaperfume.com/',
    readAt: '2026-10-05',
  },
  embark: {
    src: 'https://www.embarkperfumes.com/cdn/shop/files/embarklogo_black.png?v=1748686266&width=500', // Embark: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.embarkperfumes.com/',
    readAt: '2026-10-05',
  },
  clinique: {
    src: 'https://www.clinique.co.uk/cdn/shop/files/Clinique_Logo.png?format=webp&v=1789755130&width=500', // Clinique: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.clinique.co.uk/',
    readAt: '2026-10-05',
  },
  boucheron: {
    src: 'https://www.boucheron.com/static/version1788955885/frontend/Boucheron/hyva/en_US/Magento_Theme/favicon.ico', // Boucheron: icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.boucheron.com/',
    readAt: '2026-10-05',
  },
  thameen: {
    src: 'https://thameenfragrance.com/cdn/shop/files/Thameen-Favicon-Black.svg?v=1771503285', // Thameen: icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://thameenfragrance.com/',
    readAt: '2026-10-05',
  },
  'dolce gabbana': {
    src: 'https://www.dolcegabbana.com/mobify/bundle/11395/static/img/global/app-icon-192.png', // Dolce & Gabbana: manifest icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.dolcegabbana.com/en-gb/beauty/',
    readAt: '2026-10-05',
  },
  amouage: {
    src: 'https://amouage.com/cdn/shop/files/LOGO_2_2_1.svg?v=1700649625&width=500', // Amouage: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://amouage.com/',
    readAt: '2026-10-05',
  },
  'molton brown': {
    src: 'https://www.moltonbrown.co.uk/assets/icons/favicon_black.svg', // Molton Brown: icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.moltonbrown.co.uk/',
    readAt: '2026-10-05',
  },
  'abercrombie fitch': {
    src: 'https://img.abercrombie.com/is/image/anf/anf-favicon-196.png', // Abercrombie & Fitch: icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.abercrombie.com/',
    readAt: '2026-10-05',
  },
  'lorenzo pazzaglia': {
    src: 'https://www.lorenzopazzaglia.com/wp-content/uploads/2022/10/cropped-favicon-192x192.png', // Lorenzo Pazzaglia: icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.lorenzopazzaglia.com/en/',
    readAt: '2026-10-05',
  },
  diesel: {
    src: 'https://uk.diesel.com/on/demandware.static/Sites-DieselGB-Site/-/default/dw880a87e3/imgs/favicons/apple-touch-icon-114x114.png', // Diesel: apple-touch-icon
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://uk.diesel.com/',
    readAt: '2026-10-05',
  },
  'zadig voltaire': {
    src: 'https://zadig-et-voltaire.com/apple-touch-icon.png', // Zadig & Voltaire: apple-touch-icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.zadig-et-voltaire.com/',
    readAt: '2026-10-05',
  },
  'histoires de parfums': {
    src: 'https://www.histoiresdeparfums.com/cdn/shop/files/android-chrome-192x192.png?v=1711468642&width=180', // Histoires de Parfums: apple-touch-icon
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.histoiresdeparfums.com/',
    readAt: '2026-10-05',
  },
  'le labo': {
    src: 'https://www.lelabofragrances.com/css/images/logonew.png', // Le Labo: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.lelabofragrances.com/',
    readAt: '2026-10-05',
  },
  'sabrina carpenter': {
    src: 'https://fragrancebysabrina.com/cdn/shop/files/Sabrina-Logo.svg?v=1762866860&width=500', // Sabrina Carpenter: Organization.logo
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://fragrancebysabrina.com/',
    readAt: '2026-10-05',
  },
  'bdk parfums': {
    src: 'https://bdkparfums.com/cdn/shop/files/FavIcon.jpg?v=1787643443&width=192', // BDK Parfums: icon (larger rendition of the declared file)
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://bdkparfums.com/en',
    readAt: '2026-10-05',
  },
  'clive christian': {
    src: 'https://www.clivechristian.com/cdn/shop/files/CC_favicon.png?v=1677227064&width=192', // Clive Christian: icon (larger rendition of the declared file)
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.clivechristian.com/',
    readAt: '2026-10-05',
  },
  'shay blue': {
    src: 'https://www.shayandblue.com/cdn/shop/files/SB_BP_Roundel-3035c_5d20691c-99cd-42ad-939b-ecb98de8127f.png?v=1648817832&width=192', // Shay & Blue: shortcut icon (larger rendition of the declared file)
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.shayandblue.com/',
    readAt: '2026-10-05',
  },
  'ard al zaafaran': {
    src: 'https://ardalzaafaranshop.com/cdn/shop/files/Ard_Al_Zaafaran_Logo_-_Edited_48ebb48f-0099-4e61-9a1e-d102fa94fa5d.png?v=1727696186&width=128', // Ard Al Zaafaran: shortcut icon (larger rendition of the declared file)
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://ardalzaafaranshop.com/',
    readAt: '2026-10-05',
  },
  'laurent mazzone': {
    src: 'https://www.lmparfums.com/cdn/shop/files/LM_logo.png?v=1779358604&width=225', // Laurent Mazzone: icon (larger rendition of the declared file)
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.lmparfums.com/en-us',
    readAt: '2026-10-05',
  },
  'miller harris': {
    src: 'https://www.millerharris.com/cdn/shop/files/favicon-mh-v1-2026.png?v=1776445286&width=192', // Miller Harris: icon (larger rendition of the declared file)
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.millerharris.com/',
    readAt: '2026-10-05',
  },
  'alexandre j': {
    src: 'https://www.alexandre-j.com/cdn/shop/files/logo_02781552-349a-45cc-bd78-ba78eb2544b7.png?v=1728635947&width=160', // Alexandre.J: icon (larger rendition of the declared file)
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.alexandre-j.com/',
    readAt: '2026-10-05',
  },
  // ── Own site declared, the 2026-10-12 pass (18) ─────────────────────────────
  nishane: {
    src: 'https://nishane.com/wp-content/uploads/2022/08/cropped-248569031_676373556590517_4037961695356791990_n-192x192.jpeg',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://nishane.com/',
    readAt: '2026-10-12',
  },
  'jil sander': {
    src: 'https://www.jilsander.com/on/demandware.static/Sites-JilSanderUS-Site/-/default/dw8da5e552/favicons/apple-touch-icon.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.jilsander.com/',
    readAt: '2026-10-12',
  },
  korres: {
    src: 'https://uk.korres.com/cdn/shop/files/KORRES_Web_Logo_735750ed-2c98-490f-92bd-c513397e553a.svg?v=1743398216&width=500',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://uk.korres.com/',
    readAt: '2026-10-12',
  },
  'alyssa ashley': {
    src: 'https://www.alyssaashley.com/cdn/shop/files/favicon.png?crop=center&height=180&v=1720505981&width=180',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.alyssaashley.com/',
    readAt: '2026-10-12',
  },
  'memo paris': {
    src: 'https://www.memoparis.com/cdn/shop/files/Favicon_Memo_MONO_blanc_copie.png?v=1773238837&width=180',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.memoparis.com/',
    readAt: '2026-10-12',
  },
  'laura biagiotti': {
    src: 'https://laurabiagiotti.it/wp-content/uploads/2026/07/cropped-favicon-192x192.jpeg',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://laurabiagiotti.it/fragrances/?lang=en',
    readAt: '2026-10-12',
  },
  'jean patou': {
    src: 'https://www.patou.com/cdn/shop/t/243/assets/logo-patou-navy.svg?v=1634940831055757901726480957',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.patou.com/',
    readAt: '2026-10-12',
  },
  'anna sui': {
    src: 'https://annasui.com/cdn/shop/files/Anna_Sui_Logo-Black1_93bd821d-48b1-46f4-baad-04ae160f7ccb.png?v=1738688472&width=500',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.annasui.com/',
    readAt: '2026-10-12',
  },
  'franck olivier': {
    src: 'https://franckolivier.fr/cdn/shop/t/8/assets/logo-franck-olivier.svg?v=61560029146549292701781087353',
    shape: 'square',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://franckolivier.fr/',
    readAt: '2026-10-12',
  },
  coty: {
    src: 'https://www.coty.com/android-icon-192x192.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.coty.com/',
    readAt: '2026-10-12',
  },
  lomani: {
    src: 'https://lomaniperfumes.com/cdn/shop/files/Untitled_97.png?v=1723085284&width=500',
    shape: 'wordmark',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://lomaniperfumes.com/',
    readAt: '2026-10-12',
  },
  'el ganso': {
    src: 'https://www.elganso.com/media/favicon/icons/icon_ios_180x180.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.elganso.com/intl_en/',
    readAt: '2026-10-12',
  },
  mexx: {
    src: 'https://www.mexx.com/cdn/shop/files/logo-black.svg?v=1781248773',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.mexx.com/',
    readAt: '2026-10-12',
  },
  bon: {
    src: 'https://www.100bon.com/cdn/shop/files/Logo_100BON_site.jpg?v=1659357207&width=360',
    shape: 'wordmark',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.100bon.com/en',
    readAt: '2026-10-12',
  },
  bharara: {
    src: 'https://www.bhararabeauty.com/cdn/shop/files/Gemini_Generated_Image_357jhn357jhn357j.png?v=1772644055&width=168',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.bhararabeauty.com/',
    readAt: '2026-10-12',
  },
  tubbees: {
    src: 'https://www.tubbees.com/cdn/shop/files/tubbees-logo.png?v=1759142270&width=500',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.tubbees.com/',
    readAt: '2026-10-12',
  },
  'billie eilish': {
    src: 'https://store.billieeilish.com/cdn/shop/files/BE-000087_2026Store_Meta-01_Favicon_88136a41-2270-4724-b0af-3bdafa79048b.jpg?crop=center&height=180&v=1778243479&width=180',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://store.billieeilish.com/',
    readAt: '2026-10-12',
  },
  'victorinox swiss army': {
    src: 'https://www.victorinox.com/_next/static/media/favicon-apple-180x180.b70abf26.png',
    shape: 'square',
    ink: 'own',
    basis: 'own-site-declared',
    source: 'https://www.victorinox.com/en-GB/Products/Fragrances/c/FRA_AllProducts/',
    readAt: '2026-10-12',
  },
  'ramon monegal': {
    src: 'https://monegalperfumes.com/wp-content/uploads/2026/04/logo-monegal-perfumes.svg',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://ramonmonegal.com/',
    readAt: '2026-10-23',
  },
  gisada: {
    src: 'https://www.gisada.com/cdn/shop/files/Gisada_Logo_Black_v2.0_1.png?v=1745104282&width=300',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://www.gisada.com/en-us',
    readAt: '2026-10-23',
  },
  // Filed under "rance": the key drops the digits of "Rance 1795".
  rance: {
    src: 'https://rance1795.com/cdn/shop/files/rance_logo.svg?v=1718109808',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://rance1795.com/',
    readAt: '2026-10-23',
  },
  'oud elixir': {
    src: 'https://oudelixir.com/cdn/shop/files/OUD-ELIXIR-LOGO---black.png?v=1742955537&width=500',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://oudelixir.com/',
    readAt: '2026-10-23',
  },
  sospiro: {
    src: 'https://sospirointernational.com/cdn/shop/files/Artboard_1_1_f842c701-d21a-42a1-a061-a08fca7f224f.svg?v=1770791811',
    shape: 'wordmark',
    ink: 'dark',
    basis: 'own-site-declared',
    source: 'https://sospirointernational.com/',
    readAt: '2026-10-23',
  },
};

/**
 * Spellings of a brand that are one house with a logo filed under another
 * spelling. "Bulgari" is merged into "Bvlgari" in the catalogue (6 Oct 2026),
 * but an old link or a stray feed spelling still finds the same logo.
 */
const LOGO_SPELLINGS: Readonly<Record<string, string>> = { bulgari: 'bvlgari' };

/** Lowercase, strip everything but letters — matches demo/brandSites.ts's own normalizeBrand exactly. */
function normalizeBrand(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/**
 * The one fallback demo/brandSites.ts needs and this file does not yet: a
 * brand name with no a-z letters at all ("4711") normalizes to the empty
 * string under `normalizeBrand`. Not reproduced here because nothing in
 * `BRAND_LOGOS` is keyed under the empty string today — if that ever changes,
 * add the same `normalizeBrandKeepingDigits` fallback brandSites.ts carries,
 * not a new mechanism.
 */
export function logoFor(brand: string): LogoRef | null {
  const key = normalizeBrand(brand);
  const found = BRAND_LOGOS[LOGO_SPELLINGS[key] ?? key];
  if (found) return found;
  // An accent the catalogue keeps (Beyoncé, Comme des Garçons; brandName.ts prefers
  // the spelling that kept its accent) drops out of normalizeBrand as though it
  // were punctuation. Tried last, on the accent free spelling, so nothing that
  // resolved before resolves differently.
  const plain = brand.normalize('NFKD').replace(/\p{Mn}/gu, '');
  if (plain === brand) return null;
  const plainKey = normalizeBrand(plain);
  return BRAND_LOGOS[LOGO_SPELLINGS[plainKey] ?? plainKey] ?? null;
}
