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
free and is served with the ad code, so the site has no banner of its own.

1. Left menu → **Privacy & messaging** → **European regulations** (GDPR) →
   **Create message** (or **Manage** if one exists).
2. Site: `pricesniffs.space`. Language: **English**.
3. User choices: tick **Consent**, **Manage options** and **Do not
   consent**. Offering a plain no next to yes is what the UK regulator, the
   ICO, expects.
4. In the message's **Privacy policy link** field (on the message editor,
   under the site and language), paste
   `https://pricesniffs.space/about/legal#privacy`. Since 2026-10-06 the
   privacy notice is a section of the Legal Notice page and that is its
   address. A message already published with the older
   `https://pricesniffs.space/legal/privacy` still works (that address opens
   the same section), but change it: **Privacy & messaging** → **European
   regulations** → the message → **Edit** → the same field → **Publish**.
5. **Publish**. It now appears on the site the first time a UK or EEA
   visitor reaches a page with an ad.
6. Leave the **US state regulations** message off unless you want US
   visitors to get one too; it is not needed for the UK.

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

### 7d. The repository's size (done on 4 October; two optional decisions left)

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
