# Virtual Yanny deployment

The chat widget (`demo/app.ts`, floating launcher + popup) and the backend
it talks to (`YanaFreeAPIMerger/`) are both built and live in this repo
already. **As of this doc's last edit (12 August 2026), the backend is
still not deployed anywhere** — this site is static (GitHub Pages), so the
Express service behind the widget needs somewhere else to run, and nothing
in this session changed that: outbound network access is blocked in the
environment that wrote these docs, so nobody has provisioned a host from
here. `demo/virtualYanny.ts`'s `VIRTUAL_YANNY_API_BASE_URL` stays `''`
until that changes — see that file's own comment for why a guessed URL
there would be worse than an honest blank one.

**Primary plan: a dedicated Oracle Cloud Always Free VM** (Oracle Linux 9,
ARM, `VM.Standard.A1.Flex`). Provisioning was blocked on Oracle's side as of
the last time this was attempted: creating the VCN's Internet Gateway route
rule failed with `Rules in the route table must use private IP as a
target`, which is almost always a temporary fraud/identity-review hold on a
brand new free-trial account rather than anything wrong with the request —
it usually clears on its own within hours to a couple of days. Nobody in
this session could re-check Oracle's side (no outbound network here), so
treat that status as unverified rather than current. If it is still stuck,
Render or Fly.io are the fallback; nothing here is built around that unless
the plan changes.

## The two different servers involved — do not conflate them

There are two separate things to host, and only one of them is missing:

1. **FreeLLMAPI, the model router.** Already deployed and live at
   `https://yanny-freellmapi.fly.dev` — OpenAI-compatible at
   `/v1/chat/completions`, Bearer auth, `model` accepts `"auto"`, a specific
   id from `GET /v1/models`, or `"fusion"`. Nothing to do here; this is an
   existing fact, not a step. The base URL above is fine to put in a public
   doc or repo — it is just a hostname. **The API key is not** — see the
   next section.
2. **This app (`YanaFreeAPIMerger/server`), the council + scoring layer.**
   This is the thing with nowhere to run. It is a small Express process; any
   host that can run Node 20+, hold two environment variables, and reach
   the internet works. The Oracle VM plan above is one option, not the only
   one — Render and Fly.io both work equally well and need none of the
   VM-specific steps below.

## Why nothing is hardcoded, and where the key actually lives

- **Backend**: `YanaFreeAPIMerger/.env` (`FREELLMAPI_BASE_URL`,
  `FREELLMAPI_API_KEY`, `PORT`, `AGENT_TIMEOUT_SECONDS`) — see
  `YanaFreeAPIMerger/.env.example`, which carries only the placeholder
  `freellmapi-your-unified-key`. The real key belongs **only** in this
  file's runtime environment on whatever host ends up running it, read via
  `process.env.FREELLMAPI_API_KEY` (see `server/index.js`,
  `server/freellmapiClient.js`). It must never be committed, and never
  placed anywhere under `demo/` — that folder is a static client bundle
  shipped to every visitor's browser, and a key there is a leaked key.
- **Frontend**: `demo/virtualYanny.ts`'s `VIRTUAL_YANNY_API_BASE_URL` —
  blank right now, the same "absent rather than invented" pattern
  `demo/supabase.ts` already uses for the same reason (see that file's own
  doc comment). While it is blank, the launcher still renders (so the
  feature is discoverable) but the popup's own health check treats a blank
  base URL as an immediate "not available" — there is nowhere to even try
  reaching, so it does not attempt one. **This is the one line that changes
  once a backend exists** — see the last step below. Nothing else in the
  frontend needs editing.

## Operational caveat: shared free-tier quota

`https://yanny-freellmapi.fly.dev` pools free-tier quota across Google AI
Studio, Groq, Mistral, and Cohere, and that quota is **shared across every
app pointed at it**, not private to Virtual Yanny. Heavy use from this
chatbot (or any other app on the same router) can rate-limit the others.
There is no code fix for this within `YanaFreeAPIMerger` — it is a fact
about the shared instance, worth knowing before assuming a slow or failed
answer here is a bug in this app specifically. `server/config/agents.json`
fanning out to more models per question makes this more likely, not less.

## Once a backend host exists (VM, Render, Fly.io — any of them)

1. If using the Oracle VM plan: run
   `deploy/provision-oracle-linux9.sh <git-clone-url> <branch>` as root on
   the fresh instance. Installs Node 22, nginx, certbot, firewalld; creates
   a dedicated `virtualyanny` service user with no shell and no write
   access to the checkout; clones this repo; installs the backend's
   dependencies; installs (but does not start) `yanafreeapimerger.service`.
   On Render/Fly.io, follow their own Node deploy flow instead — the app
   itself does not care which host runs it.
2. Point DNS at the instance (an `api.` subdomain of pricesniffs.space is
   the assumption baked into `deploy/nginx-pricesniffs-api.conf.example` —
   change it there if a different hostname is used, or skip this step
   entirely on a host that issues its own domain, e.g. Render/Fly.io).
3. Fill in `YanaFreeAPIMerger/.env`:
   ```
   FREELLMAPI_BASE_URL=https://yanny-freellmapi.fly.dev
   FREELLMAPI_API_KEY=<the real unified key — get it from Yana, never from this repo>
   PORT=4000
   AGENT_TIMEOUT_SECONDS=25
   ```
4. HTTPS is not optional: the widget calls this API straight from the
   browser on an HTTPS page (pricesniffs.space), so the API origin has to be
   HTTPS too or every browser silently blocks it as mixed content. On the
   Oracle VM path that's `certbot --nginx -d <hostname>`; Render and Fly.io
   both provision this automatically on their own domains.
5. Start the service (`systemctl start yanafreeapimerger` on the VM path,
   or the host's own deploy step elsewhere), then confirm with
   `curl https://<hostname>/api/health` — should report
   `{"ok":true,"configured":true,"freellmapiReachable":true,"agentCount":<N>}`.
   `freellmapiReachable:false` with everything else true means the backend
   itself is fine but it could not reach
   `https://yanny-freellmapi.fly.dev/v1/models` with the configured key —
   check the key first, then whether the shared router is having a bad day
   (see the quota caveat above).
6. **The one frontend change**: in `demo/virtualYanny.ts`, set
   ```ts
   const VIRTUAL_YANNY_API_BASE_URL = 'https://<hostname>';
   ```
   then `npm run demo` and push — the next deploy carries the live widget.
   Nothing else in `demo/` needs to change; the widget already degrades to
   an honest "not available" panel when this is blank, and already handles
   the configured-but-unreachable case via the health check.

## Keeping the backend's data fresh

`YanaFreeAPIMerger/server/siteData.js` re-reads the site's data modules
fresh from disk on every single question (see that file's own doc comment
for why) — nothing needs restarting for a new answer to reflect a recent
price. What does need to happen is the checkout on the VM itself staying
up to date with the hourly harvest's commits; this repo does not yet
include a mechanism for that (a cron `git pull`, a webhook, whatever fits
the eventual host) — worth building once the VM is actually live and this
becomes a real rather than a hypothetical gap.
