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
`src/index.ts`, `demo/brandSites.ts`, `demo/legal.ts`, `src/config/retailers.ts`.
There is no separate database and no scrape: this app runs from the same
checkout as the rest of the repo and reads the identical modules the static
site itself renders from.

Those modules are imported **once per process**, as one coherent snapshot,
and every part of an answer is computed from that same snapshot. So the
chatbot's data is as fresh as the process is old — in the container, as
fresh as the last deploy, since the image bakes `demo/*.ts` in at build
time and nothing writes to that filesystem afterwards. Re-run the deploy
workflow to move it forward. `server/siteData.js`'s header has the full
reasoning, including the two measured reasons the previous
re-read-per-question design was abandoned: it retained ~129 MB of heap per
question permanently, and it could only ever refresh half the module graph,
leaving the fragrance count the chatbot quotes pinned to boot while the
prices beside it were not. Where the checkout genuinely can change under a
running server (the bare-metal `deploy/` path), `/api/health` reports
`siteData.stale` so that divergence is visible rather than silent; a
restart is the fix.

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

## Most questions skip the council entirely

Step 2 above is the path for `'general'` questions and some `'suggest'`
ones. Eleven of the thirteen intents `server/intent.js` can classify are
answered directly from `server/siteData.js` and `server/lookups.js`, with no
model called at all:

| intent | shape | answered from |
| --- | --- | --- |
| `price` | "how much is X", "cheapest X" | catalogue + `buildComparison` |
| `availability` | "is X in stock", "who has X" | per-offer stock state |
| `notes` | "what does X smell like" | `DemoFragrance.notes`, or a plain "none published" |
| `size` | "what sizes of X", "do you have the 200ml" | the product's variant group |
| `delivery` | "delivery from Boots", "who does free delivery" | `src/config/retailers.ts` |
| `deals` | "what's on sale", "biggest discount" | `demo/deals.generated.ts` |
| `budget` | "what can I get under £50", "something sweet under £30" | delivered-price index, filtered by note |
| `compare` | "is X cheaper than Y" | both sides' cheapest delivered |
| `brand` | "what Creed do you have", "do you list Amouage" | brand index |
| `meta` | "how fresh are these prices", "who are you" | crawl time, registry, counts |
| `greeting` | a message that is only "hello" or "thanks" | live counts, nothing else |

