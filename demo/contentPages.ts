/**
 * The guides and the "How we check prices" page: how their words are held,
 * fetched and drawn.
 *
 * ── Lazy, and why ───────────────────────────────────────────────────────────
 * The words are in two lazy data files (LAZY_CONTENT_MODULES in
 * scripts/dataFiles.ts): `guides` (all five guides) and `method` (the price
 * checking page). The bundle holds this file, which can draw them, and
 * demo/guideList.ts, which names them; it holds none of their sentences. A
 * visit that never opens one of these pages never downloads one. The fetch
 * goes through the loader's `__psLazy(name)`, the way the price history and the
 * products with no current prices do (demo/priceHistoryStore.ts), and a failed
 * fetch is not remembered, so the next visit to the page asks again.
 *
 * ── What a page is made of ──────────────────────────────────────────────────
 * A list of plain blocks (a heading, a paragraph, a list, a short note), never
 * HTML. Text may carry internal links written [label](/path); everything else
 * is escaped, and a link must start with a single slash, so a page of words
 * can never carry a script or send a reader off the site.
 *
 * No DOM here: the views return strings, as the rest of the demo does, and
 * tests/contentPages.test.ts draws them under Node.
 */
import { GUIDES, GUIDES_INDEX, GUIDES_PATH, HOW_WE_CHECK, guidePath, type GuideInfo } from './guideList.js';
import { fetchLazyFile, lazyData, type LazyData, type LazyStatus } from './priceHistoryStore.js';

/** One block of a page. `x` is the text; a list's is its items. */
export type Block =
  | { t: 'h'; x: string }
  | { t: 'p'; x: string }
  | { t: 'ul'; x: string[] }
  | { t: 'note'; x: string };

/** Lazy data file names, keys of LAZY_CONTENT_MODULES in scripts/dataFiles.ts. */
export const GUIDES_FILE = 'guides';
export const METHOD_FILE = 'method';

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** [label](/path): an internal link only. */
export const LINK = /\[([^\]\n]+)\]\((\/[^)\s]*)\)/g;

/**
 * A line of text as HTML: escaped, with its [label](/path) links drawn as
 * anchors the router opens (data-nav). A path that starts with two slashes
 * names another site, not this one, and is left as the text it was written as.
 */
export function inlineHtml(text: string): string {
  return escapeHtml(text).replace(LINK, (whole, label: string, href: string) =>
    href.startsWith('//') ? whole : `<a href="${href}" data-nav>${label}</a>`,
  );
}

/** A line of text with its links reduced to their labels. */
export function inlineText(text: string): string {
  return text.replace(LINK, (_whole, label: string) => label);
}

/** The addresses a text links to, as written. */
export function linksIn(text: string): string[] {
  return [...text.matchAll(LINK)].map((m) => m[2]!);
}

export function blocksHtml(blocks: readonly Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'h': return `<h2 class="t-section">${escapeHtml(b.x)}</h2>`;
        case 'p': return `<p class="t-body">${inlineHtml(b.x)}</p>`;
        case 'ul': return `<ul class="t-body">${b.x.map((i) => `<li>${inlineHtml(i)}</li>`).join('')}</ul>`;
        case 'note': return `<p class="content-note t-body">${inlineHtml(b.x)}</p>`;
      }
    })
    .join('\n');
}

/** Every piece of text in a page, links reduced to labels: what a reader reads. */
export function blocksText(blocks: readonly Block[]): string {
  return blocks.map((b) => (b.t === 'ul' ? b.x.map(inlineText).join('\n') : inlineText(b.x))).join('\n');
}

function isBlock(value: unknown): value is Block {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as { t?: unknown; x?: unknown };
  if (b.t === 'ul') return Array.isArray(b.x) && b.x.length > 0 && b.x.every((i) => typeof i === 'string');
  return (b.t === 'h' || b.t === 'p' || b.t === 'note') && typeof b.x === 'string';
}

function isBlocks(value: unknown): value is Block[] {
  return Array.isArray(value) && value.length > 0 && value.every(isBlock);
}

