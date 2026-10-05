import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { fragranceLinkKey, fragranticaPath } from '../src/catalogue/fragranceLinkMatch.js';
import type { LinksFile } from '../src/catalogue/fragranceLinkStore.js';
import {
  NO_REVIEW,
  genderOfAddress,
  genderOfTitle,
  indexReview,
  learnPageGenders,
  matchFragranticaChecked,
  mergePageGenders,
  pageGenderOfResult,
  parseReview,
  renderReview,
  reviewRefusal,
  sharedGender,
  type FragranticaReview,
} from '../src/catalogue/fragranticaReview.js';

/**
 * Who a Fragrantica page is for, recorded from a search result the first time
 * the daily job sees the page (follow up 2 of 2026-10-05; the audit is
 * docs/FRAGRANTICA-LINK-AUDIT-2026-10-05.md). Only a result's title and address
 * are read, and only one word of them is kept. The stored review and links are
 * held to the rule at the end.
 */

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const U = (path: string) => `https://www.fragrantica.com/perfume/${path}.html`;
const blank = (): FragranticaReview => ({ ...NO_REVIEW, pageGender: {} });

describe('reading a result\'s title', () => {
  it('reads the three phrases Fragrantica uses, and "and" is not "for men"', () => {
    // A title as a search result shows it (read from a result on 2026-10-05).
    expect(genderOfTitle('Sauvage Dior cologne - a fragrance for men 2015')).toBe('men');
    expect(genderOfTitle('Black Opium Yves Saint Laurent perfume - a fragrance for women 2014')).toBe('women');
    expect(genderOfTitle('Nuit d\'Issey Issey Miyake cologne - a fragrance for women and men 2014')).toBe('unisex');
    expect(genderOfTitle('Something Brand perfume - a new fragrance for women and men 2025')).toBe('unisex');
    expect(genderOfTitle('Something Brand perfume - a fragrance for men and women 2025')).toBe('unisex');
  });

  it('a title with no such phrase says nothing, and the page\'s own phrase beats a name that has one', () => {
    expect(genderOfTitle('Eau de Parfum - Fragrantica')).toBeNull();
    expect(genderOfTitle('')).toBeNull();
    // The perfume is called "for Men" and the page says it is for women and men.
    expect(genderOfTitle('Odd for Men Brand perfume - a fragrance for women and men 2020')).toBe('unisex');
  });

  it('without the page\'s own phrase (a cut short title) one phrase counts, two different ones do not', () => {
    expect(genderOfTitle('Eternity for Men Calvin Klein cologne - a frag...')).toBe('men');
    expect(genderOfTitle('Eternity for Men and for Women Calvin Klein ...')).toBeNull();
  });

  it('does not take "for her", "pour homme" or a word that merely contains men', () => {
    expect(genderOfTitle('Something for her - a fragrance')).toBeNull();
    expect(genderOfTitle('Pour Homme Brand cologne')).toBeNull();
    expect(genderOfTitle('Womenswear Elements of men')).toBeNull();
  });
});

describe('reading a page\'s address', () => {
  it('reads the end of the name', () => {
    expect(genderOfAddress(U('Calvin-Klein/Eternity-For-Men-258'))).toBe('men');
    expect(genderOfAddress(U('Calvin-Klein/Eternity-Aqua-for-Women-15119'))).toBe('women');
    expect(genderOfAddress(U('Brand/Name-for-Women-and-Men-1234'))).toBe('unisex');
  });

  it('says nothing for a name without the phrase at its end, or for a page that is not a perfume page', () => {
    expect(genderOfAddress(U('Dior/Sauvage-31861'))).toBeNull();
    expect(genderOfAddress(U('Brand/For-Men-Edition-1234'))).toBeNull();
    expect(genderOfAddress('https://www.fragrantica.com/search/?query=for-men-1')).toBeNull();
    expect(genderOfAddress('https://example.com/perfume/Brand/Name-for-Men-1.html')).toBeNull();
  });
});

