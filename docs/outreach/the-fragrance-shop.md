# The Fragrance Shop: affiliate application and permission request (draft, not sent)

Drafted 2026-10-03, refreshed 2026-10-08 for the owner. Nothing has been sent.

Email rewritten 2026-10-08 (second pass): shorter, with tracked links offered,
the crawler's details and a contact address. Send it on the same day as the
affiliate application it mentions. Routes and odds for every shop:
`docs/BLOCKED-SHOPS-ROUTES-2026-10-08.md`.

## Do this first: the Rakuten Advertising programme

The lawful route with a product feed is the shop's own affiliate programme.
Its affiliates page, https://www.thefragranceshop.co.uk/affiliates (read on
2026-10-08 through a search engine extract, because the domain answers our
requests with a Cloudflare challenge), says:

- join Rakuten Advertising as a publisher (free), then
- search for "The Fragrance Shop" or advertiser ID **43488** and apply;
- the programme offers "a fully automated daily product feed".

Steps for the owner:

1. Open https://www.thefragranceshop.co.uk/affiliates in an ordinary browser
   and confirm the Rakuten link and ID 43488.
2. Sign up as a publisher at Rakuten Advertising (UK) with
   https://pricesniffs.space as the site.
3. Apply to The Fragrance Shop (43488). In the application, say that
   PriceSniffs is a UK fragrance price comparison site and ask for access to
   the Product Catalog feed (Rakuten delivers it by SFTP, as XML or pipe
   delimited text, once Rakuten and the advertiser have both approved).
4. Tell an agent when it is approved. The registry entry then becomes
   `adapter: 'affiliate-feed'` with Rakuten's deeplink, and a Rakuten feed
   reader is built (only an Awin one exists today).

Aggregator listings show The Fragrance Shop's Awin programme closed and its
Webgains programme closing, so do not apply there.

## The permission email, the same day

Send it the same day as the Rakuten application: it mentions the application,
and it also asks the crawler question, which the application does not.

**Where to send it:** `affiliates@thefragranceshop.co.uk`, the address a
search engine's extract of the affiliates page gives (2026-10-08; not
confirmed live, because the shop refuses our requests). Check it on
https://www.thefragranceshop.co.uk/affiliates in an ordinary browser first.
The shop has an in house affiliate team (it advertises an Affiliate and
Partnerships Manager role), so this is the right desk for both the feed and
the crawler question. Otherwise use the Contact us link in the page footer, or
the Rakuten programme contact.

Replace [YOUR NAME] before sending.

    Subject: The Fragrance Shop on PriceSniffs: a product feed, or permission for our crawler

    Hello,

    I run PriceSniffs (https://pricesniffs.space), an independent UK fragrance price comparison site. For each perfume it shows the price at every UK shop that sells it, delivery included, and every listing links straight to the shop's own product page. It lists about 26,000 products from more than 45 UK shops.

    We would like to list The Fragrance Shop. At the moment your website's security turns our crawler away (a Cloudflare challenge, robots.txt included). We respect that and have stopped asking.

    Either of these would let us send you shoppers with current prices:

    1. Your daily product feed through your Rakuten Advertising programme (ID 43488), which we are applying to, so every sale we send you is tracked to you.

    2. Permission for our crawler to read your public product pages. It names itself on every request as "PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)", reads robots.txt first and obeys it, asks one page at a time at least a second apart, a few times a day, and never logs in or fills a basket. It runs on cloud servers without fixed addresses; if your team needs more than the user agent to recognise it, tell us what you accept (for example signed requests under Web Bot Auth) and we will look at setting it up.

    What you get: free listings, tracked links that send buyers only to your own pages, and prices we take down rather than show out of date. We will follow any conditions you set (which pages, how often, removal on request).

    Kind regards,

    [YOUR NAME]
    PriceSniffs, https://pricesniffs.space
    yannysniffs@gmail.com
