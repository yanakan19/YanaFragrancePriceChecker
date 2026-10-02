# Owner steps, in plain English

Four jobs only you can do. Each one is short. Do them in this order; the
first stops money going out (the old chat servers, now unused).

---

## 1. Stop Fly.io charging you (5 minutes)

Nothing on the site uses Fly any more, so deleting both apps cannot break
anything.

1. Go to https://fly.io/dashboard and sign in.
2. Click **Apps** in the left menu. You should see two: `pricesniffs-yanny`
   and `yanny-freellmapi`.
3. Open `pricesniffs-yanny` → **Settings** (left menu) → scroll to the bottom
   → **Delete app** → type the app name to confirm.
4. Do exactly the same for `yanny-freellmapi`.
5. Back on the dashboard, click your organisation → **Billing** → remove the
   payment card (or, if Fly will not let you remove the last card, check
   there are no apps and no volumes left so nothing can be billed).
6. Done. If you get an invoice for this month it is for usage before today;
   nothing runs there now.

---

## 2. Turn on accounts (Supabase) (15 minutes)

The sign-in page and the Save-to-wishlist button already exist on the site.
They stay switched off until the database is set up.

1. Go to https://supabase.com/dashboard and open the project whose URL
   starts with `kemjyocklbkgjsyfdqtf`. If you do not see it, the keys in the
   site belong to a different project; tell me and stop here.

2. **Run the three database scripts.** Left menu → **SQL Editor** →
   **New query**. Open the file `supabase/migrations/0001_profiles.sql` from
   the repo on GitHub, copy the whole thing, paste it in, click **Run**.
   It must say success. Then do the same with
   `supabase/migrations/0002_wishlists.sql`, then
   `supabase/migrations/0003_delete_account.sql` (lets people delete their own
   account from the Account page). Order matters: 0001 first.

3. **Require email confirmation.** Left menu → **Authentication** →
   **Sign In / Providers** → **Email** → make sure **Confirm email** is ON.
   Leave minimum password length at 8 or more. Save.

4. **Set the site address.** Left menu → **Authentication** →
   **URL Configuration**:
   - **Site URL**: `https://pricesniffs.space`
   - **Redirect URLs** → Add: `https://pricesniffs.space/account`
   Save.

5. **Check it is locked down.** SQL Editor → New query → paste the contents
   of `supabase/verify.sql` from the repo → Run. Every table listed must show
   `rls_enabled = true`. If any shows false, stop and tell me.

6. **Try it once, for real.**
   - Open https://pricesniffs.space/account on the live site. You should
     see Sign in / Sign up.
   - Sign up with a real email address. The page should change to
     "Verify your email".
   - Open the email on a DIFFERENT browser or your phone and click the link.
     It should land you on the account page saying "Signed in as …".
   - Open any fragrance, press **Save**. It should read **Saved**.
   - Go back to the account page: the fragrance is in your wishlist.
   - Remove it, then sign out. Prices on the site must be unchanged.
   If any step does not do that, tell me which one and what you saw.

Note: Supabase's free email sending allows only a few emails per hour, so
if the email does not arrive, wait an hour before trying again.

---

## 3. Three standing decisions (2 minutes each)

### 3a. Postal address for the legal pages

UK rules ask a site like this to publish a geographic address. A service
address is fine (a virtual office, an accountant's address, a PO box with a
street address). Send me the address you want shown and I will put it on the
legal pages. Until then the pages say honestly that one is not yet
published. Do not send a made-up one.

### 3b. ICO registration

Because accounts store email addresses, the site may need to pay the ICO's
data-protection fee (about £40 a year for most small operators).
1. Go to https://ico.org.uk/for-organisations/data-protection-fee/ and use
   the **self-assessment** tool (5 minutes of questions).
2. If it says you must register, pay the fee and send me the registration
   number; I will add it to the privacy notice.
3. If it says you are exempt, tell me that and I will record it.

### 3c. Fix the Claude environment that keeps reverting

Sessions sometimes start from an old snapshot of the repo. The fix is to
make Anthropic rebuild that snapshot:
1. Go to https://claude.ai/code → find the environment for this repository
   → **Edit** (there is no "recreate" button; this is the way).
2. In the **setup script** box add one line anywhere, for example
   `# cache bust 2026-09-07`, and **Save**.
3. That is all. The next session starts from a fresh copy. If sessions still
   revert after that, use **Archive** on that environment and create a new
   one for the same repository.

---

## 4. Switch on price drop emails (20 minutes, plus waiting for DNS)

