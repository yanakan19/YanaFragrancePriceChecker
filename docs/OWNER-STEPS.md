# Owner steps, in plain English

Eight jobs only you can do. Each one is short. Do them in this order; the
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

### 4f. Switch on "change since saved" on the wishlist (2 minutes)

The wishlist can show how far a fragrance's price has moved since the day a
reader saved it, and offer a **Biggest Drop** sort. It needs one new column in
the database, `saved_price_gbp` on `wishlists`.

1. Supabase dashboard → **SQL Editor** → **New query** → paste the whole of
   `supabase/migrations/0005_wishlist_saved_price.sql` → **Run**. It must say
   success. It is safe to run twice.
2. That is all. Until it is run the site carries on as it does today: saving
   works, the price on the day is simply not kept, and the change and the
   Biggest Drop sort do not appear. After it is run, only fragrances saved
   from then on carry a saved price (the cheapest delivered price at that
   moment). Fragrances saved earlier show no change, on purpose: the site
   never works one out from today's price. Biggest Drop appears on a reader's
   wishlist once at least one of their saved fragrances has a change to rank.

---

## 5. Switching on ads (30 minutes, then Google's review)

The ad spaces are already built and switched off. Two of the three things
Google checks are already live: every page carries the verification tag for
your publisher id `ca-pub-6298711915135064`, and
https://pricesniffs.space/ads.txt names it. No ad script loads and no ad
shows until the ad unit ids below are filled in.

Where ads go once on, three places and no others:

1. **Home banner**: one wide strip directly under the Most Stocked section
   on the home page. On a wide screen it is as wide as the six tile grid
   above it and 90 pixels tall; on a phone it is the full width under the
   swipe row and 100 pixels tall.
2. **Grid tile**: one tile-sized box inside the browse grids (search
   results, brand, shop and note pages, Explore lists, Deals and the full
   Most stocked list), roughly every 10 product tiles. The gap is random,
   between 8 and 12 tiles, so it is not a strict pattern; the first one is
   after 16 to 20 tiles, so never in the first row at any column count, and
   not before the third row at six across. It is never last in a list. The places are worked out from
   the list's address (for example `/search?q=dior`), so a list always gets
   the same places, and they do not move as you scroll, press Back or load
   more.
3. **Product page**: one block on a perfume's page under the whole price
   list, 280 pixels tall.

Each says **Advertisement** above it in a dashed frame. Never in the top bar,
the home page hero, the price boxes, an offer row, an email or a social
post, never in the product page's side column, and ads never change the
order of anything.

**See the layout before any ad is on.** Add `?adpreview=1` to the end of any
address, for example https://pricesniffs.space/?adpreview=1 or
https://pricesniffs.space/search?adpreview=1. Every place above then shows
as a labelled dashed frame reading **Advertisement**, with what it is and
its size in small text. It loads nothing from Google and sends no request. It
is not saved anywhere (open the page without `?adpreview=1` and it is gone),
the page tells search engines not to index it, and the page's own address for
search engines ignores it. Without it, while ads are off, visitors see
nothing at all: no frames, no gaps. The preview is for you; do not send the
link to others.

### 5a. Sign up and get the site approved

1. Go to https://adsense.google.com/start/ and sign in with the Google
   account you want paid into. If you already started sign up (the id above
   came from it), just sign in.
2. Website: `pricesniffs.space`. Country: **United Kingdom**. Accept the
   terms, then fill in **Payments info**: your name and postal address
   exactly as on your bank account, because the PIN letter (5e) goes there.
3. Left menu → **Sites** → `pricesniffs.space`. It asks you to connect the
   site. The verification meta tag is already in every page, so choose
   **Meta tag**, tick that you placed it, press **Verify**, then **Request
   review**. Nothing needs pasting into the site.
4. **Turn Auto ads off** for the site: left menu → **Ads** → **By site** →
   the pencil next to `pricesniffs.space` → **Auto ads** off → **Apply**.
   Auto ads let Google put ads anywhere on a page, including the places
   listed above where they must never go. The site places its own.
5. Wait. Google says review usually takes a few days and can take up to
   about four weeks. You get an email either way. If refused, send me the
   reason word for word.

### 5b. Turn on Google's consent message (before any ad shows)

UK and EEA law needs consent before personalised ads, and Google requires a
Google certified consent tool for UK and EEA visitors. Google's own one is
free ("Privacy & messaging"). The site side is built and invisible today:
the day ads are switched on (5d), the site itself adds Google's consent
loader to every page, before the ad code, and shows a "Privacy and Cookie
Choices" link in the footer that reopens the message. Until then the site
contacts no Google host. There is no banner of our own and nothing to paste
into the site. Do the dashboard steps below on the day you switch ads on, or
just before it: the message only needs to be published, and it appears only
once the site loads the loader.

**Create the message**

1. AdSense left menu → **Privacy & messaging**. Choose the site
   `pricesniffs.space` (Google may ask you to add it first; accept).
2. **European regulations** (GDPR) → **Create message**. This one covers
   the UK as well as the EEA. Language: **English**.
3. User choices: tick **Consent**, **Manage options** and **Do not
   consent**. A plain no beside yes is what the UK regulator, the ICO,
   expects. Do not choose a "consent or pay" or "no option to refuse"
   variant.
4. **Privacy policy link**: `https://pricesniffs.space/about/legal#privacy`.
   An older message with `https://pricesniffs.space/legal/privacy` still works
   (that address opens the same section), but change it to the above.
5. Leave the options that let Google show the message to every visitor off:
   the default of showing it to visitors in the regions the regulation
   covers is what we want. Choose **Publish**.

**The three regions (UK `/`, US `/us/`, India `/in/`)**

6. UK and EEA: the European regulations message above. It is the only one
   required.
7. US: there is no GDPR style requirement. Leave **US state regulations**
   unset unless you decide you want that notice; the site needs nothing for
   it. If you do create it, the footer link opens it too.
8. India: Google has no consent message to set up for it. Leave as is.
9. The site behaves the same everywhere: ad requests are non personalised
   until Google's message reports consent. Outside the regions the message
   covers, Google reports that no consent rule applies and the ads may be
   personalised. Nothing per region to set on the site.

**Test it (the day ads are on)**

10. Open the site in a private window with a UK connection (or a VPN set to
    the UK or an EEA country) and no browser extension that blocks ads. The
    message must appear on the first page. Choose **Do not consent**, then
    scroll to an ad: it must be a generic, not personalised ad.
