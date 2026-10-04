/**
 * Perfumes whose shop titles name no strength, and whose own brand does.
 *
 * Why these were hidden. A broad beauty shop's listing is only taken for a
 * fragrance when its title carries a strength word (isFragrance in
 * fragranceId.ts), because that word is what keeps skincare out. Cult Beauty
 * titles a third of its perfumes with no strength ("Creed Wild Vetiver 50ml",
 * "Discotheque Lola at Coat Check 50ml"), and its own pages state none either
 * (thgPageStrength.ts, commit 710db0a1): 185 pages stayed hidden. Mybeauty
 * Boutique, John Lewis and others do the same for a handful of bottles.
 *
 * What counts as the evidence. The same bar CONCENTRATION_RESOLUTIONS holds
 * (route A, productName.ts): the brand's own page, read on the brand's own
 * domain, naming this bottle and its strength. Each entry below records the
 * page, what it says and the day it was read, as PriceSniffsBot, robots.txt
 * read first, a few seconds between pages. Nothing is inferred from the house,
 * the name or the price. Where a brand says nothing, or says it does not use
 * the words, it has no entry:
 *
 *   Commodity       its own FAQ answers "Are these EDPs, EDTs, or Parfums?" with
 *                   "We've moved away from these terms because they simply don't
 *                   apply" (commodityfragrances.com/pages/faq, read 2026-10-04).
 *                   The house states 15 to 25 percent and no strength word, so a
 *                   strength is never put on a Commodity bottle.
 *   Kismet Olfactive, Fascent, The Nue Co.   product pages say no strength.
 *   Kilian, Frederic Malle, Acqua di Parma (other lines)   the brand's site
 *                   answers PriceSniffsBot with a 403 or a wall, which is not
 *                   worked around, and a search result's own title says none.
 *   BORNTOSTANDOUT Eau Intimite   the line's own category is "Eau Intimite", not
 *                   a strength this catalogue has a value for.
 *
 * What an entry does. A listing whose whole title (brand and name, size and
 * punctuation set aside) is the entry's name is a fragrance of that strength:
 * it passes isFragrance, and concentrationOfStoredListing reports the strength.
 * Every shop's listing of the bottle gets it, which is what lets a title with
 * no strength meet the same bottle at the shops that state one. A title with
 * anything more in it ("Refillable Atomiser", "Duo", "Paintbrush", "The
 * Extrait") is another product and does not match.
 */

export interface StrengthEvidence {
  /** The brand names a listing's title may carry, as the shops write them. */
  brands: readonly string[];
  /** The fragrance's name as the shops write it. */
  names: readonly string[];
  /** The sizes the brand's page sells it in, when the strength is not the same at every size. */
  sizesMl?: readonly number[];
  /** The strength the brand states, in the display form concentration() returns. */
  concentration: string;
  /** The brand's own page. */
  source: string;
  /** What the page says. */
  quote: string;
  /** The day the page was read. */
  readAt: string;
  /** Words a shop adds to the title that are not part of the name ("A Fragrance"). */
  ignore?: readonly string[];
}

const DAY = '2026-10-04';
const EDP = 'Eau de Parfum';
const EDT = 'Eau de Toilette';

const creed = (name: string, handle: string): StrengthEvidence => ({
  brands: ['Creed'],
  names: [name],
  concentration: EDP,
  source: `https://www.creedfragrances.co.uk/products/${handle}`,
  quote: `product heading "${name} Eau de Parfum"`,
  readAt: DAY,
});

const discotheque = (name: string, handle: string): StrengthEvidence => ({
  brands: ['Discotheque', 'Discotheque Fragrances'],
  names: [name],
  concentration: EDP,
  source: `https://discothequefragrances.com/products/${handle}`,
  quote: `page title "${name.toUpperCase()} — Eau de Parfum — Discothèque Fragrances"`,
  readAt: DAY,
});

const durga = (name: string, handle: string): StrengthEvidence => ({
  brands: ['D.S. & Durga', 'DS & Durga'],
  names: [name],
  concentration: EDP,
  source: `https://www.dsanddurga.com/products/${handle}`,
  quote: 'product type "Eau de Parfum" in the shop\'s products.json, and "is an eau de parfum in 50 mL" in its description',
  readAt: DAY,
});

const tilbury = (name: string, slug: string): StrengthEvidence => ({
  brands: ['Charlotte Tilbury'],
  names: [`Collection of Emotions ${name}`],
  sizesMl: [10, 100],
  concentration: EDP,
  source: `https://www.charlottetilbury.com/uk/product/${slug}-100ml`,
  quote: `page title "${name} 100ml: ... Perfume Edp | Charlotte Tilbury", the 10ml page the same`,
  readAt: DAY,
});

