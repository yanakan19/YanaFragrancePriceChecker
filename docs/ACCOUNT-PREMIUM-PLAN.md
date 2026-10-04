# Accounts and Premium: the plan

Written 4 October 2026, alongside Phase 1 of the account, About and Settings
revamp. Phase 1 is built. Phases 2 and 3 are not: this file is the plan for
them and the record of what the owner has decided.

## Decisions made by the owner (4 October 2026)

| Question | Decision |
| --- | --- |
| What is paid and what is free | **Premium is ad free browsing first and foremost, plus email and push notifications.** Free is everything else: search, prices, the wishlist and the price graphs, with ads. |
| Price | **£0.99 a month or £10.00 a year.** |
| Payment provider | **Stripe** (Stripe Checkout for paying, the Stripe customer portal for managing and cancelling). |
| Menu layout | A round account button at the far left of the top bar opening Profile, Wishlist, Notifications, Settings and Sign Out (Sign In, Create an Account and Settings when signed out). Built in Phase 1; the owner should still look at it on a phone and confirm. |

The site shows **no price and no buy button** until Phase 3 ships. The
Notifications page lists what Premium will add as planned, and the profile's
Your Plan box says Free.

## Phase 1 (built, 4 October 2026)

- Account menu at the top left of the bar; Settings left the nav row, which is
  now Home, Deals, Explore, About.
- Three account pages with their own addresses, all noindex and out of the
  sitemap: `/account` (profile), `/account/wishlist`, `/account/notifications`.
- Settings holds only Theme and Layout. Contact Us and the legal links moved
  to the About page, which also gained a mission line, three numbers counted
  from the catalogue, four "How Prices Are Checked" cards and a short FAQ.
- Change Email uses Supabase's own confirmation flow (`updateEmail` in
  `demo/auth.ts`): nothing changes until the link in the email is followed.
  Owner check: in Supabase, Authentication, Email Templates, the "Change Email
  Address" template is enabled, and "Secure email change" is on (it is the
  default), so both addresses confirm.
- Download My Data builds a JSON file in the browser from what the signed in
  client can read: email, account creation date, wishlist rows and the alert
  setting.

Left out of Phase 1, on purpose:

- **"Change since saved" and a Biggest Drop sort on the wishlist.** A wishlist
  row stores `added_at` and an optional `target_price_gbp`, never the price on
  the day it was saved (`supabase/migrations/0002_wishlists.sql`). The alert
  sender's `price_alert_history.last_price_gbp` is server only and is reset
  after each email, so it is not a "price when saved" either. Showing a change
  would mean inventing the starting figure. To add it later: a nullable
  `saved_price_gbp numeric(10,2)` column on `wishlists`, written by the client
  with today's cheapest delivered price at the moment of saving. Old rows keep
  null and simply show no change.

## Phase 2: notification history (not built)

Goal: the Alert History page has real data, so it never has to be faked.

1. Migration `0005_alert_log.sql`: a table `alert_log` with `id`,
   `user_id` (references `auth.users`, on delete cascade), `sent_at`,
   `channel` (`email` now, `push` later), `kind` (`price_drop`, `target`,
   `back_in_stock`, `preorder_shipping`), `fragrance_id`, `price_gbp`,
   `retailer_id`, and the email provider's message id.
   Row level security on, with one policy: a reader may **select** their own
   rows. No insert, update or delete for `anon` or `authenticated`; only the
   service role writes.
2. `scripts/price-alerts.ts` inserts one row per line of every email it sends,
   in the same run, after the provider accepts the message. A failed send logs
   nothing.
3. The Notifications page gains a History section listing those rows, newest
   first. Until the first email is sent it says so, rather than showing an
   empty table that looks broken.
4. Download My Data adds the log.
5. Privacy notice: say the log exists, what it holds and that deleting the
   account deletes it (the cascade does this).

## Phase 3: Premium through Stripe (not built)

### How it works

