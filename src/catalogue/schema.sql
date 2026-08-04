-- PriceSniffs catalogue schema.
--
-- The JSON store in store.ts is a stand in for this while the project has no
-- database. The shapes match one to one, so moving over is a port of the store
-- rather than a redesign of anything above it.
--
-- Written for Postgres.

-- ── Canonical catalogue ─────────────────────────────────────────────────────
-- What a fragrance IS, independent of who sells it.

CREATE TABLE brands (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  -- Dior, Christian Dior, CD all resolve to one brand.
  aliases       TEXT[] NOT NULL DEFAULT '{}',
  official_site TEXT
);

CREATE TABLE fragrances (
  id             TEXT PRIMARY KEY,
  brand_id       TEXT NOT NULL REFERENCES brands(id),
  name           TEXT NOT NULL,
  -- Sauvage, Sauvage Elixir and Sauvage Parfum are different products with
  -- nearly identical strings. The flight is what separates them.
  flight         TEXT,
  concentration  TEXT NOT NULL,
  year_released  INT,
  gender         TEXT,
  tier           TEXT NOT NULL CHECK (tier IN ('designer','niche','mideast')),
  popularity     INT NOT NULL DEFAULT 0,
  UNIQUE (brand_id, name, flight, concentration)
);

CREATE TABLE variants (
  id            TEXT PRIMARY KEY,
  fragrance_id  TEXT NOT NULL REFERENCES fragrances(id),
  size_ml       NUMERIC(6,1) NOT NULL,
  ean           TEXT,
  -- A tester and a gift set are not comparable with a sealed bottle and must
  -- never sit in the same price table.
  condition     TEXT NOT NULL DEFAULT 'sealed'
                CHECK (condition IN ('sealed','tester','set','refill','travel')),
  UNIQUE (fragrance_id, size_ml, condition)
);
CREATE UNIQUE INDEX variants_ean_idx ON variants (ean) WHERE ean IS NOT NULL;

-- ── What each shop actually lists ───────────────────────────────────────────

CREATE TABLE retailers (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  domain   TEXT NOT NULL UNIQUE,
  enabled  BOOLEAN NOT NULL DEFAULT TRUE
);

-- One row per product per shop. This table is the catalogue, and it is what
-- the NEW badge reads.
CREATE TABLE listings (
  id           BIGSERIAL PRIMARY KEY,
  retailer_id  TEXT NOT NULL REFERENCES retailers(id),
  -- Unique only within a retailer, never globally.
  retailer_sku TEXT NOT NULL,
  url          TEXT NOT NULL,
  raw_title    TEXT NOT NULL,
  raw_brand    TEXT,
  ean          TEXT,
  image_url    TEXT,
  section_id   TEXT NOT NULL,

  -- Set once, never updated. A product that vanishes and returns is not new.
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','delisted')),
  delisted_at   TIMESTAMPTZ,
  relisted_at   TIMESTAMPTZ,

  -- FALSE for everything found in a retailer's first crawl. Without this the
  -- whole catalogue would show as new on day one.
  eligible_for_new_badge BOOLEAN NOT NULL DEFAULT TRUE,

  -- Null until the matcher resolves it, or while it sits in review.
  variant_id   TEXT REFERENCES variants(id),

  UNIQUE (retailer_id, retailer_sku)
);

-- The index the badge query rides on.
CREATE INDEX listings_new_idx
  ON listings (retailer_id, first_seen_at DESC)
  WHERE status = 'active' AND eligible_for_new_badge;

CREATE INDEX listings_unmatched_idx
  ON listings (retailer_id) WHERE variant_id IS NULL AND status = 'active';

-- ── Prices ──────────────────────────────────────────────────────────────────

CREATE TABLE offers (
  listing_id     BIGINT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  price          NUMERIC(10,2) NOT NULL,
  was_price      NUMERIC(10,2),
  currency       TEXT NOT NULL DEFAULT 'GBP',
  in_stock       BOOLEAN,
  promo_ends_at  TIMESTAMPTZ,
  fetched_at     TIMESTAMPTZ NOT NULL
);

-- Append only. Flash deal detection needs history, so this is written on every
-- successful fetch rather than only on change.
CREATE TABLE price_history (
  listing_id  BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price       NUMERIC(10,2) NOT NULL,
  in_stock    BOOLEAN,
  captured_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (listing_id, captured_at)
);

-- ── Operations ──────────────────────────────────────────────────────────────

CREATE TABLE catalogue_runs (
  run_id       TEXT PRIMARY KEY,
  retailer_id  TEXT NOT NULL REFERENCES retailers(id),
  started_at   TIMESTAMPTZ NOT NULL,
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL CHECK (status IN ('running','ok','partial','failed')),
  baseline     BOOLEAN NOT NULL DEFAULT FALSE,
  pages_fetched      INT NOT NULL DEFAULT 0,
  listings_seen      INT NOT NULL DEFAULT 0,
  new_listings       INT NOT NULL DEFAULT 0,
  delisted_listings  INT NOT NULL DEFAULT 0,
  relisted_listings  INT NOT NULL DEFAULT 0,
  errors       TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX catalogue_runs_recent_idx ON catalogue_runs (retailer_id, started_at DESC);

-- Titles the matcher could not resolve confidently. Nothing enters the
-- comparison from here without a human deciding.
CREATE TABLE match_queue (
  listing_id           BIGINT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  suggested_variant_id TEXT REFERENCES variants(id),
  confidence           NUMERIC(4,3) NOT NULL,
  resolved             BOOLEAN NOT NULL DEFAULT FALSE,
  queued_at            TIMESTAMPTZ NOT NULL
);

-- ── The badge query ─────────────────────────────────────────────────────────
--
-- SELECT l.*
--   FROM listings l
--  WHERE l.retailer_id = $1
--    AND l.status = 'active'
--    AND l.eligible_for_new_badge
--    AND l.first_seen_at >= now() - INTERVAL '7 days'
--  ORDER BY l.first_seen_at DESC;