const bornToStandOut = (name: string, handle: string): StrengthEvidence => ({
  brands: ['BORNTOSTANDOUT'],
  names: [name],
  concentration: EDP,
  source: `https://borntostandout.com/products/${handle}`,
  quote: 'the product is filed under "EAU DE PARFUM" (its tags read "Eau De Parfum"); the category says "30-40% fragrance concentration"',
  readAt: DAY,
});

const joLoves = (name: string, handle: string): StrengthEvidence => ({
  brands: ['Jo Loves'],
  names: [name],
  concentration: EDT,
  ignore: ['a fragrance'],
  source: `https://www.joloves.com/products/${handle}`,
  quote:
    'the shop sells it as "' + name + ' EDT" (its own title and address, data/houses/jo-loves.json) and its page says "Our Fragrances are Eau de Toilette and are designed to last three to six hours" (pomelo-edt-50ml; that host answered robots.txt with a 429, so no other page of it was fetched)',
  readAt: DAY,
});

const sisley = (name: string): StrengthEvidence => ({
  brands: ['Sisley Paris', 'Sisley'],
  names: [`L'Eau Revee ${name}`],
  concentration: EDT,
  source: 'https://www.sisley-paris.com/en-US/l-eau-revee-d-eliya-50ml-193415.html',
  quote: '"This collection is made up of six universal eau de toilettes" (the six are d\'Eliya, d\'Alma, d\'Hubert, d\'Ikar, d\'Aria and d\'Isa)',
  readAt: DAY,
});

export const STRENGTH_EVIDENCE: readonly StrengthEvidence[] = [
  creed('Wild Vetiver', 'wild-vetiver'),
  creed('Queen of Silk', 'queen-of-silk'),
  creed('Delphinus', 'delphinus'),
  creed('Centaurus', 'centaurus'),
  creed('Eladaria', 'eladaria'),
  creed('Erolfa', 'erolfa'),
  creed('Fleurissimo', 'fleurissimo'),
  creed('Royal Water', 'royal-water'),
  {
    brands: ['Creed'],
    names: ['Absolu Aventus'],
    concentration: EDP,
    source: 'https://creedboutique.com/products/absolu-aventus',
    quote: 'page title "Absolu Aventus Eau de Parfum" (creedfragrances.co.uk answered its page with a 429)',
    readAt: DAY,
  },

  discotheque('Heathens, Cowboys and the Santa Ana Winds', 'heathens-cowboys-and-the-santa-ana-winds'),
  discotheque('Next to Me or Nothing', 'next-to-me-or-nothing'),
  discotheque('Lola at Coat Check', 'lola-at-coat-check'),
  discotheque('Baise Moi on the Dancefloor', 'baise-moi-on-the-dancefloor'),
  discotheque('Dark Imagination', 'dark-imagination'),
  discotheque('Sweat, Tears, Paradise', 'sweat-tears-paradise'),
  discotheque('Call for a Good Time', 'call-for-a-good-time'),
  discotheque('Eye Contact', 'eye-contact'),
  discotheque('All Night, Until First Light', 'all-night-until-first-light'),

  durga('Debaser In Bloom', 'debaser-in-bloom'),
  durga('Cowgirl Grass', 'cowgirl-grass'),
  durga('Black Magenta', 'black-magenta'),
  durga("Ain't That Sweet", 'aint-that-sweet'),

  tilbury('Joyphoria', 'joyphoria'),
  tilbury('More Sex', 'more-sex'),
  tilbury('Magic Energy', 'magic-energy'),
  tilbury('Calm Bliss', 'calm-bliss'),
  tilbury('Love Frequency', 'love-frequency'),
  tilbury('Cosmic Power', 'cosmic-power'),

  bornToStandOut('Dirty Rice', 'dirty-rice'),
  bornToStandOut('Dirty Heaven', 'dirty-heaven-test'),
  bornToStandOut('Drunk Lovers', 'drunk-lovers'),
  bornToStandOut('Drunk Maple', 'drunk-maple'),
  bornToStandOut('Indecent Cherry', 'indecent-cherry'),
  bornToStandOut('Nanatopia', 'nanatopia'),

  {
    brands: ['Le Labo'],
    names: ['Eucalyptus 20'],
    sizesMl: [15, 50, 100],
    concentration: EDP,
    source: 'https://www.lelabofragrances.com/classic-collection/eucalyptus-20/eau-de-parfum.html',
    quote: 'product heading "EUCALYPTUS 20 Eau de Parfum", format "EAU DE PARFUM", 15ml, 50ml and 100ml',
    readAt: DAY,
  },
  {
    brands: ['Summer Fridays'],
    names: ['Sunlit Vanilla'],
    sizesMl: [50],
    concentration: EDP,
    source: 'https://summerfridays.com/products/sunlit-vanilla-eau-de-parfum',
    quote: 'page title "Sunlit Vanilla Eau de Parfum"',
    readAt: DAY,
  },
  {
    brands: ['Byredo'],
    names: ['Alto Astral'],
    sizesMl: [50, 100],
    concentration: EDP,
    source: 'https://www.byredo.com/us_en/p/alto-astral-eau-de-parfum',
    quote: 'page title "Alto Astral Eau de Parfum 50ml"',
    readAt: DAY,
  },
  {
    brands: ['Acqua di Parma'],
    names: ['Colonia Il Profumo'],
    concentration: EDP,
    source: 'https://www.acquadiparma.com/en/us/colonia-il-profumo/COLONIAEDPSPRAY.html',
    quote: 'page title "Colonia il Profumo EAU DE PARFUM"',
    readAt: DAY,
  },
  {
    brands: ['Acqua di Parma'],
    names: ['Limited Edition Colonia Il Profumo Millesimato'],
    concentration: EDP,
    source: 'https://www.acquadiparma.com/en/us/colonia-il-profumo-millesimato/COLONIAMILLESIMATOSPRAY.html',
    quote: 'page title "COLONIA IL PROFUMO MILLESIMATO EAU DE PARFUM"',
    readAt: DAY,
  },

  joLoves('Pomelo', 'pomelo-edt-50ml'),
  joLoves('Golden Gardenia', 'golden-gardenia-a-fragrance-100ml-1'),
  joLoves('Green Orange & Coriander', 'green-orange-coriander-edt-50ml'),
  joLoves('Jo by Jo Loves', 'jo-by-jo-loves-edt-50ml'),
  joLoves('Cobalt Patchouli & Cedar', 'cobalt-patchouli-cedar-edt-50ml'),
  joLoves('Amber Lime & Bergamot', 'amber-lime-bergamot-edt-50ml'),
  joLoves('Mango Thai Lime', 'mango-thai-lime-edt-50ml'),

  sisley("d'Eliya"),
  sisley("d'Alma"),
  sisley("d'Hubert"),
  sisley("d'Ikar"),
  sisley("d'Aria"),
  sisley("d'Isa"),
];

