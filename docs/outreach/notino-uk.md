# Notino: affiliate application and permission request (draft, not sent)

Drafted 2026-10-03, refreshed 2026-10-08 for the owner. Nothing has been sent.
The full plan is `docs/NOTINO-PLAN.md`; this file is the owner's part of it.

## Do this first: CJ Affiliate (Notino UK, run by VIVnetworks)

Notino UK's programme runs on **CJ Affiliate**, managed by VIVnetworks
(Publicis Groupe), whose own catalogue page,
https://www.vivnetworks.com/en/affiliate-catalog/notinocom/, lists
"XML feed: yes" (read 2026-09-10). Notino is not on Awin.

Steps for the owner (also in `docs/OWNER-STEPS.md` and `docs/NOTINO-PLAN.md`):

1. Make a free publisher account at cj.com with https://pricesniffs.space as
   the site and "price comparison" as the promotional method.
2. In CJ, search for "Notino UK" and apply. VIVnetworks decides by hand; it
   can take weeks, and a small site may be held.
3. When accepted, ask for the product feed and tell an agent your CJ
   publisher id (never a password or token). A CJ feed reader is built then,
   against the real file.

## In parallel: the permission email

Send it the same day; it costs nothing. Notino's own robots.txt already
allows our crawler on `/fragrance/`, product pages and the sitemap; it is
Cloudflare's challenge in front of them that turns us away.

**Where to send it:** the contact page, https://www.notino.co.uk/contact
(from a web search; notino.co.uk answers our requests with a Cloudflare
challenge). Open it in an ordinary browser and use the form it offers. No
press or partnerships page was found.

Replace [YOUR NAME] before sending.

    Subject: Permission to show Notino prices on PriceSniffs

    Hello,

    My name is [YOUR NAME] and I run PriceSniffs (https://pricesniffs.space), a free UK price comparison site for fragrance.

    PriceSniffs shows what a bottle costs at each UK shop that sells it, with delivery included, so a shopper sees the real total before they click. Every listing links straight to the shop's own product page, where the sale happens. We never change a shop's price, and if we cannot keep a price current we take it off the site rather than show an old one.

    We would like to include Notino UK. Your robots.txt allows crawlers on your fragrance pages, but at the moment our requests are turned away by your website's security (a Cloudflare challenge), and we respect that, so we have stopped trying.

    Would you be willing to let our crawler, which identifies itself as PriceSniffsBot and follows robots.txt, read your public product prices at a gentle rate? Or, if you prefer, would you share a product data feed with prices, stock and product links? If you already supply a feed to comparison sites, we would be glad to receive it on the same terms. We are also applying to your programme on CJ.

    Whichever suits you, we will follow any conditions you set, such as how often we check or which pages we use. I would be glad to answer any questions.

    Kind regards,

    [YOUR NAME]
    PriceSniffs
    https://pricesniffs.space
