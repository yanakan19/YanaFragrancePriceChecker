/**
 * Hands this build's hidden and removed brands and shops (dist-demo/site.json,
 * scripts/siteBuild.ts) to demo/siteData.ts under Node, as the `__psSite` the
 * page's <head> script sets in the browser. demo/siteData.ts then applies them
 * to the shared catalogue modules in place, exactly as the page does.
 *
 * A script that reads the catalogue imports, in this order and before anything
 * else that touches the data:
 *
 *   import './siteApply.js';
 *   import '../demo/siteData.js';
 *
 * Two imports, not one: a module's own imports run before its body, so this
 * file cannot import demo/siteData.ts itself and still set the value first.
 * With no dist-demo/site.json, or nothing in it, nothing changes.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSiteBuild } from './siteBuild.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = readSiteBuild(root);
(globalThis as { __psSite?: unknown }).__psSite = { stats: site.stats, overrides: site.overrides };
