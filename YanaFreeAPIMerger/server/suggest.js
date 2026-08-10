import { allListings } from './priceLookup.js';

// Parses free text like "vanilla, oud, no florals" into wanted/unwanted note sets.
export function parseNoteRequest(text) {
  const lower = text.toLowerCase();
  const unwantedMatch = lower.match(/no\s+([a-z, ]+)/);
  const unwanted = new Set(
    unwantedMatch ? unwantedMatch[1].split(/[, ]+/).filter(Boolean) : [],
  );
  const wantedText = unwantedMatch ? lower.slice(0, unwantedMatch.index) : lower;
  const wanted = new Set(
    wantedText
      .split(/[,;]| and /)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !unwanted.has(s)),
  );
  return { wanted: [...wanted], unwanted: [...unwanted] };
}

export async function suggestByNotes(text, limit = 5) {
  const { wanted, unwanted } = parseNoteRequest(text);
  if (wanted.length === 0) return { wanted, unwanted, results: [] };

  const listings = await allListings();
  const scored = listings.map((listing) => {
    const noteSet = new Set(listing.notes.map((n) => n.toLowerCase()));
    const wantedHits = wanted.filter((w) => [...noteSet].some((n) => n.includes(w) || w.includes(n)));
    const unwantedHits = unwanted.filter((u) => [...noteSet].some((n) => n.includes(u) || u.includes(n)));
    const score = wantedHits.length / wanted.length - unwantedHits.length * 0.5;
    return { listing, score, wantedHits, unwantedHits };
  });

  const results = scored
    .filter((s) => s.score > 0 && s.unwantedHits.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { wanted, unwanted, results };
}
