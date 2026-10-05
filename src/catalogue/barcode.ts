/**
 * What a shop's barcode field has to look like before it is stored as an `ean`.
 *
 * A Shopify shop types its barcodes into a free text field, and what is in it is
 * whatever the shop's staff put there: a real EAN or UPC, the shop's own SKU, a
 * placeholder ("0", "000000000000"), a supplier code with letters in it. A code
 * stored as an `ean` is used as a product's identity (`ean-<code>`) and is the one
 * thing the matcher lets refuse a merge, so a wrong one is worse than none. Only a
 * code that is a barcode on a bottle is kept; everything else is a listing with no
 * barcode, which is exactly what it was before it was read.
 *
 * Stricter than `isBarcode` in productMatch.ts on purpose. That function decides
 * whether a stored code may refuse a merge and has to forgive feeds that lost a
 * leading zero ("88300602513"), so it pads a short code to every length before
 * checking the digit, and a bare "0" passes it. This one decides what is allowed
 * in at all, from a field nobody checks, so it takes the lengths a barcode is
 * printed at and no others:
 *
 *   13 digits  an EAN-13, stored as it is.
 *   12 digits  a UPC-A, stored as the EAN-13 it is (GS1's own rule: "0" in front),
 *              which is how the matcher already reads a UPC against an EAN
 *              (`normalizedEan` strips the zeros) and how most shops here print it.
 *   8 digits   an EAN-8, stored as it is.
 *   14 digits  a GTIN-14 only when its indicator digit is 0, which is an EAN-13 with
 *              a zero in front and is stored as the 13 digits. A non-zero indicator
 *              names a case of bottles, never the bottle (see `isBarcode`).
 *
 * and then the checks that need no judgement: only digits (spaces and hyphens
 * dropped), the GS1 check digit, and, for the placeholders and the shop's own
 * numbers that pass a check digit one time in ten, a short list of codes no
 * manufacturer issued:
 *
 *   - one digit repeated ("0000000000000", "1111111111116");
 *   - a run of digits counting up or down ("1234567890128", "9876543210987");
 *   - a code with fewer than six digits that are not leading zeros (a small
 *     number padded out to look like a barcode);
 *   - a prefix GS1 sets aside for use inside one company or one shop and never
 *     issues for a product on a shelf: 020 to 029 and 040 to 049 (a UPC-A that
 *     starts 2 or 4, restricted distribution), 050 to 059 (reserved), 200 to 299
 *     (restricted circulation), 0000 (restricted GTIN-8 space), 977 to 979 (serial
 *     and book numbers), 980 to 999 (refund receipts and coupons).
 *
 * Nothing here repairs a code: a code with a missing digit, a typo or a stray
 * letter is not guessed at.
 */

/** GS1's own self-test over a whole code: the last digit is fixed by the others. */
export function hasCheckDigit(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  digits.reverse();
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += digits[i]! * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === check;
}

/** A run of digits that counts up or down by one, however long the code. */
function isCountingRun(code: string): boolean {
  let up = 0;
  let down = 0;
  for (let i = 1; i < code.length; i++) {
    const step = (Number(code[i]) - Number(code[i - 1]) + 10) % 10;
    if (step === 1) up++;
    if (step === 9) down++;
  }
  // Allow for the check digit at the end breaking the run.
  return up >= code.length - 2 || down >= code.length - 2;
}

/** Prefixes (of the EAN-13 form) that are never a product on a shelf. See the header. */
const NEVER_A_SHELF_PRODUCT = /^(0000|02\d|04\d|05\d|2\d\d|97[7-9]|98\d|99\d)/;

/** Why a code was refused, for a report and for the tests. */
export type BarcodeRefusal =
  | 'empty'
  | 'not-digits'
  | 'length'
  | 'check-digit'
  | 'case-level-gtin'
  | 'placeholder'
  | 'not-issued';

export interface BarcodeReading {
  /** The code to store, or null when it is not a barcode. */
  ean: string | null;
  /** Why it was refused; null when it is kept or when the field was empty. */
  refusal: BarcodeRefusal | null;
}

/**
 * Read one barcode field. Pure.
 *
 * `raw` is whatever the shop's file held: a string, a number (a shop that sent
 * the barcode as a JSON number has already lost its leading zeros, so such a
 * value is read as the text it prints as, and fails the length test if it
 * lost one), or nothing.
 */
export function readBarcode(raw: unknown): BarcodeReading {
  if (raw === null || raw === undefined) return { ean: null, refusal: 'empty' };
  const text = (typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'string' ? raw : '')
    .replace(/[\s-]+/g, '');
  if (text === '') return { ean: null, refusal: 'empty' };
  if (!/^\d+$/.test(text)) return { ean: null, refusal: 'not-digits' };

  let code = text;
  if (code.length === 14) {
    if (code[0] !== '0') return { ean: null, refusal: hasCheckDigit(code) ? 'case-level-gtin' : 'check-digit' };
    code = code.slice(1);
  } else if (code.length === 12) {
    // A UPC-A is an EAN-13 with a zero in front; the check digit is the same.
    if (!hasCheckDigit(code)) return { ean: null, refusal: 'check-digit' };
    code = `0${code}`;
  } else if (code.length !== 13 && code.length !== 8) {
    return { ean: null, refusal: 'length' };
  }
  if (!hasCheckDigit(code)) return { ean: null, refusal: 'check-digit' };

  if (/^(\d)\1+$/.test(code)) return { ean: null, refusal: 'placeholder' };
  if (isCountingRun(code)) return { ean: null, refusal: 'placeholder' };
  if (code.replace(/^0+/, '').length < 6) return { ean: null, refusal: 'placeholder' };
  // The prefix test is the EAN-13 form's; an EAN-8 has its own numbering.
  if (code.length === 13 && NEVER_A_SHELF_PRODUCT.test(code)) return { ean: null, refusal: 'not-issued' };

  return { ean: code, refusal: null };
}

/** The barcode to store for a field, or null. */
export function cleanBarcode(raw: unknown): string | null {
  return readBarcode(raw).ean;
}
