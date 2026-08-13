import type { Retailer, ShippingSource } from '../types/retailer.js';

/**
 * Turning what a delivery page said into a change to the registry — or, far
 * more often, into a refusal to change it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `shipping.confidence` is populated on every retailer and has only ever been
 * moved by hand. Nothing in the pipeline could promote it, so a shop whose
 * delivery page had been read and agreed with the registry stayed marked
 * `unverified` indefinitely, and the site went on hedging about a figure it had
 * in fact confirmed. Twenty-two enabled shops are in that state.
 *
 * ── The line this draws, and why it is where it is ───────────────────────────
 * Confirming a figure the registry already holds changes no price on the site.
 * Introducing a figure the registry does not hold changes what shoppers are
 * told to pay. Those are different acts and they get different rules:
 *
 *   - agreement → written automatically. The page says £3.95, the registry says
 *     £3.95, so `confirmed` is simply true and recording it is bookkeeping.
 *   - absence → written automatically. The page states delivery terms in detail
 *     and names no flat rate, and the registry already holds null. Recording
 *     *that we checked* changes nothing a shopper is charged; it changes what
 *     the site is entitled to say about why the figure is missing.
 *   - a new figure → never written. Reported with its sentence for a human, the
 *     way this tool has always worked. A wrong-low delivery charge makes a shop
 *     win the delivered-price sort it should have lost, which is the most
 *     damaging error this app can make, and no amount of regex confidence earns
 *     the right to make it unattended.
 *   - disagreement → never written, and reported loudly. The registry says
 *     £3.95, the page says £4.95: one of them is wrong and a machine picking
 *     between them is exactly the wrong answer.
 *
 * Every write carries `source`: the URL, the sentence, the date. A figure whose
 * source cannot be recorded does not get written.
 */

/** What the discovery run learned from one shop's own delivery page. */
export interface PageEvidence {
  /** The URL actually fetched. */
  url: string;
  /** Rate read off it, or null when none qualified. */
  standardGbp: number | null;
  /** Threshold read off it, or null when none qualified. */
  freeOverGbp: number | null;
  /** Reasons the reading is not clean. Any entry blocks every write. */
  caveats: string[];
  /** The page names delivery terms and no flat standard rate at all. */
  standardRateNotStated: boolean;
  /** The sentence a written figure is quoted from. */
  quote: string;
}

export type PatchAction =
  /** The page agrees with what the registry already holds. Promote it. */
  | 'confirm-rate'
  /** The page states terms and publishes no rate, as the registry already says. */
  | 'confirm-absence'
  /** A clean figure the registry does not hold. For a human, never written. */
  | 'propose-rate'
  /** Page and registry name different figures. For a human, urgently. */
  | 'disagrees'
  /** Nothing usable, or something ambiguous. No action. */
  | 'no-action';

export interface ShippingPatch {
  retailerId: string;
  action: PatchAction;
  /** One line for the run log and the report. */
  detail: string;
  /** Present only for the two actions that are written. */
  write: {
    confidence: 'confirmed';
    verifiedAt: string;
    source: ShippingSource;
    standardRateNotPublished?: true;
  } | null;
}

/** Sentences get quoted into a TypeScript source file, so they are bounded and
 *  escaped here rather than at the point of writing. */
