import { describe, expect, it, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { decodeBody, createHttp } from '../src/catalogue/httpFetch.js';

describe('decodeBody', () => {
  it('passes plain text through untouched', () => {
    expect(decodeBody(new TextEncoder().encode('<urlset/>'))).toBe('<urlset/>');
  });

  it('unwraps a gzip payload', () => {
    const xml = '<urlset><loc>https://x.example/p/1</loc></urlset>';
    expect(decodeBody(gzipSync(Buffer.from(xml)))).toBe(xml);
  });

  it('detects gzip by magic bytes, not by any URL or content type', () => {
    // The bytes answer the question themselves, so a shop serving compressed
    // data from a URL with no .gz suffix is still handled.
    const payload = gzipSync(Buffer.from('compressed'));
    expect(payload[0]).toBe(0x1f);
    expect(payload[1]).toBe(0x8b);
    expect(decodeBody(payload)).toBe('compressed');
  });

  it('falls back to a raw decode on corrupt gzip rather than throwing', () => {
    // Gzip magic followed by rubbish: mid-crawl this must not take the run down.
    const corrupt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x99, 0x99, 0x99]);
    expect(() => decodeBody(corrupt)).not.toThrow();
  });
});

const servers: Server[] = [];
afterAll(() => servers.forEach((s) => s.close()));

/** Serve one body, the way a real host serves a .xml.gz file. */
async function serve(body: Buffer, contentType: string): Promise<string> {
  const srv = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': contentType, 'content-length': body.length });
    res.end(body);
  });
  servers.push(srv);
  await new Promise<void>((r) => srv.listen(0, r));
  const addr = srv.address();
  return `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/sitemap.xml.gz`;
}

describe('createHttp against a real server', () => {
  const xml = '<?xml version="1.0"?><urlset><loc>https://x.example/p/1</loc></urlset>';

  it('reads a gzipped sitemap as XML', async () => {
    // This is the bug that made Boots report "200, 0 urls, no error" forever:
    // res.text() on gzip bytes yields mojibake, in which <loc> matches nothing.
    const url = await serve(gzipSync(Buffer.from(xml)), 'application/gzip');
    const res = await createHttp()(url, {});

    expect(res.ok).toBe(true);
    expect(res.body).toContain('<loc>');
    expect(res.body).toBe(xml);
  });

  it('still reads an uncompressed sitemap', async () => {
    const url = await serve(Buffer.from(xml), 'application/xml');
    const res = await createHttp()(url, {});
    expect(res.body).toBe(xml);
  });

  it('reports a transport failure instead of throwing', async () => {
    // Nothing is listening on this port.
    const res = await createHttp({ timeoutMs: 1500 })('http://127.0.0.1:1/x.xml', {});
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.error).toBeTruthy();
  });
});
