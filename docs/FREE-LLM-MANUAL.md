# Free LLM manual: running and adding models

Written 2026-10-01. A reference for the free AI models behind your projects:
what each piece is, how to add or remove a model, and how to check it worked.

---

## 0. Which thing is which

You have **three** separate pieces. Most confusion comes from mixing them up.

| Piece | Where it lives | What it does | Used by the live site? |
|---|---|---|---|
| **Virtual Yanny worker** | this repo, `workers/yanny/` | The AI half of the chat bubble on pricesniffs.space. A Cloudflare Worker that asks 1–3 free models and returns the first answer that sticks to the site's own data. | **Yes, once connected**: see §1. It is *not connected yet*. |
| **YanaFreeLLM** ("the council") | repo `yanakan19/YanaFreeLLM` | A reusable engine: asks up to 28 free models the same question in parallel, scores every answer anonymously, returns the best. Has its own web page. | No. The site stopped using it on 2026-09-06. |
| **FreeLLMAPI** (the router) | open source, [tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi), self-hosted by you | Holds all your free provider keys behind **one** key and **one** OpenAI-style address. YanaFreeLLM talks to it. | No. |

**Where things stand today:**

- The chat bubble on the site answers every catalogue question (prices,
  stock, sizes, notes, deals) inside the visitor's browser, with no AI and
  no cost. Open questions like "something sweet, no florals" need the AI
  half, and the bubble currently tells visitors **the AI side is not
  connected yet**, because `VIRTUAL_YANNY_API_BASE_URL` in
  `demo/virtualYanny.ts` is empty. §1 fixes this in about 10 minutes.
- **Check your Fly.io dashboard.** The old setup ran two Fly apps
  (`pricesniffs-yanny` and `yanny-freellmapi`). Nothing uses them any more.
  Delete them and remove the card so you cannot be billed. YanaFreeLLM's own
  Fly configs (`deploy/fly/*.toml`) keep one machine running 24/7
  (`min_machines_running = 1`), which Fly charges for. Only deploy it there
  deliberately (§5.6).

---

## 1. Connect Virtual Yanny to the site (one time, ~10 minutes, free)

No AI provider key is needed: the worker uses Cloudflare's own models,
free up to 10,000 "Neurons" a day (thousands of answers).

1. **Cloudflare account.** Sign up at dash.cloudflare.com on the free plan,
   no card. On **Workers & Pages**, copy your **Account ID**.
2. **API token.** Go to My Profile → API Tokens → Create Token → template
   **"Edit Cloudflare Workers"**. Copy the token.
3. **GitHub secrets.** Repo → Settings → Secrets and variables → Actions →
   New repository secret. Create two, named exactly:
   - `CLOUDFLARE_API_TOKEN`, set to the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID`, set to the ID from step 1
4. **Deploy.** Repo → Actions → **Deploy Virtual Yanny worker** → Run
   workflow. When it finishes, the log shows a URL like
   `https://pricesniffs-yanny.<something>.workers.dev`.
5. **Check it.** Open `<that URL>/api/health` in a browser. You want
   `"ok": true`, `"configured": true` and at least one provider with
   `"ok": true`.
6. **Point the site at it.** Ask Claude: *"Set VIRTUAL_YANNY_API_BASE_URL to
   `<the URL>`, rebuild and push."* Or do it yourself: edit
   `demo/virtualYanny.ts`, run `npm run demo`, then commit
   `demo/virtualYanny.ts`, `demo/index.html` and `demo/404.html`.

---

## 2. Add a model to Virtual Yanny

All models live in **one setting**: `YANNY_MODELS` in
`workers/yanny/wrangler.toml`. It is a list. **Every model in the list is
asked every question, all at once**, and the first good answer wins. So:

- **Keep it to 1–3 models.** Each one spends one request per question from
  that provider's free allowance.
- **Order matters only for ties.** Put the one you trust most first.

### 2a. A Cloudflare model (no key, free)