describe('pageGenderOfResult', () => {
  it('takes the title, or the address when the title says nothing', () => {
    expect(pageGenderOfResult({ url: U('Dior/Sauvage-31861'), title: 'Sauvage Dior cologne - a fragrance for men 2015' })).toEqual({
      path: 'Dior/Sauvage-31861',
      gender: 'men',
    });
    expect(pageGenderOfResult({ url: U('Calvin-Klein/Eternity-For-Men-258'), title: '' })).toEqual({
      path: 'Calvin-Klein/Eternity-For-Men-258',
      gender: 'men',
    });
  });

  it('records nothing from a title and an address that disagree, or from a result that is no perfume page', () => {
    expect(pageGenderOfResult({ url: U('Brand/Name-for-Men-1'), title: 'Name Brand perfume - a fragrance for women 2020' })).toBeNull();
    expect(pageGenderOfResult({ url: 'https://www.dior.com/en_gb/sauvage', title: 'Sauvage - a fragrance for men' })).toBeNull();
    expect(pageGenderOfResult({ url: 'https://www.fragrantica.com/search/?query=x', title: 'a fragrance for men' })).toBeNull();
  });
});

describe('learnPageGenders: the first time a page is seen', () => {
  const results = [
    { url: U('Armaf/Club-de-Nuit-Intense-27656'), title: 'Club de Nuit Intense Armaf perfume - a fragrance for women 2015' },
    { url: U('Armaf/Club-de-Nuit-Intense-Man-35444'), title: 'Club de Nuit Intense Man Armaf cologne - a fragrance for men 2015' },
    { url: 'https://www.macys.com/shop/product/x', title: 'X - a fragrance for men' },
    { url: U('Brand/No-Words-1'), title: 'Brand No Words - Fragrantica' },
  ];

  it('records each page\'s gender, and nothing for results that say none', () => {
    const review = blank();
    const index = indexReview(review);
    const got = learnPageGenders(results, review, index);
    expect(got.added).toEqual([
      { path: 'Armaf/Club-de-Nuit-Intense-27656', gender: 'women' },
      { path: 'Armaf/Club-de-Nuit-Intense-Man-35444', gender: 'men' },
    ]);
    expect(review.pageGender).toEqual({
      'Armaf/Club-de-Nuit-Intense-27656': 'women',
      'Armaf/Club-de-Nuit-Intense-Man-35444': 'men',
    });
  });

  it('never overwrites a gender the file has, and says where a result disagreed', () => {
    const review = { ...blank(), pageGender: { 'Armaf/Club-de-Nuit-Intense-27656': 'unisex' as const } };
    const index = indexReview(review);
    const got = learnPageGenders(results, review, index);
    expect(review.pageGender['Armaf/Club-de-Nuit-Intense-27656']).toBe('unisex');
    expect(index.gender.get('Armaf/Club-de-Nuit-Intense-27656')).toBe('unisex');
    expect(got.disagreed).toEqual([{ path: 'Armaf/Club-de-Nuit-Intense-27656', stored: 'unisex', read: 'women' }]);
    expect(got.added.map((a) => a.path)).toEqual(['Armaf/Club-de-Nuit-Intense-Man-35444']);
  });

  it('a second sighting adds nothing', () => {
    const review = blank();
    const index = indexReview(review);
    learnPageGenders(results, review, index);
    const again = learnPageGenders(results, review, index);
    expect(again.added).toEqual([]);
    expect(again.disagreed).toEqual([]);
  });

  it('the very next candidate is held to what was just learned: a men\'s product is refused the women\'s page', () => {
    const review = blank();
    const index = indexReview(review);
    const wanted = { brand: 'Armaf', name: 'Club De Nuit Intense', concentration: 'Eau de Parfum' };
    const page = U('Armaf/Club-de-Nuit-Intense-27656');
    // Before the page is seen the rule has nothing to go on, as before.
    expect(matchFragranticaChecked(page, { ...wanted, gender: 'mens' }, index)).not.toBeNull();
    learnPageGenders(results, review, index);
    expect(reviewRefusal(page, { ...wanted, gender: 'mens' }, index)).toMatch(/page is for women, the product is for men/);
    expect(matchFragranticaChecked(page, { ...wanted, gender: 'mens' }, index)).toBeNull();
    expect(matchFragranticaChecked(page, { ...wanted, gender: 'womens' }, index)).not.toBeNull();
  });
});

