# Stripe setup: PriceSniffs Premium, kept apart from the Shopify shop, paid into one bank account

Written 5 Oct 2026 for the owner (Ur Koppan, trading as YannySniffs). It extends
"Owner steps to open Stripe" in `docs/ACCOUNT-PREMIUM-PLAN.md` and the Premium
decisions there (ad free plus email and push alerts, £0.99 a month or £10 a
year). Premium is held until ads are live. Nothing here needs doing before then,
except opening and verifying the accounts, which takes a few days.

Assumption: "my schoalpplpy" was read as **your Shopify store**. If it means
something else, tell me and this page changes.

## The shape to aim for

| Stream | Takes payment through | Appears in |
|---|---|---|
| PriceSniffs Premium (this site) | **Stripe**, its own account | Stripe dashboard, "PriceSniffs" account |
| Shopify shop | **Shopify Payments** (Shopify's own Stripe powered system) | Shopify admin |
| Everything | Both pay out to **the same business bank account** | One bank statement |

Why two payment accounts and not one:

- In the UK, Shopify Payments is available, and Shopify does not let you plug
  your own Stripe account in as the shop's gateway while it is. So the Shopify
  shop cannot share your Stripe account. This is the one fixed point in the
  design. Check it in your Shopify admin under Settings, Payments before you
  rely on it, because Shopify changes this.
- Stripe's own rule: projects, websites or businesses that operate
  independently should use separate Stripe accounts, each with its own public
  business name and statement descriptor, so a customer does not see a charge
  from a name they do not recognise (that causes disputes). Separate accounts can
  still pay out to the same bank account.

So you get separate streams in reporting, and one place where the money lands.

## Steps

### 1. One legal identity, one bank account
1. Decide the business bank account everything pays into. A business account
   (or a dedicated personal account used only for the trade) keeps the
   accounting simple. Use the same sole trader details everywhere.
2. Keep the sole trader name YannySniffs consistent across Stripe, Shopify, the
   bank, and the privacy notice on the site.

### 2. Open the PriceSniffs Stripe account
1. Go to stripe.com/gb and create the account with the email you want as the
   owner login. Choose sole trader, UK.
2. Business details: trading name **PriceSniffs** (website pricesniffs.space,
   product description "Subscription to PriceSniffs Premium: ad free browsing
   and price alerts").
3. Public details, which customers see: statement descriptor **PRICESNIFFS**
   (up to 22 characters), support email, support website. Use a support email
   you read.
4. Verify identity, then add the business bank account for payouts.
5. Switch on two step login now, and keep the recovery codes offline.

### 3. Keep Shopify separate but paying the same bank
1. In Shopify admin, Settings, Payments, set up Shopify Payments (if not
   already) with the **same bank account** for payouts.
2. Nothing else links the two. Each pays out on its own schedule.

### 4. Gather everything under one login (optional but recommended)
Stripe lets one email hold several accounts and switch between them from the
account name at the top left of the dashboard (New account). If you ever open a
second Stripe account (for example another business line), group them in a
Stripe **organization** for combined reports and one team list. A single
PriceSniffs account does not need it yet. Both documents:
docs.stripe.com/get-started/account/multiple-accounts and
docs.stripe.com/get-started/account/orgs

### 5. Make the Premium product (in the PriceSniffs account)
Follow steps 2 to 6 of "Owner steps to open Stripe" in
`docs/ACCOUNT-PREMIUM-PLAN.md`: product "PriceSniffs Premium", two prices
(£0.99 monthly, £10.00 yearly), customer portal on, webhook to the
`stripe-webhook` edge function, keys only in Supabase secrets. Add a metadata
value `stream = premium` on the product and both prices so anything you export
is labelled.

### 6. Test before live
Test mode with Stripe's test cards, through the whole flow (subscribe, receive
the plan on the account, cancel in the portal, a failed payment). Only then
switch the Supabase secrets to the live keys.

### 7. Tax and records
- Stripe's own fee at last check was 1.5% + 20p for standard UK cards. Recheck
  stripe.com/gb/pricing and stripe.com/gb/billing/pricing before launch, since
  Billing adds its own percentage. At £0.99 a month the 20p matters: the yearly
  £10 plan costs you much less in fees per pound.
- Both streams are one trade for you as a sole trader, so one Self Assessment
  covers both. Keep a simple monthly export from each (Stripe payout reconciliation
  report, Shopify payouts report) and match them to the bank statement.
- VAT: only if your total taxable turnover passes the registration threshold.
  Ask an accountant before you cross it, because Premium for UK customers is
  standard rated.
- Add Stripe to the privacy notice as a processor when Premium ships (the plan
  doc lists the wording).

## What I will do, and what only you can do

- Only you: open and verify both accounts, choose the bank account, create the
  products and the webhook, and paste the keys into Supabase secrets.
- Me, when you say go: build Phase 3 of the plan (Checkout, webhook, portal
  link, plan columns, tests), after ads are live.