1. Pick a text-generation model id from developers.cloudflare.com/workers-ai/models
   (ids look like `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
2. Add it to the list in `workers/yanny/wrangler.toml`:
   ```toml
   YANNY_MODELS = '[{"provider":"workers-ai","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},{"provider":"workers-ai","model":"<the new id>"}]'
   ```
3. Commit, then Actions → **Deploy Virtual Yanny worker** → Run workflow.
4. Check `/api/health` (§3).

### 2b. A model from Groq, Google Gemini, Cerebras or OpenRouter (free key)

| Provider | Get a free key at | Secret name (exact) | `provider` value | Example model id (check the provider's current list) |
|---|---|---|---|---|
| Groq | console.groq.com | `GROQ_API_KEY` | `groq` | `llama-3.3-70b-versatile` |
| Google Gemini | aistudio.google.com | `GEMINI_API_KEY` | `gemini` | `gemini-2.5-flash` |
| Cerebras | cloud.cerebras.ai | `CEREBRAS_API_KEY` | `cerebras` | from the Cerebras model list |
| OpenRouter | openrouter.ai | `OPENROUTER_API_KEY` | `openrouter` | any id ending in `:free` |

1. Get the free key (no card needed for any of these).
2. Add it as a **GitHub repository secret** with the exact name above
   (Settings → Secrets and variables → Actions). The deploy workflow copies
   it into Cloudflare's encrypted store for you. **Never paste a key into a
   file in the repo**: this repo is public.
3. Append the model to `YANNY_MODELS`, e.g.
   ```toml
   YANNY_MODELS = '[{"provider":"workers-ai","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"},{"provider":"groq","model":"llama-3.3-70b-versatile"}]'
   ```
4. **Update the privacy notice in the same commit.** Visitors' open
   questions would now also go to that provider, and `demo/legal.ts` must
   name it. Ask Claude: *"I've added Groq to YANNY_MODELS, update the privacy
   notice to name it as a processor."*
5. Commit, run the deploy workflow, check `/api/health`.

**Note on Google:** Gemini's free tier may use prompts for training, and its
March 2026 terms narrow it to business use. It's fine for a public catalogue
chatbot, but don't send it anything private.

### 2c. Any other OpenAI-compatible service

Use `"provider":"custom"`. Put the service's base URL in `CUSTOM_BASE_URL`
under `[vars]` in `wrangler.toml` (e.g. `https://api.example.com/v1`), and set
its key from a terminal (the deploy workflow does not carry this one):

```
npx wrangler login
npx wrangler secret put CUSTOM_API_KEY --config workers/yanny/wrangler.toml
```

Only one custom service at a time.

### 2d. Remove a model

Delete its entry from `YANNY_MODELS` and redeploy. If it was a third-party
provider, also remove it from the privacy notice, and delete its GitHub
secret if nothing else uses it.

---

## 3. Check Virtual Yanny is healthy

Open `https://pricesniffs-yanny.<something>.workers.dev/api/health`.

| You see | Means | Do |
|---|---|---|
| `ok: true`, providers all `ok: true` | Working | Nothing |
| `configured: false` | No usable model: the `[ai]` binding is missing, or every listed provider lacks its key | Check `wrangler.toml` and the secret names |
| one provider `ok: false` | That model id was retired, or its key is wrong or expired | Swap the id (§2) or replace the secret |
| site says "AI side not connected" | `VIRTUAL_YANNY_API_BASE_URL` is still empty | §1 step 6 |
| visitors get "too many questions" | They hit the 20-a-minute per-person limit | Working as intended |

---

## 4. Rules that apply to every free provider

- **One account per provider, never resell, never share your key or
  endpoint with another person.** Every free tier's terms allow personal and
  own-site use within those rules.
- **Avoid Cohere** for this. Its terms forbid personal/household use.
- **Free tiers change without notice.** If something stops answering,
  `/api/health` (or YanaFreeLLM's) tells you which model, so swap it.
- **Only three things can ever charge you** (from YanaFreeLLM's provider
  research, `docs/PROVIDER_COVERAGE.md` §3a):
  - buying OpenRouter credit (optional, $10),
  - moving Cloudflare to the *paid* Workers plan (then AI usage above the
    free allowance is billed, so stay on Free),
  - OVH's logged-in mode, which needs a card (use its anonymous mode
    instead).
  
  None of the other free sign-ups asks for a card.

---

## 5. YanaFreeLLM (the council) and FreeLLMAPI (the router)

### 5.1 How the two fit together

```
your question → YanaFreeLLM → FreeLLMAPI (one key) → Groq, Gemini, Mistral, …
                     ↑ asks every model in server/config/agents.json at once,
                       scores all the answers, returns the best
```

You add **provider keys** in FreeLLMAPI, and choose **which models sit on
the council** in YanaFreeLLM's `server/config/agents.json`.

### 5.2 Run it on your own computer (free)

1. **Start the router.** `curl -fsSL https://freellmapi.co/install.sh | bash`
   (Docker). Open its web page, go to **Keys**, add each free provider key,
   and copy the unified `freellmapi-…` key it gives you.
2. **Set up YanaFreeLLM.**
   ```bash
   git clone https://github.com/yanakan19/YanaFreeLLM && cd YanaFreeLLM
   cp .env.example .env    # set FREELLMAPI_BASE_URL (default http://localhost:3001) and FREELLMAPI_API_KEY
   npm install
   ```
3. **Pick the council automatically:** `npm run generate-agents` (§5.3).
4. **Run:** `npm start`, then open http://localhost:4000.

### 5.3 Add more models to the council

**The easy way: let the generator choose.** After adding new provider keys
to the router:

```bash
npm run generate-agents -- --dry-run   # show the plan, change nothing
npm run generate-agents                # write server/config/agents.json
npm run generate-agents -- --max=12    # smaller council (default 28)
```

It asks the router which models are available, drops the virtual
`auto`/`fusion` entries, and spreads the seats across providers so the
council isn't 28 copies of the same model. If the router is unreachable it
changes nothing. Then restart (`npm start`).

**By hand (to pin a specific model):**

1. See exactly what your router serves:
   ```bash
   curl -H "Authorization: Bearer $FREELLMAPI_API_KEY" $FREELLMAPI_BASE_URL/v1/models
   ```
2. Add the id to the `"models"` list in `server/config/agents.json`, up to
   28 entries:
   ```json
   { "models": ["gemini-2.5-flash", "llama-3.3-70b", "<new id>"] }
   ```
3. Restart. A wrong id shows up as `bad_request` on that agent's chip, not
   as a crash.

**Important:** every council model is asked **every** question. A provider
allowing only 50 requests a day is used up after about 50 questions. Keep
low-allowance providers in the router (where it can fall back to them) but
**out of `agents.json`**. The generator doesn't know about allowances, so
review its plan with `--dry-run`.

### 5.4 Which providers to add next (best value first)

From `docs/PROVIDER_COVERAGE.md` in YanaFreeLLM, where each claim is sourced
and dated:

1. **AI Horde, OVH (anonymous), Kilo**: no account at all. Kilo logs prompts
   for training.
2. **Z.ai / Zhipu (GLM Flash)**: about 1,000 requests a day, a capable
   model. Prefer the Chinese endpoint (open.bigmodel.cn), whose terms suit
   personal use better.
3. **GitHub Models**: the best quality in the free pool, but a small daily
   cap, so router only, not the council.
4. **Ollama Cloud**: frontier open models, slow (30–90s).
5. **NavyAI, LLM7, SEA-LION**: real, documented free quotas.
6. Everything else is a long tail of small aggregators that break silently.
   The doc's §4 explains why providers 13+ add more maintenance than
   capacity.

Already set up (per that doc): Google AI Studio, Groq, Mistral, Cohere
(**drop this one**, see §4 above). Planned: OpenRouter, Cerebras, NVIDIA
NIM, Cloudflare, Hugging Face, Reka.

### 5.5 Check it's working

- `GET /api/health`: `ok` needs the env vars set, at least one model in
  `agents.json`, and the router answering.
- In the web page, each agent chip shows ✓ or ✗. The ✗ codes:
  - `rate_limited`: that provider's free quota is used up for today.
  - `auth_failure`: the unified key is wrong.
  - `bad_request`: the model id doesn't exist on your router.
  - `timeout`: the model was slower than `AGENT_TIMEOUT_SECONDS`.
- `npm test` runs every unit test without touching the network.

### 5.6 Hosting it online (optional, and not free on Fly)

`deploy/fly/` has configs for both apps, with the `flyctl` commands in each
file's comments. As written they keep **one machine running all the time**
(`auto_stop_machines = false`, `min_machines_running = 1`), and Fly bills
for that. To pay close to nothing, set `auto_stop_machines = "stop"` and
`min_machines_running = 0`, which means a cold start of a few seconds on
the first question. Or simply run it on your own computer when you want it.

---

## 6. Quick reference

| I want to… | Do this |
|---|---|
| Turn on the AI half of the site's chat | §1 |
| Add a free Cloudflare model to the site's chat | §2a |
| Add Groq/Gemini/Cerebras/OpenRouter to the site's chat | §2b (and update the privacy notice) |
| See why the site's chat isn't answering | `/api/health` on the worker (§3) |
| Add a provider to the council | Router's Keys page, then `npm run generate-agents` (§5.3) |
| Pin one specific model on the council | Edit `server/config/agents.json` (§5.3) |
| Make sure nothing can bill me | §4 last bullet; delete old Fly apps (§0) |
