import type { StoredListing } from './types.js';
import { getRetailer } from '../config/retailers.js';

/**
 * What decides whether a listing is a fragrance, and the identity a
 * fragrance is grouped under across shops.
 *
 * Pulled out of scripts/build-demo-catalogue.ts rather than duplicated,
 * because scripts/build-price-history.ts needs the exact same two answers —
 * "is this a fragrance" and "what is its id" — against the same historical
 * listings. Two independently maintained copies of this logic would drift
 * the moment either one got a fix the other did not, and the failure mode
 * would be a price history line that silently stops matching the product it
 * is meant to belong to.
 */

/**
 * Concentrations, which are the strongest signal a listing is a scent.
 *
 * "parfumee" earns its own entry rather than riding on "parfum". Titles are
 * accent-folded before this runs (see `fold`), and before that folding the
 * accented "Eau Parfumée" matched `\bparfum\b` only by accident: "é" is not a
 * word character, so it acted as the word boundary "parfum" needs. Fold the
 * accent away and "Parfumee" no longer has that boundary, which would have
 * quietly dropped Elizabeth Arden Green Tea Eau Parfumée — a fix for one
 * accent bug creating another. It is a real concentration in its own right
 * (Elizabeth Arden, Roger & Gallet, Diptyque all use it), so naming it is
 * both the fix and the more honest description.
 *
 * "perfume" was a real gap here: a title reading "Chanel No 5 Perfume 100ml"
 * matched none of the French-derived terms and was silently rejected as not
 * a fragrance, despite being an obvious one — plain English listings (feeds
 * especially) favour "perfume" over "parfum". "attar" and "oud" cover the
 * concentrated-oil style Middle Eastern perfumery uses, relevant because the
 * registry already models a 'mideast' tier for three retailers.
 */
const CONCENTRATION =
  /\b(eau de parfum|eau de toilette|eau de cologne|eau fraiche|eau parfumee|parfumee|parfum|perfume|edp|edt|edc|aftershave|cologne|extrait|attar|oud)\b/i;

/**
 * Things that live near perfume in a sitemap but are not perfume.
 *
 * "hair" was added after "Balmain Hair Silk Perfume 200ml" and "Sachajuan
 * Protective Hair Perfume 50ml" both passed as fragrance: real products,
 * genuinely named with the word "Perfume", but a scented hair treatment
 * rather than something worn as one. No genuine fine fragrance is titled
 * "[house] Hair [anything]", so the word alone is safe to exclude — the
 * surrounding \b...\b only matches it as a whole word, so this stays
 * exactly as safe as the existing "reed" entry already is against "Creed"
 * (no word boundary between the C and the r, so it is never touched).
 * Checked against the live catalogue before being added: no collision.
 *
 * The scented-air and body-spray entries — "air freshener", "room spray",
 * "lamp fragrance", "home spray", "body spray", "body mist" — were added after
 * 26 of them were being sold to readers as perfume. They get in because the
 * concentration test is satisfied by a word that is part of the *product line's*
 * name rather than a strength: almost all of them are Lattafa's "Bade'e Al Oud"
 * or "Oud Mood" range, where "Oud" is the name, plus a parseable size. So
 * "Badee Al Oud Sublime Air Freshener 300ml" and "Lattafa Bade'e Al Oud Room
 * Spray 300ml" sat in the comparison beside the actual eau de parfum of the
 * same line, at £2.99 and £5.29 — which reads as the bargain of the site and is
 * not the same product at all.
 *
 * Every one is a phrase, never a bare word, and that is the whole point:
 *
 *   - bare "air" would take Nina Ricci L'Air du Temps and CK Eternity Air
 *     (checked: 40 kept listings contain "air", 34 of them real fragrances);
 *   - bare "room" would take Vilhelm Parfumerie's Room Service Eau de Parfum;
 *   - bare "body" would take Reebok Cool Your Body, Vilhelm Parfumerie Body
 *     Paint and TOVA Body Mind Spirit, all genuine eaux de parfum.
 *
 * "body spray" covers "all over body spray" without needing its own entry.
 * Checked across all 32,912 active priced listings: exactly two titles pair one
 * of these phrases with a real concentration — "Lattafa Najdia Eau De Parfum
 * 100ml & Body Spray 50ml" and "Arthes Rocky Man 100Ml EDT + Body Spray 200Ml
 * Set". Both are two products sold as one unit, and both were being published
 * as a lone 100ml bottle at the pair's price, which understates what the bottle
 * costs — the same misrepresentation as MULTI_PACK, pointing the other way. So
 * they are dropped deliberately, not tolerated as collateral.
 */
