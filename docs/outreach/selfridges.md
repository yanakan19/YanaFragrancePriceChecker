# Selfridges: affiliate application and permission request (draft, not sent)

Drafted 2026-10-08 for the owner. Nothing has been sent.

Email rewritten 2026-10-08 (second pass): shorter, with tracked links offered,
the crawler's details and a contact address. Send it on the same day as the
affiliate application it mentions. Routes and odds for every shop:
`docs/BLOCKED-SHOPS-ROUTES-2026-10-08.md`.

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

## The permission email, the same day

Send it the same day as the Partnerize application: it mentions the application
and also asks the crawler question, which the application does not.

**Where to send it:** no affiliate or partnerships address was found. The
contact page (https://www.selfridges.com/GB/en/info/contact-us/, from a web
search; selfridges.com blocks our requests) routes enquiries to Customer
Services; ask them to pass this to the e-commerce or affiliate team. Open it
in an ordinary browser.

Replace [YOUR NAME] before sending.

    Subject: Selfridges on PriceSniffs: a product feed, or permission for our crawler

    Hello,

    I run PriceSniffs (https://pricesniffs.space), an independent UK fragrance price comparison site. For each perfume it shows the price at every UK shop that sells it, delivery included, and every listing links straight to the shop's own product page. It lists about 26,000 products from more than 45 UK shops. Could you please pass this to your e-commerce or affiliate team?

    We would like to list Selfridges' fragrance range. At the moment your website's security blocks our crawler (robots.txt included). We respect that and have stopped asking.

    Either of these would let us send you shoppers with current prices:

    1. Your fragrance product feed through your Partnerize programme, which we are applying to, so every sale we send you is tracked to you. We would also like to know whether you accept comparison sites on it.

    2. Permission for our crawler to read your public product pages. It names itself on every request as "PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)", reads robots.txt first and obeys it, asks one page at a time at least a second apart, a few times a day, and never logs in or fills a basket. It runs on cloud servers without fixed addresses; if your team needs more than the user agent to recognise it, tell us what you accept (for example signed requests under Web Bot Auth) and we will look at setting it up.

    What you get: free listings, tracked links that send buyers only to your own pages, and prices we take down rather than show out of date. We will follow any conditions you set (which pages, how often, removal on request).

    Kind regards,

    [YOUR NAME]
    PriceSniffs, https://pricesniffs.space
    yannysniffs@gmail.com
