/**
 * Guess the Fragrance captions (docs/GUESS-THE-FRAGRANCE-PLAN.md 3.3). Pure, no
 * imports, so the caption tests load it without the catalogue.
 */

/** What a free X account allows, tags and address included: one caption that works everywhere. */
export const CAPTION_LIMIT = 280;

const gbp = (n: number) => `£${n.toFixed(2)}`;
/** Post copy never shows a hyphen or dash (social/DESIGN-SYSTEM.md 5.1). */
const undash = (s: string) => s.replace(/\s*[-\u2010-\u2015\u2212]\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** Every word of the puzzle's fixed copy: a hidden answer word may not be one of them (a brand "Guess" would give itself away). */
export const FIXED_COPY =
  "Guess the Fragrance Today's puzzle House Fragrance Top Heart Base Comment your guess PriceSniffs pricesniffs space Can you name this perfume The house and the name are hidden so the notes and the strength are your clues Drop your guess in the comments";

export const PUZZLE_CAPTION =
  'Guess the Fragrance! Can you name this perfume? The house and the name are hidden, so the notes and the strength are your clues. Drop your guess in the comments. pricesniffs.space #guessthefragrance #perfume #fragrance #pricesniffs';

export interface RevealFacts {
  brand: string;
  name: string;
  concentration: string;
  size: string;
  delivered: number;
  shop: string;
  /** "9 Oct 2026" */
  checkedDate: string;
  slug: string;
}

/**
 * The reveal caption (plan 3.3): the answer, today's price, the Deal posts'
 * wording and the product address. If it overruns it shortens in this order
 * and stops at the first that fits: "Did you get it?" goes, the address
 * becomes the bare pricesniffs.space, then it refuses (pass --name).
 */
export function revealCaption(r: RevealFacts, limit = CAPTION_LIMIT - 1): string {
  const answer = undash(`${r.brand} ${r.name} ${r.concentration} ${r.size}`);
  const body = (didYou: boolean, address: string) =>
    `${didYou ? 'Did you get it? ' : ''}The answer: ${answer}. Cheapest price today: ${gbp(r.delivered)} delivered from ${undash(r.shop)}, checked ${r.checkedDate}. Prices change, so check before you buy. Affiliate links. ${address} #guessthefragrance #perfume #pricesniffs`;
  const full = `pricesniffs.space/${r.slug}`;
  for (const [didYou, address] of [[true, full], [false, full], [false, 'pricesniffs.space']] as const) {
    const text = body(didYou, address);
    if (text.length <= limit) return text;
  }
  throw new Error(`The reveal caption is over ${limit} characters even in its shortest form; pass --name "<shorter name>"`);
}

