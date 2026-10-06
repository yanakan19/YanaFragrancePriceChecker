/**
 * Exit codes of scripts/catalogue-harvest.ts that a caller may tell apart.
 *
 * NOTHING_HARVESTED: the run finished cleanly and no shop it asked yielded a
 * priced listing, so it wrote nothing. For the scheduled crawl that is a
 * failure (every shop at once means something is broken). For the one shop
 * probe (harvest-one-shop.yml) it is the answer the probe exists to give
 * ("this shop refuses us, or its pages parse to nothing"): 44 of the probe's
 * 65 runs up to 2026-10-06 went red on exactly this, which buried the two
 * that crashed. Any other non-zero exit is a crash or a bad argument and
 * stays red everywhere.
 *
 * 3, because 1 is what Node and tsx exit with on an uncaught error and 2 is
 * what shells use for a misuse; npm run passes the code through unchanged.
 */
export const NOTHING_HARVESTED = 3;
