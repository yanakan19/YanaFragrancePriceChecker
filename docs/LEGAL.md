# Legal pages

Seven pages live in the footer: **How it works**, **Affiliate disclosure**,
**Privacy notice**, **Cookies and storage**, **Refunds and returns**,
**Terms of use**, **Contact & feedback**. Cookies and Refunds were added on
2026-09-06 in the compliance review recorded at the end of this file.

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
- **What leaves the browser is named.** Three things do, each only on the
  reader's own action: Virtual Yanny chat messages (to the Fly.io backend,
  onward to FreeLLMAPI, stored by neither), account details (Supabase), and
  email. The notice names all three and the processors behind them. Adding a
  fourth means revisiting the notice *before* it ships, not after — the chat
  went live on 2026-08-13 and the notice still said nothing left the browser
  until 2026-09-06.
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

## Compliance review, 2026-09-06

Worked through against UK law as it applies to a UK site run from the UK:
UK GDPR and the DPA 2018, PECR regulation 6, the E-Commerce Regulations 2002
and Provision of Services Regulations 2009, the CAP Code, and consumer law
(which applies to the shops, not to this site). What was found and done:

- **Cookie banner: deliberately none.** The site sets no cookies. Every
  browser-storage key it writes is listed on the cookies page and is written
  only on an action that asks for it (choosing a theme, sending a chat
  message, signing in). The one third-party script, Trustpilot's widget, no
  longer loads on page view: a button on the shop's page says what it will
  fetch and fetches it only when pressed. A banner would be consenting to
  nothing. If analytics or on-site affiliate tracking is ever added, consent
  must be asked for *before* it is set.
- **Disclosure before the click: done.** Every offer row for a shop whose
  programme is live carries an "Affiliate link" marker beside the shop's
  name, decided from the same registry field the disclosure page computes
  its list from, and the link carries `rel="sponsored"`. The footer states
  it on every screen. The disclosure page had said "no affiliate programme
  is running yet" for weeks after six were; it is now computed.
- **Consent at the point of collection.** The sign-up form now says what is
  stored, by whom, and which terms apply; both mailto forms say what happens
  to a message; the chat header says where a message goes and not to include
  personal details.
- **Claims.** The home page's "The only tool you need to find the best price
  on any fragrance" and "Real and Live Prices" were replaced with sentences
  the site can support. Ratings shown are each shop's own published rating,
  and the How It Works page now says so; there are no reviews of any other
  kind on the site, so nothing to remove.
- **Accessibility.** axe-core (`npm run a11y`, and tests/accessibility.test.ts
  as the gate) found no contrast, alt-text or labelling failures in either
  palette; both palettes are pinned at WCAG AA by tests/paletteContrast.test.ts.
  The three structural findings — no h1, the quick search outside any
  landmark, a scroll region with no keyboard access — are fixed.

## Still needs the owner

None of these can be settled from inside the repo, and the pages say so in
words rather than inventing a value:

- **A geographic address.** Regulation 6 of the E-Commerce Regulations 2002
  requires one of a UK service provider. `COMPANY.postalAddress` is `null`
  and the terms and contact pages say it is not yet published. A service
  address is acceptable. Set it and the sentence disappears.
- ~~**The operator's name.**~~ Published 2026-09-06 (`COMPANY.operator`).
  The address was deliberately left `null` at the same time rather than
  filled with a placeholder: an invented geographic address on a legal page
  is a false statement of a fact the regulations require to be true, and
  the honest "not yet published" sentence is the lesser risk until a real
  one is supplied.
- **ICO registration.** Accounts hold email addresses, which may take the
  site outside the fee exemptions. Run the ICO's self-assessment; if a fee is
  due, pay it and set `COMPANY.icoRegistration`.
- **Jurisdiction.** Everything above assumes the UK. If the site is marketed
  to EU visitors as such, EU GDPR applies alongside UK GDPR and an EU
  representative may be needed; the notice already tells EU readers their
  rights are the same.
- **Image licensing** remains the owner's standing decision: 13 of the 14
  shops whose photographs appear are hot-linked without a licence, on the
  terms the site states and with an opt-out offered. That is a known risk,
  not a bug, and only a licence or a decision to stop changes it.
- **A solicitor's read** of the privacy notice and terms before the site is
  relied on at any scale. These pages are accurate; they are not advice.