/** Letters and digits only, accents and case gone, "&" read as "and". */
function squash(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

/** A size written into a title: "50ml", "50 ml", "(50ml)", "8 mL/.27 fl oz." */
const SIZE_TOKEN = /\(?\s*\d{1,4}(?:[.,]\d+)?\s*ml\b\)?/gi;

interface Compiled {
  entry: StrengthEvidence;
  /** Every whole title (squashed) this entry accepts. */
  titles: Set<string>;
  /** The name alone, accepted only where the shop's own brand field is the brand. */
  nameOnly: Set<string>;
}

const COMPILED: readonly Compiled[] = STRENGTH_EVIDENCE.map((entry) => {
  const titles = new Set<string>();
  const nameOnly = new Set<string>();
  for (const name of entry.names) {
    nameOnly.add(squash(name));
    for (const brand of entry.brands) titles.add(squash(`${brand} ${name}`));
  }
  return { entry, titles, nameOnly };
});

const BRAND_SQUASHED = new Set(STRENGTH_EVIDENCE.flatMap((e) => e.brands.map(squash)));

/**
 * The brand-stated strength of a listing whose title names none, or null. A
 * listing that already names a strength is never asked: the caller only reaches
 * here when it has none.
 */
export function evidencedStrength(l: { rawTitle: string; rawBrand?: string | null }): StrengthEvidence | null {
  const sizes = [...l.rawTitle.matchAll(SIZE_TOKEN)].map((m) => Number(m[0].replace(/[^0-9.,]/g, '').replace(',', '.')));
  const bare = l.rawTitle.replace(SIZE_TOKEN, ' ');
  const whole = squash(bare);
  const brandField = l.rawBrand ? squash(l.rawBrand) : '';
  for (const c of COMPILED) {
    let title = whole;
    for (const phrase of c.entry.ignore ?? []) title = title.split(squash(phrase)).join('');
    const exact = c.titles.has(title);
    const viaBrandField = !exact && brandField !== '' && c.entry.brands.some((b) => squash(b) === brandField) && c.nameOnly.has(title);
    if (!exact && !viaBrandField) continue;
    if (c.entry.sizesMl && !sizes.some((s) => c.entry.sizesMl!.includes(s))) continue;
    return c.entry;
  }
  return null;
}

/** The brands that have an entry, for the finder script. */
export const EVIDENCED_BRANDS: ReadonlySet<string> = BRAND_SQUASHED;
