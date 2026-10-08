# The Fragrance Shop: affiliate application and permission request (draft, not sent)

Drafted 2026-10-03, refreshed 2026-10-08 for the owner. Nothing has been sent.

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

## Fallback: the permission email

Use this only if the Rakuten application is refused or gives no feed.

**Where to send it:** no contact, press or partnerships address was found on
the shop's own site (it refuses our requests). Open
https://www.thefragranceshop.co.uk in an ordinary browser and use the Contact
us link in the page footer, or write through the Rakuten programme contact.

Replace [YOUR NAME] before sending.

    Subject: Permission to show The Fragrance Shop prices on PriceSniffs

    Hello,

    My name is [YOUR NAME] and I run PriceSniffs (https://pricesniffs.space), a free UK price comparison site for fragrance.

    PriceSniffs shows what a bottle costs at each UK shop that sells it, with delivery included, so a shopper sees the real total before they click. Every listing links straight to the shop's own product page, where the sale happens. We never change a shop's price, and if we cannot keep a price current we take it off the site rather than show an old one.

    We would like to include The Fragrance Shop. At the moment our checks of your public pages are turned away by your website's security (a Cloudflare challenge, even on robots.txt), and we respect that, so we have stopped trying.

    Would you be willing to share your product data feed with us, for example through your Rakuten Advertising programme (ID 43488)? Or, if you prefer, to let our crawler, which identifies itself as PriceSniffsBot and follows robots.txt, read your public product pages at a gentle rate? Either would let us send shoppers to you with accurate, current prices.

    Whichever suits you, we will follow any conditions you set, such as how often we check or which pages we use. I would be glad to answer any questions.

    Kind regards,

    [YOUR NAME]
    PriceSniffs
    https://pricesniffs.space
