// Canada's sitemap (public beta since 22 October 2026): only addresses that answer 200 (a file of their own).
// Reads the built site (npm run demo), so it is in the data set.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const built = existsSync(resolve(root, 'demo/sitemap-ca.xml'));

describe('sitemap-ca.xml', () => {
  it.skipIf(!built)('is named by the index and lists only addresses with a file of their own, all under /ca/', () => {
    expect(read('demo/sitemap.xml')).toContain('/sitemap-ca.xml');
    const urls = [...read('demo/sitemap-ca.xml').matchAll(/<loc>https:\/\/pricesniffs\.space([^<]*)<\/loc>/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u.startsWith('/ca/'), u).toBe(true);
      const file = u.endsWith('/') ? `demo${u}index.html` : `demo${u}.html`;
      expect(existsSync(resolve(root, file)), `${u} has a file of its own`).toBe(true);
    }
  });
});
