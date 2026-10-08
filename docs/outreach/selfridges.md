# Selfridges: affiliate application and permission request (draft, not sent)

Drafted 2026-10-08 for the owner. Nothing has been sent.

## Do this first: the Partnerize programme

Selfridges moved its affiliate programme onto Partnerize in May 2022 and
retired its Awin and Rakuten programmes (PerformanceIN, 18 May 2022,
"Selfridges Chooses Partnerize to Consolidate Its Global Affiliate
Programme"). Aggregator listings still name Partnerize, and affi.io shows the
old Awin listing closed. The Awin and Rakuten accounts used for other shops
will not reach Selfridges.

Partnerize lets a brand offer product feeds to the partners on its campaign,
with tracking links written in. That feed is what PriceSniffs needs.

Steps for the owner:

1. Sign up as a partner (publisher) at https://partnerize.com/partners with
   https://pricesniffs.space as the site.
2. Find the Selfridges campaign inside Partnerize and apply.
3. In the application, say PriceSniffs is a UK fragrance price comparison
   site, ask whether comparison sites are accepted (no source found says
   either way), and ask for the product feed for beauty and fragrance.
4. Tell an agent the outcome. On approval the registry entry becomes
   `adapter: 'affiliate-feed'` with the Partnerize deeplink, and a Partnerize
   feed reader is built (only an Awin one exists today). The parser for the
   shop's own pages (src/catalogue/selfridgesRsc.ts) stays as it is.

## Fallback: the permission email

Use this if Partnerize refuses us or gives no feed.

**Where to send it:** no affiliate or partnerships address was found. The
contact page (https://www.selfridges.com/GB/en/info/contact-us/, from a web
search; selfridges.com blocks our requests) routes enquiries to Customer
Services; ask them to pass this to the e-commerce or affiliate team. Open it
in an ordinary browser.

Replace [YOUR NAME] before sending.

    Subject: Permission to show Selfridges fragrance prices on PriceSniffs

    Hello,

    My name is [YOUR NAME] and I run PriceSniffs (https://pricesniffs.space), a free UK price comparison site for fragrance. Could you please pass this to your e-commerce or affiliate team?

    PriceSniffs shows what a bottle costs at each UK shop that sells it, with delivery included, so a shopper sees the real total before they click. Every listing links straight to the shop's own product page, where the sale happens. We never change a shop's price, and if we cannot keep a price current we take it off the site rather than show an old one.

    We would like to include Selfridges' fragrance range. At the moment our checks of your public pages, robots.txt included, are blocked by your website's security, and we respect that, so we have stopped trying.

    Would you be willing to share a product data feed with prices, stock and product links, for example through your Partnerize programme? Or, if you prefer, to let our crawler, which identifies itself as PriceSniffsBot and follows robots.txt, read your public fragrance pages at a gentle rate? Either would let us send shoppers to you with accurate, current prices.

    Whichever suits you, we will follow any conditions you set, such as how often we check or which pages we use. I would be glad to answer any questions.

    Kind regards,

    [YOUR NAME]
    PriceSniffs
    https://pricesniffs.space
