import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DATA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'data',
  'prices.json',
);

let cache = null;

async function loadListings() {
  if (cache) return cache;
  const raw = await readFile(DATA_PATH, 'utf8');
  cache = JSON.parse(raw).listings;
  return cache;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Very small fuzzy match: score = fraction of query words found in the
// listing's name+brand. Real deployment: swap this whole module for a call
// into an actual pricesniffs.space data source; callers only need
// findFragrance(query) -> listing | null.
export async function findFragrance(query) {
  const listings = await loadListings();
  const qWords = normalize(query).split(' ').filter(Boolean);
  if (qWords.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const listing of listings) {
    const haystack = normalize(`${listing.brand} ${listing.name}`);
    const hits = qWords.filter((w) => haystack.includes(w)).length;
    const score = hits / qWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = listing;
    }
  }
  return bestScore >= 0.34 ? { ...best, matchConfidence: Math.round(bestScore * 100) } : null;
}

export async function allListings() {
  return loadListings();
}
