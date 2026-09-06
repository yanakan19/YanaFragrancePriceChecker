# Virtual Yanny deployment

Virtual Yanny is the chat widget in the corner of pricesniffs.space
(`demo/app.ts`, `demo/virtualYanny.ts`). Since 2026-09-06 it has two halves,
and only one of them needs hosting:

1. **The catalogue half runs in the reader's browser.** `demo/yanny/` is
   bundled into the site. Prices, stock, sizes, notes, delivery, deals,
   budgets, comparisons, brand coverage and questions about the site are
   answered from the catalogue the page already holds, in milliseconds,
   with no request made. This half is live the moment the site is
   published and needs nothing below.
2. **The model half is a Cloudflare Worker** (`workers/yanny/`). Open
   questions — "something sweet, no florals", "do you have anything nice",
   "how do you make money" — go there with the catalogue extract they need
   already built, and the Worker forwards them to one or two free-tier
   models with the owner's own keys. It holds no data and no state.

Nothing here costs money. Cloudflare Workers' free plan (100,000 requests
a day, no card required) and the providers' free tiers are the whole bill.

## What this replaced, and why

Until 2026-09-06 every question went to an Express service on Fly.io
(`YanaFreeAPIMerger/`, now deleted), which resumed a suspended machine,
parsed a 15 MB catalogue, and fanned the question out to 28 models behind a
shared FreeLLMAPI router that was itself a second Fly app. The owner was
billed for Fly, and every answer — including the eleven-in-thirteen that
were catalogue lookups — waited on that chain. The catalogue half now costs
nothing and needs no server; the model half needs one HTTP call.

**Fly.io is no longer used by anything in this repo.** The owner should
delete both apps (`pricesniffs-yanny` and `yanny-freellmapi`) in the Fly
dashboard and remove the payment method, so nothing can be billed. Nothing
in this repository references them any more; deleting them cannot break the
site.

## Setting up the model half (once, about fifteen minutes)

### 1. Free provider keys

At least one of these; both is better, because the Worker asks both at once
and sends whichever answers first:

- **Groq**: console.groq.com → API Keys → Create. Free tier.
- **Google AI Studio**: aistudio.google.com → Get API key. Free tier.

Optional: Cerebras (cloud.cerebras.ai) or OpenRouter. Any other
OpenAI-compatible endpoint works as the `custom` provider.

### 2. A Cloudflare account

dash.cloudflare.com, free plan. Note the **Account ID** from the Workers &
Pages overview. Create an API token at My Profile → API Tokens using the
**Edit Cloudflare Workers** template.

### 3. Deploy

Either press the button — Actions → **Deploy Virtual Yanny worker** → Run
workflow, after adding these repository secrets under Settings → Secrets
and variables → Actions:

| secret | value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | the account id from step 2 |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | the keys from step 1 (either or both) |

— or run it from a terminal at the repo root:

```
npx wrangler login
npx wrangler deploy --config workers/yanny/wrangler.toml
npx wrangler secret put GROQ_API_KEY   --config workers/yanny/wrangler.toml
npx wrangler secret put GEMINI_API_KEY --config workers/yanny/wrangler.toml
```

Either way the deploy prints the Worker's URL
(`https://pricesniffs-yanny.<your-subdomain>.workers.dev`). Check
`<url>/api/health`: it must report `ok: true`, `configured: true` and at
least one reachable provider. The `providers` list says which key or model
id was rejected if not.

### 4. Point the site at it

Set `VIRTUAL_YANNY_API_BASE_URL` in `demo/virtualYanny.ts` to that URL, run
`npm run demo`, commit `demo/virtualYanny.ts`, `demo/index.html` and
`demo/404.html`, push. Until this is done the widget answers every catalogue
question and says, for an open one, that the AI side is not connected yet.

### Which models

`workers/yanny/wrangler.toml` lists them under `YANNY_MODELS`. Keep it to
two or three: every entry spends one request on that provider's daily free
allowance per question. The ids must be ones the provider currently serves
on its free tier — `/api/health` reports an id the provider rejects. Change
the list, redeploy.

## What the Worker refuses

This repo is public and the Worker holds real keys, so it is not an open
proxy: it only accepts `POST /api/chat` from the origins in
`ALLOWED_ORIGINS`, caps the question at 500 characters and the catalogue
extract at 16,000, rate-limits each IP to 20 questions a minute, fixes the
system prompt server-side, caps `max_tokens`, and bounds every provider
call with a timeout. A model answer is checked against the extract it was
given (`groundednessScore` in `demo/yanny/scoring.js`); the first answer
that passes is sent, and if none does the best is sent marked unchecked,
which the widget says out loud.

## Privacy

Catalogue questions never leave the browser. An open question, with the
catalogue extract, goes to Cloudflare and then to Groq or Google. Neither
the Worker nor this site stores it. `demo/legal.ts`'s privacy notice says
exactly this and names both processors; if the provider list changes,
change the notice first.

## Local development

`npx wrangler dev --config workers/yanny/wrangler.toml` runs the Worker on
localhost with a `.dev.vars` file holding the keys (git-ignored; never
commit it). Add the local site origin to `ALLOWED_ORIGINS` for the session
and take it out again. The catalogue half needs nothing: build the site and
open it.