export function sanitiseQuote(raw: string, maxLength = 180): string {
  const flat = raw
    // Control characters would land inside a quoted string in a .ts file.
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length <= maxLength ? flat : `${flat.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

/** Decide what, if anything, this evidence entitles us to change. */
export function proposeShippingUpdate(
  retailer: Retailer,
  evidence: PageEvidence,
  today: string,
): ShippingPatch {
  const stored = retailer.shipping;
  const none = (action: PatchAction, detail: string): ShippingPatch => ({
    retailerId: retailer.id,
    action,
    detail,
    write: null,
  });

  if (evidence.caveats.length > 0) {
    return none('no-action', `page is ambiguous: ${evidence.caveats.join('; ')}`);
  }

  const source: ShippingSource = {
    url: evidence.url,
    quote: sanitiseQuote(evidence.quote),
    readAt: today,
  };

  if (evidence.standardGbp !== null) {
    if (stored.standardGbp === null) {
      return none(
        'propose-rate',
        `page states £${evidence.standardGbp.toFixed(2)} and the registry holds no rate — ` +
          `a human sets a first figure, never this tool: "${sanitiseQuote(evidence.quote)}" (${evidence.url})`,
      );
    }
    if (Math.abs(stored.standardGbp - evidence.standardGbp) > 0.001) {
      return none(
        'disagrees',
        `registry holds £${stored.standardGbp.toFixed(2)}, page states £${evidence.standardGbp.toFixed(2)} — ` +
          `one of them is wrong: "${sanitiseQuote(evidence.quote)}" (${evidence.url})`,
      );
    }
    // The rate agrees. The threshold has to as well, because a rule confirmed
    // with the wrong threshold is a rule that charges the wrong amount on every
    // basket near it — and "the page did not mention a threshold" is not
    // evidence that the shop has none.
    if (evidence.freeOverGbp !== null && stored.freeOverGbp !== evidence.freeOverGbp) {
      return none(
        'disagrees',
        `rate agrees at £${evidence.standardGbp.toFixed(2)} but the free-delivery threshold does not: ` +
          `registry ${stored.freeOverGbp === null ? 'none' : `£${stored.freeOverGbp.toFixed(2)}`}, ` +
          `page £${evidence.freeOverGbp.toFixed(2)} (${evidence.url})`,
      );
    }
    if (evidence.freeOverGbp === null && stored.freeOverGbp !== null) {
      return none(
        'no-action',
        `rate agrees at £${evidence.standardGbp.toFixed(2)} but the page never states the ` +
          `£${stored.freeOverGbp.toFixed(2)} free-delivery threshold the registry holds — ` +
          `confirming half a rule would overstate what was read`,
      );
    }
    return {
      retailerId: retailer.id,
      action: 'confirm-rate',
      detail:
        `page confirms £${evidence.standardGbp.toFixed(2)}` +
        `${evidence.freeOverGbp !== null ? `, free over £${evidence.freeOverGbp.toFixed(2)}` : ''} ` +
        `(${evidence.url})`,
      write: { confidence: 'confirmed', verifiedAt: today, source },
    };
  }

  if (evidence.standardRateNotStated) {
    if (stored.standardGbp !== null) {
      return none(
        'disagrees',
        `registry holds £${stored.standardGbp.toFixed(2)} but this page states delivery terms and ` +
          `names no flat rate — the stored figure may have come from somewhere that no longer says it (${evidence.url})`,
      );
    }
    if (evidence.freeOverGbp !== null && stored.freeOverGbp !== null && evidence.freeOverGbp !== stored.freeOverGbp) {
      return none(
        'disagrees',
        `no rate published, but the free-delivery threshold moved: registry £${stored.freeOverGbp.toFixed(2)}, ` +
          `page £${evidence.freeOverGbp.toFixed(2)} (${evidence.url})`,
      );
    }
    return {
      retailerId: retailer.id,
      action: 'confirm-absence',
      detail: `page states delivery terms and publishes no standard rate (${evidence.url})`,
      write: {
        confidence: 'confirmed',
        verifiedAt: today,
        source,
        standardRateNotPublished: true,
      },
    };
  }

  return none('no-action', `nothing conclusive on ${evidence.url}`);
}

/**
 * Rewrite one retailer's `shipping` block in the registry source.
 *
 * Text surgery rather than a code transform, deliberately: `src/config/
 * retailers.ts` is 2,300 lines of hand-written comments explaining every
 * figure in it, and those comments are the most valuable thing in the file.
 * Anything that parsed and re-printed it would flatten them. This finds one
 * block, changes at most four lines inside it, and leaves every byte outside
 * untouched.
 *
 * Throws rather than guessing whenever the shape is not what it expects — a
 * silent no-op would leave CI reporting a promotion that never happened.
 */
export function applyShippingPatch(
  source: string,
  retailerId: string,
  write: NonNullable<ShippingPatch['write']>,
): string {
  const idAt = source.indexOf(`id: '${retailerId}'`);
  if (idAt === -1) throw new Error(`retailer ${retailerId}: no \`id: '${retailerId}'\` in the registry`);

  const shippingAt = source.indexOf('shipping: {', idAt);
  if (shippingAt === -1) throw new Error(`retailer ${retailerId}: no shipping block after its id`);

  // Brace matching from the block's own opening brace. Strings inside these
  // blocks are ordinary quoted prose and never contain unbalanced braces, but
  // the end is verified below by re-reading what was captured.
  const open = source.indexOf('{', shippingAt);
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) throw new Error(`retailer ${retailerId}: unterminated shipping block`);

  const block = source.slice(open, close + 1);

  const verifiedLine = /^([ \t]*)verifiedAt:\s*'[^']*',/m.exec(block);
  if (!verifiedLine) throw new Error(`retailer ${retailerId}: shipping block has no verifiedAt line`);
  const indent = verifiedLine[1]!;

  let next = block
    .replace(/^([ \t]*)verifiedAt:\s*'[^']*',/m, `$1verifiedAt: '${write.verifiedAt}',`)
    .replace(/^([ \t]*)confidence:\s*'[^']*',/m, `$1confidence: '${write.confidence}',`);

  if (!/^[ \t]*confidence: 'confirmed',/m.test(next)) {
    throw new Error(`retailer ${retailerId}: shipping block has no confidence line`);
  }

  const sourceLines =
    `${indent}source: {\n` +
    `${indent}  url: '${escapeSingle(write.source.url)}',\n` +
    `${indent}  quote: '${escapeSingle(write.source.quote)}',\n` +
    `${indent}  readAt: '${write.source.readAt}',\n` +
    `${indent}},\n`;

  // Replace an existing source block rather than stacking a second one.
  next = next.replace(new RegExp(`^${indent}source: \\{[\\s\\S]*?^${indent}\\},\\n`, 'm'), '');
  next = next.replace(/^([ \t]*)standardRateNotPublished:\s*(?:true|false),\n/m, '');

  const insertAfter = /^[ \t]*confidence: 'confirmed',\n/m.exec(next)!;
  const at = insertAfter.index + insertAfter[0].length;
  const flag = write.standardRateNotPublished ? `${indent}standardRateNotPublished: true,\n` : '';
  next = next.slice(0, at) + flag + sourceLines + next.slice(at);

  return source.slice(0, open) + next + source.slice(close + 1);
}

function escapeSingle(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