Readers can tick **Email me when a saved fragrance gets cheaper** on their
account page. Once a morning (07:41 UK winter time, 08:41 summer time) a
GitHub job emails each of them, once at most, listing every saved fragrance
whose cheapest delivered price fell by 5% or £2 (whichever is more) since the
last price we told them about, or reached a target they set. Every email has
a one click stop link.

Until you finish these steps the job runs, prints `Price alerts not
configured`, and stops. Nothing is read, written or sent. Do step 3 of this
file (accounts) first.

### 4a. Run the database script

Supabase dashboard → **SQL Editor** → **New query** → paste the whole of
`supabase/migrations/0004_price_alerts.sql` → **Run**. It must say success.
It is safe to run twice. Until it is run, the checkbox simply does not
appear on the account page.

### 4b. A free Resend account and your domain

1. Go to https://resend.com/signup and create an account (free: 100 emails a
   day, 3,000 a month, no card).
2. Left menu → **Domains** → **Add Domain** → type `pricesniffs.space` →
   pick the region **Ireland (eu-west-1)** → **Add**.
3. Resend now shows three or four DNS records. Add each one, exactly as
   shown (copy with the copy buttons, do not retype), wherever the DNS for
   `pricesniffs.space` is managed: the same place the GitHub Pages records
   were added when the domain was set up (your registrar, or Cloudflare if
   the domain is on Cloudflare). They look like this, but use Resend's values:

   | Type | Name (host) | Value | Priority |
   | --- | --- | --- | --- |
   | MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | |
   | TXT | `resend._domainkey` | a long `p=MIG...` key | |
   | TXT | `_dmarc` (recommended) | `v=DMARC1; p=none;` | |

   Most DNS screens want only the part before `.pricesniffs.space` in the
   name box (`send`, not `send.pricesniffs.space`). The records sit on the
   `send` subdomain, so they do not touch the site or any email you already
   receive. If a `_dmarc` record already exists, leave it as it is.
   If the domain is on Cloudflare, Resend offers **Auto configure**, which
   adds them for you.
4. Back in Resend press **Verify DNS records**. It usually turns green within
   an hour; it can take up to a day. Wait for **Verified** before 5d.
5. Left menu → **API Keys** → **Create API Key** → name `pricesniffs alerts`,
   permission **Sending access**, domain `pricesniffs.space` → **Add**. Copy
   the key (starts `re_`). It is shown once.

### 4c. Add the two GitHub secrets

1. Supabase dashboard → **Project Settings** → **API Keys**. Copy the
   **service_role** key (on newer projects, a **Secret key** starting
   `sb_secret_` works too). This key can read every account's data: paste it
   only into GitHub as below, never into a file, a chat or an email.
2. Open https://github.com/yanakan19/yanafragrancepricechecker/settings/secrets/actions
   → **New repository secret**, twice, names exactly as written:
   - `SUPABASE_SERVICE_ROLE_KEY` = the key from step 1
   - `RESEND_API_KEY` = the key from 5b step 5

### 4d. Do a dry run

1. On https://pricesniffs.space/account sign in, tick the price alerts box,
   and save one or two fragrances. Under one of them type a target price a
   few pounds **above** its current price (so it counts as reached).
2. Open https://github.com/yanakan19/yanafragrancepricechecker/actions →
   **Price alerts** (left list) → **Run workflow**, branch
   `claude/scentday-retailer-registry-h92tth`, leave **dry run** ticked →
   **Run workflow**.
3. Open the run → **send** → **Send price drop emails**. You should see a
   line like `1 reader(s) opted in, 2 saved item(s) checked, ... 1 email(s)
   due` and `Dry run: nothing sent and nothing written.` The log never shows
   anyone's address. If it says `not configured`, a secret name is misspelt.

### 4e. Send one for real, then it is on

1. Run the workflow again with **dry run unticked**. Within a minute you get
   an email from `alerts@pricesniffs.space` about the fragrance with the
   target. Check the product link opens the right page.
2. Press **Stop these emails** in it. The site should say **Price alerts are
   off**, and the box on your account page is unticked. Tick it again if you
   want to keep them.
3. That is it. From tomorrow the morning run sends for real by itself.

To pause it at any time without touching code: Settings → **Secrets and
variables** → **Actions** → **Variables** → **New repository variable**
`PRICE_ALERTS` = `off`. Every run becomes a dry run. Delete the variable to
resume.

Two things to know: GitHub only runs scheduled jobs from the repository's
default branch, so if that is not `claude/scentday-retailer-registry-h92tth`,
the morning run will not fire until this file is on the default branch too.
And Supabase's own sign up emails can go through Resend as well (Supabase →
Authentication → Emails → SMTP Settings, host `smtp.resend.com`, port 465,
user `resend`, password a Resend API key), which lifts Supabase's few emails
an hour limit. Optional.
