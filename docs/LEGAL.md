# Legal pages

Five pages live in the footer: **How it works**, **Affiliate disclosure**,
**Privacy notice**, **Terms of use**, **Contact & feedback**.

They live in one place, [`demo/legal.ts`](../demo/legal.ts), rather than being
duplicated as markdown here — two copies of a privacy notice will drift, and the
one that drifts is always the one nobody reads.

> **Written for what is actually true today, not a template.** PriceSniffs is
> run by one person (YannySniffs) trading under that name, not a registered
> company — so there is no company number, registered office or ICO number to
> state, and the pages say that rather than filling the gap with an invented
> one. If that changes (incorporation, an ICO registration, a real office
> address), update `COMPANY` in `demo/legal.ts` and the paragraphs that
> currently explain their absence. These still are not a substitute for a
> solicitor's review before anything with real regulatory exposure (the
> affiliate disclosure, the privacy notice) is relied on at scale.

All contact addresses across the pages are the one real inbox,
`yannysniffs@gmail.com`. A data request must be answered within one month, so
that inbox has to actually be checked.

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
