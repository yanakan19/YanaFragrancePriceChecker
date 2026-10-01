import { describe, expect, it } from 'vitest';
import {
  bestMatch,
  bestOfficialMatch,
  brandMatchesFolder,
  canonicalName,
  concentrationClassOf,
  fragranceBaseKey,
  fragranceLinkKey,
  fragranticaPath,
  fragranticaUrlFromPath,
  isOfficialHost,
  looksBlocked,
  marketRank,
  matchFragranticaUrl,
  matchOfficialUrl,
  parseBingResults,
  parseFragranticaUrl,
  parseSitemap,
  unwrapBingLink,
  wantedConcentration,
} from '../src/catalogue/fragranceLinkMatch.js';

const SAUVAGE_EDT = 'https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html';

describe('parseFragranticaUrl', () => {
  it('accepts a perfume page and canonicalises host, query and fragment', () => {
    expect(parseFragranticaUrl('https://fragrantica.com/perfume/Dior/Sauvage-31861.html?utm_source=x#reviews')).toEqual({
      folder: 'Dior',
      slug: 'Sauvage',
      id: '31861',
      url: SAUVAGE_EDT,
    });
  });

  it('reads the localised hosts as the same page', () => {
    expect(parseFragranticaUrl('https://www.fragrantica.es/perfume/Dior/Sauvage-31861.html')?.url).toBe(SAUVAGE_EDT);
  });

  it.each([
    'https://www.fragrantica.com/search/?query=dior%20sauvage',
    'https://www.fragrantica.com/designers/Dior.html',
    'https://www.fragrantica.com/perfume/Dior/',
    'https://www.fragrantica.com/perfume/Dior/Sauvage.html',
    'https://notfragrantica.com/perfume/Dior/Sauvage-31861.html',
    'https://www.fragrantica.com.evil.example/perfume/Dior/Sauvage-31861.html',
    'ftp://www.fragrantica.com/perfume/Dior/Sauvage-31861.html',
    'not a url',
  ])('rejects %s', (url) => {
    expect(parseFragranticaUrl(url)).toBeNull();
  });

  it('round-trips through the compact path the demo stores', () => {
    const path = fragranticaPath(SAUVAGE_EDT)!;
    expect(path).toBe('Dior/Sauvage-31861');
    expect(fragranticaUrlFromPath(path)).toBe(SAUVAGE_EDT);
  });
});

describe('concentration reading', () => {
  it('classifies the labels the catalogue uses', () => {
    expect(wantedConcentration('Eau de Parfum')).toBe('edp');
    expect(wantedConcentration('Eau de Toilette')).toBe('edt');
    expect(wantedConcentration('Extrait de Parfum')).toBe('parfum');
    expect(wantedConcentration('Parfum')).toBe('parfum');
    expect(wantedConcentration('Eau de Cologne')).toBe('cologne');
  });

  it('treats labels that say nothing decisive as unknown', () => {
    for (const label of ['Not stated', 'Disputed', 'Perfume Oil', 'Aftershave', 'Eau Fraiche', '', undefined]) {
      expect(wantedConcentration(label)).toBeNull();
    }
  });

  it('does not count "eau de parfum" as a second, bare "parfum"', () => {
    expect(concentrationClassOf('Sauvage Eau de Parfum')).toBe('edp');
  });

  it('reports a slug that states two concentrations as mixed, so a caller can refuse it', () => {
    expect(concentrationClassOf('Sauvage Eau de Toilette Eau de Parfum')).toBe('mixed');
  });
});

describe('canonicalName', () => {
  it('ignores case, accents, apostrophes and spacing', () => {
    expect(canonicalName("Bade'e Al Oud", 'Lattafa')).toBe(canonicalName('Bade e Al Oud', 'Lattafa'));
    expect(canonicalName('Terre d’Hermès', 'Hermès')).toBe(canonicalName('terre d hermes', 'Hermes'));
  });

  it('drops concentration words, sizes and ids but nothing that names the perfume', () => {
    expect(canonicalName('Sauvage Eau de Parfum 100ml Y0998004', 'Dior')).toBe('sauvage');
    expect(canonicalName('khamrah qahwa 100 ml', 'Lattafa')).toBe('khamrahqahwa');
  });

  it('keeps numbers that are part of the name', () => {
    expect(canonicalName('1 Million', 'Rabanne')).toBe('1million');
    expect(canonicalName('212 VIP', 'Carolina Herrera')).toBe('212vip');
  });

  it('keeps an id-looking token the wanted name itself contains', () => {
    expect(canonicalName('1881', 'Cerruti', new Set(['1881']))).toBe('1881');
  });

  it('strips a leading brand, so "Armaf Club De Nuit" meets "Club De Nuit"', () => {
    expect(canonicalName('Armaf Club De Nuit', 'Armaf')).toBe(canonicalName('Club De Nuit', 'Armaf'));
  });

  it('is empty when nothing is left to compare', () => {
    expect(canonicalName('Eau de Parfum', 'Dior')).toBe('');
  });
});