11. Click **Privacy and Cookie Choices** in the footer. The message (or the
    privacy settings it offers) must open again. If nothing opens and you
    land on the privacy section instead, the message is not published or not
    reaching the page: check step 5 and that **Privacy & messaging** shows the
    message as **Published** for this exact site.
12. Repeat with **Consent**: ads may now be personalised.
13. Open `/us/` and `/in/` from a non EEA connection: no message is expected,
    ads still show, the footer link is still there.

**Verify after publishing**

14. In the browser's developer tools, **Network** tab, filter `fundingchoices`:
    one request to Google's consent loader on each page, and it is before the
    `adsbygoogle.js` request. **Application** tab → storage: Google records the
    answer as a cookie or a local storage entry; check it is there after
    choosing, and gone after clearing site data.
15. In AdSense → **Privacy & messaging**, the message status reads
    **Published**, with no warning about the site or a missing policy link.
16. Check that what Google's tag stores matches the cookies page section
    "What Turns On With Ads" (docs/LEGAL.md says what to compare). Names,
    lifetimes and the exact storage place are Google's and can change; if
    the page claims something that is no longer true, tell me.
17. Not sure: whether Google asks for anything further for the UK beyond the
    European regulations message (its dashboard wording changes). If the
    dashboard shows a to do or warning on **Privacy & messaging**, follow it
    and send me its words.

Until someone answers the message, or if it fails to load, the site asks
Google for non personalised ads only. That is built in; nothing to set.

**The same privacy address in the app stores** (only once the apps are
listed, docs/MOBILE-APPS.md): paste `https://pricesniffs.space/about/legal#privacy`
into
- App Store Connect → the app → **App Information** → **Privacy Policy URL**
  → **Save**;
- Play Console → the app → **Policy and programmes** → **App content** →
  **Privacy policy** → **Save**.

### 5c. Check ads.txt

1. Open https://pricesniffs.space/ads.txt. It must show exactly:
   `google.com, pub-6298711915135064, DIRECT, f08c47fec0942fa0`
2. In AdSense → **Sites**, the ads.txt status should read **Authorised**.
   Google can take a few days to recheck after approval; "Not found" in the
   first days is normal.

### 5d. Create the three ad units and send me their ids

Only once AdSense says the site is **Ready**:

1. Left menu → **Ads** → **By ad unit** → **Display ads**.
2. Name it `Home banner`, shape **Horizontal**, size **Responsive** →
   **Create**. Google then chooses a leaderboard shaped ad that fits: about
   970 x 90 or 728 x 90 on a wide screen, 320 x 100 on a phone. The site
   reserves 90 pixels (100 on a phone) for it.
3. In the code it shows, find `data-ad-slot="1234567890"`. Copy only the
   digits. You do not need the rest of the code.
4. Do the same again, named `Grid tile`, shape **Square**, size
   **Responsive**. The site gives it the size of one product tile.
5. And once more, named `Product page`, shape **Horizontal**,
   **Responsive**. The site reserves 280 pixels for it.
