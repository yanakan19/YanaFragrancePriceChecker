# Legal pages — what still needs doing

Five pages are drafted and live in the footer: **How it works**, **Affiliate
disclosure**, **Privacy notice**, **Terms of use**, **Contact & feedback**.

They live in one place, [`demo/legal.ts`](../demo/legal.ts), rather than being
duplicated as markdown here — two copies of a privacy notice will drift, and the
one that drifts is always the one nobody reads.

> **These are drafts, not legal advice, and no solicitor has seen them.** They
> are a starting point that covers the right ground for a UK price comparison
> site. Get them reviewed before launch — the affiliate disclosure and privacy
> notice are the two with real regulatory exposure.

## Before the site goes live

Every `[SQUARE BRACKET]` in `demo/legal.ts` is a placeholder. Publishing with
them intact is worse than having no policy, because a privacy notice naming a
company that does not exist is itself a UK GDPR failure.

| Placeholder | What it needs |
|---|---|
| `[REGISTERED COMPANY NAME]` | Your registered company name, or trading name if you are a sole trader |
| `[COMPANY NUMBER]` | Companies House number (omit the whole line if not incorporated) |
| `[REGISTERED OFFICE ADDRESS]` | A real correspondence address — required on a privacy notice |
| `[ICO REGISTRATION NUMBER]` | Most UK organisations processing personal data must register with the ICO and pay the annual data protection fee. Check at [ico.org.uk](https://ico.org.uk) |
| `[HOSTING PROVIDER]` | Whoever ends up hosting — they are a processor and must be named |
| `[RETENTION PERIOD]` | How long you keep logs and correspondence. 90 days for logs is a common, defensible answer |

Also replace the three `@pricesniffs.example` addresses with mailboxes someone
actually monitors. A data request must be answered within one month, so
`privacy@` cannot be a black hole.

## Things the drafts commit you to

Worth reading before you sign these off, because the code currently backs them
up and both should stay true:

- **Ranking is never for sale.** The affiliate disclosure states that commission
  does not affect result order, and `buildComparison` sorts on stock and price
  only. If a paid placement is ever added it has to sit outside the results and
  be labelled advertising, or the disclosure becomes false.
- **No account, no payment data.** The privacy notice says so, and it is
  currently true. Adding accounts means revisiting the notice.
- **Prices are indicative.** The terms lean on this, and the UI backs it by
  showing when each price was checked. Keep the timestamp visible.
- **Product images are other people's photographs.** The terms used to claim
  they were "our own drawings", written when the only art on the site was the
  generated placeholder. That stopped being true the moment Fragrance Click's
  licensed feed imagery went in, and again when the Armaf and French Avenue
  house catalogues arrived with the houses' own photography — so the clause was
  rewritten to describe what actually happens: the retailer's or brand's own
  photograph, hot-linked from their servers, never copied or altered, and only
  shown where the programme has confirmed we may.
  The rule that replaced it: an image is displayed only when its retailer
  records an `imageBasis` naming the grounds. Three are in use — `affiliate-terms`
  (Fragrance Click, whose creative terms were read), `own-storefront` (the
  direct house catalogues), and `hotlink-unlicensed` (the four crawled shops,
  on the owner's decision, referenced from their servers and never copied).
  The terms page describes all three plainly and offers any retailer an opt out.
  Adding a fourth basis, or changing what any of them means, means revisiting
  that clause again — it has already gone stale once.

## Still open

- **Cookie banner.** Not built. Strictly-necessary cookies do not need consent,
  but the moment analytics or affiliate tracking is added, a consent mechanism is
  required *before* those cookies are set — not a banner that fires them anyway.
- **Disclosure before the click.** CAP requires affiliate relationships to be
  clear before a user clicks out, not only in a footer policy. The footer line
  covers it for now; once links are monetised, put it near the results too.