export const NOT_A_FRAGRANCE =
  /\b(fragrance[- ]free|unperfumed|unscented|nappy|tissue|soap bar|body cream|shampoo|conditioner|deodorant|shower gel|body wash|candle|diffuser|reed|gift ?set|set of|bundle|tester|sample|refill|travel spray|decant|hand wash|moisturis|lotion|balm|scrub|talc|hair|air ?freshener|room spray|lamp fragrance|home spray|body spray|body mist)\b/i;

/** Size in millilitres, needed before two listings can be compared at all. */
export function sizeMl(title: string): number | null {
  const ml = title.match(/(\d{1,4}(?:\.\d)?)\s*ml\b/i);
  if (ml) return Math.round(Number.parseFloat(ml[1]!));
  const oz = title.match(/(\d{1,2}(?:\.\d)?)\s*(?:fl\.?\s*)?oz\b/i);
  if (oz) return Math.round(Number.parseFloat(oz[1]!) * 29.5735);
  return null;
}

/**
 * A title selling several bottles at once rather than one.
 *
 * Only consulted for a `fragranceOnlyCatalogue` shop, and it has to be,
 * because `sizeMl` reads the first size it finds: "Molecule 01 ATOM.iser. Set
 * 3 x 8.5ml" is an £80 set of three, and taking it at face value would list
 * it as a single 8.5ml bottle at £80 — the most overpriced thing on the site,
 * and wrong. The concentration test happened to keep these out before; once
 * that is relaxed something has to.
 *
 * The `>= 2 sizes` half of this is why this is not applied site-wide. Emirates
 * Oud repeats the size in its own titles ("Odyssey Aqua Perfume 100ml EDP
 * Armaf 100ml" is one bottle, listed twice over), so as a global rule it would
 * drop genuine single bottles. Measured before scoping it: 118 currently-kept
 * listings across all shops would have gone, most of them real.
 */
const MULTI_ITEM = /\bset\b|\b\d+\s*x\b|\bx\s*\d+\b/i;

/**
 * A quantity multiplied by a size — "3x10ml", "4 x 7.5ml", "5X20ml".
 *
 * This is the half of the multi-pack question that is safe to ask everywhere,
 * and it is asked everywhere, because the damage it prevents is not confined to
 * fragrance-only shops. `sizeMl` reads the first size in a title, so "Parfums de
 * Marly Delina Exclusif Parfum 3x10 ml Travel Set + Case" at £205 publishes as a
 * 10ml bottle at £205 and "Franck Boclet Cocaine Extrait de Parfum 4x20 ml" at
 * £114 as a 20ml. Those land at £14-£20/ml: expensive rather than impossible,
 * so nothing downstream flags them, and a reader comparing 10ml bottles is
 * quietly shown the price of thirty millilitres. Measured across the live
 * catalogue: 44 kept listings match this, and all 44 were read by hand — every
 * one is a genuine multi-pack, discovery set or travel-refill trio.
 *
 * Why this and not the `>= 2 sizes` rule above, which would also catch them.
 * Re-measured today, that rule would drop 47 kept listings this one does not,
 * and they are mostly real single bottles: Emirates Oud simply repeats the size
 * in its own titles ("Odyssey Aqua Perfume 100ml EDP Armaf 100ml", "Marwa
 * Perfume 100ml EDP Arabiyat Prestige 100ml"), Escentual writes "I Want Choo
 * Eau de Parfum 100ml - Collector's Edition 100ml", Oud Arabian writes
 * "Bujairami Only Ever 100ml 100ml Eau De Parfum". One bottle each. The
 * difference is that a repeated size states the same fact twice, whereas a
 * quantity sitting directly against a size states a count — which is the thing
 * actually being asked.
 *
 * A bare `\bset\b` is not safe globally either, for the same class of reason:
 * "Tommy Bahama Set Sail Cologne St. Barts Eau de Cologne 100ml Spray" is one
 * 100ml bottle whose own name contains the word, and Fragrance Click's "Burberry
 * Her 100ml Eau de Parfum + 10ml Set" really is a 100ml bottle with a
 * miniature beside it — the headline size `sizeMl` reads is the right one, so
 * there is nothing to fix and dropping it would lose a real offer.
 *
 * The count must be 2 or more. "1 x 5ml" names a single bottle, and while every
 * such title in the catalogue today is already rejected for other reasons (all
 * 5 checked), a rule that says "several" should not quietly mean "one or more".
 */
