/**
 * The site footer's links: the one list.
 *
 * The footer is part of the static page (it is outside <main id="view">, so it
 * is in the HTML a visitor or a crawler gets before any script runs). The
 * build writes it into demo/template.html at the FOOTER_TAG placeholder from
 * this list (scripts/build-demo.ts), and the click handler in demo/app.ts
 * reads the same `data-goto` and `data-anchor` the markup carries, so there is
 * nothing to keep in step by hand. tests/footerLinks.test.ts reads every
 * address here through the router (demo/router.ts) and fails on one it does
 * not know, so a link can never point at a page that answers "not found".
 *
 * Each link is a real <a href>: it can be copied, opened in a new tab and
 * followed by a crawler. `view` names the in-app page the click opens without
 * reloading (the same words as `data-goto` elsewhere); a link without one is an
 * ordinary navigation, which GitHub Pages answers through 404.html and the
 * router then draws. `anchor` is the part after the # that the click scrolls
 * to.
 *
 * This file imports nothing from the page or the catalogue, so Node can load
 * it for the build and for tests.
 */

export interface FooterLink {
  label: string;
  /** The address, as it is written in the href (an anchor included). */
  href: string;
  /** The in-app page a normal click opens (a `data-goto` view), if the app has one. */
  view?: 'about' | 'legalNotice' | 'botPage' | 'howWeCheck' | 'guides' | 'design';
  /** The id on that page a click scrolls to. Same as the text after the # in `href`. */
  anchor?: string;
}

export interface FooterGroup {
  /** Not shown; the group's name for assistive technology and for tests. */
  label: string;
  links: FooterLink[];
}

export const FOOTER_GROUPS: readonly FooterGroup[] = [
  {
    label: 'About PriceSniffs',
    links: [
      { label: 'About', href: '/about', view: 'about' },
      { label: 'How We Check Prices', href: '/about/how-we-check-prices', view: 'howWeCheck' },
      { label: 'Guides', href: '/guides', view: 'guides' },
      { label: 'How the Bot Works', href: '/about/bot', view: 'botPage' },
    ],
  },
  {
    label: 'Help and legal',
    links: [
      { label: 'Contact', href: '/about#contact', view: 'about', anchor: 'contact' },
      { label: 'Legal Notice', href: '/about/legal', view: 'legalNotice' },
      { label: 'Privacy', href: '/about/legal#privacy', view: 'legalNotice', anchor: 'privacy' },
      { label: 'Design System', href: '/design', view: 'design' },
    ],
  },
];

/** Every footer link, in reading order. */
export const FOOTER_LINKS: readonly FooterLink[] = FOOTER_GROUPS.flatMap((g) => g.links);

/** Where the build writes the footer in demo/template.html. */
export const FOOTER_TAG = '<!--__FOOTER_LINKS__-->';

const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function linkHtml(l: FooterLink): string {
  const goto = l.view ? ` data-goto="${l.view}"` : '';
  const anchor = l.anchor ? ` data-anchor="${escAttr(l.anchor)}"` : '';
  return `<li><a class="footer-link" href="${escAttr(l.href)}"${goto}${anchor}>${escAttr(l.label)}</a></li>`;
}

/**
 * The footer's navigation, as markup. One landmark with a name that tells it
 * from the top bar's, and a list per group (lists, not a run of links, so a
 * screen reader says how many there are).
 */
export function footerNavHtml(): string {
  const lists = FOOTER_GROUPS.map(
    (g) => `<ul class="footer-list" aria-label="${escAttr(g.label)}">${g.links.map(linkHtml).join('')}</ul>`,
  ).join('\n      ');
  return `<nav class="footer-nav" aria-label="Footer">\n      ${lists}\n    </nav>`;
}

/** Puts the footer navigation into the template. Throws when the placeholder is missing. */
export function withFooterLinks(template: string): string {
  if (!template.includes(FOOTER_TAG)) throw new Error(`demo/template.html has no ${FOOTER_TAG} placeholder to inject into`);
  return template.replace(FOOTER_TAG, () => footerNavHtml());
}
