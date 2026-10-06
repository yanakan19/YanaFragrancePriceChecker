import type { StoredListing } from './types.js';

/**
 * Perfume oils: the one place that says what an oil is and reads its facts
 * (docs/GIFT-SETS-AND-OILS-PLAN.md, section 3.1; owner's answers of 2026-10-05).
 *
 * What counts as an oil is a listing that says so in words: "perfume oil",
 * "perfumed oil", "parfum oil", "roll on oil" and the Attar of the shop's own
 * Attar category. Never the bare word "oil": 643 harvested titles carry it and
 * they are body, face, lip, hair and cleansing oil. Never a shop category that
 * says body, hair, face, bath, candle or home. Silence is never read as a fact:
 * a format or "alcohol free" is set only where a shop wrote it.
 */

/** The two strengths a product can have and be an oil. `Attar` is a shop's own Attar category (Nicchia Luxury). */
export const OIL_STRENGTHS: readonly string[] = ['Perfume Oil', 'Attar'];

export function isOilStrength(concentration: string): boolean {
  return OIL_STRENGTHS.includes(concentration);
}

/**
 * A title that names a perfume oil, for a listing the strength words do not
 * already recognise: "Perfumed Oil 15ml Roll-On", "Concentrated Perfumed Oil
 * 18ml", "6ml Roll-On Oil", "Concentrated Oil Perfume 35ml". An oil word next
 * to a perfume word, or "roll on oil".
 */
const OIL_TITLE =
  /\b(?:perfum(?:e|ed)?|parfum)\s+oil\b|\boil\s+perfum(?:e|ed)?\b|\broll[- ]?on\s+oil\b/i;

/** Words that make a listing something else, whatever else it says: a body, hair or face oil, home fragrance, incense. */
const NEVER_AN_OIL =
  /\b(body|hair|face|facial|bath|shower|massage|beard|nail|cuticle|lip|scalp|candle|diffuser|burner|warmer|plug[- ]?in|wax|reed|incense|bukhoor|bakhoor|room|air|aromatherapy|essential|skin|cleansing|dry oil)\b/i;

/**
 * Oils the owner has ruled on by hand (2026-10-05, answer 2 to the plan's
 * question 2). Nicchia Luxury files Ortigia's and Tauer's perfume oils under
 * "Olio corpo profumato", scented body oil, which the catalogue turns away by
 * category. Their titles say Perfume Oil, and the owner counts the 10ml roll on
 * and Tauer's attar (5ml) as oils; the 100ml Ortigia ones and Casa Amalfi's
 * "Scented Oil Roll On" stay body oils and out. The rule is the shop, the two
 * houses, the words "Perfume Oil" and a size of 10ml or less: it can name
 * nothing else.
 */
const REVIEWED_OIL_SHOP = 'nicchia-luxury-uk';
const REVIEWED_OIL_BRAND = /^(?:ortigia|tauer)\b/i;
const REVIEWED_OIL_MAX_ML = 10;

export function isReviewedOil(l: Pick<StoredListing, 'retailerId' | 'rawBrand' | 'rawTitle'>, ml: number | null): boolean {
  return (
    l.retailerId === REVIEWED_OIL_SHOP &&
    REVIEWED_OIL_BRAND.test(l.rawBrand ?? '') &&
    /\bperfume oil\b/i.test(l.rawTitle) &&
    ml !== null &&
    ml <= REVIEWED_OIL_MAX_ML
  );
}

/**
 * Listings that name an oil in words but state no size a reader can use, kept
 * out on purpose and listed with the reason, so the next person finds them here
 * and not by wondering. A bare number with no unit, an ounce figure with no
 * unit, or no size at all is never turned into millilitres by a guess.
 */
