/**
 * The plain summary at the top of a set's or an oil's own page: what the item
 * is, in one or two sentences, so a reader (and a search engine) meets words
 * before the lists of contents and prices.
 *
 * ── Only what the record already holds ───────────────────────────────────────
 * Every word here is read from a field the catalogue carries, never composed to
 * sound complete:
 *   - a set: `giftSet.mini` (a miniature or discovery set), `giftSet.bundle` (a
 *     bundle of full size bottles), `giftSet.items` (how many things the
 *     contents name), `giftSet.mainMl` (the main bottle's size) and
 *     `giftSet.box` (letters for what is in the box besides fragrances: b body,
 *     d deodorant, w wash), all read from the shop's own title or description
 *     (src/catalogue/giftSet.ts);
 *   - an oil: its strength (`Perfume Oil` or `Attar`) and `sizeMl`
 *     (src/catalogue/perfumeOil.ts).
 * A field that is not there is not mentioned: a set whose title says nothing
 * about its size gets no size. An oil's second sentence is the site's own rule,
 * stated on every oil page already (an oil is compared only with the same oil),
 * not a fact about the item.
 *
 * No hyphens or dashes, as everywhere reader facing. Pure: tests/itemSummary.test.ts
 * runs it under Node.
 */
import type { DemoFragrance } from './data.js';
import { isOil, isSet } from './productKind.js';

type SummaryFields = Pick<DemoFragrance, 'concentration' | 'sizeMl' | 'giftSet'>;

/** "a, b and c". */
function list(parts: readonly string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

const BOX_WORDS: Record<string, string> = { b: 'a body product', d: 'a deodorant', w: 'a wash' };

/**
 * One or two sentences on what the item is, or null for a bottle (which needs
 * none). A set's contents, and an oil's format and alcohol free facts with the
 * shop that stated each, are listed under it by the page (demo/app.ts,
 * giftSetBlock and oilBlock), so they are not said twice here.
 */
export function itemSummary(f: SummaryFields): string | null {
  if (isSet(f)) return setSummary(f);
  if (isOil(f)) return oilSummary(f);
  return null;
}

function setSummary(f: SummaryFields): string | null {
  const g = f.giftSet;
  if (!g) return null;
  const kind = g.mini ? 'a miniature or discovery set' : g.bundle ? 'a bundle of full size bottles' : 'a gift set';
  const items = g.items !== undefined && g.items > 0 ? `${g.items} ${g.items === 1 ? 'item' : 'items'}` : null;
  const main = g.mainMl !== undefined && g.mainMl > 0 ? `a ${g.mainMl}ml main bottle` : null;
  const detail = [items ? `of ${items}` : null, main ? `with ${main}` : null].filter((x): x is string => x !== null);
  const first = `This is ${kind}${detail.length ? ` ${detail.join(' ')}` : ''}.`;
  const extras = [...(g.box ?? '')].map((c) => BOX_WORDS[c]).filter((w): w is string => w !== undefined);
  const second = extras.length ? ` As the shops list it, the box also holds ${list(extras)}.` : '';
  return `${first}${second}`;
}

function oilSummary(f: SummaryFields): string {
  const kind = f.concentration === 'Attar' ? 'an attar' : 'a perfume oil';
  const size = f.sizeMl !== null && f.sizeMl > 0 ? ` of ${f.sizeMl}ml` : '';
  return `This is ${kind}${size}. It is compared only with the same oil at other shops, never with a spray.`;
}
