# Perfume Shopping: Awin application and permission request (draft, not sent)

Drafted 2026-10-08 for the owner. Nothing has been sent.

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

## Fallback: the permission email

The site answers every request from our crawler, robots.txt included, with
Cloudflare's "We are sorry, this service is not available in your region."
Our crawler runs on GitHub's servers, which are not in the UK, so a region
rule meant for shoppers may be catching it.

**Where to send it:** no contact address was found (the site refuses our
requests). Use the Awin advertiser contact for programme 5901, or open
https://www.perfumeshopping.com in an ordinary browser from the UK and use its
contact page.

Replace [YOUR NAME] before sending.

    Subject: PriceSniffs: showing Perfume Shopping prices to UK shoppers

    Hello,

    My name is [YOUR NAME] and I run PriceSniffs (https://pricesniffs.space), a free UK price comparison site for fragrance. We applied to your Awin programme (5901) in August.

    PriceSniffs shows what a bottle costs at each UK shop that sells it, with delivery included, so a shopper sees the real total before they click. Every listing links straight to the shop's own product page, where the sale happens. We never change a shop's price, and if we cannot keep a price current we take it off the site rather than show an old one.

    We would like to include Perfume Shopping. At the moment every request from our crawler, robots.txt included, is answered "this service is not available in your region". Our crawler runs from cloud servers outside the UK, so we think a region rule for shoppers is catching it, and we respect that, so we have stopped trying.

    Would you be willing to approve us on Awin so we can use your product feed? Or, if you prefer, to let our crawler, which identifies itself as PriceSniffsBot and follows robots.txt, read your public product pages at a gentle rate? Either would let us send UK shoppers to you with accurate, current prices.

    Whichever suits you, we will follow any conditions you set. I would be glad to answer any questions.

    Kind regards,

    [YOUR NAME]
    PriceSniffs
    https://pricesniffs.space
