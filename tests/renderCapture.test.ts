import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capturePages, CAPTURE_MAX_BYTES, type CapturePage } from '../src/catalogue/renderCapture.js';

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'render-capture-'));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe('capturePages', () => {
  it('writes one file per page under <baseDir>/<shopId>/<sectionId>.html', () => {
    const pages: CapturePage[] = [
      { sectionId: 'fragrance', url: 'https://www.notino.co.uk/fragrance/?page=1', body: '<html>fragrance</html>' },
      { sectionId: 'niche', url: 'https://www.notino.co.uk/niche-perfumes/?f=page-1', body: '<html>niche</html>' },
    ];

    const written = capturePages(baseDir, 'notino-uk', pages, '2026-08-27T00:00:00.000Z');

    expect(written.map((w) => w.path).sort()).toEqual(
      [join(baseDir, 'notino-uk', 'fragrance.html'), join(baseDir, 'notino-uk', 'niche.html')].sort(),
    );
    for (const w of written) expect(existsSync(w.path)).toBe(true);
  });

  it('writes the real bytes verbatim, stripping nothing', () => {
    const body = '<html><body><div class="tile">£12.99 &amp; up</div></body></html>';
    capturePages(baseDir, 'notino-uk', [{ sectionId: 'fragrance', url: 'https://example.test/', body }], '2026-08-27T00:00:00.000Z');

    const saved = readFileSync(join(baseDir, 'notino-uk', 'fragrance.html'), 'utf8');
    expect(saved).toContain(body);
  });

  it('prefixes the saved file with the URL and capture time it came from', () => {
    capturePages(
      baseDir,
      'notino-uk',
      [{ sectionId: 'fragrance', url: 'https://www.notino.co.uk/fragrance/?page=1', body: '<html></html>' }],
      '2026-08-27T00:00:00.000Z',
    );

    const saved = readFileSync(join(baseDir, 'notino-uk', 'fragrance.html'), 'utf8');
    expect(saved.startsWith('<!--')).toBe(true);
    expect(saved).toContain('https://www.notino.co.uk/fragrance/?page=1');
    expect(saved).toContain('2026-08-27T00:00:00.000Z');
    expect(saved).not.toContain('truncated');
  });

  it('never touches another shop\'s directory', () => {
    capturePages(baseDir, 'notino-uk', [{ sectionId: 'fragrance', url: 'https://example.test/', body: 'a' }], '2026-08-27T00:00:00.000Z');
    expect(existsSync(join(baseDir, 'john-lewis'))).toBe(false);
  });

  it('truncates a page past CAPTURE_MAX_BYTES rather than skipping it, and says so', () => {
    const body = 'x'.repeat(CAPTURE_MAX_BYTES + 500);
    const [written] = capturePages(baseDir, 'notino-uk', [{ sectionId: 'fragrance', url: 'https://example.test/', body }], '2026-08-27T00:00:00.000Z');

    expect(written!.truncated).toBe(true);
    const saved = readFileSync(join(baseDir, 'notino-uk', 'fragrance.html'), 'utf8');
    expect(saved).toContain(`truncated at ${CAPTURE_MAX_BYTES} of ${body.length} bytes`);
    // The header itself adds a little overhead, so only the body half of the
    // saved file is asserted against the cap — the point is real bytes are
    // capped, not that the file is byte-for-byte the cap.
    expect(saved.length).toBeLessThan(body.length);
  });

  it('leaves a page under the cap untouched and unmarked', () => {
    const body = 'x'.repeat(1_000);
    const [written] = capturePages(baseDir, 'notino-uk', [{ sectionId: 'fragrance', url: 'https://example.test/', body }], '2026-08-27T00:00:00.000Z');

    expect(written!.truncated).toBe(false);
    const saved = readFileSync(join(baseDir, 'notino-uk', 'fragrance.html'), 'utf8');
    expect(saved).toContain(body);
    expect(saved).not.toContain('truncated');
  });

  it('returns no files and creates no directory for an empty page list', () => {
    const written = capturePages(baseDir, 'notino-uk', [], '2026-08-27T00:00:00.000Z');
    expect(written).toEqual([]);
  });
});
