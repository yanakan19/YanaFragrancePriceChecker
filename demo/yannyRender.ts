/**
 * How one Virtual Yanny message becomes HTML in the chat panel.
 *
 * Kept apart from demo/virtualYanny.ts, which pulls in the whole answer
 * engine, so that this — the part that decides what may become markup —
 * can be imported and tested on its own.
 *
 * An answer is plain text. The engine writes a link into it as
 * `[label](/path)` (see demo/yanny/links.js), and only that shape, pointing
 * only at the site's own pages, becomes an anchor. Everything else is
 * escaped, so nothing in an answer — a model's output, a product name with
 * a "<" in it, a transcript restored from sessionStorage that something
 * else on the origin rewrote — can become markup.
 */

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** The site paths an answer may link to. Anything else written in link
 *  shape (a model inventing a URL, an edited transcript) stays text. */
const SAFE_PATH_RE = /^\/(?:(?:fragrance|brands|retailers|notes|legal)\/[A-Za-z0-9._~%-]+|deals|brands|retailers|notes|about)$/;
const LINK_RE = /\[([^[\]]+)\]\((\/[^\s()]*)\)/g;

/**
 * One message as HTML: escaped, with each `[label](/path)` to a site page
 * turned into a link.
 *
 * `base` is the path the app is served under (`basePath()` in router.ts),
 * so the href is a real address a reader can open in a new tab or copy.
 * `data-yanny-path` carries the route itself, which demo/app.ts uses to
 * navigate in place on an ordinary click instead of reloading the page.
 */
export function yannyMessageHtml(text: string, base = '/'): string {
  const prefix = base.replace(/\/$/, '');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const whole = m[0];
    const label = m[1] ?? '';
    const path = m[2] ?? '';
    const at = m.index ?? 0;
    out += escapeHtml(text.slice(last, at));
    out += SAFE_PATH_RE.test(path)
      ? `<a class="yanny-link" href="${escapeHtml(prefix + path)}" data-yanny-path="${escapeHtml(path)}">${escapeHtml(label)}</a>`
      : escapeHtml(whole);
    last = at + whole.length;
  }
  return out + escapeHtml(text.slice(last));
}

/** The same message as plain words, for a screen-reader announcement. */
export function yannyPlainText(text: string): string {
  return text.replace(LINK_RE, '$1');
}
