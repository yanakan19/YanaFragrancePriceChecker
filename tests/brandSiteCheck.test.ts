import { describe, expect, it } from 'vitest';
import {
  classifyLanding,
  registrableDomain,
  marketOf,
  type Landing,
} from '../src/catalogue/brandSiteCheck.js';

/** A landing that arrived cleanly, so each test only states what it varies. */
const landing = (over: Partial<Landing> = {}): Landing => ({
  brands: ['a brand'],
  declared: 'https://www.example.com/',
  landed: 'https://www.example.com/',
  status: 200,
  ...over,
});

describe('registrableDomain', () => {
  it('ignores www and other subdomains', () => {
    expect(registrableDomain('www.rabanne.com')).toBe('rabanne.com');
    expect(registrableDomain('rabanne.com')).toBe('rabanne.com');
    expect(registrableDomain('shop.eu.rabanne.com')).toBe('rabanne.com');
  });

  // The case a naive last-two-labels rule gets wrong, and the most common
  // shape in demo/brandSites.ts: it would read both of these as "co.uk" and
  // call two unrelated houses the same site.
  it('keeps two .co.uk sites apart', () => {
    expect(registrableDomain('alharamainperfumes.co.uk')).toBe('alharamainperfumes.co.uk');
    expect(registrableDomain('www.fragrancehub.co.uk')).toBe('fragrancehub.co.uk');
    expect(registrableDomain('alharamainperfumes.co.uk')).not.toBe(
      registrableDomain('www.fragrancehub.co.uk'),
    );
  });
});