describe('brandMatchesFolder', () => {
  it.each([
    ['Lattafa', 'Lattafa-Perfumes'],
    ['Rabanne', 'Paco-Rabanne'],
    ['Dolce & Gabbana', 'Dolce-Gabbana'],
    ['Hermès', 'Herm%C3%A8s'],
    ['Yves Saint Laurent', 'Yves-Saint-Laurent'],
    ['Maison Margiela', 'Maison-Martin-Margiela'],
    ['Al Haramain', 'Al-Haramain-Perfumes'],
  ])('%s is %s', (brand, folder) => {
    expect(brandMatchesFolder(brand, folder)).toBe(true);
  });

  it.each([
    ['Giorgio Armani', 'Emporio-Armani'],
    ['Dior', 'Christian-Dior-Boutique-Extra-Words-Here'],
    ['Tom Ford', 'Tom-Tailor'],
    ['Armaf', 'Afnan'],
  ])('%s is not %s', (brand, folder) => {
    expect(brandMatchesFolder(brand, folder)).toBe(false);
  });
});

describe('matchFragranticaUrl', () => {
  const sauvage = (concentration: string) => ({ brand: 'Dior', name: 'Sauvage', concentration });

  it('accepts the base page for the perfume it names', () => {
    expect(matchFragranticaUrl(SAUVAGE_EDT, sauvage('Eau de Toilette'))).toEqual({ url: SAUVAGE_EDT, quality: 'base' });
  });

  it('prefers a page that states the concentration, and calls it exact', () => {
    const url = 'https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Parfum-43763.html';
    expect(matchFragranticaUrl(url, sauvage('Eau de Parfum'))).toEqual({ url, quality: 'exact' });
  });

  it('never accepts a page for a different concentration', () => {
    const edp = 'https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Parfum-43763.html';
    expect(matchFragranticaUrl(edp, sauvage('Eau de Toilette'))).toBeNull();
    const edt = 'https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Toilette-1.html';
    expect(matchFragranticaUrl(edt, sauvage('Eau de Parfum'))).toBeNull();
  });

  it('accepts a concentration-specific page as loose when the catalogue does not know the concentration', () => {
    const url = 'https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Parfum-43763.html';
    expect(matchFragranticaUrl(url, sauvage('Not stated'))?.quality).toBe('loose');
  });

  it('rejects a different perfume that shares the start of the name', () => {
    const elixir = 'https://www.fragrantica.com/perfume/Dior/Sauvage-Elixir-65543.html';
    expect(matchFragranticaUrl(elixir, sauvage('Eau de Parfum'))).toBeNull();
    const femme = 'https://www.fragrantica.com/perfume/Giorgio-Armani/Armani-Code-Femme-1.html';
    expect(matchFragranticaUrl(femme, { brand: 'Giorgio Armani', name: 'Armani Code', concentration: 'Eau de Parfum' })).toBeNull();
  });

  it('rejects the right name under the wrong brand', () => {
    const url = 'https://www.fragrantica.com/perfume/Zara/Sauvage-999.html';
    expect(matchFragranticaUrl(url, sauvage('Eau de Toilette'))).toBeNull();
  });

  it('matches through the brand spellings Fragrantica uses', () => {
    expect(
      matchFragranticaUrl('https://www.fragrantica.com/perfume/Lattafa-Perfumes/Khamrah-Qahwa-88175.html', {
        brand: 'Lattafa',
        name: 'Khamrah Qahwa',
        concentration: 'Eau de Parfum',
      })?.quality,
    ).toBe('base');
    expect(
      matchFragranticaUrl('https://www.fragrantica.com/perfume/Paco-Rabanne/1-Million-3747.html', {
        brand: 'Rabanne',
        name: '1 Million',
        concentration: 'Eau de Toilette',
      })?.quality,
    ).toBe('base');
  });

  it('refuses a URL that is not a perfume page', () => {
    expect(matchFragranticaUrl('https://www.fragrantica.com/search/?query=sauvage', sauvage('Eau de Parfum'))).toBeNull();
  });
});

