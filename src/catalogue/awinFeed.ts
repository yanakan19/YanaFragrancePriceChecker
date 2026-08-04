import type { RawListing } from './types.js';
import { parsePrice } from './jsonld.js';

/**
 * Parser for Awin's standard "generic" datafeed format.
 *
 * This is the ingestion route for any retailer whose registry entry sets
 * `adapter: 'affiliate-feed'` — see the guard comments in
 * scripts/catalogue-harvest.ts, scripts/catalogue-probe.ts and
 * scripts/catalogue-run.ts, all of which skip those retailers deliberately.
 * Where a shop already hands over a feed, scraping it anyway is exactly the
 * mistake docs/INGESTION.md warns against.
 *
 * A publisher chooses which columns to include in their feed export, so the
 * header row — not column position — is the only reliable source of truth
 * for what each column means. Every lookup here is by column name. Awin also
 * lets a publisher export tab separated instead of comma separated, so the
 * delimiter is sniffed from the header line rather than assumed.
 *
 * Columns this reads, all optional except where noted:
 *
 *   aw_deep_link          the affiliate tracking URL (required — this is
 *                         the only URL a row carries)
 *   product_name          the listing title (required)
 *   search_price          the current selling price (required, must parse
 *                         to a positive number or the row is skipped)
 *   merchant_product_id   the retailer's own SKU, preferred identifier
 *   aw_product_id         Awin's own id, fallback identifier
 *   merchant_image_url    product image, preferred
 *   aw_image_url          product image, fallback
 *   ean                   EAN/GTIN, passed through digits-only
 *   in_stock              stock flag: yes/no, true/false, 1/0, in/out of stock
 *   stock_quantity        used as a stock signal only when in_stock is absent
 *   currency              rows not in GBP are skipped; priceGbp is GBP by
 *                         definition and this project models UK storefronts
 *                         pricing in sterling only (see Retailer['currency'])
 *   brand_name / brand    not part of Awin's documented core schema but
 *                         common in practice; read if present, else null
 *
 * Deliberately not mapped: merchant_category, category_name, category_id,
 * description, product_short_description, delivery_cost, merchant_name,
 * merchant_id. None of these have a home in `RawListing`, and classifying
 * what is and isn't a fragrance is scripts/build-demo-catalogue.ts's job,
 * uniformly across every retailer, not this parser's.
 *
 * `rrp_price` becomes `wasPriceGbp`, but only where it is genuinely above the
 * selling price. It is the merchant's stated recommended retail price, which
 * is real supplied data rather than anything inferred here, though it is not
 * the same claim as "this shop charged this last week" — the UI labels it RRP.
 * `promoEndsAt` stays null: no such column exists and a countdown must never
 * be invented.
 */

const REQUIRED_PRICE_POSITIVE = (n: number | null): n is number => n !== null && n > 0;

/** Parse one CSV/TSV row, honouring RFC4180-style quoting either way. */
function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Normalise line endings up front so the scanner only has to think about \n.
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // Flush a trailing field/row that had no final newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // A blank trailing line parses as a single empty field; drop rows that are
  // wholly empty rather than treating them as data.
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Comma unless the header line is clearly tab separated. */
function sniffDelimiter(text: string): string {
  const headerLine = text.split(/\r?\n/, 1)[0] ?? '';
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

function truthy(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase();
  if (v === '') return null;
  if (['yes', 'true', '1', 'in stock', 'instock'].includes(v)) return true;
  if (['no', 'false', '0', 'out of stock', 'outofstock'].includes(v)) return false;
  return null;
}

function digitsOnly(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits || null;
}

function trimmedOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const v = value.trim();
  return v || null;
}

/**
 * Parse an Awin generic datafeed export into `RawListing`s.
 *
 * Rows with no usable `search_price`, no `aw_deep_link`, no `product_name`,
 * or a non-GBP `currency` are skipped rather than guessed at. This function
 * never invents a listing; it only ever reports what the feed actually
 * contained. Which retailer this feed belongs to is the caller's concern
 * (scripts/catalogue-feed.ts passes it to `reconcile()`), not this parser's
 * — a feed export carries no reliable self-identifying column for it.
 */
export function parseAwinFeed(csvText: string): RawListing[] {
  const delimiter = sniffDelimiter(csvText);
  const rows = parseDelimitedText(csvText, delimiter);
  if (rows.length === 0) return [];

  const header = rows[0]!.map((h) => h.trim());
  const colIndex = new Map<string, number>();
  header.forEach((name, i) => {
    if (name) colIndex.set(name, i);
  });

  const col = (row: string[], name: string): string | undefined => {
    const i = colIndex.get(name);
    return i === undefined ? undefined : row[i];
  };

  const listings: RawListing[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;

    const url = trimmedOrNull(col(row, 'aw_deep_link'));
    const rawTitle = trimmedOrNull(col(row, 'product_name'));
    if (!url || !rawTitle) continue;

    const currency = trimmedOrNull(col(row, 'currency'));
    if (currency && currency.toUpperCase() !== 'GBP') continue;

    const priceGbp = parsePrice(col(row, 'search_price'));
    if (!REQUIRED_PRICE_POSITIVE(priceGbp)) continue;

    const retailerSku =
      trimmedOrNull(col(row, 'merchant_product_id')) ??
      trimmedOrNull(col(row, 'aw_product_id')) ??
      digitsOnly(col(row, 'ean'));
    if (!retailerSku) continue;

    const imageUrl =
      trimmedOrNull(col(row, 'merchant_image_url')) ?? trimmedOrNull(col(row, 'aw_image_url'));

    const inStockFromFlag = truthy(col(row, 'in_stock'));
    const stockQuantity = trimmedOrNull(col(row, 'stock_quantity'));
    const inStock =
      inStockFromFlag !== null
        ? inStockFromFlag
        : stockQuantity !== null
          ? Number.parseInt(stockQuantity, 10) > 0
          : null;

    const rawBrand = trimmedOrNull(col(row, 'brand_name')) ?? trimmedOrNull(col(row, 'brand'));

    // `rrp_price` is the merchant's own stated recommended retail price. It is
    // real, supplied data rather than anything computed here, so it is worth
    // carrying — but it means "recommended retail", not "what this shop
    // charged last week", and the UI labels it RRP for exactly that reason.
    // Only kept when it is genuinely above the selling price; a feed that
    // repeats search_price in rrp_price (many do) is not a reduction and must
    // never be rendered as one.
    const rrp = parsePrice(col(row, 'rrp_price'));
    const wasPriceGbp = rrp !== null && priceGbp !== null && rrp > priceGbp ? rrp : null;

    listings.push({
      retailerSku,
      url,
      rawTitle,
      rawBrand,
      ean: digitsOnly(col(row, 'ean')),
      imageUrl,
      priceGbp,
      wasPriceGbp,
      // No promo-end column exists in this schema, and a countdown must never
      // be invented: canShowCountdown() simply stays false for these.
      promoEndsAt: null,
      inStock,
      sectionId: 'awin-feed',
      description: trimmedOrNull(col(row, 'description')),
    });
  }

  return listings;
}
