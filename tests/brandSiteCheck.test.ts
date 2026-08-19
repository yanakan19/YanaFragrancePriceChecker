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
    expect(classifyLanding(landing({ status: 503 })).verdict).toBe('dead');
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