describe('the rule for a product and a page', () => {
  const index = indexReview({
    ...blank(),
    pageGender: { 'B/Woman-1': 'women', 'B/Man-2': 'men', 'B/Both-3': 'unisex' },
  });
  const wanted = { brand: 'B', name: 'X', concentration: 'Eau de Parfum' };

  it('a product with a stated gender refuses the other gender\'s page and accepts its own and a shared one', () => {
    expect(reviewRefusal(U('B/Woman-1'), { ...wanted, gender: 'mens' }, index)).not.toBeNull();
    expect(reviewRefusal(U('B/Man-2'), { ...wanted, gender: 'womens' }, index)).not.toBeNull();
    expect(reviewRefusal(U('B/Man-2'), { ...wanted, gender: 'mens' }, index)).toBeNull();
    expect(reviewRefusal(U('B/Woman-1'), { ...wanted, gender: 'womens' }, index)).toBeNull();
    for (const g of ['mens', 'womens', 'unisex'] as const) expect(reviewRefusal(U('B/Both-3'), { ...wanted, gender: g }, index)).toBeNull();
  });

  it('a product with no stated gender accepts any page', () => {
    for (const g of [null, undefined] as const) {
      for (const p of ['B/Woman-1', 'B/Man-2', 'B/Both-3']) expect(reviewRefusal(U(p), { ...wanted, gender: g }, index)).toBeNull();
    }
  });

  it('a page whose gender is not known is accepted for any product', () => {
    expect(reviewRefusal(U('B/Unknown-9'), { ...wanted, gender: 'mens' }, index)).toBeNull();
  });

  it('a name shared by a men\'s and a women\'s product takes no single gender page, only a shared or unknown one', () => {
    expect(reviewRefusal(U('B/Woman-1'), { ...wanted, gender: 'both' }, index)).toMatch(/share this name/);
    expect(reviewRefusal(U('B/Man-2'), { ...wanted, gender: 'both' }, index)).toMatch(/share this name/);
    expect(reviewRefusal(U('B/Both-3'), { ...wanted, gender: 'both' }, index)).toBeNull();
    expect(reviewRefusal(U('B/Unknown-9'), { ...wanted, gender: 'both' }, index)).toBeNull();
  });

  it('sharedGender: both sexes make "both", a single sex outranks unisex, and silence stays silence', () => {
    expect(sharedGender(['mens', 'womens'])).toBe('both');
    expect(sharedGender(['mens', 'womens', 'unisex', null])).toBe('both');
    expect(sharedGender(['mens', 'unisex'])).toBe('mens');
    expect(sharedGender(['womens', null])).toBe('womens');
    expect(sharedGender(['unisex'])).toBe('unisex');
    expect(sharedGender([null, undefined])).toBeNull();
    expect(sharedGender([])).toBeNull();
  });
});

describe('merging a run\'s page genders onto the latest review', () => {
  const latest: FragranticaReview = {
    ...blank(),
    reviewedOn: '2026-10-06',
    wrong: [{ brand: 'X', name: 'Y', url: U('X/Y-1'), why: 'a person added this while the job ran' }],
    pageGender: { 'A/One-1': 'men', 'A/Two-2': 'women' },
  };
  const run: FragranticaReview = {
    ...blank(),
    reviewedOn: '2026-10-05',
    pageGender: { 'A/One-1': 'women', 'A/Three-3': 'unisex', 'A/Zero-0': 'men' },
  };

  it('keeps the latest file as it is and adds only the genders it lacks, in address order', () => {
    const merged = mergePageGenders(latest, run);
    expect(merged.reviewedOn).toBe('2026-10-06');
    expect(merged.wrong).toEqual(latest.wrong);
    expect(merged.pageGender).toEqual({ 'A/One-1': 'men', 'A/Two-2': 'women', 'A/Three-3': 'unisex', 'A/Zero-0': 'men' });
    expect(Object.keys(merged.pageGender)).toEqual(['A/One-1', 'A/Three-3', 'A/Two-2', 'A/Zero-0']);
  });

  it('adds nothing when the run learned nothing', () => {
    const merged = mergePageGenders(latest, blank());
    expect(merged.pageGender).toEqual(latest.pageGender);
  });

  it('scripts/merge-page-genders.ts does it to a file, and leaves a file with nothing to add untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fu-merge-'));
    const runFile = join(dir, 'run.json');
    const latestFile = join(dir, 'latest.json');
    writeFileSync(runFile, renderReview(run));
    writeFileSync(latestFile, renderReview(latest));
    const script = new URL('../scripts/merge-page-genders.ts', import.meta.url).pathname;
    const first = spawnSync('npx', ['tsx', script, runFile, latestFile], { encoding: 'utf8' });
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('2 added');
    expect(parseReview(readFileSync(latestFile, 'utf8')).pageGender).toEqual(mergePageGenders(latest, run).pageGender);
    const before = readFileSync(latestFile, 'utf8');
    const second = spawnSync('npx', ['tsx', script, runFile, latestFile], { encoding: 'utf8' });
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('0 added');
    expect(readFileSync(latestFile, 'utf8')).toBe(before);
  }, 60_000);
});

