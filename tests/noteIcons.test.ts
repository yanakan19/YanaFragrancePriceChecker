import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTE_INDEX } from '../demo/data.js';
import { noteMergeKey } from '../src/catalogue/noteName.js';

/**
 * The note icons (docs/NOTES-PAGE-PLAN.md section C, docs/NOTE-ICONS.md): one
 * small drawn SVG for each family of notes, under demo/note-icons/, listed in
 * data/note-icons-manifest.json. Nothing on the page uses them yet; these tests
 * keep the set clean, light and complete before the Notes tab does.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = resolve(root, 'demo/note-icons');
const groupDir = resolve(iconDir, 'groups');
const manifestPath = 'data/note-icons-manifest.json';

interface IconEntry {
  file: string;
  name: string;
  group: string;
  aliases: string[];
}
interface GroupEntry {
  id: string;
  name: string;
  file: string;
}
interface Manifest {
  status: 'partial' | 'complete';
  coveredTop: number;
  groups: GroupEntry[];
  icons: IconEntry[];
}

const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')) as Manifest;

/** The 16 groups of the notes plan (section B), in order. */
const GROUP_IDS = [
  'air-water',
  'citrus',
  'herbs-greens',
  'fruits',
  'flowers',
  'white-flowers',
  'spices',
  'sweet',
  'drinks',
  'woods',
  'earth-moss',
  'resins',
  'musk-amber',
  'leather-smoke',
  'modern',
  'more',
];

const MAX_BYTES = 2500;
const MAX_FOLDER_BYTES = 450 * 1024;
const TOP = 200;

const svgFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.svg')).sort() : [];
const read = (path: string): string => readFileSync(path, 'utf8');
const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Every svg this feature ships: [path relative to demo/note-icons, expected title]. */
function everySvg(): { rel: string; title: string }[] {
  return [
    ...manifest.icons.map((i) => ({ rel: i.file, title: i.name })),
    ...manifest.groups.map((g) => ({ rel: g.file, title: g.name })),
  ];
}

/** Balanced tags and nothing but elements, attributes and the one title: a cheap well-formedness check. */
function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    const [, close, tag, , selfClose] = m;
    if (selfClose) continue;
    if (close) {
      if (stack.pop() !== tag) return false;
    } else stack.push(tag!);
  }
  return stack.length === 0;
}

/**
 * The only group changes a shipped icon may have had (file to its new group). The owner approved the 16
 * groups on 9 Oct 2026 with tea and coffee in Sweet and Gourmand, not in Drinks
 * and Spirits (docs/NOTES-PAGE-PLAN.md section B). Add a line here only for an
 * owner decision, with its date.
 */
const APPROVED_GROUP_MOVES: Record<string, string> = {
  'coffee.svg': 'sweet',
  'tea.svg': 'sweet',
  'green-tea.svg': 'sweet',
  'mate.svg': 'sweet',
};

/**
 * The only icon aliases that moved from one icon to another, so that the icon
 * manifest agrees with data/note-aliases.json (a merged spelling must show its
 * canonical note's icon). Key: the spelling; value: the icon file that serves it now.
 */
const APPROVED_ALIAS_MOVES: Record<string, string> = {
  'Hay absolute': 'hay.svg',
  'Iris butter': 'orris.svg',
};