describe('isOfficialHost', () => {
  it('accepts the site itself, www and any subdomain of it', () => {
    expect(isOfficialHost('lattafa.com', 'https://lattafa.com/')).toBe(true);
    expect(isOfficialHost('www.lattafa.com', 'https://lattafa.com/')).toBe(true);
    expect(isOfficialHost('uk.afnan.com', 'https://afnan.com/')).toBe(true);
    expect(isOfficialHost('afnan.com', 'https://uk.afnan.com/')).toBe(true);
  });

  it('accepts the same name on another common country domain', () => {
    expect(isOfficialHost('www.yslbeauty.com', 'https://www.yslbeauty.co.uk/')).toBe(true);
  });

  it('rejects another shop, however it is named', () => {
    expect(isOfficialHost('www.lattafa-usa.com', 'https://lattafa.com/')).toBe(false);
    expect(isOfficialHost('lattafa.com.evil.example', 'https://lattafa.com/')).toBe(false);
    expect(isOfficialHost('www.amazon.com', 'https://lattafa.com/')).toBe(false);
    expect(isOfficialHost('lattafa.xyz', 'https://lattafa.com/')).toBe(false);
  });

  it('rejects an unparseable site', () => {
    expect(isOfficialHost('lattafa.com', 'not a url')).toBe(false);
  });
});

describe('matchOfficialUrl', () => {
  const lattafa = 'https://lattafa.com/';
  const wanted = { brand: 'Lattafa', name: 'Khamrah Qahwa', concentration: 'Eau de Parfum' };

  it('accepts the perfume page on the brand domain', () => {
    expect(matchOfficialUrl('https://lattafa.com/product/khamrah-qahwa/', wanted, lattafa)).toEqual({
      url: 'https://lattafa.com/product/khamrah-qahwa/',
      quality: 'base',
    });
  });

  it('strips tracking parameters from what it stores', () => {
    expect(matchOfficialUrl('https://lattafa.com/product/khamrah-qahwa/?utm_source=a&msockid=b', wanted, lattafa)?.url).toBe(
      'https://lattafa.com/product/khamrah-qahwa/',
    );
  });

  it('refuses the same page on someone else\'s domain', () => {
    expect(matchOfficialUrl('https://www.lattafa-usa.com/products/khamrah-qahwa', wanted, lattafa)).toBeNull();
    expect(matchOfficialUrl('https://www.amazon.com/khamrah-qahwa', wanted, lattafa)).toBeNull();
  });

  it('refuses the homepage and locale-only paths', () => {
    expect(matchOfficialUrl('https://lattafa.com/', wanted, lattafa)).toBeNull();
    expect(matchOfficialUrl('https://www.dior.com/en_us', { brand: 'Dior', name: 'Sauvage' }, 'https://www.dior.com/')).toBeNull();
  });

  it('refuses collection, brand and search pages even when the slug matches', () => {
    expect(matchOfficialUrl('https://lattafa.com/collections/khamrah-qahwa', wanted, lattafa)).toBeNull();
    expect(matchOfficialUrl('https://lattafa.com/search/khamrah-qahwa', wanted, lattafa)).toBeNull();
    expect(matchOfficialUrl('https://lattafa.com/brands/khamrah-qahwa/', wanted, lattafa)).toBeNull();
  });

  it('refuses a neighbouring perfume', () => {
    expect(matchOfficialUrl('https://lattafa.com/product/khamrah/', wanted, lattafa)).toBeNull();
    expect(matchOfficialUrl('https://lattafa.com/product/khamrah-qahwa-intense/', wanted, lattafa)).toBeNull();
  });

  it('reads a trailing id segment and a size in the slug as noise', () => {
    const dior = 'https://www.dior.com/';
    expect(
      matchOfficialUrl('https://www.dior.com/en_gb/beauty/products/sauvage-parfum-Y0998004.html', { brand: 'Dior', name: 'Sauvage', concentration: 'Parfum' }, dior)?.quality,
    ).toBe('exact');
    expect(matchOfficialUrl('https://armaf.uk/products/odyssey-homme-eau-de-parfum-100ml', { brand: 'Armaf', name: 'Odyssey Homme', concentration: 'Eau de Parfum' }, 'https://armaf.uk')?.quality).toBe('exact');
  });

  it('applies the concentration rule to the brand page too', () => {
    const url = 'https://armaf.uk/products/odyssey-homme-eau-de-toilette-100ml';
    expect(matchOfficialUrl(url, { brand: 'Armaf', name: 'Odyssey Homme', concentration: 'Eau de Parfum' }, 'https://armaf.uk')).toBeNull();
  });
});