6. Send me the three numbers (and today's date). Or paste them yourself into
   `demo/ads.ts`:
   ```ts
   export const AD_SLOTS: Readonly<Record<AdPlacement, string>> = {
     home: '3333333333',    // the Home banner digits (the third one to paste)
     grid: '1111111111',    // the Grid tile digits
     product: '2222222222', // the Product page digits
   };
   export const ADS_SWITCHED_ON: string = '20 October 2026'; // the day you switch on, written like this
   ```
   then run `npm run demo` and commit. The ads, the advertising sections of
   the privacy and cookies pages, and their "Last updated" date all switch
   on together from that one edit. Leave a slot as `''` to keep that place
   empty: a blank slot shows nothing and reserves no space, so you can start
   with one or two of the three. To switch every ad off again, blank all
   three slots.

### 5e. What to expect after that

- **First ads**: new ad units can take up to an hour to fill. Blank frames
  marked Advertisement in that time are normal.
- **Payment**: Google pays once your balance reaches **£60**, around the
  21st of the following month, by bank transfer (add the bank under
  **Payments** → **Payment methods**).
- **PIN letter**: when earnings reach £10, Google posts a PIN to the
  address in your payments profile. Enter it under **Payments** →
  **Payments info**. It can take a few weeks to arrive; you can ask for
  another if it does not. Payments cannot be made until it is entered.
- **Tax info**: AdSense asks every publisher for US tax information, even
  outside the US: **Payments** → **Payments info** → **Settings** →
  **Manage settings** → **United States tax info**. As an individual in the
  UK this is normally the W-8BEN form. Ad income is also UK income: declare
  it to HMRC alongside the affiliate commission. Ask an accountant if unsure.
- **Do not click your own ads**, or ask anyone to. Google closes accounts
  for it. To see how a page looks, use an ad blocker or private window and
  do not click.

### 5f. Later: bigger ad networks as traffic grows

AdSense is the starting point. Networks that pay more per visitor exist, but
each wants a minimum amount of traffic, and those minimums change. Check the
current one on each network's own site before applying; do not rely on a
figure from me or a blog.

1. **Ezoic**: the usual next step, with a lower bar than the two below.
   https://www.ezoic.com
2. **Mediavine** (https://www.mediavine.com) or **Raptive**
   (https://raptive.com), once traffic is well above Ezoic's level. Both
   publish their entry requirements on their sites.

Each of them replaces the AdSense code with its own and gives its own
ads.txt lines. Tell me which one accepted you and I will move the ad spaces
over to it, keeping the same places, labels and consent rules.

---

## 6. Switch on profile photos (5 minutes)

Readers can add a small photo on their profile page (/account). It shows in
the round account button at the top right of every page and at the top of
their profile, on any device they sign in on. Until you do this, the profile
page says "Adding a profile photo is not available yet" and offers no
control. Do step 2 of this file (accounts) first.

### 6a. Run the database script

Supabase dashboard → **SQL Editor** → **New query** → paste the whole of
`supabase/migrations/0006_profile_photo.sql` → **Run**. It must say success.
It is safe to run twice.

That one script does everything: it adds the photo's place on the profile,
creates a **private** Storage bucket called `avatars` (200 KB per file, WebP
and JPEG only) and the four rules that let each signed in reader read,
upload, replace and delete only their own photo. There is nothing to switch
on in the Storage pages by hand, and the bucket must stay **private**: do
not tick "Public bucket" on it.

### 6b. Check it worked

1. Left menu → **Storage**. You should see a bucket called `avatars`
   marked **Private**.
2. Click it → **Policies** (or Storage → **Policies**). Under `avatars`, or
   under "Other policies under storage.objects", you should see four:
   `read own avatar`, `upload own avatar`, `replace own avatar` and
   `delete own avatar`.
3. Sign in on the live site, open **View My Profile**, press **Add a
   Photo**, pick any photo of yourself. The round button at the top right
   should show it. Open the site on your phone and sign in: the same photo
   should be there.
4. Press **Remove Photo**. The button goes back to your initial, and the
   `avatars` bucket in Storage is empty again.

If the script stops with "must be owner of table objects" on the policy
lines, tell me: on some older projects the Storage rules have to be added
from Storage → Policies instead, and I will give you the exact four to add.
Nothing else on the site is affected in the meantime; the photo control
simply stays hidden.

---

## 7. Keep the price crawl on time (20 minutes)

GitHub only delivers about one in four of the crawl's hourly start signals
(161 of about 687 between 5 September and 4 October), and on 4 October none
at all for seven hours, so prices can go 8 to 10 hours between refreshes. The
crawl now accepts a start signal from an outside scheduler and treats it
exactly like GitHub's own: it still waits 150 minutes after the last full
harvest and skips while one is running, so extra signals never mean extra
harvests. Details: `docs/PIPELINE-FAILURE-MODES.md`.

### 7a. An outside scheduler (recommended)

1. GitHub → your picture → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new
   token**. Name it `crawl ticks`. Expiry: one year (put the date in your
   calendar). Repository access: **Only select repositories** →
   `YanaFragrancePriceChecker`. Permissions → Repository → **Actions: Read
   and write**. Nothing else. Copy the token; never paste it into the repo.
2. In any free cron service you trust (cron-job.org works), create a job
   every 30 minutes, at minutes 5 and 35:
   - Method `POST`, URL
     `https://api.github.com/repos/yanakan19/YanaFragrancePriceChecker/actions/workflows/catalogue-daily.yml/dispatches`
   - Headers: `Authorization: Bearer <the token>` and
     `Accept: application/vnd.github+json`
   - Body: `{"ref":"claude/scentday-retailer-registry-h92tth","inputs":{"scheduled_tick":"true"}}`
3. Check: GitHub → **Actions** → **Catalogue crawl** shows a
   `workflow_dispatch` run every half hour. Most end in seconds with
   "skipping this tick"; one every few hours harvests.

If the token expires, these runs stop and GitHub's own signals carry on as
today. Renew it and paste the new one into the cron job.

### 7b. A hard spending limit on Apify (2 minutes)

Apify console → **Settings** → **Usage & billing** (or **Limits**) → set the
monthly usage limit to the $5 free credit. The crawl already rations the paid
tier and checks the month's spend, but that check lets the run go ahead when
Apify's answer cannot be read; a limit on the account side cannot be argued
with.

### 7c. Two of your routines move an hour on 25 October (2 minutes)

UK clocks go back on 25 October. "ScentDay daily work run (9am UK)"
(`0 8 * * 1,3,5`) and "Daily status check-in (6am UK)" (`0 5 * * *`) are set
in UTC, so from then on they run at 8am and 5am UK. In the routine settings,
set them to `CRON_TZ=Europe/London 0 9 * * 1,3,5` and
`CRON_TZ=Europe/London 0 6 * * *`, or ask me to. The Deal of the Day, the
savings posts and the end of day job already use UK time. While there: the
end of day job's `git log --since=midnight` counts from midnight UTC, so in
summer it misses commits made between midnight and 1am UK; and the "How much
could you save?" routine's last run (3 October, 17:53 UK) failed after seven
seconds with no reason given, worth one look.

### 7d. The repository's size (done on 4 October; history rewritten 6 October; social pictures out of git 8 October; catalogue module out of git 10 October)

**The catalogue module out of git, 10 October 2026 (agent, your request
"build it at deploy time").** What changed:

- `demo/catalogue.generated.ts` (45 MB, every product and price) and
  `demo/dormant.generated.ts` (1 MB, the pages with no current prices) are no
  longer committed. The crawl still builds them (`npm run catalogue:demo`) and
  commits what they are built from: the shops' snapshots, the two address
  memories (`data/product-slugs.json`, `data/id-aliases.json`) and a new small
  build record, `data/catalogue-build.json` (the moment the build took as
  "now" and the fingerprint of every input). Everything that reads the
  catalogue (the deploy, `npm test`, `npm run demo`, the US and India crawls,
  the photo measuring, price alerts, fragrance links, the social scripts)
  builds it again from those first, in about 45 seconds
  (`scripts/ensure-catalogue-built.ts`).
- **Same site, proved.** The crawl's way (fresh build, then `npm run demo`)
  and the deploy's way (catalogue rebuilt from the committed record, then
  `npm run demo`) gave the same bytes for all 441 built files: the
  catalogue modules, `demo/data/`, the four sitemaps, every UK, US and India
  page. The rebuild also came out identical with the clock moved 12 days on,
  and when the snapshots on disk were newer than the record (it then takes the
  recorded ones out of git).
- **Addresses cannot change.** A rebuild outside the crawl never writes the
  address memories. If it would need a new product address or alias that the
  crawl has not recorded, it stops instead (the deploy fails and the site
  stays as it was), so a published address is always the crawl's. One small
  change on the way: three old addresses of products since merged into others
  (Amouage Opus XIV, Lancome O Oui, Mugler Alien Fusion) now open the product
  that holds them instead of Page Not Found.
- **Deploys:** about one minute longer (the catalogue rebuild: 37 to 45
  seconds locally). A crawl that rebuilt the catalogue still deploys (its
  build record changed); one that only saved prices still does not.
- **Growth:** the branch grew 9, 19 and 23 MB on 7, 8 and 9 October, of which
  the catalogue modules were 1.1, 7.3 and 4.9 MB: about a quarter of the
  daily growth stops (about 12 MB a day instead of 17), and every checkout is
  46 MB smaller. Measured as a push sends it; details in
  `docs/PIPELINE-FAILURE-MODES.md` ("The catalogue modules, 2026-10-10").
- **Live, 10 October.** Pushed as `d5a437c4` (with the merge `375cc0ce` and
  the rebuild `00b6f0f6`). Its deploy (run 38029977171) built the catalogue
  in 40 seconds and published at 06:13 UTC. The next real UK crawl (run
  38033192198, 07:05 to 08:45 UTC) harvested, rebuilt and committed the
  record, the memories, deals and price history and no catalogue module
  (`d662aacd`); its deploy (run 38038990013) rebuilt the catalogue in 40
  seconds and published at 08:49. The published data files carry the same
  content hashes as a rebuild of that commit on this machine
  (`catalogue.d116f8db…`, `deals.2951fabf…`, `dormant.1854b3e3…`).
  `https://pricesniffs.space/` answers 200; a product address
  (`/montblanc_explorer_extreme_60ml`) shows its page through the 404
  fallback, as every product address does (`docs/PRODUCT-URLS.md` section 7),
  and its prices are in the data file. Not new: the crawl's "Test everything
  else" step hits its 15 minute limit (it did on the 03:05 run before this
  change too); it only warns, and the harvest goes on.
- **What is yours to do: nothing now.** The catalogue's 743 past versions
  (about 210 MB, a third of the history) stay in history. Removing them is a
  further history rewrite with a force push, like 6 October, and only you can
  approve it. It is now possible (nothing needs those copies any more: the
  price history is replayed from the snapshots, not the catalogue; only the
  one off alias reseeding tool `scripts/id-alias-seed.sh` reads them, and the
  aliases it once seeded are in `data/id-aliases.json`) and
  recommended **once a week of crawls has run cleanly**, that is from about
  17 October; say "rewrite out the catalogue module" and an agent will plan it
  the 6 October way (pause the workflows, a backup branch, check the tip and
  the price history are identical, then push).


**Social pictures out of git, 8 October 2026 (your go ahead to D28, "only on
command").** What changed:

- Every post folder under `social/` keeps its text: the HTML or SVG each
  picture is drawn from, the captions, `check.json`, `source.md` and a new
  `pictures.json` (what each picture is drawn from, and the size, length and
  fingerprint of the file as first made). The 134 pictures and videos
  (129 PNGs, 17.5 MB; 5 MP4s, 9.0 MB) left the tree with `git rm --cached`:
  **26.6 MB less in every checkout**, and each new post adds a few kB of text
  instead of 0.6 to 2.9 MB. History was not rewritten: every picture committed
  before today is still in it.
- PNG, JPG, MP4 and the other picture types under `social/` are gitignored
  and "social" in `scripts/generated-files.txt`; `scripts/commit-and-push.sh`
  and the tests refuse them. The site never shows them: nothing is published.
- A push that changes a post starts the **Social pictures** workflow
  (`.github/workflows/social-pictures.yml`). It draws that post's pictures
  again from the committed text and keeps them as a private download for 90
  days. Drawn again on 8 October on a checkout without them, explainer
  slides, a Deal of the Day post, a savings post, a Deal of the Day video and
  both informative videos came out byte for byte identical to the committed
  files.

**How you get the pictures now** (instead of opening them on GitHub):

1. Open
   `https://github.com/yanakan19/YanaFragrancePriceChecker/actions/workflows/social-pictures.yml`,
   signed in (on a phone, in the browser rather than the GitHub app).
2. Tap the run that started just after the routine finished (it carries the
   commit's message; its summary lists the post's folder).
3. Under **Artifacts**, tap `social-pictures-<number>`: a zip with
   `posts/<folder>/` (pictures and captions) and `index.html`, which shows
   them all on one page.

**A past post:** in the same workflow, **Run workflow**, type the folder name
(for example `2026-10-04-savings`, or `all`), and tick "Restore the files as
first committed" for a post made before 8 October to get the exact originals.
On a computer: `npm run social:render -- social/posts/<folder>` (add
`--from-history` for the originals). Full details:
`docs/SOCIAL-MEDIA-PLAN.md` section 10.

**What is yours to do:**

- **Nothing, for the routines to keep working.** The Deal of the Day and
  "How much could you save?" routines read `social/DESIGN-SYSTEM.md` first
  and it wins over their prompts; its new section 10 tells them to commit
  the folder (git leaves the pictures out) and to give you the workflow's
  link. They still draw the pictures and look at them before committing. The
  end of day update routine never touched the pictures.
- **Optional, 2 minutes:** in those two routines' prompts, in the reply
  step, after "the path of `post-9x16.png`" (Deal of the Day) and "the six
  3:4 PNG paths" (savings), add: "These files are not committed: give the
  link https://github.com/yanakan19/YanaFragrancePriceChecker/actions/workflows/social-pictures.yml
  where I download them (social/DESIGN-SYSTEM.md section 10)." And in the
  commit step: "Stage the folder, never a PNG by name."
- The first download needs you signed in to GitHub. After 90 days a run's
  download expires; run the workflow by hand to make it again.

**History rewritten, 6 October 2026 (owner's explicit, one off exception to
"never force push").** What was done, in order:

1. Plan: measured the live branch packed (single branch, repacked): 643 MiB,
   2,273 commits. The old page files no longer committed were 263 MB of it
   (`demo/404.html` 172, `demo/data` 82, `demo/sitemap.xml` 8, `demo/index.html`
   0.4), next to `data/catalogue` 189, `demo/catalogue.generated.ts` 133,
   `social` 22. Chosen: the least risky rewrite, dropping only
   `demo/index.html`, `demo/404.html`, `demo/data/`, `demo/sitemap.xml` and
   `demo/ads.txt` from every commit (`git filter-repo --invert-paths`). None of
   them is in the tip, so the tip tree stays the same; every snapshot, commit
   date and file still at the tip (the slugs and id aliases memories, the
   social images) is untouched. Squashing old history was rejected: the price
   history is replayed from it.
2. Backup: the old tip `2e54cdb5` was pushed to the branch
   `backup/pre-rewrite-2026-10-06` (a tag push was refused by the session's
   proxy).
3. Paused: the six workflows that commit (catalogue crawl, delivery re-check,
   fragrance links, image check, bottle measuring, price verification) were
   disabled through the API for the duration, then enabled again.
4. Checked before the push: tip tree hash identical (`d6f6a262`); a full
   price history replay (`catalogue:history -- --full`) on the old and the
   rewritten history gave a byte identical `demo/priceHistory.generated.ts`
   (sha256 `4c03521b…`) and a checkpoint differing only in its commit id;
   `npm run demo` and the whole test suite passed on the rewritten tree.
5. Pushed with `--force-with-lease` against `2e54cdb5`. Result: 2,235 commits
   (38 that only touched page files are gone), 392 MiB packed instead of
   643 MiB. Every commit id changed; filter-repo rewrote ids quoted in commit
   messages, but ids quoted in docs now resolve only in the backup branch, or
   through `docs/history-rewrite-2026-10-06-commit-map.txt` (old id, new id).
   The checkpoint's commit id went with them, so the first price history
   rebuild after the push replays from the start (about ten minutes), by
   itself.

**What is still yours to do:**

- **Every old clone must be thrown away**: your other Claude sessions,
  worktrees and any local copy. Clone again
  (`git clone https://github.com/yanakan19/YanaFragrancePriceChecker`). An old
  clone that merges and pushes puts the old history back.
- **The size GitHub shows does not drop by itself.** The old history is still
  reachable from: the backup branch; the other branches
  (`claude/modest-euler-3hwly2`, `claude/perfume-chatbot-multi-agent-lvf17y`,
  `claude/relaxed-brahmagupta-wmey28`, `claude/wizardly-faraday-owdlz1`,
  `claude/wonderful-brahmagupta-8edg4h`), which were not touched; and the pull
  request refs `refs/pull/1` to `refs/pull/4`, which only GitHub can remove.
  When you no longer need them: delete the old branches and the backup branch
  (Code → Branches), then ask GitHub Support to remove the pull request refs
  and run garbage collection on the repository. Until then a full clone
  fetches the old objects through those refs (the rewrite itself added only
  1.6 MB of new commits and trees). Where each of these stands, and the text
  to send to Support: "Cleanup, 10 October 2026" just below.
- **To undo** (only if something turns out wrong, and before anything new is
  committed on top): pause the workflows again, then
  `git push --force-with-lease=claude/scentday-retailer-registry-h92tth:<current tip> origin origin/backup/pre-rewrite-2026-10-06:refs/heads/claude/scentday-retailer-registry-h92tth`,
  and clone again everywhere. Commits made after the rewrite would have to be
  cherry picked onto it.

**Cleanup, 10 October 2026 (agent review; replaces the table of 8 October).**
Every branch was compared with the live branch by ancestry, `git cherry` and,
for work merged by hand, by content. The tip of each is listed, so a deleted
branch can be recreated until GitHub's garbage collection runs (a branch
with a pull request also has a **Restore branch** button on that pull
request's page). This session cannot delete branches; the steps below
are yours and take about two minutes.

| Branch | Tip | Last commit | Pull request | Verdict |
|---|---|---|---|---|
| `backup/pre-rewrite-2026-10-06` | `2e54cdb5` | 6 Oct, the old tip before the rewrite | none | **Delete** (you approved it). It alone keeps the whole old history; the rewrite was checked identical and has run four days |
| `claude/relaxed-brahmagupta-wmey28` | `6455989b` | 1 Oct, service worker on deep links | #1, merged 1 Oct | **Delete**. Merged; the tip is `a4e62705` on the live branch |
| `claude/wizardly-faraday-owdlz1` | `e98e4a25` | 1 Oct, catalogue in one `data.json` | #2, closed 6 Oct | **Delete**. Superseded by the hashed data files and the deploy time build |
| `claude/modest-euler-3hwly2` | `b444d261` | 3 Oct, parser: ProductGroup variant by address | #3, closed 6 Oct | **Delete**. Reapplied on the live branch on 8 Oct as `f8377717` ("Parser: a ProductGroup's own variant by page address, every size first"); `src/catalogue/jsonld.ts` there has the address fallback |
| `claude/wonderful-brahmagupta-8edg4h` | `dff4ab94` | 7 Oct, merge of the live branch | #4 (closed 6 Oct, merged in substance as `12ff8f3a`) and #5 (merged 9 Oct) | **Delete**. Its tip is an ancestor of the live branch (merged as `588b302d`) |
| `four-shops-20261008` | `c4920520` | 8 Oct, Gorgeous Shop switched on | none | **Delete**. Its tip is an ancestor of the live branch: nothing unmerged |
| `claude/tender-cerf-d3t6wo` | `dbe9a79d` | 9 Oct, note merge test follows the catalogue | #6, **open** | **Delete**, and close #6. Its one commit (tests only) is not on the live branch, but the same test was rewritten there the same evening as rules with no counts (`ce66e9da`, "Make two data tests check rules, not live values"), which supersedes it |
| `claude/perfume-chatbot-multi-agent-lvf17y` | `1dd47e83` | 12 Aug, Fly.io configs for the chatbot | none | **Keep, your call.** Five commits never merged: the `YanaFreeAPIMerger/` chatbot prototype, your `SETUP_LOG.md` setup notes, the Oracle VM and Fly.io files. It holds the old history only up to 12 August (220 commits, before the big page files), so keeping it costs little. To keep the notes without the branch: switch to it on GitHub, Code → Download ZIP, then delete it like the others |
| `claude/scentday-retailer-registry-h92tth` | | | | The live and default branch. Never delete |

**Step 1, delete the seven branches (1 minute).** On GitHub:
**Code** → **Branches** (or
`https://github.com/yanakan19/YanaFragrancePriceChecker/branches/all`) → the
bin icon at the right of each branch marked Delete above. Or, from any
up to date clone:

```sh
git push origin --delete backup/pre-rewrite-2026-10-06
git push origin --delete claude/relaxed-brahmagupta-wmey28
git push origin --delete claude/wizardly-faraday-owdlz1
git push origin --delete claude/modest-euler-3hwly2
git push origin --delete claude/wonderful-brahmagupta-8edg4h
git push origin --delete four-shops-20261008
git push origin --delete claude/tender-cerf-d3t6wo
```

To recreate one deleted by mistake (before garbage collection), push its
full tip id back from a clone that has it, for example the backup:
`git push origin 2e54cdb5bc91fee45527e6582631786574caa30b:refs/heads/backup/pre-rewrite-2026-10-06`.
The other full tip ids: relaxed `6455989b340218ac9bd3e4fa9d64f1862021d94b`,
wizardly `e98e4a257d3fbbf48457ea1c8aea6fc0f3115270`, modest
`b444d2613f2ac6ebcb8aa5ff1a61ff737ae5ef3f`, wonderful
`dff4ab94c0aabd93179dcc9283721bac6ecf19d3`, four-shops
`c4920520003e995b711bdcad1e14610d9fc8c124`, tender
`dbe9a79dca3368552a3a723982fd976fc3f6e92c`, chatbot
`1dd47e831098292a65f9a9dd6b632026c9a24f7a`.

**Step 2, close the open pull request (30 seconds).** Only **#6** is still
open (its branch `claude/tender-cerf-d3t6wo` goes in step 1; deleting the
branch first closes it for you). If it is still open: **Pull requests** → #6 →
**Close pull request**, with a comment such as "Superseded by ce66e9da on
the live branch." #1 to #5 are already merged or closed.

**Step 3, the request to GitHub Support (only you can send it).** Send it
**after** step 1: garbage collection removes only what no branch or ref
reaches. Where: `https://support.github.com/contact`, signed in as the
owner. Pick the account `yanakan19` and the topic closest to repository
maintenance (removing cached pull request refs or data from a repository;
the form's wording changes, so choose the nearest repository or Git topic it
offers). Copy this:

```text
Subject: Remove old pull request refs and run garbage collection on yanakan19/YanaFragrancePriceChecker

Hello,

I own the repository yanakan19/YanaFragrancePriceChecker. On 6 October 2026
(the force push was at about 18:57 UTC) I rewrote the history of its default
branch, claude/scentday-retailer-registry-h92tth, with git filter-repo to
remove large generated files (demo/index.html, demo/404.html, demo/data/,
demo/sitemap.xml, demo/ads.txt) from every commit. Today I deleted every
other branch that pointed at the old history, including the backup branch.

The old objects are still reachable only through the head refs of four
closed pull requests (there are no merge refs for them):

  refs/pull/1/head  6455989b340218ac9bd3e4fa9d64f1862021d94b
  refs/pull/2/head  e98e4a257d3fbbf48457ea1c8aea6fc0f3115270
  refs/pull/3/head  b444d2613f2ac6ebcb8aa5ff1a61ff737ae5ef3f
  refs/pull/4/head  4ced52a220561c3f4e5043b7c622dccea3288995

Please remove those four refs (the pull requests themselves can stay,
closed) and run garbage collection on the repository, so that the
unreachable objects are pruned and the repository size reflects the
rewritten history. refs/pull/5 and refs/pull/6 are on the new history and
can stay.

The repository reports about 774 MB today; the rewritten branch packs to
roughly 400 MiB.

Thank you.
```

Size to compare afterwards: GitHub reported **773,663 kB** on 10 October
2026 (`gh api repos/yanakan19/YanaFragrancePriceChecker --jq .size`, or the
repository's Settings page). After Support's garbage collection it should
fall by about 170 MB or more (the old page files), less whatever the crawl
has added in between.

Live site, 8 October. The deploy of the guides commit (`920f1ecf`, pushed
23:12 UTC on 7 October) is deploy-pages run #1301, finished 23:15 UTC; the
later runs up to #1305 found nothing new to deploy. `curl -sI` answered 200
for `/about/legal`, `/about/how-we-check-prices` and `/guides`, and 404 for
the product address `/jimmy_choo_i_want_choo_forever_60ml`, which is the
host's normal answer for a product page (`docs/PRODUCT-URLS.md`, section 7):
the page itself shows.

Size: GitHub reported 684,131 kB on 8 October (754,338 kB on 5 October). It
drops to about the rewritten size only after Support's garbage collection.

The section below is the earlier plan, kept for the record.

**Done, nothing for you to do.** The built page and its data files are no
longer committed: the deploy builds them from the branch before each
deployment (`deploy-pages.yml`), and the price history checkpoint is smaller
and committed less often. Those were about two thirds of the daily growth;
the numbers are in `docs/PIPELINE-FAILURE-MODES.md` ("Repository growth").
Growth on a busy crawl day goes from 40 to 60 MB to about 13 to 14 MB, plus
whatever the social routines commit.

**One small thing.** If the end of day changelog routine's prompt says to
commit `demo/index.html` and `demo/404.html`, change it to commit
`demo/changelog.ts` only (the suggested prompt at the bottom of
`scripts/changelog-suggest.ts` now says that). Committing those files is now
refused, so the routine would stop with an error instead.

**Decision 1, optional: shrink what is already there.** GitHub reported
754,338 kB at 03:00 UTC on 5 October (651 MB on the morning of 4 October). The page files that are no longer committed still sit in the
history: repacked locally they are about 255 of 626 MB (the old
`demo/404.html` with the data inside it 172 MB, `demo/data` 75 MB, the
sitemap 8 MB). Only rewriting history removes them, which nobody but you
should do, and only if slow checkouts start to matter:

1. Pause the crawl and every other workflow (Actions → each workflow →
   **Disable workflow**), and tell anyone working on the branch to stop.
2. Make a full backup: `git clone --mirror https://github.com/yanakan19/YanaFragrancePriceChecker backup.git`.
3. In a fresh mirror clone, with `git-filter-repo` installed:
   `git filter-repo --invert-paths --path demo/index.html --path demo/404.html --path demo/data --path demo/sitemap.xml --path demo/ads.txt`.
   This keeps every snapshot under `data/catalogue` and every commit date,
   which is what the price history is rebuilt from.
4. Check before pushing: in a normal clone of the rewritten repository run
   `npm ci && npm run catalogue:history -- --full` and compare
   `demo/priceHistory.generated.ts` with the branch's: it must be identical.
5. Force push the branch (only you), then ask GitHub Support to run garbage
   collection on the repository, or the size GitHub shows does not drop.
6. Re-enable the workflows. Every existing clone, worktree and agent sandbox
   must clone again; an old clone that pushes would bring the old history back.

Risks: every commit gets a new id, so commit ids quoted in docs and commit
messages stop resolving, and the price history checkpoint's commit id goes
too (the first rebuild then replays from the start, about ten minutes, by
itself). Anyone who pushes from an old clone undoes it. Low value unless
checkouts become a problem: the crawl's checkout took 43 to 69 seconds.

**Decision 2, optional: the social images.** The social routines commit
their rendered PNGs under `social/`: 19.8 MB in the last week, 9.6 MB on
4 October alone, now the biggest single item. Options: keep as is; keep only
the posts' text and settings in git and render the images when needed; or
delete a post's images once it is published. Say which you prefer.

*Update, 6 October:* the crawl's own growth is now much smaller (see
`docs/TRACKING-AND-STORAGE-STRATEGY.md`, "Size per month"), which makes the
social images the largest thing left: 2 to 4 MB on an ordinary day
(a Deal of the Day is 0.6 MB, each savings carousel 1.7 MB), about a third
of everything the repository gains. Deleting images after posting does not
help (git keeps them in its history). Nothing was changed, because the
routines are yours and every option changes how you get the pictures. The
recommendation, if you want it: keep committing each post's HTML, captions
and `check.json`, stop committing its PNGs, and have the deploy render them
and publish them at `pricesniffs.space/social/<post folder>/` for two weeks,
so you open them on your phone as you do on GitHub today. Say "do the social
images" and an agent will build that and change the routines' instructions
(`social/DESIGN-SYSTEM.md`); the posts already committed stay as they are.

*Done, 8 October:* you said yes; built as described at the top of this
section, with one change: the pictures are a private download from the
workflow, not a page on pricesniffs.space.

*Checked again, 9 October (repository tidy, `docs/REPO-TIDY-2026-10-09.md`):*
nothing for you to do unless you want the repository smaller still. The
local copy of the history is about 920 MB. Two things are left, both yours:

- **The old page files** (about 170 MB) are still reached only by the backup
  branch, the old branches and the closed pull requests in the table above.
  Deleting those and sending the Support request above removes them, with no
  rewrite (reviewed again on 10 October: "Cleanup, 10 October 2026" above).
- **The catalogue module** (`demo/catalogue.generated.ts`, 45 MB, committed
  by the crawl several times a day) is now a third of the history (about
  210 MB). Stopping that growth means building it at deploy time like the
  page; removing its past versions would take another history rewrite. Say
  "plan the catalogue module" if you want an agent to work out the first;
  nobody should do the second without you.

**Optional: the "Verified" badge on commits.** Moved here from the README
on 9 October; nothing is broken without it. GitHub → **Settings** → **SSH and
GPG keys** → **New SSH key** → **Key type: Signing Key** → paste the key in
`docs/DECISIONS.md` D16 → **Add SSH key**. It only marks commits made as
`urkoppan@gmail.com`. The workflows' own signed commits can be switched off
with a repository variable `SIGNED_COMMITS` = `off` (D19).

---

## 8. Developer dashboard (10 minutes)

Your private page at **pricesniffs.space/developer**: visitors (with a
country filter and Hour, Day, Week, Month and Year views), Shop Clicks (the
products, brands and shops people click through to, which is what earns
commission), every brand and every shop with its number of listings and
Hide, Remove and Show Again, and places for AdSense and Stripe. Only your
account can open it; to anyone else it is the ordinary Page Not Found, it is
linked from nowhere and search engines are told to leave it alone.

Until you do this, nothing is counted and the site works exactly as it does
now. If you open /developer while signed in before step 8a, it says "Not Set
Up Yet" and shows these steps with your own account id already filled in.
Do step 2 of this file (accounts) first.

### 8a. Run the database script

Supabase dashboard → **SQL Editor** → **New query** → paste the whole of
`supabase/migrations/0007_site_stats.sql` → **Run**. It must say success. It
is safe to run twice. There is no Edge Function to deploy: everything is in
that one script.

### 8b. Make your account the owner

1. Sign in on the live site with your own account and open
   **pricesniffs.space/developer**. It shows "Not Set Up Yet" and, in step 2,
   the exact line with your account id in it. Copy it.
   (Or find the id yourself: Supabase → **Authentication** → **Users** → your
   address → **User UID**.)
2. SQL Editor → **New query** → paste it and **Run**:

   ```sql
   update public.profiles set is_admin = true
   where id = 'YOUR-ACCOUNT-ID';
   ```

   It should say "1 row affected". Nobody can set this flag from the site or
   the API, only here, and no address or id of yours is written anywhere in
   the code.
3. Reload /developer. You should see the dashboard.

### 8c. Start counting

Counting starts with the next deploy of the site, which happens after every
price crawl (several times a day). To start it now: GitHub → **Actions** →
**Deploy site** → **Run workflow**. The deploy log's "Build the site" step
then says `counter on`.

### 8d. Check the countries are coming through (the day after)

The country of a visit comes from Cloudflare, which sits in front of
Supabase and attaches it to each request as a two letter code; the site
never looks up or stores an IP address. To check it is arriving, run:

```sql
select country, sum(views) as views, sum(visits) as visits
from public.site_page_views
group by country order by views desc;
```

You should see codes such as `GB`. If every row has an empty country, the
header is not reaching the database: tell me, and the dashboard keeps
showing those visits as "Unknown" rather than guessing.

### 8e. Keep the counts small (2 minutes, optional but recommended)

**If you ran `0007_site_stats.sql` before the evening of 6 October, run it
again** (it is safe to run twice). Its first version could never count a
click through to a shop: Postgres refused one of its patterns, so every
click failed silently. Page views were not affected.

Then SQL Editor → **New query** → paste the whole of
`supabase/migrations/0008_site_stats_limits.sql` → **Run**. It is safe to
run twice and changes nothing a visitor sees. It does two things:

- **A cap.** An hour holds at most 2,000 rows of page views and 2,000 of
  clicks. Past that, a new page is added to the "/other" row instead of a
  row of its own, so every view is still counted. Without it, anyone with the
  site's public key could fill the free plan's 500 MB database with made up
  page names, which would also stop sign in, wishlists and alerts.
- **A daily fold** at 03:23 UTC: hourly rows older than three days become
  one row per day, and rows older than 13 months one row per month. Every
  bar on the dashboard stays the same (its Hour view only covers the last
  24 hours).

If the result mentions that `pg_cron` is not available, the daily fold is not
scheduled: switch on **Integrations** → **Cron** in the Supabase dashboard and
run the script again, or run `select public.site_stats_compact();` now and
then. To check the job exists: `select jobname, schedule from cron.job;`
should list `site-stats-compact`. Why, and the numbers behind it:
`docs/TRACKING-AND-STORAGE-STRATEGY.md`.

### What Hide, Remove and Show Again do

- **Hide**: the brand or shop disappears from the site on every visitor's
  next page load. Its data is kept, so **Show Again** brings it back the
  same way.
- **Remove**: hidden, and also left out of the next build of the site. A
  removed shop is no longer crawled either. **Show Again** brings it back
  with the next deploy (and the next crawl, for a shop). The deploy checks
  the list after every crawl run, which your outside scheduler (7a) starts
  every half hour, and rebuilds the site when it changed, so either reaches
  the build within about half an hour. If that scheduler ever stops, GitHub's
  own half hourly check is the fallback, and GitHub skips many of its ticks.
- The list lives in the database (`site_overrides`), on top of the code's own
  list of shops in `src/config/retailers.ts`, which does not change. To clear
  everything at once: `delete from public.site_overrides;`

The counts keep only hourly totals per page, country and linking site, and
per product, shop and country for clicks. Anyone could in principle add to a
total with the public key, so treat a sudden spike from nowhere with
suspicion; nobody but you can read them. If the tables ever grow large, old
hours can be deleted with, for example,
`delete from public.site_page_views where hour < now() - interval '2 years';`

### Later: connect Google AdSense and Stripe

The dashboard has a card for each, marked **Not Connected**. Both need a
secret (an AdSense sign in, a Stripe key) that must never be in the code or
the page, so each is connected through a small Supabase Edge Function that
holds the secret and answers only you.

- **AdSense**: once the site is approved (section 5), switch on the AdSense
  Management API in Google Cloud, create an OAuth client, and sign in once to
  get a refresh token. Store it in Supabase → **Edge Functions** → **Secrets**
  (never in GitHub or the code), then tell me and I will add the function and
  fill the card: ad earnings, ad views and ad clicks by day.
- **Stripe**: once the account is open (docs/STRIPE-SETUP.md), make a
  **restricted key** with read access to balances, charges and subscriptions
  only, store it the same way, then tell me. The card then shows
  subscribers, payments and refunds.

---

## 9. Notino: bring its prices back from pages you save (optional, 5 minutes a week)

Notino blocks automatic readers, so the crawl cannot read its prices. Until
the CJ affiliate route in `docs/NOTINO-PLAN.md` is approved, you can keep
products visible by saving Notino pages yourself. Notino's terms may limit
copying, so keep it small and occasional, and stop if Notino objects.

1. Open a **private (incognito) window** in your browser and go to
   notino.co.uk. Do not log in. A private window means no account, name or
   email is in the page.
2. Open a brand page, a search results page or a single product page. Scroll
   down once so the list has loaded, and click the size you want on a product
   page (each size is its own price).
3. Save it. Quickest: the **Save for PriceSniffs** bookmark. Install it once:
   run `npm run -s catalogue:bookmarklet` (or ask me for the line), make a new
   bookmark and paste that line as its address. One click on a Notino page
   downloads a small file holding only the page's product data (the JSON-LD
   blocks of type Product, ProductGroup, ItemList or CollectionPage), its
   address and the time. It leaves behind the rest of the page, including any
   account or Person block, but still use the private window of steps 1 and 2:
   that is the sure way to have no account data in the page at all.
   Put the files in `data/notino-inbox/`, or send them to me.

   Or save it yourself: **Ctrl+S** (Cmd+S on a Mac), choose "Webpage, HTML only" or
   "Webpage, Complete", and save it into the folder `data/notino-inbox/` in
   the project (make the folder if it is not there). One file per page. The
   file's saved time is taken as the day you read the prices.
4. Run `npm run notino:import`. It lists each file with how many products it
   found, and refuses a "Just a moment" page or a page from another site. Add
   `-- --dry-run` to look without saving.
5. Prices show for 7 days after the day you saved the page, so repeat weekly.
   The pages are never committed: the folder is ignored, and the importer
   keeps only product facts (name, brand, size, barcode, price, stock, image,
   notes, delivery) and discards everything else. Delete the saved files when
   done.
6. Notino is switched on on the site again (owner, 2026-10-07, D31). It does
   not crawl and no weekly or monthly check asks it for anything: its only
   source is these saved pages. A price leaves the site 7 days after the day it
   was read. The 9 products saved on 7 October left on 14 October; save the
   pages again (steps 1 to 4) to bring them back.
7. After `npm run notino:import`, run `npm run rebuild` and commit
   `data/catalogue/notino-uk.json` with the rebuilt files, as in CLAUDE.md (or
   ask me to).

## 10. The US and India (public beta since 9 October 2026)

Your decisions are D30 in `docs/DECISIONS.md`; what shipped is
`docs/INTERNATIONAL-PLAN.md`, "Public beta, 9 October 2026: what shipped".
pricesniffs.space/us/ and pricesniffs.space/in/ are live as a public beta,
the country menu lists "United States (Beta)" and "India (Beta)", and the
"Select your country" pop-up is on. The US and Indian crawls run once a day
by themselves (07:52 and 20:22 UTC); each finished run redeploys the site when
it brought new prices.

0. **Add /us/ and /in/ to Google Search Console (10 minutes).** If the
   property is the whole domain (a "Domain" property for pricesniffs.space),
   they are already covered: open it, go to **Sitemaps**, and submit
   `https://pricesniffs.space/sitemap.xml` again (it is now an index of three
   sitemaps, one per country). If the property is the URL prefix
   `https://pricesniffs.space/`, the folders are inside it too: submit the
   sitemap the same way. Optionally add `https://pricesniffs.space/us/` and
   `https://pricesniffs.space/in/` as URL prefix properties of their own, to
   see each country's searches separately (verified at once through the
   domain's existing verification). Under **Settings, International
   Targeting** there is nothing to set: the pages declare their language and
   country themselves (hreflang).
1. **Done 9 October 2026:** you answered the photo question (D24) yes for the US
   shops, the India shops, the 16 UK shops added on 8 and 9 October and Glossier
   UK. Their photos are hot-linked from each shop's own page (docs/DECISIONS.md
   D24); US and India tiles fill in as the daily crawls read each shop again.
