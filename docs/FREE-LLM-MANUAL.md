# Free LLM manual: running and adding models

Written 2026-10-01. A reference for the free AI models behind your other projects. The chat
assistant that used these on pricesniffs.space was removed on 2 October 2026;
what is left here is YanaFreeLLM and the FreeLLMAPI router, which are
separate projects.

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
| Add a provider to the council | Router's Keys page, then `npm run generate-agents` (§5.3) |
| Pin one specific model on the council | Edit `server/config/agents.json` (§5.3) |
| Make sure nothing can bill me | Use free tiers only; delete old Fly apps (docs/OWNER-STEPS.md §1) |