/** Checks the guides file's shape: every guide has blocks. Throws on anything else, which the page shows as a failed load. */
export function prepareGuides(raw: unknown): Record<string, Block[]> {
  const bodies = (raw as { GUIDE_BODIES?: unknown } | null)?.GUIDE_BODIES;
  if (typeof bodies !== 'object' || bodies === null) throw new Error('guides file is not { GUIDE_BODIES }');
  const out: Record<string, Block[]> = {};
  for (const g of GUIDES) {
    const body = Object.prototype.hasOwnProperty.call(bodies, g.slug) ? (bodies as Record<string, unknown>)[g.slug] : undefined;
    if (!isBlocks(body)) throw new Error(`guides file has no words for ${g.slug}`);
    out[g.slug] = body;
  }
  return out;
}

/** Checks the method file's shape. Throws on anything else. */
export function prepareMethod(raw: unknown): Block[] {
  const body = (raw as { METHOD_BODY?: unknown } | null)?.METHOD_BODY;
  if (!isBlocks(body)) throw new Error('method file is not { METHOD_BODY }');
  return body;
}

type FetchFile = (name: string) => Promise<unknown>;

export function createGuideBodies(fetchFile: FetchFile = fetchLazyFile): LazyData<Record<string, Block[]>> {
  return lazyData(() => fetchFile(GUIDES_FILE).then(prepareGuides));
}

export function createMethodBody(fetchFile: FetchFile = fetchLazyFile): LazyData<Block[]> {
  return lazyData(() => fetchFile(METHOD_FILE).then(prepareMethod));
}

/** The app's one copy of each. */
export const guideBodies = createGuideBodies();
export const methodBody = createMethodBody();

/* ── the pages ───────────────────────────────────────────────────────────── */

/** What stands where the words will be: nothing while they are on the way, a plain apology if they cannot come. */
function waiting(status: LazyStatus): string {
  return status === 'failed'
    ? `<p class="panel-note t-body" role="alert">These words could not be loaded. Check your connection, then <a href="">reload the page</a>.</p>`
    : `<p class="panel-note t-body" role="status" aria-busy="true">Loading.</p>`;
}

const link = (path: string, label: string): string => `<a href="${path}" data-nav>${escapeHtml(label)}</a>`;

/** /guides: the five guides as a list of cards. */
export function guidesIndexHtml(): string {
  return `
    <button class="back" data-back>Back</button>
    <article class="doc content-doc">
      <h1 class="t-page">${escapeHtml(GUIDES_INDEX.title)}</h1>
      <p class="content-lead t-body">${escapeHtml(GUIDES_INDEX.description)}</p>
      <ul class="guide-cards">
        ${GUIDES.map(
          (g) => `<li class="guide-card">
          <h2 class="guide-card-title">${link(guidePath(g.slug), g.title)}</h2>
          <p class="t-body">${escapeHtml(g.description)}</p>
        </li>`,
        ).join('')}
      </ul>
      <p class="t-body">Curious where our prices come from? Read ${link(HOW_WE_CHECK.path, 'how we check prices')}.</p>
    </article>`;
}

/** /guides/<slug>: the heading and opening line at once, the words when they have arrived. */
export function guideHtml(guide: GuideInfo, body: readonly Block[] | null, status: LazyStatus): string {
  const others = GUIDES.filter((g) => g.slug !== guide.slug);
  return `
    <button class="back" data-back>Back</button>
    <article class="doc content-doc">
      <h1 class="t-page">${escapeHtml(guide.title)}</h1>
      <p class="content-lead t-body">${escapeHtml(guide.description)}</p>
      ${body ? blocksHtml(body) : waiting(status)}
      <nav class="content-more" aria-labelledby="more-guides">
        <h2 class="t-section" id="more-guides">More Guides</h2>
        <ul class="t-body">
          ${others.map((g) => `<li>${link(guidePath(g.slug), g.title)}</li>`).join('')}
          <li>${link(GUIDES_PATH, 'All guides')}</li>
        </ul>
      </nav>
    </article>`;
}

/** /about/how-we-check-prices. */
export function howWeCheckHtml(body: readonly Block[] | null, status: LazyStatus): string {
  return `
    <button class="back" data-back>Back</button>
    <article class="doc content-doc">
      <h1 class="t-page">${escapeHtml(HOW_WE_CHECK.title)}</h1>
      <p class="content-lead t-body">${escapeHtml(HOW_WE_CHECK.description)}</p>
      ${body ? blocksHtml(body) : waiting(status)}
    </article>`;
}
