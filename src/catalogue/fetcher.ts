import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Retailer } from '../types/retailer.js';
import type { FetchResult, PageFetcher } from './crawl.js';

/** Identifies the crawler honestly, with a contact route. */
export const USER_AGENT =
  'ScentDayBot/0.1 (UK fragrance price comparison; +https://scentday.example/bot)';

/**
 * Live HTTP fetcher.
 *
 * Two things it will not do. It does not retry aggressively, because a shop
 * that is struggling should be left alone rather than hammered. It does not
 * follow cross host redirects, because a redirect off the retailer's domain
 * means something has gone wrong with the URL rather than the product moving.
 */
export function liveFetcher(timeoutMs = 20_000): PageFetcher {
  return async (url: string): Promise<FetchResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: controller.signal,
      });
      const html = await res.text();
      return { ok: res.ok, html, status: res.status };
    } catch (err) {
      return { ok: false, html: '', status: 0, error: String(err) };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Reads saved pages from disk instead of the network.
 *
 * This is how the crawl is proved correct without touching a live shop, and
 * how it runs in an environment whose network policy blocks retail domains. A
 * missing file means that page does not exist, which is exactly how pagination
 * ends, so it returns an empty document rather than an error.
 */
export function fixtureFetcher(root: string): PageFetcher {
  return async (url: string, retailer: Retailer): Promise<FetchResult> => {
    const file = join(root, retailer.id, `${fixtureName(url)}.html`);
    if (!existsSync(file)) return { ok: true, html: '', status: 404 };
    return { ok: true, html: readFileSync(file, 'utf8'), status: 200 };
  };
}

/** A stable, filesystem safe name for a page URL. */
export function fixtureName(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}