const MULTI_PACK = /\b([2-9]|[1-9]\d)\s*[x×]\s*\d{1,4}(?:\.\d)?\s*ml\b/i;

function sellsOnlyFragrance(retailerId: string): boolean {
  return getRetailer(retailerId)?.fragranceOnlyCatalogue === true;
}

/**
 * Drop diacritics so an accented spelling matches the plain one.
 *
 * "eau fraiche" has been in CONCENTRATION from the start, but a shop writing
 * the word properly — "Eau Fraîche" — did not match it, and the listing was
 * rejected as not a fragrance. That silently dropped seven real bottles from
 * Nicchia Luxury UK, including Kilian Good Girl Gone Bad at £205 and Robert
 * Piguet Fracas: the exact opposite of what a fragrance comparison is for,
 * decided by a circumflex.
 *
 * Applied to the whole title before matching rather than by adding accented
 * alternatives to the pattern, because the next European shop will spell
 * "extrait de parfum" or "Crème" its own way too, and a list of accepted
 * spellings only ever covers the ones already seen. NFD splits a letter into
 * base + combining mark; the range stripped here is exactly the combining
 * diacritics block, so nothing but accents is removed.
 */
function fold(title: string): string {
  return repairMojibake(title).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Undo UTF-8 that was decoded as Latin-1 somewhere upstream.
 *
 * MyBeauty.Boutique's feed arrives this way: "Rosé" reaches us as "RosÃ©",
 * "Légère" as "LÃ©gÃ¨re". 156 of its listings carry it, and 114 of those were
 * already live on the site — a reader browsing today sees "212 VIP RosÃ©".
 *
 * It also broke classification in a way that only showed up once titles were
 * accent-folded. "ParfumÃ©e" happens to match `\bparfum\b`, because "Ã" is
 * not a word character and so supplies the boundary; repair or fold it and
 * that accidental boundary goes, taking a real Roger & Gallet bottle with it.
 * So the repair belongs here, ahead of folding, rather than only at display
 * time: the same text has to drive both the decision and the label.
 *
 * Deliberately conservative. The round trip only replaces the title when the
 * result is strictly better — no U+FFFD replacement characters, and the
 * tell-tale sequences actually present — so a title containing a legitimate
 * "Ã" is left exactly as it is.
 *
 * ── Why the reverse step is CP1252 and not Latin-1 ──────────────────────────
 * The upstream decoder was a Windows one, and Windows-1252 is not Latin-1 in
 * the range 0x80-0x9F: where Latin-1 has control characters, CP1252 has
 * typography. So the UTF-8 byte 0x89 — the second byte of "É" — came back as
 * "‰" (U+2030), not as a control character, and `Buffer.from(s, 'latin1')`
 * cannot put it back: it truncates U+2030 to 0x30, the digit "0". "Ã‰clat"
 * became "�0clat", the guard saw the U+FFFD and correctly refused, and
 * eleven real titles stayed broken on the site because the reversal was using
 * the wrong table rather than because they were unrepairable.
 *
 * Mapping those 27 characters back to the bytes they came from is not a
 * guess — it is the exact inverse of the decoding that broke them. It
 * recovers "Atelier Cologne Éclat De Tubéreuse", "Caron Rose Ébène", "Miller
 * Harris Étui Noir", "Giorgio Armani SÌ" and "Benetton TRIBÙ, and it changes
 * no title that does not carry a mojibake marker (measured across all 32,920
 * active listings: 0).
 *
 * ── What is still left broken, on purpose ───────────────────────────────────
 * The U+FFFD guard stays, and 27 titles still fail it. Three distinct reasons,
 * all measured, none of them fixable by trying harder:
 *
 *   1. **Mixed encoding.** One correct UTF-8 accent and one mojibake sequence
 *      in the same string — "Lancôme Ã”ff Now", "Hermès Terre d'Hermès Eau
 *      GivrÃ©e", "L'Oréal Professionnel SÃ©rie Expert". The correct half has
 *      no valid reverse: "ô" is byte 0xF4, a UTF-8 lead byte with nothing
 *      following it, so any round trip corrupts the half that is already
 *      right. Refusing is the only honest answer.
 *   2. **The identifying byte is gone.** "Coty PrÃªt Ã Porter", "Gloria
 *      Vanderbilt Minuit Ã New York": that "Ã" should be followed by 0xA0
 *      (the second byte of "à"), and something upstream normalised the
 *      non-breaking space to an ordinary one. 0xC3 0x20 is not valid UTF-8 and
 *      never was. Reading it as "à" would be inferring the character from the
 *      product name rather than from the encoding, which is the one thing this
 *      function must not start doing.
 *   3. **It was never mojibake.** "Liquides Imaginaires Âme de Fleur" is
 *      correct French — âme, soul — and only trips the `Â.` marker. The guard
 *      declining it is the guard working, not failing.
 */

/**
 * Windows-1252's 0x80-0x9F block, inverted: the character a byte was decoded
 * into, back to the byte. Every other code point below 0x100 is its own byte
 * in both encodings, so only these 27 need naming. 0x81, 0x8D, 0x8F, 0x90 and
 * 0x9D are unassigned in CP1252 and so cannot appear here.
 */
const CP1252_HIGH_BYTES: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

/**
 * The bytes a CP1252 decoder would have been handed to produce this string,
 * or null if some character could not have come from a single byte — in which
 * case the string was never a CP1252 misreading and there is nothing to undo.
 */
function cp1252Bytes(s: string): Buffer | null {
  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff) {
      bytes.push(cp);
      continue;
    }
    const byte = CP1252_HIGH_BYTES.get(cp);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

export function repairMojibake(title: string): string {
  if (!/Ã.|â€|Â./.test(title)) return title;
  try {
    const bytes = cp1252Bytes(title);
    if (bytes === null) return title;
    const repaired = bytes.toString('utf8');
    if (repaired.includes('�')) return title;
    return repaired;
  } catch {
    return title;
  }
}

export function isFragrance(l: StoredListing): boolean {
  const t = fold(l.rawTitle);
  if (NOT_A_FRAGRANCE.test(t)) return false;
  if (sizeMl(t) === null) return false;
  if (l.priceGbp === null || l.priceGbp <= 0) return false;
  // Asked of every shop, unlike the two rules inside the branch below — see
  // MULTI_PACK for why a quantity against a size is the one multi-pack signal
  // that survives contact with the whole catalogue.
  if (MULTI_PACK.test(t)) return false;

  // A shop whose whole catalogue is fragrance does not have to say so in every
  // title — see Retailer.fragranceOnlyCatalogue for why this is an explicit
  // per-shop statement rather than anything inferred. Everywhere else the
  // concentration word stays required, because it is what keeps a broad
  // beauty retailer's skincare out of a fragrance comparison.
  if (sellsOnlyFragrance(l.retailerId)) {
    return !MULTI_ITEM.test(t) && (t.match(/\d{1,4}(?:\.\d)?\s*ml\b/gi) ?? []).length < 2;
  }

  return CONCENTRATION.test(t);
}

/**
 * EAN groups the same bottle across shops. Without one a listing can only
 * stand alone, which is honest: we cannot claim two titles are the same
 * product until the matcher exists.
 */
export function fragranceId(l: StoredListing): string {
  return l.ean
    ? `ean-${l.ean}`
    : `${l.retailerId}-${l.retailerSku}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}
