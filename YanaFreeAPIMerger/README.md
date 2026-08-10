# Virtual Yanny

The fragrance chatbot backend for **pricesniffs.space**, embedded in the
site itself as a floating launcher in the bottom right corner (see the
parent repo's `demo/app.ts` and `demo/virtualYanny.ts`) — not a standalone
app. This folder is the API behind that widget: price checks, notes based
suggestions, and general questions about the site, answered by a live
"council" of LLM agents whose responses are ranked anonymously by a scoring
matrix before the best one is shown.

This is a subfolder app inside `YanaFragrancePriceChecker`. It does not
change the existing price checker code, and it does not duplicate its data —
see the next section.

## Grounded only in this site's own data

Every agent's system prompt (`server/council.js`) instructs it to answer
using **only** the SITE DATA block built for that specific question, never
its own general knowledge. That block comes from `server/siteData.js`, which
imports pricesniffs.space's real data **directly from the parent repo** —
`demo/data.ts`, `demo/catalogue.generated.ts`, `src/services/priceService.ts`,
`src/index.ts`, `demo/brandSites.ts`, `demo/legal.ts` — re-read fresh on
every question rather than cached at boot, so an answer can never be more
than one harvest behind the live site. There is no separate database and no
scrape: this app runs from the same checkout as the rest of the repo and
reads the identical modules the static site itself renders from.

The scoring matrix (`server/scoring.js`) enforces this mechanically, not
just by prompt: its highest-weighted criterion, `groundedness`, fails any
answer that states a price not present in that question's SITE DATA block,
includes an invented URL, or confidently answers a question SITE DATA found
nothing for instead of saying so. An agent that ignores the "site data only"
instruction loses the ranking here even if nothing else about its answer
looks wrong.

## How the council works

1. **You self-host [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi)** —
   an open-source router that aggregates ~29 providers' free LLM tiers behind
   one OpenAI-compatible endpoint. This app does **not** re-implement 28
   separate provider integrations; it points at your running FreeLLMAPI
   instance and pins each "agent" to a distinct model id it already knows how
   to call.
2. On each user question, the server builds that question's SITE DATA block,
   then fires the resulting prompt at up to **28 pinned models** in parallel
   (`server/config/agents.json`), labelled `Agent 1`..`Agent 28`, never their
   real provider/model name, for the anonymous council effect.
3. Each surviving answer is run through the scoring matrix. No response
   knows another's score; ranking happens after all answers are in.
4. The top-ranked answer is returned. The chat panel shows a splash sequence
   ("Thinking…", "Consulting our N agents…", "Agent 6 has responded…",
   "Ranking responses anonymously…", "Here we go") while this happens, via
   Server-Sent Events.

## Why not literally 28 *raw* API integrations written from scratch?

FreeLLMAPI already solves that problem well (key rotation, rate-limit
cooldowns, provider quirks, a signed model catalog) and is MIT-licensed.
Reimplementing it here would be a worse, unmaintained copy. This app is the
*product layer* on top: the domain logic, the site-grounding, the anonymous
scoring/ranking.

## Setup

1. Stand up FreeLLMAPI (Docker one-liner from its README):
   ```bash
   curl -fsSL https://freellmapi.co/install.sh | bash
   ```
   Add your free provider keys on its Keys page (Google, Groq, Cerebras,
   Mistral, OpenRouter, Cloudflare, Cohere, etc. — all free tiers). Grab the
   unified `freellmapi-…` API key.

2. Configure this app:
   ```bash
   cd YanaFreeAPIMerger
   cp .env.example .env
   # edit .env: FREELLMAPI_BASE_URL, FREELLMAPI_API_KEY
   npm install
   ```

3. Edit `server/config/agents.json` and list the model ids your FreeLLMAPI
   instance actually has enabled (check `/v1/models` on your router). You
   don't need exactly 28 — fewer is fine, the UI adapts; the council just
   runs whatever's configured, up to 28.

4. Run it (via `tsx`, not plain `node` — this app imports TypeScript modules
   straight from the parent repo, see "Grounded only in this site's own
   data" above):
   ```bash
   npm start
   ```
   `GET /api/health` reports whether the service and FreeLLMAPI are both
   actually reachable — this is what the site's chat popup checks before
   showing anything, every time it opens.

5. Point the site at it: set the base URL this deploys to in the parent
   repo's `demo/virtualYanny.ts`, then rebuild the site (`npm run demo` at
   the repo root). See `docs/VIRTUAL-YANNY-DEPLOY.md` for the full path from
   a fresh VM to a live widget.

## Status / limitations

- Free-tier LLMs have no SLA — a question can come back slower or weaker
  late in the day when top free models hit their daily caps (a documented
  FreeLLMAPI limitation). The scoring matrix is there specifically to make
  that visible: bad answers rank low and lose, they don't get shown.
- Pooling several providers' free tiers behind one router is a known terms
  of service tension with at least some of those providers — an accepted,
  explicitly discussed tradeoff for this project, not an oversight.
