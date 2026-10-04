-- Wishlist: the cheapest delivered price on the day a fragrance was saved.
-- Run FIFTH, after 0001 to 0004, in the Supabase dashboard's SQL Editor. Safe
-- to run twice: every statement is idempotent, the same rule as the files
-- before it. See docs/OWNER-STEPS.md ("5. Switch on change since saved").
--
-- What this adds:
--
--   wishlists.saved_price_gbp   what the cheapest delivered price was when the
--                               reader saved the fragrance, in pounds. Written
--                               by the site once, at the moment of saving, so
--                               the wishlist can say how far the price has moved
--                               since and offer a Biggest Drop sort.
--
-- Nullable on purpose, and left null for every row saved before this is run,
-- and for a fragrance with no delivered price on the day (sold out everywhere,
-- or no shop stating its delivery). Null is the honest "we did not record one":
-- the site shows no change for such a row and never works one out from today's
-- price. The existing row level security policies already cover the column,
-- because they police rows, not columns.
--
-- Until this is run the site carries on exactly as before: saving still works,
-- the column is simply not written, and the change and the Biggest Drop sort
-- do not appear (demo/wishlist.ts).

alter table public.wishlists add column if not exists saved_price_gbp numeric(10, 2);

alter table public.wishlists drop constraint if exists wishlists_saved_price_nonneg;
alter table public.wishlists
  add constraint wishlists_saved_price_nonneg
  check (saved_price_gbp is null or saved_price_gbp >= 0);