1. **Checkout.** A Supabase edge function `create-checkout` (called with the
   reader's session) creates a Stripe Checkout session in subscription mode
   for the monthly or yearly price, with `client_reference_id` set to the
   Supabase user id and the customer's email prefilled. The page redirects to
   Stripe; nothing about the card ever touches this site.
2. **Webhook.** A Supabase edge function `stripe-webhook` verifies the Stripe
   signature with the webhook signing secret and handles
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` and `invoice.payment_failed`. It is the only
   writer of the plan, using the service role key held in the edge function's
   secrets (never in this repository, never in the bundle).
3. **Profile columns** (migration `0006_plan.sql`): `plan text not null
   default 'free'` (`free` or `premium`), `plan_renews_at timestamptz`,
   `stripe_customer_id text`. RLS must stop a reader updating these: the
   existing "update own profile" policy is narrowed with a column list, or the
   columns move to a separate `subscriptions` table that readers may only
   select. A test reads the migration and fails if `authenticated` can update
   `plan`.
4. **Managing and cancelling.** An edge function `customer-portal` opens the
   Stripe customer portal for the signed in reader's `stripe_customer_id`.
   Cancelling there sends `customer.subscription.updated` (cancel at period
   end) and later `deleted`, which the webhook turns back into `free`.

### Present the yearly plan first

Stripe's UK pricing page (checked 4 October 2026) says **1.5% + 20p for
standard UK cards** (2.8% + 20p for premium UK cards), and Stripe Billing on
pay as you go adds **0.7% of Billing volume**. Owner: confirm both on
stripe.com/gb/pricing and stripe.com/gb/billing/pricing before launch.

| Plan | Charge | Card fee | Billing fee | Total fees | Share of the charge |
| --- | --- | --- | --- | --- | --- |
| Monthly | £0.99 | about 21.5p | about 0.7p | about 22p | **about 22%**, roughly a fifth |
| Yearly | £10.00 | 35p | 7p | 42p | **about 4%** |

Over a year a monthly subscriber pays £11.88 and about £2.66 of it goes in
fees; a yearly subscriber pays £10.00 and about 42p goes in fees. So the
checkout and every mention of Premium should lead with the yearly plan, with
monthly offered beside it.

### How ads are removed for Premium

1. **Where the plan lives.** On the Supabase profile (`plan`,
   `plan_renews_at`), written only by the Stripe webhook edge function with the
   service role. RLS stops readers updating it (see above).
2. **Reading it.** After sign in, the client reads `plan` once and caches a
   flag on the device (local storage, for example `pricesniffs.plan`), so the
   next visit decides before the first paint whether to load ads. The cached
   flag is only a hint for speed: it is refreshed from the profile on every
   sign in and session refresh, and cleared on sign out.
3. **One function decides.** Add `adsAllowedForViewer()`: true only when ads
   are switched on (`ADS_ON` in `demo/ads.ts`) **and** the viewer is not
   Premium. Both `adSlotHtml` / `interleaveAds` in `demo/ads.ts` (which draw
   the slots) and `installAds` / `mountAds` in `demo/adsRuntime.ts` (which load
   the AdSense script) call it. A Premium viewer therefore never gets Google's
   script, its cookies or its consent message, not merely hidden slots.
4. **Changes apply without a reload.** When the plan changes (sign in, sign
   out, the webhook result arriving after checkout), the app re-renders: slots
   disappear or appear. If the AdSense script was already loaded before the
   reader signed in as Premium, it cannot be unloaded, so slots stop being
   drawn at once and the script is gone from the next page load.
5. **Signed out Premium members see ads** until they sign in, since the site
   cannot know who they are. Supabase sessions persist across visits, so this
   is mostly the first visit on a new device.

### Push notifications

- Web push through the existing service worker (`demo/sw.js`) with VAPID
  keys. The public key goes in the bundle; the private key lives only in the
  sender's secrets.
- Subscriptions are stored in a Supabase table `push_subscriptions`
  (`user_id`, `endpoint`, `p256dh`, `auth`, `created_at`), readable and
  deletable by their owner, written through an edge function.
- iOS supports web push only for a site added to the home screen, on iOS 16.4
  or later. The page has to say so rather than show a button that does
  nothing in Safari.
- Native push comes later through the Capacitor app (see `docs/MOBILE-APPS.md`).
- Sending happens only to Premium accounts, and the plan is checked server
  side by the sender at send time, never trusted from the client.

### Launch order and rules

- **Launch Premium only after AdSense ads are live.** Ad free is the main
  thing Premium sells; before ads run there is nothing to remove.
- **In app purchase rules.** If subscriptions are ever sold inside the iOS or
  Android app, Apple's and Google's in app purchase rules apply (their billing
  and their commission). Selling on the website through Stripe Checkout is not
  affected; the app should not link to or advertise the web checkout in ways
  either store forbids.
- **Existing free alert subscribers** get notice by email and a grace period
  before email alerts become Premium. The Notifications page already says
  alerts will move to Premium, without a date.

### Terms of sale, refunds and privacy (needed before the first sale)

- **Terms of sale** page: what Premium includes, the price including any VAT
  (the site is not VAT registered today), how renewal works, and how to
  cancel in the customer portal.
- **14 day cancellation right** (Consumer Contracts Regulations 2013): a UK
  consumer can cancel a digital service within 14 days of buying. If Premium
  starts at once, the checkout must ask the buyer to agree to it starting
  within the cancellation period and acknowledge that a proportionate amount
  may be deducted on cancellation. The simpler policy is a full refund on any
  cancellation within 14 days.
- **Refunds**: update the existing refunds page (`demo/legal.ts`, id
  `refunds`) to cover Premium: the 14 day right, what happens on cancellation
  after that (access to the end of the paid period, no partial refunds), and
  failed payments.
- **Privacy notice**: add Stripe as a processor (payment details go to Stripe,
  not to the site; the site stores the Stripe customer id and the plan), and
  the push subscription table once push ships.

### Owner steps to open Stripe

1. Create a Stripe account at stripe.com/gb as a sole trader under the
   trading name YannySniffs, and complete identity and bank verification.
2. In the Stripe dashboard, create a product "PriceSniffs Premium" with two
   prices: £10.00 yearly and £0.99 monthly. Note both price ids.
3. Turn on the customer portal (Settings, Billing, Customer portal): allow
   cancelling and switching between the two prices.
4. Create a webhook endpoint pointing at the `stripe-webhook` edge function
   URL, for the four events listed above, and copy its signing secret.
5. Put the Stripe secret key, the webhook signing secret and the price ids in
   the Supabase edge function secrets. None of them go in this repository.
6. Test the whole flow in Stripe's test mode with test cards before switching
   to live keys.