describe('the stored review and links', () => {
  const REVIEW_TEXT = read('data/fragrantica-link-review.json');
  const REVIEW_FILE = parseReview(REVIEW_TEXT);
  const REVIEW = indexReview(REVIEW_FILE);
  const LINKS = JSON.parse(read('data/fragrance-links.json')) as LinksFile;

  it('is written back exactly as it is stored: one space indent, genders in address order', () => {
    expect(renderReview(REVIEW_FILE)).toBe(REVIEW_TEXT);
  });

  it('knows who at least 209 pages are for (203 at the audit of 2026-10-05, 6 more read from their addresses), each one word', () => {
    const entries = Object.entries(REVIEW_FILE.pageGender);
    expect(entries.length).toBeGreaterThanOrEqual(209);
    for (const [path, g] of entries) {
      expect(['men', 'women', 'unisex'], path).toContain(g);
      expect(fragranticaPath(U(path)), path).toBe(path);
    }
  });

  it('agrees with the address wherever the address says who the page is for', () => {
    let checked = 0;
    for (const [path, g] of Object.entries(REVIEW_FILE.pageGender)) {
      const fromAddress = genderOfAddress(U(path));
      if (fromAddress === null) continue;
      checked++;
      expect(g, path).toBe(fromAddress);
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('holds every stored Fragrantica link to the gender of every product that shares its name', () => {
    const genders = new Map<string, Set<'mens' | 'womens' | 'unisex' | null | undefined>>();
    const sample = new Map<string, { brand: string; name: string; concentration: string }>();
    for (const e of CATALOGUE) {
      const key = fragranceLinkKey(e.brand, e.name, e.concentration);
      const set = genders.get(key) ?? new Set();
      set.add(e.gender);
      genders.set(key, set);
      sample.set(key, { brand: e.brand, name: e.name, concentration: e.concentration });
    }
    const bad: string[] = [];
    let checked = 0;
    for (const [key, e] of Object.entries(LINKS.entries)) {
      if (!e.fragrantica) continue;
      const s = sample.get(key);
      if (!s) continue;
      checked++;
      const gender = sharedGender(genders.get(key) ?? []);
      const why = reviewRefusal(e.fragrantica, { ...s, gender }, REVIEW);
      if (why) bad.push(`${key}: ${e.fragrantica} (${why})`);
    }
    expect(checked).toBeGreaterThan(300);
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('the daily workflow and the manifest', () => {
  const workflow = read('.github/workflows/fragrance-links-daily.yml');
  const manifest = read('scripts/generated-files.txt');

  it('commits the review beside the links, after merging the run\'s genders onto the latest file instead of copying it over', () => {
    expect(workflow).toContain('scripts/merge-page-genders.ts');
    const merge = workflow.indexOf('npx tsx scripts/merge-page-genders.ts');
    const reset = workflow.indexOf('git reset --hard');
    const commit = workflow.indexOf('./scripts/commit-and-push.sh');
    expect(reset).toBeGreaterThan(0);
    expect(merge).toBeGreaterThan(reset);
    expect(commit).toBeGreaterThan(merge);
    expect(workflow.slice(commit)).toContain('data/fragrantica-link-review.json');
    // The run's file is saved before the reset and never copied over the latest.
    expect(workflow).toMatch(/cp [^\n]*data\/fragrantica-link-review\.json[^\n]*"\$RUNNER_TEMP\/links\/"/);
    expect(workflow).not.toMatch(/cp "\$RUNNER_TEMP\/links\/fragrantica-link-review\.json" data\//);
  });

  it('lists the review as written by the job', () => {
    expect(manifest).toMatch(/^incoming\s+data\/fragrantica-link-review\.json\s/m);
  });
});
