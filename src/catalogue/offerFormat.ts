/**
 * Telling apart two offers of one shop that are the same size of the same
 * perfume and differ only in format.
 *
 * Kayali sells a 10ml Miniature (£28) and a 10ml Travel Spray (£22) of the same
 * eau de parfum on one page. Both sit in one product, because the catalogue's
 * definition of sameness is brand, size, strength and name, and neither word of
 * format is any of those. The reader met two Kayali rows, one at £28 and one at
 * £22, with nothing to say which was which.
 *
 * The label is the shop's own words, taken from the one place they are written:
 * the listing title, where a Shopify storefront appends the variant name
 * ("... Eau de Parfum 10ml Miniature"). It is whatever the two titles do not
 * share, shown in Title Case. Nothing here knows the word Kayali, or Miniature,
 * or Travel Spray: any shop whose two same size rows differ by a short phrase
 * gets that phrase.
 *
 * It is deliberately timid. A row is labelled only when every difference
 * between the titles is a short run of plain words, the two differences are not
 * the same words, and at least one of the words says something beyond
 * "Spray" or "Eau de Parfum". Anything else (a difference in digits, a long phrase, two rows that
 * read alike) gets no label at all, because a wrong label on a price is worse
 * than a missing one.
 */

export interface FormatRow {
  /** This shop's own title for the listing, as it wrote it. */
  rawTitle: string;
  /** Millilitres read from that title, or null when it states none. */
  sizeMl: number | null;
}

/** Words that name the product rather than its format, so alone they are no label. */
const GENERIC = new Set([
  'a', 'and', 'by', 'cologne', 'de', 'du', 'eau', 'edc', 'edp', 'edt', 'extrait', 'for', 'fragrance',
  'her', 'him', 'in', 'men', 'mens', 'of', 'parfum', 'perfume', 'pour', 'spray', 'the', 'toilette',
  'unisex', 'with', 'women', 'womens',
]);

const MAX_WORDS = 3;
const MAX_CHARS = 24;

/** Lower case, accents and punctuation gone: how two spellings are compared. */
function norm(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.]/gu, '');
}

function words(title: string): string[] {
  // A hyphen or dash between words is a space here: labels never carry one.
  return title
    .replace(/[‐-―-]/g, ' ')
    .split(/\s+/)
    .filter((w) => norm(w) !== '');
}

/** "TRAVEL spray" and "travel Spray" both read "Travel Spray"; "EDP" stays. */
function titleCase(ws: string[]): string {
  return ws
    .map((w) => (w === w.toUpperCase() && w.length <= 3 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/**
 * One label per row, in the order given: the shop's own format words, or null
 * where the row needs none. Pass every offer one shop has on one product. Rows
 * are only ever compared with rows of the same stated size.
 */
export function formatLabels(rows: readonly FormatRow[]): (string | null)[] {
  const out: (string | null)[] = rows.map(() => null);
  const bySize = new Map<number, number[]>();
  rows.forEach((r, i) => {
    if (r.sizeMl === null) return;
    const group = bySize.get(r.sizeMl);
    if (group) group.push(i);
    else bySize.set(r.sizeMl, [i]);
  });

  for (const idx of bySize.values()) {
    if (idx.length < 2) continue;
    const tokens = idx.map((i) => words(rows[i]!.rawTitle));
    // A word counts as shared only as many times as every title says it, so a
    // size repeated in a bracket ("(10ml, 30ml, 100ml) 10ml Splash") is not
    // mistaken for a shared one and a row differing in size is never a format.
    const common = new Map<string, number>();
    for (const w of new Set(tokens.flat().map(norm))) {
      common.set(w, Math.min(...tokens.map((t) => t.filter((x) => norm(x) === w).length)));
    }
    const residues = tokens.map((t) => {
      const budget = new Map(common);
      return t.filter((w) => {
        const left = budget.get(norm(w)) ?? 0;
        if (left > 0) {
          budget.set(norm(w), left - 1);
          return false;
        }
        return true;
      });
    });

    // Every difference has to be a short run of plain words, or the whole
    // group is left unlabelled: a title that differs in a number or a long
    // phrase is not one of the two things this is for.
    const plain = residues.every(
      (r) =>
        r.length <= MAX_WORDS &&
        r.join(' ').length <= MAX_CHARS &&
        r.every((w) => /^\p{L}+$/u.test(w.normalize('NFC').replace(/[.'’]/g, ''))),
    );
    if (!plain) continue;
    // At least one difference has to say something about the format. Spray
    // against Eau de Parfum is a difference in the name or the strength, which
    // the product match already decided, not in how the bottle is sold.
    const says = residues.some((r) => r.some((w) => !GENERIC.has(norm(w))));
    if (!says) continue;
    const named = residues.map((r) => (r.length ? titleCase(r) : null));
    const seen = named.filter((n): n is string => n !== null);
    // Two rows claiming the same label tell the reader nothing.
    if (new Set(seen.map((x) => x.toLowerCase())).size !== seen.length) continue;
    // A row with no words of its own beside a labelled row stays unlabelled.
    idx.forEach((rowIndex, k) => {
      out[rowIndex] = named[k]!;
    });
  }
  return out;
}
