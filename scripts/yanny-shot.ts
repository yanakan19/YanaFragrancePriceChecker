/**
 * Opens the built demo, asks Virtual Yanny a question, and screenshots the
 * panel — so a change to the chat can be looked at rather than argued about.
 *
 *   npm run demo
 *   npx tsx scripts/yanny-shot.ts "how much is bleu de channel edp" [out.png]
 *
 * Uses the pinned Chromium the way scripts/screenshot.ts does; the
 * catalogue path needs no network, so this works in the sandbox.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const question = process.argv[2] ?? 'how much is bleu de channel edp';
const out = process.argv[3] ?? 'yanny-shot.png';
const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const browser = await chromium.launch(existsSync(executablePath) ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
const url = pathToFileURL(resolve('demo/index.html')).href;
await page.goto(url, { waitUntil: 'load' });
await page.click('#yanny-launcher');
await page.waitForSelector('#yanny-input');
const t = Date.now();
await page.fill('#yanny-input', question);
await page.press('#yanny-input', 'Enter');
await page.waitForSelector('.yanny-msg.bot', { timeout: 20_000 });
const ms = Date.now() - t;
const answer = await page.$eval('.yanny-msg.bot', (el) => el.textContent);
const source = await page.$eval('.yanny-source', (el) => el.textContent).catch(() => '');
await page.screenshot({ path: out });
console.log(`answered in ${ms}ms\n${answer}\n[${source}]\nwrote ${out}`);
await browser.close();