export const OILS_LEFT_OUT: readonly { retailerId: string; title: string; reason: string }[] = [
  { retailerId: 'al-haramain', title: 'Al Haramain Red African Perfume Oil 12', reason: 'a bare 12 with no unit; its 3 and 6 variants state ml, these two do not' },
  { retailerId: 'al-haramain', title: 'Al Haramain Red African Perfume Oil 24', reason: 'a bare 24 with no unit; its 3 and 6 variants state ml, these two do not' },
  { retailerId: 'the-beauty-store-uk', title: 'Lattafa Yara Moi 0.67 Concentrated Perfume Oil For Women', reason: '0.67 with no unit (it may be ounces); a size is never guessed' },
  { retailerId: 'space-nk', title: 'Malin + Goetz Dark Rum Perfume Oil', reason: 'states no size' },
  { retailerId: 'space-nk', title: 'Malin + Goetz Strawberry Perfume Oil', reason: 'states no size' },
  { retailerId: 'debenhams', title: 'Eclipse Oud Deep Smoky Perfume Oil', reason: 'states no size, and its house sells home fragrance oils for burners' },
];

/**
 * Whether a listing the strength words do not recognise is a perfume oil: the
 * title names one (OIL_TITLE), nothing in the title or the shop's category
 * makes it something else, and the title states a size (`ml`, read by the
 * caller with the catalogue's own size rule). A reviewed oil (isReviewedOil)
 * is one whatever its category says.
 */
export function isPerfumeOilTitle(l: Pick<StoredListing, 'rawTitle' | 'productType'>, ml: number | null): boolean {
  if (ml === null) return false;
  if (!OIL_TITLE.test(l.rawTitle)) return false;
  if (NEVER_AN_OIL.test(l.rawTitle) || (l.productType && NEVER_AN_OIL.test(l.productType))) return false;
  return true;
}

/** What a shop says an oil comes in. */
export type OilFormat = 'roll-on' | 'dropper';

/** "Roll on" and "roll-on", and "roller" alone; never "rollerball" or "roller pearl", which are what a spray comes in. */
const ROLL_ON = /\broll[- ]?on\b|\broller\b(?![- ]?(?:ball|pearl))/i;
const DROPPER = /\bdropper\b/i;
const ALCOHOL_FREE = /\balcohol[- ]free\b|\bnon[- ]?alcoholic\b|\bwithout alcohol\b/i;

/** The facts one listing states about an oil, from its title first and then its description. Null where it says nothing. */
export function oilFactsOfListing(title: string, description: string | null | undefined): { format: OilFormat | null; alcoholFree: boolean } {
  const read = (re: RegExp): boolean => re.test(title) || (description ? re.test(description) : false);
  // A format in the title outranks one in the description; a title naming both is no statement.
  const titleRoll = ROLL_ON.test(title);
  const titleDrop = DROPPER.test(title);
  let format: OilFormat | null = null;
  if (titleRoll !== titleDrop) format = titleRoll ? 'roll-on' : 'dropper';
  else if (!titleRoll && !titleDrop && description) {
    const roll = ROLL_ON.test(description);
    const drop = DROPPER.test(description);
    if (roll !== drop) format = roll ? 'roll-on' : 'dropper';
  }
  return { format, alcoholFree: read(ALCOHOL_FREE) };
}

/** What an oil's catalogue entry carries, only where a shop stated it. `By` is the shop that did. */
export interface OilFacts {
  format?: OilFormat;
  formatBy?: string;
  alcoholFree?: true;
  alcoholFreeBy?: string;
  /** A spray bottle of the same brand and scent, for the page's link (src/catalogue/setLinks.ts). */
  sprayId?: string;
}

/**
 * An oil product's facts from every offer it has: the first shop (in the order
 * given) to state a format sets it, unless two shops state different ones, in
 * which case it is stated by neither; "alcohol free" is set when any shop says
 * it. Empty when no shop said anything, which is most of them.
 */
export function oilFactsOfOffers(offers: readonly { retailerId: string; rawTitle: string; description: string | null }[]): OilFacts {
  const facts: OilFacts = {};
  const formats = new Map<OilFormat, string>();
  for (const o of offers) {
    const f = oilFactsOfListing(o.rawTitle, o.description);
    if (f.format && !formats.has(f.format)) formats.set(f.format, o.retailerId);
    if (f.alcoholFree && !facts.alcoholFree) {
      facts.alcoholFree = true;
      facts.alcoholFreeBy = o.retailerId;
    }
  }
  if (formats.size === 1) {
    const [format, by] = [...formats][0]!;
    facts.format = format;
    facts.formatBy = by;
  }
  return facts;
}
