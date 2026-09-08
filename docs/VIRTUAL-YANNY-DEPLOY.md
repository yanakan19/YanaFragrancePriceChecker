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
   already built, and the Worker answers them with Cloudflare's own AI. It
   holds no data, no state and no API key.

Nothing here costs money, and nothing here needs an account beyond
Cloudflare itself: the Workers free plan is 100,000 requests a day and the
Workers AI free allocation is 10,000 Neurons a day, neither of which asks
for a card.

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

## Setting up the model half (once, about ten minutes)

**No AI provider key is needed.** The Worker answers through Cloudflare's
own inference, reached as a binding (`env.AI`) rather than over HTTP with
somebody else's credential. Every Cloudflare account, free ones with no card
included, gets 10,000 Neurons a day at no charge — thousands of answers,
against a widget where only two of thirteen question shapes reach a model at
all.

That is a deliberate default rather than the cheapest thing that worked. A
binding cannot leak, cannot be rotated out from under the deploy, and needs
no second and third sign-up before the chat says anything.

### 1. A free Cloudflare account

dash.cloudflare.com, free plan, no card. Note the **Account ID** from the
Workers & Pages overview. Create an API token at My Profile → API Tokens
using the **Edit Cloudflare Workers** template.

### 2. Deploy

Either press the button — Actions → **Deploy Virtual Yanny worker** → Run
workflow, after adding two repository secrets under Settings → Secrets and
variables → Actions:

| secret | value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | the account id from step 1 |

— or run it from a terminal at the repo root, which needs no token at all
because `wrangler login` authenticates through the browser:

```
npx wrangler login
npx wrangler deploy --config workers/yanny/wrangler.toml
```

Either way the deploy prints the Worker's URL
(`https://pricesniffs-yanny.<your-subdomain>.workers.dev`). Check
`<url>/api/health`: it must report `ok: true`, `configured: true` and at
least one reachable provider. `configured: false` means the `[ai]` binding
is missing from `workers/yanny/wrangler.toml`.

### 3. Point the site at it

Set `VIRTUAL_YANNY_API_BASE_URL` in `demo/virtualYanny.ts` to that URL, run
`npm run demo`, commit `demo/virtualYanny.ts`, `demo/index.html` and
`demo/404.html`, push. Until this is done the widget answers every catalogue
question and says, for an open one, that the AI side is not connected yet.

### Adding a third-party model as a fallback (optional)

Only worth doing if the daily allocation ever genuinely runs out. Get a free
key from Groq (console.groq.com) or Google AI Studio (aistudio.google.com),
set it as a Worker secret, and append that provider to `YANNY_MODELS`:

```
npx wrangler secret put GROQ_API_KEY --config workers/yanny/wrangler.toml
```

The Worker asks every configured model at once and sends the first answer
that passes the groundedness gate, so a fallback costs latency only when the
first one fails. `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY` and a `custom`
OpenAI-compatible endpoint work the same way.

### Which models

`workers/yanny/wrangler.toml` lists them under `YANNY_MODELS`. The default
is one: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` on the `workers-ai`
provider. Keep the list short — every entry spends one request per question
against that provider's daily allowance. The ids must be ones the provider
currently serves; `/api/health` reports one that has been retired.
Cloudflare's catalogue is at developers.cloudflare.com/workers-ai/models.
Change the list, redeploy.

## What the Worker refuses

This repo is public, and the Worker can spend a real (if free) daily
allocation, so it is not an open proxy: it only accepts `POST /api/chat` from the origins in
`ALLOWED_ORIGINS`, caps the question at 500 characters and the catalogue
extract at 16,000, rate-limits each IP to 20 questions a minute, fixes the
system prompt server-side, caps `max_tokens`, and bounds every provider
call with a timeout. A model answer is checked against the extract it was
given (`groundednessScore` in `demo/yanny/scoring.js`); the first answer
that passes is sent, and if none does the best is sent marked unchecked,
which the widget says out loud.

## Privacy

Catalogue questions never leave the browser. An open question, with the
catalogue extract, goes to Cloudflare, which both hosts the Worker and runs
the model — so by default it reaches one processor rather than two, and no
third party at all. Neither the Worker nor this site stores it. (If a Groq
or Google key is ever added as a fallback, that provider becomes a second
processor and the notice has to say so first.) `demo/legal.ts`'s privacy notice says
exactly this and names the processor; if `YANNY_MODELS` ever gains a
third-party provider, change the notice in the same commit.

## Local development

`npx wrangler dev --config workers/yanny/wrangler.toml` runs the Worker on
localhost, with the AI binding served remotely by your own Cloudflare
account. Add the local site origin to `ALLOWED_ORIGINS` for the session and
take it out again. (Only a third-party fallback key needs a `.dev.vars`
file, which is git-ignored and must never be committed.) The catalogue half needs nothing: build the site and
open it.
