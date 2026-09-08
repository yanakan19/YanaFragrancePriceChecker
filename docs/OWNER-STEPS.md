# Owner steps, in plain English

Four jobs only you can do. Each one is short. Do them in this order; the
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

2. **Run the two database scripts.** Left menu → **SQL Editor** →
   **New query**. Open the file `supabase/migrations/0001_profiles.sql` from
   the repo on GitHub, copy the whole thing, paste it in, click **Run**.
   It must say success. Then do the same with
   `supabase/migrations/0002_wishlists.sql`. Order matters: 0001 first.

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