2. **Done 9 October 2026, and checked:** you ran
   `supabase/migrations/0009_profile_region.sql` in the Supabase SQL Editor
   (a nullable `region` column on `profiles`; safe to run twice). Checked the
   same day from outside with only the public key, no sign in and nothing
   written: `GET https://kemjyocklbkgjsyfdqtf.supabase.co/rest/v1/profiles?select=region&limit=0`
   answered **200** with `[]` (the column exists; the security rules show a
   signed out visitor no rows), while the same request for a made up column
   answered 400 "column profiles.region_does_not_exist does not exist". The
   site uses the column once a second country is live: a signed in visitor's
   chosen country is saved on their profile and follows them to another
   device, and the profile page gets a **Country** row
   (`docs/INTERNATIONAL-PLAN.md`, "Remembered preference"). Nothing more to
   do.
3. **Before any money is earned in the US or India**, have the US and India
   legal pages reviewed (decision 8): pricesniffs.space/us/about/legal and
   pricesniffs.space/in/about/legal (terms, privacy, affiliate disclosure,
   refunds; the words are in `demo/legalRegion.ts`). They are plain and short
   on purpose. Nothing earns money there today (no affiliate links, no
   personalised ads), and nothing should until the review is done.
   **Decided 9 October 2026 and built:** Indian sign ups must tick "I am 18 or
   over" (the DPDP Act; the form blocks sign up with a pop-up until it is
   ticked, and the Indian privacy notice says so). Nothing is stored: no
   column, no migration, so there is no record of the tick beyond the account
   itself. Still yours to decide, with the legal review: whether the law
   needs a stored record (a date and the notice version on the profile). If it
   does, ask for it and it is one nullable column plus a write at sign up.
   Sign in is by email and password only, so no other path skips the form.
4. Affiliate sign ups (Awin US, CJ, Rakuten, Impact, Skimlinks, the Indian
   networks) are for later (decision 6).

- D.S. & Durga, Imaginary Authors, Beautyhabit, Maison Louis Marie and Ellis Brooklyn are US only (in dollars, 9 Oct 2026). If you want them on the UK site, a basket check must first confirm each checkout charges pounds (Nicchia precedent); until then they stay off the UK site.
