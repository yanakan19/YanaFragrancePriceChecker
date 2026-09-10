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
 * budget — Dolce & Gabbana keeps the monogram too.
 *
 * That is 51 of the top 100 with a real mark and 49 keeping the monogram —
 * itself a legitimate outcome, not a gap to be filled by guessing.
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
};

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
  return BRAND_LOGOS[normalizeBrand(brand)] ?? null;
}