describe('marketOf', () => {
  it('reads a market from a country TLD', () => {
    expect(marketOf('https://ahmedalmaghribi.ae/')).toBe('ae');
    expect(marketOf('https://alharamainperfumes.co.uk/')).toBe('uk');
  });

  it('reads a market from a subdomain', () => {
    expect(marketOf('https://ae.ahmedalmaghribi.com/')).toBe('ae');
    expect(marketOf('https://uk.riiffsperfumes.com/')).toBe('uk');
  });

  it('reads a market from a path prefix', () => {
    expect(marketOf('https://www.jeanpaulgaultier.com/uk/en/')).toBe('uk');
    expect(marketOf('https://www.dolcegabbana.com/en-gb/beauty/')).toBe('gb');
  });

  // /en/gb/ says the same thing as /en-gb/. Reading only the first segment
  // found "en", which names no market, and discarded the path — so Acqua di
  // Parma's real UK storefront was labelled "Non-UK Site" on its brand page.
  it('reads a market from a slash-separated language and region', () => {
    expect(marketOf('https://www.acquadiparma.com/en/gb/')).toBe('gb');
  });

  // The first segment still wins when it names a market itself, so the
  // /uk/en/ ordering several houses use is untouched by the rule above.
  it('prefers a market named by the first path segment', () => {
    expect(marketOf('https://www.kenzo.com/uk/en/')).toBe('uk');
    expect(marketOf('https://www.furla.com/us/en/eshop/')).toBe('us');
  });

  // The pair written the other way round. Christian Louboutin's real UK
  // fragrance pages live at /uk_en/ and Tous's at /gb-en/; read strictly as
  // language_REGION both say "market en", which is no market at all, so a
  // marked UK storefront was labelled "Non-UK Site".
  it('reads a market from a region_language path pair', () => {
    expect(marketOf('https://eu.christianlouboutin.com/uk_en/beauty/fragrances/')).toBe('uk');
    expect(marketOf('https://www.tous.com/gb-en/')).toBe('gb');
    expect(marketOf('https://www.franciskurkdjian.com/uk-en')).toBe('uk');
  });

  // Louis Vuitton's UK page is /eng-gb/ — ISO 639-2's three-letter "eng"
  // rather than "en" — which the two-letter-only version of this pattern
  // could not match at all. Before this, the path fell straight through and
  // the entry read UK only because uk.louisvuitton.com's subdomain happened
  // to save it; a brand publishing the same /eng-gb/ shape on a bare .com
  // would have gone unmarked. Ordinary order, so no reversal is involved —
  // this is purely about the left side tolerating three letters.
  it('reads a three-letter language code paired with a market', () => {
    expect(marketOf('https://uk.louisvuitton.com/eng-gb/homepage')).toBe('gb');
    expect(marketOf('https://www.example.com/eng-us/')).toBe('us');
  });

  // Both orderings have to keep working, and the ordinary one is the far more
  // common shape in demo/brandSites.ts — a fix for the reverse that broke
  // these would trade one wrong label for dozens.
  it('still reads the ordinary language_REGION pair', () => {
    expect(marketOf('https://www.dolcegabbana.com/en-gb/beauty/')).toBe('gb');
    expect(marketOf('https://int.biotherm.com/en_GB/homepage')).toBe('gb');
    expect(marketOf('https://www.ninaricci.com/en-uk')).toBe('uk');
    expect(marketOf('https://www.example.com/en-us/')).toBe('us');
  });

  // The flip is only safe where the right half cannot be a country. "ar" is
  // Arabic and Argentina at once, so /es-ar/ keeps the standard reading and
  // resolves to Argentina rather than Spain.
  it('leaves an ambiguous pair on the standard reading', () => {
    expect(marketOf('https://www.example.com/es-ar/')).toBe('ar');
    expect(marketOf('https://www.example.com/fr-de/')).toBe('de');
    expect(marketOf('https://www.example.com/pt-br/')).toBe('br');
  });

  // "en" on the right only re-orders the pair when the left half is a market
  // this file recognises — otherwise there is nothing to prefer it to.
  it('does not invent a market from an unrecognised left half', () => {
    expect(marketOf('https://www.example.com/zz-en/')).toBe('en');
  });

  // A language pair naming no country stays unreadable rather than being
  // forced into one — /en/xx/ is not a market statement.
  it('reports no market when neither path segment names a country', () => {
    expect(marketOf('https://www.example.com/en/xx/')).toBeNull();
  });

  // The distinction the whole classifier rests on: a global .com names no
  // market, which is not the same as naming a foreign one.
  it('reports no market for a plain global site', () => {
    expect(marketOf('https://www.carolinaherrera.com/')).toBeNull();
    expect(marketOf('https://www.rabanne.com/')).toBeNull();
  });
});