describe('note icon manifest', () => {
  it('has a file on disk for every entry, and every file is listed', () => {
    for (const { rel } of everySvg()) expect(existsSync(resolve(iconDir, rel)), rel).toBe(true);
    const listed = new Set(manifest.icons.map((i) => i.file));
    expect([...svgFiles(iconDir)].filter((f) => !listed.has(f))).toEqual([]);
    const listedGroups = new Set(manifest.groups.map((g) => g.file.replace(/^groups\//, '')));
    expect(svgFiles(groupDir).filter((f) => !listedGroups.has(f))).toEqual([]);
    // Nothing else lives in the folder.
    const other = readdirSync(iconDir).filter((f) => !f.endsWith('.svg') && f !== 'groups');
    expect(other).toEqual([]);
  });

  it('names each icon file after its display name, in lower case with hyphens', () => {
    for (const i of manifest.icons) expect(i.file, i.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.svg$/);
    const files = manifest.icons.map((i) => i.file);
    expect(new Set(files).size).toBe(files.length);
    for (const g of manifest.groups) expect(g.file).toBe(`groups/${g.id}.svg`);
  });

  it('puts every icon in one of the 16 groups, and lists the groups in the plan order', () => {
    for (const i of manifest.icons) expect(GROUP_IDS, `${i.name} group`).toContain(i.group);
    const ids = manifest.groups.map((g) => g.id);
    expect(ids).toEqual(GROUP_IDS.filter((id) => ids.includes(id)));
    if (manifest.status === 'complete') expect(ids).toEqual(GROUP_IDS);
  });

  it('lets no two icons claim the same note spelling', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const i of manifest.icons) {
      for (const spelling of [i.name, ...i.aliases]) {
        const key = noteMergeKey(spelling);
        expect(key, `${i.file}: "${spelling}" has no letters`).not.toBe('');
        const first = owner.get(key);
        if (first !== undefined && first !== i.file) clashes.push(`"${spelling}" is in ${first} and ${i.file}`);
        owner.set(key, i.file);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('keeps shipped entries: nothing is removed from HEAD, and its aliases only grow', () => {
    let before: Manifest;
    try {
      before = JSON.parse(
        execFileSync('git', ['show', `HEAD:${manifestPath}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
      ) as Manifest;
    } catch {
      return; // not committed yet, or no git history here
    }
    for (const old of before.icons) {
      const now = manifest.icons.find((i) => i.file === old.file);
      expect(now, `${old.file} was removed`).toBeDefined();
      expect(now!.name, old.file).toBe(old.name);
      expect(now!.group, old.file).toBe(APPROVED_GROUP_MOVES[old.file] ?? old.group);
      const kept = new Set(now!.aliases.map(noteMergeKey));
      for (const a of old.aliases) {
        const movedTo = APPROVED_ALIAS_MOVES[a];
        if (movedTo !== undefined) {
          const target = manifest.icons.find((i) => i.file === movedTo);
          expect(target?.aliases.map(noteMergeKey).includes(noteMergeKey(a)), `${a} should now be served by ${movedTo}`).toBe(true);
          continue;
        }
        expect(kept.has(noteMergeKey(a)), `${old.file} lost alias ${a}`).toBe(true);
      }
    }
    for (const g of before.groups) expect(manifest.groups.some((n) => n.id === g.id), g.id).toBe(true);
  });
});

describe('note icon files', () => {
  it('are small, standalone, flat SVGs with a title and a 100 by 100 box', () => {
    for (const { rel, title } of everySvg()) {
      const svg = read(resolve(iconDir, rel));
      expect(Buffer.byteLength(svg), `${rel} size`).toBeLessThanOrEqual(MAX_BYTES);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"'), `${rel} header`).toBe(true);
      expect(svg.match(/viewBox="/g)?.length, `${rel} viewBox count`).toBe(1);
      expect(svg.trimEnd().endsWith('</svg>'), `${rel} end`).toBe(true);
      expect(svg.match(/<title>([^<]*)<\/title>/)?.[1], `${rel} title`).toBe(escapeXml(title));
      expect(wellFormed(svg), `${rel} well formed`).toBe(true);
    }
  });

  it('have no script, link, text, picture, gradient or filter', () => {
    for (const { rel } of everySvg()) {
      const svg = read(resolve(iconDir, rel));
      const withoutNamespace = svg.replace('xmlns="http://www.w3.org/2000/svg"', '');
      expect(withoutNamespace, `${rel} http`).not.toMatch(/https?:|\/\//i);
      expect(svg, `${rel} href`).not.toMatch(/href|xlink|<script|\son[a-z]+=|javascript:|<style|style=/i);
      expect(svg, `${rel} element`).not.toMatch(
        /<(text|tspan|image|foreignObject|use|symbol|defs|linearGradient|radialGradient|filter|mask|clipPath|pattern|animate|set|a|iframe|font)[\s>/]/i,
      );
      expect(svg, `${rel} font`).not.toMatch(/font-|url\(|data:/i);
    }
  });

  it('avoid pure black and, except as a see through highlight, pure white', () => {
    for (const { rel } of everySvg()) {
      const svg = read(resolve(iconDir, rel));
      for (const tag of svg.match(/<[a-z][^>]*>/g) ?? []) {
        const paint = tag.match(/(?:fill|stroke)="(#[0-9a-f]{3,6}|black|white)"/gi) ?? [];
        for (const p of paint) {
          const v = p.slice(p.indexOf('"') + 1, -1).toLowerCase();
          expect(['#000', '#000000', 'black'], `${rel} pure black`).not.toContain(v);
          if (['#fff', '#ffffff', 'white'].includes(v)) expect(tag, `${rel} opaque pure white`).toMatch(/opacity=/);
        }
      }
    }
  });

  it('stay under the folder budget', () => {
    let total = 0;
    for (const dir of [iconDir, groupDir]) for (const f of svgFiles(dir)) total += statSync(resolve(dir, f)).size;
    expect(total).toBeLessThanOrEqual(MAX_FOLDER_BYTES);
  });
});

describe('note icon coverage of the catalogue', () => {
  const owner = new Map<string, string>();
  for (const i of manifest.icons) for (const s of [i.name, ...i.aliases]) owner.set(noteMergeKey(s), i.file);

  /** Notes by number of products, commonest first; computed from the catalogue, not written down. */
  const ranked = [...NOTE_INDEX].sort((a, b) => b.count - a.count || a.sort.localeCompare(b.sort));
  const iconFor = (name: string): string | undefined => owner.get(noteMergeKey(name));

  it('gives every one of the top 200 notes an icon or an alias, once the set is complete', () => {
    const top = ranked.slice(0, TOP);
    const cutoff = top[top.length - 1]!.count;
    const wanted = ranked.filter((n) => n.count >= cutoff); // a tie at the edge counts in
    const missing = wanted.filter((n) => iconFor(n.name) === undefined).map((n) => `${n.name} (${n.count})`);
    if (manifest.status === 'complete') expect(missing).toEqual([]);
    else {
      // While the set is being drawn, the manifest says how far down the list it has got and that must be true.
      const covered = ranked.findIndex((n) => iconFor(n.name) === undefined);
      expect(manifest.coveredTop, 'coveredTop is what the notes list really covers').toBeLessThanOrEqual(
        covered === -1 ? ranked.length : covered,
      );
    }
  });

  it('records a complete set only when it covers at least the top 200', () => {
    if (manifest.status === 'complete') {
      expect(manifest.coveredTop).toBeGreaterThanOrEqual(TOP);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(150);
    }
  });

  it('covers most of the note uses in the catalogue', () => {
    if (manifest.status !== 'complete') return;
    let all = 0;
    let covered = 0;
    for (const n of NOTE_INDEX) {
      all += n.count;
      if (iconFor(n.name) !== undefined) covered += n.count;
    }
    expect(covered / all).toBeGreaterThan(0.8);
  });
});