`suggest` additionally answers deterministically — with an honest refusal,
never a product — when a question rests entirely on one of the three
constraints the catalogue provably lacks: who a fragrance is for, how strong
or long-lasting it is, or what season/occasion suits it ("what should I wear
to a wedding", "recommend me a summer fragrance"). A rule-1-bound council
model could only ever refuse those too, so the refusal is written directly,
naming what the data cannot do and offering the filters that are real.

Each of these has one factual answer already sitting in the catalogue.
Running 28 LLMs and ranking their prose to relay that fact adds latency
without adding accuracy, and — measured against the reported "One Million
Elixir" bug — is exactly how a *wrong* answer got produced: nothing stopped a
model from confidently denying a fragrance the data underneath it named
outright, and that denial won the ranking. A template with no model in the
loop cannot do that. It can only repeat a price, size, retailer, note or
stock state that is genuinely there, or say plainly that nothing matched.
See the "One Million Elixir" case in `test/priceLookup.test.js` for the
regression this exists to catch, and the traceability test at the top of
`test/lookups.test.js` for the invariant it is checked against: every pound
figure in a deterministic answer must be a value that was read, and every
shop named must exist in the registry.

Product identity is the one thing these paths can get wrong, so it is shared:
`resolveProductQuery` is the single place a question becomes a product, and
every product-anchored path answers **only** on its `matched` branch. Its
other three outcomes are refusals — nothing found, a tie between distinct
products (which asks which was meant), and a single weak match (which says
it is not certain). Nothing is guessed.

`npm run bench` measures every deterministic intent's own wall-clock time
against the live catalogue, routed through `classifyIntent` so what is timed
is the whole path a real message takes (no network, safe to run anywhere this
repo's tests run). What that number does not include, and cannot from a
sandbox with no outbound network: the council path's real latency, which
needs a live run behind the deployed backend to measure.

Two things send a question back to the council anyway:

- **The resolver declines.** "How do you make money" is `meta`, but the
  answer is prose the site has already written on its own affiliate
  disclosure page, not a number; `resolveMetaQuery` returns `null` and the
  council answers it with that page in its SITE DATA block. Same for a
  budget-shaped question naming no threshold, and a brand-shaped question
  naming no brand.
- **The intent's vocabulary appeared without a product.** A question can be
  labelled `'price'` by the bare word "price" and name no fragrance at all.
  When SITE DATA has a real policy/FAQ match for such a question it falls
  through to the council rather than answering with a direct-lookup denial of
  a fragrance that was never named.

## What deliberately stays with the council

Taste. "What's similar to X", "something sweet", "do you have anything
nice" have no single right answer in the data, and a model's phrasing is
the actual product rather than a relay for a number. (Season and occasion
questions used to be listed here too; a grounded model could only ever
refuse them — rule 1 forbids "summer means citrus" from training — so a
question resting entirely on one is now refused deterministically instead
of spending a 28-model round writing the same refusal.)

What changed for those is the grounding, not the routing.
`suggestContextFor` used to split the question on commas and call each
fragment a note, which quietly dropped most of a real sentence; it now reads
notes against the catalogue's own note vocabulary, and for "what smells like
X" it resolves X and matches on the notes stored for *that* fragrance,
quoting them back so the council can say what the match is based on. Whether
two perfumes actually smell alike is still left to the answer, plainly
labelled as something the note data does not settle.

## The questions people actually type

The intents above describe well-formed questions. A real one arrives
lowercase, unpunctuated, ungrammatical and carrying three constraints at
once — the site owner's own two examples being "what perfume you recommend
for a smelly man" and "find a woman a perfume under £30 that smells sweet".
`server/requestPhrases.js` is the text layer that reads those: budget
phrases, everyday scent words, and the two constraints the catalogue cannot
serve. It is shared by `intent.js` and by the resolvers, so a phrase the
classifier routes somewhere is by construction a phrase that place can read.

Three things it does, and one it refuses to.

- **Money as people write it.** "under £30", "30 quid", "£30ish", "for 30
  pounds", "under fifty quid", "under a tenner", "£40 to spend" all read as
  one ceiling. A bare unframed "£30" deliberately does not: "is Sauvage
  still £30" is a price check, and budget outranks price.
- **Scent words, expanded against the catalogue's own notes.** "Something
  sweet" used to match the literal note `Sweet`, which 8 of 10,379
  fragrances carry. It now also reads as the notes the catalogue really
  holds a sweet request in — Vanilla (1,213), Tonka Bean (379), Caramel
  (206) and the rest. The candidate names live in `requestPhrases.js` but
  every one is checked against the live `NOTE_INDEX` before use, so a family
  can never name a note the catalogue does not carry. Every answer built on
  one says which notes it read the word as: that reading is this site's, and
  a reader is entitled to disagree with it. The products themselves come
  back only because they genuinely list those notes.
- **Constraints combined, not taken one at a time.** A budget question now
  applies its price filter and its note filter together and ranks by how
  much of the scent request each bottle satisfies. Before, "find a woman a
  perfume under £30 that smells sweet" returned the five most widely stocked
  bottles under £30 — real prices, chosen for popularity rather than
  sweetness, the second of them a men's fragrance, with nothing in the
  answer admitting two of the three constraints had been dropped. A wrong
  answer that looks like a right one is worse than a refusal.

**Gender is the one it refuses.** There is no honest way to filter by it.
`DemoFragrance` has no gender or audience field, and the two things that
look like substitutes are far too thin: 705 of 10,379 titles say something
masculine and 465 something feminine, leaving 9,209 saying nothing at all,
so filtering on titles would hide most of the catalogue and reclassify every
unisex bottle as unavailable; and exactly 1 of the 3,430 fragrances that
have notes carries an audience word in them. Inferring one from a note
list — "florals are for women" — would be this codebase inventing a fact
about a product, which is the single thing it must never do. So an answer
says the catalogue does not record it and gets on with the constraints it
can meet. Longevity and projection are refused on the same grounds: nothing
measures either, and concentration is not a stand-in for them. Both
measurements are asserted against the live catalogue in
`test/messyQuestions.test.js`, so if a gender field is ever added the test
fails and the refusal gets revisited rather than quietly rotting.

Where a question rests entirely on one of those two — "what perfume you
recommend for a smelly man" names no note, no fragrance and no budget —
`resolveSuggestQuery` answers it deterministically rather than sending 28
models a SITE DATA block with no fragrance data in it and trusting rule 1c
to hold. The refusal names what it cannot do and offers the three things it
can, and it is written flatly: "smelly man" is a request for something
long-lasting, not something to be corrected. Season and occasion requests
("recommend me a summer fragrance", "what should I wear to a wedding") are
refused the same way. Open taste questions ("do you have anything nice")
still go to the council, because nothing in the data contradicts them.

`test/messyQuestions.test.js` and `test/corpus.test.js` (42 question types,
each in 2-3 phrasings, every one asserting its path, its grounding and its
latency class) are the regression suites for all of this, and their headers
are explicit that every question in them is **invented**. There is
no history of real user questions to draw on: this backend persists nothing,
`/api/chat` keeps no conversation, and the site carries no analytics (see
`demo/legal.ts`). Two questions are the owner's, verbatim; the rest are
variations along the axes those demand. Treat it as a hypothesis about how
people type, pinned so a later edit cannot silently revert it — not as
evidence of how they do.

## How long the council waits

The fan-out used to be `await Promise.allSettled(...)` over every model in
`agents.json`. That is not "as slow as the average model", it is **as slow
as the slowest one, every time** — nothing could be sent until the last of
28 promises settled, so a single model having a bad minute pinned the whole
question to `AGENT_TIMEOUT_SECONDS` (25s) and the 27 that came back promptly
bought nothing.

The wait now ends at whichever comes first:

| | env var | default | what it means |
|---|---|---|---|
| enough answers | `COUNCIL_QUORUM` | `8` | successful answers that are enough to rank between |
| enough waiting | `COUNCIL_DEADLINE_MS` | `8000` | how much longer to wait **after the first successful answer** |
| everyone in | — | — | the old behaviour, and still the path a healthy router takes |

The deadline runs from the first answer rather than from fan-out on purpose:
it means "how long we wait for the rest once we know we have something to
ship", so a router that is slow to its first answer gets the time it needs
instead of being cut off holding none. Whatever is still in flight is then
**aborted**, so abandoned calls stop consuming the pooled free-tier quota
that the next question needs.

Measured on a local stand-in router with 28 synthetic delays — 24 between
400ms and 9s, two at 12s, two that never answer — the same question went
from **25,618ms** (waiting for all 28; the two dead ones hit the 25s agent
timeout) to **793ms** at the defaults. Those delays are inputs, not
observations: nothing in this repo can reach FreeLLMAPI to time a real
model. What the run demonstrates is the shape of the fan-out, not the
router's speed. `test/councilWait.test.js` pins the behaviour itself against
a real local HTTP router.

**What it costs.** The winner is the best of however many answered in time,
not the best of 28. That is a genuine reduction in the pool `scoreAndRank`
chooses from. Two things make it the right trade here: the questions where a
wrong answer costs a reader something — prices, stock, sizes, notes,
delivery — never reach the council at all, and every answer is held to the
same SITE DATA grounding by the prompt and by `groundednessScore`, so a
smaller pool can only make an answer less well *put*, never less grounded.

**Setting them from evidence.** Every council question now logs a line like

```
[council] intent=suggest models=28 ok=8 waited=quorum firstAnswerMs=612 totalMs=1840 outstanding=20 quorum=8 deadlineMs=8000 latencies=gemini-3.5-flash:604,compound-mini!:25001,...
```

to stdout, which is what `flyctl logs` shows. It carries no question text,
no key and no URL — an intent label, the model ids already public in
`agents.json`, and milliseconds. That is the real per-model distribution,
and it is what the two defaults above should be set from once there is a
week of traffic to read. The defaults are judgements, not measurements.

**Stopping.** The site's widget has a stop button. Aborting its `fetch`
closes the connection, `server/index.js` sees the response socket close and
aborts the council with it, and that abort reaches every in-flight model
call — so the work genuinely stops rather than running on into a socket
nobody is reading.

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

   For pricesniffs.space specifically, skip this step: Yana's own instance
   is already live at `https://yanny-freellmapi.fly.dev`, shared across her
   apps (Google, Groq, Mistral, Cohere free tiers pooled — heavy use on one
   app can rate-limit the others, see `docs/VIRTUAL-YANNY-DEPLOY.md`). Ask
   for the real unified key rather than generating a new instance; it goes
   in `.env`, never in this repo.

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