describe('classifyLanding', () => {
  it('passes a link that lands where it says it will', () => {
    const f = classifyLanding(landing());
    expect(f.verdict).toBe('ok');
  });

  it('passes a global site that names no market', () => {
    const f = classifyLanding(
      landing({
        declared: 'https://www.carolinaherrera.com/',
        landed: 'https://www.carolinaherrera.com/en/',
      }),
    );
    expect(f.verdict).toBe('ok');
  });

  // A brand running one global site is not an error, and a rule of "must be a
  // UK domain" would reject dozens of correct entries in demo/brandSites.ts.
  it('does not fault a brand for being on a .com', () => {
    const f = classifyLanding(landing({ declared: 'https://www.rabanne.com/', landed: 'https://www.rabanne.com/' }));
    expect(f.verdict).toBe('ok');
  });

  it('treats www and the bare apex as the same place', () => {
    const f = classifyLanding(
      landing({ declared: 'https://rabanne.com/', landed: 'https://www.rabanne.com/' }),
    );
    expect(f.verdict).toBe('ok');
  });

  it('reports a dead link', () => {
    expect(classifyLanding(landing({ status: 404 })).verdict).toBe('dead');
    expect(classifyLanding(landing({ status: 410 })).verdict).toBe('dead');
    expect(classifyLanding(landing({ status: 503 })).verdict).toBe('dead');
  });

  // The first live sweep of demo/brandSites.ts reported 22 dead links. Only 4
  // were real: 18 were 403s from luxury houses' bot defences — Chanel, Prada,
  // Gucci, Lancôme, Versace among them — every one confirmed still live by
  // hand. Calling a refusal aimed at us a dead link sends a reviewer after
  // healthy sites, so these are a non-answer, not a finding.
  it('does not call a bot-defence refusal a dead link', () => {
    for (const status of [401, 403, 429]) {
      const f = classifyLanding(landing({ status }));
      expect(f.verdict).toBe('could-not-ask');
      expect(f.verdict).not.toBe('dead');
    }
  });

  it('says plainly that a refusal is not evidence about the link', () => {
    expect(classifyLanding(landing({ status: 403 })).reason).toContain('not evidence about the link');
  });

  it('reports a request that never arrived', () => {
    const f = classifyLanding(landing({ status: 0, landed: null, error: 'getaddrinfo ENOTFOUND' }));
    expect(f.verdict).toBe('dead');
    expect(f.reason).toContain('ENOTFOUND');
  });

  it('flags a link that lands on a different company', () => {
    const f = classifyLanding(
      landing({
        declared: 'https://www.somebrand.co.uk/',
        landed: 'https://domain-parking.example.net/',
      }),
    );
    expect(f.verdict).toBe('redirected-domain');
  });

  // The real error this sweep was built for: Ahmed Al Maghribi's entry sent a
  // UK reader to the house's UAE storefront. Same company, wrong market — so
  // it must NOT be caught by the different-domain rule above, and must still
  // be caught.
  it("flags the same house's wrong market", () => {
    const f = classifyLanding(
      landing({
        brands: ['ahmed al maghribi'],
        declared: 'https://uk.ahmedalmaghribi.com/',
        landed: 'https://ae.ahmedalmaghribi.com/',
      }),
    );
    expect(f.verdict).toBe('redirected-region');
  });

  // A CI runner is not in the UK, so this verdict is a prompt to look rather
  // than proof. The reason text has to say so, or a reader of the log will
  // take a geo-redirect for a broken entry.
  it('says a region flag may just be the runner being abroad', () => {
    const f = classifyLanding(
      landing({ declared: 'https://uk.house.com/', landed: 'https://us.house.com/' }),
    );
    expect(f.verdict).toBe('redirected-region');
    expect(f.reason).toContain('not in the UK');
  });

  // What widening marketOf to the region_language ordering changes for the
  // probe, stated so it is a decision rather than a side effect: a /uk_en/
  // link bounced to /us_en/ used to read as market "en" on both sides and
  // pass as ok. It is the same wrong-market fault as the Ahmed Al Maghribi
  // case above, and the probe now reports it.
  it('flags a wrong market written region-first', () => {
    const f = classifyLanding(
      landing({
        declared: 'https://eu.house.com/uk_en/beauty/',
        landed: 'https://eu.house.com/us_en/beauty/',
      }),
    );
    expect(f.verdict).toBe('redirected-region');
  });

  // And the other side of that: the two orderings name the same market, so a
  // site that rewrites /en-gb/ to /gb-en/ is not a finding.
  it('does not read the two orderings of one market as a mismatch', () => {
    const f = classifyLanding(
      landing({
        declared: 'https://www.house.com/en-gb/',
        landed: 'https://www.house.com/gb-en/',
      }),
    );
    expect(f.verdict).toBe('ok');
  });

  it('does not read uk and gb as different markets', () => {
    const f = classifyLanding(
      landing({
        declared: 'https://www.house.com/en-gb/',
        landed: 'https://www.house.com/uk/',
      }),
    );
    expect(f.verdict).toBe('ok');
  });

  // A site that declares no market and lands on one is a redirect we cannot
  // call wrong: nothing was promised about market in the first place.
  it('does not fault a market-less link for landing on a market', () => {
    const f = classifyLanding(
      landing({ declared: 'https://www.house.com/', landed: 'https://www.house.com/en-gb/' }),
    );
    expect(f.verdict).toBe('ok');
  });
});
