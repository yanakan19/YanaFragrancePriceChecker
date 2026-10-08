# The Perfume Shop: affiliate application and permission request (draft, not sent)

Drafted 2026-10-03, refreshed 2026-10-08 for the owner. Nothing has been sent.

Email rewritten 2026-10-08 (second pass): shorter, with tracked links offered,
the crawler's details and a contact address. Send it on the same day as the
affiliate application it mentions. Routes and odds for every shop:
`docs/BLOCKED-SHOPS-ROUTES-2026-10-08.md`.

## Do this first: the shop's affiliate programme

The Perfume Shop runs an affiliate programme from its own page,
https://www.theperfumeshop.com/affiliates (30 day cookie, CPA on confirmed
sales, offers from its affiliate team). We cannot read that page: the whole
domain answers our requests with an Akamai "Access Denied". Which network
hosts it today is not confirmed:

- Tradedoubler announced itself the exclusive network from December 2018;
  aggregator listings now show that programme closed, and the Awin one too.
- affi.io lists a Rakuten Advertising programme for Great Britain as open,
  and affsignal lists Rakuten Advertising for the shop.

Steps for the owner:

1. Open https://www.theperfumeshop.com/affiliates in an ordinary browser and
   note the network its join link goes to.
2. If it is Rakuten Advertising, use the publisher account made for The
   Fragrance Shop (`docs/outreach/the-fragrance-shop.md`), search for
   "The Perfume Shop" and apply, asking for Product Catalog feed access.
3. If it is another network, apply there and ask for the product feed.
4. Tell an agent the network, the advertiser ID and the outcome; the registry
   entry records it and a feed reader is built for that network if needed.

## The permission email, the same day

Send it the same day as the affiliate application: it mentions the application
and also asks the crawler question, which the application does not.

**Where to send it:** the customer service page,
https://theperfumeshop.com/customer-service (from a web search; we could not
open it). Open it in an ordinary browser and use the email or contact form it
offers. No press or partnerships page was found. The Perfume Shop is an
AS Watson brand, like Superdrug, and both domains answer us with the same
Akamai deny, so one yes from the group's e-commerce team could cover both.

Replace [YOUR NAME] before sending.

    Subject: The Perfume Shop on PriceSniffs: a product feed, or permission for our crawler

    Hello,

    I run PriceSniffs (https://pricesniffs.space), an independent UK fragrance price comparison site. For each perfume it shows the price at every UK shop that sells it, delivery included, and every listing links straight to the shop's own product page. It lists about 26,000 products from more than 45 UK shops.

    We would like to list The Perfume Shop. At the moment your website's security turns our crawler away ("Access Denied", robots.txt included). We respect that and have stopped asking.

    Either of these would let us send you shoppers with current prices:

    1. A product feed with prices, stock and product links through your affiliate programme, which we are applying to, so every sale we send you is tracked to you.

    2. Permission for our crawler to read your public product pages. It names itself on every request as "PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)", reads robots.txt first and obeys it, asks one page at a time at least a second apart, a few times a day, and never logs in or fills a basket. It runs on cloud servers without fixed addresses; if your team needs more than the user agent to recognise it, tell us what you accept (for example signed requests under Web Bot Auth) and we will look at setting it up.

    If the same answer suits Superdrug, whose website turns us away in the same way, we would be glad to list it on the same terms.

    What you get: free listings, tracked links that send buyers only to your own pages, and prices we take down rather than show out of date. We will follow any conditions you set (which pages, how often, removal on request).

    Kind regards,

    [YOUR NAME]
    PriceSniffs, https://pricesniffs.space
    yannysniffs@gmail.com
