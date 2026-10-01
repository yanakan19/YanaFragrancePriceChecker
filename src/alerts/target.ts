/**
 * Reading the optional per item target price a reader types on the account
 * page (wishlists.target_price_gbp, unused until price alerts).
 *
 * Blank clears it. A number is rounded to the penny. Anything else, or a
 * figure outside what a bottle of perfume could cost, is refused rather than
 * guessed at.
 */
import { roundPence } from '../services/money.js';

export const MAX_TARGET_GBP = 10_000;

export type TargetParse = { ok: true; value: number | null } | { ok: false };

export function parseTargetPrice(input: string): TargetParse {
  const s = input.trim().replace(/^£/, '').replace(/,/g, '');
  if (s === '') return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false };
  const n = roundPence(Number(s));
  if (!Number.isFinite(n) || n <= 0 || n > MAX_TARGET_GBP) return { ok: false };
  return { ok: true, value: n };
}
