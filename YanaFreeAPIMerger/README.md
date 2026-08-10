# YanaFreeAPIMerger

A tailored perfume chatbot for **pricesniffs.space** — price checks, notes-based
fragrance suggestions, and general scent questions — answered by a live "council"
of LLM agents whose responses are ranked anonymously by a scoring matrix before
the best one is shown to the user.

This is a subfolder app inside `YanaFragrancePriceChecker`. It does not touch the
existing price-checker code.

## How it works

1. **You self-host [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi)** —
   an open-source router that aggregates ~29 providers' free LLM tiers behind one
   OpenAI-compatible endpoint. This app does **not** re-implement 28 separate
   provider integrations; it points at your running FreeLLMAPI instance and pins
   each "agent" to a distinct model id it already knows how to call.
2. On each user question, the server fires the prompt at up to **28 pinned
   models** in parallel (`AGENT_MODELS` in `server/config/agents.json`),
   labeling them `Agent 1`..`Agent 28` — never their real provider/model name —
   for the "anonymous council" effect.
3. Each surviving answer is run through a **local, deterministic scoring
   matrix** (`server/scoring.js`) — relevance to the question, notes/price-format
   correctness, actionability, hedging/confidence, structure, length fit — each
   weighted and summed. No response knows another's score; ranking happens after
   all answers are in.
4. The top-ranked answer is returned to the user. The chat UI shows a splash
   sequence ("Thinking…", "Consulting our 28 agents…", "Agent 6 has responded…",
   "Ranking responses anonymously…", "Here we go") while this happens, via
   Server-Sent Events.
5. Domain features:
   - **Price check** (`server/priceLookup.js`) — looks up a fragrance in a local
     dataset shaped like a pricesniffs.space listing. **Currently seeded with
     mock data** — swap `server/data/prices.json` for a real scrape/export/API
     of pricesniffs.space when you have one; the interface doesn't change.
   - **Suggest by notes** (`server/suggest.js`) — matches requested notes (e.g.
     "vanilla, oud, no florals") against a small curated fragrance/notes dataset
     and asks the agent council to justify + rank picks.

## Why not literally 28 *raw* API integrations written from scratch?

FreeLLMAPI already solves that problem well (key rotation, rate-limit cooldowns,
provider quirks, a signed model catalog) and is MIT-licensed. Reimplementing it
here would be a worse, unmaintained copy. This app is the *product layer* on
top: the domain logic, the anonymous scoring/ranking, and the guided chat UI.

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
   instance actually has enabled (check `/v1/models` on your router). You don't
   need exactly 28 — fewer is fine, the UI adapts; the council just runs
   whatever's configured, up to 28.

4. Run it:
   ```bash
   npm start
   ```
   Open http://localhost:4000

## Status / limitations

- Price data is **mocked** until a real pricesniffs.space data source is wired
  into `server/priceLookup.js`.
- Free-tier LLMs have no SLA — a question can come back slower or weaker late in
  the day when top free models hit their daily caps (a documented FreeLLMAPI
  limitation). The scoring matrix is there specifically to make that visible:
  bad answers rank low and lose, they don't get shown.
- This is a prototype layer, not a production deployment of pricesniffs.space.
