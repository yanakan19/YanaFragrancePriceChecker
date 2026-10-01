# Owner steps, in plain English

Five jobs only you can do. Each one is short. Do them in this order; the
first two stop money going out and switch the chat's AI side on.

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

## 2. Switch on the AI side of Virtual Yanny, for free (10 minutes)

Prices, stock, sizes and notes already work without this. This step only
matters for open questions like "something sweet, no florals".

**You do not need any AI keys.** Cloudflare has its own AI built in, free,
with no card and no third-party sign-ups. One account is the whole of it.

### 2a. A free Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up and create an account. It is
   free and it does not ask for a card.
2. In the dashboard, click **Workers & Pages**. On that overview page, on
   the right, copy your **Account ID**.
3. Click your profile picture (top right) → **My Profile** → **API Tokens**
   → **Create Token** → find the template **Edit Cloudflare Workers** →
   **Use template** → **Continue to summary** → **Create Token** → copy it.
   It is shown once.

### 2b. Put the two values into GitHub

1. Open https://github.com/yanakan19/yanafragrancepricechecker/settings/secrets/actions
2. Click **New repository secret** and add these two, name exactly as
   written:
   - `CLOUDFLARE_API_TOKEN` = the token from 2a
   - `CLOUDFLARE_ACCOUNT_ID` = the Account ID from 2a

That is all the secrets there are. Nothing else is needed.

### 2c. Press the button

1. Open https://github.com/yanakan19/yanafragrancepricechecker/actions
2. In the left list click **Deploy Virtual Yanny worker**.
3. Click **Run workflow** (right side), make sure the branch is
   `claude/scentday-retailer-registry-h92tth`, click the green
   **Run workflow**.
4. Wait about two minutes. Open the run. If it is green, click **Summary**
   at the top: it shows a line like
   `URL: https://pricesniffs-yanny.<something>.workers.dev`. Copy that URL.
5. If it is red, open the failed step; its last lines say what to fix.

### 2d. Tell the site where the Worker is

Send me (Claude) the URL from 2c in this chat and say "set the Yanny URL".
I will put it in `demo/virtualYanny.ts`, rebuild and push. Or do it
yourself: edit that file, change `''` on the `VIRTUAL_YANNY_API_BASE_URL`
line to the URL in quotes, run `npm run demo`, commit
`demo/virtualYanny.ts`, `demo/index.html` and `demo/404.html`, push.

### What the free allowance is

Cloudflare gives 10,000 Neurons a day at no charge, which is thousands of
chat answers. Only open questions use any of it; prices, stock, sizes and
notes cost nothing because they are answered in the reader's own browser.
If it ever did run out, the chat says so plainly for the rest of the day
and everything else keeps working. If that ever became a real problem you
could add a free Groq key as a backup, but there is no reason to now.

### Doing it from a terminal instead

If you would rather not use the GitHub button, this does the same thing
and needs no tokens at all (it signs you in through the browser):

```
npx wrangler login
npx wrangler deploy --config workers/yanny/wrangler.toml
```

---

## 3. Turn on accounts (Supabase) (15 minutes)

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

## 4. Three standing decisions (2 minutes each)

### 4a. Postal address for the legal pages

UK rules ask a site like this to publish a geographic address. A service
address is fine (a virtual office, an accountant's address, a PO box with a
street address). Send me the address you want shown and I will put it on the
legal pages. Until then the pages say honestly that one is not yet
published. Do not send a made-up one.

### 4b. ICO registration

Because accounts store email addresses, the site may need to pay the ICO's
data-protection fee (about £40 a year for most small operators).
1. Go to https://ico.org.uk/for-organisations/data-protection-fee/ and use
   the **self-assessment** tool (5 minutes of questions).
2. If it says you must register, pay the fee and send me the registration
   number; I will add it to the privacy notice.
3. If it says you are exempt, tell me that and I will record it.

### 4c. Fix the Claude environment that keeps reverting

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

## 5. Switch on price drop emails (20 minutes, plus waiting for DNS)

Readers can tick **Email me when a saved fragrance gets cheaper** on their
account page. Once a morning (07:41 UK winter time, 08:41 summer time) a
GitHub job emails each of them, once at most, listing every saved fragrance
whose cheapest delivered price fell by 5% or £2 (whichever is more) since the
last price we told them about, or reached a target they set. Every email has
a one click stop link.

Until you finish these steps the job runs, prints `Price alerts not
configured`, and stops. Nothing is read, written or sent. Do step 3 of this
file (accounts) first.

### 5a. Run the database script

Supabase dashboard → **SQL Editor** → **New query** → paste the whole of
`supabase/migrations/0004_price_alerts.sql` → **Run**. It must say success.
It is safe to run twice. Until it is run, the checkbox simply does not
appear on the account page.

### 5b. A free Resend account and your domain

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

### 5c. Add the two GitHub secrets

1. Supabase dashboard → **Project Settings** → **API Keys**. Copy the
   **service_role** key (on newer projects, a **Secret key** starting
   `sb_secret_` works too). This key can read every account's data: paste it
   only into GitHub as below, never into a file, a chat or an email.
2. Open https://github.com/yanakan19/yanafragrancepricechecker/settings/secrets/actions
   → **New repository secret**, twice, names exactly as written:
   - `SUPABASE_SERVICE_ROLE_KEY` = the key from step 1
   - `RESEND_API_KEY` = the key from 5b step 5

### 5d. Do a dry run

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

### 5e. Send one for real, then it is on

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