describe('choosing between matches', () => {
  it('bestMatch prefers exact over base over loose, and the earlier one on a tie', () => {
    expect(bestMatch([{ url: 'a', quality: 'loose' as const }, { url: 'b', quality: 'base' as const }, { url: 'c', quality: 'exact' as const }, { url: 'd', quality: 'exact' as const }])?.url).toBe('c');
    expect(bestMatch([])).toBeNull();
  });

  it('bestOfficialMatch breaks a tie toward the UK storefront', () => {
    const de = { url: 'https://www.dolcegabbana.com/de-at/beauty/light-blue/', quality: 'exact' as const };
    const uk = { url: 'https://www.dolcegabbana.com/en-gb/beauty/light-blue/', quality: 'exact' as const };
    const us = { url: 'https://www.dolcegabbana.com/en-us/beauty/light-blue/', quality: 'exact' as const };
    expect(bestOfficialMatch([de, us, uk])?.url).toBe(uk.url);
    expect(marketRank(uk.url)).toBeLessThan(marketRank(us.url));
    expect(marketRank(us.url)).toBeLessThan(marketRank(de.url));
  });

  it('bestOfficialMatch still prefers quality over market', () => {
    const ukBase = { url: 'https://x.co.uk/p/a', quality: 'base' as const };
    const deExact = { url: 'https://x.de/p/a', quality: 'exact' as const };
    expect(bestOfficialMatch([ukBase, deExact])?.url).toBe(deExact.url);
  });
});

describe('keys', () => {
  it('ignore case, punctuation and accents, and name the concentration', () => {
    expect(fragranceLinkKey('Hermès', "Terre d'Hermès", 'Eau de Toilette')).toBe('hermes|terredhermes|edt');
    expect(fragranceLinkKey('Dolce & Gabbana', 'Light Blue', 'Eau de Parfum')).toBe('dolcegabbana|lightblue|edp');
    expect(fragranceBaseKey('Dolce & Gabbana', 'Light Blue')).toBe('dolcegabbana|lightblue');
  });

  it('keep every concentration label distinct', () => {
    const labels = ['Eau de Parfum', 'Eau de Toilette', 'Extrait de Parfum', 'Parfum', 'Eau de Cologne', 'Perfume Oil', 'Not stated'];
    expect(new Set(labels.map((c) => fragranceLinkKey('Dior', 'X', c))).size).toBe(labels.length);
  });
});

describe('search result parsing', () => {
  const real = 'https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html';
  const wrapped = (url: string) =>
    `https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${Buffer.from(url).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}&amp;ntb=1`;

  it('unwraps a Bing redirect link', () => {
    expect(unwrapBingLink(wrapped(real))).toBe(real);
  });

  it('passes a direct link through and refuses an unusable Bing one', () => {
    expect(unwrapBingLink('https://lattafa.com/product/x/')).toBe('https://lattafa.com/product/x/');
    expect(unwrapBingLink('https://www.bing.com/ck/a?!&&p=abc&ntb=1')).toBeNull();
  });

  it('reads results in rank order with tidy titles', () => {
    const html =
      `<ol><li class="b_algo"><h2><a href="${wrapped(real)}">Sauvage <strong>Dior</strong> cologne</a></h2></li>` +
      `<li class="b_algo"><h2 class="x"><a target="_blank" href="https://lattafa.com/product/khamrah/">Khamrah &amp; more</a></h2></li></ol>`;
    expect(parseBingResults(html)).toEqual([
      { url: real, title: 'Sauvage Dior cologne' },
      { url: 'https://lattafa.com/product/khamrah/', title: 'Khamrah & more' },
    ]);
  });

  it('recognises a challenge page', () => {
    expect(looksBlocked('<html>Please solve this CAPTCHA</html>')).toBe(true);
    expect(looksBlocked('<li class="b_algo">captcha is a word in a result</li>')).toBe(false);
    expect(looksBlocked('<html>ok</html>')).toBe(false);
  });
});

describe('parseSitemap', () => {
  it('reads a urlset', () => {
    expect(parseSitemap('<urlset><url><loc>https://a.com/p/x</loc></url><url><loc> https://a.com/p/y </loc></url></urlset>')).toEqual({
      kind: 'urlset',
      locs: ['https://a.com/p/x', 'https://a.com/p/y'],
    });
  });

  it('reads an index, CDATA and entities', () => {
    const xml =
      '<sitemapindex><sitemap><loc><![CDATA[https://a.com/sitemap_products_1.xml?from=1&amp;to=2]]></loc></sitemap></sitemapindex>';
    expect(parseSitemap(xml)).toEqual({ kind: 'index', locs: ['https://a.com/sitemap_products_1.xml?from=1&to=2'] });
  });
});
