/**
 * Links inside Virtual Yanny's answers.
 *
 * An answer is plain text, kept in sessionStorage and rendered by the widget
 * with everything escaped. A link is written into that text as
 * `[label](/path)` — markdown's own shape, so a reader of the raw text (a
 * test, a log) still sees what it points at — and the widget turns exactly
 * that shape into an anchor, for site paths only (see `yannyMessageHtml` in
 * demo/virtualYanny.ts). Nothing here can produce a link off the site.
 *
 * Every product link goes to `/fragrance/<id>`, the page for that one bottle
 * size, and the id is always the one whose offer the answer quoted, so the
 * price in the sentence is the headline price on the page it opens.
 */
import { slugify } from '../router';

/** Brackets inside a label would close the link early; parentheses are
 *  what a reader would expect to see there anyway. */
function cleanLabel(label) {
  return String(label).replace(/\[/g, '(').replace(/\]/g, ')');
}

/** `[label](/fragrance/<id>)`, or the bare label when there is no id. */
export function fragranceLink(label, id) {
  if (!id) return String(label);
  return `[${cleanLabel(label)}](/fragrance/${encodeURIComponent(id)})`;
}

/** `[label](/path)` for one of the site's own list or leaf pages. */
export function siteLink(label, path) {
  return `[${cleanLabel(label)}](${path})`;
}

/** `[Brand](/brands/<slug>)`, using the router's own slug so the link
 *  resolves to the brand page the site itself links to. */
export function brandLink(brand) {
  return siteLink(brand, `/brands/${slugify(brand)}`);
}

/** `[Shop](/retailers/<id>)`. */
export function retailerLink(name, id) {
  return id ? siteLink(name, `/retailers/${encodeURIComponent(id)}`) : String(name);
}

/** The text with every `[label](/path)` reduced to its label — for a
 *  screen-reader announcement, or anywhere a link cannot be rendered. */
export function stripLinks(text) {
  return String(text).replace(/\[([^\[\]]+)\]\((\/[^\s()]*)\)/g, '$1');
}
