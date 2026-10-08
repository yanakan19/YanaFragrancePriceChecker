# Notino: affiliate application and permission request (draft, not sent)

Drafted 2026-10-03, refreshed 2026-10-08 for the owner. Nothing has been sent.
The full plan is `docs/NOTINO-PLAN.md`; this file is the owner's part of it.

Email rewritten 2026-10-08 (second pass): shorter, with tracked links offered,
the crawler's details and a contact address. Send it on the same day as the
affiliate application it mentions. Routes and odds for every shop:
`docs/BLOCKED-SHOPS-ROUTES-2026-10-08.md`.

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

    Subject: Notino UK on PriceSniffs: a product feed, or permission for our crawler

    Hello,

    I run PriceSniffs (https://pricesniffs.space), an independent UK fragrance price comparison site. For each perfume it shows the price at every UK shop that sells it, delivery included, and every listing links straight to the shop's own product page. It lists about 26,000 products from more than 45 UK shops.

    We would like to list Notino UK. Your robots.txt allows crawlers on your fragrance pages, but your website's security turns our requests away (a Cloudflare challenge). We respect that and have stopped asking.

    Either of these would let us send you shoppers with current prices:

    1. Your product feed through your CJ programme (Notino UK), which we are applying to, so every sale we send you is tracked to you. If you already supply a feed to comparison sites, we would be glad to receive it on the same terms.

    2. Permission for our crawler to read your public product pages. It names itself on every request as "PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)", reads robots.txt first and obeys it, asks one page at a time at least a second apart, a few times a day, and never logs in or fills a basket. It runs on cloud servers without fixed addresses; if your team needs more than the user agent to recognise it, tell us what you accept (for example signed requests under Web Bot Auth) and we will look at setting it up.

    What you get: free listings, tracked links that send buyers only to your own pages, and prices we take down rather than show out of date. We will follow any conditions you set (which pages, how often, removal on request).

    Kind regards,

    [YOUR NAME]
    PriceSniffs, https://pricesniffs.space
    yannysniffs@gmail.com
