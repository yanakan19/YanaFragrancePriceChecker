# The Perfume Shop: affiliate application and permission request (draft, not sent)

Drafted 2026-10-03, refreshed 2026-10-08 for the owner. Nothing has been sent.

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

## Fallback: the permission email

Use this if no programme with a product feed accepts us.

**Where to send it:** the customer service page,
https://theperfumeshop.com/customer-service (from a web search; we could not
open it). Open it in an ordinary browser and use the email or contact form it
offers. No press or partnerships page was found. The Perfume Shop is an
AS Watson brand, like Superdrug, and both domains answer us with the same
Akamai deny, so one yes from the group's e-commerce team could cover both.

Replace [YOUR NAME] before sending.

    Subject: Permission to show The Perfume Shop prices on PriceSniffs

    Hello,

    My name is [YOUR NAME] and I run PriceSniffs (https://pricesniffs.space), a free UK price comparison site for fragrance.

    PriceSniffs shows what a bottle costs at each UK shop that sells it, with delivery included, so a shopper sees the real total before they click. Every listing links straight to the shop's own product page, where the sale happens. We never change a shop's price, and if we cannot keep a price current we take it off the site rather than show an old one.

    We would like to include The Perfume Shop. At the moment our checks of your public pages, robots.txt included, are turned away by your website's security ("Access Denied"), and we respect that, so we have stopped trying.

    Would you be willing to share a product data feed with prices, stock and product links, for example through your affiliate programme? Or, if you prefer, to let our crawler, which identifies itself as PriceSniffsBot and follows robots.txt, read your public product pages at a gentle rate? Either would let us send shoppers to you with accurate, current prices.

    Whichever suits you, we will follow any conditions you set, such as how often we check or which pages we use. I would be glad to answer any questions.

    Kind regards,

    [YOUR NAME]
    PriceSniffs
    https://pricesniffs.space
