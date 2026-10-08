# Perfume Shopping: Awin application and permission request (draft, not sent)

Drafted 2026-10-08 for the owner. Nothing has been sent.

Email rewritten 2026-10-08 (second pass): shorter, with tracked links offered,
the crawler's details and a contact address. Send it on the same day as the
affiliate application it mentions. Routes and odds for every shop:
`docs/BLOCKED-SHOPS-ROUTES-2026-10-08.md`.

## Do this first: chase the Awin application (merchant 5901)

The owner applied to Perfume Shopping on Awin on 2026-08-11 (Activity
Stream). Awin's own public profile, https://ui.awin.com/merchant-profile/5901,
names "Perfume Shopping", perfumeshopping.com, with a 5% starting commission
and prices in pounds, so the application is to **Awin merchant 5901**.
Nearly two months on, it shows no decision in the registry, and the Awin
memberships check of 2026-10-08 (catalogue-daily run #797) lists only five
accepted advertisers (Fragrance Click UK, MyBeauty.Boutique, Nicchia Luxury
UK, Paco Perfumerias, Perfume Click): 5901 is not one of them.

Steps for the owner:

1. In the Awin dashboard, open Advertisers, find Perfume Shopping (5901) and
   read its status (pending, joined or declined).
2. If it is still pending, send the advertiser a short message through Awin
   (the text below works, trimmed), saying PriceSniffs is a UK fragrance price
   comparison site and asking to be reviewed.
3. If it is joined, tell an agent. The entry becomes
   `affiliate: awinActive('5901', '3017443')` and `adapter: 'affiliate-feed'`;
   the existing Awin feed sync picks its feed up by merchant id, as it does for
   Fragrance Click. Nothing else needs building.
4. If it is declined, the email below is the only other route.

## The permission email, the same day

The site answers every request from our crawler, robots.txt included, with
Cloudflare's "We are sorry, this service is not available in your region."
Our crawler runs on GitHub's servers, which are not in the UK, so a region
rule meant for shoppers may be catching it.

**Where to send it:** no contact address was found (the site refuses our
requests). Use the Awin advertiser contact for programme 5901, or open
https://www.perfumeshopping.com in an ordinary browser from the UK and use its
contact page.

Replace [YOUR NAME] before sending.

    Subject: Perfume Shopping on PriceSniffs: a product feed, or permission for our crawler

    Hello,

    I run PriceSniffs (https://pricesniffs.space), an independent UK fragrance price comparison site. For each perfume it shows the price at every UK shop that sells it, delivery included, and every listing links straight to the shop's own product page. It lists about 26,000 products from more than 45 UK shops.

    We would like to list Perfume Shopping. At the moment every request from our crawler, robots.txt included, is answered "this service is not available in your region". Our crawler runs on cloud servers outside the UK, so a region rule meant for shoppers may be catching it. We respect that and have stopped asking.

    Either of these would let us send you shoppers with current prices:

    1. Approval on your Awin programme (5901), which we applied to in August, and your product feed there, so every sale we send you is tracked to you.

    2. Permission for our crawler to read your public product pages. It names itself on every request as "PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)", reads robots.txt first and obeys it, asks one page at a time at least a second apart, a few times a day, and never logs in or fills a basket. It runs on cloud servers without fixed addresses; if your team needs more than the user agent to recognise it, tell us what you accept (for example signed requests under Web Bot Auth) and we will look at setting it up.

    What you get: free listings, tracked links that send buyers only to your own pages, and prices we take down rather than show out of date. We will follow any conditions you set (which pages, how often, removal on request).

    Kind regards,

    [YOUR NAME]
    PriceSniffs, https://pricesniffs.space
    yannysniffs@gmail.com
